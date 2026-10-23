import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { AuthUser } from "@gatorgainz/types";
import { getAuthErrorMessage, getCurrentUser, loginAccount, logoutAccount, registerAccount } from "./auth-api";
import gatorMark from "./assets/gator-gainz-mark.png";

type Tab = "home" | "log" | "community" | "profile";
type Theme = "light" | "dark";
type AuthMode = "login" | "register";
type UserAccount = AuthUser;
type IconName =
  | "home"
  | "plus"
  | "users"
  | "user"
  | "bolt"
  | "fire"
  | "clock"
  | "check"
  | "chevron"
  | "search"
  | "trophy"
  | "bell"
  | "dumbbell"
  | "calendar"
  | "settings"
  | "pin"
  | "arrow"
  | "lock"
  | "logout";

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

type CompletedSession = {
  name: string;
  earned: number;
  exerciseCount: number;
  loggedAt: Date;
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

const leaders = [
  { name: "Maya Chen", handle: "@mayamoves", points: 4280, initials: "MC", tone: "coral" },
  { name: "Theo Brooks", handle: "@theolifts", points: 3945, initials: "TB", tone: "blue" },
  { name: "Priya Rao", handle: "@priyaruns", points: 3710, initials: "PR", tone: "purple" },
  { name: "Jordan Lee", handle: "@jordangetsfit", points: 3480, initials: "JL", tone: "green" },
  { name: "Sam Rivera", handle: "@samstrong", points: 3205, initials: "SR", tone: "yellow" },
];

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function getFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Gator";
}

