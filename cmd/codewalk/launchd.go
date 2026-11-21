package main

import (
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
)

const _label = "com.codewalk"

func install() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	plist := plistPath(home)
	log := filepath.Join(home, "Library", "Logs", "codewalk.log")
	if err := os.MkdirAll(filepath.Dir(plist), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(plist, renderPlist(exe, os.Getenv("PATH"), log), 0o644); err != nil {
		return err
	}
	launchctl("bootout", target()) // loaded already on a second install: reload with the new file
	if out, err := launchctl("bootstrap", domain(), plist); err != nil {
		return fmt.Errorf("launchctl bootstrap: %w: %s", err, bytes.TrimSpace(out))
	}
	fmt.Println("installed", plist)
	return nil
}

func uninstall() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	launchctl("bootout", target()) // not loaded: nothing to stop
	plist := plistPath(home)
	if err := os.Remove(plist); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	fmt.Println("uninstalled", plist)
	return nil
}

func plistPath(home string) string {
	return filepath.Join(home, "Library", "LaunchAgents", _label+".plist")
}

func domain() string { return "gui/" + strconv.Itoa(os.Getuid()) }

func target() string { return domain() + "/" + _label }

func launchctl(args ...string) ([]byte, error) {
	return exec.Command("launchctl", args...).CombinedOutput()
}

func renderPlist(exe, path, log string) []byte {
	var b bytes.Buffer
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>` + _label + `</string>
	<key>ProgramArguments</key>
	<array>
		<string>`)
	xml.EscapeText(&b, []byte(exe))
	b.WriteString(`</string>
		<string>serve</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>EnvironmentVariables</key>
	<dict>
		<key>PATH</key>
		<string>`)
	xml.EscapeText(&b, []byte(path))
	b.WriteString(`</string>
	</dict>
	<key>StandardOutPath</key>
	<string>`)
	xml.EscapeText(&b, []byte(log))
	b.WriteString(`</string>
	<key>StandardErrorPath</key>
	<string>`)
	xml.EscapeText(&b, []byte(log))
	b.WriteString(`</string>
</dict>
</plist>
`)
	return b.Bytes()
}
