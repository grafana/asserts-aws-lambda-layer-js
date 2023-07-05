'use strict';
import {LambdaInstanceMetrics} from './LambdaInstanceMetrics';
import {request as https} from 'https';
import {request as http} from 'http';
import {TaskTimer} from "tasktimer";
import {AwsLambdaInstrumentation} from "@opentelemetry/instrumentation-aws-lambda";
import {ROOT_CONTEXT, SpanKind, trace, context} from '@opentelemetry/api';

export class RemoteWriter {
  remoteWriteConfig: {
    hostName?: string | undefined;
    port?: number | undefined;
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
    if (process.env.DEBUG && process.env.DEBUG === 'true') {
      this.debugEnabled = true;
    }

    this.lambdaInstance = LambdaInstanceMetrics.getSingleton();
    this.remoteWriteConfig = {
      hostName: process.env["ASSERTS_METRICSTORE_HOST"],
      tenantName: process.env["ASSERTS_TENANT_NAME"],
      password: process.env["ASSERTS_PASSWORD"],
      isComplete: false
    };

    if (process.env["ASSERTS_METRICSTORE_PORT"] && process.env["ASSERTS_METRICSTORE_PORT"] !== 'undefined') {
      this.remoteWriteConfig.port = parseInt(process.env["ASSERTS_METRICSTORE_PORT"]);
    } else {
      this.remoteWriteConfig.port = 443;
    }

    if (this.remoteWriteConfig.tenantName && this.remoteWriteConfig.tenantName !== 'undefined') {
      this.lambdaInstance.setTenant((this.remoteWriteConfig.tenantName as (string)));
    }

    this.remoteWriteConfig.isComplete = this.remoteWriteConfig.hostName !== 'undefined';

    RemoteWriter.singleton = this;
    if (this.remoteWriteConfig.isComplete && !process.env.ASSERTS_LAYER_DISABLED &&
      process.env.ASSERTS_LAYER_DISABLED !== 'undefined' &&
      process.env.ASSERTS_LAYER_DISABLED !== 'true') {
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
        const options = {
          hostname: this.remoteWriteConfig.hostName,
          port: this.remoteWriteConfig.port,
          path: '/api/v1/import/prometheus',
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'Content-Length': text.length
          }
        };
        this.setAuthHeaders(options);
        const req = options.port === 443 ? https(options, this.responseCallback) :
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
    if (this.remoteWriteConfig.password && this.remoteWriteConfig.password !== 'undefined') {
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
}

