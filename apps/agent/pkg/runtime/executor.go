package runtime

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"time"

	"github.com/junior2wnw/4-2-rf/apps/agent/pkg/api"
)

const maxCapturedOutputBytes = 64 * 1024

type TaskResult struct {
	Status     string
	ExitCode   *int
	Stdout     *string
	Stderr     *string
	StartedAt  string
	FinishedAt string
}

func ExecuteTask(parent context.Context, task api.ClaimedTask) TaskResult {
	startedAt := time.Now().UTC()
	timeout := time.Duration(clampTimeout(task.TimeoutSeconds)) * time.Second
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()

	command, err := buildCommand(ctx, task)
	if err != nil {
		return failedResult(startedAt, appendMessage(nil, err.Error()), nil)
	}

	if directory := strings.TrimSpace(pointerValue(task.WorkingDirectory)); directory != "" {
		command.Dir = directory
	}

	stdoutWriter := &limitedBuffer{limit: maxCapturedOutputBytes}
	stderrWriter := &limitedBuffer{limit: maxCapturedOutputBytes}
	command.Stdout = stdoutWriter
	command.Stderr = stderrWriter

	runErr := command.Run()
	finishedAt := time.Now().UTC()

	switch {
	case errors.Is(ctx.Err(), context.DeadlineExceeded):
		return TaskResult{
			Status:     "timed_out",
			ExitCode:   intPointer(-1),
			Stdout:     stdoutWriter.Pointer(),
			Stderr:     appendMessage(stderrWriter.Pointer(), fmt.Sprintf("command exceeded timeout of %s", timeout)),
			StartedAt:  startedAt.Format(time.RFC3339),
			FinishedAt: finishedAt.Format(time.RFC3339),
		}
	case runErr == nil:
		return TaskResult{
			Status:     "succeeded",
			ExitCode:   intPointer(0),
			Stdout:     stdoutWriter.Pointer(),
			Stderr:     stderrWriter.Pointer(),
			StartedAt:  startedAt.Format(time.RFC3339),
			FinishedAt: finishedAt.Format(time.RFC3339),
		}
	default:
		exitCode := exitCodeFromError(runErr)
		return TaskResult{
			Status:     "failed",
			ExitCode:   exitCode,
			Stdout:     stdoutWriter.Pointer(),
			Stderr:     appendMessage(stderrWriter.Pointer(), runErr.Error()),
			StartedAt:  startedAt.Format(time.RFC3339),
			FinishedAt: finishedAt.Format(time.RFC3339),
		}
	}
}

func buildCommand(ctx context.Context, task api.ClaimedTask) (*exec.Cmd, error) {
	switch task.Shell {
	case "powershell":
		shell, err := preferredPowerShell()
		if err != nil {
			return nil, err
		}
		return exec.CommandContext(ctx, shell, "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", task.Command), nil
	case "sh":
		return exec.CommandContext(ctx, "/bin/sh", "-lc", task.Command), nil
	default:
		return nil, fmt.Errorf("unsupported shell: %s", task.Shell)
	}
}

func preferredPowerShell() (string, error) {
	if path, err := exec.LookPath("powershell.exe"); err == nil {
		return path, nil
	}
	if path, err := exec.LookPath("pwsh.exe"); err == nil {
		return path, nil
	}
	return "", errors.New("powershell executable not found")
}

func exitCodeFromError(err error) *int {
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		code := exitErr.ExitCode()
		return &code
	}
	return nil
}

func failedResult(startedAt time.Time, stderr *string, exitCode *int) TaskResult {
	finishedAt := time.Now().UTC()
	return TaskResult{
		Status:     "failed",
		ExitCode:   exitCode,
		Stdout:     nil,
		Stderr:     stderr,
		StartedAt:  startedAt.Format(time.RFC3339),
		FinishedAt: finishedAt.Format(time.RFC3339),
	}
}

func appendMessage(base *string, message string) *string {
	trimmed := strings.TrimSpace(message)
	if trimmed == "" {
		return base
	}

	if base == nil || strings.TrimSpace(*base) == "" {
		return stringPointer(trimmed)
	}

	return stringPointer(strings.TrimSpace(*base) + "\n" + trimmed)
}

func clampTimeout(seconds int) int {
	switch {
	case seconds < 5:
		return 5
	case seconds > 900:
		return 900
	default:
		return seconds
	}
}

func pointerValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func intPointer(value int) *int {
	return &value
}

func stringPointer(value string) *string {
	return &value
}

type limitedBuffer struct {
	buffer     bytes.Buffer
	limit      int
	truncated  bool
	writtenLen int
}

func (l *limitedBuffer) Write(p []byte) (int, error) {
	l.writtenLen += len(p)
	if l.limit <= 0 {
		return len(p), nil
	}

	if l.buffer.Len() >= l.limit {
		l.truncated = true
		return len(p), nil
	}

	remaining := l.limit - l.buffer.Len()
	if len(p) > remaining {
		l.truncated = true
		_, _ = io.Copy(&l.buffer, bytes.NewReader(p[:remaining]))
		return len(p), nil
	}

	_, err := l.buffer.Write(p)
	return len(p), err
}

func (l *limitedBuffer) Pointer() *string {
	text := strings.TrimSpace(l.buffer.String())
	if text == "" && !l.truncated {
		return nil
	}

	if l.truncated {
		suffix := fmt.Sprintf("\n[output truncated at %d bytes]", l.limit)
		text = strings.TrimSpace(text + suffix)
	}

	return &text
}
