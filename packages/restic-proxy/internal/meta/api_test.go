package meta

import (
	"testing"

	"restic-proxy/internal/config"
)

// newChain stands up the two discovery hops, counting each so a test can prove
// a configured URL short-circuits the request rather than merely overriding it.
type chain struct {
	wellKnownUrl string
	metaUrl      string
	apiUrl       string
	wellKnownHit int
	metaHit      int
}

func newChain(t *testing.T) *chain {
	t.Helper()
	resolved := &chain{apiUrl: "https://backups.example/api"}

	meta := newCountingServer(t, &resolved.metaHit, func() string {
		return `{"api_root":"` + resolved.apiUrl + `"}`
	})
	resolved.metaUrl = meta.URL

	wellKnown := newCountingServer(t, &resolved.wellKnownHit, func() string {
		return `{"meta_url":"` + resolved.metaUrl + `"}`
	})
	resolved.wellKnownUrl = wellKnown.URL

	return resolved
}

func TestApiFromConfig_ResolvesBothHops(t *testing.T) {
	resolved := newChain(t)

	api, err := ApiFromConfig(config.Config{WellKnown: resolved.wellKnownUrl})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if api.Url != resolved.apiUrl {
		t.Errorf("expected api url %s, got %s", resolved.apiUrl, api.Url)
	}
	if resolved.wellKnownHit != 1 || resolved.metaHit != 1 {
		t.Errorf("expected one request per hop, got well-known=%d meta=%d", resolved.wellKnownHit, resolved.metaHit)
	}
}

func TestApiFromConfig_ApiUrlSkipsDiscovery(t *testing.T) {
	resolved := newChain(t)

	api, err := ApiFromConfig(config.Config{
		WellKnown: resolved.wellKnownUrl,
		ApiUrl:    "https://configured.example/api",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if api.Url != "https://configured.example/api" {
		t.Errorf("expected the configured api url, got %s", api.Url)
	}
	if resolved.wellKnownHit != 0 || resolved.metaHit != 0 {
		t.Errorf("expected no discovery requests, got well-known=%d meta=%d", resolved.wellKnownHit, resolved.metaHit)
	}
}

func TestApiFromConfig_MetaUrlSkipsWellKnown(t *testing.T) {
	resolved := newChain(t)

	api, err := ApiFromConfig(config.Config{
		WellKnown: resolved.wellKnownUrl,
		MetaUrl:   resolved.metaUrl,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if api.Url != resolved.apiUrl {
		t.Errorf("expected api url %s, got %s", resolved.apiUrl, api.Url)
	}
	if resolved.wellKnownHit != 0 {
		t.Errorf("expected the well-known to be skipped, got %d requests", resolved.wellKnownHit)
	}
	if resolved.metaHit != 1 {
		t.Errorf("expected one meta request, got %d", resolved.metaHit)
	}
}

func TestApiFromConfig_PropagatesFailures(t *testing.T) {
	cases := []struct {
		name string
		cfg  config.Config
	}{
		{name: "well-known unreachable", cfg: config.Config{WellKnown: "http://127.0.0.1:1/.well-known/yucca.json"}},
		{name: "meta unreachable", cfg: config.Config{MetaUrl: "http://127.0.0.1:1/meta"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			api, err := ApiFromConfig(tc.cfg)
			if err == nil {
				t.Fatal("expected the failure to reach the caller")
			}
			if api.Url != "" {
				t.Errorf("expected no api url on failure, got %s", api.Url)
			}
		})
	}
}

func TestMetaUrlFromConfig_PrefersConfiguredUrl(t *testing.T) {
	resolved := newChain(t)

	metaUrl, err := MetaUrlFromConfig(config.Config{
		WellKnown: resolved.wellKnownUrl,
		MetaUrl:   "https://configured.example/meta",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if metaUrl != "https://configured.example/meta" {
		t.Errorf("expected the configured meta url, got %s", metaUrl)
	}
	if resolved.wellKnownHit != 0 {
		t.Errorf("expected the well-known to be skipped, got %d requests", resolved.wellKnownHit)
	}
}

func TestWellKnownFromConfig(t *testing.T) {
	resolved := newChain(t)

	wellKnown, err := WellKnownFromConfig(config.Config{WellKnown: resolved.wellKnownUrl})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if wellKnown.MetaUrl != resolved.metaUrl {
		t.Errorf("expected meta url %s, got %s", resolved.metaUrl, wellKnown.MetaUrl)
	}
}
