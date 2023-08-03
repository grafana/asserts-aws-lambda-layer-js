'use strict';
import {wrapHandler} from './lib/HandlerWrapper';
import {LambdaInstanceMetrics} from "./lib/LambdaInstanceMetrics";
import {RemoteWriter} from './lib/RemoteWriter';

LambdaInstanceMetrics.getSingleton();
RemoteWriter.getSingleton();

export {wrapHandler, LambdaInstanceMetrics, RemoteWriter};
