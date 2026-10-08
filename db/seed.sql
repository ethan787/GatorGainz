-- Synthetic preview profiles, not real accounts. Safe to rerun without duplicating rows.
INSERT INTO users (id, display_name, email) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Alex Rivera', 'alex@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'Jordan Lee', 'jordan@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'Taylor Morgan', 'taylor@example.test')
ON CONFLICT DO NOTHING;

INSERT INTO workouts (id, user_id, name, category, duration_minutes, completed_at) VALUES
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Upper body strength', 'strength', 60, '2026-10-08'),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Evening run', 'cardio', 45, '2026-10-07'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'Lower body strength', 'strength', 90, '2026-10-05'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'Full body strength', 'strength', 55, '2026-10-08'),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002', 'Campus walk', 'cardio', 40, '2026-10-05'),
  ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000003', 'Morning mobility', 'mobility', 35, '2026-10-07')
ON CONFLICT DO NOTHING;

INSERT INTO goals (id, user_id, title, target_workouts, start_date, target_date) VALUES
  ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'Complete 4 workouts this week', 4, '2026-10-05', '2026-10-11'),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Build a 3-workout foundation', 3, '2026-10-01', '2026-10-31'),
  ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', 'Complete 3 workouts this week', 3, '2026-10-05', '2026-10-11'),
  ('20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000003', 'Make time for 2 workouts', 2, '2026-10-05', '2026-10-11')
ON CONFLICT DO NOTHING;
