// Package ceph implements health checks against a region's Ceph cluster RGW /
// dashboard endpoint, using the `rgw_s3_endpoint` + `health_cred_ref` fields of
// the ceph discovery payload (credential resolved via 1Password).
package ceph

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"yuctl/internal/op"
	"yuctl/internal/state"
)

// HealthResult summarizes a probe.
type HealthResult struct {
	Endpoint   string
	StatusCode int
	Healthy    bool
	Detail     string
}

// CheckHealth issues an HTTPS GET against the cluster's RGW S3 endpoint. A
// reachable gateway answers an anonymous/credentialed root GET with a 2xx
// (bucket listing) or an auth-style 4xx (AccessDenied/Forbidden) — either proves
// it is serving. Only a transport failure or a 5xx is treated as unhealthy.
//
// When health_cred_ref is set it is resolved via `op read` and sent as HTTP
// basic auth (`access:secret` if it contains a colon, otherwise as a bearer
// token), so credentialed dashboard/health endpoints work too.
func CheckHealth(ctx context.Context, cc state.CephCluster, insecureTLS bool) (*HealthResult, error) {
	endpoint := cc.RGWS3Endpoint
	if endpoint == "" {
		return nil, fmt.Errorf("ceph cluster %q has no rgw_s3_endpoint in discovery", cc.ClusterName)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}

	if cc.HealthCredRef != "" {
		cred, err := op.Read(ctx, cc.HealthCredRef)
		if err != nil {
			return nil, fmt.Errorf("resolve health credential: %w", err)
		}
		if user, pass, ok := strings.Cut(cred, ":"); ok {
			req.SetBasicAuth(user, pass)
		} else {
			req.Header.Set("Authorization", "Bearer "+cred)
		}
	}

	client := &http.Client{Timeout: 15 * time.Second}
	if insecureTLS {
		tr := http.DefaultTransport.(*http.Transport).Clone()
		tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
		client.Transport = tr
	}

	resp, err := client.Do(req)
	if err != nil {
		return &HealthResult{Endpoint: endpoint, Healthy: false, Detail: err.Error()}, nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	res := &HealthResult{
		Endpoint:   endpoint,
		StatusCode: resp.StatusCode,
		Healthy:    resp.StatusCode < 500,
		Detail:     strings.TrimSpace(string(body)),
	}
	return res, nil
}
