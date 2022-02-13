'use strict';
import {Handler} from "aws-lambda";
import {basename, resolve} from "path";
import {existsSync} from "fs";
import {wrapHandler} from "./HandlerWrapper";

export class DynamicPatcher {
    disabled: boolean;

    constructor() {
        this.disabled = process.env.ASSERTS_LAYER_DISABLED === 'true';
    }


    patchHandler() {
        console.log("Asserts Dynamic Handler Patching is enabled. Will try to patch handler dynamically");
        if (process.env.LAMBDA_TASK_ROOT && process.env.LAMBDA_TASK_ROOT !== "undefined") {
            if (process.env._HANDLER && process.env._HANDLER !== "undefined" && !this.disabled) {
                this.tryPatchHandler(process.env.LAMBDA_TASK_ROOT, process.env._HANDLER);
            } else {
                console.log(`LAMBDA_TASK_ROOT is non-empty(${process.env.LAMBDA_TASK_ROOT}) but _HANDLER is not set`);
            }
        } else {
            console.log('LAMBDA_TASK_ROOT environment variable is not set');
        }
    }

    tryPatchHandler(taskRoot: string, handlerPath: string): void {
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
            obj = this.tryRequire(taskRoot, handlerDir, handlerMod);
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
        console.log("Handler dynamically wrapped by Asserts");
    }

    /** */
    tryRequire<T>(taskRoot: string, subdir: string, mod: string): T {
        const lambdaStylePath = resolve(taskRoot, subdir, mod);
        if (existsSync(lambdaStylePath) || existsSync(`${lambdaStylePath}.js`)) {
            // Lambda-style path
            return require(lambdaStylePath);
        }
        // Node-style path
        return require(require.resolve(mod, {paths: [taskRoot, subdir]}));
    }
}