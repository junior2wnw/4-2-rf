package install

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/junior2wnw/4-2-rf/apps/agent/pkg/config"
)

type Options struct {
	APIURL          string
	EnrollmentToken string
	Scope           string
	Version         string
}

func Install(options Options) (string, error) {
	if options.Scope != "user" && options.Scope != "system" {
		return "", fmt.Errorf("unsupported scope: %s", options.Scope)
	}

	executable, err := os.Executable()
	if err != nil {
		return "", err
	}

	root, err := installRoot(options.Scope)
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(root, 0o755); err != nil {
		return "", err
	}

	destinationBinary := filepath.Join(root, binaryName())
	configPath := filepath.Join(root, "agent.json")

	if err := copyFile(executable, destinationBinary); err != nil {
		return "", err
	}

	if runtime.GOOS != "windows" {
		if err := os.Chmod(destinationBinary, 0o755); err != nil {
			return "", err
		}
	}

	cfg := config.File{
		APIURL:          strings.TrimRight(options.APIURL, "/"),
		EnrollmentToken: options.EnrollmentToken,
		Scope:           options.Scope,
		InstallRoot:     root,
		Version:         options.Version,
	}

	if err := config.Save(configPath, cfg); err != nil {
		return "", err
	}

	if err := installService(destinationBinary, configPath, options.Scope); err != nil {
		return "", err
	}

	return configPath, nil
}

func Uninstall(scope string) error {
	if scope != "user" && scope != "system" {
		return fmt.Errorf("unsupported scope: %s", scope)
	}

	root, err := installRoot(scope)
	if err != nil {
		return err
	}

	if err := removeService(scope); err != nil {
		return err
	}

	return os.RemoveAll(root)
}

func installService(binaryPath string, configPath string, scope string) error {
	commandLine := fmt.Sprintf("\"%s\" run --config \"%s\"", binaryPath, configPath)

	switch runtime.GOOS {
	case "windows":
		taskName := "FourTwoAgent"
		args := []string{"/Create", "/F", "/TN", taskName, "/TR", commandLine}
		if scope == "system" {
			args = append(args, "/SC", "ONSTART", "/RU", "SYSTEM", "/RL", "HIGHEST")
		} else {
			args = append(args, "/SC", "ONLOGON")
		}
		if err := run("schtasks", args...); err != nil {
			return err
		}
		return run("schtasks", "/Run", "/TN", taskName)

	case "darwin":
		plistPath, err := serviceFilePath(scope)
		if err != nil {
			return err
		}
		content := launchdPlist(binaryPath, configPath)
		if err := os.MkdirAll(filepath.Dir(plistPath), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(plistPath, []byte(content), 0o644); err != nil {
			return err
		}

		if scope == "system" {
			_ = run("launchctl", "bootout", "system", plistPath)
			return run("launchctl", "bootstrap", "system", plistPath)
		}

		target := fmt.Sprintf("gui/%d", os.Getuid())
		_ = run("launchctl", "bootout", target, plistPath)
		return run("launchctl", "bootstrap", target, plistPath)

	default:
		unitPath, err := serviceFilePath(scope)
		if err != nil {
			return err
		}
		content := systemdUnit(binaryPath, configPath)
		if err := os.MkdirAll(filepath.Dir(unitPath), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(unitPath, []byte(content), 0o644); err != nil {
			return err
		}

		if scope == "system" {
			if err := run("systemctl", "daemon-reload"); err != nil {
				return err
			}
			return run("systemctl", "enable", "--now", "four-two-agent.service")
		}

		if err := run("systemctl", "--user", "daemon-reload"); err != nil {
			return err
		}
		return run("systemctl", "--user", "enable", "--now", "four-two-agent.service")
	}
}

func removeService(scope string) error {
	switch runtime.GOOS {
	case "windows":
		return run("schtasks", "/Delete", "/F", "/TN", "FourTwoAgent")
	case "darwin":
		plistPath, err := serviceFilePath(scope)
		if err != nil {
			return err
		}
		if scope == "system" {
			_ = run("launchctl", "bootout", "system", plistPath)
		} else {
			target := fmt.Sprintf("gui/%d", os.Getuid())
			_ = run("launchctl", "bootout", target, plistPath)
		}
		return os.Remove(plistPath)
	default:
		unitPath, err := serviceFilePath(scope)
		if err != nil {
			return err
		}
		if scope == "system" {
			_ = run("systemctl", "disable", "--now", "four-two-agent.service")
			_ = run("systemctl", "daemon-reload")
		} else {
			_ = run("systemctl", "--user", "disable", "--now", "four-two-agent.service")
			_ = run("systemctl", "--user", "daemon-reload")
		}
		return os.Remove(unitPath)
	}
}

func installRoot(scope string) (string, error) {
	if scope == "system" {
		switch runtime.GOOS {
		case "windows":
			return filepath.Join(os.Getenv("ProgramData"), "4-2"), nil
		case "darwin":
			return "/Library/Application Support/4-2", nil
		default:
			return "/opt/4-2", nil
		}
	}

	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "4-2"), nil
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, "Library", "Application Support", "4-2"), nil
	default:
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, ".local", "share", "4-2"), nil
	}
}

func serviceFilePath(scope string) (string, error) {
	if runtime.GOOS == "darwin" {
		if scope == "system" {
			return "/Library/LaunchDaemons/rf.4-2.agent.plist", nil
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, "Library", "LaunchAgents", "rf.4-2.agent.plist"), nil
	}

	if runtime.GOOS == "linux" {
		if scope == "system" {
			return "/etc/systemd/system/four-two-agent.service", nil
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, ".config", "systemd", "user", "four-two-agent.service"), nil
	}

	return "", nil
}

func binaryName() string {
	if runtime.GOOS == "windows" {
		return "4-2-agent.exe"
	}
	return "4-2-agent"
}

func copyFile(source string, destination string) error {
	input, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	return os.WriteFile(destination, input, 0o755)
}

func systemdUnit(binaryPath string, configPath string) string {
	return fmt.Sprintf(`[Unit]
Description=4-2 agent
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=%s run --config %s
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`, binaryPath, configPath)
}

func launchdPlist(binaryPath string, configPath string) string {
	return fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>rf.4-2.agent</string>
    <key>ProgramArguments</key>
    <array>
      <string>%s</string>
      <string>run</string>
      <string>--config</string>
      <string>%s</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
  </dict>
</plist>
`, binaryPath, configPath)
}

func run(name string, args ...string) error {
	command := exec.Command(name, args...)
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	return command.Run()
}
