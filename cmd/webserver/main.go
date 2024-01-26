package main

import (
	"io"
	"log"
	"mime"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

func main() {
	var err error
	err = mime.AddExtensionType(".js", "application/javascript")
	if err != nil {
		log.Fatalln(err)
	}

	//http.Handle("/", http.FileServer(http.Dir("public")))
	//http.Handle("/js/", http.StripPrefix("/js/", http.FileServer(http.Dir("dist"))))

	router := gin.Default()
	router.SetTrustedProxies(nil)
	router.Use(CORSMiddleware())
	router.NoRoute(gin.WrapH(http.FileServer(gin.Dir("public", false))))
	router.Static("/js/", "dist")
	router.POST("/save", func(ctx *gin.Context) {
		b, err := io.ReadAll(ctx.Request.Body)
		if err != nil {
			log.Printf("")
		}
		ctx.Writer.WriteHeader(200)
		ctx.Writer.Write(b)
		ctx.Writer.Flush()
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	if err := router.Run(":" + port); err != nil {
		log.Panicf("error: %s", err)
	}
}
