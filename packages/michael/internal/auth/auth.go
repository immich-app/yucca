package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"

	"michael/internal/httputil"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Auth struct {
	User       string `json:"user"`
	Repository string `json:"repository"`
	WriteOnce  bool   `json:"writeOnce"`
	// Optional claims: legacy tokens carry neither. Jti identifies the token
	// for revocation; Connection is the connection *type* (immich/restic).
	Jti        string `json:"jti"`
	Connection string `json:"connection"`
}

type contextKey string

const authContextKey contextKey = "auth"

// NewContext returns a new context with the given Auth value.
func NewContext(ctx context.Context, a Auth) context.Context {
	return context.WithValue(ctx, authContextKey, a)
}

func isValidUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
}

func FromContext(ctx context.Context) Auth {
	return ctx.Value(authContextKey).(Auth)
}

const (
	cacheSize = 8192
	// cache lifetime for tokens carrying no exp claim
	defaultCacheTTL = 5 * time.Minute
)

// Verifier authenticates requests, caching verified tokens so the hot path is
// a map lookup instead of an ECDSA verify per request (restic reuses one token
// for a whole session). Only signature-valid tokens enter the cache, and
// entries expire with the token's exp claim.
type Verifier struct {
	publicKey *ecdsa.PublicKey
	cache     *tokenCache
	onLookup  func(hit bool)
}

// NewVerifier builds a Verifier. onLookup, if non-nil, is called with the
// cache outcome of every authenticated request.
func NewVerifier(publicKey *ecdsa.PublicKey, onLookup func(hit bool)) *Verifier {
	return &Verifier{
		publicKey: publicKey,
		cache:     newTokenCache(cacheSize),
		onLookup:  onLookup,
	}
}

func (v *Verifier) authenticate(r *http.Request) (Auth, *authError) {
	header := r.Header.Get("Authorization")
	if header == "" {
		return Auth{}, &authError{http.StatusUnauthorized, "Missing Authorization header"}
	}

	key := sha256.Sum256([]byte(header))
	if a, ok := v.cache.get(key, time.Now()); ok {
		v.lookup(true)
		return a, nil
	}
	v.lookup(false)

	a, exp, err := extractAuth(r, v.publicKey)
	if err != nil {
		return Auth{}, err
	}
	if exp.IsZero() {
		exp = time.Now().Add(defaultCacheTTL)
	}
	v.cache.put(key, a, exp)
	return a, nil
}

func (v *Verifier) lookup(hit bool) {
	if v.onLookup != nil {
		v.onLookup(hit)
	}
}

func (v *Verifier) Middleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			auth, err := v.authenticate(r)
			if err != nil {
				httputil.WriteError(w, r, err.code, err.message)
				return
			}

			// Validate path param matches auth repository
			path := chi.URLParam(r, "path")
			if path != "" && path != auth.Repository {
				httputil.WriteError(w, r, http.StatusBadRequest, "Repository mismatch")
				return
			}

			ctx := context.WithValue(r.Context(), authContextKey, auth)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func Middleware(publicKey *ecdsa.PublicKey) func(http.Handler) http.Handler {
	return NewVerifier(publicKey, nil).Middleware()
}

type authError struct {
	code    int
	message string
}

func (e *authError) Error() string {
	return e.message
}

// extractAuth verifies the request's token and returns the Auth plus the
// token's exp claim (zero if absent).
func extractAuth(r *http.Request, publicKey *ecdsa.PublicKey) (Auth, time.Time, *authError) {
	header := r.Header.Get("Authorization")
	if header == "" {
		return Auth{}, time.Time{}, &authError{http.StatusUnauthorized, "Missing Authorization header"}
	}

	if !strings.HasPrefix(header, "Basic ") {
		return Auth{}, time.Time{}, &authError{http.StatusUnauthorized, "Expected Basic auth"}
	}

	encoded := strings.TrimPrefix(header, "Basic ")
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		// Try URL-safe or raw encoding
		decoded, err = base64.RawStdEncoding.DecodeString(encoded)
		if err != nil {
			return Auth{}, time.Time{}, &authError{http.StatusUnauthorized, "Invalid base64 in Authorization header"}
		}
	}

	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) < 2 || parts[1] == "" {
		return Auth{}, time.Time{}, &authError{http.StatusUnauthorized, "Expected Basic auth token"}
	}

	token := parts[1]

	parsed, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodECDSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return publicKey, nil
	})
	if err != nil {
		return Auth{}, time.Time{}, &authError{http.StatusUnauthorized, "Invalid JWT Token"}
	}

	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return Auth{}, time.Time{}, &authError{http.StatusUnauthorized, "Invalid JWT claims"}
	}

	// Extract and validate auth fields
	auth := Auth{}

	user, ok := claims["user"].(string)
	if !ok || !isValidUUID(user) {
		return Auth{}, time.Time{}, &authError{http.StatusBadRequest, "user must be a UUID"}
	}
	auth.User = user

	repository, ok := claims["repository"].(string)
	if !ok || !isValidUUID(repository) {
		return Auth{}, time.Time{}, &authError{http.StatusBadRequest, "repository must be a UUID"}
	}
	auth.Repository = repository

	writeOnce, ok := claims["writeOnce"].(bool)
	if !ok {
		return Auth{}, time.Time{}, &authError{http.StatusBadRequest, "writeOnce must be a boolean"}
	}
	auth.WriteOnce = writeOnce

	// jti and connection are optional — tokens minted before the connection model
	// carry neither, and non-string values are simply ignored.
	if jti, ok := claims["jti"].(string); ok {
		auth.Jti = jti
	}
	if connection, ok := claims["connection"].(string); ok {
		auth.Connection = connection
	}

	var exp time.Time
	if expTime, _ := claims.GetExpirationTime(); expTime != nil {
		exp = expTime.Time
	}

	return auth, exp, nil
}
