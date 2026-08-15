package cluster

import "regexp"

// DefaultCode names the flat-S3_* cluster, where claimless tokens route.
// Overridable via S3_DEFAULT_CLUSTER.
const DefaultCode = "default"

// codePattern is deliberately narrow: the code arrives in a JWT claim and
// becomes a map key + metric label — no separators, whitespace, or unbounded length.
var codePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

const CodePattern = `^[a-z0-9][a-z0-9-]{0,63}$`

func IsValidCode(s string) bool {
	return codePattern.MatchString(s)
}
