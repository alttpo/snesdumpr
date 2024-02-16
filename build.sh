#!/usr/bin/env bash
npm install
npm run grpc
npm run css
npm run ts
go build -tags netgo -ldflags '-s -w' -o app ./cmd/webserver
