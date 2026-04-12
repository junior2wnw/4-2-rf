package runtime

import (
	"context"
	"runtime"
	"strings"
	"testing"

	"github.com/junior2wnw/4-2-rf/apps/agent/pkg/api"
)

func TestExecuteTaskSuccess(t *testing.T) {
	t.Parallel()

	task := api.ClaimedTask{
		ID:             "task-success",
		Title:          "echo",
		Summary:        "prints a message",
		Command:        successCommand(),
		TimeoutSeconds: 10,
		Shell:          currentShell(),
	}

	result := ExecuteTask(context.Background(), task)
	if result.Status != "succeeded" {
		t.Fatalf("expected succeeded, got %s", result.Status)
	}
	if result.ExitCode == nil || *result.ExitCode != 0 {
		t.Fatalf("expected exit code 0, got %#v", result.ExitCode)
	}
	if result.Stdout == nil || !strings.Contains(*result.Stdout, "hello-from-agent") {
		t.Fatalf("expected stdout to contain marker, got %#v", result.Stdout)
	}
}

func TestExecuteTaskTimeout(t *testing.T) {
	t.Parallel()

	task := api.ClaimedTask{
		ID:             "task-timeout",
		Title:          "sleep",
		Summary:        "sleeps longer than timeout",
		Command:        timeoutCommand(),
		TimeoutSeconds: 5,
		Shell:          currentShell(),
	}

	result := ExecuteTask(context.Background(), task)
	if result.Status != "timed_out" {
		t.Fatalf("expected timed_out, got %s", result.Status)
	}
	if result.ExitCode == nil || *result.ExitCode != -1 {
		t.Fatalf("expected exit code -1, got %#v", result.ExitCode)
	}
	if result.Stderr == nil || !strings.Contains(*result.Stderr, "timeout") {
		t.Fatalf("expected timeout in stderr, got %#v", result.Stderr)
	}
}

func currentShell() string {
	if runtime.GOOS == "windows" {
		return "powershell"
	}
	return "sh"
}

func successCommand() string {
	if runtime.GOOS == "windows" {
		return "Write-Output 'hello-from-agent'"
	}
	return "printf 'hello-from-agent\\n'"
}

func timeoutCommand() string {
	if runtime.GOOS == "windows" {
		return "Start-Sleep -Seconds 7"
	}
	return "sleep 7"
}
