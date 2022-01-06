import {LambdaInstanceMetrics} from './LambdaInstanceMetrics';
import {request} from 'https';

export class RemoteWriter {
    config: {
        remoteWriteURL: string;
        tenantName: string;
        password: string;
        remoteWriteConfigComplete: boolean;
    }
    lambdaInstance: LambdaInstanceMetrics;

    constructor(theMetrics: LambdaInstanceMetrics) {
        this.config = {
            remoteWriteURL: process.env["ASSERTS_REMOTE_WRITE_URL"] ? process.env["ASSERTS_REMOTE_WRITE_URL"] : "NONE",
            tenantName: process.env["ASSERTS_TENANT_NAME"] ? process.env["ASSERTS_TENANT_NAME"] : "NONE",
            password: process.env["ASSERTS_PASSWORD"] ? process.env["ASSERTS_PASSWORD"] : "NONE",
            remoteWriteConfigComplete: false
        };
        this.config.remoteWriteConfigComplete = this.config.remoteWriteURL != "NONE" &&
            this.config.tenantName != "NONE" && this.config.password != "NONE"
        this.lambdaInstance = theMetrics;
    }

    // This will have to be invoked once every 15 seconds. We should probably use the NodeJS Timer for this
    async pushMetrics() {
        if (this.config.remoteWriteConfigComplete) {
            let text = await this.lambdaInstance.getAllMetricsAsText();
            if (text !== '') {
                const options = {
                    hostname: this.config.remoteWriteURL,
                    port: 443,
                    path: '/api/v1/import/prometheus',
                    method: 'POST',
                    headers: {
                        'Authorization': 'Basic ' + Buffer.from(this.config.tenantName + ':' + this.config.password).toString('base64'),
                        'Content-Type': 'text/plain',
                        'Content-Length': text.length
                    }
                };

                const req = request(options, res => {
                    console.log(`POST Asserts Metric API statusCode: ${res.statusCode}`);

                    if (res.statusCode!.toString() === "400") {
                        console.log(res.toString());
                    }

                    res.on('data', d => {
                        process.stdout.write(d);
                    })
                })


                req.on('error', error => {
                    console.error('POST to Asserts Metric API resulted in an error: ' + error.toString());
                })

                req.write(text);
                req.end();
            } else {
                console.log("Function name not known yet");
            }
        } else {
            console.log("Asserts Cloud Remote Write Configuration in complete: \n", JSON.stringify(this.config));
        }
    }
}