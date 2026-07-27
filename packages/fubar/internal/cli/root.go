// Package cli is fubar's cobra command tree.
package cli

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"

	"fubar/internal/api"
	"fubar/internal/config"
	"fubar/internal/version"
)

var (
	flagAPI      string
	flagJSON     bool
	flagLogLevel string
)

// NewRootCmd builds the fubar command tree.
func NewRootCmd() *cobra.Command {
	root := &cobra.Command{
		Use:           "fubar",
		Short:         "fubar — FUTO Backups CLI (restic under the hood, telemetry on top)",
		Version:       version.Version,
		SilenceUsage:  true,
		SilenceErrors: true,
		PersistentPreRunE: func(_ *cobra.Command, _ []string) error {
			return setupLogging()
		},
	}

	root.PersistentFlags().StringVar(&flagAPI, "api", "", "yucca API base URL (default: from login, or $FUBAR_API)")
	root.PersistentFlags().BoolVar(&flagJSON, "json", false, "machine-readable output (JSON on stdout, logs on stderr)")
	root.PersistentFlags().StringVar(&flagLogLevel, "log-level", "warn", "log level (trace, debug, info, warn, error)")

	root.AddCommand(
		newLoginCmd(),
		newInitCmd(),
		newBackupCmd(),
		newSnapshotsCmd(),
		newRestoreCmd(),
		newForgetCmd(),
		newStatusCmd(),
		newDaemonCmd(),
		newServiceCmd(),
		newDoctorCmd(),
	)
	return root
}

func setupLogging() error {
	zerolog.TimeFieldFormat = time.RFC3339
	level, err := zerolog.ParseLevel(flagLogLevel)
	if err != nil {
		return fmt.Errorf("invalid --log-level: %w", err)
	}
	logger := zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr}).Level(level).With().Timestamp().Logger()
	if flagJSON {
		logger = zerolog.New(os.Stderr).Level(level).With().Timestamp().Logger()
	}
	log.Logger = logger
	return nil
}

// apiBase resolves the API base URL: --api > $FUBAR_API > the login token's.
func apiBase(token *config.Token) (string, error) {
	if flagAPI != "" {
		return flagAPI, nil
	}
	if env := os.Getenv("FUBAR_API"); env != "" {
		return env, nil
	}
	if token != nil && token.API != "" {
		return token.API, nil
	}
	return "", fmt.Errorf("no API endpoint — pass --api or run `fubar login --api <url>`")
}

// client builds an authenticated API client from the stored login.
func client() (*api.Client, error) {
	token, err := config.LoadToken()
	if err != nil {
		return nil, err
	}
	base, err := apiBase(token)
	if err != nil {
		return nil, err
	}
	return api.NewClient(base, token.AccessToken), nil
}

// openBrowser opens url in the OS default browser, best-effort.
func openBrowser(url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}
