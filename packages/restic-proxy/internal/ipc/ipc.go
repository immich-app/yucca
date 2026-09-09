package ipc

import (
	"encoding/json"
	"fmt"
	"net"
	"os"

	"restic-proxy/internal/config"
)

type Ready struct {
	Address string `json:"address"`
	Port    int    `json:"port"`
}

func ReportReady(fd int, ready Ready) error {
	if fd == 0 {
		return nil
	}

	pipe := os.NewFile(uintptr(fd), "ready")
	if pipe == nil {
		return fmt.Errorf("ready fd %d is not open", fd)
	}

	defer pipe.Close()

	return json.NewEncoder(pipe).Encode(ready)
}

func ReportReadyFromConfig(cfg config.Config, addr net.Addr) error {
	tcpAddr, ok := addr.(*net.TCPAddr)
	if !ok {
		return fmt.Errorf("expected a TCP address, got %s", addr.Network())
	}

	return ReportReady(cfg.ReadyFd, Ready{Address: addr.String(), Port: tcpAddr.Port})
}
