// Package context persists the operator's selected topology to
// ${XDG_CONFIG_HOME:-~/.config}/yuctl/context.json — the sticky state letting
// `yuctl select prod@htz-fsn1` be followed by `yuctl ceph get health`.
package context

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// An empty CephCluster means none is selected.
type Context struct {
	Partition   string `json:"partition"`
	Region      string `json:"region"`
	CephCluster string `json:"ceph_cluster,omitempty"`
}

// Dir returns the yuctl config directory, honoring XDG_CONFIG_HOME and falling
// back to ~/.config.
func Dir() (string, error) {
	base := os.Getenv("XDG_CONFIG_HOME")
	if base == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve home dir: %w", err)
		}
		base = filepath.Join(home, ".config")
	}
	return filepath.Join(base, "yuctl"), nil
}

func Path() (string, error) {
	dir, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "context.json"), nil
}

// Load reads the persisted context. Missing file = zero Context, nil error;
// "nothing selected" is Context.Partition == "".
func Load() (*Context, error) {
	p, err := Path()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return &Context{}, nil
		}
		return nil, fmt.Errorf("read context: %w", err)
	}
	var c Context
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("parse context %s: %w", p, err)
	}
	return &c, nil
}

// Save atomically writes the context to disk (0600; it carries no secrets but
// the convention is cheap), creating the directory if needed.
func Save(c *Context) error {
	dir, err := Dir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}
	p := filepath.Join(dir, "context.json")
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal context: %w", err)
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, append(data, '\n'), 0o600); err != nil {
		return fmt.Errorf("write context: %w", err)
	}
	if err := os.Rename(tmp, p); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("commit context: %w", err)
	}
	return nil
}

func (c *Context) Selected() bool {
	return c != nil && c.Partition != "" && c.Region != ""
}
