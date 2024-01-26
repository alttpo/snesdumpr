package main

import (
	"crypto/sha512"
	"encoding/base64"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"os"
	"runtime"
	"strings"
)

var rcl *redis.Client

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
	ConfigRuntime()
	ConnectRedis()
	StartGin()
}

// ConfigRuntime sets the number of operating system threads.
func ConfigRuntime() {
	nuCPU := runtime.NumCPU()
	runtime.GOMAXPROCS(nuCPU)
	fmt.Printf("Running with %d CPUs\n", nuCPU)
}

func ConnectRedis() {
	var err error

	var opts *redis.Options
	opts, err = redis.ParseURL(os.Getenv("REDIS_URL"))
	if err != nil {
		log.Fatalf("error parsing $REDIS_URL: %v\n", err)
	}
	log.Printf("redis: %+v\n", opts)

	rcl = redis.NewClient(opts)
}

// StartGin starts gin web server with setting router.
func StartGin() {
	var err error

	// default to production mode if no GIN_MODE set:
	if os.Getenv(gin.EnvGinMode) == "" {
		gin.SetMode(gin.ReleaseMode)
	}

	err = mime.AddExtensionType(".js", "application/javascript")
	if err != nil {
		log.Fatalln(err)
	}

	router := gin.New()
	router.SetTrustedProxies(nil)
	router.Use(CORSMiddleware())

	router.StaticFile("/", "public/index.html")
	router.StaticFile("/index.html", "public/index.html")
	router.Static("/js/", "dist")

	// TODO: CSRF to prevent anyone from posting to this endpoint
	router.POST("/save", func(c *gin.Context) {
		var err error

		var mr *multipart.Reader
		mr, err = c.Request.MultipartReader()
		if err != nil {
			log.Printf("error getting MultipartReader: %v\n", err)
			c.AbortWithError(400, err)
			return
		}

		var header, wram, sram []byte = nil, nil, nil

		// read parts:
		for {
			var part *multipart.Part
			part, err = mr.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				log.Printf("error advancing MultipartReader::NextPart: %v\n", err)
				c.AbortWithError(500, err)
				return
			}

			var b *[]byte
			switch strings.ToLower(part.FileName()) {
			case "header":
				b = &header
				break
			case "wram":
				b = &wram
				break
			case "sram":
				b = &sram
				break
			}

			*b, err = io.ReadAll(part)
			if err != nil {
				log.Printf("error reading from multipart.Part: %v\n", err)
				c.AbortWithError(500, err)
				return
			}
		}

		// hash all the contents together:
		h := sha512.New()
		h.Write(header)
		h.Write(wram)
		if sram != nil {
			h.Write(sram)
		}

		// url-base64 encode that hash (with no padding = chars):
		hs := base64.RawURLEncoding.EncodeToString(h.Sum(nil))

		// redis HSET:
		values := make([]any, 0, 6)
		values = append(values, "header", header)
		values = append(values, "wram", wram)
		if sram != nil {
			values = append(values, "sram", sram)
		}
		err = rcl.HSet(c, hs, values...).Err()
		if err != nil {
			log.Printf("error redis HSET: %v\n", err)
			c.AbortWithError(500, err)
			return
		}

		c.Header("Content-Type", "text/html")
		c.Writer.WriteHeaderNow()
		link := fmt.Sprintf(`<a href="/d/%s"></a>`, hs)
		c.Writer.WriteString(link)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	if err := router.Run(":" + port); err != nil {
		log.Panicf("error: %s", err)
	}
}
