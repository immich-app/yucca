package revocation

import (
	"context"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
)

func newTestRevoker(t *testing.T, cacheTTL time.Duration) (*miniredis.Miniredis, *RedisRevoker) {
	t.Helper()
	mr := miniredis.RunT(t)
	r := NewRedisRevoker(mr.Addr(), 100*time.Millisecond, cacheTTL)
	t.Cleanup(func() { _ = r.Close() })
	return mr, r
}

func TestIsRevokedFalseWhenAbsent(t *testing.T) {
	_, r := newTestRevoker(t, time.Second)

	revoked, err := r.IsRevoked(context.Background(), "some-jti")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if revoked {
		t.Fatal("expected not revoked")
	}
}

func TestIsRevokedTrueWhenPresent(t *testing.T) {
	mr, r := newTestRevoker(t, time.Second)
	if err := mr.Set(keyFor("bad-jti"), "1"); err != nil {
		t.Fatal(err)
	}

	revoked, err := r.IsRevoked(context.Background(), "bad-jti")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !revoked {
		t.Fatal("expected revoked")
	}
}

func TestIsRevokedCachesResults(t *testing.T) {
	mr, r := newTestRevoker(t, time.Minute)

	revoked, err := r.IsRevoked(context.Background(), "jti")
	if err != nil || revoked {
		t.Fatalf("expected not revoked, got %v/%v", revoked, err)
	}

	// The key appearing after a cached negative result is not seen until the
	// cache entry expires.
	if err := mr.Set(keyFor("jti"), "1"); err != nil {
		t.Fatal(err)
	}
	revoked, err = r.IsRevoked(context.Background(), "jti")
	if err != nil || revoked {
		t.Fatalf("expected cached not-revoked, got %v/%v", revoked, err)
	}
}

func TestIsRevokedCacheExpiry(t *testing.T) {
	mr, r := newTestRevoker(t, time.Nanosecond)

	if _, err := r.IsRevoked(context.Background(), "jti"); err != nil {
		t.Fatal(err)
	}
	if err := mr.Set(keyFor("jti"), "1"); err != nil {
		t.Fatal(err)
	}
	time.Sleep(time.Millisecond)

	revoked, err := r.IsRevoked(context.Background(), "jti")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !revoked {
		t.Fatal("expected revoked after cache expiry")
	}
}

func TestIsRevokedErrorsWhenDown(t *testing.T) {
	mr, r := newTestRevoker(t, time.Second)
	mr.Close()

	if _, err := r.IsRevoked(context.Background(), "jti"); err == nil {
		t.Fatal("expected error when redis is down")
	}
}

func TestIsRevokedErrorsAreNotCached(t *testing.T) {
	mr, r := newTestRevoker(t, time.Minute)
	mr.Close()

	if _, err := r.IsRevoked(context.Background(), "jti"); err == nil {
		t.Fatal("expected error when redis is down")
	}

	// Recovery: miniredis restart on the same address isn't possible, so use
	// a fresh instance to prove errors were not cached as answers.
	mr2 := miniredis.RunT(t)
	r2 := NewRedisRevoker(mr2.Addr(), 100*time.Millisecond, time.Minute)
	t.Cleanup(func() { _ = r2.Close() })
	if err := mr2.Set(keyFor("jti"), "1"); err != nil {
		t.Fatal(err)
	}
	revoked, err := r2.IsRevoked(context.Background(), "jti")
	if err != nil || !revoked {
		t.Fatalf("expected revoked after recovery, got %v/%v", revoked, err)
	}
}
