package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClientTaskLifecycle(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch r.URL.Path {
		case "/v1/agents/register":
			json.NewEncoder(w).Encode(RegisterResponse{
				AgentID:                  "agent-1",
				HeartbeatIntervalSeconds: 30,
				HeartbeatToken:           "heartbeat-1",
			})
		case "/v1/agents/heartbeat":
			json.NewEncoder(w).Encode(map[string]any{"ok": true})
		case "/v1/agents/tasks/claim":
			json.NewEncoder(w).Encode(ClaimTaskResponse{
				Task: &ClaimedTask{
					ID:             "task-1",
					Title:          "echo",
					Summary:        "run echo",
					Command:        "echo hello",
					TimeoutSeconds: 30,
					Shell:          "sh",
				},
			})
		case "/v1/agents/tasks/task-1/complete":
			json.NewEncoder(w).Encode(map[string]any{"ok": true})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := New(server.URL)
	ctx := context.Background()

	registration, err := client.Register(ctx, RegisterRequest{
		EnrollmentToken: "enr_123",
		Hostname:        "host",
		Platform:        "linux",
		Arch:            "amd64",
		Scope:           "user",
		AgentVersion:    "0.1.0",
		OSVersion:       "linux",
	})
	if err != nil {
		t.Fatalf("register failed: %v", err)
	}
	if registration.AgentID != "agent-1" {
		t.Fatalf("unexpected agent id: %s", registration.AgentID)
	}

	if err := client.Heartbeat(ctx, HeartbeatRequest{
		AgentID:        registration.AgentID,
		HeartbeatToken: registration.HeartbeatToken,
		Status:         "ready",
		InstalledAt:    "2026-04-12T00:00:00Z",
	}); err != nil {
		t.Fatalf("heartbeat failed: %v", err)
	}

	task, err := client.ClaimTask(ctx, ClaimTaskRequest{
		AgentID:        registration.AgentID,
		HeartbeatToken: registration.HeartbeatToken,
	})
	if err != nil {
		t.Fatalf("claim task failed: %v", err)
	}
	if task == nil || task.ID != "task-1" {
		t.Fatalf("unexpected task: %#v", task)
	}

	stdout := "done"
	exitCode := 0
	if err := client.CompleteTask(ctx, task.ID, CompleteTaskRequest{
		AgentID:        registration.AgentID,
		HeartbeatToken: registration.HeartbeatToken,
		Status:         "succeeded",
		ExitCode:       &exitCode,
		Stdout:         &stdout,
		StartedAt:      "2026-04-12T00:00:01Z",
		FinishedAt:     "2026-04-12T00:00:02Z",
	}); err != nil {
		t.Fatalf("complete task failed: %v", err)
	}
}
