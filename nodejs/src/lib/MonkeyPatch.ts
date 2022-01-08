import {Handler} from "aws-lambda";
import {basename, resolve} from "path";
import {existsSync} from "fs";
import {wrapHandler} from "./HandlerWrapper";

/** */
export function tryPatchHandler(taskRoot: string, handlerPath: string): void {
    type HandlerBag = HandlerModule | Handler | null | undefined;

    interface HandlerModule {
        [key: string]: HandlerBag;
    }

    const handlerDesc = basename(handlerPath);
    const match = handlerDesc.match(/^([^.]*)\.(.*)$/);
    if (!match) {
        console.error(`Bad handler ${handlerDesc}`);
        return;
    }

    const [, handlerMod, handlerName] = match;

    let obj: HandlerBag;
    try {
        const handlerDir = handlerPath.substring(0, handlerPath.indexOf(handlerDesc));
        obj = tryRequire(taskRoot, handlerDir, handlerMod);
    } catch (e) {
        console.error(`Cannot require ${handlerPath} in ${taskRoot}`, e);
        return;
    }

    let mod: HandlerBag;
    let functionName: string | undefined;
    handlerName.split('.').forEach(name => {
        mod = obj;
        obj = obj && (obj as HandlerModule)[name];
        functionName = name;
    });
    if (!obj) {
        console.error(`${handlerPath} is undefined or not exported`);
        return;
    }
    if (typeof obj !== 'function') {
        console.error(`${handlerPath} is not a function`);
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (mod as HandlerModule)[functionName!] = wrapHandler(obj as Handler);
}

/** */
function tryRequire<T>(taskRoot: string, subdir: string, mod: string): T {
    const lambdaStylePath = resolve(taskRoot, subdir, mod);
    if (existsSync(lambdaStylePath) || existsSync(`${lambdaStylePath}.js`)) {
        // Lambda-style path
        return require(lambdaStylePath);
    }
    // Node-style path
    return require(require.resolve(mod, {paths: [taskRoot, subdir]}));
}