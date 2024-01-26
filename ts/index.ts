"use strict";

import {GrpcWebFetchTransport} from "@protobuf-ts/grpcweb-transport";

import {
    AddressSpace,
    DevicesRequest,
    DevicesResponse,
    MemoryMapping,
    ReadMemoryRequest,
    SingleReadMemoryRequest
} from './sni/sni';
import {DeviceMemoryClient, DevicesClient} from './sni/sni.client';
import {FinishedUnaryCall} from "@protobuf-ts/runtime-rpc/build/types/unary-call";

function setupTransport(baseUrl: string = 'http://localhost:8190') {
    return new GrpcWebFetchTransport({baseUrl})
}

const devicesClient = new DevicesClient(setupTransport());
const memoryClient = new DeviceMemoryClient(setupTransport());

// list all devices:
document.addEventListener('DOMContentLoaded', function () {
    let uri = '';
    let lstDevices = document.getElementById('lstDevices');
    let btnCapture = document.getElementById('btnCapture');

    // enable/disable Capture button depending on selected device:
    lstDevices.addEventListener('change', function (this: HTMLSelectElement, e:Event) {
        if (this.selectedIndex != 0) {
            uri = this.selectedOptions[0].value;
            btnCapture.removeAttribute('disabled');
        } else {
            uri = '';
            btnCapture.setAttribute('disabled', 'disabled');
        }
    });

    // click Capture button:
    btnCapture.addEventListener('click', function () {
        if (uri === '') return;

        // read all of WRAM:
        console.log("read WRAM");
        try {
            memoryClient.singleRead(SingleReadMemoryRequest.create({
                uri: uri,
                request: ReadMemoryRequest.create({
                    requestAddressSpace: AddressSpace.FxPakPro,
                    requestMemoryMapping: MemoryMapping.Unknown,
                    requestAddress: 0xF50000,
                    size: 0x020000
                })
            })).then(
                rsp => {
                    console.log("read WRAM complete:");
                    const mrsp = rsp.response.response;
                    console.log(mrsp?.data);
                },
                err => {
                    console.log("read WRAM failed:", err);
                }
            ).catch(reason => {
                console.log("read WRAM catch: ", reason);
            });
        } catch (ex) {
            console.log("catch: ", ex);
        }
    });

    // load list of devices on a recurring basis:
    {
        let lastDeviceUris: string[] = ['garbage'];
        const onfulfilled = (devices: FinishedUnaryCall<DevicesRequest, DevicesResponse>) => {
            let devs = devices.response.devices;
            console.log(JSON.stringify(devs));

            let nextDeviceUris: string[] = [];
            for (let i = 0; i < devs.length; i++) {
                nextDeviceUris.push(devs[i].uri);
            }

            let diff = false;
            if (lastDeviceUris.length == nextDeviceUris.length) {
                for (let i = 0; i < devs.length; i++) {
                    if (nextDeviceUris[i] !== lastDeviceUris[i]) {
                        diff = true;
                        break;
                    }
                }
            } else {
                diff = true;
            }

            if (diff) {
                // update the dropdown list:
                let opts: Node[] = [];
                {
                    const el = document.createElement('option');
                    el.text = `Select a SNES Device`;
                    el.value = '';
                    opts.push(el);
                }
                for (let i = 0; i < devs.length; i++) {
                    const d = devs[i];
                    const el = document.createElement('option');
                    el.text = `${d.kind} ${d.displayName}`;
                    el.value = d.uri;
                    opts.push(el);
                }
                lstDevices.replaceChildren(...opts);
                lastDeviceUris = nextDeviceUris;
            }
        };
        const onrejected = (reason: any) => {
            console.log(reason);
        };

        // continually fetch devices:
        setInterval(
            () => {
                return devicesClient.listDevices(DevicesRequest.create())
                    .then(onfulfilled, onrejected);
            },
            750
        );
        setTimeout(
            () => {
                return devicesClient.listDevices(DevicesRequest.create())
                    .then(onfulfilled, onrejected);
            },
            0
        );
    }
});
