'use strict';
import {wrapHandler} from "./lib/HandlerWrapper";
import {DynamicPatcher} from "./lib/DynamicPatcher";
import {RemoteWriter} from "./lib/RemoteWriter";

let remoteWriter: RemoteWriter;
remoteWriter = RemoteWriter.getSingleton();

const patcher: DynamicPatcher = new DynamicPatcher();
patcher.patchDynamicallyIfEnabled();
module.exports = {
    wrapHandler
};
