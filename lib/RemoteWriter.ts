'use strict';
import {LambdaInstanceMetrics} from './LambdaInstanceMetrics';
import {request as https} from 'https';
import {request as http} from 'http';
import {TaskTimer} from "tasktimer";
import {AwsLambdaInstrumentation} from "@opentelemetry/instrumentation-aws-lambda";
import {context, ROOT_CONTEXT, SpanKind, trace} from '@opentelemetry/api';
import {urlToHttpOptions} from "url";

export class RemoteWriter {
  remoteWriteConfig: {
    metricsEndpoint?: string | undefined;
    tenantName?: string | undefined;
    password?: string | undefined;
    isComplete: boolean;
  }
  lambdaInstance: LambdaInstanceMetrics;
  taskTimer?: TaskTimer;
  cancelled: boolean = false;
  coldStart: boolean = true;
  debugEnabled: boolean = false;
  lambdaInstrumentation?: AwsLambdaInstrumentation;
  private static singleton: RemoteWriter = new RemoteWriter();

  static getSingleton() {
    return this.singleton;
  }

  constructor() {
    if (this.isEqual(process.env.DEBUG, 'true')) {
      this.debugEnabled = true;
    }

    this.lambdaInstance = LambdaInstanceMetrics.getSingleton();
    this.remoteWriteConfig = {
      metricsEndpoint: process.env["ASSERTS_METRIC_ENDPOINT"],
      tenantName: process.env["ASSERTS_TENANT_NAME"],
      password: process.env["ASSERTS_PASSWORD"],
      isComplete: false
    };

    if (this.isDefined(this.remoteWriteConfig.tenantName)) {
      this.lambdaInstance.setTenant((this.remoteWriteConfig.tenantName as (string)));
    }


    this.remoteWriteConfig.isComplete = this.isDefined(this.remoteWriteConfig.metricsEndpoint);

    RemoteWriter.singleton = this;
    if (this.remoteWriteConfig.isComplete && !this.isEqual(process.env.ASSERTS_LAYER_DISABLED, 'true')) {
      // Flush once immediately and then write on schedule
      this.flushMetrics();
      this.startRemoteWriter();
    }
  }

  startRemoteWriter() {
    this.taskTimer = new TaskTimer(15_000);

    // 'tick' will happen every 15 seconds
    this.taskTimer.on('tick', this.flushMetrics);
    this.taskTimer.start();
    console.log("Registered metric flush task with timer at 15 seconds interval");
  }

  isRemoteWritingOn(): boolean {
    const _this = RemoteWriter.singleton;
    return _this.remoteWriteConfig.isComplete && !_this.cancelled;
  }

  async flushMetrics() {
    RemoteWriter.getSingleton().logDebug("Timer task flushing metrics...");
    const _this = RemoteWriter.singleton;
    if (!_this.cancelled) {
      await _this.writeMetrics();
    }
  }

  cancel(): void {
    const _this = RemoteWriter.singleton;
    _this.cancelled = true;
    _this.taskTimer?.removeListener('tick', _this.flushMetrics);
  }

  // This will have to be invoked once every 15 seconds. We should probably use the NodeJS Timer for this
  async writeMetrics(): Promise<void> {
    if (this.isRemoteWritingOn()) {
      this.lambdaInstance.coldStart.set(this.coldStart ? 1 : 0);
      this.coldStart = false;
      let text = await this.lambdaInstance.getAllMetricsAsText();
      if (text != null) {
        const url = new URL(this.remoteWriteConfig.metricsEndpoint as string);
        let options = urlToHttpOptions(url);
        const additionalOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'Content-Length': text.length
          }
        }
        options = Object.assign(options, additionalOptions)
        this.setAuthHeaders(options);
        const req = options.protocol === 'https:' ? https(options, this.responseCallback) :
          http(options, this.responseCallback);
        req.on('error', this.requestErrorHandler);

        const parentSpan = trace.getTracer(
          "@opentelemetry/instrumentation-aws-lambda",
          this.lambdaInstrumentation?.instrumentationVersion
        ).startSpan('RemoteWriteMetrics', {
          kind: SpanKind.INTERNAL,
          startTime: new Date(),
          root: true
        }, ROOT_CONTEXT);
        trace.setSpan(context.active(), parentSpan);
        try {
          req.write(text, () => {
            RemoteWriter.getSingleton().logDebug("Flushed metrics to remote");
          });
          req.end();
        } finally {
          parentSpan.end(new Date())
        }
      } else {
        RemoteWriter.getSingleton().logDebug("Function name and version not known yet");
      }
    } else {
      RemoteWriter.getSingleton().logDebug("Asserts Cloud Remote Write Configuration in complete: \n" +
        JSON.stringify(this.remoteWriteConfig));
    }
  }

  setLambdaInstrumentation(lambdaInstrumentation: AwsLambdaInstrumentation) {
    this.lambdaInstrumentation = lambdaInstrumentation;
  }

  setAuthHeaders(options: any) {
    if (this.isDefined(this.remoteWriteConfig.tenantName) && this.isDefined(this.remoteWriteConfig.password)) {
      options.headers.Authorization = 'Basic ' + Buffer
        .from(this.remoteWriteConfig.tenantName + ':' + this.remoteWriteConfig.password)
        .toString('base64');
    }
  }

  responseCallback(res: any) {
    RemoteWriter.getSingleton().logDebug(`POST Asserts Metric API statusCode: ${res.statusCode}`);
    if (res.statusCode!.toString() === "400") {
      RemoteWriter.getSingleton().logDebug("Response: " + JSON.stringify(res));
    }
    const _this = RemoteWriter.singleton;
    res.on('data', _this.responseDataHandler);
  }

  responseDataHandler(data: any) {
    RemoteWriter.getSingleton().logDebug('POST to Asserts Metric API returned: ' + data.toString());
  }

  logDebug(message: string) {
    if (this.debugEnabled) {
      console.log(message);
    }
  }

  requestErrorHandler(error: any) {
    console.error('POST to Asserts Metric API resulted in an error: ' + error.toString());
  }

  isDefined(value: string | undefined): boolean {
    return !(value === undefined || value === 'undefined');
  }

  isEqual(value: string | undefined, expected: string) {
    return this.isDefined(value) && value === expected
  }
}

