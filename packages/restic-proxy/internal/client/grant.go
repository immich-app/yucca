package client

import (
	"context"
	"encoding/base64"
	"encoding/json/v2"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var accessTokenCookie = "yucca-access-token"

type StatusError struct {
	Code   int
	Status string
}

func (err *StatusError) Error() string {
	return fmt.Sprintf("could not generate restic URL: %s", err.Status)
}

type Grant struct {
	Username string
	Password string
	Scheme   string
	Host     string
	Path     string

	ExpiresAt time.Time
}

func (client *Client) Grant(ctx context.Context, token, repositoryId string) (Grant, error) {
	request, err := http.NewRequestWithContext(ctx, "POST", client.meta.ApiUrl+"/repository/"+repositoryId+"/restic", nil)
	if err != nil {
		return Grant{}, err
	}

	request.AddCookie(&http.Cookie{Name: accessTokenCookie, Value: token})

	response, err := client.http.Do(request)
	if err != nil {
		return Grant{}, err
	}

	defer response.Body.Close()

	if response.StatusCode != http.StatusCreated {
		return Grant{}, &StatusError{Code: response.StatusCode, Status: response.Status}
	}

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return Grant{}, err
	}

	var repositoryGrant struct {
		URL string `json:"url"`
	}

	if err := json.Unmarshal(body, &repositoryGrant); err != nil {
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

	if err := json.Unmarshal(payload, &claims); err != nil {
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
		Username: parsed.User.Username(),
		Password: tokenString,
		Scheme:   parsed.Scheme,
		Host:     parsed.Host,
		Path:     parsed.Path,

		ExpiresAt: expiresAt,
	}, nil
}
