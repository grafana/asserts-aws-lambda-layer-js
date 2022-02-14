npm test
npm pack
mkdir -p build/LAYER/nodejs
cp package-for-layer-build.json build/LAYER/nodejs/package.json
cd build/LAYER/nodejs
npm install
rm package.json
cd ..
zip -r asserts-aws-lambda-layer-js-$VERSION.zip nodejs
mv asserts-aws-lambda-layer-js-$VERSION.zip ../..
cd ../..
rm -fR build
