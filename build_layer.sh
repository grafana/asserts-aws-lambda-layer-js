#! /bin/sh

COMMIT_HASH="$(git rev-parse --short HEAD)"
export COMMIT_HASH

sed -i '' "s/latest/$COMMIT_HASH/g" package.json
npm run clean-all && npm install && tsc && npm test && npm pack && npm run build-layer
sed -i '' "s/$COMMIT_HASH/latest/g" package.json

aws s3 cp "asserts-aws-lambda-layer-js-$COMMIT_HASH.zip" s3://asserts-lambda-layers

LAYER_VERSION=$(aws lambda publish-layer-version --output json --layer-name asserts-aws-lambda-layer-js \
  --description "Asserts AWS Lambda Layer for NodeJS created from asserts-aws-lambda-layer-js-$COMMIT_HASH" \
  --content "S3Bucket=asserts-lambda-layers,S3Key=asserts-aws-lambda-layer-js-$COMMIT_HASH.zip" | jq '.Version')
export LAYER_VERSION

aws lambda add-layer-version-permission --layer-name asserts-aws-lambda-layer-js \
  --statement-id ReadPublic --action lambda:GetLayerVersion  --principal "*" --version-number "${LAYER_VERSION}" --output json