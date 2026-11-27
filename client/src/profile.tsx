import { useEffect, useState, type FormEvent } from "react";
import type {
  BlockedUser,
  PrimaryGoal,
  ProfileResponse,
  TrainingLevel,
  UpdateProfileRequest,
} from "@gatorgainz/types";
import { api, errorMessage } from "./api";
// Units are not shown: the logger has no weight field yet, so the setting would do nothing.
import { Button, Card, getInitials, Icon, Label, PageTitle, StatCard, type IconName } from "./ui";

type Theme = "light" | "dark";

export const goalLabels: Record<PrimaryGoal, string> = {
  build_strength: "Build strength",
  lose_weight: "Lose weight",
  improve_endurance: "Improve endurance",
  stay_active: "Stay active",
  improve_mobility: "Improve mobility",
};
const levelLabels: Record<TrainingLevel, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
const badgeIcons: Record<string, IconName> = {
  "first-workout": "check",
  "ten-workouts": "dumbbell",
  "streak-7": "fire",
  "weekly-goal": "calendar",
  "points-1000": "bolt",
  "points-5000": "bolt",
  "first-connection": "users",
  "top-ten": "trophy",
};

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function EditProfile({ data, onSaved, onCancel }: { data: ProfileResponse; onSaved: (result: ProfileResponse) => void; onCancel: () => void }) {
  const { profile } = data;
  const [form, setForm] = useState({
    fullName: profile.fullName,
    handle: profile.handle,
    bio: profile.bio,
    primaryGoal: profile.primaryGoal,
    trainingLevel: profile.trainingLevel,
    weeklyGoal: profile.weeklyGoal,
    visibility: profile.visibility,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function save(event: FormEvent) {
    event.preventDefault();
    // Send only what changed.
    const changes = Object.fromEntries(
      Object.entries(form).filter(([key, value]) => profile[key as keyof typeof form] !== value),
    ) as UpdateProfileRequest;
    if (Object.keys(changes).length === 0) {
      onCancel();
      return;
    }
    setSaving(true);
    setError("");
    try {
      onSaved(await api.updateProfile(changes));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="personal-info profile-form-card">
      <form className="profile-form" onSubmit={save}>
        <div className="card-head"><div><Label>Edit</Label><div className="section-title">Your profile</div></div></div>
        <label><span>Name</span><input value={form.fullName} maxLength={80} required onChange={(e) => set("fullName", e.target.value)} /></label>
        <label>
          <span>Username</span>
          <div className="handle-input"><b>@</b><input value={form.handle} maxLength={24} pattern="[a-z0-9_]{3,24}" required onChange={(e) => set("handle", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} /></div>
          <small>3–24 lowercase letters, numbers, or underscores. Others find you by this.</small>
        </label>
        <label className="wide">
          <span>Bio</span>
          <textarea value={form.bio} maxLength={160} rows={2} placeholder="What are you training for?" onChange={(e) => set("bio", e.target.value)} />
          <small>{form.bio.length}/160</small>
        </label>
        <label><span>Primary goal</span>
          <select value={form.primaryGoal} onChange={(e) => set("primaryGoal", e.target.value as PrimaryGoal)}>
            {Object.entries(goalLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label><span>Training level</span>
          <select value={form.trainingLevel} onChange={(e) => set("trainingLevel", e.target.value as TrainingLevel)}>
            {Object.entries(levelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label><span>Weekly goal (workouts)</span>
          <input type="number" min={1} max={14} step={1} value={form.weeklyGoal} onChange={(e) => set("weeklyGoal", Math.round(Number(e.target.value)))} />
        </label>
        <fieldset className="wide visibility-options">
          <legend>Who can find you</legend>
          <label className={form.visibility === "public" ? "active" : ""}>
            <input type="radio" name="visibility" value="public" checked={form.visibility === "public"} onChange={() => set("visibility", "public")} />
            <span><strong>Public</strong>
              <small>Anyone signed in can find you and see your name, username, and points on the leaderboard.</small></span>
          </label>
          <label className={form.visibility === "private" ? "active" : ""}>
            <input type="radio" name="visibility" value="private" checked={form.visibility === "private"} onChange={() => set("visibility", "private")} />
            <span><strong>Private</strong>
              <small>Hidden from search and the global leaderboard. Only connections see you; new people need your invite link.</small></span>
          </label>
        </fieldset>
        {error && <div className="auth-message wide" role="alert">{error}</div>}
        <div className="form-actions wide">
          <Button className="secondary-button" onClick={onCancel}>Cancel</Button>
          <Button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save profile"}</Button>
        </div>
      </form>
    </Card>
  );
}

function BlockedList() {
  const [blocked, setBlocked] = useState<BlockedUser[] | null>(null);
  const [error, setError] = useState("");
  const load = () => api.blocks().then((result) => setBlocked(result.blocked)).catch((failure) => setError(errorMessage(failure)));
  useEffect(() => { void load(); }, []);
  return (
    <div className="blocked-list">
      <Label>Blocked accounts</Label>
      {error && <p className="auth-message" role="alert">{error}</p>}
      {blocked?.length === 0 && <p className="empty-message">You have not blocked anyone.</p>}
      {blocked?.map((person) => (
        <div className="connection-row" key={person.userId}>
          <div className="leader-copy"><strong>{person.fullName}</strong><span>@{person.handle}</span></div>
          <Button className="mini-text-button" onClick={() => api.unblock(person.userId).then(load).catch((failure) => setError(errorMessage(failure)))}>Unblock</Button>
        </div>
      ))}
    </div>
  );
}

function SecurityCard({ onSignedOut }: { onSignedOut: () => void }) {
  const [sessions, setSessions] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteWord, setDeleteWord] = useState("");

  const loadSessions = () => api.sessions().then((result) => setSessions(result.activeSessions)).catch(() => setSessions(null));
  useEffect(() => { void loadSessions(); }, []);

  async function attempt(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  const signOutOthers = () => attempt(async () => {
    const result = await api.signOutOthers();
    setNotice(result.revoked ? `Signed out ${result.revoked} other ${result.revoked === 1 ? "device" : "devices"}.` : "No other devices were signed in.");
    await loadSessions();
  });
  const changePassword = (event: FormEvent) => {
    event.preventDefault();
    if (Array.from(next).length < 15) return setError("Use at least 15 characters for the new password.");
    if (new TextEncoder().encode(next).length > 72) return setError("The new password is too long (72 bytes at most).");
    if (next !== repeat) return setError("The new passwords do not match.");
    void attempt(async () => {
      await api.changePassword(current, next);
      setCurrent(""); setNext(""); setRepeat(""); setShowPassword(false);
      setNotice("Password changed. Other devices were signed out.");
      await loadSessions();
    });
  };
  const deleteAccount = (event: FormEvent) => {
    event.preventDefault();
    void attempt(async () => {
      await api.deleteAccount(deletePassword);
      onSignedOut();
    });
  };

  return (
    <Card className="privacy-card security-card">
      <div className="card-head"><div><Label>Sign-in and security</Label><div className="section-title">Your account</div></div><Icon name="lock" /></div>
      <div className="security-row">
        <span>{sessions === null ? "Checking sign-ins..." : `Signed in on ${sessions} ${sessions === 1 ? "device" : "devices"}`}</span>
        <Button className="secondary-button" disabled={busy || sessions === 1} onClick={signOutOthers}>Sign out other devices</Button>
      </div>
      {!showPassword
        ? <Button className="secondary-button" onClick={() => { setShowPassword(true); setNotice(""); }}>Change password</Button>
        : (
          <form className="security-form" onSubmit={changePassword}>
            <label><span>Current password</span><input type="password" autoComplete="current-password" value={current} required onChange={(e) => setCurrent(e.target.value)} /></label>
            <label><span>New password</span><input type="password" autoComplete="new-password" value={next} required minLength={15} onChange={(e) => setNext(e.target.value)} /><small>At least 15 characters. A short phrase works well.</small></label>
            <label><span>Repeat new password</span><input type="password" autoComplete="new-password" value={repeat} required onChange={(e) => setRepeat(e.target.value)} /></label>
            <div className="form-actions">
              <Button className="secondary-button" onClick={() => { setShowPassword(false); setError(""); }}>Cancel</Button>
              <Button type="submit" className="primary-button" disabled={busy}>{busy ? "Saving..." : "Change password"}</Button>
            </div>
          </form>
        )}
      {notice && <p className="invite-status" role="status">{notice}</p>}
      {error && <p className="auth-message" role="alert">{error}</p>}
      <div className="danger-zone">
        <Label>Delete account</Label>
        {!showDelete
          ? <><p>Permanently removes your account, workouts, points, profile, and connections. This cannot be undone.</p>
              <Button className="mini-text-button danger" onClick={() => setShowDelete(true)}>Delete my account...</Button></>
          : (
            <form className="security-form" onSubmit={deleteAccount}>
              <p>Everything is deleted right away and cannot be recovered.</p>
              <label><span>Password</span><input type="password" autoComplete="current-password" value={deletePassword} required onChange={(e) => setDeletePassword(e.target.value)} /></label>
              <label><span>Type DELETE to confirm</span><input value={deleteWord} onChange={(e) => setDeleteWord(e.target.value)} autoComplete="off" /></label>
              <div className="form-actions">
                <Button className="secondary-button" onClick={() => { setShowDelete(false); setDeletePassword(""); setDeleteWord(""); }}>Cancel</Button>
                <Button type="submit" className="primary-button danger-button" disabled={busy || deleteWord !== "DELETE" || !deletePassword}>{busy ? "Deleting..." : "Delete forever"}</Button>
              </div>
            </form>
          )}
      </div>
    </Card>
  );
}

export function Profile({
  data,
  error,
  onRetry,
  onProfileChange,
  theme,
  setTheme,
  onLogout,
  isLoggingOut,
  logoutError,
  onSignedOut,
  openHistory,
}: {
  data: ProfileResponse | null;
  error: string;
  onRetry: () => void;
  onProfileChange: (result: ProfileResponse) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  onLogout: () => void;
  isLoggingOut: boolean;
  logoutError: string;
  onSignedOut: () => void;
  openHistory: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!data) {
    return (
      <div className="page">
        <PageTitle subtitle="Your training journey, all in one place.">Account</PageTitle>
        <Card className="personal-info">
          {error ? <><p className="auth-message" role="alert">{error}</p><Button className="secondary-button" onClick={onRetry}>Try again</Button></> : <p className="empty-message">Loading your profile...</p>}
        </Card>
      </div>
    );
  }

  const { profile, stats, badges, connectionCount } = data;
  const earned = badges.filter((badge) => badge.earned).length;
  const goalPercent = Math.min(100, Math.round((stats.thisWeek.workouts / stats.thisWeek.goal) * 100));
  const maxDay = Math.max(1, ...stats.last7Days.map((day) => day.points));
  const memberSince = new Date(profile.joinedAt);

  return (
    <div className="page">
      <div className="welcome-row">
        <PageTitle subtitle="Your training journey, all in one place.">Account</PageTitle>
        <div className="title-actions">
          <Button className="secondary-button" onClick={openHistory}><Icon name="calendar" size={16} /> Workout history</Button>
          <Button className="secondary-button" onClick={() => { setEditing(true); setSaved(false); }}><Icon name="edit" size={16} /> Edit profile</Button>
          <Button className="secondary-button" onClick={() => setShowSettings((visible) => !visible)}><Icon name="settings" size={17} /> Settings</Button>
        </div>
      </div>
      {showSettings && (
        <Card className="settings-panel">
          <div>
            <Label>Appearance</Label>
            <div className="section-title">Choose your app theme</div>
            <p>Use a bright interface or reduce glare with dark mode.</p>
          </div>
          <div className="theme-options" aria-label="App theme">
            <Button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>
              <span className="theme-preview light-preview"><i /><i /><i /></span>
              <span><strong>Light</strong><small>Bright and clear</small></span>
              {theme === "light" && <Icon name="check" size={16} />}
            </Button>
            <Button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>
              <span className="theme-preview dark-preview"><i /><i /><i /></span>
              <span><strong>Dark</strong><small>Easy on the eyes</small></span>
              {theme === "dark" && <Icon name="check" size={16} />}
            </Button>
          </div>
          <Button className="secondary-button logout-button" onClick={onLogout} disabled={isLoggingOut}><Icon name="logout" size={17} /> {isLoggingOut ? "Logging out..." : "Log out of GatorGainz"}</Button>
          {logoutError && <div className="auth-message" role="alert">{logoutError}</div>}
        </Card>
      )}
      {saved && <div className="saved-note" role="status"><Icon name="check" size={15} /> Profile saved.</div>}

      <Card className="profile-hero">
        <div className="profile-avatar">{getInitials(profile.fullName)}<div className="level-badge" title="Level">{stats.level.level}</div></div>
        <div className="profile-identity">
          <div className="profile-name">{profile.fullName}</div>
          <span>@{profile.handle} · {levelLabels[profile.trainingLevel]} · {profile.visibility === "public" ? "Public profile" : "Private profile"}</span>
          <p>{profile.bio || "Add a short bio so training partners know what you are working toward."}</p>
        </div>
        <div className="profile-level">
          <div><Label>Level {stats.level.level}</Label><span>{stats.level.pointsIntoLevel.toLocaleString()} / {stats.level.pointsPerLevel.toLocaleString()} pts</span></div>
          <div className="profile-progress"><span style={{ width: `${Math.round((stats.level.pointsIntoLevel / stats.level.pointsPerLevel) * 100)}%` }} /></div>
          <small>{(stats.level.pointsPerLevel - stats.level.pointsIntoLevel).toLocaleString()} pts to Level {stats.level.level + 1}</small>
        </div>
      </Card>

      <div className="stats-grid profile-stats">
        <StatCard icon="bolt" label="Total points" value={stats.totalPoints.toLocaleString()} detail={stats.globalRank ? `#${stats.globalRank} on the global board` : profile.visibility === "private" ? "Private: not ranked" : "Log a workout to rank"} color="yellow" />
        <StatCard icon="check" label="Workouts" value={stats.totalWorkouts.toLocaleString()} detail={`Since ${memberSince.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`} color="green" />
        <StatCard icon="clock" label="Training time" value={formatMinutes(stats.totalMinutes)} detail={stats.totalWorkouts ? `${formatMinutes(Math.round(stats.totalMinutes / stats.totalWorkouts))} average` : "No workouts yet"} color="blue" />
        <StatCard icon="fire" label="Current streak" value={`${stats.currentStreakDays} ${stats.currentStreakDays === 1 ? "day" : "days"}`} detail={`Longest: ${stats.longestStreakDays} ${stats.longestStreakDays === 1 ? "day" : "days"}`} color="coral" />
      </div>

      <div className="profile-grid">
        {editing
          ? <EditProfile data={data} onCancel={() => setEditing(false)} onSaved={(result) => { onProfileChange(result); setEditing(false); setSaved(true); }} />
          : (
            <Card className="personal-info">
              <div className="card-head"><div><Label>Account</Label><div className="section-title">Personal information</div></div><Button className="text-button" onClick={() => setEditing(true)}>Edit <Icon name="chevron" size={14} /></Button></div>
              <div className="info-grid">
                <div><span>Full name</span><strong>{profile.fullName}</strong></div>
                <div><span>Username</span><strong>@{profile.handle}</strong></div>
                <div><span>Email (only you see this)</span><strong>{profile.email}</strong></div>
                <div><span>Member since</span><strong>{memberSince.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong></div>
                <div><span>Primary goal</span><strong>{goalLabels[profile.primaryGoal]}</strong></div>
                <div><span>Training level</span><strong>{levelLabels[profile.trainingLevel]}</strong></div>
                <div><span>Weekly goal</span><strong>{profile.weeklyGoal} {profile.weeklyGoal === 1 ? "workout" : "workouts"}</strong></div>
                <div><span>Connections</span><strong>{connectionCount}</strong></div>
              </div>
            </Card>
          )}

        <Card className="week-card">
          <div className="card-head"><div><Label>Last 7 days</Label><div className="section-title">Weekly goal</div></div><span className="count-pill">{stats.thisWeek.workouts}/{stats.thisWeek.goal}</span></div>
          <div className="squad-progress" aria-label={`${goalPercent}% of weekly goal`}><span style={{ width: `${goalPercent}%` }} /></div>
          <p className="week-summary">
            {stats.thisWeek.workouts >= stats.thisWeek.goal
              ? "Goal reached. Nice work!"
              : `${stats.thisWeek.goal - stats.thisWeek.workouts} more to hit your goal.`}{" "}
            {stats.thisWeek.points.toLocaleString()} pts · {formatMinutes(stats.thisWeek.minutes)}
          </p>
          <div className="mini-chart">
            {stats.last7Days.map((day) => (
              <div key={day.date} title={`${shortDate(day.date)}: ${day.points} pts, ${day.workouts} workouts`}>
                <span style={{ height: `${Math.max(day.points ? 8 : 2, Math.round((day.points / maxDay) * 100))}%` }} className={day.workouts ? "" : "empty"} />
                <small>{new Date(`${day.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "narrow" })}</small>
              </div>
            ))}
          </div>
          <div className="info-grid compact">
            <div><span>Best workout</span><strong>{stats.bestWorkout ? `${stats.bestWorkout.name} · ${stats.bestWorkout.points} pts` : "—"}</strong></div>
            <div><span>Most logged</span><strong>{stats.favoriteCategory ? stats.favoriteCategory[0].toUpperCase() + stats.favoriteCategory.slice(1) : "—"}</strong></div>
          </div>
        </Card>

        <Card className="achievements">
          <div className="card-head"><div><Label>Milestones</Label><div className="section-title">Badges</div></div><span className="count-pill">{earned}/{badges.length}</span></div>
          <div className="badge-grid">
            {badges.map((badge) => (
              <div key={badge.id} className={badge.earned ? "earned" : "locked"} title={badge.earned ? "Earned" : "Not earned yet"}>
                <span className={`badge-icon ${badge.earned ? "sun" : "locked"}`}><Icon name={badge.earned ? badgeIcons[badge.id] ?? "trophy" : "lock"} /></span>
                <strong>{badge.title}</strong><small>{badge.detail}</small>
              </div>
            ))}
          </div>
        </Card>

        <Card className="privacy-card">
          <div className="card-head"><div><Label>Privacy and safety</Label><div className="section-title">{profile.visibility === "public" ? "Public profile" : "Private profile"}</div></div><Icon name="shield" /></div>
          <p>Other people only ever see your name, username, level, and points. Your email, bio, and workout details stay private.</p>
          <ul>
            <li>Connections need the other person to accept.</li>
            <li>Declining or removing someone does not notify them.</li>
            <li>Blocking hides you from each other everywhere.</li>
          </ul>
          <BlockedList />
        </Card>

        <SecurityCard onSignedOut={onSignedOut} />
      </div>
    </div>
  );
}
