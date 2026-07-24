//go:build !embedagent

package bench

import "errors"

func embeddedAgent() ([]byte, error) {
	return nil, errors.New("this yuctl build has no embedded bench agent; build with `mise yuctl:build` or pass --agent-bin")
}
