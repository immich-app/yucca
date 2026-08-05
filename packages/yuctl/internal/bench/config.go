package bench

// Phase names, in execution order within a cell.
const (
	PhaseGenerate    = "generate"
	PhaseBackup      = "backup"
	PhaseIncremental = "incremental"
	PhaseCheck       = "check"
	PhaseRestore     = "restore"
	PhaseCleanup     = "cleanup"
)

var DefaultPhases = []string{PhaseGenerate, PhaseBackup, PhaseIncremental, PhaseCheck, PhaseRestore}

// Config is the full agent instruction set, sent over ssh stdin so the repo
// URL (embeds the JWT) and password never hit argv or shell history.
type Config struct {
	Repo     string `json:"repo"`
	Password string `json:"password"`
	Workdir  string `json:"workdir"`

	Size     int64  `json:"size"`
	FileSize int64  `json:"fileSize"`
	Seed     uint64 `json:"seed"`

	// Connections is the rest.connections sweep; each value is one cell with
	// its own freshly seeded dataset (reusing data would dedup to zero upload).
	Connections     []int   `json:"connections"`
	ReadConcurrency int     `json:"readConcurrency"`
	PackSizeMiB     int     `json:"packSizeMiB"`
	Compression     string  `json:"compression"`
	Incrementals    int     `json:"incrementals"`
	MutatePercent   float64 `json:"mutatePercent"`

	Phases    []string `json:"phases"`
	Label     string   `json:"label"`
	Tag       string   `json:"tag"`
	ResticBin string   `json:"resticBin"`
	KeepData  bool     `json:"keepData"`
}

func (c *Config) HasPhase(name string) bool {
	for _, p := range c.Phases {
		if p == name {
			return true
		}
	}
	return false
}
