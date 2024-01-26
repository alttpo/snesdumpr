"use strict";

import {GrpcWebFetchTransport} from "@protobuf-ts/grpcweb-transport";

import {
    AddressSpace,
    DetectMemoryMappingRequest,
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

class Capture {
    header: Uint8Array; // ROM header from FFB0..FFFF
    wram: Uint8Array;
    sram: Uint8Array | null;

    constructor() {
        this.header = new Uint8Array(0x10000 - 0xFFB0);
        this.wram = new Uint8Array( 0x20000);
        this.sram = null;
    }

    sramSize() {
        let sramSize = this.header[0xFFD8 - 0xFFB0];
        if (sramSize > 8) {
            // unlikely a valid value:
            return 0;
        }
        // amount of SRAM data in bytes:
        return 1024 << sramSize;
    }

    reset() {
        this.header.fill(0);
        this.wram.fill(0);
        this.sram = null;
    }
}

// list all devices:
document.addEventListener('DOMContentLoaded', function () {
    let uri = '';
    let capture = new Capture();

    let lstDevices = document.getElementById('lstDevices');
    let btnCapture = document.getElementById('btnCapture');

    // enable/disable Capture button depending on selected device:
    lstDevices.addEventListener('change', function (this: HTMLSelectElement) {
        if (this.selectedIndex != 0) {
            uri = this.selectedOptions[0].value;
            btnCapture.removeAttribute('disabled');
        } else {
            uri = '';
            btnCapture.setAttribute('disabled', 'disabled');
        }
    });

    // click Capture button:
    btnCapture.addEventListener('click', async function () {
        if (uri === '') return;

        capture.reset();

        // let SNI detect the memory mapping:
        let drsp;
        try {
            drsp = await memoryClient.mappingDetect(DetectMemoryMappingRequest.create({
                uri: uri,
                fallbackMemoryMapping: MemoryMapping.LoROM,
            }));
        } catch (err) {
            console.warn("detect failed:", err);
            return;
        }

        // read the ROM header:
        console.log("read ROM header:");
        let rsp;
        try {
            rsp = await memoryClient.singleRead(SingleReadMemoryRequest.create({
                uri: uri,
                request: ReadMemoryRequest.create({
                    requestAddressSpace: AddressSpace.SnesABus,
                    requestMemoryMapping: drsp.response.memoryMapping,
                    requestAddress: 0x00FFB0,
                    size: 0x50
                })
            }));
        } catch (err) {
            console.warn("read failed:", err);
            return;
        }

        console.log("read ROM header complete:");
        let mrsp = rsp.response.response;
        if (!mrsp) return;

        console.log(mrsp.data);
        capture.header.set(mrsp.data);

        // read all of WRAM:
        console.log("read WRAM");
        try {
            rsp = await memoryClient.singleRead(SingleReadMemoryRequest.create({
                uri: uri,
                request: ReadMemoryRequest.create({
                    requestAddressSpace: AddressSpace.FxPakPro,
                    requestMemoryMapping: MemoryMapping.Unknown,
                    requestAddress: 0xF50000,
                    size: 0x020000
                })
            }));
        } catch (err) {
            console.warn("read failed:", err);
            return;
        }

        console.log("read WRAM complete:");
        mrsp = rsp.response.response;
        if (!mrsp) return;

        console.log(mrsp.data);
        capture.wram.set(mrsp.data);

        const sramSize = capture.sramSize();
        if (sramSize > 0) {
            console.log("read SRAM " + sramSize + " bytes");
            try {
                rsp = await memoryClient.singleRead(SingleReadMemoryRequest.create({
                    uri: uri,
                    request: ReadMemoryRequest.create({
                        requestAddressSpace: AddressSpace.FxPakPro,
                        requestMemoryMapping: MemoryMapping.Unknown,
                        requestAddress: 0xE00000,
                        size: sramSize
                    })
                }));
            } catch (err) {
                console.warn("read failed:", err);
                return;
            }

            console.log("read SRAM complete:");
            mrsp = rsp.response.response;
            if (!mrsp) return;

            console.log(mrsp.data);
            capture.sram = mrsp.data;
        }

        // ship off to /save endpoint:
        let formData = new FormData();
        formData.append("section", new Blob([capture.header]), "header");
        formData.append("section", new Blob([capture.wram]), "wram");
        if (capture.sram) {
            formData.append("section", new Blob([capture.sram]), "sram");
        }

        let wrsp;
        try {
            wrsp = await fetch("/save", {
                method: "POST",
                body: formData
            });
        } catch (err) {
            console.warn("error POSTing to /save: ", err);
            return;
        }

        if (wrsp.status >= 300) {

        }
    });

    // load list of devices on a recurring basis:
    {
        let lastDeviceUris: string[] = ['garbage'];
        const onfulfilled = (devices: FinishedUnaryCall<DevicesRequest, DevicesResponse>) => {
            let devs = devices.response.devices;
            // console.log(JSON.stringify(devs));

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
                console.log(JSON.stringify(devs));
                // update the dropdown list:
                let opts: Node[] = [];
                {
                    const el = document.createElement('option');
                    el.text = `-- Select a SNES Device --`;
                    el.value = '';
                    opts.push(el);
                }
                for (let i = 0; i < devs.length; i++) {
                    const d = devs[i];
                    const el = document.createElement('option');
                    el.text = `${d.kind}: ${d.displayName}`;
                    el.value = d.uri;
                    opts.push(el);
                }
                lstDevices.replaceChildren(...opts);
                lastDeviceUris = nextDeviceUris;
            }
        };
        const onrejected = (reason: any) => {
            let opts: Node[] = [];
            {
                const el = document.createElement('option');
                el.text = `SNI is required to use this tool`;
                el.value = '';
                opts.push(el);
            }
            lstDevices.replaceChildren(...opts);
            console.log(reason);
        };

        // continually fetch devices:
        setInterval(
            () => {
                return devicesClient.listDevices(DevicesRequest.create())
                    .then(onfulfilled, onrejected);
            },
            2000
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
