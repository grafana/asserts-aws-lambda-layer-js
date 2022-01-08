import {collectDefaultMetrics, Counter, Gauge, Histogram, register as globalRegister} from 'prom-client';
import {hostname} from 'os';

collectDefaultMetrics({
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // These are the default buckets.
});

export class LambdaInstanceMetrics {
    labelNames: string[] = ['asserts_source', 'function_name', 'instance', 'job', 'namespace', 'version'];
    invocations: Counter<string>;
    errors: Counter<string>;
    up: Gauge<string>;
    latency: Histogram<string>;
    labelValues: {
        job?: string;
        function_name?: string;
        version?: string;
        instance: string;
        namespace: string;
        asserts_source: string;
    };

    private static singleton: LambdaInstanceMetrics = new LambdaInstanceMetrics();

    constructor() {
        this.up = new Gauge({
            name: 'up',
            help: `Heartbeat metric`,
            registers: [globalRegister],
            labelNames: this.labelNames
        });
        globalRegister.registerMetric(this.up);

        this.invocations = new Counter({
            name: 'aws_lambda_invocations_total',
            help: `AWS Lambda Invocations Count`,
            registers: [globalRegister],
            labelNames: this.labelNames
        });
        globalRegister.registerMetric(this.invocations);

        this.errors = new Counter({
            name: 'aws_lambda_errors_total',
            help: `AWS Lambda Errors Count`,
            registers: [globalRegister],
            labelNames: this.labelNames
        });
        globalRegister.registerMetric(this.errors);

        this.latency = new Histogram({
            name: 'aws_lambda_duration_seconds',
            help: `AWS Lambda Duration Histogram`,
            registers: [globalRegister],
            labelNames: this.labelNames
        });
        globalRegister.registerMetric(this.latency);

        this.labelValues = {
            namespace: "AWS/Lambda",
            instance: hostname(),
            asserts_source: 'prom-client'
        };

    }

    static getSingleton(): LambdaInstanceMetrics {
        return this.singleton;
    }

    setFunctionName(name: string): void {
        this.labelValues.function_name = name;
        this.labelValues.job = name;
    }

    setFunctionVersion(version: string): void {
        this.labelValues.version = version;
    }

    recordLatency(latency: number): void {
        this.latency.observe(latency);
    }

    recordError(): void {
        this.errors.inc(1);
    }

    recordInvocation(): void {
        this.invocations.inc(1);
    }

    async getAllMetricsAsText() {
        if (this.isNameAndVersionSet()) {
            globalRegister.setDefaultLabels(this.labelValues);
            let text = await globalRegister.metrics();
            return text;
        } else {
            return Promise.resolve(null);
        }
    }

    isNameAndVersionSet(): boolean {
        return !!(this.labelValues.job && this.labelValues.function_name && this.labelValues.version);
    }
}