import {Handler} from 'aws-lambda';
import {existsSync} from 'fs';
import {basename, resolve} from 'path';
import {types} from 'util';
import {LambdaInstanceMetrics} from "./LambdaInstanceMetrics";
import {RemoteWriter} from "./RemoteWriter";
import {TaskTimer} from "tasktimer";

const {isPromise} = types;
const lambdaInstance = new LambdaInstanceMetrics();
const remoteWriter = new RemoteWriter(lambdaInstance);
const taskTimer = new TaskTimer(15000);

// Push metrics at the scheduled interval
if (remoteWriter.config.remoteWriteConfigComplete) {
    taskTimer.on('tick', async () => {
        await remoteWriter.pushMetrics();
    });
}

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
    flushTimeout: number;
    rethrowAfterCapture: boolean;
    callbackWaitsForEmptyEventLoop: boolean;
    captureTimeoutWarning: boolean;
    timeoutWarningLimit: number;
    /**
     * Capture all errors when `Promise.allSettled` is returned by the handler
     * The {@link wrapHandler} will not fail the lambda even if there are errors
     * @default false
     */
    captureAllSettledReasons: boolean;
}

/** */
function tryRequire<T>(taskRoot: string, subdir: string, mod: string): T {
    const lambdaStylePath = resolve(taskRoot, subdir, mod);
    if (existsSync(lambdaStylePath) || existsSync(`${lambdaStylePath}.js`)) {
        // Lambda-style path
        return require(lambdaStylePath);
    }
    // Node-style path
    return require(require.resolve(mod, {paths: [taskRoot, subdir]}));
}

/** */
function isPromiseAllSettledResult<T>(result: T[]): boolean {
    return result.every(
        v =>
            Object.prototype.hasOwnProperty.call(v, 'status') &&
            (Object.prototype.hasOwnProperty.call(v, 'value') || Object.prototype.hasOwnProperty.call(v, 'reason')),
    );
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
        console.error(`Bad handler ${handlerDesc}`);
        return;
    }

    const [, handlerMod, handlerName] = match;

    let obj: HandlerBag;
    try {
        const handlerDir = handlerPath.substring(0, handlerPath.indexOf(handlerDesc));
        obj = tryRequire(taskRoot, handlerDir, handlerMod);
    } catch (e) {
        console.error(`Cannot require ${handlerPath} in ${taskRoot}`, e);
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
        console.error(`${handlerPath} is undefined or not exported`);
        return;
    }
    if (typeof obj !== 'function') {
        console.error(`${handlerPath} is not a function`);
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (mod as HandlerModule)[functionName!] = wrapHandler(obj as Handler);
}

/**
 * Tries to invoke context.getRemainingTimeInMillis if not available returns 0
 * Some environments use AWS lambda but don't support this function
 * @param context
 */
// function tryGetRemainingTimeInMillis(context: Context): number {
//     return typeof context.getRemainingTimeInMillis === 'function' ? context.getRemainingTimeInMillis() : 0;
// }

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
        flushTimeout: 2000,
        rethrowAfterCapture: true,
        callbackWaitsForEmptyEventLoop: false,
        captureTimeoutWarning: true,
        timeoutWarningLimit: 500,
        captureAllSettledReasons: false,
        ...wrapOptions,
    };

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
        // In seconds. You cannot go any more granular than this in AWS Lambda.
        let rv: TResult | undefined;
        const start = Date.now();
        let error: boolean = false;
        try {
            // We put the transaction on the scope so users can attach children to it
            if (!lambdaInstance.isFunctionContextSet()) {
                lambdaInstance.setFunctionName(context.functionName);
                lambdaInstance.setFunctionVersion(context.functionVersion);
            }
            lambdaInstance.recordInvocation();
            rv = await asyncHandler(event, context);

            // We manage lambdas that use Promise.allSettled by capturing the errors of failed promises
            if (options.captureAllSettledReasons && Array.isArray(rv) && isPromiseAllSettledResult(rv)) {
                const reasons = getRejectedReasons(rv);
                reasons.forEach(exception => {
                    error = true;
                });
            }
        } catch (e) {
            error = true;
            if (options.rethrowAfterCapture) {
                throw e;
            }
        } finally {
            const end = Date.now();
            lambdaInstance.recordLatency((end - start) / 1000);
            if (error) {
                lambdaInstance.recordError();
            }
        }
        return rv;
    };
}
