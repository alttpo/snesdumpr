//go:build debug

package main

import "os"

var templatesFS = os.DirFS("templates")
