'use strict';
import {collectDefaultMetrics, Gauge, register as globalRegister} from 'prom-client';
import {hostname} from 'os';

collectDefaultMetrics({
    gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5, 10], // These are the default buckets.
});

export class LambdaInstanceMetrics {
    // asserts_env will be optionally sent if configured so in the environment variable
    labelNames: string[] = [
        'account_id', 'asserts_env', 'asserts_site', 'asserts_source', 'asserts_tenant',
        'function_name', 'instance', 'job', 'namespace', 'region',
        'tenant', 'version'];
    coldStart: Gauge<string>;
    debugEnabled: boolean = false;
    labelValues: {
        account_id?: string;
        region: string;
        job?: string;
        function_name?: string;
        version?: string;
        instance: string;
        namespace: string;
        asserts_source: string;
        asserts_tenant?: string;
        tenant?: string;
        asserts_site?: string | undefined;
        asserts_env?: string | undefined;
    };

    private static singleton: LambdaInstanceMetrics = new LambdaInstanceMetrics();

    constructor() {
        this.coldStart = new Gauge({
            name: 'aws_lambda_cold_start',
            help: `AWS Lambda Cold Start`,
            registers: [globalRegister],
            labelNames: this.labelNames
        });
        globalRegister.registerMetric(this.coldStart);

        this.labelValues = {
            region: (process.env['AWS_REGION'] as string),
            namespace: "AWS/Lambda",
            instance: hostname() + ":" + process.pid,
            asserts_source: 'prom-client'
        };
        this.labelValues.function_name = process.env["AWS_LAMBDA_FUNCTION_NAME"];
        this.labelValues.job = process.env["AWS_LAMBDA_FUNCTION_NAME"];
        this.labelValues.version = process.env["AWS_LAMBDA_FUNCTION_VERSION"];

        if (process.env["DEBUG"] && process.env["DEBUG"] === 'true') {
            this.debugEnabled = true;
        }

        if (process.env["ASSERTS_SITE"]) {
            this.labelValues.asserts_site = process.env["ASSERTS_SITE"];
        } else {
            this.labelValues.asserts_site = this.labelValues.region;
        }

        if (process.env["ACCOUNT_ID"]) {
            this.labelValues.account_id = process.env["ACCOUNT_ID"];
            this.labelValues.asserts_env = this.labelValues.account_id;
        }

        if (process.env["ASSERTS_ENVIRONMENT"]) {
            this.labelValues.asserts_env = process.env["ASSERTS_ENVIRONMENT"];
        }
    }

    static getSingleton(): LambdaInstanceMetrics {
        return LambdaInstanceMetrics.singleton;
    }

    setTenant(tenant: string): void {
        this.labelValues.asserts_tenant = tenant;
        this.labelValues.tenant = tenant;
    }

    recordLatency(latency: number): void {
    }

    recordError(): void {
    }

    recordInvocation(): void {
    }

    async getAllMetricsAsText() {
        if (this.isNameAndVersionSet()) {
            globalRegister.setDefaultLabels(this.labelValues);
            const metrics = await globalRegister.metrics();
            if (this.debugEnabled) {
                console.log("Gathered metrics:\n" + metrics);
            }
            return metrics;
        } else {
            return Promise.resolve(null);
        }
    }

    isNameAndVersionSet(): boolean {
        return !!(this.labelValues.job && this.labelValues.function_name && this.labelValues.version);
    }
}