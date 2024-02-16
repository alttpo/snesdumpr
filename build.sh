#!/usr/bin/env bash
npm install
npm run css
npm run build
go build -tags netgo -ldflags '-s -w' -o app ./cmd/webserver
