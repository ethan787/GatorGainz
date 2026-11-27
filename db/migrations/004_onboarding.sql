-- Tracks whether the user finished the welcome flow after sign-up.
ALTER TABLE user_profiles ADD COLUMN onboarded_at TIMESTAMPTZ;
-- Accounts that already exist have chosen their settings; do not interrupt them.
UPDATE user_profiles SET onboarded_at = now() WHERE onboarded_at IS NULL;
