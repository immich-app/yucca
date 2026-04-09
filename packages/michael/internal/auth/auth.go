package auth

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"

	"michael/internal/httputil"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Auth struct {
	User       string `json:"user"`
	Repository string `json:"repository"`
	WriteOnce  bool   `json:"writeOnce"`
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

func Middleware(secret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			auth, err := extractAuth(r, secret)
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

type authError struct {
	code    int
	message string
}

func (e *authError) Error() string {
	return e.message
}

func extractAuth(r *http.Request, secret []byte) (Auth, *authError) {
	header := r.Header.Get("Authorization")
	if header == "" {
		return Auth{}, &authError{http.StatusUnauthorized, "Missing Authorization header"}
	}

	if !strings.HasPrefix(header, "Basic ") {
		return Auth{}, &authError{http.StatusUnauthorized, "Expected Basic auth"}
	}

	encoded := strings.TrimPrefix(header, "Basic ")
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		// Try URL-safe or raw encoding
		decoded, err = base64.RawStdEncoding.DecodeString(encoded)
		if err != nil {
			return Auth{}, &authError{http.StatusUnauthorized, "Invalid base64 in Authorization header"}
		}
	}

	parts := strings.SplitN(string(decoded), ":", 2)
	if len(parts) < 2 || parts[1] == "" {
		return Auth{}, &authError{http.StatusUnauthorized, "Expected Basic auth token"}
	}

	token := parts[1]

	parsed, err := jwt.Parse(token, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return secret, nil
	})
	if err != nil {
		return Auth{}, &authError{http.StatusUnauthorized, "Invalid JWT Token"}
	}

	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return Auth{}, &authError{http.StatusUnauthorized, "Invalid JWT claims"}
	}

	// Extract and validate auth fields
	auth := Auth{}

	user, ok := claims["user"].(string)
	if !ok || !isValidUUID(user) {
		return Auth{}, &authError{http.StatusBadRequest, "user must be a UUID"}
	}
	auth.User = user

	repository, ok := claims["repository"].(string)
	if !ok || !isValidUUID(repository) {
		return Auth{}, &authError{http.StatusBadRequest, "repository must be a UUID"}
	}
	auth.Repository = repository

	writeOnce, ok := claims["writeOnce"].(bool)
	if !ok {
		return Auth{}, &authError{http.StatusBadRequest, "writeOnce must be a boolean"}
	}
	auth.WriteOnce = writeOnce

	return auth, nil
}
