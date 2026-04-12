package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

type File struct {
	APIURL          string `json:"api_url"`
	EnrollmentToken string `json:"enrollment_token,omitempty"`
	AgentID         string `json:"agent_id,omitempty"`
	HeartbeatToken  string `json:"heartbeat_token,omitempty"`
	Scope           string `json:"scope"`
	InstallRoot     string `json:"install_root"`
	Version         string `json:"version"`
}

func Load(path string) (File, error) {
	var cfg File

	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}

	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, err
	}

	if cfg.APIURL == "" {
		return cfg, errors.New("config.api_url is empty")
	}

	return cfg, nil
}

func Save(path string, cfg File) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0o600)
}
