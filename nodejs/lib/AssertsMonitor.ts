'use strict';
import { Counter, Gauge, Histogram, collectDefaultMetrics, register as globalRegister } from 'prom-client';
import { Context, Handler } from 'aws-lambda';
import { types } from 'util';
import { basename, resolve } from 'path';
import { existsSync } from 'fs';
import { networkInterfaces } from 'os';
import { request } from 'https';

const { isPromise } = types;

type SyncHandler<T extends Handler> = (
    event: Parameters<T>[0],
    context: Parameters<T>[1],
    callback: Parameters<T>[2],
) => void;

export type AsyncHandler<T extends Handler> = (
    event: Parameters<T>[0],
    context: Parameters<T>[1],
) => Promise<NonNullable<Parameters<Parameters<T>[2]>[1]>>;

export interface WrapperOptions {
    callbackWaitsForEmptyEventLoop: boolean;
    /**
     * Capture all errors when `Promise.allSettled` is returned by the handler
     * The {@link wrapHandler} will not fail the lambda even if there are errors
     * @default false
     */
    captureAllSettledReasons: boolean;
    captureTimeoutWarning: boolean;
    timeoutWarningLimit: number;
}

const nets = networkInterfaces();
const networkAddresses = new Map<string, string[]>(); // Or just '{}', an empty object

if (nets) {
    for (const name of Object.keys(nets)) {
        if (nets[name] != undefined) {
            for (const net of nets[name]!) {
                // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
                if (net != undefined && net.family === 'IPv4' && !net.internal) {
                    if(!networkAddresses.has(name)) {
                        networkAddresses.set(name, []);
                    }
                    networkAddresses.get(name)!.push(net.address);
                }
            }
        }
    }
}

let labelNames = ['job', 'function_name', 'version', 'instance', 'namespace'];
let labels = {
    namespace: 'AWS/Lambda',
    asserts_tenant: 'chief',
    instance: '',
    function_name: '',
    job: ''
};

let instance: string;
let keys = Object.keys(networkAddresses);
if (keys.length > 0) {
    instance = networkAddresses.get(keys[0])![0];
    // Treat the process id like a port
    labels.instance = instance + ':' + process.pid;
}

collectDefaultMetrics({
    labels: labelNames,
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // These are the default buckets.
});

const upMetric = new Gauge({
    name: 'up',
    help: `Heartbeat metric`,
    registers: [globalRegister],
    labelNames: labelNames
});

const invocations = new Counter({
    name: 'aws_lambda_invocations_total',
    help: `AWS Lambda Invocations Count`,
    registers: [globalRegister],
    labelNames: labelNames
});

const errors = new Counter({
    name: 'aws_lambda_errors_total',
    help: `AWS Lambda Errors Count`,
    registers: [globalRegister],
    labelNames: labelNames
});

const latency = new Histogram({
    name: 'aws_lambda_duration_seconds',
    help: `AWS Lambda Duration Histogram`,
    registers: [globalRegister],
    labelNames: labelNames
});

globalRegister.registerMetric(upMetric);
globalRegister.registerMetric(invocations);
globalRegister.registerMetric(errors);
globalRegister.registerMetric(latency);

class RemoteWriter {
    remoteWriteURL: string;
    tenantName: string;
    password: string;
    canRemoteWrite: boolean;
    delegate: Function;

    constructor() {
        this.remoteWriteURL = process.env["ASSERTS_REMOTE_WRITE_URL"] ? process.env["ASSERTS_REMOTE_WRITE_URL"] : "NONE";
        this.tenantName = process.env["ASSERTS_TENANT_NAME"] ? process.env["ASSERTS_TENANT_NAME"] : "NONE";
        this.password = process.env["ASSERTS_PASSWORD"] ? process.env["ASSERTS_PASSWORD"] : "NONE";
        this.canRemoteWrite = this.remoteWriteURL != "NONE" && this.tenantName != "NONE" && this.password != "NONE";
        this.delegate = () => { console.log("Lambda Handler not set yet !") };
    }

