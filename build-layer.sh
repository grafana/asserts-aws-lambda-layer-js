set -x
sed -iE "s/VERSION/$VERSION/g" package.json
tsc
rm tests/unit/*.js
npm test
sed "s/VERSION/$VERSION/g" package-for-layer-build-template.json > package-for-layer-build.json
npm pack
mkdir -p build/LAYER/nodejs
cp package-for-layer-build.json build/LAYER/nodejs/package.json
cd build/LAYER/nodejs || exit
npm install
rm package.json
cd ..
zip -r asserts-aws-lambda-layer-js-$VERSION.zip nodejs
mv asserts-aws-lambda-layer-js-$VERSION.zip ../..
cd ../..
rm -fR build
rm asserts-aws-lambda-layer-*.tgz
#sed -iE "s/$VERSION/VERSION/g" package.json
