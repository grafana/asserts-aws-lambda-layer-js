npm pack
mkdir -p build/LAYER/nodejs
cp package-for-layer-build.json build/LAYER/nodejs/package.json
cd build/LAYER/nodejs
npm install
rm package.json
cd ..
zip -r asserts-sdk-1.0.0.zip nodejs
mv asserts-sdk-1.0.0.zip ../..
cd ../..
rm -fR build