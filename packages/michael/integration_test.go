//go:build integration

package main

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"michael/internal/config"
	"michael/internal/handlers"
	"michael/internal/storage"

	"github.com/golang-jwt/jwt/v5"
)

var testPrivateKey, _ = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
var testPublicKey = &testPrivateKey.PublicKey

const (
	testUser       = "00000000-0000-0000-0000-000000000001"
	testRepository = "00000000-0000-0000-0000-000000000002"
)

func integrationConfig() config.Config {
	return config.Config{
		Port:              3010,
		JWTPublicKey:      testPublicKey,
		S3AccessKeyID:     envOrDefault("S3_ACCESS_KEY_ID", "minio"),
		S3SecretAccessKey: envOrDefault("S3_SECRET_ACCESS_KEY", "miniominio"),
		S3Region:          envOrDefault("S3_REGION", "minio"),
		S3Endpoint:        envOrDefault("S3_ENDPOINT", "http://localhost:9000"),
		S3ForcePathStyle:  true,
	}
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func integrationJWT(t *testing.T, _ config.Config, repo string, writeOnce bool) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{
		"user":       testUser,
		"repository": repo,
		"writeOnce":  writeOnce,
		"exp":        jwt.NewNumericDate(time.Now().Add(time.Hour)),
	})
	signed, err := token.SignedString(testPrivateKey)
	if err != nil {
		t.Fatalf("sign jwt: %v", err)
	}
	return signed
}

func integrationAuth(token string) string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte("restic:"+token))
}

