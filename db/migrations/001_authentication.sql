-- Preserve existing users, workouts, and goals. Demo profiles retain NULL passwords.
-- This index also enforces uniqueness when inserts bypass the HTTP API.
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE TABLE auth_sessions (
  token_hash CHAR(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at)
);

CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions (expires_at);
