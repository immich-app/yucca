//go:build integration

// End-to-end integration test for fubar against the local dev stack
// (compose `mise dev` or k3d). Skipped unless FUBAR_IT=1.
//
// It exercises the whole path a real user takes: device-flow login registering
// a `fubar` consumer, repository creation, an actual restic backup through
// michael, snapshot verification, telemetry, and revocation.
//
// Env (defaults target the compose stack):
//
//	FUBAR_IT=1                        enable the test
//	FUBAR_IT_API=http://localhost:3020
//	FUBAR_IT_OIDC=http://localhost:8092
//	FUBAR_IT_PG=postgres://postgres:postgres@localhost:15432/yucca
package main

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"fubar/internal/api"
	"fubar/internal/cli"
	"fubar/internal/config"
	"fubar/internal/keychain"
	"fubar/internal/restic"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func skipUnlessEnabled(t *testing.T) {
	if os.Getenv("FUBAR_IT") == "" {
		t.Skip("set FUBAR_IT=1 to run fubar integration tests against the dev stack")
	}
}

// approveDevice drives mock-oidc's device approval for a chosen sub.
func approveDevice(t *testing.T, verificationURI, userCode, sub string) {
	t.Helper()
	base, err := url.Parse(verificationURI)
	if err != nil {
		t.Fatal(err)
	}
	approve := fmt.Sprintf("%s://%s/api/form/device?user_code=%s&sub=%s",
		base.Scheme, base.Host, url.QueryEscape(userCode), url.QueryEscape(sub))
	resp, err := http.Get(approve)
	if err != nil {
		t.Fatalf("approve device: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("approve device: status %d", resp.StatusCode)
	}
}

// login runs a device-flow login of the given consumer type, approving as sub.
// Returns the session token (or the error, e.g. FEATURE_NOT_ENABLED).
func login(t *testing.T, ctx context.Context, apiBase, consumerType, sub string) (string, error) {
	t.Helper()
	type startInfo struct{ code, uri string }
	starts := make(chan startInfo, 1)

	done := make(chan struct {
		token string
		err   error
	}, 1)
	go func() {
		token, err := api.DeviceFlowAs(ctx, apiBase, consumerType, "fubar-it", func(e api.DeviceEvent) {
			starts <- startInfo{e.UserCode, e.VerificationURI}
		})
		done <- struct {
			token string
			err   error
		}{token, err}
	}()

	select {
	case s := <-starts:
		approveDevice(t, s.uri, s.code, sub)
	case <-time.After(20 * time.Second):
		t.Fatal("device flow did not START in time")
	}

	result := <-done
	return result.token, result.err
}

func TestFubarEndToEnd(t *testing.T) {
	skipUnlessEnabled(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	apiBase := env("FUBAR_IT_API", "http://localhost:3020")
	pgDSN := env("FUBAR_IT_PG", "postgres://postgres:postgres@localhost:15432/yucca")

	// Isolate all of fubar's on-disk state under a temp HOME.
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(tmp, ".config"))
	t.Setenv("XDG_CACHE_HOME", filepath.Join(tmp, ".cache"))
	// Force the file-fallback keychain (no OS keychain prompt in CI/tests).
	t.Setenv("FUBAR_NO_KEYCHAIN", "1")

	// Pre-warm the pinned restic binary (first run downloads it) so the
	// download does not eat the operational budget.
	if _, err := restic.Ensure(context.Background()); err != nil {
		t.Fatalf("ensure restic: %v", err)
	}

	sub := fmt.Sprintf("fubar-it-%d", time.Now().UnixNano())

	// 1. A fubar login before the flag is enabled must fail — but it creates
	//    the user (getOrCreateUser runs before the consumer gate).
	if _, err := login(t, ctx, apiBase, "fubar", sub); err == nil {
		t.Fatal("expected the first fubar login to fail (feature disabled)")
	}

	// 2. Enable multi-consumer for this freshly-created user.
	db, err := sql.Open("pgx", pgDSN)
	if err != nil {
		t.Fatalf("open pg: %v", err)
	}
	defer db.Close()

	var userID string
	if err := db.QueryRowContext(ctx, `SELECT id FROM users WHERE sub = $1`, sub).Scan(&userID); err != nil {
		t.Fatalf("find user: %v", err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO "userFeatureFlagOverride" ("userId", flag, value, "setBy")
		 VALUES ($1, 'multi-consumer', true, 'fubar-it')
		 ON CONFLICT ("userId", flag) DO UPDATE SET value = true`, userID); err != nil {
		t.Fatalf("enable flag: %v", err)
	}

	// 3. Now a fubar login succeeds.
	token, err := login(t, ctx, apiBase, "fubar", sub)
	if err != nil {
		t.Fatalf("fubar login after enabling flag: %v", err)
	}
	if err := config.SaveToken(&config.Token{API: apiBase, AccessToken: token}); err != nil {
		t.Fatal(err)
	}

	client := api.NewClient(apiBase, token)
	auth, err := client.GetAuth(ctx)
	if err != nil {
		t.Fatalf("get auth: %v", err)
	}
	if !auth.Features["multi-consumer"] {
		t.Fatal("expected multi-consumer to be enabled")
	}
	if auth.ConsumerID == nil {
		t.Fatal("expected the session to be bound to a consumer")
	}

	// 4. Create a repository and initialize the restic repo.
	repo, err := client.CreateRepository(ctx, "fubar-it-repo", false)
	if err != nil {
		t.Fatalf("create repository: %v", err)
	}
	if repo.ConsumerType != "fubar" {
		t.Fatalf("expected repository on the fubar consumer, got %q", repo.ConsumerType)
	}

	bin, err := restic.Ensure(ctx)
	if err != nil {
		t.Fatalf("ensure restic: %v", err)
	}
	password := keychain.Generate()
	if _, err := keychain.Store(repo.ID, password); err != nil {
		t.Fatal(err)
	}
	initURL, err := client.ResticURL(ctx, repo.ID)
	if err != nil {
		t.Fatalf("mint url: %v", err)
	}
	r := &restic.Restic{Bin: bin, Repo: initURL, Password: password}
	if _, err := r.EnsureInit(ctx); err != nil {
		t.Fatalf("restic init: %v", err)
	}

	// 5. Back up a small directory through fubar's config + plan machinery.
	dataDir := filepath.Join(tmp, "data")
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, "hello.txt"), []byte("fubar was here"), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{API: apiBase, Plans: []config.Plan{{
		Name:       "it",
		Repository: repo.ID,
		Paths:      []string{dataDir},
		KeepDaily:  2,
	}}}
	if err := config.Save(cfg); err != nil {
		t.Fatal(err)
	}

	result, err := cli.RunPlanForTest(ctx, client, bin, &cfg.Plans[0])
	if err != nil {
		t.Fatalf("backup: %v", err)
	}
	if result.SnapshotID == "" {
		t.Fatal("expected a snapshot id")
	}

	// 6. The snapshot exists in the repository.
	snapURL, err := client.ResticURL(ctx, repo.ID)
	if err != nil {
		t.Fatal(err)
	}
	snaps, err := (&restic.Restic{Bin: bin, Repo: snapURL, Password: password}).Snapshots(ctx)
	if err != nil {
		t.Fatalf("snapshots: %v", err)
	}
	if len(snaps) == 0 {
		t.Fatal("expected at least one snapshot")
	}

	// 7. Telemetry landed: metrics rows exist for the repository.
	var backups int
	if err := db.QueryRowContext(ctx,
		`SELECT count(*) FROM "repositoryMetricsHistory" WHERE "repositoryId" = $1`, repo.ID).Scan(&backups); err != nil {
		t.Fatalf("count metrics: %v", err)
	}
	if backups == 0 {
		t.Fatal("expected repositoryMetricsHistory rows from the backup")
	}

	// 8. Revocation: revoke the repo's tokens, and a fresh mint still works
	//    (revocation is per-jti; new tokens get a new jti).
	if _, err := db.ExecContext(ctx,
		`UPDATE "resticTokens" SET "revokedAt" = now(), "revokedBy" = 'fubar-it' WHERE "repositoryId" = $1`, repo.ID); err != nil {
		t.Fatalf("revoke tokens: %v", err)
	}
	freshURL, err := client.ResticURL(ctx, repo.ID)
	if err != nil {
		t.Fatalf("mint after revoke: %v", err)
	}
	if _, err := (&restic.Restic{Bin: bin, Repo: freshURL, Password: password}).Snapshots(ctx); err != nil {
		t.Fatalf("fresh token should work after revoking old ones: %v", err)
	}
}
