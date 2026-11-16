-- Profiles, connections between accounts, blocks, and personal invite links.
-- Only registered accounts (password_hash IS NOT NULL) take part; demo profiles never appear.

CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Public username: lowercase letters, digits, and underscores. Never the email.
  handle VARCHAR(24) NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9_]{3,24}$'),
  bio VARCHAR(160) NOT NULL DEFAULT '',
  primary_goal VARCHAR(24) NOT NULL DEFAULT 'build_strength'
    CHECK (primary_goal IN ('build_strength', 'lose_weight', 'improve_endurance',
                            'stay_active', 'improve_mobility')),
  training_level VARCHAR(16) NOT NULL DEFAULT 'beginner'
    CHECK (training_level IN ('beginner', 'intermediate', 'advanced')),
  preferred_units VARCHAR(8) NOT NULL DEFAULT 'imperial'
    CHECK (preferred_units IN ('imperial', 'metric')),
  weekly_goal INTEGER NOT NULL DEFAULT 3 CHECK (weekly_goal BETWEEN 1 AND 14),
  -- public: findable in search and shown on the global leaderboard.
  -- private: hidden from search and the global board; only connections see you.
  visibility VARCHAR(8) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  -- Personal invite code. Regenerating it invalidates links already shared.
  invite_code VARCHAR(16) NOT NULL UNIQUE CHECK (invite_code ~ '^[A-Za-z0-9_-]{12,16}$'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Give existing accounts a profile so they can be found and invited.
INSERT INTO user_profiles (user_id, handle, invite_code)
SELECT id, 'athlete_' || substr(md5(id::text), 1, 10), substr(md5(random()::text || id::text), 1, 14)
FROM users WHERE password_hash IS NOT NULL;

-- One row per pair of accounts, whichever side asked first.
CREATE TABLE connections (
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(8) NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  PRIMARY KEY (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id),
  CHECK ((status = 'accepted') = (accepted_at IS NOT NULL))
);
CREATE UNIQUE INDEX connections_pair_idx
  ON connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX connections_addressee_idx ON connections (addressee_id, status);

-- A block hides both accounts from each other and removes any connection.
CREATE TABLE user_blocks (
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX user_blocks_blocked_idx ON user_blocks (blocked_id);

-- Leaderboards sum awards by completion date.
CREATE INDEX workouts_completed_idx ON workouts (completed_at, user_id);
