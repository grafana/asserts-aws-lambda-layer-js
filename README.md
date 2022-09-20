# asserts-aws-lambda-layer-js

AWS Lambda layer to capture NodeJS runtime metrics from a NodeJS AWS Lambda function. The layer
uses [prom-client](https://github.com/siimon/prom-client) to capture the metrics and forwards them to a configured end
point through a `https` `POST` method on api `/api/v1/import/prometheus`. The metrics are sent in prometheus text format

# Programmatic instrumentation

If your Lambda code is written in TypeScript, you can include it in the `devDependencies` of your project as follows

```
"devDependencies": {
  "asserts-aws-lambda-layer": "1"
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

The following environment variables will have to be defined regardless of whether you use programmatic or automatic
instrumentation

|Variable name| Description|
|-------------|------------|
|`ASSERTS_METRICSTORE_HOST`|An endpoint which can receive the `POST` method call on api `/api/v1/import/prometheus`. This can either be an asserts cloud endpoint or an end point exposed on the EC2 or ECS instance where [Asserts AWS Exporter](https://app.gitbook.com/o/-Mih12_HEHZ0gGyaqQ0X/s/-Mih17ZSkwF7P2VxUo4u/quickstart-guide/setting-up-aws-serverless-monitoring) is deployed or [Victor Metrics](https://victoriametrics.com/) ingestion endpoint |
|`ASSERTS_METRICSTORE_PORT`|By default the metrics will be written to https on port `443`. To use `http`, just specify a different port number. For e.g. `80` |
|`ASSERTS_TENANT_NAME`|The tenant name in the Asserts Cloud where the metrics will be ingested |
|`ASSERTS_PASSWORD`|If the endpoint supports and expects Basic authorization the credentials can be configured here |
|`ASSERTS_LAYER_DISABLED`| If set to `true`, the layer will be disabled|
|`DEBUG`|If set to `true`, the layer will generate verbose debug logs. Debug logs are disabled by default|

# Exported Metrics

The default metrics collected by [prom-client](https://github.com/siimon/prom-client) are automatically exported.

To build the layer,

```
export VERSION=1
./build-layer.sh
ls -al asserts-aws-lambda-layer-js*
-rw-r--r--  1 radhakrishnanj  staff  13736954 Jan 14 13:18 asserts-aws-lambda-layer-js-1.zip
```

# Add layer to Lambda function

Assert has made this layer publicly available. To add the layer to a function `Sample-Function`, copy the 
`deployment/sample-config.yml` as `config.yml`. Specify the function name and other environment properties 
and run the `manage_asserts_layer` script. The layer ARN is already included in the script and will always point to 
the latest version of the layer.

```
# Supported operations are 'add-layer', 'remove-layer', 'update-version', 'update-env-variables', 'disable', 'enable'
operation: update-env-variables

# Layer arn needs to be specified for 'add' or 'update-version' operations
layer_arn: arn:aws:lambda:us-west-2:689200961921:layer:asserts-aws-lambda-layer-js:4

# ASSERTS_METRICSTORE_HOST is required for 'add-layer' operation
ASSERTS_METRICSTORE_HOST: chief.tsdb.dev.asserts.ai

# ASSERTS_METRICSTORE_PORT can optionally be specified to change from https to http by specifing a port different than 443
# ASSERTS_METRICSTORE_PORT=80

# ASSERTS_TENANT and ASSERTS_PASSWORD are optional
ASSERTS_TENANT_NAME: chief
ASSERTS_PASSWORD: <SPECIFY-THE-PASSWORD-HERE>

# Functions can be specified either through a regex pattern or through a list of function names
# function_name_pattern: Sample.+
function_names:
  - Sample-Function
```

```
python manage_asserts_layer.py
```










