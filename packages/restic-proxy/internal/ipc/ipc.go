package ipc

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"

	"restic-proxy/internal/config"
)

type Ready struct {
	Address string `json:"address"`
	Port    int    `json:"port"`
}

func ReportReady(fd int, ready Ready) (*os.File, error) {
	if fd == 0 {
		return nil, nil
	}

	pipe := os.NewFile(uintptr(fd), "ready")
	if pipe == nil {
		return nil, fmt.Errorf("ready fd %d is not open", fd)
	}

	if err := json.NewEncoder(pipe).Encode(ready); err != nil {
		pipe.Close()
		return nil, err
	}

	return pipe, nil
}

func ReportReadyFromConfig(cfg config.Config, addr net.Addr) (*os.File, error) {
	tcpAddr, ok := addr.(*net.TCPAddr)
	if !ok {
		return nil, fmt.Errorf("expected a TCP address, got %s", addr.Network())
	}

	return ReportReady(cfg.ReadyFd, Ready{Address: addr.String(), Port: tcpAddr.Port})
}

func WaitForParentExit(pipe *os.File) {
	defer pipe.Close()

	_, _ = io.Copy(io.Discard, pipe)
}
