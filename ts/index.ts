"use strict";

import 'htmx.org';

import {GrpcWebFetchTransport} from "@protobuf-ts/grpcweb-transport";
import {FinishedUnaryCall} from "@protobuf-ts/runtime-rpc/build/types/unary-call";
import {DeviceMemoryClient, DevicesClient} from './sni/sni.client';
import {
    AddressSpace,
    DetectMemoryMappingRequest,
    DevicesRequest,
    DevicesResponse,
    MemoryMapping,
    ReadMemoryRequest,
    SingleReadMemoryRequest
} from './sni/sni';

function setupTransport(baseUrl: string = 'http://localhost:8190') {
    return new GrpcWebFetchTransport({baseUrl})
}

const devicesClient = new DevicesClient(setupTransport());
const memoryClient = new DeviceMemoryClient(setupTransport());

let uri = '';

// parses a compact (no whitespace) hex string into a Uint8Array, e.g. '5AA5' -> Uint8Array([0x5A,0xA5])
function parseHexStr(x: string): Uint8Array {
    let len = x.length;
    if ((len & 1) != 0) {
        throw 'hex string must be even length';
    }

    let a = new Uint8Array(len / 2);
    let j = 0;
    for (let i = 0; i < len; i += 2, j++) {
        a[j] = parseInt(x.substring(i, i + 2), 16);
    }
    return a;
}

class Capture {
    header: Uint8Array; // ROM header from FFB0..FFFF
    wram: Uint8Array;
    sram: Uint8Array | null;

    constructor() {
        this.header = new Uint8Array(0x10000 - 0xFFB0);
        this.wram = new Uint8Array(0x20000);
        this.sram = null;
    }

    reset() {
        this.header.fill(0);
        this.wram.fill(0);
        this.sram = null;
    }

    withHexStrings(newHeaderHex: string, newWramHex: string, newSramHex: string | null) {
        this.header = parseHexStr(newHeaderHex);
        this.wram = parseHexStr(newWramHex);
        if (newSramHex) {
            this.sram = parseHexStr(newSramHex);
        } else {
            this.sram = null;
        }
        return this;
    }

    async captureHeader() {
        // let SNI detect the memory mapping:
        let drsp;
        try {
            drsp = await memoryClient.mappingDetect(DetectMemoryMappingRequest.create({
                uri: uri,
                fallbackMemoryMapping: MemoryMapping.LoROM,
            }));
        } catch (err) {
            console.log(err);
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
        this.header.set(mrsp.data);
    }

    sramSize() {
        let sramSize = this.header[0xFFD8 - 0xFFB0];
        if (sramSize > 8) {
            // unlikely a valid value beyond 256KiB:
            return 0;
        }
        // amount of SRAM data in bytes:
        return 1024 << sramSize;
    }

    async captureWram() {
        // read all of WRAM:
        console.log("read WRAM");
        let rsp;
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
        let mrsp = rsp.response.response;
        if (!mrsp) return;

        console.log(mrsp.data);
        this.wram.set(mrsp.data);
    }

    async captureSram() {
        const sramSize = this.sramSize();
        if (sramSize <= 0) {
            return;
        }

        console.log("read SRAM " + sramSize + " bytes");
        let rsp;
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

        let mrsp = rsp.response.response;
        if (!mrsp) return;

        console.log(mrsp.data);
        this.sram = mrsp.data;
    }

    setFileContentsTo(el : HTMLElement | null) {
        if (!el) throw 'el must not be null';
        if (!(el instanceof HTMLInputElement)) throw 'el must be instanceof HTMLInputElement';

        // assign fetched Blobs as files to a <input type="file"> element:
        let section = el as HTMLInputElement;

        let dt = new DataTransfer();
        dt.items.add(new File([this.header], "header", {type: "application/octet-stream"}));
        dt.items.add(new File([this.wram], "wram", {type: "application/octet-stream"}));
        if (this.sram) {
            dt.items.add(new File([this.sram], "sram", {type: "application/octet-stream"}));
        }
        // @ts-ignore
        section.files = dt.files;
    }
}

// global to survive htmx
window.snesCapture = new Capture();
window.lastDeviceUris = ['garbage'];

function loadDeviceList() {
    devicesClient.listDevices(DevicesRequest.create()).then(
        (devices: FinishedUnaryCall<DevicesRequest, DevicesResponse>) => {
            let lastDeviceUris: string[] = window.lastDeviceUris;

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
                // console.log(JSON.stringify(devs));
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
                document.getElementById('lstDevices')?.replaceChildren(...opts);
                window.lastDeviceUris = nextDeviceUris;
            }
        },
        (reason: any) => {
            let opts: Node[] = [];
            {
                const el = document.createElement('option');
                el.text = `SNI is required to use this tool`;
                el.value = '';
                opts.push(el);
            }
            document.getElementById('lstDevices')?.replaceChildren(...opts);
            console.log(reason);
        }
    );
}

function bodySwapped() {
    // enable/disable Capture button depending on selected device:
    document.getElementById('lstDevices')?.addEventListener('change', function (this: HTMLSelectElement) {
        let btnCapture = document.getElementById('btnCapture');
        if (!btnCapture) {
            console.error("could not find #btnCapture");
            return;
        }
        if (this.selectedIndex != 0) {
            uri = this.selectedOptions[0].value;
            btnCapture.removeAttribute('disabled');
        } else {
            uri = '';
            btnCapture.setAttribute('disabled', 'disabled');
        }
    });

    // click Capture button:
    document.getElementById('btnCapture')?.addEventListener('click', async function () {
        if (uri === '') return;

        let capture: Capture = window.snesCapture;

        capture.reset();
        await capture.captureHeader();
        await capture.captureWram();
        await capture.captureSram();

        capture.setFileContentsTo(document.getElementById("section"));
    });

    document.getElementById('btnListDevices')?.addEventListener('click', loadDeviceList);

    // load list of devices on startup:
    setTimeout(loadDeviceList, 0);

    // if we're on a results page, make sure the captured data goes into the <input type="file">:
    window.snesCapture.setFileContentsTo(document.getElementById('section'));
}

document.addEventListener('DOMContentLoaded', bodySwapped);
document.addEventListener('htmx:afterSettle', function(evt) {
    if (evt.detail.successful != true) {
        /* Notify of an unexpected error, & print error to console */
        alert("Unexpected Error");
        return console.error(evt);
    }

    bodySwapped();
});
