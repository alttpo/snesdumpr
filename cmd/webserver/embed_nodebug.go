//go:build !debug

package main

import (
	"embed"
	"github.com/gin-gonic/gin"
	"html/template"
	"io/fs"
)

//go:embed templates
var templatesFS embed.FS

func WatchTemplateFolder(router *gin.Engine) {
	sfs, err := fs.Sub(templatesFS, "templates")
	if err != nil {
		panic(err)
	}

	// production || debug mode:
	templ := template.Must(template.New("").ParseFS(sfs, "*.html"))
	router.SetHTMLTemplate(templ)
}
