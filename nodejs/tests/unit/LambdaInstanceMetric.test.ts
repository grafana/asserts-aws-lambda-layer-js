import {LambdaInstanceMetrics} from "../../src/lib/LambdaInstanceMetrics";
import {Gauge, Counter, Histogram, register as globalRegistry, register as globalRegister, Registry} from "prom-client";
import {mocked} from "jest-mock";

jest.mock('prom-client');

describe("Metrics should have been initialized", () => {
    const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();

    it("Label names are initialised", () => {
        expect(lambdaInstance.labelNames)
            .toStrictEqual(['function_name', 'instance', 'job', 'namespace', 'version']);
    });

    it("Label values are initialised", () => {
        expect(lambdaInstance.labelValues).toBeTruthy();
        expect(lambdaInstance.labelValues.instance).toBeTruthy();
        expect(lambdaInstance.labelValues.namespace).toBe("AWS/Lambda");
        expect(lambdaInstance.labelValues.function_name).toBeFalsy();
        expect(lambdaInstance.labelValues.job).toBeFalsy();
        expect(lambdaInstance.labelValues.version).toBeFalsy();
    });

    it("Gauge for up metric is created", () => {
        expect(Gauge).toHaveBeenCalledTimes(1);
        expect(Gauge).toHaveBeenCalledWith({
            name: 'up',
            help: `Heartbeat metric`,
            registers: [globalRegister],
            labelNames: lambdaInstance.labelNames
        });
    });

    it("Gauge metric up is initialised", () => {
        expect(lambdaInstance.up).toBeInstanceOf(Gauge);
    });

    it("Counters for invocations and errors are created", () => {
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
        expect(lambdaInstance.invocations).toBeInstanceOf(Counter);
    });

    it("Counter metric for errors is initialised", () => {
        expect(lambdaInstance.errors).toBeInstanceOf(Counter);
    });

    it("Histogram for duration is created", () => {
        expect(Histogram).toBeCalledTimes(1);
        expect(Histogram).toHaveBeenCalledWith({
            name: 'aws_lambda_duration_seconds',
            help: `AWS Lambda Duration Histogram`,
            registers: [globalRegister],
            labelNames: lambdaInstance.labelNames
        });
    });

    it("Histogram metric for latency is initialised", () => {
        expect(lambdaInstance.latency).toBeInstanceOf(Histogram);
    });

    it("Function context is not initialised yet", () => {
        expect(lambdaInstance.isFunctionContextSet()).toBe(false);
    });

    it("Function context is initialised and label values are updated", () => {
        lambdaInstance.setFunctionName("OrderProcessor");
        lambdaInstance.setFunctionVersion("1");
        expect(lambdaInstance.isFunctionContextSet()).toBe(true);
        expect(lambdaInstance.labelValues.function_name).toBe("OrderProcessor");
        expect(lambdaInstance.labelValues.job).toBe("OrderProcessor");
        expect(lambdaInstance.labelValues.version).toBe("1");
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
        expect(mockedCounter.prototype.inc).toHaveBeenCalledTimes(2);
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

    it("Gets Metrics as text", async () => {
        const mockedRegistry = mocked(Registry, true);
        const metricInstance = new LambdaInstanceMetrics();
        metricInstance.setFunctionName("mock-function");
        metricInstance.setFunctionVersion("1");
        mockedRegistry.prototype.metrics.mockImplementation(async () => {
            return "metrics-text";
        });
        let result = await metricInstance.getAllMetricsAsText();
        expect(result).toBe("metrics-text");
    })
});
