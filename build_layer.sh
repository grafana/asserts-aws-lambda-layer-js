#! /bin/sh
npm run clean-all && npm install && tsc && npm test && npm pack && npm run build-layer
ls -