func TestIntegration_FullWorkflow(t *testing.T) {
	cfg := integrationConfig()
	store := storage.NewS3Storage(cfg)
	srv := handlers.NewServer(store, cfg.JWTPublicKey, nil)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	repo := "00000000-0000-0000-0000-000000000e01"
	token := integrationJWT(t, cfg, repo, false)
	authHeader := integrationAuth(token)

	client := ts.Client()

	// 1. Create repository
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/"+repo+"/?create=true", nil)
	req.Header.Set("Authorization", authHeader)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("create repo: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("create repo: expected 200, got %d", resp.StatusCode)
	}

	// 2. Create again → 409
	req, _ = http.NewRequest(http.MethodPost, ts.URL+"/"+repo+"/?create=true", nil)
	req.Header.Set("Authorization", authHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("create repo again: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("create repo again: expected 409, got %d", resp.StatusCode)
	}

	// 3. Save config
	configData := []byte("test-config-data")
	req, _ = http.NewRequest(http.MethodPost, ts.URL+"/"+repo+"/config", bytes.NewReader(configData))
	req.Header.Set("Authorization", authHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("save config: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("save config: expected 200, got %d", resp.StatusCode)
	}

	// 4. Check config
	req, _ = http.NewRequest(http.MethodHead, ts.URL+"/"+repo+"/config", nil)
	req.Header.Set("Authorization", authHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("check config: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("check config: expected 200, got %d", resp.StatusCode)
	}

	// 5. Get config
	req, _ = http.NewRequest(http.MethodGet, ts.URL+"/"+repo+"/config", nil)
	req.Header.Set("Authorization", authHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("get config: %v", err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("get config: expected 200, got %d", resp.StatusCode)
	}
	if string(body) != string(configData) {
		t.Errorf("get config: expected %q, got %q", configData, body)
	}

	// 6. Save a blob
	blobData := []byte("hello world blob data for testing")
	hash := sha256.Sum256(blobData)
	blobName := hex.EncodeToString(hash[:])

	req, _ = http.NewRequest(http.MethodPost, ts.URL+"/"+repo+"/data/"+blobName, bytes.NewReader(blobData))
	req.Header.Set("Authorization", authHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("save blob: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("save blob: expected 200, got %d", resp.StatusCode)
	}

	// 7. Check blob
	req, _ = http.NewRequest(http.MethodHead, ts.URL+"/"+repo+"/data/"+blobName, nil)
	req.Header.Set("Authorization", authHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("check blob: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("check blob: expected 200, got %d", resp.StatusCode)
	}
	if cl := resp.Header.Get("Content-Length"); cl != fmt.Sprintf("%d", len(blobData)) {
		t.Errorf("check blob: expected Content-Length %d, got %s", len(blobData), cl)
	}

	// 8. Get blob
	req, _ = http.NewRequest(http.MethodGet, ts.URL+"/"+repo+"/data/"+blobName, nil)
	req.Header.Set("Authorization", authHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("get blob: %v", err)
	}
	body, _ = io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("get blob: expected 200, got %d", resp.StatusCode)
	}
	if string(body) != string(blobData) {
		t.Errorf("get blob: expected %q, got %q", blobData, body)
	}

	// 9. List blobs
	req, _ = http.NewRequest(http.MethodGet, ts.URL+"/"+repo+"/data", nil)
	req.Header.Set("Authorization", authHeader)
	req.Header.Set("Accept", handlers.ContentTypeResticV2)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("list blobs: %v", err)
	}
	var blobs []storage.BlobInfo
	json.NewDecoder(resp.Body).Decode(&blobs)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list blobs: expected 200, got %d", resp.StatusCode)
	}
	if len(blobs) != 1 {
		t.Errorf("list blobs: expected 1 blob, got %d", len(blobs))
	}
	if len(blobs) > 0 && blobs[0].Name != blobName {
		t.Errorf("list blobs: expected name %s, got %s", blobName, blobs[0].Name)
	}

	// 10. Delete blob
	req, _ = http.NewRequest(http.MethodDelete, ts.URL+"/"+repo+"/data/"+blobName, nil)
	req.Header.Set("Authorization", authHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("delete blob: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("delete blob: expected 200, got %d", resp.StatusCode)
	}

	// 11. Delete config
	req, _ = http.NewRequest(http.MethodDelete, ts.URL+"/"+repo+"/config", nil)
	req.Header.Set("Authorization", authHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("delete config: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("delete config: expected 200, got %d", resp.StatusCode)
	}
}

func TestIntegration_WORM(t *testing.T) {
	cfg := integrationConfig()
	store := storage.NewS3Storage(cfg)
	srv := handlers.NewServer(store, cfg.JWTPublicKey, nil)
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	repo := "00000000-0000-0000-0000-000000000e02"
	normalToken := integrationJWT(t, cfg, repo, false)
	wormToken := integrationJWT(t, cfg, repo, true)
	normalAuth := integrationAuth(normalToken)
	wormAuthHeader := integrationAuth(wormToken)

	client := ts.Client()

	// Create repo
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/"+repo+"/?create=true", nil)
	req.Header.Set("Authorization", normalAuth)
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("create repo: %v", err)
	}
	resp.Body.Close()

	// Save config with WORM
	req, _ = http.NewRequest(http.MethodPost, ts.URL+"/"+repo+"/config", bytes.NewReader([]byte("worm-config")))
	req.Header.Set("Authorization", wormAuthHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("save config: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("save config: expected 200, got %d", resp.StatusCode)
	}

	// Delete config with WORM → 403
	req, _ = http.NewRequest(http.MethodDelete, ts.URL+"/"+repo+"/config", nil)
	req.Header.Set("Authorization", wormAuthHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("delete config worm: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("delete config worm: expected 403, got %d", resp.StatusCode)
	}

	// Save blob with WORM
	blobData := []byte("worm blob data for testing")
	hash := sha256.Sum256(blobData)
	blobName := hex.EncodeToString(hash[:])

	req, _ = http.NewRequest(http.MethodPost, ts.URL+"/"+repo+"/data/"+blobName, bytes.NewReader(blobData))
	req.Header.Set("Authorization", wormAuthHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("save blob: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("save blob: expected 200, got %d", resp.StatusCode)
	}

	// Delete blob with WORM → 403
	req, _ = http.NewRequest(http.MethodDelete, ts.URL+"/"+repo+"/data/"+blobName, nil)
	req.Header.Set("Authorization", wormAuthHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("delete blob worm: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("delete blob worm: expected 403, got %d", resp.StatusCode)
	}

	// Save lock blob
	lockData := []byte("lock data for testing worm exemption")
	lockHash := sha256.Sum256(lockData)
	lockName := hex.EncodeToString(lockHash[:])

	req, _ = http.NewRequest(http.MethodPost, ts.URL+"/"+repo+"/locks/"+lockName, bytes.NewReader(lockData))
	req.Header.Set("Authorization", wormAuthHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("save lock: %v", err)
	}
	resp.Body.Close()

	// Delete lock with WORM → should succeed (locks exempt)
	req, _ = http.NewRequest(http.MethodDelete, ts.URL+"/"+repo+"/locks/"+lockName, nil)
	req.Header.Set("Authorization", wormAuthHeader)
	resp, err = client.Do(req)
	if err != nil {
		t.Fatalf("delete lock worm: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("delete lock worm: expected 200 (locks exempt), got %d", resp.StatusCode)
	}
}
