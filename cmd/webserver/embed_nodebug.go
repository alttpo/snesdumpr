//go:build !debug

package main

import "embed"

//go:embed templates/*
var templatesFS embed.FS
