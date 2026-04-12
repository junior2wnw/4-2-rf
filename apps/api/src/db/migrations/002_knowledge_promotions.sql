CREATE TABLE IF NOT EXISTS knowledge_promotions (
  id UUID PRIMARY KEY,
  source_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  source_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  scope_wing TEXT NOT NULL,
  scope_room TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by TEXT NOT NULL,
  published_drawer_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  CONSTRAINT knowledge_promotions_status_chk CHECK (status IN ('pending', 'published', 'rejected'))
);

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_promotions_scope_hash_uidx
  ON knowledge_promotions(source_hash, scope_wing, scope_room);

CREATE INDEX IF NOT EXISTS knowledge_promotions_status_created_idx
  ON knowledge_promotions(status, created_at DESC);
