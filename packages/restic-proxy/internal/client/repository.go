package client

import (
	"context"
	"net/http"
)

type Repository struct {
	Id   string `json:"id"`
	Name string `json:"name"`
	Worm bool   `json:"worm"`
}

func (client *Client) CreateRepository(ctx context.Context, token string, name string, worm bool) (Repository, error) {
	payload := struct {
		Name string `json:"name"`
		Worm bool   `json:"worm"`
	}{Name: name, Worm: worm}

	var created struct {
		Repository Repository `json:"repository"`
	}

	err := client.send(ctx, http.MethodPost, "/repository", token, payload, http.StatusCreated, &created)
	if err != nil {
		return Repository{}, err
	}

	return created.Repository, nil
}

func (client *Client) ListRepositories(ctx context.Context, token string) ([]Repository, error) {
	var listed struct {
		Repositories []Repository `json:"repositories"`
	}

	err := client.send(ctx, http.MethodGet, "/repository", token, nil, http.StatusOK, &listed)
	if err != nil {
		return nil, err
	}

	return listed.Repositories, nil
}
