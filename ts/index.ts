"use strict";

import 'htmx.org';

import {HexViewer} from './hex-viewer';
import './download-icon';

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
    SingleReadMemoryRequest, SingleReadMemoryResponse,
    SingleWriteMemoryRequest,
    WriteMemoryRequest
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
    hash: string;
    header: Uint8Array; // ROM header from FFB0..FFFF
    wram: Uint8Array;
    sram: Uint8Array | null;

    constructor() {
        this.hash = '';
        this.header = new Uint8Array(0);
        this.wram = new Uint8Array(0);
        this.sram = null;
    }

    reset() {
        this.hash = '';
        this.header = new Uint8Array(0);
        this.wram = new Uint8Array(0);
        this.sram = null;
    }

    // noinspection JSUnusedGlobalSymbols
    withHexStrings(hash: string, newHeaderHex: string, newWramHex: string, newSramHex: string | null) {
        this.hash = hash;
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

        // console.log(mrsp.data);
        this.header = mrsp.data;
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

        // console.log(mrsp.data);
        this.wram = mrsp.data;
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

        // console.log(mrsp.data);
        this.sram = mrsp.data;
    }

    setFileContentsTo(el: HTMLElement | null) {
        if (!el) return;
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

function viewResults() {
    let capture: Capture = window.snesCapture;
    if (capture.header.length == 0) {
        // no results to show
        document.getElementById('vwResults')?.setAttribute('hidden', 'hidden');
        return;
    }

    capture.setFileContentsTo(document.getElementById('section'));

    let el : HTMLElement | null;
    el = document.getElementById('viewerHeader');
    if (el) {
        let viewer = el as HexViewer
        viewer.displayTitle = "ROM Header";
        viewer.filename = capture.hash + ".header.bin";
        viewer.address = 0xFFB0;
        viewer.rows = 5;
        viewer.data = capture.header;
    }

    el = document.getElementById('viewerSram');
    if (el) {
        let viewer = el as HexViewer;
        viewer.displayTitle = "SRAM";
        viewer.filename = capture.hash + ".sram.bin";
        viewer.address = 0;
        viewer.rows = 16;
        if (capture.sram) {
            viewer.data = capture.sram;
        } else {
            viewer.data = new Uint8Array(0);
        }
    }

    el = document.getElementById('viewerWram');
    if (el) {
        let viewer = el as HexViewer;
        viewer.displayTitle = "WRAM";
        viewer.filename = capture.hash + ".wram.bin";
        viewer.address = 0;
        viewer.rows = 16;
        viewer.data = capture.wram;
    }

    // reveal the results div:
    document.getElementById('vwResults')?.removeAttribute('hidden');
}

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
                el.text = `SNI is required to capture SNES State`;
                el.value = '';
                opts.push(el);
            }
            document.getElementById('lstDevices')?.replaceChildren(...opts);
            console.log(reason);
        }
    );
}

function bodySwapped() {
    // disable share button by default:
    document.getElementById('btnShare')?.setAttribute('disabled', 'disabled');

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

        let doPause = !!(document.getElementById('chkPause') as HTMLInputElement)?.checked;
        if (doPause) {
            try {
                await memoryClient.singleWrite(SingleWriteMemoryRequest.create({
                    uri: uri,
                    request: WriteMemoryRequest.create({
                        requestMemoryMapping: MemoryMapping.Unknown,
                        requestAddressSpace: AddressSpace.FxPakPro,
                        // addresses beyond 0x100_0000 maps to the fxpak CMD space; this will likely error for
                        // non-fxpak-compatible devices
                        requestAddress: 0x100_0000 + 0x2C00,
                        data: new Uint8Array([
                            0x78,                   // sei
                            0xe2, 0x30,             // sep   #$30
                            0x48,                   // pha
                            // read NMI status to clear it:
                            0xad, 0x10, 0x42,       // lda.w $4210
                            0x80, 0x02,             // bra   check_paused
                            // paused_state:
                            0x00, 0x00,
                            // check_paused:
                            0xad, 0x0a, 0x2c,       // lda.w $2c0a
                            0xf0, 0x02,             // beq   loop_init
                            0x68,                   // pla
                            0x40,                   // rti
                            // loop_init:
                            0xa9, 0xea,             // lda.b #$ea
                            0x8d, 0x0a, 0x2c,       // sta.w $2c0a
                            // loop:
                            // loop until external non-zero write to $2C09
                            0xad, 0x09, 0x2c,       // lda.w $2c09
                            0xf0, 0xfb,             // beq   loop
                            // disable NMI override:
                            0x9c, 0x00, 0x2c,       // stz.w $2c00
                            0x68,                   // pla
                            // jump to original NMI:
                            0x6c, 0xea, 0xff        // jmp   ($ffea)
                        ])
                    })
                }));
            } catch (e) {
                console.error(e);
                // pause functionality likely unavailable:
                doPause = false;
            }
        }

        if (doPause) {
            // wait until paused:
            let r: FinishedUnaryCall<SingleReadMemoryRequest, SingleReadMemoryResponse>;
            do {
                r = await memoryClient.singleRead(SingleReadMemoryRequest.create({
                    uri: uri,
                    request: ReadMemoryRequest.create({
                        requestMemoryMapping: MemoryMapping.Unknown,
                        requestAddressSpace: AddressSpace.FxPakPro,
                        requestAddress: 0x100_0000 + 0x2C00,
                        size: 1
                    })
                }));
            } while (r.response.response?.data[0] == 0);
        }

        await capture.captureHeader();
        await capture.captureWram();
        await capture.captureSram();

        if (doPause) {
            // unpause:
            await memoryClient.singleWrite(SingleWriteMemoryRequest.create({
                uri: uri,
                request: WriteMemoryRequest.create({
                    requestMemoryMapping: MemoryMapping.Unknown,
                    requestAddressSpace: AddressSpace.FxPakPro,
                    requestAddress: 0x100_0000 + 0x2C09,
                    data: new Uint8Array([
                        0xEA,
                    ])
                })
            }));

            // wait until unpaused:
            let r: FinishedUnaryCall<SingleReadMemoryRequest, SingleReadMemoryResponse>;
            do {
                r = await memoryClient.singleRead(SingleReadMemoryRequest.create({
                    uri: uri,
                    request: ReadMemoryRequest.create({
                        requestMemoryMapping: MemoryMapping.Unknown,
                        requestAddressSpace: AddressSpace.FxPakPro,
                        requestAddress: 0x100_0000 + 0x2C00,
                        size: 1
                    })
                }));
            } while (r.response.response?.data[0] != 0);
        }

        // enable share button:
        document.getElementById('btnShare')?.removeAttribute('disabled');

        viewResults();
    });

    document.getElementById('btnListDevices')?.addEventListener('click', loadDeviceList);

    document.getElementById('btnCopyLink')?.addEventListener('click', function () {
        // Copy the text inside the text field
        const link = (document.getElementById('hrefSelf') as HTMLAnchorElement).href;
        void navigator.clipboard.writeText(link);
    });

    // load list of devices on startup:
    setTimeout(loadDeviceList, 0);

    // if we're on a results page, make sure the captured data goes into the <input type="file">:
    viewResults();
}

document.addEventListener('DOMContentLoaded', bodySwapped);
document.addEventListener('htmx:afterSettle', function (evt) {
    if (evt.detail.successful != true) {
        /* Notify of an unexpected error, & print error to console */
        alert("Unexpected Error");
        return console.error(evt);
    }

    bodySwapped();
});
