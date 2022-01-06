import {collectDefaultMetrics, Counter, Gauge, Histogram, register as globalRegister} from 'prom-client';
import { hostname } from 'os';

let labelNames = ['job', 'function_name', 'version', 'instance', 'namespace'];
collectDefaultMetrics({
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5], // These are the default buckets.
});

export class LambdaInstanceMetrics {
    invocations: Counter<string>;
    errors: Counter<string>;
    up: Gauge<string>;
    latency: Histogram<string>;
    labelValues: {
        job?: string;
        function_name?: string;
        version?: string;
        instance?: string;
        namespace?: string;
    };

    constructor() {
        this.up = new Gauge({
            name: 'up',
            help: `Heartbeat metric`,
            registers: [globalRegister],
            labelNames: labelNames
        });
        globalRegister.registerMetric(this.up);

        this.invocations = new Counter({
            name: 'aws_lambda_invocations_total',
            help: `AWS Lambda Invocations Count`,
            registers: [globalRegister],
            labelNames: labelNames
        });
        globalRegister.registerMetric(this.invocations);

        this.errors = new Counter({
            name: 'aws_lambda_errors_total',
            help: `AWS Lambda Errors Count`,
            registers: [globalRegister],
            labelNames: labelNames
        });
        globalRegister.registerMetric(this.errors);

        this.latency = new Histogram({
            name: 'aws_lambda_duration_seconds',
            help: `AWS Lambda Duration Histogram`,
            registers: [globalRegister],
            labelNames: labelNames
        });
        globalRegister.registerMetric(this.latency);

        this.labelValues = {
            namespace: "AWS/Lambda",
            instance: hostname()
        };

    }

    isFunctionContextSet() : boolean {
        if(this.labelValues.function_name && this.labelValues.version) {
            return true;
        }
        return false;
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
        if (this.isNameAndVersionKnown()) {
            globalRegister.setDefaultLabels(this.labelValues);
            return await globalRegister.metrics();
        } else {
            let _func = async (): Promise<string> => {
                return '';
            };
            return _func();
        }
    }

    isNameAndVersionKnown(): boolean {
        return !!(this.labelValues.job && this.labelValues.function_name && this.labelValues.version);
    }
}