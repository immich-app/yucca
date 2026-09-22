package proxy

import (
	"context"
	"io"
	"sync/atomic"
	"time"
)

type paced struct {
	io.ReadCloser
	ctx      context.Context
	throttle *atomic.Pointer[throttle]
}

func newPaced(ctx context.Context, body io.ReadCloser, current *atomic.Pointer[throttle]) io.ReadCloser {
	return paced{ReadCloser: body, ctx: ctx, throttle: current}
}

func (reader paced) Read(buffer []byte) (int, error) {
	limit := reader.throttle.Load()
	if !limit.active(time.Now()) {
		return reader.ReadCloser.Read(buffer)
	}

	read, err := reader.ReadCloser.Read(buffer[:min(len(buffer), limit.limiter.Burst())])
	if read > 0 {
		if waited := limit.limiter.WaitN(reader.ctx, read); waited != nil {
			return read, waited
		}
	}

	return read, err
}