    // This will have to be invoked once every 15 seconds. We should probably use the NodeJS Timer for this
    async pushMetrics() {
    }
}

let remoteWriter:RemoteWriter = new RemoteWriter();

// TODO: Move this code to the pushMetrics in RemoteWriter
let pushMetrics = async () => {
    // console.log("Push Metrics called... : " + JSON.stringify(labels));
    if(labels.function_name) {
      labels.function_name = labels.function_name + '-prom-client-direct';
      labels.job = labels.function_name;
      // console.log("Set job : " + JSON.stringify(labels));
      globalRegister.setDefaultLabels(labels);
      upMetric.set({}, 1);
      let metrics = await globalRegister.metrics();
      globalRegister.resetMetrics();
      // console.log(JSON.stringify(networkAddresses));
      // console.log("\n\nMETRICS\n\n"+metrics+"\n\n");
      // console.log("Pushing metrics to gateway with labels:" + JSON.stringify(labels));
      const options = {
        hostname: 'chief.tsdb.dev.asserts.ai',
        port: 443,
        path: '/api/v1/import/prometheus',
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from('chief:chieftenant').toString('base64'),
          'Content-Type': 'text/plain',
          'Content-Length': metrics.length
        }
      };
  
      const req = request(options, res => {
        console.log(`POST https://chief.tsdb.dev.asserts.ai/api/v1/import/prometheus statusCode: ${res.statusCode}`);
        
        if(res.statusCode!.toString()==="400") {
          console.log(res.toString());
        }
      
        res.on('data', d => {
          process.stdout.write(d);
        })
      })
      
      req.on('error', error => {
        console.error('POST https://chief.tsdb.dev.asserts.ai/api/v1/import/prometheus resulted in an error: '+error.toString());
      })
      
      req.write(metrics);
      req.end();
    } else {
      console.log("Job name not known yet");
    }

    // Once we use timer, no need to schedule it from here
    setTimeout(pushMetrics, 15000);
  };
  
  // Schedule it once until the timer is used.
  setTimeout(pushMetrics, 15000);

/**
 * Wraps a lambda handler adding it error capture and tracing capabilities.
 *
 * @param handler Handler
 * @param wrapOptions Options
 * @returns Handler
 */
