ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS access_token TEXT;

UPDATE chat_sessions
SET access_token = md5(id::text || clock_timestamp()::text || random()::text)
WHERE access_token IS NULL;

ALTER TABLE chat_sessions
  ALTER COLUMN access_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS chat_sessions_access_token_uidx
  ON chat_sessions(access_token);

ALTER TABLE install_tokens
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL;

ALTER TABLE agent_registrations
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE agent_registrations AS registrations
SET session_id = tokens.session_id
FROM install_tokens AS tokens
WHERE registrations.install_token = tokens.token
  AND registrations.session_id IS NULL
  AND tokens.session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_registrations_session_idx
  ON agent_registrations(session_id, last_seen_at DESC)
  WHERE session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_tasks (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agent_registrations(id) ON DELETE CASCADE,
  assistant_message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  command TEXT NOT NULL,
  working_directory TEXT,
  shell TEXT NOT NULL,
  timeout_seconds INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  exit_code INTEGER,
  stdout TEXT,
  stderr TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT agent_tasks_shell_chk CHECK (shell IN ('powershell', 'sh')),
  CONSTRAINT agent_tasks_timeout_chk CHECK (timeout_seconds BETWEEN 5 AND 900),
  CONSTRAINT agent_tasks_status_chk CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'timed_out', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS agent_tasks_agent_status_idx
  ON agent_tasks(agent_id, status, created_at ASC);

CREATE INDEX IF NOT EXISTS agent_tasks_session_created_idx
  ON agent_tasks(session_id, created_at DESC);
