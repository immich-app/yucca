package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"columbo/internal/agent"
)

const validBody = `{"ticketThreadId":"t1","staffThreadId":"s1","discordUserId":"d1","username":"u","userId":"user-1","description":"my backups fail"}`

func post(handler http.Handler, secret, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/internal/investigations", strings.NewReader(body))
	if secret != "" {
		req.Header.Set("X-Internal-Secret", secret)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}

func TestGuardFailsClosedWithoutConfiguredSecret(t *testing.T) {
	handler := New("", func(agent.Investigation) bool { return true }).Handler()
	if got := post(handler, "", validBody).Code; got != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", got)
	}
}

func TestGuardRejectsWrongSecret(t *testing.T) {
	handler := New("right", func(agent.Investigation) bool { return true }).Handler()
	if got := post(handler, "wrong", validBody).Code; got != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", got)
	}
}

func TestValidRequestIsAccepted(t *testing.T) {
	var enqueued agent.Investigation
	handler := New("secret", func(inv agent.Investigation) bool {
		enqueued = inv
		return true
	}).Handler()
	if got := post(handler, "secret", validBody).Code; got != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", got)
	}
	if enqueued.UserID != "user-1" || enqueued.StaffThreadID != "s1" {
		t.Fatalf("unexpected investigation %+v", enqueued)
	}
}

func TestMissingFieldsAreRejected(t *testing.T) {
	handler := New("secret", func(agent.Investigation) bool { return true }).Handler()
	if got := post(handler, "secret", `{"staffThreadId":"s1"}`).Code; got != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", got)
	}
}

func TestFullQueueReturns503(t *testing.T) {
	handler := New("secret", func(agent.Investigation) bool { return false }).Handler()
	if got := post(handler, "secret", validBody).Code; got != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", got)
	}
}
