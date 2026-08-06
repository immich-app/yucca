package storage

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestFileResolver(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "backends.txt")
	content := "" +
		"# the rgw gateways\n" +
		"http://10.0.0.2:80\n" +
		"\n" +
		"  http://10.0.0.1:80  \n" +
		"http://10.0.0.2:80\n" + // duplicate
		"# trailing comment\n"
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	r := NewFileResolver(path)
	got, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	want := []string{"http://10.0.0.1:80", "http://10.0.0.2:80"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestFileResolver_HotReload(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "backends.txt")
	if err := os.WriteFile(path, []byte("http://a:80\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	r := NewFileResolver(path)

	got, _ := r.Resolve(context.Background())
	if !reflect.DeepEqual(got, []string{"http://a:80"}) {
		t.Fatalf("first resolve: got %v", got)
	}

	if err := os.WriteFile(path, []byte("http://a:80\nhttp://b:80\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, _ = r.Resolve(context.Background())
	if !reflect.DeepEqual(got, []string{"http://a:80", "http://b:80"}) {
		t.Errorf("after reload: got %v", got)
	}
}

func TestFileResolver_MissingFile(t *testing.T) {
	r := NewFileResolver(filepath.Join(t.TempDir(), "nope.txt"))
	if _, err := r.Resolve(context.Background()); err == nil {
		t.Error("expected error for missing file")
	}
}

func TestDNSResolver(t *testing.T) {
	r := &DNSResolver{
		Host:   "rgw.example.svc",
		Scheme: "http",
		Port:   "80",
		LookupHost: func(_ context.Context, host string) ([]string, error) {
			if host != "rgw.example.svc" {
				t.Errorf("unexpected host %q", host)
			}
			// Intentionally unsorted with a duplicate.
			return []string{"10.0.0.3", "10.0.0.1", "10.0.0.3"}, nil
		},
	}
	got, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	want := []string{"http://10.0.0.1:80", "http://10.0.0.3:80"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestDNSResolver_NoPort(t *testing.T) {
	r := &DNSResolver{
		Host:   "rgw",
		Scheme: "https",
		LookupHost: func(_ context.Context, _ string) ([]string, error) {
			return []string{"10.0.0.1"}, nil
		},
	}
	got, _ := r.Resolve(context.Background())
	if !reflect.DeepEqual(got, []string{"https://10.0.0.1"}) {
		t.Errorf("got %v", got)
	}
}

func TestDNSResolver_LookupError(t *testing.T) {
	r := &DNSResolver{
		Host:   "rgw",
		Scheme: "http",
		Port:   "80",
		LookupHost: func(_ context.Context, _ string) ([]string, error) {
			return nil, errors.New("nxdomain")
		},
	}
	if _, err := r.Resolve(context.Background()); err == nil {
		t.Error("expected error from lookup failure")
	}
}
