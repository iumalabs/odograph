-- Migration number: 0012 	 2026-08-07

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('read', 'write')),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX idx_api_tokens_user_id ON api_tokens (user_id);
CREATE INDEX idx_api_tokens_token_hash ON api_tokens (token_hash);
