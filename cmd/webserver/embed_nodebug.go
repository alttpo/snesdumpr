//go:build !debug

package main

import (
	"embed"
	"github.com/gin-gonic/gin"
	"html/template"
	"io/fs"
	"net/http"
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

//go:embed dist
var distFS embed.FS

func SetupStaticAssets(router *gin.Engine) {
	var err error

	{
		var jsFS fs.FS = distFS
		if jsFS, err = fs.Sub(distFS, "dist/js"); err != nil {
			panic(err)
		}
		router.StaticFS("/js/", http.FS(jsFS))
	}

	{
		var cssFS fs.FS
		if cssFS, err = fs.Sub(distFS, "dist/css"); err != nil {
			panic(err)
		}
		router.StaticFS("/css/", http.FS(cssFS))
	}
}
