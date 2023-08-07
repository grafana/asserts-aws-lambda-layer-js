#! /bin/sh

COMMIT_HASH="$(git rev-parse --short HEAD)"
export COMMIT_HASH

COMMIT_FULL_HASH="$(git rev-parse HEAD)"
export COMMIT_FULL_HASH

sed -i '' "s/latest/$COMMIT_HASH/g" package.json
sed -i '' "s/__layer_version__/$COMMIT_FULL_HASH/g" lib/LambdaInstanceMetrics.ts
sed -i '' "s/__layer_version__/$COMMIT_FULL_HASH/g" tests/unit/LambdaInstanceMetric.test.ts
npm run clean-all && npm install && tsc && npm test && npm pack && npm run build-layer
sed -i '' "s/$COMMIT_HASH/latest/g" package.json
sed -i '' "s/$COMMIT_FULL_HASH/__layer_version__/g" lib/LambdaInstanceMetrics.ts
sed -i '' "s/$COMMIT_FULL_HASH/__layer_version__/g" tests/unit/LambdaInstanceMetric.test.ts

aws s3 cp "asserts-aws-lambda-layer-js-$COMMIT_HASH.zip" s3://asserts-lambda-layers

LAYER_VERSION=$(aws lambda publish-layer-version --no-paginate --no-cli-pager --output json --layer-name asserts-aws-lambda-layer-js \
  --description "Asserts AWS Lambda Layer for NodeJS created from asserts-aws-lambda-layer-js-$COMMIT_HASH" \
  --compatible-runtimes "nodejs18.x" "nodejs16.x" "nodejs14.x" "nodejs12.x" \
  --content "S3Bucket=asserts-lambda-layers,S3Key=asserts-aws-lambda-layer-js-$COMMIT_HASH.zip" | jq '.Version')
export LAYER_VERSION

aws lambda add-layer-version-permission --no-paginate --no-cli-pager --layer-name asserts-aws-lambda-layer-js \
  --statement-id ReadPublic --action lambda:GetLayerVersion  --principal "*" --version-number "${LAYER_VERSION}" --output json