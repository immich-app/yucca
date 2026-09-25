package client

import (
	"context"
	"encoding/base64"
	"encoding/json/v2"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var AccessTokenCookie = "yucca-access-token"

type StatusError struct {
	Code   int
	Status string
}

func (err *StatusError) Error() string {
	return fmt.Sprintf("yucca API responded %s", err.Status)
}

type Grant struct {
	SessionToken string
	Username     string
	Password     string
	Scheme       string
	Host         string
	Path         string

	ExpiresAt time.Time
}

func (client *Client) Grant(ctx context.Context, token string, repositoryId string) (Grant, error) {
	var repositoryGrant struct {
		URL string `json:"url"`
	}

	err := client.send(ctx, http.MethodPost, "/repository/"+repositoryId+"/restic", token, nil, http.StatusCreated, &repositoryGrant)
	if err != nil {
		return Grant{}, err
	}

	parsed, err := url.Parse(strings.TrimPrefix(repositoryGrant.URL, "rest:"))
	if err != nil {
		return Grant{}, fmt.Errorf("could not parse restic URL: %w", err)
	}

	tokenString, ok := parsed.User.Password()
	if !ok {
		return Grant{}, fmt.Errorf("no credential in restic URL")
	}

	parts := strings.Split(tokenString, ".")
	if len(parts) != 3 {
		return Grant{}, fmt.Errorf("invalid JWT from server")
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return Grant{}, err
	}

	var claims struct {
		Exp int64 `json:"exp"`
	}

	err = json.Unmarshal(payload, &claims)
	if err != nil {
		return Grant{}, err
	}

	if claims.Exp == 0 {
		return Grant{}, fmt.Errorf("expiry missing from grant")
	}

	expiresAt := time.Unix(claims.Exp, 0)
	if expiresAt.Before(time.Now()) {
		return Grant{}, fmt.Errorf("received grant in the past")
	}

	return Grant{
		SessionToken: token,
		Username:     parsed.User.Username(),
		Password:     tokenString,
		Scheme:       parsed.Scheme,
		Host:         parsed.Host,
		Path:         parsed.Path,

		ExpiresAt: expiresAt,
	}, nil
}
