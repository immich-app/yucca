package ipc

import (
	"encoding/json"
	"net"
	"os"
	"testing"

	"restic-proxy/internal/config"
)

func TestReportReady_WithoutFdDoesNothing(t *testing.T) {
	if err := ReportReady(0, Ready{Address: "127.0.0.1:1434", Port: 1434}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestReportReadyFromConfig_WritesAndClosesThePipe(t *testing.T) {
	read, write, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}

	defer read.Close()

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	defer listener.Close()

	if err := ReportReadyFromConfig(config.Config{ReadyFd: int(write.Fd())}, listener.Addr()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	ready := Ready{}
	if err := json.NewDecoder(read).Decode(&ready); err != nil {
		t.Fatalf("decode: %v", err)
	}

	if ready.Address != listener.Addr().String() {
		t.Errorf("expected address %s, got %s", listener.Addr().String(), ready.Address)
	}
	if ready.Port != listener.Addr().(*net.TCPAddr).Port {
		t.Errorf("expected port %d, got %d", listener.Addr().(*net.TCPAddr).Port, ready.Port)
	}
	if ready.Port == 0 {
		t.Error("expected an ephemeral port to be resolved")
	}
}

func TestReportReadyFromConfig_RejectsNonTcpAddresses(t *testing.T) {
	addr, err := net.ResolveUnixAddr("unix", "/tmp/restic-proxy.sock")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}

	if err := ReportReadyFromConfig(config.Config{ReadyFd: 3}, addr); err == nil {
		t.Error("expected a non-TCP address to be rejected")
	}
}
