package proxy

import (
	"context"
	"io"
	"time"

	"golang.org/x/time/rate"
)

const throttleBurstDivisor = 10

type throttle struct {
	limiter *rate.Limiter
	window  *window
}

func newThrottle(bytesPerSec int, quietHours string) (*throttle, error) {
	if bytesPerSec <= 0 {
		return nil, nil
	}

	quiet, err := parseWindow(quietHours)
	if err != nil {
		return nil, err
	}

	burst := max(bytesPerSec/throttleBurstDivisor, copyBufferSize)

	return &throttle{limiter: rate.NewLimiter(rate.Limit(bytesPerSec), burst), window: quiet}, nil
}

func (limit *throttle) active(now time.Time) bool {
	if limit == nil {
		return false
	}

	return !limit.window.contains(now.Hour()*60 + now.Minute())
}

func pace(ctx context.Context, body io.ReadCloser, limit *throttle) io.ReadCloser {
	if !limit.active(time.Now()) {
		return body
	}

	return newPaced(ctx, body, limit.limiter)
}
