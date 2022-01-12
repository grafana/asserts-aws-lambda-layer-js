'use strict';
import {wrapHandler} from "./lib/HandlerWrapper";
import {RemoteWriter} from "./lib/RemoteWriter";

// Trigger initialisation of the remote writer
const remoteWriter: RemoteWriter = RemoteWriter.getSingleton();
export {wrapHandler};
