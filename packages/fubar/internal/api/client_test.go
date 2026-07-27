package api

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDeviceFlowSuccess(t *testing.T) {
	var gotStart DeviceEvent
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/auth/oidc/device" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		if r.URL.Query().Get("consumer_type") != "fubar" {
			t.Errorf("expected consumer_type=fubar, got %q", r.URL.Query().Get("consumer_type"))
		}
		if r.URL.Query().Get("consumer_name") != "my laptop" {
			t.Errorf("expected consumer_name to round-trip, got %q", r.URL.Query().Get("consumer_name"))
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"type\":\"START\",\"userCode\":\"ABCD\",\"verificationUri\":\"http://v\"}\n\n")
		fmt.Fprint(w, "data: {\"type\":\"SUCCESS\",\"accessToken\":\"tok123\"}\n\n")
	}))
	defer srv.Close()

	token, err := DeviceFlow(context.Background(), srv.URL, "my laptop", func(e DeviceEvent) { gotStart = e })
	if err != nil {
		t.Fatal(err)
	}
	if token != "tok123" {
		t.Fatalf("expected tok123, got %q", token)
	}
	if gotStart.UserCode != "ABCD" || gotStart.VerificationURI != "http://v" {
		t.Fatalf("start event mismatch: %+v", gotStart)
	}
}

func TestDeviceFlowFeatureNotEnabled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"type\":\"FAILURE\",\"reason\":\"FEATURE_NOT_ENABLED\"}\n\n")
	}))
	defer srv.Close()

	_, err := DeviceFlow(context.Background(), srv.URL, "x", nil)
	if err == nil || !strings.Contains(err.Error(), "consumer-fubar") {
		t.Fatalf("expected feature-not-enabled error, got %v", err)
	}
}

func TestClientSendsSessionCookie(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("yucca-access-token")
		if err != nil || cookie.Value != "session-token" {
			t.Errorf("expected session cookie, got %v", r.Cookies())
		}
		fmt.Fprint(w, `{"url":"rest:http://restic:jwt@host/repo"}`)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "session-token")
	url, err := client.ResticURL(context.Background(), "repo")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(url, "rest:") {
		t.Fatalf("unexpected url %q", url)
	}
}

func TestClientUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	client := NewClient(srv.URL, "stale")
	if _, err := client.GetAuth(context.Background()); err == nil || !strings.Contains(err.Error(), "fubar login") {
		t.Fatalf("expected login hint, got %v", err)
	}
}
