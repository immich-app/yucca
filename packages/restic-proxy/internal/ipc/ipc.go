package ipc

import (
	"encoding/json"
	"fmt"
	"net"
	"os"

	"restic-proxy/internal/config"
)

type ControlType string

const ControlThrottle ControlType = "throttle"

type Control struct {
	Type     ControlType      `json:"type"`
	Throttle *ThrottleControl `json:"throttle,omitempty"`
}

type ThrottleControl struct {
	BytesPerSec int    `json:"bytesPerSec"`
	QuietHours  string `json:"quietHours"`
}

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

func ReadControl(pipe *os.File, apply func(Control)) {
	defer pipe.Close()

	decoder := json.NewDecoder(pipe)
	for {
		var control Control
		if err := decoder.Decode(&control); err != nil {
			return
		}

		apply(control)
	}
}
