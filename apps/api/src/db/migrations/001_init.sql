CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY,
  display_name TEXT NOT NULL,
  platform TEXT,
  arch TEXT,
  user_agent TEXT,
  openai_previous_response_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  client_message_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  memory_context JSONB,
  openai_response_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_messages_role_chk CHECK (role IN ('user', 'assistant', 'system'))
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_session_client_message_id_uidx
  ON chat_messages(session_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx
  ON chat_messages(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS install_tokens (
  token TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  arch TEXT NOT NULL,
  scope TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT install_tokens_platform_chk CHECK (platform IN ('windows', 'macos', 'linux')),
  CONSTRAINT install_tokens_arch_chk CHECK (arch IN ('amd64', 'arm64')),
  CONSTRAINT install_tokens_scope_chk CHECK (scope IN ('user', 'system'))
);

CREATE TABLE IF NOT EXISTS agent_registrations (
  id UUID PRIMARY KEY,
  install_token TEXT NOT NULL UNIQUE REFERENCES install_tokens(token),
  heartbeat_token TEXT NOT NULL,
  hostname TEXT NOT NULL,
  platform TEXT NOT NULL,
  arch TEXT NOT NULL,
  scope TEXT NOT NULL,
  agent_version TEXT NOT NULL,
  os_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'starting',
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_registrations_platform_chk CHECK (platform IN ('windows', 'macos', 'linux')),
  CONSTRAINT agent_registrations_arch_chk CHECK (arch IN ('amd64', 'arm64')),
  CONSTRAINT agent_registrations_scope_chk CHECK (scope IN ('user', 'system')),
  CONSTRAINT agent_registrations_status_chk CHECK (status IN ('starting', 'ready', 'degraded'))
);

CREATE INDEX IF NOT EXISTS agent_registrations_last_seen_idx
  ON agent_registrations(last_seen_at DESC);
