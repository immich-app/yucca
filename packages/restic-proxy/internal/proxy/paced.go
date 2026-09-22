package proxy

import (
	"context"
	"io"

	"golang.org/x/time/rate"
)

type paced struct {
	io.ReadCloser
	ctx     context.Context
	limiter *rate.Limiter
}

func newPaced(ctx context.Context, body io.ReadCloser, limiter *rate.Limiter) io.ReadCloser {
	return paced{ReadCloser: body, ctx: ctx, limiter: limiter}
}

func (reader paced) Read(buffer []byte) (int, error) {
	burst := reader.limiter.Burst()
	read, err := reader.ReadCloser.Read(buffer[:min(len(buffer), burst)])
	if read > 0 {
		if waited := reader.limiter.WaitN(reader.ctx, read); waited != nil {
			return read, waited
		}
	}

	return read, err
}
