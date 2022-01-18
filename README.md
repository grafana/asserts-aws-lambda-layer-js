# asserts-aws-lambda-layer-js

A AWS Lambda layer to capture NodeJS metrics from a NodeJS AWS Lambda function. The layer uses [prom-client](https://github.com/siimon/prom-client) to capture
NodeJS metrics and forwards them to a configured end point through a `https` `POST` method on api `/api/v1/import/prometheus`. The metrics are sent in 
prometheus text format

# Programmatic instrumentation

If your Lambda code is written in TypeScript, you can include it in the `devDependencies` of your project as follows

```
"devDependencies": {
  "asserts-aws-lambda-layer": "1.0.0"
}
```

In your Lambda Handler code
```
import {wrapHandler} from 'asserts-aws-lambda-layer';

exports.handler = wrapHandler(async (event, context) => {
  ...
}
```

# Automatic instrumentation without any code change
For automatic instrumentation, the following environment variable needs to be defined in your Lambda function

```
NODE_OPTIONS = -r asserts-aws-lambda-layer/awslambda-auto
```

# Environment variables for forwarding metrics to a prometheus end-point
The following environment variables will have to be defined regardless of whether you use programmatic or automatic instrumentation

|Variable name| Description|
|-------------|------------|
|`ASSERTS_CLOUD_HOST`|An endpoint which can receive the `POST` method call on api `/api/v1/import/prometheus`. This can either be an asserts cloud endpoint or an end point exposed on the EC2 or ECS instance where Asserts AWS Exporter is deployed |
|`ASSERTS_TENANT_NAME`|The tenant name in the Asserts Cloud where the metrics will be ingested |
|`ASSERTS_PASSWORD`|If the endpoint supports and expects Basic authorization the credentials can be configured here |

# Exported Metrics

The following metrics are exported by this SDK

|Metric Name|Metric Type|Description|
|-----------|------|-----|
|`aws_lambda_invocations_total`| `Counter` | The count of invocations on this Lambda instance |
|`aws_lambda_errors_total`| `Counter` | The count of invocations on this Lambda instance that resulted in an error |
|`aws_lambda_duration_seconds`| `Histogram` | A histogram of the duration of the invocations  |

In addition to the above metrics, the default metrics collected by [prom-client](https://github.com/siimon/prom-client) are also exported.

To build the layer,

```
git clone git@github.com:asserts/asserts-aws-lambda-layer-js.git
cd asserts-aws-lambda-layer
npm install tsc
npm install ts-node
npm install jest
npm install
rm tests/unit/*.js
npm test
npm pack
./build-layer.sh
ls -al asserts-sdk*
-rw-r--r--  1 radhakrishnanj  staff  13736954 Jan 14 13:18 asserts-sdk-1.0.0.zip
```






