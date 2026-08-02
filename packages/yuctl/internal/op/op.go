// Package op is a thin wrapper around the 1Password CLI (`op`). It resolves
// `op://vault/item/field` references to their secret values, matching the
// repo-wide `op run` convention (interactive desktop unlock or a service-account
// token via OP_SERVICE_ACCOUNT_TOKEN). yuctl never embeds secrets; the discovery
// contract only ever carries `op://` reference strings, resolved here on demand.
package op

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

const DefaultAccount = "team-futo"

// Binary is the op CLI executable name; overridable for tests via OP_BIN.
func binary() string {
	if v := os.Getenv("OP_BIN"); v != "" {
		return v
	}
	return "op"
}

func account() string {
	if v := os.Getenv("OP_ACCOUNT"); v != "" {
		return v
	}
	return DefaultAccount
}

func accountFlag() []string {
	if os.Getenv("OP_SERVICE_ACCOUNT_TOKEN") != "" {
		return nil
	}
	return []string{"--account", account()}
}

// Read resolves a single `op://...` reference to its plaintext value via
// `op read`. The trailing newline op prints is trimmed.
func Read(ctx context.Context, ref string) (string, error) {
	if !strings.HasPrefix(ref, "op://") {
		return "", fmt.Errorf("not an op:// reference: %q", ref)
	}
	args := append([]string{"read", "--no-newline"}, accountFlag()...)
	cmd := exec.CommandContext(ctx, binary(), append(args, ref)...)
	cmd.Stderr = os.Stderr
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		if flag := accountFlag(); flag != nil {
			return "", fmt.Errorf("op read %s (account %s — unlock 1Password and approve the prompt, "+
				"or set OP_ACCOUNT): %w", ref, flag[1], err)
		}
		return "", fmt.Errorf("op read %s: %w", ref, err)
	}
	return out.String(), nil
}

// ReadToTempFile resolves a reference and writes the value to a freshly created
// 0600 temp file, returning its path. Used for kubeconfig/talosconfig that
// downstream tools (talosctl, kubectl) need on disk. The caller owns cleanup.
func ReadToTempFile(ctx context.Context, ref, pattern string) (string, error) {
	val, err := Read(ctx, ref)
	if err != nil {
		return "", err
	}
	f, err := os.CreateTemp("", pattern)
	if err != nil {
		return "", fmt.Errorf("create temp file: %w", err)
	}
	// CreateTemp already makes the file 0600, but be explicit in case umask or
	// platform defaults differ.
	if err := f.Chmod(0o600); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", fmt.Errorf("chmod temp file: %w", err)
	}
	if _, err := f.WriteString(val); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", fmt.Errorf("write temp file: %w", err)
	}
	if err := f.Close(); err != nil {
		os.Remove(f.Name())
		return "", fmt.Errorf("close temp file: %w", err)
	}
	return f.Name(), nil
}
