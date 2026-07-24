package bench

import (
	"bytes"
	"compress/bzip2"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
)

// The restic client is pinned so before/after runs measure michael, not a
// client upgrade. Bump version+sha together.
const (
	ResticVersion = "0.19.1"
	resticURL     = "https://github.com/restic/restic/releases/download/v" + ResticVersion +
		"/restic_" + ResticVersion + "_linux_amd64.bz2"
	resticSHA256 = "f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c"
)

// EnsureResticLinux downloads (once, cached) the pinned linux/amd64 restic
// release, verifies its checksum, and returns the decompressed binary's path.
func EnsureResticLinux(ctx context.Context) (string, error) {
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(cacheDir, "yuctl-bench")
	bin := filepath.Join(dir, "restic_"+ResticVersion+"_linux_amd64")
	if _, err := os.Stat(bin); err == nil {
		return bin, nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, resticURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("download restic: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download restic: %s from %s", resp.Status, resticURL)
	}
	compressed, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	sum := sha256.Sum256(compressed)
	if hex.EncodeToString(sum[:]) != resticSHA256 {
		return "", fmt.Errorf("restic download checksum mismatch (got %s)", hex.EncodeToString(sum[:]))
	}

	raw, err := io.ReadAll(bzip2.NewReader(bytes.NewReader(compressed)))
	if err != nil {
		return "", fmt.Errorf("decompress restic: %w", err)
	}
	tmp := bin + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o755); err != nil {
		return "", err
	}
	return bin, os.Rename(tmp, bin)
}
