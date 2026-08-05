-- Migration number: 0005 	 2026-08-05

ALTER TABLE magic_link_tokens ADD COLUMN linking_user_id TEXT REFERENCES users (id) ON DELETE CASCADE;

ALTER TABLE oidc_states ADD COLUMN linking_user_id TEXT REFERENCES users (id) ON DELETE CASCADE;
