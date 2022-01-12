import {LambdaInstanceMetrics} from "../../src/lib/LambdaInstanceMetrics";
import {Gauge, Counter, Histogram, register as globalRegister, Registry} from "prom-client";
import {mocked} from "jest-mock";

jest.mock('prom-client');

describe("Metrics should have been initialized", () => {
    beforeEach(() => {
        process.env["AWS_LAMBDA_FUNCTION_MEMORY_SIZE"] = "128";
        process.env["AWS_LAMBDA_FUNCTION_NAME"] = "OrderProcessor";
        process.env["AWS_LAMBDA_FUNCTION_VERSION"] = "1";
        process.env["AWS_REGION"] = "us-west-2";
        jest.clearAllMocks();
    })

    it("Label names are initialised", () => {
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        expect(lambdaInstance.labelNames)
            .toStrictEqual([
                'asserts_source', 'asserts_tenant',
                'function_name', 'instance', 'job', 'namespace', 'region',
                'tenant', 'version']);
    });

    it("Label values are initialised", () => {
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        expect(lambdaInstance.labelValues).toBeTruthy();
        expect(lambdaInstance.labelValues.instance).toBeTruthy();
        expect(lambdaInstance.labelValues.namespace).toBe("AWS/Lambda");
        expect(lambdaInstance.labelValues.asserts_site).toBe("us-west-2");
        expect(lambdaInstance.labelValues.function_name).toBe("OrderProcessor")
        expect(lambdaInstance.labelValues.job).toBe("OrderProcessor")
        expect(lambdaInstance.labelValues.version).toBe("1");
        expect(lambdaInstance.isNameAndVersionSet()).toBe(true);
    });

    it("Function context is not initialised yet", () => {
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        lambdaInstance.labelValues.job = undefined;
        lambdaInstance.labelValues.function_name = undefined;
        lambdaInstance.labelValues.version = undefined;
        expect(lambdaInstance.isNameAndVersionSet()).toBe(false);
    });

    it("Tenant labels are initialised", () => {
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        lambdaInstance.setTenant("tenant");
        expect(lambdaInstance.labelValues.tenant).toBe("tenant");
        expect(lambdaInstance.labelValues.asserts_tenant).toBe("tenant");
    });

    it("Gauge for up metric and Lambda Memory Limit is created", () => {
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        expect(Gauge).toHaveBeenCalledTimes(2);
        expect(Gauge).toHaveBeenCalledWith({
            name: 'up',
            help: `Heartbeat metric`,
            registers: [globalRegister],
            labelNames: lambdaInstance.labelNames
        });
        expect(lambdaInstance.up).toBeInstanceOf(Gauge);
        expect(lambdaInstance.memoryLimitMb).toBeInstanceOf(Gauge);
    });

    it("Counters for invocations and errors are created", () => {
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        expect(Counter).toBeCalledTimes(2);
        expect(Counter).toHaveBeenCalledWith({
            name: 'aws_lambda_invocations_total',
            help: `AWS Lambda Invocations Count`,
            registers: [globalRegister],
            labelNames: lambdaInstance.labelNames
        });
        expect(Counter).toHaveBeenCalledWith({
            name: 'aws_lambda_errors_total',
            help: `AWS Lambda Errors Count`,
            registers: [globalRegister],
            labelNames: lambdaInstance.labelNames
        });
    });

    it("Counter metric for invocations is initialised", () => {
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        expect(lambdaInstance.invocations).toBeInstanceOf(Counter);
    });

    it("Counter metric for errors is initialised", () => {
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        expect(lambdaInstance.errors).toBeInstanceOf(Counter);
    });

    it("Histogram for duration is created", () => {
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        expect(Histogram).toBeCalledTimes(1);
        expect(Histogram).toHaveBeenCalledWith({
            name: 'aws_lambda_duration_seconds',
            help: `AWS Lambda Duration Histogram`,
            registers: [globalRegister],
            labelNames: lambdaInstance.labelNames
        });
    });

    it("Histogram metric for latency is initialised", () => {
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        expect(lambdaInstance.latency).toBeInstanceOf(Histogram);
    });

    const mockedCounter = mocked(Counter, true);
    const mockedHistogram = mocked(Histogram, true);
    it("Invocation is recorded", () => {
        const metricInstance = new LambdaInstanceMetrics();
        metricInstance.recordInvocation();
        expect(metricInstance.invocations).toBeInstanceOf(mockedCounter);
        expect(mockedCounter.prototype.inc).toHaveBeenCalledTimes(1);
        expect(mockedCounter.prototype.inc).toHaveBeenCalledWith(1);
    });

    it("Error is recorded", () => {
        const metricInstance = new LambdaInstanceMetrics();
        metricInstance.recordError();
        expect(metricInstance.errors).toBeInstanceOf(mockedCounter);
        expect(mockedCounter.prototype.inc).toHaveBeenCalledTimes(1);
        expect(mockedCounter.prototype.inc).toHaveBeenCalledWith(1);
        expect(mockedCounter.prototype.inc).toHaveBeenCalledWith(1);
    });

    it("Duration is recorded", () => {
        const metricInstance = new LambdaInstanceMetrics();
        metricInstance.recordLatency(10.0);
        expect(metricInstance.latency).toBeInstanceOf(mockedHistogram);
        expect(mockedHistogram.prototype.observe).toHaveBeenCalledTimes(1);
        expect(mockedHistogram.prototype.observe).toHaveBeenCalledWith(10.0);
    });

    it("Memory Limit Gauge metric is set", async () => {
        const metricInstance = new LambdaInstanceMetrics();
        metricInstance.recordLatestMemoryLimit();
        expect(Gauge.prototype.set).toHaveBeenCalledWith(128);
    });

    it("Memory Limit Gauge metric is not set", async () => {
        process.env["AWS_LAMBDA_FUNCTION_MEMORY_SIZE"] = "abc";
        const metricInstance = new LambdaInstanceMetrics();
        metricInstance.recordLatestMemoryLimit();
        expect(Gauge.prototype.set).not.toHaveBeenCalled();
    });

    it("Gets Metrics as text not null", async () => {
        const mockedRegistry = mocked(Registry, true);
        const metricInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        mockedRegistry.prototype.metrics.mockImplementation(async () => {
            return "metrics-text";
        });
        let result = await metricInstance.getAllMetricsAsText();
        expect(result).toBe("metrics-text");
    })

    it("Gets Metrics as text returns null", async () => {
        const metricInstance = new LambdaInstanceMetrics();
        const mockIsSet: jest.Mock = jest.fn();
        metricInstance.isNameAndVersionSet = mockIsSet;

        mockIsSet.mockReturnValue(false);
        let result = await metricInstance.getAllMetricsAsText();
        expect(result).toBeNull();
    })
});
