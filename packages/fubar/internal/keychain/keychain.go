// Package keychain stores repository passwords: OS keychain (macOS Keychain /
// Secret Service) first, with a 0600-file fallback for headless machines.
package keychain

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/zalando/go-keyring"

	"fubar/internal/config"
)

const service = "sh.futo.fubar"

func fallbackPath(repositoryID string) (string, error) {
	dir, err := config.Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "passwords", repositoryID+".key"), nil
}

// Generate mints a new random repository password.
func Generate() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// Store saves the password for a repository. Returns where it landed
// ("keychain" or the fallback file path) for the user-facing recap.
// FUBAR_NO_KEYCHAIN=1 forces the file fallback (headless machines, CI, tests).
func Store(repositoryID, password string) (string, error) {
	if os.Getenv("FUBAR_NO_KEYCHAIN") == "" {
		if err := keyring.Set(service, repositoryID, password); err == nil {
			return "keychain", nil
		}
	}
	path, err := fallbackPath(repositoryID)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return "", err
	}
	if err := os.WriteFile(path, []byte(password), 0o600); err != nil {
		return "", err
	}
	return path, nil
}

// Load retrieves the password for a repository: $FUBAR_PASSWORD override,
// keychain, then the fallback file.
func Load(repositoryID string) (string, error) {
	if password := os.Getenv("FUBAR_PASSWORD"); password != "" {
		return password, nil
	}
	if os.Getenv("FUBAR_NO_KEYCHAIN") == "" {
		if password, err := keyring.Get(service, repositoryID); err == nil {
			return password, nil
		}
	}
	path, err := fallbackPath(repositoryID)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf(
				"no password stored for repository %s — restore it to the keychain or set FUBAR_PASSWORD", repositoryID)
		}
		return "", err
	}
	return string(data), nil
}
