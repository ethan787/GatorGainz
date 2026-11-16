-- Private workout history and server-side scoring.
-- Existing workouts are kept unchanged; they have no exercises and therefore no award.

-- Retry safety: a client submission key can create at most one workout per account.
ALTER TABLE workouts ADD COLUMN submission_key VARCHAR(128)
  CHECK (submission_key ~ '^[A-Za-z0-9_-]{8,128}$');
-- SHA-256 of the normalized submission, so a reused key with different data is rejected.
ALTER TABLE workouts ADD COLUMN submission_fingerprint CHAR(64);
ALTER TABLE workouts ADD CONSTRAINT workouts_submission_pair_chk
  CHECK ((submission_key IS NULL) = (submission_fingerprint IS NULL));
CREATE UNIQUE INDEX workouts_user_submission_idx ON workouts (user_id, submission_key);

-- Keyset pagination for GET /api/me/workouts: newest first with stable tie-breakers.
CREATE INDEX workouts_user_history_idx
  ON workouts (user_id, completed_at DESC, created_at DESC, id DESC);

-- Trusted exercise inputs, normalized against the server's exercise catalog.
CREATE TABLE workout_exercises (
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  name VARCHAR(80) NOT NULL,
  muscle_group VARCHAR(32) NOT NULL,
  difficulty VARCHAR(8) NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  base_points INTEGER NOT NULL CHECK (base_points > 0),
  tracking VARCHAR(8) NOT NULL CHECK (tracking IN ('strength', 'cardio')),
  sets INTEGER NOT NULL CHECK (sets >= 0),
  reps INTEGER NOT NULL CHECK (reps >= 0),
  minutes INTEGER NOT NULL CHECK (minutes >= 0),
  metric_value NUMERIC NOT NULL CHECK (metric_value >= 0),
  metric_baseline NUMERIC NOT NULL CHECK (metric_baseline >= 0),
  PRIMARY KEY (workout_id, position)
);

-- Exactly one award per workout: the primary key is the workout ID.
CREATE TABLE workout_awards (
  workout_id UUID PRIMARY KEY REFERENCES workouts(id) ON DELETE CASCADE,
  scoring_version VARCHAR(16) NOT NULL,
  points INTEGER NOT NULL CHECK (points >= 0),
  breakdown JSONB NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
