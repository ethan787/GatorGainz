import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import type { AuthUser, ConnectionsResponse, InvitePreview, NewWorkoutRequest, ProfileResponse, WorkoutHistoryItem } from "@gatorgainz/types";
import { getAuthErrorMessage, getCurrentUser, loginAccount, logoutAccount, registerAccount } from "./auth-api";
import gatorMark from "./assets/gator-gainz-mark.png";
import { Button, Card, getInitials, Icon, Label, PageTitle, StatCard, type IconName } from "./ui";
import { api, ApiError, clearPendingInvite, errorMessage, localDate, pendingInvite } from "./api";
import { Avatar, Community } from "./community";
import { formatMinutes, Profile } from "./profile";

type Tab = "home" | "log" | "community" | "profile";
type Theme = "light" | "dark";
type AuthMode = "login" | "register";
type UserAccount = AuthUser;

type Workout = {
  name: string;
  group: string;
  difficulty: "Easy" | "Medium" | "Hard";
  points: number;
  tracking?: "strength" | "cardio";
  cardioMetric?: {
    label: string;
    unit: string;
    min: number;
    max: number;
    step: number;
    initial: number;
    baseline: number;
  };
};

type SessionExercise = Workout & {
  id: string;
  sets: number;
  reps: number;
  minutes: number;
  metricValue: number;
  earned: number;
};

const workouts: Workout[] = [
  { name: "Lat pull-down", group: "Back", difficulty: "Medium", points: 18 },
  { name: "Barbell bench press", group: "Chest", difficulty: "Hard", points: 24 },
  { name: "Back squat", group: "Legs", difficulty: "Hard", points: 28 },
  { name: "Deadlift", group: "Full body", difficulty: "Hard", points: 32 },
  { name: "Seated cable row", group: "Back", difficulty: "Medium", points: 18 },
  { name: "Dumbbell shoulder press", group: "Shoulders", difficulty: "Medium", points: 20 },
  { name: "Leg press", group: "Legs", difficulty: "Medium", points: 20 },
  { name: "Incline dumbbell press", group: "Chest", difficulty: "Medium", points: 20 },
  { name: "Pull-ups", group: "Back", difficulty: "Hard", points: 26 },
  { name: "Romanian deadlift", group: "Legs", difficulty: "Hard", points: 26 },
  { name: "Bicep curls", group: "Arms", difficulty: "Easy", points: 12 },
  { name: "Tricep pushdown", group: "Arms", difficulty: "Easy", points: 12 },
  { name: "Lateral raises", group: "Shoulders", difficulty: "Easy", points: 12 },
  { name: "Walking lunges", group: "Legs", difficulty: "Medium", points: 18 },
  { name: "Plank hold", group: "Core", difficulty: "Medium", points: 16 },
  { name: "Hanging leg raises", group: "Core", difficulty: "Hard", points: 22 },
  { name: "Chest-supported row", group: "Back", difficulty: "Medium", points: 19 },
  { name: "Single-arm dumbbell row", group: "Back", difficulty: "Medium", points: 18 },
  { name: "Face pulls", group: "Back", difficulty: "Easy", points: 12 },
  { name: "Push-ups", group: "Chest", difficulty: "Easy", points: 13 },
  { name: "Cable chest fly", group: "Chest", difficulty: "Medium", points: 17 },
  { name: "Dumbbell floor press", group: "Chest", difficulty: "Medium", points: 18 },
  { name: "Bulgarian split squat", group: "Legs", difficulty: "Hard", points: 27 },
  { name: "Leg extension", group: "Legs", difficulty: "Easy", points: 13 },
  { name: "Seated hamstring curl", group: "Legs", difficulty: "Medium", points: 16 },
  { name: "Standing calf raise", group: "Legs", difficulty: "Easy", points: 11 },
  { name: "Hammer curls", group: "Arms", difficulty: "Medium", points: 15 },
  { name: "Skull crushers", group: "Arms", difficulty: "Medium", points: 17 },
  { name: "Dips", group: "Arms", difficulty: "Hard", points: 23 },
  { name: "Arnold press", group: "Shoulders", difficulty: "Hard", points: 23 },
  { name: "Rear delt fly", group: "Shoulders", difficulty: "Easy", points: 13 },
  { name: "Cable woodchop", group: "Core", difficulty: "Medium", points: 17 },
  { name: "Ab wheel rollout", group: "Core", difficulty: "Hard", points: 24 },
  { name: "Russian twists", group: "Core", difficulty: "Easy", points: 12 },
  { name: "Kettlebell swings", group: "Full body", difficulty: "Hard", points: 27 },
  { name: "Clean and press", group: "Full body", difficulty: "Hard", points: 31 },
  { name: "Farmer carry", group: "Full body", difficulty: "Medium", points: 21 },
  { name: "Incline barbell press", group: "Chest", difficulty: "Hard", points: 24 },
  { name: "Decline bench press", group: "Chest", difficulty: "Medium", points: 20 },
  { name: "Pec deck fly", group: "Chest", difficulty: "Easy", points: 14 },
  { name: "Low-to-high cable fly", group: "Chest", difficulty: "Medium", points: 18 },
  { name: "T-bar row", group: "Back", difficulty: "Hard", points: 24 },
  { name: "Straight-arm pull-down", group: "Back", difficulty: "Medium", points: 17 },
  { name: "Barbell shrugs", group: "Back", difficulty: "Medium", points: 18 },
  { name: "Back extensions", group: "Back", difficulty: "Easy", points: 14 },
  { name: "Reverse pec deck", group: "Back", difficulty: "Medium", points: 17 },
  { name: "Front raises", group: "Shoulders", difficulty: "Easy", points: 12 },
  { name: "Cable lateral raises", group: "Shoulders", difficulty: "Medium", points: 15 },
  { name: "Upright row", group: "Shoulders", difficulty: "Medium", points: 17 },
  { name: "Preacher curls", group: "Arms", difficulty: "Medium", points: 16 },
  { name: "Incline dumbbell curls", group: "Arms", difficulty: "Medium", points: 16 },
  { name: "Concentration curls", group: "Arms", difficulty: "Easy", points: 13 },
  { name: "Overhead tricep extension", group: "Arms", difficulty: "Medium", points: 17 },
  { name: "Close-grip bench press", group: "Arms", difficulty: "Hard", points: 22 },
  { name: "Wrist curls", group: "Arms", difficulty: "Easy", points: 10 },
  { name: "Reverse wrist curls", group: "Arms", difficulty: "Easy", points: 10 },
  { name: "Cable crunches", group: "Core", difficulty: "Medium", points: 16 },
  { name: "Side plank", group: "Core", difficulty: "Medium", points: 15 },
  { name: "Pallof press", group: "Core", difficulty: "Medium", points: 16 },
  { name: "Bicycle crunches", group: "Core", difficulty: "Easy", points: 12 },
  { name: "Hip thrust", group: "Legs", difficulty: "Hard", points: 25 },
  { name: "Glute bridge", group: "Legs", difficulty: "Easy", points: 13 },
  { name: "Front squat", group: "Legs", difficulty: "Hard", points: 27 },
  { name: "Hack squat", group: "Legs", difficulty: "Hard", points: 25 },
  { name: "Lying leg curl", group: "Legs", difficulty: "Medium", points: 16 },
  { name: "Hip adduction", group: "Legs", difficulty: "Easy", points: 12 },
  { name: "Hip abduction", group: "Legs", difficulty: "Easy", points: 12 },
  { name: "Donkey calf raise", group: "Legs", difficulty: "Medium", points: 15 },
  { name: "Tibialis raise", group: "Legs", difficulty: "Easy", points: 10 },
  { name: "Sled push", group: "Full body", difficulty: "Hard", points: 29 },
  { name: "Dumbbell thrusters", group: "Full body", difficulty: "Hard", points: 28 },
  { name: "Outdoor run", group: "Cardio", difficulty: "Medium", points: 22, tracking: "cardio", cardioMetric: { label: "Miles run", unit: "mi", min: 1, max: 30, step: 1, initial: 3, baseline: 3 } },
  { name: "Treadmill run", group: "Cardio", difficulty: "Medium", points: 20, tracking: "cardio", cardioMetric: { label: "Miles run", unit: "mi", min: 1, max: 30, step: 1, initial: 3, baseline: 3 } },
  { name: "Stadium stairs", group: "Cardio", difficulty: "Hard", points: 26, tracking: "cardio", cardioMetric: { label: "Stairs climbed", unit: "steps", min: 50, max: 5000, step: 50, initial: 500, baseline: 500 } },
  { name: "Stair climber", group: "Cardio", difficulty: "Medium", points: 18, tracking: "cardio", cardioMetric: { label: "Floors climbed", unit: "floors", min: 5, max: 300, step: 5, initial: 30, baseline: 30 } },
  { name: "Cycling", group: "Cardio", difficulty: "Medium", points: 19, tracking: "cardio", cardioMetric: { label: "Miles ridden", unit: "mi", min: 1, max: 100, step: 1, initial: 8, baseline: 8 } },
  { name: "Swimming laps", group: "Cardio", difficulty: "Hard", points: 25, tracking: "cardio", cardioMetric: { label: "Laps completed", unit: "laps", min: 5, max: 300, step: 5, initial: 20, baseline: 20 } },
  { name: "Rowing machine", group: "Cardio", difficulty: "Medium", points: 19, tracking: "cardio", cardioMetric: { label: "Meters rowed", unit: "m", min: 250, max: 20000, step: 250, initial: 2000, baseline: 2000 } },
  { name: "Elliptical", group: "Cardio", difficulty: "Easy", points: 14, tracking: "cardio", cardioMetric: { label: "Miles completed", unit: "mi", min: 1, max: 30, step: 1, initial: 3, baseline: 3 } },
  { name: "Brisk walk", group: "Cardio", difficulty: "Easy", points: 11, tracking: "cardio", cardioMetric: { label: "Miles walked", unit: "mi", min: 1, max: 30, step: 1, initial: 2, baseline: 2 } },
  { name: "Jump rope", group: "Cardio", difficulty: "Easy", points: 14, tracking: "cardio", cardioMetric: { label: "Jumps completed", unit: "jumps", min: 50, max: 5000, step: 50, initial: 500, baseline: 500 } },
  { name: "Burpees", group: "Cardio", difficulty: "Hard", points: 25 },
];

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Gator";
}


