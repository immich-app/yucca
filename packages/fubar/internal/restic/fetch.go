package restic

// Pinned-restic download, adapted from yuctl's internal/bench/fetch.go (the
// packages are separate Go modules, so this is a deliberate copy — keep the
// version + checksums in sync when bumping either).

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
	"os/exec"
	"path/filepath"
	"runtime"
)

// Version is the pinned restic release; bump together with the checksums
// (SHA256SUMS on the GitHub release).
const Version = "0.19.1"

var sha256sums = map[string]string{
	"linux_amd64":  "f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c",
	"linux_arm64":  "a5f64aaab53d51e311fa3829124c5b703f2d14cf187d8640b6be3b2b49376465",
	"darwin_amd64": "c38d579622cf602f665234c5a8c315030b6cf70656028fe6dc29a786b60e5f35",
	"darwin_arm64": "7be0a144ccc377880f294204aa271d76e4b79554b42a751151d425ce6ebac143",
}

// Ensure returns a restic binary path: $FUBAR_RESTIC or a restic on PATH when
// set/present, else the pinned release (downloaded once, checksum-verified,
// cached under the user cache dir).
func Ensure(ctx context.Context) (string, error) {
	if bin := os.Getenv("FUBAR_RESTIC"); bin != "" {
		return bin, nil
	}
	if bin, err := exec.LookPath("restic"); err == nil {
		return bin, nil
	}

	platform := runtime.GOOS + "_" + runtime.GOARCH
	sha, ok := sha256sums[platform]
	if !ok {
		return "", fmt.Errorf("no pinned restic %s build for %s — install restic or set FUBAR_RESTIC", Version, platform)
	}
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(cacheDir, "fubar")
	bin := filepath.Join(dir, "restic_"+Version+"_"+platform)
	if _, err := os.Stat(bin); err == nil {
		return bin, nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}

	url := fmt.Sprintf("https://github.com/restic/restic/releases/download/v%s/restic_%s_%s.bz2",
		Version, Version, platform)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("download restic: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download restic: %s from %s", resp.Status, url)
	}
	compressed, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	sum := sha256.Sum256(compressed)
	if hex.EncodeToString(sum[:]) != sha {
		return "", fmt.Errorf("restic download checksum mismatch for %s (got %s)", platform, hex.EncodeToString(sum[:]))
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
