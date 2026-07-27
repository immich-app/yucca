// Package config owns fubar's on-disk state:
//
//	~/.config/fubar/config.toml  — API endpoint + backup plans (user-editable)
//	~/.config/fubar/token.json   — the yucca session token (0600)
//	~/.config/fubar/state.json   — per-plan run history (managed by fubar)
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/BurntSushi/toml"
)

// Plan is one scheduled backup: a set of paths into one repository.
type Plan struct {
	Name        string   `toml:"name"`
	Repository  string   `toml:"repository"`
	Paths       []string `toml:"paths"`
	Excludes    []string `toml:"excludes,omitempty"`
	Cron        string   `toml:"cron,omitempty"`
	KeepDaily   int      `toml:"keep-daily,omitempty"`
	KeepWeekly  int      `toml:"keep-weekly,omitempty"`
	KeepMonthly int      `toml:"keep-monthly,omitempty"`
}

// HasRetention reports whether any keep-* policy is configured.
func (p *Plan) HasRetention() bool {
	return p.KeepDaily > 0 || p.KeepWeekly > 0 || p.KeepMonthly > 0
}

// ForgetArgs renders the retention policy as restic forget arguments.
func (p *Plan) ForgetArgs() []string {
	var args []string
	if p.KeepDaily > 0 {
		args = append(args, "--keep-daily", fmt.Sprint(p.KeepDaily))
	}
	if p.KeepWeekly > 0 {
		args = append(args, "--keep-weekly", fmt.Sprint(p.KeepWeekly))
	}
	if p.KeepMonthly > 0 {
		args = append(args, "--keep-monthly", fmt.Sprint(p.KeepMonthly))
	}
	return args
}

type Config struct {
	API   string `toml:"api"`
	Plans []Plan `toml:"plan"`
}

func (c *Config) Plan(name string) (*Plan, error) {
	for i := range c.Plans {
		if c.Plans[i].Name == name {
			return &c.Plans[i], nil
		}
	}
	return nil, fmt.Errorf("no plan named %q (see `fubar status`)", name)
}

func Dir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "fubar"), nil
}

func configPath() (string, error) {
	dir, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.toml"), nil
}

// Load reads the config; a missing file is an empty config, not an error.
func Load() (*Config, error) {
	path, err := configPath()
	if err != nil {
		return nil, err
	}
	cfg := &Config{}
	if _, err := toml.DecodeFile(path, cfg); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return cfg, nil
		}
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return cfg, nil
}

func Save(cfg *Config) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	f, err := os.OpenFile(path+".tmp", os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	if err := toml.NewEncoder(f).Encode(cfg); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(path+".tmp", path)
}

// Token is the cached yucca session (device-flow result).
type Token struct {
	API         string `json:"api"`
	AccessToken string `json:"accessToken"`
}

func tokenPath() (string, error) {
	dir, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "token.json"), nil
}

func LoadToken() (*Token, error) {
	path, err := tokenPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("not logged in — run `fubar login` first")
		}
		return nil, err
	}
	var token Token
	if err := json.Unmarshal(data, &token); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return &token, nil
}

func SaveToken(token *Token) error {
	path, err := tokenPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(token, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

// RunRecord is the outcome of one plan run, kept in state.json for `status`.
type RunRecord struct {
	Start      time.Time `json:"start"`
	End        time.Time `json:"end"`
	Success    bool      `json:"success"`
	SnapshotID string    `json:"snapshotId,omitempty"`
	Error      string    `json:"error,omitempty"`
	AddedBytes int64     `json:"addedBytes"`
}

type State struct {
	LastRuns map[string]RunRecord `json:"lastRuns"`
}

func statePath() (string, error) {
	dir, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "state.json"), nil
}

func LoadState() (*State, error) {
	path, err := statePath()
	if err != nil {
		return nil, err
	}
	state := &State{LastRuns: map[string]RunRecord{}}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return state, nil
		}
		return nil, err
	}
	if err := json.Unmarshal(data, state); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	if state.LastRuns == nil {
		state.LastRuns = map[string]RunRecord{}
	}
	return state, nil
}

func SaveState(state *State) error {
	path, err := statePath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

// RecordRun persists a run outcome (load-modify-save; fubar holds a per-plan
// lock while running, so concurrent writers are not a concern).
func RecordRun(plan string, record RunRecord) error {
	state, err := LoadState()
	if err != nil {
		return err
	}
	state.LastRuns[plan] = record
	return SaveState(state)
}
