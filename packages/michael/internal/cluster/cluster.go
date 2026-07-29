// Package cluster names the storage clusters a single michael fronts.
//
// One michael serves a site backed by one or more Ceph clusters. A restic
// token's optional storageCluster claim selects which of them a request is
// served from; tokens minted before multi-cluster existed carry no claim and
// route to DefaultCode.
package cluster

import "regexp"

// DefaultCode is the code assigned to the cluster described by michael's flat
// S3_* environment variables, and the cluster a token with no storageCluster
// claim routes to. Overridable via S3_DEFAULT_CLUSTER.
const DefaultCode = "default"

// codePattern is deliberately narrow: a cluster code arrives in a JWT claim and
// becomes both a map key and a metric label, so it must not be able to carry
// path separators, whitespace, or unbounded length.
var codePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

// CodePattern is the human-readable form of the code charset, for error
// messages.
const CodePattern = `^[a-z0-9][a-z0-9-]{0,63}$`

// IsValidCode reports whether s is a well-formed storage cluster code.
func IsValidCode(s string) bool {
	return codePattern.MatchString(s)
}
