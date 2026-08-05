// Package credentials opens the per-repository S3 credentials a restic token
// carries. michael has none of its own, so a request reaches only the bucket
// the token it presents was sealed for.
package credentials

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type Credentials struct {
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
}

// Fingerprint keys a credential pair without retaining the secret.
func (c Credentials) Fingerprint() [32]byte {
	return sha256.Sum256([]byte(c.AccessKeyID + "\x00" + c.SecretAccessKey))
}

// Wire format, written by @common/server sealStorageCredentials:
//
//	base64url(version[1] || nonce[12] || ciphertext || tag[16])
//
// AES-256-GCM over the JSON above, with the repository id as additional
// authenticated data — a blob lifted out of one repository's token does not
// open against another's.
const (
	version    = 1
	keyBytes   = 32
	nonceBytes = 12
	tagBytes   = 16
)

// Every key is accepted when opening, so the API can start sealing with a new
// one before the old one is withdrawn.
func ParseKeys(value string) ([][]byte, error) {
	var keys [][]byte
	for _, entry := range strings.Split(value, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		key, err := base64.StdEncoding.DecodeString(entry)
		if err != nil {
			return nil, fmt.Errorf("storage credential key is not valid base64: %w", err)
		}
		if len(key) != keyBytes {
			return nil, fmt.Errorf("storage credential key must be %d bytes, got %d", keyBytes, len(key))
		}
		keys = append(keys, key)
	}
	if len(keys) == 0 {
		return nil, errors.New("at least one storage credential key is required")
	}
	return keys, nil
}

// Seal exists only so the format can be round-tripped in tests; in production
// the TypeScript side is the only writer.
func Seal(key []byte, repositoryID string, creds Credentials) (string, error) {
	if len(key) != keyBytes {
		return "", fmt.Errorf("storage credential key must be %d bytes, got %d", keyBytes, len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, nonceBytes)
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	plaintext, err := json.Marshal(creds)
	if err != nil {
		return "", err
	}

	blob := append([]byte{version}, nonce...)
	blob = gcm.Seal(blob, nonce, plaintext, []byte(repositoryID))
	return base64.RawURLEncoding.EncodeToString(blob), nil
}

func Open(keys [][]byte, repositoryID, sealed string) (Credentials, error) {
	blob, err := decode(sealed)
	if err != nil {
		return Credentials{}, err
	}
	if len(blob) < 1+nonceBytes+tagBytes {
		return Credentials{}, errors.New("sealed storage credentials are truncated")
	}
	if blob[0] != version {
		return Credentials{}, fmt.Errorf("unsupported sealed storage credential version %d", blob[0])
	}

	nonce := blob[1 : 1+nonceBytes]
	ciphertext := blob[1+nonceBytes:]

	for _, key := range keys {
		block, err := aes.NewCipher(key)
		if err != nil {
			return Credentials{}, err
		}
		gcm, err := cipher.NewGCM(block)
		if err != nil {
			return Credentials{}, err
		}
		plaintext, err := gcm.Open(nil, nonce, ciphertext, []byte(repositoryID))
		if err != nil {
			continue
		}

		var creds Credentials
		if err := json.Unmarshal(plaintext, &creds); err != nil {
			return Credentials{}, fmt.Errorf("sealed storage credentials are malformed: %w", err)
		}
		if creds.AccessKeyID == "" || creds.SecretAccessKey == "" {
			return Credentials{}, errors.New("sealed storage credentials are incomplete")
		}
		return creds, nil
	}

	return Credentials{}, errors.New("sealed storage credentials could not be opened with any configured key")
}

func decode(sealed string) ([]byte, error) {
	if blob, err := base64.RawURLEncoding.DecodeString(sealed); err == nil {
		return blob, nil
	}
	blob, err := base64.URLEncoding.DecodeString(sealed)
	if err != nil {
		return nil, fmt.Errorf("sealed storage credentials are not valid base64url: %w", err)
	}
	return blob, nil
}

type contextKey struct{}

func NewContext(ctx context.Context, c Credentials) context.Context {
	return context.WithValue(ctx, contextKey{}, c)
}

func FromContext(ctx context.Context) (Credentials, bool) {
	c, ok := ctx.Value(contextKey{}).(Credentials)
	return c, ok
}
