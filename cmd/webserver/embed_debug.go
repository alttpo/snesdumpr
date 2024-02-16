//go:build debug

package main

import (
	"github.com/fsnotify/fsnotify"
	"github.com/gin-gonic/gin"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"os"
)

func WatchTemplateFolder(router *gin.Engine) {
	var err error

	const templatesPath = "cmd/webserver/templates"

	var templatesFS fs.FS
	templatesFS = os.DirFS(templatesPath)

	// Create new watcher.
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatal(err)
	}
	//defer watcher.Close()

	// Start listening for events.
	go func() {
		var err error
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				log.Println("event:", event)
				if event.Has(fsnotify.Write) {
					//log.Println("modified file:", event.Name)
					// file updated:
					var templ *template.Template
					if templ, err = template.New("").ParseFS(templatesFS, "*.html"); err != nil {
						log.Printf("error parsing template files: %v\n", err)
						continue
					}
					log.Printf("new templates parsed\n")
					router.SetHTMLTemplate(templ)

				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Println("error:", err)
			}
		}
	}()

	// watch the templates folder:
	err = watcher.Add(templatesPath)
	if err != nil {
		log.Fatal(err)
	}

	{
		templ := template.Must(template.New("").ParseFS(templatesFS, "*.html"))
		router.SetHTMLTemplate(templ)
	}
}

func SetupStaticAssets(router *gin.Engine) {
	router.StaticFS("/js/", http.FS(os.DirFS("cmd/webserver/dist/js")))
	router.StaticFS("/css/", http.FS(os.DirFS("cmd/webserver/dist/css")))
}
