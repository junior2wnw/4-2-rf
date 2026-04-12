package runtime

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand/v2"
	"os"
	"runtime"
	"time"

	"github.com/junior2wnw/4-2-rf/apps/agent/pkg/api"
	"github.com/junior2wnw/4-2-rf/apps/agent/pkg/config"
)

type Runner struct {
	Version string
}

func (r Runner) Run(ctx context.Context, configPath string) error {
	cfg, err := config.Load(configPath)
	if err != nil {
		return err
	}

	client := api.New(cfg.APIURL)
	hostname, err := os.Hostname()
	if err != nil {
		return err
	}

	installedAt := time.Now().UTC().Format(time.RFC3339)

	if cfg.AgentID == "" || cfg.HeartbeatToken == "" {
		if cfg.EnrollmentToken == "" {
			return errors.New("missing enrollment token for initial registration")
		}

		response, err := client.Register(ctx, api.RegisterRequest{
			EnrollmentToken: cfg.EnrollmentToken,
			Hostname:        hostname,
			Platform:        platformName(),
			Arch:            runtime.GOARCH,
			Scope:           cfg.Scope,
			AgentVersion:    r.Version,
			OSVersion:       runtime.GOOS,
		})
		if err != nil {
			return err
		}

		cfg.AgentID = response.AgentID
		cfg.HeartbeatToken = response.HeartbeatToken
		cfg.EnrollmentToken = ""
		cfg.Version = r.Version
		if err := config.Save(configPath, cfg); err != nil {
			return err
		}
	}

	interval := 30 * time.Second
	backoff := 1

	for {
		err := client.Heartbeat(ctx, api.HeartbeatRequest{
			AgentID:        cfg.AgentID,
			HeartbeatToken: cfg.HeartbeatToken,
			Status:         "ready",
			InstalledAt:    installedAt,
		})

		if err == nil {
			backoff = 1
			select {
			case <-ctx.Done():
				return nil
			case <-time.After(interval):
				continue
			}
		}

		wait := backoffDuration(backoff)
		backoff = min(backoff+1, 6)
		fmt.Fprintf(os.Stderr, "heartbeat failed: %v; retrying in %s\n", err, wait)

		select {
		case <-ctx.Done():
			return nil
		case <-time.After(wait):
		}
	}
}

func platformName() string {
	switch runtime.GOOS {
	case "darwin":
		return "macos"
	case "windows":
		return "windows"
	default:
		return "linux"
	}
}

func backoffDuration(step int) time.Duration {
	base := math.Pow(2, float64(step))
	jitter := 0.8 + rand.Float64()*0.4
	return time.Duration(base*jitter) * time.Second
}

func min(a int, b int) int {
	if a < b {
		return a
	}
	return b
}
