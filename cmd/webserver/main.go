package main

import (
	"log"
	"mime"
	"net/http"
)

func main() {
	var err error
	err = mime.AddExtensionType(".js", "application/javascript")
	if err != nil {
		log.Fatalln(err)
	}

	http.Handle("/", http.FileServer(http.Dir("public")))
	http.Handle("/js/", http.StripPrefix("/js/", http.FileServer(http.Dir("dist"))))

	log.Fatalln(http.ListenAndServe(":8080", nil))
}
