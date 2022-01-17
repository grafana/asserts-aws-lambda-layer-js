import {Handler} from 'aws-lambda';
import {types} from 'util';
import {LambdaInstanceMetrics} from "./LambdaInstanceMetrics";

const {isPromise} = types;

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

const lambdaMetrics: LambdaInstanceMetrics = LambdaInstanceMetrics.getSingleton();

/**
 * Wraps a lambda handler adding it error capture and tracing capabilities.
 *
 * @param handler Handler
 * @param wrapOptions Options
 * @returns Handler
 */
export function wrapHandler<TEvent, TResult>(
    handler: Handler<TEvent, TResult>,
    wrapOptions: Partial<WrapperOptions> = {
        rethrowAfterCapture: true
    },
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
        const start = process.hrtime();
        let error: boolean = false;
        try {
            lambdaMetrics.recordInvocation();
            rv = await asyncHandler(event, context);
        } catch (e) {
            error = true;
            if (options.rethrowAfterCapture) {
                throw e;
            }
        } finally {
            const stop = process.hrtime(start);
            lambdaMetrics.recordLatency(
              Number(stop[0] * 1e9) + Number(stop[1] / 1e9),
            );
            if (error) {
                lambdaMetrics.recordError();
            }
        }
        return rv;
    };
}
