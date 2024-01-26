"use strict";

import {GrpcWebFetchTransport} from "@protobuf-ts/grpcweb-transport";

import {DevicesRequest} from './sni/sni';
import {DevicesClient} from './sni/sni.client';

function setupTransport(baseUrl: string = 'http://localhost:8190') {
    return new GrpcWebFetchTransport({baseUrl})
}

const transport = setupTransport();

const devices = new DevicesClient(transport);

const devs = devices.listDevices(DevicesRequest.create());
devs.then(
    value => {
        console.log(value.response.devices);
    },
    reason => {
        console.log(reason);
    }
);
