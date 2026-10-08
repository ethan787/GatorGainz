-- Initial scaffold schema. Later schema changes should use versioned migrations.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name VARCHAR(80) NOT NULL CHECK (length(trim(display_name)) > 0),
  email VARCHAR(254) NOT NULL UNIQUE,
  -- Demo profiles have no login. Future registered accounts must store a bcrypt hash.
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL CHECK (length(trim(name)) > 0),
  category VARCHAR(16) NOT NULL CHECK (category IN ('strength', 'cardio', 'mobility')),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  completed_at DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS workouts_user_date_idx ON workouts(user_id, completed_at);

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL CHECK (length(trim(title)) > 0),
  target_workouts INTEGER NOT NULL CHECK (target_workouts > 0),
  start_date DATE NOT NULL,
  target_date DATE NOT NULL CHECK (target_date >= start_date),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goals_user_idx ON goals(user_id);

-- Compute rankings from workout records so stored scores cannot drift.
CREATE OR REPLACE VIEW rankings AS
SELECT dense_rank() OVER (ORDER BY COUNT(w.id) DESC, COALESCE(SUM(w.duration_minutes), 0) DESC)::integer AS rank,
       u.id AS user_id, u.display_name,
       COUNT(w.id)::integer AS total_workouts,
       COALESCE(SUM(w.duration_minutes), 0)::integer AS total_minutes
FROM users u LEFT JOIN workouts w ON w.user_id = u.id
GROUP BY u.id;