function Logo() {
  return (
    <div className="logo">
      <div className="logo-mark"><img src={gatorMark} alt="" /></div>
      <span>GatorGainz</span>
    </div>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: UserAccount) => void }) {
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [mode, setMode] = useState<AuthMode>(() => (pendingInvite() ? "register" : "login"));
  useEffect(() => {
    const code = pendingInvite();
    if (!code) return;
    api.previewInvite(code).then(setInvite).catch(() => {
      setInvite(null);
      clearPendingInvite();
    });
  }, []);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setMessage("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password || (mode === "register" && !fullName.trim())) {
      setMessage("Complete all required fields to continue.");
      return;
    }
    if (normalizedEmail.length > 254) {
      setMessage("Use an email address with at most 254 characters.");
      return;
    }
    if (mode === "register" && fullName.trim().length > 80) {
      setMessage("Use a full name with at most 80 characters.");
      return;
    }
    if (mode === "register" && Array.from(password).length < 15) {
      setMessage("Create a password with at least 15 characters.");
      return;
    }
    if (mode === "register" && new TextEncoder().encode(password).length > 72) {
      setMessage("Use a password with at most 72 UTF-8 bytes. Some characters use more than one byte.");
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setMessage("Your passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const account = mode === "register"
        ? await registerAccount({ fullName: fullName.trim(), email: normalizedEmail, password })
        : await loginAccount({ email: normalizedEmail, password });
      setPassword("");
      setConfirmPassword("");
      onAuthenticated(account);
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-brand"><Logo /><span>Train. Track. Rise.</span></div>
      <Card className="auth-card">
        <div className="auth-icon"><Icon name="lock" size={24} /></div>
        {invite && <div className="invite-banner" role="status"><Icon name="users" size={16} /> <span><strong>{invite.fullName}</strong> (@{invite.handle}) invited you. Create an account or log in to connect.</span></div>}
        <Label>Welcome to the swamp</Label>
        <div className="auth-title">{mode === "login" ? "Get back in the game" : "Start your Gainz journey"}</div>
        <p className="auth-subtitle">{mode === "login" ? "Log in to keep your workouts, points, and progress moving." : "Create your account and make every workout count."}</p>
        <div className="auth-toggle" aria-label="Authentication option">
          <Button className={mode === "login" ? "active" : ""} disabled={isSubmitting} onClick={() => switchMode("login")}>Log in</Button>
          <Button className={mode === "register" ? "active" : ""} disabled={isSubmitting} onClick={() => switchMode("register")}>Create account</Button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === "register" && (
            <label>
              <span>Full name</span>
              <input autoComplete="name" required maxLength={80} disabled={isSubmitting} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Jordan Smith" />
            </label>
          )}
          <label>
            <span>Email address</span>
            <input type="email" autoComplete="username" required maxLength={254} disabled={isSubmitting} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          </label>
          <label>
            <span>Password</span>
            <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required disabled={isSubmitting} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "login" ? "Enter your password" : "At least 15 characters"} />
          </label>
          {mode === "register" && (
            <label>
              <span>Confirm password</span>
              <input type="password" autoComplete="new-password" required disabled={isSubmitting} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" />
            </label>
          )}
          {message && <div className="auth-message" role="alert">{message}</div>}
          <Button type="submit" className="primary-button auth-submit" disabled={isSubmitting}>
            {isSubmitting ? "Please wait..." : mode === "login" ? "Log in to GatorGainz" : "Create my account"} <Icon name="arrow" size={17} />
          </Button>
        </form>
        <p className="auth-footnote">Your account, workouts, and points are saved on the server and sync across your devices.</p>
      </Card>
      <div className="auth-stripe"><i /><i /></div>
    </main>
  );
}

