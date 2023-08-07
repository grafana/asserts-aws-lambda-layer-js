import {LambdaInstanceMetrics} from "../../awslambda-auto";
import {Gauge, register as globalRegister, Registry} from "prom-client";
import {mocked} from "jest-mock";

jest.mock('prom-client');

describe("All Tests", () => {
    beforeEach(() => {
        process.env["AWS_LAMBDA_FUNCTION_MEMORY_SIZE"] = "128";
        process.env["AWS_LAMBDA_FUNCTION_NAME"] = "OrderProcessor";
        process.env["AWS_LAMBDA_FUNCTION_VERSION"] = "1";
        process.env['AWS_REGION'] = "us-west-2";
        process.env['ACCOUNT_ID'] = "123123123";
        process.env['DEBUG'] = 'true';
        process.env['OTEL_DEBUG_LEVEL'] = 'INFO';
        process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = "http://localhost:4318";
        jest.clearAllMocks();
    })

    it("Label names are initialised", () => {
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        expect(lambdaInstance.labelNames)
            .toStrictEqual([
                'account_id', 'asserts_env', 'asserts_site', 'asserts_source',
                'function_name', 'instance', 'job', 'namespace', 'region', 'version', 'runtime', 'layer_version']);
    });

    it("Label values are initialised", () => {
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        expect(lambdaInstance.labelValues).toBeTruthy();
        expect(lambdaInstance.labelValues.instance).toBeTruthy();
        expect(lambdaInstance.labelValues.account_id).toBe("123123123");
        expect(lambdaInstance.labelValues.region).toBe("us-west-2");
        expect(lambdaInstance.labelValues.namespace).toBe("AWS/Lambda");
        expect(lambdaInstance.labelValues.function_name).toBe("OrderProcessor")
        expect(lambdaInstance.labelValues.job).toBe("OrderProcessor")
        expect(lambdaInstance.labelValues.version).toBe("1");
        expect(lambdaInstance.labelValues.runtime).toBe('nodejs');
        expect(lambdaInstance.labelValues.layer_version).toBe('493e875527eb2b9bc7dd4a0446424083d40caa2e');
        expect(lambdaInstance.isNameAndVersionSet()).toBe(true);
        expect(lambdaInstance.labelValues.asserts_site).toBe('us-west-2');
        expect(lambdaInstance.labelValues.asserts_env).toBe('123123123');
    });

    it("Label values are initialised with environment", () => {
        process.env["ASSERTS_ENVIRONMENT"] = "dev";
        process.env["ASSERTS_SITE"] = "us-west-1";
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        expect(lambdaInstance.labelValues).toBeTruthy();
        expect(lambdaInstance.labelValues.account_id).toBe("123123123");
        expect(lambdaInstance.labelValues.region).toBe("us-west-2");
        expect(lambdaInstance.labelValues.instance).toBeTruthy();
        expect(lambdaInstance.labelValues.namespace).toBe("AWS/Lambda");
        expect(lambdaInstance.labelValues.function_name).toBe("OrderProcessor")
        expect(lambdaInstance.labelValues.job).toBe("OrderProcessor")
        expect(lambdaInstance.labelValues.version).toBe("1");
        expect(lambdaInstance.labelValues.runtime).toBe('nodejs');
        expect(lambdaInstance.labelValues.layer_version).toBe('493e875527eb2b9bc7dd4a0446424083d40caa2e');
        expect(lambdaInstance.isNameAndVersionSet()).toBe(true);
        expect(lambdaInstance.labelValues.asserts_env).toBe("dev");
        expect(lambdaInstance.labelValues.asserts_site).toBe("us-west-1");
    });

    it("Function context is not initialised yet", () => {
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        lambdaInstance.labelValues.job = undefined;
        lambdaInstance.labelValues.function_name = undefined;
        lambdaInstance.labelValues.version = undefined;
        expect(lambdaInstance.isNameAndVersionSet()).toBe(false);
    });

    it("Cold Start Gauge is initialized", () => {
        const lambdaInstance: LambdaInstanceMetrics = new LambdaInstanceMetrics();
        expect(Gauge).toBeCalledTimes(2);
        expect(Gauge).toHaveBeenCalledWith({
            name: 'aws_lambda_cold_start',
            help: `AWS Lambda Cold Start`,
            registers: [globalRegister],
            labelNames: lambdaInstance.labelNames
        });

        expect(Gauge).toHaveBeenCalledWith({
            name: 'aws_lambda_nodejs_layer_info',
            help: `AWS Lambda Layer Build Info`,
            registers: [globalRegister],
            labelNames: lambdaInstance.labelNames
        });
        expect(lambdaInstance.layerBuildInfo).toBeInstanceOf(Gauge);
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
