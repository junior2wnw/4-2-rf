package runtime

import (
	"context"
	"errors"
	"fmt"
	"math"
	"math/rand/v2"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/junior2wnw/4-2-rf/apps/agent/pkg/api"
	"github.com/junior2wnw/4-2-rf/apps/agent/pkg/config"
)

const (
	defaultHeartbeatInterval = 30 * time.Second
	defaultPollInterval      = 4 * time.Second
	reportTimeout            = 30 * time.Second
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
	heartbeatInterval := defaultHeartbeatInterval

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
		if response.HeartbeatIntervalSeconds > 0 {
			heartbeatInterval = time.Duration(response.HeartbeatIntervalSeconds) * time.Second
		}
		if err := config.Save(configPath, cfg); err != nil {
			return err
		}
	}

	status := newStatusState("ready")
	go r.heartbeatLoop(ctx, client, cfg, installedAt, heartbeatInterval, status)

	backoff := 1
	nextWait := time.Duration(0)

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(nextWait):
		}

		task, err := client.ClaimTask(ctx, api.ClaimTaskRequest{
			AgentID:        cfg.AgentID,
			HeartbeatToken: cfg.HeartbeatToken,
		})
		if err != nil {
			status.Store("degraded")
			nextWait = backoffDuration(backoff)
			backoff = min(backoff+1, 6)
			fmt.Fprintf(os.Stderr, "task claim failed: %v; retrying in %s\n", err, nextWait)
			continue
		}

		backoff = 1
		nextWait = defaultPollInterval
		status.Store("ready")

		if task == nil {
			continue
		}

		fmt.Fprintf(os.Stdout, "running task %s: %s\n", task.ID, task.Title)
		result := ExecuteTask(ctx, *task)

		if err := reportCompletionWithRetry(ctx, client, cfg, task.ID, result, status); err != nil {
			if errors.Is(err, context.Canceled) {
				return nil
			}
			return err
		}

		status.Store("ready")
	}
}

func (r Runner) heartbeatLoop(
	ctx context.Context,
	client *api.Client,
	cfg config.File,
	installedAt string,
	interval time.Duration,
	status *statusState,
) {
	backoff := 1

	for {
		err := client.Heartbeat(ctx, api.HeartbeatRequest{
			AgentID:        cfg.AgentID,
			HeartbeatToken: cfg.HeartbeatToken,
			Status:         status.Load(),
			InstalledAt:    installedAt,
		})

		if err == nil {
			backoff = 1
			select {
			case <-ctx.Done():
				return
			case <-time.After(interval):
				continue
			}
		}

		status.Store("degraded")
		wait := backoffDuration(backoff)
		backoff = min(backoff+1, 6)
		fmt.Fprintf(os.Stderr, "heartbeat failed: %v; retrying in %s\n", err, wait)

		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}

func reportCompletionWithRetry(
	ctx context.Context,
	client *api.Client,
	cfg config.File,
	taskID string,
	result TaskResult,
	status *statusState,
) error {
	backoff := 1

	for {
		reportCtx, cancel := context.WithTimeout(ctx, reportTimeout)
		err := client.CompleteTask(reportCtx, taskID, api.CompleteTaskRequest{
			AgentID:        cfg.AgentID,
			HeartbeatToken: cfg.HeartbeatToken,
			Status:         result.Status,
			ExitCode:       result.ExitCode,
			Stdout:         result.Stdout,
			Stderr:         result.Stderr,
			StartedAt:      result.StartedAt,
			FinishedAt:     result.FinishedAt,
		})
		cancel()

		if err == nil {
			return nil
		}

		if ctx.Err() != nil {
			return ctx.Err()
		}

		status.Store("degraded")
		wait := backoffDuration(backoff)
		backoff = min(backoff+1, 6)
		fmt.Fprintf(os.Stderr, "task completion report failed for %s: %v; retrying in %s\n", taskID, err, wait)

		select {
		case <-ctx.Done():
			return ctx.Err()
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

type statusState struct {
	mu    sync.RWMutex
	value string
}

func newStatusState(initial string) *statusState {
	return &statusState{value: initial}
}

func (s *statusState) Load() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.value
}

func (s *statusState) Store(value string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.value = value
}
