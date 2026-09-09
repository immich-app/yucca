package ipc

import (
	"encoding/json"
	"net"
	"os"
	"testing"
	"time"

	"restic-proxy/internal/config"
)

func TestReportReady_WithoutFdDoesNothing(t *testing.T) {
	pipe, err := ReportReady(0, Ready{Address: "127.0.0.1:1434", Port: 1434})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pipe != nil {
		t.Error("expected no pipe without a ready fd")
	}
}

func TestReportReadyFromConfig_WritesAndKeepsThePipeOpen(t *testing.T) {
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

	pipe, err := ReportReadyFromConfig(config.Config{ReadyFd: int(write.Fd())}, listener.Addr())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if pipe == nil {
		t.Fatal("expected the pipe to be returned")
	}

	defer pipe.Close()

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

	if _, err := ReportReadyFromConfig(config.Config{ReadyFd: 3}, addr); err == nil {
		t.Error("expected a non-TCP address to be rejected")
	}
}

func TestWaitForParentExit_ReturnsWhenTheParentClosesThePipe(t *testing.T) {
	read, write, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}

	exited := make(chan struct{})
	go func() {
		WaitForParentExit(read)
		close(exited)
	}()

	select {
	case <-exited:
		t.Fatal("returned while the parent still held the pipe")
	case <-time.After(50 * time.Millisecond):
	}

	write.Close()

	select {
	case <-exited:
	case <-time.After(time.Second):
		t.Fatal("did not return after the parent closed the pipe")
	}
}