export function wrapHandler<TEvent, TResult>(
    handler: Handler<TEvent, TResult>,
    wrapOptions: Partial<WrapperOptions> = {},
): Handler<TEvent, TResult | undefined> {
    const options: WrapperOptions = {
        callbackWaitsForEmptyEventLoop: false,
        captureAllSettledReasons: false,
        captureTimeoutWarning: false,
        timeoutWarningLimit: 300_000
    };
    let timeoutWarningTimer: NodeJS.Timeout;

    // AWSLambda is like Express. It makes a distinction about handlers based on it's last argument
    // async (event) => async handler
    // async (event, context) => async handler
    // (event, context, callback) => sync handler
    // Nevertheless whatever option is chosen by user, we convert it to async handler.
    const asyncHandler: AsyncHandler<typeof handler> =
        handler.length > 2
            ? (event, context) =>
                new Promise((resolve, reject) => {
                    const rv = (handler as SyncHandler<typeof handler>)(event, context, (error, result) => {
                        if (error === null || error === undefined) {
                            resolve(result!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
                        } else {
                            reject(error);
                        }
                    }) as unknown;

                    // This should never happen, but still can if someone writes a handler as
                    // `async (event, context, callback) => {}`
                    if (isPromise(rv)) {
                        void (rv as Promise<NonNullable<TResult>>).then(resolve, reject);
                    }
                })
            : (handler as AsyncHandler<typeof handler>);

    return async (event, context) => {
        context.callbackWaitsForEmptyEventLoop = options.callbackWaitsForEmptyEventLoop;

        // When `callbackWaitsForEmptyEventLoop` is set to false, which it should when using `captureTimeoutWarning`,
        // we don't have a guarantee that this message will be delivered. Because of that, we don't flush it.
        if (options.captureTimeoutWarning) {
            const timeoutWarningDelay = tryGetRemainingTimeInMillis(context) - options.timeoutWarningLimit;

            timeoutWarningTimer = setTimeout(() => {
                // TODO: Add code
            }, timeoutWarningDelay);
        }

        let rv: TResult | undefined;
        try {
            invocations.inc({}, 1);
            // We put the transaction on the scope so users can attach children to it
            rv = await asyncHandler(event, context);

            // We manage lambdas that use Promise.allSettled by capturing the errors of failed promises
            if (options.captureAllSettledReasons && Array.isArray(rv) && isPromiseAllSettledResult(rv)) {
                const reasons = getRejectedReasons(rv);
                reasons.forEach(exception => {
                });
            }
        } catch (e) {
            errors.inc({}, 1);
            throw e;
        } finally {
            // clearTimeout(timeoutWarningTimer);
        }
        return rv;
    };
}

/**
* Tries to invoke context.getRemainingTimeInMillis if not available returns 0
* Some environments use AWS lambda but don't support this function
* @param context
*/
function tryGetRemainingTimeInMillis(context: Context): number {
    return typeof context.getRemainingTimeInMillis === 'function' ? context.getRemainingTimeInMillis() : 0;
}

type PromiseSettledResult<T> = { status: 'rejected' | 'fulfilled'; reason?: T };

/** */
function getRejectedReasons<T>(results: PromiseSettledResult<T>[]): T[] {
    return results.reduce((rejected: T[], result) => {
        if (result.status === 'rejected' && result.reason) rejected.push(result.reason);
        return rejected;
    }, []);
}

/** */
export function tryPatchHandler(taskRoot: string, handlerPath: string): void {
    type HandlerBag = HandlerModule | Handler | null | undefined;

    interface HandlerModule {
        [key: string]: HandlerBag;
    }

    const handlerDesc = basename(handlerPath);
    const match = handlerDesc.match(/^([^.]*)\.(.*)$/);
    if (!match) {
        console.log(`Bad handler ${handlerDesc}`);
        return;
    }

    const [, handlerMod, handlerName] = match;

    let obj: HandlerBag;
    try {
        const handlerDir = handlerPath.substring(0, handlerPath.indexOf(handlerDesc));
        obj = tryRequire(taskRoot, handlerDir, handlerMod);
    } catch (e) {
        console.log(`Cannot require ${handlerPath} in ${taskRoot}`, e);
        return;
    }

    let mod: HandlerBag;
    let functionName: string | undefined;
    handlerName.split('.').forEach(name => {
        mod = obj;
        obj = obj && (obj as HandlerModule)[name];
        functionName = name;
    });
    if (!obj) {
        console.log(`${handlerPath} is undefined or not exported`);
        return;
    }
    if (typeof obj !== 'function') {
        console.log(`${handlerPath} is not a function`);
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (mod as HandlerModule)[functionName!] = wrapHandler(obj as Handler);
}

function tryRequire<T>(taskRoot: string, subdir: string, mod: string): T {
    const lambdaStylePath = resolve(taskRoot, subdir, mod);
    if (existsSync(lambdaStylePath) || existsSync(`${lambdaStylePath}.js`)) {
        // Lambda-style path
        return require(lambdaStylePath);
    }
    // Node-style path
    return require(require.resolve(mod, { paths: [taskRoot, subdir] }));
}

/** */
function isPromiseAllSettledResult<T>(result: T[]): boolean {
    return result.every(
        v =>
            Object.prototype.hasOwnProperty.call(v, 'status') &&
            (Object.prototype.hasOwnProperty.call(v, 'value') || Object.prototype.hasOwnProperty.call(v, 'reason')),
    );
}