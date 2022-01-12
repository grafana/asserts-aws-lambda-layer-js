import {DynamicPatcher} from "./src/lib/DynamicPatcher";
import {RemoteWriter} from "./src/lib/RemoteWriter";

const patcher: DynamicPatcher = new DynamicPatcher();
// Trigger initialisation of the remote writer
const remoteWriter: RemoteWriter = RemoteWriter.getSingleton();
patcher.patchHandler();
