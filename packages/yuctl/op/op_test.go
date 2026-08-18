package op

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func fakeOp(t *testing.T) (argvFile string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("shell stub is POSIX-only")
	}
	dir := t.TempDir()
	argvFile = filepath.Join(dir, "argv")
	bin := filepath.Join(dir, "op")
	script := "#!/bin/sh\nfor a in \"$@\"; do echo \"$a\" >> " + argvFile + "; done\nprintf 's3cret'\n"
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("OP_BIN", bin)
	return argvFile
}

func readArgv(t *testing.T, path string) []string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("stub op recorded no argv: %v", err)
	}
	return strings.Split(strings.TrimSuffix(string(b), "\n"), "\n")
}

func TestReadPassesDefaultAccount(t *testing.T) {
	argvFile := fakeOp(t)
	t.Setenv("OP_ACCOUNT", "")
	t.Setenv("OP_SERVICE_ACCOUNT_TOKEN", "")

	got, err := Read(context.Background(), "op://yucca_tf/TF_STATE_S3_ACCESS_KEY/password")
	if err != nil {
		t.Fatalf("Read: %v", err)
	}
	if got != "s3cret" {
		t.Errorf("Read = %q, want %q", got, "s3cret")
	}

	argv := readArgv(t, argvFile)
	want := []string{"read", "--no-newline", "--account", DefaultAccount,
		"op://yucca_tf/TF_STATE_S3_ACCESS_KEY/password"}
	if strings.Join(argv, " ") != strings.Join(want, " ") {
		t.Errorf("argv = %v, want %v", argv, want)
	}
}

func TestReadHonoursOPAccountOverride(t *testing.T) {
	argvFile := fakeOp(t)
	t.Setenv("OP_ACCOUNT", "other.1password.com")
	t.Setenv("OP_SERVICE_ACCOUNT_TOKEN", "")

	if _, err := Read(context.Background(), "op://v/i/f"); err != nil {
		t.Fatalf("Read: %v", err)
	}
	argv := readArgv(t, argvFile)
	if strings.Join(argv, " ") != "read --no-newline --account other.1password.com op://v/i/f" {
		t.Errorf("argv = %v, want the OP_ACCOUNT override", argv)
	}
}

func TestReadOmitsAccountUnderServiceAccountToken(t *testing.T) {
	argvFile := fakeOp(t)
	t.Setenv("OP_ACCOUNT", "team-futo")
	t.Setenv("OP_SERVICE_ACCOUNT_TOKEN", "ops_token")

	if _, err := Read(context.Background(), "op://v/i/f"); err != nil {
		t.Fatalf("Read: %v", err)
	}
	argv := readArgv(t, argvFile)
	for _, a := range argv {
		if a == "--account" {
			t.Fatalf("argv = %v, want no --account under a service-account token", argv)
		}
	}
}

func TestReadRejectsNonReference(t *testing.T) {
	if _, err := Read(context.Background(), "/etc/passwd"); err == nil {
		t.Fatal("Read accepted a non-op:// reference")
	}
}