function Sidebar({ tab, setTab, user, profile }: { tab: Tab; setTab: (tab: Tab) => void; user: UserAccount; profile: ProfileResponse | null }) {
  const nav: { id: Tab; label: string; icon: IconName }[] = [
    { id: "home", label: "Overview", icon: "home" },
    { id: "log", label: "Log workout", icon: "plus" },
    { id: "community", label: "Community", icon: "users" },
    { id: "profile", label: "Account", icon: "user" },
  ];
  const stats = profile?.stats;
  return (
    <>
      <aside className="sidebar">
        <Logo />
        <nav className="nav-list">
          <Label>Workspace</Label>
          {nav.map((item) => (
            <Button key={item.id} onClick={() => setTab(item.id)} className={`nav-item ${tab === item.id ? "active" : ""}`}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "log" && <span className="nav-shortcut">L</span>}
            </Button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Card className="streak-card">
            <div className="streak-icon"><Icon name="fire" /></div>
            <div>
              <strong>{stats ? `${stats.currentStreakDays} day streak` : "Streak"}</strong>
              <span>{stats ? (stats.currentStreakDays > 0 && stats.currentStreakDays >= stats.longestStreakDays ? "Personal best" : `Best: ${stats.longestStreakDays} days`) : "Loading..."}</span>
            </div>
          </Card>
          <Button className="mini-profile" onClick={() => setTab("profile")}>
            <div className="avatar avatar-green">{getInitials(user.fullName)}</div>
            <div><strong>{user.fullName}</strong><span>{stats ? `Level ${stats.level.level}` : ""}</span></div>
            <Icon name="chevron" size={16} />
          </Button>
        </div>
      </aside>
      <nav className="mobile-nav">
        {nav.map((item) => (
          <Button key={item.id} label={item.label} onClick={() => setTab(item.id)} className={tab === item.id ? "active" : ""}>
            <Icon name={item.icon} /><span>{item.label === "Log workout" ? "Log" : item.label.split(" ")[0]}</span>
          </Button>
        ))}
      </nav>
    </>
  );
}

function TopBar({ title, points, connections, onChanged, openCommunity }: { title: string; points: number | null; connections: ConnectionsResponse | null; onChanged: () => void; openCommunity: () => void }) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [error, setError] = useState("");
  const incoming = connections?.incoming ?? [];
  async function respond(userId: string, accept: boolean) {
    setError("");
    try {
      if (accept) await api.acceptConnection(userId);
      else await api.removeConnection(userId);
      onChanged();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  return (
    <header className="topbar">
      <div className="mobile-logo"><Logo /></div>
      <span className="topbar-name">{title}</span>
      <div className="top-actions">
        <div className="points-pill" title="Server-verified points"><Icon name="bolt" size={15} /><strong>{points === null ? "—" : points.toLocaleString()}</strong><span>pts</span></div>
        <Button className="icon-button" label={`Notifications${incoming.length ? `: ${incoming.length} connection requests` : ""}`} onClick={() => {
          // Refresh on open so new requests show without waiting for the next poll.
          if (!showNotifications) onChanged();
          setShowNotifications((visible) => !visible);
        }}>
          <Icon name="bell" size={19} />{incoming.length > 0 && <i />}
        </Button>
      </div>
      {showNotifications && (
        <Card className="notification-panel">
          <div className="notification-heading">
            <div><Label>Updates</Label><div className="section-title">Connection requests</div></div>
            <span>{incoming.length} new</span>
          </div>
          {error && <p className="auth-message" role="alert">{error}</p>}
          {incoming.length > 0 ? incoming.map((person) => (
            <div className="notification-row" key={person.userId}>
              <Avatar userId={person.userId} name={person.fullName} />
              <div><strong>{person.fullName}</strong><span>@{person.handle} wants to connect.</span></div>
              <Button className="notification-action" onClick={() => respond(person.userId, true)}>Accept</Button>
              <Button className="mini-text-button" label={`Decline ${person.fullName}`} onClick={() => respond(person.userId, false)}>Decline</Button>
            </div>
          )) : <p className="empty-message">You're all caught up.</p>}
          <Button className="text-button" onClick={() => { setShowNotifications(false); openCommunity(); }}>Open Community <Icon name="chevron" size={14} /></Button>
        </Card>
      )}
    </header>
  );
}

function WeeklyChart({ profile }: { profile: ProfileResponse | null }) {
  const days = profile?.stats.last7Days ?? [];
  const max = Math.max(1, ...days.map((day) => day.points));
  const total = days.reduce((sum, day) => sum + day.points, 0);
  return (
    <Card className="activity-card">
      <div className="card-head">
        <div><Label>Last 7 days</Label><div className="section-title">Your momentum</div></div>
        <div className="trend"><Icon name="bolt" size={15} /> {total.toLocaleString()} pts</div>
      </div>
      <div className="chart">
        {days.map((day) => (
          <div className="bar-wrap" key={day.date} title={`${day.points} pts · ${day.workouts} workouts`}>
            <div className="bar-track"><div className={`bar ${day.points ? "" : "future"}`} style={{ height: `${Math.max(day.points ? 6 : 2, Math.round((day.points / max) * 100))}%` }} /></div>
            <span>{new Date(`${day.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "narrow" })}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ChallengeCard({ profile, goLog }: { profile: ProfileResponse | null; goLog: () => void }) {
  const week = profile?.stats.thisWeek;
  const percent = week ? Math.min(100, Math.round((week.workouts / week.goal) * 100)) : 0;
  return (
    <Card className="challenge-card">
      <div className="challenge-orb orb-one" />
      <div className="challenge-orb orb-two" />
      <div className="challenge-top">
        <span className="challenge-badge"><Icon name="trophy" size={15} /> WEEKLY GOAL</span>
        <span>Last 7 days</span>
      </div>
      <div className="challenge-title">{week ? `${week.goal} ${week.goal === 1 ? "workout" : "workouts"} this week` : "Your weekly goal"}</div>
      <p>{week && week.workouts >= week.goal ? "Goal reached. Keep the momentum going!" : "Log workouts to fill the bar. Change your goal on the Account page."}</p>
      <div className="challenge-progress">
        <div className="progress-copy"><strong>{week?.workouts ?? 0}</strong><span>/ {week?.goal ?? "—"} workouts · {(week?.points ?? 0).toLocaleString()} pts</span><b>{percent}%</b></div>
        <div className="progress-track"><div style={{ width: `${percent}%` }} /></div>
      </div>
      {week && week.workouts < week.goal && <Button className="text-button challenge-link" onClick={goLog}>Log a workout <Icon name="chevron" size={14} /></Button>}
    </Card>
  );
}

function RecentActivity({ refreshKey, goLog }: { refreshKey: number; goLog: () => void }) {
  const [items, setItems] = useState<WorkoutHistoryItem[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.recentWorkouts(5)
      .then((result) => active && setItems(result.items))
      .catch((failure) => active && setError(errorMessage(failure)));
    return () => { active = false; };
  }, [refreshKey]);
  const icon: Record<WorkoutHistoryItem["category"], [IconName, string]> = {
    strength: ["dumbbell", "lavender"],
    cardio: ["bolt", "mint"],
    mobility: ["fire", "coral"],
  };
  return (
    <Card className="recent-card">
      <div className="card-head">
        <div><Label>History</Label><div className="section-title">Recent activity</div></div>
      </div>
      {error && <p className="auth-message" role="alert">{error}</p>}
      <div className="activity-list">
        {items?.length === 0 && <p className="empty-message">No workouts yet. <Button className="text-button" onClick={goLog}>Log your first one</Button></p>}
        {items?.map((item) => (
          <div className="activity-row" key={item.id}>
            <div className={`activity-icon ${icon[item.category][1]}`}><Icon name={icon[item.category][0]} /></div>
            <div className="activity-copy"><strong>{item.name}</strong><span>{new Date(`${item.completedAt}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {formatMinutes(item.durationMinutes)}</span></div>
            <div className="activity-points">{item.points === null ? "—" : `+${item.points.toLocaleString()} pts`}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function Dashboard({ goLog, profile, user, refreshKey }: { goLog: () => void; profile: ProfileResponse | null; user: UserAccount; refreshKey: number }) {
  const stats = profile?.stats;
  const value = (number: number | undefined) => (number === undefined ? "—" : number.toLocaleString());
  return (
    <div className="page">
      <div className="welcome-row">
        <PageTitle subtitle={stats && stats.currentStreakDays > 1 ? `${stats.currentStreakDays} days in a row. Keep the pace.` : "Every logged workout earns server-verified points."}>{greeting()}, {getFirstName(user.fullName)}.</PageTitle>
        <Button className="primary-button" onClick={goLog}><Icon name="plus" size={18} /> Log a workout</Button>
      </div>
      <div className="stats-grid">
        <StatCard icon="bolt" label="Total points" value={value(stats?.totalPoints)} detail={stats ? `+${stats.thisWeek.points.toLocaleString()} in the last 7 days` : ""} color="yellow" />
        <StatCard icon="fire" label="Current streak" value={stats ? `${stats.currentStreakDays} ${stats.currentStreakDays === 1 ? "day" : "days"}` : "—"} detail={stats ? `Best: ${stats.longestStreakDays} days` : ""} color="coral" />
        <StatCard icon="clock" label="Active time" value={stats ? formatMinutes(stats.totalMinutes) : "—"} detail={stats ? `${formatMinutes(stats.thisWeek.minutes)} in the last 7 days` : ""} color="blue" />
        <StatCard icon="check" label="Workouts" value={value(stats?.totalWorkouts)} detail={stats ? `${stats.thisWeek.workouts} in the last 7 days` : ""} color="green" />
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <ChallengeCard profile={profile} goLog={goLog} />
          <WeeklyChart profile={profile} />
        </div>
        <RecentActivity refreshKey={refreshKey} goLog={goLog} />
      </div>
    </div>
  );
}

function Stepper({ value, onChange, min = 1, max = 20, step = 1, unit }: { value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
  const [draft, setDraft] = useState(value.toString());
  useEffect(() => setDraft(value.toString()), [value]);

  function commitValue(nextValue: string) {
    const parsed = Number(nextValue);
    const normalized = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : value;
    onChange(normalized);
    setDraft(normalized.toString());
  }

  return (
    <div className="stepper">
      <Button label="Decrease" onClick={() => onChange(Math.max(min, value - step))}>−</Button>
      <span className="stepper-value">
        <input
          aria-label={unit ? `Enter value in ${unit}` : "Enter value"}
          inputMode="numeric"
          value={draft}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (!/^\d*$/.test(nextValue)) return;
            setDraft(nextValue);
            if (nextValue !== "") onChange(Math.min(max, Number(nextValue)));
          }}
          onBlur={() => commitValue(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        {unit && <small>{unit}</small>}
      </span>
      <Button label="Increase" onClick={() => onChange(Math.min(max, value + step))}>+</Button>
    </div>
  );
}

const anatomyRegions = [
  { id: "pecs", label: "Pecs", workout: "Barbell bench press" },
  { id: "delts", label: "Delts", workout: "Dumbbell shoulder press" },
  { id: "biceps", label: "Biceps", workout: "Preacher curls" },
  { id: "triceps", label: "Triceps", workout: "Overhead tricep extension" },
  { id: "forearms", label: "Forearms", workout: "Wrist curls" },
  { id: "abs", label: "Abs", workout: "Cable crunches" },
  { id: "obliques", label: "Obliques", workout: "Cable woodchop" },
  { id: "traps", label: "Traps", workout: "Barbell shrugs" },
  { id: "upper-back", label: "Upper back", workout: "Chest-supported row" },
  { id: "lats", label: "Lats", workout: "Lat pull-down" },
  { id: "lower-back", label: "Lower back", workout: "Back extensions" },
  { id: "glutes", label: "Glutes", workout: "Hip thrust" },
  { id: "quads", label: "Quads", workout: "Front squat" },
  { id: "hamstrings", label: "Hamstrings", workout: "Lying leg curl" },
  { id: "calves", label: "Calves", workout: "Donkey calf raise" },
];

function workoutMuscles(workout: Workout) {
  const name = workout.name.toLowerCase();
  if (workout.group === "Full body") {
    if (name.includes("deadlift")) return ["traps", "lower-back", "glutes", "hamstrings"];
    if (name.includes("farmer")) return ["traps", "forearms", "abs"];
    return anatomyRegions.map((region) => region.id);
  }
  if (workout.group === "Cardio") return ["abs", "quads", "calves"];
  if (workout.group === "Chest") return ["pecs", ...(name.includes("push-up") || name.includes("bench") ? ["triceps"] : [])];
  if (workout.group === "Shoulders") return ["delts", ...(name.includes("rear") ? ["upper-back"] : [])];
  if (workout.group === "Arms") {
    if (name.includes("wrist")) return ["forearms"];
    if (name.includes("curl")) return ["biceps", "forearms"];
    if (name.includes("tricep") || name.includes("skull") || name.includes("dip")) return ["triceps"];
    return ["biceps", "triceps"];
  }
  if (workout.group === "Core") return name.includes("wood") || name.includes("russian") ? ["obliques", "abs"] : ["abs"];
  if (workout.group === "Back") {
    if (name.includes("shrug")) return ["traps"];
    if (name.includes("extension")) return ["lower-back"];
    if (name.includes("reverse")) return ["upper-back", "delts"];
    if (name.includes("pull-down") || name.includes("pull-up")) return ["lats", "biceps"];
    if (name.includes("face")) return ["traps", "upper-back", "delts"];
    return ["upper-back", "lats", "biceps"];
  }
  if (workout.group === "Legs") {
    if (name.includes("calf") || name.includes("tibialis")) return ["calves"];
    if (name.includes("hamstring") || name.includes("romanian")) return ["hamstrings", "glutes", "lower-back"];
    if (name.includes("hip thrust") || name.includes("glute") || name.includes("abduction")) return ["glutes"];
    if (name.includes("adduction")) return ["quads", "glutes"];
    if (name.includes("lunge") || name.includes("bulgarian")) return ["quads", "glutes", "hamstrings"];
    return ["quads", "glutes"];
  }
  return [];
}

function MuscleFigure({ view, activeRegions, onSelect }: { view: "front" | "back"; activeRegions: string[]; onSelect: (region: string) => void }) {
  const regionProps = (region: string) => ({
    className: `muscle-region muscle-${region} ${activeRegions.includes(region) ? "active" : ""}`,
    role: "button",
    tabIndex: 0,
    "aria-label": `Select ${anatomyRegions.find((item) => item.id === region)?.label ?? region}`,
    onClick: () => onSelect(region),
    onKeyDown: (event: KeyboardEvent<SVGElement>) => {
      if (event.key === "Enter" || event.key === " ") onSelect(region);
    },
  });

  return (
    <div className="muscle-figure">
      <span>{view === "front" ? "Front" : "Back"}</span>
      <svg viewBox="0 0 120 240" aria-label={`${view} muscle anatomy`}>
        <circle className="body-base" cx="60" cy="22" r="15" />
        <path className="body-base" d="M55 36H65L68 43H52ZM43 43Q60 35 77 43L82 91Q79 112 74 130Q68 139 60 140Q52 139 46 130Q41 112 38 91Z" />
        <path className="body-base" d="M40 48Q31 51 25 64L15 113Q13 121 20 124Q27 126 29 118L42 79Q45 61 40 48Z" />
        <path className="body-base" d="M80 48Q89 51 95 64L105 113Q107 121 100 124Q93 126 91 118L78 79Q75 61 80 48Z" />
        <path className="body-base" d="M48 128Q43 146 39 168L43 215Q44 224 51 224Q57 223 56 215L58 139Q55 130 48 128Z" />
        <path className="body-base" d="M72 128Q77 146 81 168L77 215Q76 224 69 224Q63 223 64 215L62 139Q65 130 72 128Z" />
        <path className="body-base" d="M43 216Q38 222 40 227H55Q57 222 51 217ZM77 216Q82 222 80 227H65Q63 222 69 217Z" />
        {view === "front" ? (
          <>
            <path {...regionProps("delts")} d="M45 45Q34 44 28 55Q27 63 37 67Q43 62 48 53ZM75 45Q86 44 92 55Q93 63 83 67Q77 62 72 53Z" />
            <path {...regionProps("pecs")} d="M47 55Q54 50 59 54L58 76Q49 81 43 74Q43 62 47 55ZM73 55Q66 50 61 54L62 76Q71 81 77 74Q77 62 73 55Z" />
            <path {...regionProps("biceps")} d="M33 68Q24 71 22 87Q22 96 28 99Q36 91 39 73ZM87 68Q96 71 98 87Q98 96 92 99Q84 91 81 73Z" />
            <path {...regionProps("forearms")} d="M21 98Q15 104 14 118Q18 124 25 120L29 98Q25 95 21 98ZM99 98Q105 104 106 118Q102 124 95 120L91 98Q95 95 99 98Z" />
            <path {...regionProps("abs")} d="M53 82Q59 78 59 89Q58 96 52 94Q49 88 53 82ZM67 82Q61 78 61 89Q62 96 68 94Q71 88 67 82ZM52 97Q59 94 59 104Q58 112 52 110Q49 103 52 97ZM68 97Q61 94 61 104Q62 112 68 110Q71 103 68 97ZM53 113Q59 110 59 121Q58 129 53 127Q50 120 53 113ZM67 113Q61 110 61 121Q62 129 67 127Q70 120 67 113Z" />
            <path {...regionProps("obliques")} d="M46 82Q40 91 43 112L51 127Q49 105 50 83ZM74 82Q80 91 77 112L69 127Q71 105 70 83Z" />
            <path {...regionProps("quads")} d="M49 130Q39 139 38 163Q41 174 50 171Q57 153 57 134ZM71 130Q81 139 82 163Q79 174 70 171Q63 153 63 134Z" />
            <path {...regionProps("calves")} d="M43 175Q36 187 42 211Q46 218 52 211L54 176Q49 170 43 175ZM77 175Q84 187 78 211Q74 218 68 211L66 176Q71 170 77 175Z" />
          </>
        ) : (
          <>
            <path {...regionProps("delts")} d="M45 45Q34 44 28 55Q27 63 38 67Q44 61 49 52ZM75 45Q86 44 92 55Q93 63 82 67Q76 61 71 52Z" />
            <path {...regionProps("traps")} d="M51 45Q60 51 69 45L74 58Q68 68 60 75Q52 68 46 58Z" />
            <path {...regionProps("upper-back")} d="M45 58Q51 64 58 76L57 91Q46 86 40 72ZM75 58Q69 64 62 76L63 91Q74 86 80 72Z" />
            <path {...regionProps("lats")} d="M40 75Q47 85 56 93L53 113Q42 106 38 91ZM80 75Q73 85 64 93L67 113Q78 106 82 91Z" />
            <path {...regionProps("lower-back")} d="M56 92Q60 98 64 92L69 121Q65 130 60 136Q55 130 51 121Z" />
            <path {...regionProps("triceps")} d="M33 68Q25 73 22 91Q23 99 29 100Q37 88 39 72ZM87 68Q95 73 98 91Q97 99 91 100Q83 88 81 72Z" />
            <path {...regionProps("forearms")} d="M21 99Q15 105 14 118Q18 124 25 120L29 99Q25 96 21 99ZM99 99Q105 105 106 118Q102 124 95 120L91 99Q95 96 99 99Z" />
            <path {...regionProps("glutes")} d="M49 125Q59 121 59 137Q54 148 45 143Q43 133 49 125ZM71 125Q61 121 61 137Q66 148 75 143Q77 133 71 125Z" />
            <path {...regionProps("hamstrings")} d="M47 144Q39 153 40 171Q45 178 52 171L57 143ZM73 144Q81 153 80 171Q75 178 68 171L63 143Z" />
            <path {...regionProps("calves")} d="M43 175Q36 187 42 211Q46 218 52 211L54 176Q49 170 43 175ZM77 175Q84 187 78 211Q74 218 68 211L66 176Q71 170 77 175Z" />
          </>
        )}
      </svg>
    </div>
  );
}

function MuscleExplorer({ selected, onSelectRegion }: { selected: Workout; onSelectRegion: (region: string) => void }) {
  const activeRegions = workoutMuscles(selected);

  return (
    <div className="muscle-explorer">
      <div className="muscle-explorer-copy">
        <div><Label>Visual muscle search</Label><div className="section-title">Tap where you want to train</div></div>
        <p>Select a muscle for a suggested exercise, or choose an exercise below to see its primary target.</p>
      </div>
      <div className="anatomy-stage">
        <MuscleFigure view="front" activeRegions={activeRegions} onSelect={onSelectRegion} />
        <MuscleFigure view="back" activeRegions={activeRegions} onSelect={onSelectRegion} />
      </div>
      <div className="muscle-legend">
        {anatomyRegions.map((region) => (
          <Button key={region.id} className={`legend-${region.id} ${activeRegions.includes(region.id) ? "active" : ""}`} onClick={() => onSelectRegion(region.id)}>
            <i />{region.label}
          </Button>
        ))}
      </div>
      <div className="muscle-suggestion">
        <span>Suggested movement</span>
        <strong>{selected.name}</strong>
        <small>Targets: {activeRegions.map((id) => anatomyRegions.find((region) => region.id === id)?.label).filter(Boolean).join(", ")}</small>
      </div>
    </div>
  );
}

const sessionStorageKey = "gatorgainz-workout-session";
const pinnedWorkoutsStorageKey = "gatorgainz-pinned-workouts";

function accountStorageKey(key: string, userId: string) {
  return `${key}:${userId}`;
}

function newSubmissionKey() {
  return window.crypto.randomUUID();
}

function loadSessionDraft(userId: string) {
  const fallback = { selectedName: workouts[1].name, sets: 4, reps: 8, minutes: 30, metricValue: 3, durationMinutes: 45, submissionKey: "", exercises: [] as SessionExercise[] };
  try {
    const saved = window.localStorage.getItem(accountStorageKey(sessionStorageKey, userId));
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

function WorkoutLogger({ userId, onSaved }: { userId: string; onSaved: (points: number | null) => void }) {
  const draftKey = accountStorageKey(sessionStorageKey, userId);
  const pinsKey = accountStorageKey(pinnedWorkoutsStorageKey, userId);
  const muscleMapKey = accountStorageKey("gatorgainz-show-muscle-map", userId);
  const [savedDraft] = useState(() => loadSessionDraft(userId));
  const [selected, setSelected] = useState<Workout>(() => workouts.find((workout) => workout.name === savedDraft.selectedName) ?? workouts[1]);
  const [sets, setSets] = useState(savedDraft.sets);
  const [reps, setReps] = useState(savedDraft.reps);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("All");
  const [complete, setComplete] = useState(false);
  const [minutes, setMinutes] = useState(savedDraft.minutes);
  const [metricValue, setMetricValue] = useState(savedDraft.metricValue);
  const [sessionExercises, setSessionExercises] = useState<SessionExercise[]>(savedDraft.exercises);
  const [durationMinutes, setDurationMinutes] = useState<number>(savedDraft.durationMinutes);
  // Kept with the draft so a retry after a lost response cannot save the session twice.
  const [submissionKey, setSubmissionKey] = useState<string>(savedDraft.submissionKey || newSubmissionKey());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showMuscleMap, setShowMuscleMap] = useState(() => {
    const saved = window.localStorage.getItem(muscleMapKey);
    return saved !== "false";
  });
  const [pinnedWorkouts, setPinnedWorkouts] = useState<string[]>(() => {
    try {
      const saved = window.localStorage.getItem(pinsKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const groups = ["All", "Chest", "Back", "Legs", "Arms", "Shoulders", "Core", "Full body", "Cardio"];
  const filtered = workouts
    .filter((workout) =>
      (group === "All" || workout.group === group) &&
      workout.name.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((first, second) => Number(pinnedWorkouts.includes(second.name)) - Number(pinnedWorkouts.includes(first.name)));
  const isCardio = selected.tracking === "cardio";
  const cardioMetric = selected.cardioMetric;
  const earned = isCardio
    ? Math.round(selected.points * (minutes / 20) * (0.75 + (metricValue / (cardioMetric?.baseline ?? 1)) * 0.25))
    : Math.round(selected.points * sets * (reps / 8));
  const sessionPoints = sessionExercises.reduce((total, exercise) => total + exercise.earned, 0);

  useEffect(() => {
    window.localStorage.setItem(draftKey, JSON.stringify({
      selectedName: selected.name,
      sets,
      reps,
      minutes,
      metricValue,
      durationMinutes,
      submissionKey,
      exercises: sessionExercises,
    }));
  }, [draftKey, selected, sets, reps, minutes, metricValue, durationMinutes, submissionKey, sessionExercises]);

  useEffect(() => {
    window.localStorage.setItem(pinsKey, JSON.stringify(pinnedWorkouts));
  }, [pinsKey, pinnedWorkouts]);
  useEffect(() => {
    window.localStorage.setItem(muscleMapKey, showMuscleMap.toString());
  }, [muscleMapKey, showMuscleMap]);

  function togglePinned(workoutName: string) {
    setPinnedWorkouts((current) => current.includes(workoutName)
      ? current.filter((name) => name !== workoutName)
      : [...current, workoutName]);
  }

  function selectWorkout(workout: Workout) {
    setSelected(workout);
    if (workout.cardioMetric) setMetricValue(workout.cardioMetric.initial);
  }

  function selectMuscleRegion(regionId: string) {
    const region = anatomyRegions.find((item) => item.id === regionId);
    const suggestion = workouts.find((workout) => workout.name === region?.workout);
    if (!suggestion) return;
    setGroup(suggestion.group);
    setQuery("");
    selectWorkout(suggestion);
  }

  function addExercise() {
    setComplete(true);
    setSessionExercises((current) => [...current, {
      ...selected,
      id: `${Date.now()}-${selected.name}`,
      sets,
      reps,
      minutes,
      metricValue,
      earned,
    }]);
    window.setTimeout(() => setComplete(false), 2600);
  }

  function editExercise(exercise: SessionExercise) {
    setSelected(workouts.find((workout) => workout.name === exercise.name) ?? exercise);
    setSets(exercise.sets);
    setReps(exercise.reps);
    setMinutes(exercise.minutes);
    setMetricValue(exercise.metricValue);
    setSessionExercises((current) => current.filter((item) => item.id !== exercise.id));
  }

  async function submitSession() {
    if (sessionExercises.length === 0 || submitting) return;
    const allCardio = sessionExercises.every((exercise) => exercise.tracking === "cardio");
    const body: NewWorkoutRequest = {
      name: `${sessionExercises.length}-exercise ${allCardio ? "cardio" : "training"} session`,
      category: allCardio ? "cardio" : "strength",
      durationMinutes,
      completedAt: localDate(),
      submissionKey,
      // Only what was done is sent; the server looks up points itself.
      exercises: sessionExercises.map((exercise) => exercise.tracking === "cardio"
        ? { name: exercise.name, minutes: exercise.minutes, metricValue: exercise.metricValue }
        : { name: exercise.name, sets: exercise.sets, reps: exercise.reps }),
    };
    setSubmitting(true);
    setSubmitError("");
    try {
      const result = await api.submitWorkout(body);
      setSessionExercises([]);
      setSubmissionKey(newSubmissionKey());
      window.localStorage.removeItem(draftKey);
      onSaved(result.award?.points ?? null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // An earlier attempt was saved before this session was edited.
        setSessionExercises([]);
        setSubmissionKey(newSubmissionKey());
        setSubmitError("This session was already saved earlier. Check Recent activity, then log any extra exercises as a new session.");
      } else {
        setSubmitError(`${errorMessage(error)} Your session is still here; try again.`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page log-page">
      <div className="welcome-row">
        <PageTitle subtitle="Choose an exercise, set your volume, and earn points.">Log a workout</PageTitle>
        <div className="points-guide"><Icon name="bolt" size={17} /> Harder movements earn more points</div>
      </div>
      <div className="logger-layout">
        <Card className="exercise-browser">
          <div className="browser-top">
            <div><Label>Exercise library</Label><div className="section-title">Pick your movement</div></div>
            <div className="browser-actions">
              <div className="search-box"><Icon name="search" size={18} /><input aria-label="Search exercises" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises" /></div>
              <Button className={`anatomy-toggle ${showMuscleMap ? "active" : ""}`} onClick={() => setShowMuscleMap((visible) => !visible)}>
                {showMuscleMap ? "Hide muscle map" : "Show muscle map"}
              </Button>
            </div>
          </div>
          {showMuscleMap && <MuscleExplorer selected={selected} onSelectRegion={selectMuscleRegion} />}
          <div className="filter-row">
            {groups.map((item) => <Button key={item} className={group === item ? "active" : ""} onClick={() => setGroup(item)}>{item}</Button>)}
          </div>
          <div className="exercise-grid">
            {filtered.map((workout) => (
              <div key={workout.name} className={`exercise-card ${selected.name === workout.name ? "selected" : ""}`}>
                <Button onClick={() => selectWorkout(workout)} className="exercise-select">
                  <div className={`exercise-symbol ${workout.group.toLowerCase().replace(" ", "-")}`}><Icon name="dumbbell" /></div>
                  <div className="exercise-content">
                    <strong>{workout.name}</strong>
                    <span>{workout.group} · {workout.difficulty}</span>
                  </div>
                  <div className="exercise-score"><Icon name="bolt" size={13} />{workout.points}</div>
                </Button>
                <Button
                  label={pinnedWorkouts.includes(workout.name) ? `Unpin ${workout.name}` : `Pin ${workout.name}`}
                  className={`pin-button ${pinnedWorkouts.includes(workout.name) ? "active" : ""}`}
                  onClick={() => togglePinned(workout.name)}
                >
                  <Icon name="pin" size={14} />
                </Button>
                {selected.name === workout.name && <div className="selected-check"><Icon name="check" size={14} /></div>}
              </div>
            ))}
          </div>
        </Card>
        <Card className="workout-builder">
          <Label>Current set</Label>
          <div className="builder-icon"><Icon name="dumbbell" size={28} /></div>
          <div className="builder-title">{selected.name}</div>
          <div className="builder-meta">{selected.group} · {selected.difficulty} intensity</div>
          <div className="builder-controls">
            {isCardio ? (
              <>
                <div><span>Minutes</span><Stepper value={minutes} onChange={setMinutes} min={5} max={120} /></div>
                <div>
                  <span>{cardioMetric?.label ?? "Distance"}</span>
                  <Stepper
                    value={metricValue}
                    onChange={setMetricValue}
                    min={cardioMetric?.min ?? 1}
                    max={cardioMetric?.max ?? 100}
                    step={cardioMetric?.step ?? 1}
                    unit={cardioMetric?.unit}
                  />
                </div>
              </>
            ) : (
              <>
                <div><span>Sets</span><Stepper value={sets} onChange={setSets} min={1} max={10} /></div>
                <div><span>Reps</span><Stepper value={reps} onChange={setReps} min={1} max={30} /></div>
              </>
            )}
          </div>
          <div className="points-preview">
            <span>Estimated points</span>
            <div><Icon name="bolt" /><strong>{earned}</strong><span>points</span></div>
            <p>{isCardio ? `Based on ${minutes} min and ${metricValue.toLocaleString()} ${cardioMetric?.unit ?? ""}` : `Base ${selected.points} pts × ${sets} sets × volume`}</p>
          </div>
          <Button className={`primary-button complete-button ${complete ? "success" : ""}`} disabled={complete} onClick={addExercise}>
            <Icon name={complete ? "check" : "plus"} size={18} />{complete ? `Added to session · +${earned}` : "Add to session"}
          </Button>
          <p className="builder-note">Your exercise and edits are saved automatically until you submit the full session.</p>
          <div className="session-builder">
            <div className="session-builder-head">
              <div><Label>Current session</Label><strong>{sessionExercises.length} exercises</strong></div>
              <span>{sessionPoints.toLocaleString()} pts</span>
            </div>
            {sessionExercises.length > 0 ? (
              <div className="session-exercises">
                {sessionExercises.map((exercise) => (
                  <div className="session-exercise" key={exercise.id}>
                    <div>
                      <strong>{exercise.name}</strong>
                      <span>{exercise.tracking === "cardio" ? `${exercise.minutes} min · ${exercise.metricValue.toLocaleString()} ${exercise.cardioMetric?.unit}` : `${exercise.sets} sets · ${exercise.reps} reps`} · {exercise.earned} pts</span>
                    </div>
                    <Button label={`Edit ${exercise.name}`} onClick={() => editExercise(exercise)}>Edit</Button>
                    <Button label={`Remove ${exercise.name}`} onClick={() => setSessionExercises((current) => current.filter((item) => item.id !== exercise.id))}>×</Button>
                  </div>
                ))}
              </div>
            ) : <p className="empty-session">Add exercises above to build your workout.</p>}
            {sessionExercises.length > 0 && (
              <div className="session-duration"><span>Session length (minutes)</span><Stepper value={durationMinutes} onChange={setDurationMinutes} min={5} max={600} step={5} /></div>
            )}
            {submitError && <p className="auth-message" role="alert">{submitError}</p>}
            <Button className="submit-session-button" disabled={sessionExercises.length === 0 || submitting} onClick={submitSession}>
              <Icon name="check" size={17} /> {submitting ? "Saving and scoring..." : "Submit session to Account"}
            </Button>
            <p className="builder-note">Points are calculated by the server when you submit.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function InvitePrompt({ onDone }: { onDone: () => void }) {
  const [code] = useState(pendingInvite);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!code) return;
    api.previewInvite(code).then(setPreview).catch(() => {
      clearPendingInvite();
      setMessage("That invite link is no longer valid.");
    });
  }, [code]);
  if (!code || (!preview && !message)) return null;
  function dismiss() {
    clearPendingInvite();
    setPreview(null);
    setMessage("");
  }
  async function connect() {
    setBusy(true);
    try {
      const result = await api.connectByInvite(code!);
      clearPendingInvite();
      setPreview(null);
      setMessage(`You are now connected with ${result.person.fullName}.`);
      onDone();
    } catch (error) {
      clearPendingInvite();
      setPreview(null);
      setMessage(error instanceof ApiError && error.status === 400 ? "That is your own invite link." : errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="invite-prompt" role="status">
      <Icon name="users" size={18} />
      {preview
        ? <><span><strong>{preview.fullName}</strong> (@{preview.handle}) invited you to train together.</span>
            <Button className="primary-button" disabled={busy} onClick={connect}>{busy ? "Connecting..." : "Connect"}</Button>
            <Button className="mini-text-button" onClick={dismiss}>Not now</Button></>
        : <><span>{message}</span><Button className="mini-text-button" label="Dismiss" onClick={dismiss}><Icon name="x" size={14} /></Button></>}
    </div>
  );
}

function AuthenticatedApp({ currentUser, setCurrentUser, theme, setTheme, onLogout }: { currentUser: UserAccount; setCurrentUser: (user: UserAccount) => void; theme: Theme; setTheme: (theme: Theme) => void; onLogout: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>("home");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [profileError, setProfileError] = useState("");
  const [connections, setConnections] = useState<ConnectionsResponse | null>(null);
  const [activityKey, setActivityKey] = useState(0);
  const titles = useMemo(() => ({ home: "Overview", log: "Log workout", community: "Community", profile: "Account" }), []);

  const loadProfile = useCallback(() => {
    setProfileError("");
    api.profile().then(setProfile).catch((error) => setProfileError(errorMessage(error)));
  }, []);
  const loadConnections = useCallback(() => {
    api.connections().then(setConnections).catch(() => undefined);
  }, []);
  const refreshCommunity = useCallback(() => {
    loadConnections();
    loadProfile();
  }, [loadConnections, loadProfile]);

  useEffect(() => {
    loadProfile();
    loadConnections();
    // New connection requests show up without a reload.
    const timer = window.setInterval(loadConnections, 60_000);
    return () => window.clearInterval(timer);
  }, [loadProfile, loadConnections]);
  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function profileChanged(result: ProfileResponse) {
    setProfile(result);
    if (result.profile.fullName !== currentUser.fullName) setCurrentUser({ ...currentUser, fullName: result.profile.fullName });
  }
  function workoutSaved(points: number | null) {
    setToast(points === null ? "Workout saved." : `Workout saved · +${points.toLocaleString()} pts`);
    setActivityKey((key) => key + 1);
    loadProfile();
  }
  async function logout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError("");
    try {
      await onLogout();
    } catch (error) {
      setLogoutError(`Could not log out. ${getAuthErrorMessage(error)}`);
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <>
      <Sidebar tab={tab} setTab={setTab} user={currentUser} profile={profile} />
      <main className="main-area">
        <TopBar title={titles[tab]} points={profile?.stats.totalPoints ?? null} connections={connections} onChanged={refreshCommunity} openCommunity={() => setTab("community")} />
        <InvitePrompt onDone={refreshCommunity} />
        {tab === "home" && <Dashboard goLog={() => setTab("log")} profile={profile} user={currentUser} refreshKey={activityKey} />}
        {tab === "log" && <WorkoutLogger userId={currentUser.id} onSaved={workoutSaved} />}
        {tab === "community" && <Community user={currentUser} profile={profile} connections={connections} onChanged={refreshCommunity} />}
        {tab === "profile" && <Profile data={profile} error={profileError} onRetry={loadProfile} onProfileChange={profileChanged} theme={theme} setTheme={setTheme} onLogout={logout} isLoggingOut={isLoggingOut} logoutError={logoutError} />}
        {toast !== null && <div className="session-toast" role="status"><Icon name="bolt" size={17} /> {toast}</div>}
      </main>
    </>
  );
}

function SessionStatus({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <main className="auth-page">
      <div className="auth-brand"><Logo /><span>Train. Track. Rise.</span></div>
      <Card className="auth-card">
        <div className="auth-icon"><Icon name="lock" size={24} /></div>
        <div className="auth-title">{error ? "Let's reconnect" : "Welcome to GatorGainz"}</div>
        {error
          ? <><div className="auth-message" role="alert">We could not check your session. {error}</div><Button className="primary-button auth-submit" onClick={onRetry}>Try again <Icon name="arrow" size={17} /></Button></>
          : <p className="auth-subtitle" role="status">Checking your session...</p>}
      </Card>
      <div className="auth-stripe"><i /><i /></div>
    </main>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = window.localStorage.getItem("gatorgainz-theme");
    if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    // Old prototype accounts are not credentials for server accounts.
    try {
      window.localStorage.removeItem("gatorgainz-accounts");
      window.localStorage.removeItem("gatorgainz-current-user");
    } catch {
      // Cookie sessions can still work when browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    let active = true;
    setIsCheckingSession(true);
    setSessionError("");
    getCurrentUser()
      .then((user) => {
        if (active) setCurrentUser(user);
      })
      .catch((error: unknown) => {
        if (active) setSessionError(getAuthErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsCheckingSession(false);
      });
    return () => { active = false; };
  }, [sessionAttempt]);

  useEffect(() => {
    window.localStorage.setItem("gatorgainz-theme", theme);
  }, [theme]);

  async function logout() {
    await logoutAccount();
    setCurrentUser(null);
  }

  return (
    <div className={`app-shell${currentUser ? "" : " auth-shell"}`} data-theme={theme}>
      {isCheckingSession || sessionError
        ? <SessionStatus error={sessionError} onRetry={() => setSessionAttempt((attempt) => attempt + 1)} />
        : currentUser
          ? <AuthenticatedApp key={currentUser.id} currentUser={currentUser} setCurrentUser={setCurrentUser} theme={theme} setTheme={setTheme} onLogout={logout} />
          : <AuthScreen onAuthenticated={setCurrentUser} />}
    </div>
  );
}
