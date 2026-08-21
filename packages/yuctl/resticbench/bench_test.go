package resticbench

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"
)

func TestParseSize(t *testing.T) {
	cases := map[string]int64{
		"1TiB":   1 << 40,
		"64MiB":  64 << 20,
		"32 GiB": 32 << 30,
		"500GB":  500e9,
		"1024":   1024,
	}
	for in, want := range cases {
		got, err := ParseSize(in)
		if err != nil || got != want {
			t.Errorf("ParseSize(%q) = %d, %v; want %d", in, got, err, want)
		}
	}
	if _, err := ParseSize("12parsecs"); err == nil {
		t.Error("expected error for unknown unit")
	}
}

func hashTree(t *testing.T, dir string) map[string]string {
	t.Helper()
	sums := map[string]string{}
	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || info.Name() == manifestName {
			return err
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		h := sha256.Sum256(b)
		rel, _ := filepath.Rel(dir, path)
		sums[rel] = hex.EncodeToString(h[:])
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return sums
}

func TestGenerateDeterministicAndMutate(t *testing.T) {
	dir := t.TempDir()
	const size, fileSize, seed = 1 << 20, 64 << 10, 42

	m1, err := Generate(dir, size, fileSize, seed, nil)
	if err != nil {
		t.Fatal(err)
	}
	if m1.Files != 16 {
		t.Fatalf("expected 16 files, got %d", m1.Files)
	}
	first := hashTree(t, dir)

	m2, err := Generate(dir, size, fileSize, seed, nil)
	if err != nil {
		t.Fatal(err)
	}
	second := hashTree(t, dir)
	if len(first) != len(second) {
		t.Fatalf("file count changed: %d vs %d", len(first), len(second))
	}
	for k, v := range first {
		if second[k] != v {
			t.Fatalf("generation not deterministic at %s", k)
		}
	}

	// 25% of 16 files = 4 rewritten, everything else untouched.
	written, err := Mutate(dir, m2, 25, nil)
	if err != nil {
		t.Fatal(err)
	}
	if written != 4*fileSize {
		t.Fatalf("expected %d bytes rewritten, got %d", 4*fileSize, written)
	}
	mutated := hashTree(t, dir)
	changed := 0
	for k, v := range first {
		if mutated[k] != v {
			changed++
		}
	}
	if changed != 4 {
		t.Fatalf("expected 4 changed files, got %d", changed)
	}
}

func TestScrubRepo(t *testing.T) {
	in := "rest:https://restic:eyJhbGciOi.some.jwt@gw.example.net/9f3c2a"
	want := "rest:https://gw.example.net/9f3c2a"
	if got := scrubRepo(in); got != want {
		t.Errorf("scrubRepo = %q, want %q", got, want)
	}
	if got := scrubRepo("rest:https://gw.example.net/x"); got != "rest:https://gw.example.net/x" {
		t.Errorf("scrubRepo mangled credential-less URL: %q", got)
	}
}
