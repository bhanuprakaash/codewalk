package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"

	"github.com/bhanuprakaash/codewalk/scan"
	"github.com/bhanuprakaash/codewalk/server"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "codewalk:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return errors.New("usage: codewalk serve [--port N] [--data DIR] | install | uninstall | scan <repo> <pkg dir>...")
	}
	switch args[0] {
	case "serve":
		return serve(args[1:])
	case "install":
		return install()
	case "uninstall":
		return uninstall()
	case "scan":
		return scanCmd(args[1:])
	}
	return fmt.Errorf("unknown command %q (want serve, install, uninstall or scan)", args[0])
}

func serve(args []string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	flags := flag.NewFlagSet("serve", flag.ContinueOnError)
	port := flags.Int("port", 47474, "port to listen on")
	data := flags.String("data", filepath.Join(home, ".codewalk"), "data directory")
	if err := flags.Parse(args); err != nil {
		return err
	}
	addr := net.JoinHostPort("127.0.0.1", strconv.Itoa(*port))
	ln, err := net.Listen("tcp", addr)
	if errors.Is(err, syscall.EADDRINUSE) {
		return fmt.Errorf("port %d is already in use by %s", *port, portHolder(*port))
	}
	if err != nil {
		return err
	}
	fmt.Printf("codewalk listening on http://codewalk.localhost:%d (data %s)\n", *port, *data)
	return http.Serve(ln, server.Handler(*data))
}

func scanCmd(args []string) error {
	if len(args) < 2 {
		return errors.New("usage: codewalk scan <repo> <pkg dir>...")
	}
	res, err := scan.Scan(args[0], args[1:])
	if err != nil {
		return err
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", " ")
	return enc.Encode(res)
}

func portHolder(port int) string {
	out, err := exec.Command("lsof", "-nP", "-iTCP:"+strconv.Itoa(port), "-sTCP:LISTEN", "-Fpc").Output()
	if err != nil {
		return "another process"
	}
	var pid, name string
	for _, line := range strings.Split(string(out), "\n") {
		switch {
		case strings.HasPrefix(line, "p") && pid == "":
			pid = line[1:]
		case strings.HasPrefix(line, "c") && name == "":
			name = line[1:]
		}
	}
	if pid == "" {
		return "another process"
	}
	return fmt.Sprintf("%s (pid %s)", name, pid)
}
