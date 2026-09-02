package proxy

import (
	"net"
	"net/http"
	"net/http/httputil"
	"restic-proxy/internal/client"
	"sync"
	"time"

	"github.com/cornelk/hashmap"
	"github.com/rs/zerolog/log"
)

type routed struct {
	key   string
	grant client.Grant
	path  string
}

type contextKey struct{}

func reverseProxy(grants *hashmap.Map[string, client.Grant]) *httputil.ReverseProxy {
	return &httputil.ReverseProxy{
		Transport:  newTransport(),
		BufferPool: newBufferPool(),
		Rewrite: func(request *httputil.ProxyRequest) {
			route := request.In.Context().Value(contextKey{}).(routed)
			request.Out.URL.Scheme = route.grant.Scheme
			request.Out.URL.Host = route.grant.Host
			request.Out.Host = route.grant.Host
			request.Out.URL.Path = route.grant.Path + "/" + route.path
			request.Out.SetBasicAuth("restic", route.grant.Password)
			log.Debug().Any("host", request.Out.Host).Str("path", request.Out.URL.Path).Msg("forwarded request")
		},
		ModifyResponse: func(response *http.Response) error {
			if response.StatusCode != http.StatusUnauthorized {
				return nil
			}

			route := response.Request.Context().Value(contextKey{}).(routed)
			grants.Del(route.key)

			if err := response.Body.Close(); err != nil {
				return err
			}

			response.StatusCode = http.StatusServiceUnavailable
			response.Status = http.StatusText(http.StatusServiceUnavailable)
			response.Header = http.Header{"Content-Type": []string{"application/json"}}
			response.Body = http.NoBody
			response.ContentLength = 0

			return nil
		},
		ErrorHandler: func(writer http.ResponseWriter, _ *http.Request, err error) {
			http.Error(writer, "backend unreachable", http.StatusBadGateway)
			log.Error().Err(err).Msg("backend unreachable")
		},
	}
}

func newTransport() *http.Transport {
	return &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		DialContext:           (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          32,
		MaxIdleConnsPerHost:   32,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: time.Second,
		DisableCompression:    true,
	}
}

type bufferPool struct{ pool sync.Pool }

const copyBufferSize = 32 << 10

func newBufferPool() *bufferPool {
	return &bufferPool{pool: sync.Pool{New: func() any {
		buffer := make([]byte, copyBufferSize)
		return &buffer
	}}}
}

func (b *bufferPool) Get() []byte {
	return *b.pool.Get().(*[]byte)
}

func (b *bufferPool) Put(buffer []byte) {
	b.pool.Put(&buffer)
}
