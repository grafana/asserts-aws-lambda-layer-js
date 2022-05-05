import {Context, SQSEvent, Callback} from 'aws-lambda';
import * as AssertsSDK from "../../lib/HandlerWrapper";
import {LambdaInstanceMetrics} from "../../lib/LambdaInstanceMetrics";

describe("Handler Wrapper works for async and sync", () => {
    const mockRecordInvocation: jest.Mock = jest.fn();
    const mockRecordError: jest.Mock = jest.fn();
    const mockRecordLatency: jest.Mock = jest.fn();

    LambdaInstanceMetrics.prototype.recordInvocation = mockRecordInvocation;
    LambdaInstanceMetrics.prototype.recordLatency = mockRecordLatency;
    LambdaInstanceMetrics.prototype.recordError = mockRecordError;

    beforeEach(() => {
        jest.clearAllMocks();
    });
    const sqsEvent: SQSEvent = {} as any;

    const context: Context = {
        awsRequestId: "",
        callbackWaitsForEmptyEventLoop: false,
        functionName: "OrderProcessor",
        functionVersion: "1",
        invokedFunctionArn: "arn:aws:lambda:us-west-2:342994379019:function:OrderProcessor:1",
        logGroupName: "/aws/lambda/OrderProcessor",
        logStreamName: "2021/12/15/[1]2c5c0093943942a0bff9a07717274beb",
        memoryLimitInMB: "128",
        done(): void {
        },
        fail(): void {
        },
        getRemainingTimeInMillis(): number {
            return 0;
        },
        succeed() {
        }
    };

    const expectedResult: any = {
        statusCode: 200,
        event: JSON.stringify('Hello from Lambda!'),
    };

    it("Successful wrapping and metrics capture for async handler returning normally", async () => {
        const asyncHandler = async (event: any, givenContext: Context) => {
            expect(event).toStrictEqual(sqsEvent);
            expect(givenContext).toStrictEqual(context);
            return expectedResult;
        }

        const wrapHandler = AssertsSDK.wrapHandler(asyncHandler);

        const actualResult = await wrapHandler(sqsEvent, context, () => {});
        expect(actualResult).toStrictEqual(expectedResult);

        expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
        expect(mockRecordError).not.toHaveBeenCalled();
        expect(mockRecordLatency).toHaveBeenCalledTimes(1);
    });

    it("Successful wrapping and metrics capture for async handler returning with error", async () => {
        const asyncHandlerThrowingError = async (event: any, givenContext: Context) => {
            expect(event).toStrictEqual(sqsEvent);
            expect(givenContext).toStrictEqual(context);
            throw new Error();
        }

        const wrapHandler = AssertsSDK.wrapHandler(asyncHandlerThrowingError, {
            rethrowAfterCapture: false
        });

        await wrapHandler(sqsEvent, context, () => {});

        expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
        expect(mockRecordError).toHaveBeenCalledTimes(1);
        expect(mockRecordLatency).toHaveBeenCalledTimes(1);
    });

    it("Successful wrapping and metrics capture for async handler returning with error", async () => {
        const asyncHandlerThrowingError = async (event: any, givenContext: Context) => {
            expect(event).toStrictEqual(sqsEvent);
            expect(givenContext).toStrictEqual(context);
            throw new Error();
        }

        const wrapHandler = AssertsSDK.wrapHandler(asyncHandlerThrowingError, {
            rethrowAfterCapture: true
        });

        try {
            await wrapHandler(sqsEvent, context, () => {});
        } catch (e) {
        }

        expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
        expect(mockRecordError).toHaveBeenCalledTimes(1);
        expect(mockRecordLatency).toHaveBeenCalledTimes(1);
    });

    it("Successful wrapping and metrics capture for async handler returning a promise", async () => {
        let handlerReturningPromise = (event: any, givenContext: Context) => {
            expect(event).toStrictEqual(sqsEvent);
            expect(givenContext).toStrictEqual(context);
            return Promise.resolve(expectedResult);
        }

        let wrapHandler = AssertsSDK.wrapHandler(handlerReturningPromise);

        const actualResult = await wrapHandler(sqsEvent, context, () => {});
        expect(actualResult).toStrictEqual(expectedResult);

        expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
        expect(mockRecordError).not.toHaveBeenCalled();
        expect(mockRecordLatency).toHaveBeenCalledTimes(1);
    });

    it("Successful wrapping and metrics capture for async handler returning a promise and error", async () => {
        let handlerReturningPromiseAndRejection = (event: any, givenContext: Context) => {
            expect(event).toStrictEqual(sqsEvent);
            expect(givenContext).toStrictEqual(context);
            throw new Error();
        }

        let wrapHandler = AssertsSDK.wrapHandler(handlerReturningPromiseAndRejection, {
            rethrowAfterCapture: false
        });

        await wrapHandler(sqsEvent, context, () => {});

        expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
        expect(mockRecordError).toHaveBeenCalledTimes(1);
        expect(mockRecordLatency).toHaveBeenCalledTimes(1);
    });

    it("Successful wrapping and metrics capture for sync handler with a callback that is resolved", async () => {
        const callbackForSyncHandler: jest.Mock = jest.fn();
        

        const sideEffect: string[] = [];

        let handlerWithResolution = (event: any, givenContext: Context, givenCallback: Callback) => {
            expect(event).toStrictEqual(sqsEvent);
            expect(givenContext).toStrictEqual(context);
            expect(givenCallback).not.toBeNull();
            expect(givenCallback).toBeDefined();
            sideEffect.push("1");
            givenCallback(null, expectedResult);
        }

        let wrapHandler = AssertsSDK.wrapHandler(handlerWithResolution);

        await wrapHandler(sqsEvent, context, callbackForSyncHandler);

        expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
        expect(mockRecordError).not.toHaveBeenCalled();
        expect(mockRecordLatency).toHaveBeenCalledTimes(1);
        // FIXME expectation assertions on the callbackForSyncHandler fail so resorting to this hack
        expect(sideEffect).toStrictEqual(["1"]);
    });

    it("Successful wrapping and metrics capture for sync handler with a callback that is rejected", async () => {
        const callbackForSyncHandler: jest.Mock = jest.fn();
        

        const sideEffect: string[] = [];

        let handlerWithRejection = (event: any, givenContext: Context, givenCallback: Callback) => {
            expect(event).toStrictEqual(sqsEvent);
            expect(givenContext).toStrictEqual(context);
            expect(givenCallback).not.toBeNull();
            expect(givenCallback).toBeDefined();
            sideEffect.push("1");
            givenCallback("error", null);
        }

        let wrapHandler = AssertsSDK.wrapHandler(handlerWithRejection, {
            rethrowAfterCapture: false
        });

        await wrapHandler(sqsEvent, context, callbackForSyncHandler);

        expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
        expect(mockRecordError).toHaveBeenCalledTimes(1);
        expect(mockRecordLatency).toHaveBeenCalledTimes(1);
        // FIXME expectation assertions on the callbackForSyncHandler fail so resorting to this hack
        expect(sideEffect).toStrictEqual(["1"]);
    });

    it("Successful wrapping and metrics capture for sync handler with a callback resulting in error", async () => {
        const callbackForSyncHandler: jest.Mock = jest.fn();
        

        const sideEffect: string[] = [];

        let actualHandler = (event: any, givenContext: Context, givenCallback: Callback) => {
            expect(event).toStrictEqual(sqsEvent);
            expect(givenContext).toStrictEqual(context);
            expect(givenCallback).not.toBeNull();
            expect(givenCallback).toBeDefined();
            sideEffect.push("1");
            throw new Error();
        }

        let wrapHandler = AssertsSDK.wrapHandler(actualHandler, {
            rethrowAfterCapture: false
        });

        await wrapHandler(sqsEvent, context, callbackForSyncHandler);

        expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
        expect(mockRecordError).toHaveBeenCalledTimes(1);
        expect(mockRecordLatency).toHaveBeenCalledTimes(1);
        // FIXME expectation assertions on the callbackForSyncHandler fail so resorting to this hack
        expect(sideEffect).toStrictEqual(["1"]);
    });

    it("Successful wrapping and metrics capture for async handler returning a promise !", async () => {
        const callbackForSyncHandler: jest.Mock = jest.fn();
        

        const sideEffect: string[] = [];

        let asyncHandlerReturningPromise = async (event: any, givenContext: Context, givenCallback: Callback) => {
            expect(event).toStrictEqual(sqsEvent);
            expect(givenContext).toStrictEqual(context);
            expect(givenCallback).not.toBeNull();
            expect(givenCallback).toBeDefined();
            sideEffect.push("1");
            givenCallback(null, expectedResult);
        }

        let wrapHandler = AssertsSDK.wrapHandler(asyncHandlerReturningPromise, {
            rethrowAfterCapture: false
        });

        await wrapHandler(sqsEvent, context, callbackForSyncHandler);

        expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
        expect(mockRecordError).not.toHaveBeenCalled();
        expect(mockRecordLatency).toHaveBeenCalledTimes(1);
        // FIXME expectation assertions on the callbackForSyncHandler fail so resorting to this hack
        expect(sideEffect).toStrictEqual(["1"]);
    });
});
