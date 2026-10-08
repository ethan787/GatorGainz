import { useEffect, useState } from 'react';
import { loadDashboard, type DashboardData } from './api';
import ProgressChart from './components/ProgressChart';

const formatDate = (date: string) =>
  new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setData(null);
    loadDashboard(controller.signal)
      .then((result) => {
        setData(result);
        setSelectedUserId((current) =>
          result.users.some((user) => user.id === current) ? current : (result.users[0]?.id ?? ''),
        );
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Something went wrong. Please try again.',
          );
      });
    return () => controller.abort();
  }, [reload]);

  const user = data?.users.find((entry) => entry.id === selectedUserId);
  const workouts = data?.workouts.filter((entry) => entry.userId === selectedUserId) ?? [];
  const goals = data?.goals.filter((entry) => entry.userId === selectedUserId) ?? [];
  const minutes = workouts.reduce((total, workout) => total + workout.durationMinutes, 0);

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#dashboard">
          <span className="brand-mark" aria-hidden="true">
            G
          </span>
          GatorGainz
        </a>
        <nav aria-label="Main navigation">
          <a href="#workouts">Workouts</a>
          <a href="#goals">Goals</a>
          <a href="#rankings">Rankings</a>
        </nav>
        <span className="status-pill">
          {data
            ? data.health.dataSource === 'demo'
              ? 'Demo data'
              : 'Database connected'
            : 'Fitness preview'}
        </span>
      </header>

      <main id="dashboard">
        <section className="intro">
          <div>
            <p className="eyebrow">BUILD YOUR MOMENTUM</p>
            <h1>Small steps. Stronger you.</h1>
            <p className="muted">Your workouts, your goals, and a little friendly competition.</p>
          </div>
          {data && data.users.length > 0 && (
            <label className="profile-picker">
              Viewing profile
              <select
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
              >
                {data.users.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.displayName}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        {error ? (
          <div className="notice" role="alert">
            <p>{error}</p>
            <button onClick={() => setReload((value) => value + 1)}>Try again</button>
          </div>
        ) : !data ? (
          <p className="notice" role="status">
            Loading your dashboard…
          </p>
        ) : (
          <>
            <div className="preview-note">
              Read-only preview{user ? ` · ${user.displayName}` : ''}. Workout logging and account
              sign-in are planned next.
            </div>
            <section className="stats" aria-label="Activity summary">
              <article className="stat">
                <p>Workouts completed</p>
                <strong>{workouts.length}</strong>
                <span>All recorded workouts</span>
              </article>
              <article className="stat">
                <p>Active minutes</p>
                <strong>
                  {minutes}
                  <small> min</small>
                </strong>
                <span>Time invested in yourself</span>
              </article>
              <article className="stat">
                <p>Goals reached</p>
                <strong>
                  {goals.filter((goal) => goal.completedWorkouts >= goal.targetWorkouts).length}
                  <small> / {goals.length}</small>
                </strong>
                <span>Keep showing up</span>
              </article>
            </section>

            <div className="dashboard-grid">
              <section className="card">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">YOUR CONSISTENCY</p>
                    <h2>Activity progress</h2>
                  </div>
                  <span className="subtle-label">Last 7 workout dates</span>
                </div>
                {workouts.length ? (
                  <ProgressChart workouts={workouts} />
                ) : (
                  <p className="empty">Your activity chart will appear after your first workout.</p>
                )}
              </section>

              <section className="card" id="goals">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">ONE STEP AT A TIME</p>
                    <h2>Your goals</h2>
                  </div>
                </div>
                {goals.length ? (
                  goals.map((goal) => (
                    <article className="goal" key={goal.id}>
                      <div className="goal-title">
                        <h3>{goal.title}</h3>
                        <span>
                          {goal.completedWorkouts}/{goal.targetWorkouts}
                        </span>
                      </div>
                      <progress
                        value={Math.min(goal.completedWorkouts, goal.targetWorkouts)}
                        max={goal.targetWorkouts}
                        aria-label={`${goal.title}: ${goal.completedWorkouts} of ${goal.targetWorkouts} workouts`}
                      />
                      <p>
                        {formatDate(goal.startDate)}–{formatDate(goal.targetDate)} ·{' '}
                        {goal.completedWorkouts >= goal.targetWorkouts
                          ? 'Goal reached'
                          : 'In progress'}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="empty">No goals yet. A fresh start is a good start.</p>
                )}
              </section>

              <section className="card" id="workouts">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">PUTTING IN THE WORK</p>
                    <h2>Workout history</h2>
                  </div>
                  <span className="subtle-label">{workouts.length} workouts</span>
                </div>
                {workouts.length ? (
                  <ul className="workout-list">
                    {workouts.map((workout) => (
                      <li key={workout.id}>
                        <span className="workout-icon" aria-hidden="true">
                          {workout.category === 'strength'
                            ? '↗'
                            : workout.category === 'cardio'
                              ? '↟'
                              : '↔'}
                        </span>
                        <div>
                          <h3>{workout.name}</h3>
                          <p>
                            {formatDate(workout.completedAt)} · {workout.category}
                          </p>
                        </div>
                        <span className="duration">{workout.durationMinutes} min</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty">No workouts recorded yet.</p>
                )}
              </section>

              <section className="card" id="rankings">
                <div className="card-heading">
                  <div>
                    <p className="eyebrow">GROW TOGETHER</p>
                    <h2>Community rankings</h2>
                  </div>
                </div>
                <p className="ranking-caption">All-time workouts · ties sorted by active minutes</p>
                {data.rankings.length ? (
                  <ol className="ranking-list">
                    {data.rankings.map((ranking) => (
                      <li
                        key={ranking.userId}
                        className={ranking.userId === selectedUserId ? 'selected-ranking' : ''}
                      >
                        <span className="rank">{ranking.rank}</span>
                        <div>
                          <h3>
                            {ranking.displayName}
                            {ranking.userId === selectedUserId && (
                              <span className="you-label">Viewing</span>
                            )}
                          </h3>
                          <p>{ranking.totalMinutes} active minutes</p>
                        </div>
                        <strong>
                          {ranking.totalWorkouts}
                          <span> workouts</span>
                        </strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="empty">Community rankings will appear here.</p>
                )}
              </section>
            </div>
          </>
        )}
      </main>
      <footer>
        GatorGainz <span>Make progress at your own pace.</span>
      </footer>
    </div>
  );
}
