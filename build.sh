#!/usr/bin/env bash
npm run css
npm run build
go build -tags netgo -ldflags '-s -w' -o app ./cmd/webserver
