package cli

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/spf13/cobra"

	"fubar/internal/ui"
)

const launchdLabel = "sh.futo.fubar"

func launchdPlistPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "Library", "LaunchAgents", launchdLabel+".plist"), nil
}

func systemdUnitPath() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "systemd", "user", "fubar.service"), nil
}

func newServiceCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "service",
		Short: "Run the fubar daemon at login (launchd / systemd user unit)",
	}
	cmd.AddCommand(newServiceInstallCmd(), newServiceUninstallCmd(), newServiceStatusCmd())
	return cmd
}

func newServiceInstallCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "install",
		Short: "Install and start the background service",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			out := cmd.ErrOrStderr()
			bin, err := os.Executable()
			if err != nil {
				return err
			}

			switch runtime.GOOS {
			case "darwin":
				path, err := launchdPlistPath()
				if err != nil {
					return err
				}
				plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>%s</string>
	<key>ProgramArguments</key>
	<array>
		<string>%s</string>
		<string>daemon</string>
	</array>
	<key>RunAtLoad</key><true/>
	<key>KeepAlive</key><true/>
	<key>StandardOutPath</key><string>/tmp/fubar-daemon.log</string>
	<key>StandardErrorPath</key><string>/tmp/fubar-daemon.log</string>
</dict>
</plist>
`, launchdLabel, bin)
				if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
					return err
				}
				if err := os.WriteFile(path, []byte(plist), 0o644); err != nil {
					return err
				}
				_ = exec.Command("launchctl", "unload", path).Run()
				if err := exec.Command("launchctl", "load", path).Run(); err != nil {
					return fmt.Errorf("launchctl load: %w", err)
				}
				fmt.Fprintf(out, "%s launchd agent installed (%s)\n", ui.Good.Render("✓"), path)
				return nil

			case "linux":
				path, err := systemdUnitPath()
				if err != nil {
					return err
				}
				unit := fmt.Sprintf(`[Unit]
Description=fubar — FUTO Backups daemon

[Service]
ExecStart=%s daemon
Restart=on-failure
RestartSec=30

[Install]
WantedBy=default.target
`, bin)
				if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
					return err
				}
				if err := os.WriteFile(path, []byte(unit), 0o644); err != nil {
					return err
				}
				for _, args := range [][]string{
					{"daemon-reload"},
					{"enable", "--now", "fubar.service"},
				} {
					if err := exec.Command("systemctl", append([]string{"--user"}, args...)...).Run(); err != nil {
						return fmt.Errorf("systemctl --user %s: %w", strings.Join(args, " "), err)
					}
				}
				fmt.Fprintf(out, "%s systemd user unit installed (%s)\n", ui.Good.Render("✓"), path)
				return nil

			default:
				return fmt.Errorf("no service integration for %s — run `fubar daemon` under your own supervisor", runtime.GOOS)
			}
		},
	}
	return c
}

func newServiceUninstallCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "uninstall",
		Short: "Stop and remove the background service",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			out := cmd.ErrOrStderr()
			switch runtime.GOOS {
			case "darwin":
				path, err := launchdPlistPath()
				if err != nil {
					return err
				}
				_ = exec.Command("launchctl", "unload", path).Run()
				if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
					return err
				}
			case "linux":
				_ = exec.Command("systemctl", "--user", "disable", "--now", "fubar.service").Run()
				path, err := systemdUnitPath()
				if err != nil {
					return err
				}
				if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
					return err
				}
				_ = exec.Command("systemctl", "--user", "daemon-reload").Run()
			default:
				return fmt.Errorf("no service integration for %s", runtime.GOOS)
			}
			fmt.Fprintf(out, "%s service removed\n", ui.Good.Render("✓"))
			return nil
		},
	}
	return c
}

func newServiceStatusCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "status",
		Short: "Show whether the background service is installed/running",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			out := cmd.OutOrStdout()
			switch runtime.GOOS {
			case "darwin":
				output, err := exec.Command("launchctl", "list", launchdLabel).CombinedOutput()
				if err != nil {
					fmt.Fprintln(out, "not installed (or not running)")
					return nil
				}
				fmt.Fprint(out, string(output))
			case "linux":
				output, _ := exec.Command("systemctl", "--user", "status", "--no-pager", "fubar.service").CombinedOutput()
				fmt.Fprint(out, string(output))
			default:
				fmt.Fprintf(out, "no service integration for %s\n", runtime.GOOS)
			}
			return nil
		},
	}
	return c
}
