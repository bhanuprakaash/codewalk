package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var _dist embed.FS

func FS() fs.FS {
	sub, _ := fs.Sub(_dist, "dist")
	return sub
}
