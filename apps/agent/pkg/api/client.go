package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	baseURL string
	http    *http.Client
}

type RegisterRequest struct {
	EnrollmentToken string `json:"enrollmentToken"`
	Hostname        string `json:"hostname"`
	Platform        string `json:"platform"`
	Arch            string `json:"arch"`
	Scope           string `json:"scope"`
	AgentVersion    string `json:"agentVersion"`
	OSVersion       string `json:"osVersion"`
}

type RegisterResponse struct {
	AgentID                  string `json:"agentId"`
	HeartbeatIntervalSeconds int    `json:"heartbeatIntervalSeconds"`
	HeartbeatToken           string `json:"heartbeatToken"`
}

type HeartbeatRequest struct {
	AgentID         string `json:"agentId"`
	HeartbeatToken  string `json:"heartbeatToken"`
	Status          string `json:"status"`
	InstalledAt     string `json:"installedAt"`
}

func New(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		http: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *Client) Register(ctx context.Context, payload RegisterRequest) (RegisterResponse, error) {
	var result RegisterResponse

	if err := c.post(ctx, "/v1/agents/register", payload, &result); err != nil {
		return result, err
	}

	return result, nil
}

func (c *Client) Heartbeat(ctx context.Context, payload HeartbeatRequest) error {
	var result map[string]any
	return c.post(ctx, "/v1/agents/heartbeat", payload, &result)
}

func (c *Client) post(ctx context.Context, path string, payload any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}

	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")

	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var parsed map[string]any
		_ = json.NewDecoder(response.Body).Decode(&parsed)
		return fmt.Errorf("api request failed: %s", response.Status)
	}

	if out == nil {
		return nil
	}

	return json.NewDecoder(response.Body).Decode(out)
}
