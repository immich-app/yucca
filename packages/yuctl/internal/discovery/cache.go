package discovery

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"github.com/rs/zerolog"

	yctx "yuctl/internal/context"
)

// The resolved topology is cached on disk so repeat invocations skip the
// 1Password credential reads and the per-stack S3 state fetches entirely. The
// discovery contract only ever carries `op://` reference strings (never secret
// values), so caching it in the config dir is safe; 0600 matches the token
// cache convention anyway.
const (
	cacheFileName   = "discovery-cache.json"
	defaultCacheTTL = time.Hour
	// cacheTTLEnvVar overrides the TTL with a Go duration string ("30m", "0"
	// to disable caching).
	cacheTTLEnvVar = "YUCTL_DISCOVERY_TTL"
)

// cacheEnvelope is the on-disk shape: the topology plus when it was resolved.
type cacheEnvelope struct {
	FetchedAt time.Time `json:"fetched_at"`
	Topology  *Topology `json:"topology"`
}

func cachePath() (string, error) {
	dir, err := yctx.Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, cacheFileName), nil
}

func cacheTTL() time.Duration {
	if v := os.Getenv(cacheTTLEnvVar); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return defaultCacheTTL
}

// LoadCachedTopology returns the cached topology when one exists and is younger
// than the TTL. Any problem (missing, unreadable, corrupt, expired) is a cache
// miss, never an error — callers fall back to a live resolve.
func LoadCachedTopology(logger zerolog.Logger) (*Topology, bool) {
	p, err := cachePath()
	if err != nil {
		return nil, false
	}
	data, err := os.ReadFile(p)
	if err != nil {
		return nil, false
	}
	var env cacheEnvelope
	if err := json.Unmarshal(data, &env); err != nil || env.Topology == nil {
		logger.Debug().Str("path", p).Msg("discovery cache unreadable; ignoring")
		return nil, false
	}
	age := time.Since(env.FetchedAt)
	if age < 0 || age > cacheTTL() {
		logger.Debug().Str("path", p).Dur("age", age).Msg("discovery cache expired")
		return nil, false
	}
	logger.Debug().Str("path", p).Dur("age", age).Int("stacks", len(env.Topology.Stacks)).
		Msg("topology loaded from cache")
	return env.Topology, true
}

// SaveCachedTopology persists the topology best-effort: a failure is logged at
// warn and otherwise ignored, since the resolve itself already succeeded.
func SaveCachedTopology(topo *Topology, logger zerolog.Logger) {
	p, err := cachePath()
	if err != nil {
		logger.Warn().Err(err).Msg("skip discovery cache write")
		return
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		logger.Warn().Err(err).Msg("skip discovery cache write")
		return
	}
	data, err := json.MarshalIndent(cacheEnvelope{FetchedAt: time.Now().UTC(), Topology: topo}, "", "  ")
	if err != nil {
		logger.Warn().Err(err).Msg("skip discovery cache write")
		return
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, append(data, '\n'), 0o600); err != nil {
		logger.Warn().Err(err).Msg("skip discovery cache write")
		return
	}
	if err := os.Rename(tmp, p); err != nil {
		os.Remove(tmp)
		logger.Warn().Err(err).Msg("skip discovery cache write")
	}
}
