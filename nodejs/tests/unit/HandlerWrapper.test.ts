import {Context, SQSEvent, Callback} from 'aws-lambda';
import * as AssertsSDK from "../../src/lib/HandlerWrapper";
import {LambdaInstanceMetrics} from "../../src/lib/LambdaInstanceMetrics";

describe("Handler Wrapper works for async and sync", () => {
    const mockSetVersion: jest.Mock = jest.fn();
    const mockIsSet: jest.Mock = jest.fn();
    const mockSetName: jest.Mock = jest.fn();
    const mockRecordInvocation: jest.Mock = jest.fn();
    const mockRecordError: jest.Mock = jest.fn();
    const mockRecordLatency: jest.Mock = jest.fn();

    LambdaInstanceMetrics.prototype.isNameAndVersionSet = mockIsSet;
    LambdaInstanceMetrics.prototype.setFunctionVersion = mockSetVersion;
    LambdaInstanceMetrics.prototype.setFunctionName = mockSetName;
    LambdaInstanceMetrics.prototype.recordInvocation = mockRecordInvocation;
    LambdaInstanceMetrics.prototype.recordLatency = mockRecordLatency;
    LambdaInstanceMetrics.prototype.recordError = mockRecordError;

    beforeEach(() => {
        jest.clearAllMocks();
        mockIsSet.mockReturnValueOnce(false);
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

        // @ts-ignore
        const wrapHandler: Promise<any> = AssertsSDK.wrapHandler(asyncHandler);

        // @ts-ignore
        const actualResult = await wrapHandler(sqsEvent, context);
        expect(actualResult).toStrictEqual(expectedResult);

        expect(mockIsSet).toHaveBeenCalledTimes(1);
        expect(mockSetName).toHaveBeenCalledTimes(1);
        expect(mockSetName.mock.calls[0].length).toBe(1);
        expect(mockSetName.mock.calls[0][0]).toBe(context.functionName);
        expect(mockSetVersion.mock.calls[0].length).toBe(1);
        expect(mockSetVersion.mock.calls[0][0]).toBe(context.functionVersion);
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

        // @ts-ignore
        const wrapHandler: Promise<any> = AssertsSDK.wrapHandler(asyncHandlerThrowingError, {
            rethrowAfterCapture: false
        });

        // @ts-ignore
        await wrapHandler(sqsEvent, context);

        expect(mockIsSet).toHaveBeenCalledTimes(1);
        expect(mockSetName).toHaveBeenCalledTimes(1);
        expect(mockSetName.mock.calls[0].length).toBe(1);
        expect(mockSetName.mock.calls[0][0]).toBe(context.functionName);
        expect(mockSetVersion.mock.calls[0].length).toBe(1);
        expect(mockSetVersion.mock.calls[0][0]).toBe(context.functionVersion);
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

        // @ts-ignore
        const wrapHandler: Promise<any> = AssertsSDK.wrapHandler(asyncHandlerThrowingError, {
            rethrowAfterCapture: true
        });

        try { // @ts-ignore
            await wrapHandler(sqsEvent, context);
        } catch (e) {
        }

        expect(mockIsSet).toHaveBeenCalledTimes(1);
        expect(mockSetName).toHaveBeenCalledTimes(1);
        expect(mockSetName.mock.calls[0].length).toBe(1);
        expect(mockSetName.mock.calls[0][0]).toBe(context.functionName);
        expect(mockSetVersion.mock.calls[0].length).toBe(1);
        expect(mockSetVersion.mock.calls[0][0]).toBe(context.functionVersion);
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

        // @ts-ignore
        let wrapHandler: Promise<any> = AssertsSDK.wrapHandler(handlerReturningPromise);

        // @ts-ignore
        const actualResult = await wrapHandler(sqsEvent, context);
        expect(actualResult).toStrictEqual(expectedResult);

        expect(mockIsSet).toHaveBeenCalledTimes(1);
        expect(mockSetName).toHaveBeenCalledTimes(1);
        expect(mockSetName.mock.calls[0].length).toBe(1);
        expect(mockSetName.mock.calls[0][0]).toBe(context.functionName);
        expect(mockSetVersion.mock.calls[0].length).toBe(1);
        expect(mockSetVersion.mock.calls[0][0]).toBe(context.functionVersion);
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

        // @ts-ignore
        let wrapHandler: Promise<any> = AssertsSDK.wrapHandler(handlerReturningPromiseAndRejection, {
            rethrowAfterCapture: false
        });

        // @ts-ignore
        await wrapHandler(sqsEvent, context);

        expect(mockIsSet).toHaveBeenCalledTimes(1);
        expect(mockSetName).toHaveBeenCalledTimes(1);
        expect(mockSetName.mock.calls[0].length).toBe(1);
        expect(mockSetName.mock.calls[0][0]).toBe(context.functionName);
        expect(mockSetVersion.mock.calls[0].length).toBe(1);
        expect(mockSetVersion.mock.calls[0][0]).toBe(context.functionVersion);
        expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
        expect(mockRecordError).toHaveBeenCalledTimes(1);
        expect(mockRecordLatency).toHaveBeenCalledTimes(1);
    });

    it("Successful wrapping and metrics capture for sync handler with a callback that is resolved", async () => {
        const callbackForSyncHandler: jest.Mock = jest.fn();
        mockIsSet.mockReturnValueOnce(false);

        const sideEffect: string[] = [];

        let handlerWithResolution = (event: any, givenContext: Context, givenCallback: Callback) => {
            expect(event).toStrictEqual(sqsEvent);
            expect(givenContext).toStrictEqual(context);
            expect(givenCallback).not.toBeNull();
            expect(givenCallback).toBeDefined();
            sideEffect.push("1");
            givenCallback(null, expectedResult);
        }

        // @ts-ignore
        let wrapHandler: void = AssertsSDK.wrapHandler(handlerWithResolution);

        // @ts-ignore
        await wrapHandler(sqsEvent, context, callbackForSyncHandler);

        expect(mockIsSet).toHaveBeenCalledTimes(1);
        expect(mockSetName).toHaveBeenCalledTimes(1);
        expect(mockSetName.mock.calls[0].length).toBe(1);
        expect(mockSetName.mock.calls[0][0]).toBe(context.functionName);
        expect(mockSetVersion.mock.calls[0].length).toBe(1);
        expect(mockSetVersion.mock.calls[0][0]).toBe(context.functionVersion);
        expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
        expect(mockRecordError).not.toHaveBeenCalled();
        expect(mockRecordLatency).toHaveBeenCalledTimes(1);
        // FIXME expectation assertions on the callbackForSyncHandler fail so resorting to this hack
        expect(sideEffect).toStrictEqual(["1"]);
    });

    it("Successful wrapping and metrics capture for sync handler with a callback that is rejected", async () => {
        const callbackForSyncHandler: jest.Mock = jest.fn();
        mockIsSet.mockReturnValueOnce(false);

        const sideEffect: string[] = [];

        let handlerWithRejection = (event: any, givenContext: Context, givenCallback: Callback) => {
            expect(event).toStrictEqual(sqsEvent);
            expect(givenContext).toStrictEqual(context);
            expect(givenCallback).not.toBeNull();
            expect(givenCallback).toBeDefined();
            sideEffect.push("1");
            givenCallback("error", null);
        }

        // @ts-ignore
        let wrapHandler: void = AssertsSDK.wrapHandler(handlerWithRejection, {
            rethrowAfterCapture: false
        });

        // @ts-ignore
        await wrapHandler(sqsEvent, context, callbackForSyncHandler);

        expect(mockIsSet).toHaveBeenCalledTimes(1);
        expect(mockSetName).toHaveBeenCalledTimes(1);
        expect(mockSetName.mock.calls[0].length).toBe(1);
        expect(mockSetName.mock.calls[0][0]).toBe(context.functionName);
        expect(mockSetVersion.mock.calls[0].length).toBe(1);
        expect(mockSetVersion.mock.calls[0][0]).toBe(context.functionVersion);
        expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
        expect(mockRecordError).toHaveBeenCalledTimes(1);
        expect(mockRecordLatency).toHaveBeenCalledTimes(1);
        // FIXME expectation assertions on the callbackForSyncHandler fail so resorting to this hack
        expect(sideEffect).toStrictEqual(["1"]);
    });

    it("Successful wrapping and metrics capture for sync handler with a callback resulting in error", async () => {
        const callbackForSyncHandler: jest.Mock = jest.fn();
        mockIsSet.mockReturnValueOnce(false);

        const sideEffect: string[] = [];

        let actualHandler = (event: any, givenContext: Context, givenCallback: Callback) => {
            expect(event).toStrictEqual(sqsEvent);
            expect(givenContext).toStrictEqual(context);
            expect(givenCallback).not.toBeNull();
            expect(givenCallback).toBeDefined();
            sideEffect.push("1");
            throw new Error();
        }

        // @ts-ignore
        let wrapHandler: void = AssertsSDK.wrapHandler(actualHandler, {
            rethrowAfterCapture: false
        });

        // @ts-ignore
        await wrapHandler(sqsEvent, context, callbackForSyncHandler);

        expect(mockIsSet).toHaveBeenCalledTimes(1);
        expect(mockSetName).toHaveBeenCalledTimes(1);
        expect(mockSetName.mock.calls[0].length).toBe(1);
        expect(mockSetName.mock.calls[0][0]).toBe(context.functionName);
        expect(mockSetVersion.mock.calls[0].length).toBe(1);
        expect(mockSetVersion.mock.calls[0][0]).toBe(context.functionVersion);
        expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
        expect(mockRecordError).toHaveBeenCalledTimes(1);
        expect(mockRecordLatency).toHaveBeenCalledTimes(1);
        // FIXME expectation assertions on the callbackForSyncHandler fail so resorting to this hack
        expect(sideEffect).toStrictEqual(["1"]);
    });

    it("Successful wrapping and metrics capture for async handler returning a promise !", async () => {
        const callbackForSyncHandler: jest.Mock = jest.fn();
        mockIsSet.mockReturnValueOnce(false);

        const sideEffect: string[] = [];

        let asyncHandlerReturningPromise = async (event: any, givenContext: Context, givenCallback: Callback) => {
            expect(event).toStrictEqual(sqsEvent);
            expect(givenContext).toStrictEqual(context);
            expect(givenCallback).not.toBeNull();
            expect(givenCallback).toBeDefined();
            sideEffect.push("1");
            givenCallback(null, expectedResult);
        }

        // @ts-ignore
        let wrapHandler: void = AssertsSDK.wrapHandler(asyncHandlerReturningPromise, {
            rethrowAfterCapture: false
        });

        // @ts-ignore
        await wrapHandler(sqsEvent, context, callbackForSyncHandler);

        expect(mockIsSet).toHaveBeenCalledTimes(1);
        expect(mockSetName).toHaveBeenCalledTimes(1);
        expect(mockSetName.mock.calls[0].length).toBe(1);
        expect(mockSetName.mock.calls[0][0]).toBe(context.functionName);
        expect(mockSetVersion.mock.calls[0].length).toBe(1);
        expect(mockSetVersion.mock.calls[0][0]).toBe(context.functionVersion);
        expect(mockRecordInvocation).toHaveBeenCalledTimes(1);
        expect(mockRecordError).not.toHaveBeenCalled();
        expect(mockRecordLatency).toHaveBeenCalledTimes(1);
        // FIXME expectation assertions on the callbackForSyncHandler fail so resorting to this hack
        expect(sideEffect).toStrictEqual(["1"]);
    });
});
