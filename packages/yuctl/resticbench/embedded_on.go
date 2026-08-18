//go:build embedagent

package resticbench

import (
	"bytes"
	"compress/gzip"
	_ "embed"
	"io"
)

// Produced by .mise/tasks/yuctl/build (gitignored): the linux/amd64
// cmd/bench-agent build, gzipped.
//
//go:embed bench-agent-linux-amd64.gz
var agentGz []byte

func embeddedAgent() ([]byte, error) {
	zr, err := gzip.NewReader(bytes.NewReader(agentGz))
	if err != nil {
		return nil, err
	}
	defer zr.Close()
	return io.ReadAll(zr)
}