function getHandle(user: UserAccount) {
  return `@${user.email.split("@")[0].replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
}

const iconPaths: Record<IconName, ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5M9 21v-7h6v7" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  bolt: <path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z" />,
  fire: <path d="M12 22c4.4 0 7-3.2 7-7.3 0-3.2-1.8-6.3-5.2-9.4.2 3.2-1.7 5-3.2 5.8.1-3-1.3-5.2-3.1-6.6.1 3.7-2.5 5.6-2.5 9.9C5 18.6 7.8 22 12 22Z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM10 13v4M14 13v4M7 21h10M9 17h6" /><path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></>,
  dumbbell: <><path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  pin: <><path d="m14 4 6 6-3 1-4 4-1 5-2-2-4 4-2-2 4-4-2-2 5-1 4-4 1-3Z" /></>,
  arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  logout: <><path d="M10 17l5-5-5-5M15 12H3M15 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5" /></>,
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}

function Button({ children, className = "", onClick, disabled = false, label, type = "button" }: { children: ReactNode; className?: string; onClick?: () => void; disabled?: boolean; label?: string; type?: "button" | "submit" }) {
  return <button type={type} aria-label={label} disabled={disabled} onClick={onClick} className={className}>{children}</button>;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <div>
      <div className="page-title">{children}</div>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}
    </div>
  );
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
  const [mode, setMode] = useState<AuthMode>("login");
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
        <p className="auth-footnote">Your account is saved on the server. Workouts currently stay in this browser.</p>
      </Card>
      <div className="auth-stripe"><i /><i /></div>
    </main>
  );
}

function Sidebar({ tab, setTab, user }: { tab: Tab; setTab: (tab: Tab) => void; user: UserAccount }) {
  const nav: { id: Tab; label: string; icon: IconName }[] = [
    { id: "home", label: "Overview", icon: "home" },
    { id: "log", label: "Log workout", icon: "plus" },
    { id: "community", label: "Community", icon: "users" },
    { id: "profile", label: "Account", icon: "user" },
  ];
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
              <strong>12 day streak</strong>
              <span>Personal best</span>
            </div>
          </Card>
          <Button className="mini-profile" onClick={() => setTab("profile")}>
            <div className="avatar avatar-green">{getInitials(user.fullName)}</div>
            <div><strong>{user.fullName}</strong><span>Level 14</span></div>
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

function TopBar({ title, points }: { title: string; points: number }) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: "friend", title: "New friend request", detail: "Taylor Morgan wants to connect.", action: "Accept" },
    { id: "squad", title: "Squad invitation", detail: "Gainesville Grinders invited you to join.", action: "Join" },
  ]);
  const resolveNotification = (id: string) => setNotifications((current) => current.filter((item) => item.id !== id));
  return (
    <header className="topbar">
      <div className="mobile-logo"><Logo /></div>
      <span className="topbar-name">{title}</span>
      <div className="top-actions">
        <div className="points-pill"><Icon name="bolt" size={15} /><strong>{points.toLocaleString()}</strong><span>pts</span></div>
        <Button className="icon-button" label="Notifications" onClick={() => setShowNotifications((visible) => !visible)}>
          <Icon name="bell" size={19} />{notifications.length > 0 && <i />}
        </Button>
      </div>
      {showNotifications && (
        <Card className="notification-panel">
          <div className="notification-heading">
            <div><Label>Updates</Label><div className="section-title">Notifications</div></div>
            <span>{notifications.length} new</span>
          </div>
          {notifications.length > 0 ? notifications.map((notification) => (
            <div className="notification-row" key={notification.id}>
              <div className={`notification-symbol ${notification.id}`}><Icon name={notification.id === "friend" ? "user" : "users"} size={17} /></div>
              <div><strong>{notification.title}</strong><span>{notification.detail}</span></div>
              <Button className="notification-action" onClick={() => resolveNotification(notification.id)}>{notification.action}</Button>
            </div>
          )) : <p className="empty-message">You're all caught up.</p>}
        </Card>
      )}
    </header>
  );
}

function StatCard({ icon, label, value, detail, color }: { icon: IconName; label: string; value: string; detail: string; color: string }) {
  return (
    <Card className="stat-card">
      <div className={`stat-icon ${color}`}><Icon name={icon} /></div>
      <div>
        <Label>{label}</Label>
        <div className="stat-value">{value}</div>
        <div className="stat-detail">{detail}</div>
      </div>
    </Card>
  );
}

function WeeklyChart() {
  const days = [
    { day: "M", value: 68, done: true },
    { day: "T", value: 45, done: true },
    { day: "W", value: 86, done: true },
    { day: "T", value: 62, done: true },
    { day: "F", value: 98, done: true },
    { day: "S", value: 28, done: false },
    { day: "S", value: 12, done: false },
  ];
  return (
    <Card className="activity-card">
      <div className="card-head">
        <div><Label>This week</Label><div className="section-title">Your momentum</div></div>
        <div className="trend"><Icon name="arrow" size={15} /> 18% vs last week</div>
      </div>
      <div className="chart">
        {days.map((item, index) => (
          <div className="bar-wrap" key={`${item.day}-${index}`}>
            <div className="bar-track"><div className={`bar ${item.done ? "" : "future"}`} style={{ height: `${item.value}%` }} /></div>
            <span>{item.day}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ChallengeCard() {
  return (
    <Card className="challenge-card">
      <div className="challenge-orb orb-one" />
      <div className="challenge-orb orb-two" />
      <div className="challenge-top">
        <span className="challenge-badge"><Icon name="trophy" size={15} /> WEEKLY CHALLENGE</span>
        <span>4 days left</span>
      </div>
      <div className="challenge-title">The 1,000 point push</div>
      <p>Earn 1,000 points this week and unlock the Momentum badge.</p>
      <div className="challenge-progress">
        <div className="progress-copy"><strong>680</strong><span>/ 1,000 points</span><b>68%</b></div>
        <div className="progress-track"><div style={{ width: "68%" }} /></div>
      </div>
    </Card>
  );
}

function RecentActivity({ latestSession }: { latestSession?: CompletedSession }) {
  const entries = [
    ...(latestSession ? [{
      name: latestSession.name,
      when: "Just now",
      points: `+${latestSession.earned}`,
      icon: "dumbbell" as IconName,
      color: "mint",
    }] : []),
    { name: "Upper body strength", when: "Today, 7:42 AM", points: "+186", icon: "dumbbell" as IconName, color: "lavender" },
    { name: "Morning run", when: "Yesterday, 6:18 AM", points: "+124", icon: "bolt" as IconName, color: "mint" },
    { name: "Lower body power", when: "Mon, 5:35 PM", points: "+214", icon: "fire" as IconName, color: "coral" },
  ].slice(0, 3);
  return (
    <Card className="recent-card">
      <div className="card-head">
        <div><Label>History</Label><div className="section-title">Recent activity</div></div>
        <Button className="text-button">View all <Icon name="chevron" size={15} /></Button>
      </div>
      <div className="activity-list">
        {entries.map((entry) => (
          <div className="activity-row" key={entry.name}>
            <div className={`activity-icon ${entry.color}`}><Icon name={entry.icon} /></div>
            <div className="activity-copy"><strong>{entry.name}</strong><span>{entry.when}</span></div>
            <div className="activity-points">{entry.points} pts</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Dashboard({ goLog, points, completed, latestSession, user }: { goLog: () => void; points: number; completed: number; latestSession?: CompletedSession; user: UserAccount }) {
  return (
    <div className="page">
      <div className="welcome-row">
        <PageTitle subtitle="Your consistency is paying off. Keep the pace.">Good morning, {getFirstName(user.fullName)}.</PageTitle>
        <Button className="primary-button" onClick={goLog}><Icon name="plus" size={18} /> Log a workout</Button>
      </div>
      <div className="stats-grid">
        <StatCard icon="bolt" label="Total points" value={points.toLocaleString()} detail="+420 this week" color="yellow" />
        <StatCard icon="fire" label="Current streak" value="12 days" detail="Best: 16 days" color="coral" />
        <StatCard icon="clock" label="Active time" value="18h 20m" detail="This month" color="blue" />
        <StatCard icon="check" label="Workouts" value={completed.toString()} detail={`${8 + (completed - 46)} this month`} color="green" />
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <ChallengeCard />
          <WeeklyChart />
        </div>
        <RecentActivity latestSession={latestSession} />
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
const completedSessionsStorageKey = "gatorgainz-completed-sessions";
const pinnedWorkoutsStorageKey = "gatorgainz-pinned-workouts";

function accountStorageKey(key: string, userId: string) {
  return `${key}:${userId}`;
}

function loadSessionDraft(userId: string) {
  const fallback = { selectedName: workouts[1].name, sets: 4, reps: 8, minutes: 30, metricValue: 3, exercises: [] as SessionExercise[] };
  try {
    const saved = window.localStorage.getItem(accountStorageKey(sessionStorageKey, userId));
    return saved ? { ...fallback, ...JSON.parse(saved) } : fallback;
  } catch {
    return fallback;
  }
}

function WorkoutLogger({ userId, onComplete }: { userId: string; onComplete: (session: CompletedSession) => void }) {
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
      exercises: sessionExercises,
    }));
  }, [draftKey, selected, sets, reps, minutes, metricValue, sessionExercises]);

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

  function submitSession() {
    if (sessionExercises.length === 0) return;
    onComplete({
      name: `${sessionExercises.length}-exercise training session`,
      earned: sessionPoints,
      exerciseCount: sessionExercises.length,
      loggedAt: new Date(),
    });
    setSessionExercises([]);
    window.localStorage.removeItem(draftKey);
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
            <span>You'll earn</span>
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
            <Button className="submit-session-button" disabled={sessionExercises.length === 0} onClick={submitSession}>
              <Icon name="check" size={17} /> Submit session to Account
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Community({ points, user }: { points: number; user: UserAccount }) {
  const [range, setRange] = useState("Weekly");
  const [following, setFollowing] = useState<string[]>(["Maya Chen"]);
  const [showPeople, setShowPeople] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [showSquads, setShowSquads] = useState(false);
  const [selectedSquad, setSelectedSquad] = useState("Weekend Warriors");
  const squads = [
    { name: "Weekend Warriors", points: 8620, progress: 74, remaining: 1380 },
    { name: "Gainesville Grinders", points: 12480, progress: 88, remaining: 520 },
    { name: "Sunrise Striders", points: 6940, progress: 61, remaining: 2060 },
  ];
  const activeSquad = squads.find((squad) => squad.name === selectedSquad) ?? squads[0];
  const toggleFollow = (name: string) => setFollowing((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  const visibleLeaders = leaders.filter((leader) =>
    leader.name.toLowerCase().includes(peopleQuery.toLowerCase()) ||
    leader.handle.toLowerCase().includes(peopleQuery.toLowerCase()),
  );
  return (
    <div className="page">
      <div className="welcome-row">
        <PageTitle subtitle="Train together, climb the ranks, and celebrate every win.">Community</PageTitle>
        <Button className="primary-button" onClick={() => setShowPeople((visible) => !visible)}><Icon name="users" size={18} /> {showPeople ? "Close search" : "Find people"}</Button>
      </div>
      {showPeople && (
        <Card className="people-search-card">
          <div>
            <Label>Discover athletes</Label>
            <div className="section-title">Find your training circle</div>
          </div>
          <div className="search-box"><Icon name="search" size={18} /><input autoFocus aria-label="Search people" value={peopleQuery} onChange={(event) => setPeopleQuery(event.target.value)} placeholder="Search by name or username" /></div>
          <div className="people-results">
            {visibleLeaders.map((leader) => (
              <div className="person-chip" key={leader.name}>
                <div className={`avatar avatar-${leader.tone}`}>{leader.initials}</div>
                <div className="leader-copy"><strong>{leader.name}</strong><span>{leader.handle}</span></div>
                <Button className={`follow-button ${following.includes(leader.name) ? "following" : ""}`} onClick={() => toggleFollow(leader.name)}>
                  {following.includes(leader.name) ? "Following" : "Follow"}
                </Button>
              </div>
            ))}
            {visibleLeaders.length === 0 && <p className="empty-message">No athletes found. Try another name.</p>}
          </div>
        </Card>
      )}
      <div className="community-banner">
        <div><Label>Global movement</Label><div className="community-number">18,492,610</div><span>points earned together this month</span></div>
        <div className="banner-avatars">
          {leaders.slice(0, 4).map((leader) => <div key={leader.name} className={`avatar avatar-${leader.tone}`}>{leader.initials}</div>)}
          <div className="avatar avatar-more">+2k</div>
        </div>
      </div>
      <div className="community-grid">
        <Card className="leaderboard-card">
          <div className="card-head leaderboard-head">
            <div><Label>Leaderboard</Label><div className="section-title">Top movers</div></div>
            <div className="range-toggle">
              {["Weekly", "Monthly", "All time"].map((item) => <Button key={item} onClick={() => setRange(item)} className={range === item ? "active" : ""}>{item}</Button>)}
            </div>
          </div>
          <div className="leader-list">
            {leaders.map((leader, index) => (
              <div className={`leader-row ${index === 0 ? "winner" : ""}`} key={leader.name}>
                <div className={`rank rank-${index + 1}`}>{index + 1}</div>
                <div className={`avatar avatar-${leader.tone}`}>{leader.initials}</div>
                <div className="leader-copy"><strong>{leader.name}</strong><span>{leader.handle}</span></div>
                <div className="leader-score"><Icon name="bolt" size={14} /><strong>{leader.points.toLocaleString()}</strong><span>pts</span></div>
                <Button className={`follow-button ${following.includes(leader.name) ? "following" : ""}`} onClick={() => toggleFollow(leader.name)}>
                  {following.includes(leader.name) ? "Following" : "Follow"}
                </Button>
              </div>
            ))}
          </div>
          <div className="your-rank">
            <div className="rank">18</div><div className="avatar avatar-green">{getInitials(user.fullName)}</div>
            <div className="leader-copy"><strong>You</strong><span>Up 4 places this week</span></div>
            <div className="leader-score"><Icon name="bolt" size={14} /><strong>{points.toLocaleString()}</strong><span>pts</span></div>
          </div>
        </Card>
        <div className="community-side">
          <Card className="squad-card">
            <div className="card-head">
              <div><Label>Your squads</Label><div className="section-title">Team progress</div></div>
              <Button className="icon-button"><Icon name="settings" size={18} /></Button>
            </div>
            <div className="squad-select">
              <Button className="squad-select-trigger" onClick={() => setShowSquads((visible) => !visible)}>
                <span>{activeSquad.name}</span><Icon name="chevron" size={16} />
              </Button>
              {showSquads && (
                <div className="squad-options">
                  {squads.map((squad) => (
                    <Button key={squad.name} className={selectedSquad === squad.name ? "active" : ""} onClick={() => { setSelectedSquad(squad.name); setShowSquads(false); }}>
                      <span>{squad.name}</span>{selectedSquad === squad.name && <Icon name="check" size={15} />}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div className="squad-score"><strong>{activeSquad.points.toLocaleString()}</strong><span>team points</span></div>
            <div className="squad-progress"><span style={{ width: `${activeSquad.progress}%` }} /></div>
            <p>{activeSquad.remaining.toLocaleString()} points until your next team reward.</p>
          </Card>
          <Card className="invite-card">
            <div className="invite-icon"><Icon name="users" /></div>
            <div><strong>Stronger together</strong><p>Invite friends and earn 100 points when they complete their first workout.</p></div>
            <Button className="secondary-button">Share invite</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Profile({ points, completed, theme, setTheme, user, onLogout, isLoggingOut, logoutError }: { points: number; completed: number; theme: Theme; setTheme: (theme: Theme) => void; user: UserAccount; onLogout: () => void; isLoggingOut: boolean; logoutError: string }) {
  const [showSettings, setShowSettings] = useState(false);
  return (
    <div className="page">
      <div className="welcome-row">
        <PageTitle subtitle="Your training journey, all in one place.">Account</PageTitle>
        <Button className="secondary-button" onClick={() => setShowSettings((visible) => !visible)}><Icon name="settings" size={17} /> Settings</Button>
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
      <Card className="profile-hero">
        <div className="profile-avatar">{getInitials(user.fullName)}<div className="level-badge">14</div></div>
        <div className="profile-identity">
          <div className="profile-name">{user.fullName}</div>
          <span>{getHandle(user)} · GatorGainz athlete</span>
          <p>Building strength, finding balance, and always chasing the next personal best.</p>
        </div>
        <div className="profile-level">
          <div><Label>Level 14</Label><span>{points.toLocaleString()} / 3,200 XP</span></div>
          <div className="profile-progress"><span style={{ width: `${Math.min(100, Math.round((points / 3200) * 100))}%` }} /></div>
          <small>{Math.max(0, 3200 - points).toLocaleString()} XP to Level 15</small>
        </div>
      </Card>
      <div className="stats-grid profile-stats">
        <StatCard icon="check" label="Workouts completed" value={completed.toString()} detail="Since January 2025" color="green" />
        <StatCard icon="bolt" label="Current points" value={points.toLocaleString()} detail="Top 8% globally" color="yellow" />
        <StatCard icon="clock" label="Training time" value="72h 15m" detail="1h 34m average" color="blue" />
        <StatCard icon="fire" label="Longest streak" value="16 days" detail="Current: 12 days" color="coral" />
      </div>
      <div className="profile-grid">
        <Card className="personal-info">
          <div className="card-head"><div><Label>Account</Label><div className="section-title">Personal information</div></div></div>
          <div className="info-grid">
            <div><span>Full name</span><strong>{user.fullName}</strong></div>
            <div><span>Email address</span><strong>{user.email}</strong></div>
            <div><span>Member since</span><strong>{new Date(user.joinedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong></div>
            <div><span>Primary goal</span><strong>Build strength</strong></div>
            <div><span>Training level</span><strong>Intermediate</strong></div>
            <div><span>Preferred units</span><strong>Imperial (lb)</strong></div>
          </div>
        </Card>
        <Card className="achievements">
          <div className="card-head"><div><Label>Milestones</Label><div className="section-title">Recent badges</div></div><Button className="text-button">View all</Button></div>
          <div className="badge-grid">
            <div><span className="badge-icon sun"><Icon name="fire" /></span><strong>On fire</strong><small>10 day streak</small></div>
            <div><span className="badge-icon purple"><Icon name="trophy" /></span><strong>Top ten</strong><small>Weekly rank</small></div>
            <div><span className="badge-icon mint"><Icon name="bolt" /></span><strong>Power hour</strong><small>60 min workout</small></div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function AuthenticatedApp({ currentUser, theme, setTheme, onLogout }: { currentUser: UserAccount; theme: Theme; setTheme: (theme: Theme) => void; onLogout: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>("home");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const completedKey = accountStorageKey(completedSessionsStorageKey, currentUser.id);
  const [sessionToastPoints, setSessionToastPoints] = useState<number | null>(null);
  const [completedSessions, setCompletedSessions] = useState<CompletedSession[]>(() => {
    try {
      const saved = window.localStorage.getItem(completedKey);
      return saved ? JSON.parse(saved).map((session: CompletedSession) => ({ ...session, loggedAt: new Date(session.loggedAt) })) : [];
    } catch {
      return [];
    }
  });
  const earnedPoints = completedSessions.reduce((total, session) => total + session.earned, 0);
  const points = 2840 + earnedPoints;
  const completed = 46 + completedSessions.length;
  const titles = useMemo(() => ({ home: "Overview", log: "Log workout", community: "Community", profile: "Account" }), []);
  useEffect(() => {
    window.localStorage.setItem(completedKey, JSON.stringify(completedSessions));
  }, [completedKey, completedSessions]);
  useEffect(() => {
    if (sessionToastPoints === null) return;
    const timer = window.setTimeout(() => setSessionToastPoints(null), 3200);
    return () => window.clearTimeout(timer);
  }, [sessionToastPoints]);

  function completeSession(session: CompletedSession) {
    setCompletedSessions((current) => [session, ...current]);
    setSessionToastPoints(session.earned);
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
      <Sidebar tab={tab} setTab={setTab} user={currentUser} />
      <main className="main-area">
        <TopBar title={titles[tab]} points={points} />
        {tab === "home" && <Dashboard goLog={() => setTab("log")} points={points} completed={completed} latestSession={completedSessions[0]} user={currentUser} />}
        {tab === "log" && <WorkoutLogger userId={currentUser.id} onComplete={completeSession} />}
        {tab === "community" && <Community points={points} user={currentUser} />}
        {tab === "profile" && <Profile points={points} completed={completed} theme={theme} setTheme={setTheme} user={currentUser} onLogout={logout} isLoggingOut={isLoggingOut} logoutError={logoutError} />}
        {sessionToastPoints !== null && <div className="session-toast"><Icon name="bolt" size={17} /> Session points: +{sessionToastPoints}</div>}
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
          ? <AuthenticatedApp key={currentUser.id} currentUser={currentUser} theme={theme} setTheme={setTheme} onLogout={logout} />
          : <AuthScreen onAuthenticated={setCurrentUser} />}
    </div>
  );
}
