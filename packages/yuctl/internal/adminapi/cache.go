package adminapi

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	yctx "yuctl/internal/context"
)

// tokenCachePath returns the per-partition token cache file inside the yuctl
// config dir. Partition-scoped because each partition has its own primary
// region / admin-api.
func tokenCachePath(partition string) (string, error) {
	dir, err := yctx.Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, fmt.Sprintf("admin-token-%s.json", partition)), nil
}

// LoadToken reads a cached CLI session token for the partition, or returns a
// zero Token (not an error) if none is cached.
func LoadToken(partition string) (Token, error) {
	p, err := tokenCachePath(partition)
	if err != nil {
		return Token{}, err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return Token{}, nil
		}
		return Token{}, fmt.Errorf("read token cache: %w", err)
	}
	var t Token
	if err := json.Unmarshal(data, &t); err != nil {
		return Token{}, fmt.Errorf("parse token cache: %w", err)
	}
	return t, nil
}

// SaveToken persists a CLI session token at 0600.
func SaveToken(partition string, t Token) error {
	dir, err := yctx.Dir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	p, err := tokenCachePath(partition)
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(t, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(p, data, 0o600); err != nil {
		return fmt.Errorf("write token cache: %w", err)
	}
	return nil
}
