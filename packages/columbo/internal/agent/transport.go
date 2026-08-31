package agent

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"time"

	"github.com/rs/zerolog"
)

const maxModelResponseBytes = 16 << 20

// retryTransport retries model calls on transport errors, timeouts, and
// retryable statuses (408/429/5xx). Each attempt gets its own deadline and
// the response body is buffered INSIDE the attempt — the failure this exists
// for was a completion stalling mid-body, which is unreachable to a retry
// once RoundTrip has returned a streaming body. Chat completions are small;
// buffering trades streaming (unused) for retryability.
type retryTransport struct {
	base       http.RoundTripper
	attempts   int
	perAttempt time.Duration
}

func (t *retryTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	logger := zerolog.Ctx(req.Context())
	var lastErr error
	var lastResp *http.Response
	for attempt := 1; attempt <= t.attempts; attempt++ {
		if attempt > 1 {
			if req.Body != nil && req.GetBody == nil {
				break
			}
			select {
			case <-req.Context().Done():
				return nil, req.Context().Err()
			case <-time.After(time.Duration(attempt-1) * time.Second):
			}
		}

		resp, err := t.attempt(req, attempt)
		if err != nil {
			if req.Context().Err() != nil {
				return nil, req.Context().Err()
			}
			logger.Warn().Err(err).Int("attempt", attempt).Msg("model call attempt failed")
			lastErr = err
			lastResp = nil
			continue
		}
		if !retryableStatus(resp.StatusCode) {
			return resp, nil
		}
		logger.Warn().Int("attempt", attempt).Int("status", resp.StatusCode).Msg("model call attempt got a retryable status")
		lastErr = nil
		lastResp = resp
	}
	if lastResp != nil {
		return lastResp, nil
	}
	return nil, lastErr
}

func (t *retryTransport) attempt(req *http.Request, attempt int) (*http.Response, error) {
	ctx := req.Context()
	cancel := context.CancelFunc(func() {})
	if t.perAttempt > 0 {
		ctx, cancel = context.WithTimeout(ctx, t.perAttempt)
	}
	defer cancel()

	attemptReq := req.Clone(ctx)
	if attempt > 1 && req.GetBody != nil {
		body, err := req.GetBody()
		if err != nil {
			return nil, err
		}
		attemptReq.Body = body
	}

	resp, err := t.base.RoundTrip(attemptReq)
	if err != nil {
		return nil, err
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxModelResponseBytes))
	_ = resp.Body.Close()
	if err != nil {
		return nil, err
	}
	resp.Body = io.NopCloser(bytes.NewReader(body))
	return resp, nil
}

func retryableStatus(status int) bool {
	return status == http.StatusRequestTimeout || status == http.StatusTooManyRequests || status >= 500
}
