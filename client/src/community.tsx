import { useCallback, useEffect, useState } from "react";
import type {
  AuthUser,
  ConnectionsResponse,
  ConnectionState,
  LeaderboardEntry,
  LeaderboardRange,
  LeaderboardResponse,
  LeaderboardScope,
  PersonCard,
  ProfileResponse,
} from "@gatorgainz/types";
import { api, errorMessage, inviteLink, shareInvite } from "./api";
import { Button, Card, getInitials, Icon, Label, PageTitle } from "./ui";

const tones = ["coral", "blue", "purple", "green", "yellow"];

/** Same color for the same person everywhere. */
export function toneFor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length];
}

export function Avatar({ userId, name }: { userId: string; name: string }) {
  return <div className={`avatar avatar-${toneFor(userId)}`} aria-hidden="true">{getInitials(name)}</div>;
}

type Person = Pick<PersonCard, "userId" | "fullName" | "handle" | "connection">;

/** One button that always matches the real connection state. */
function ConnectButton({ person, onChanged }: { person: Person; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const labels: Record<ConnectionState, string> = {
    none: "Connect",
    outgoing: "Requested",
    incoming: "Accept",
    connected: "Connected",
  };
  async function act() {
    setBusy(true);
    setError("");
    try {
      if (person.connection === "none") await api.connectByHandle(person.handle);
      else if (person.connection === "incoming") await api.acceptConnection(person.userId);
      else if (person.connection === "outgoing") await api.removeConnection(person.userId);
      onChanged();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  if (person.connection === "connected") {
    return <span className="follow-button following" title="You are connected">{labels.connected}</span>;
  }
  return (
    <span className="connect-action">
      <Button
        className={`follow-button ${person.connection === "outgoing" ? "following" : ""}`}
        label={person.connection === "outgoing" ? `Cancel request to ${person.fullName}` : `${labels[person.connection]} ${person.fullName}`}
        disabled={busy}
        onClick={act}
      >
        {busy ? "..." : labels[person.connection]}
      </Button>
      {error && <small role="alert">{error}</small>}
    </span>
  );
}

function PeopleSearch({ onChanged, refreshKey }: { onChanged: () => void; refreshKey: number }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonCard[]>([]);
  const [status, setStatus] = useState("Type at least 2 letters of a name or username.");

  useEffect(() => {
    const text = query.trim();
    if (text.replace(/^@/, "").length < 2) {
      setPeople([]);
      setStatus("Type at least 2 letters of a name or username.");
      return;
    }
    let active = true;
    setStatus("Searching...");
    const timer = window.setTimeout(() => {
      api.searchPeople(text)
        .then((result) => {
          if (!active) return;
          setPeople(result.people);
          setStatus(result.people.length ? "" : "No public athletes match. Private accounts can only be reached with their invite link.");
        })
        .catch((error) => active && setStatus(errorMessage(error)));
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, refreshKey]);

  return (
    <Card className="people-search-card">
      <div>
        <Label>Discover athletes</Label>
        <div className="section-title">Find your training circle</div>
      </div>
      <div className="search-box">
        <Icon name="search" size={18} />
        <input aria-label="Search people" value={query} maxLength={40} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or @username" />
      </div>
      <div className="people-results" aria-live="polite">
        {people.map((person) => (
          <div className="person-chip" key={person.userId}>
            <Avatar userId={person.userId} name={person.fullName} />
            <div className="leader-copy"><strong>{person.fullName}</strong><span>@{person.handle} · {person.totalPoints.toLocaleString()} pts</span></div>
            <ConnectButton person={person} onChanged={onChanged} />
          </div>
        ))}
        {status && <p className="empty-message">{status}</p>}
      </div>
    </Card>
  );
}

function Leaderboard({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [scope, setScope] = useState<LeaderboardScope>("global");
  const [range, setRange] = useState<LeaderboardRange>("week");
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setError("");
    api.leaderboard(scope, range)
      .then((result) => active && setBoard(result))
      .catch((failure) => active && setError(errorMessage(failure)));
    return () => { active = false; };
  }, [scope, range, refreshKey]);

  const ranges: [LeaderboardRange, string][] = [["week", "7 days"], ["month", "30 days"], ["all", "All time"]];
  const youShown = board?.entries.some((entry) => entry.isYou);
  const row = (entry: LeaderboardEntry) => (
    <div className={`leader-row ${entry.rank === 1 && entry.points > 0 ? "winner" : ""} ${entry.isYou ? "is-you" : ""}`} key={entry.userId}>
      <div className={`rank rank-${Math.min(entry.rank, 4)}`}>{entry.rank}</div>
      <Avatar userId={entry.userId} name={entry.fullName} />
      <div className="leader-copy"><strong>{entry.isYou ? `${entry.fullName} (you)` : entry.fullName}</strong><span>@{entry.handle}</span></div>
      <div className="leader-score"><Icon name="bolt" size={14} /><strong>{entry.points.toLocaleString()}</strong><span>pts</span></div>
      {entry.isYou ? <span className="follow-button placeholder" aria-hidden="true" /> : <ConnectButton person={entry} onChanged={onChanged} />}
    </div>
  );

  return (
    <Card className="leaderboard-card">
      <div className="card-head leaderboard-head">
        <div><Label>Leaderboard</Label><div className="section-title">{scope === "global" ? "Top movers" : "You and your connections"}</div></div>
        <div className="range-toggle" aria-label="Who to rank">
          <Button className={scope === "global" ? "active" : ""} onClick={() => setScope("global")}>Everyone</Button>
          <Button className={scope === "connections" ? "active" : ""} onClick={() => setScope("connections")}>Connections</Button>
        </div>
      </div>
      <div className="range-toggle range-row" aria-label="Time range">
        {ranges.map(([value, label]) => <Button key={value} onClick={() => setRange(value)} className={range === value ? "active" : ""}>{label}</Button>)}
      </div>
      {error && <p className="auth-message" role="alert">{error}</p>}
      {!board && !error && <p className="empty-message">Loading rankings...</p>}
      {board && (
        <>
          <div className="leader-list">{board.entries.map(row)}</div>
          {!youShown && <div className="your-rank">{row(board.you)}</div>}
          {board.members <= 1 && (
            <p className="empty-message">
              {scope === "connections" ? "Connect with people to compare progress here." : "No one else is on the board yet. Invite a friend!"}
            </p>
          )}
          <p className="board-note">Points come only from workouts scored by the server. Private profiles appear only to their connections.</p>
        </>
      )}
    </Card>
  );
}

function ConnectionsCard({ connections, onChanged }: { connections: ConnectionsResponse | null; onChanged: () => void }) {
  const [confirmBlock, setConfirmBlock] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      setConfirmBlock(null);
      onChanged();
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }
  if (!connections) return <Card className="squad-card"><p className="empty-message">Loading connections...</p></Card>;
  const { incoming, outgoing, connected } = connections;
  return (
    <Card className="squad-card connections-card">
      <div className="card-head">
        <div><Label>Your circle</Label><div className="section-title">Connections</div></div>
        <span className="count-pill">{connected.length}</span>
      </div>
      {error && <p className="auth-message" role="alert">{error}</p>}
      {incoming.length > 0 && (
        <div className="connection-group">
          <Label>Requests for you</Label>
          {incoming.map((person) => (
            <div className="connection-row" key={person.userId}>
              <Avatar userId={person.userId} name={person.fullName} />
              <div className="leader-copy"><strong>{person.fullName}</strong><span>@{person.handle}</span></div>
              <div className="row-actions">
                <Button className="follow-button" onClick={() => run(() => api.acceptConnection(person.userId))}>Accept</Button>
                <Button className="mini-text-button" label={`Decline ${person.fullName}`} onClick={() => run(() => api.removeConnection(person.userId))}>Decline</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="connection-group">
        {connected.length === 0 && <p className="empty-message">No connections yet. Search for people or share your invite link.</p>}
        {connected.map((person) => (
          <div className="connection-row" key={person.userId}>
            <Avatar userId={person.userId} name={person.fullName} />
            <div className="leader-copy"><strong>{person.fullName}</strong><span>@{person.handle} · {person.totalPoints.toLocaleString()} pts · Lvl {person.level}</span></div>
            <div className="row-actions">
              <Button className="mini-text-button" label={`Remove ${person.fullName}`} onClick={() => run(() => api.removeConnection(person.userId))}>Remove</Button>
              {confirmBlock === person.userId
                ? <Button className="mini-text-button danger" onClick={() => run(() => api.block(person.userId))}>Confirm block</Button>
                : <Button className="mini-text-button" label={`Block ${person.fullName}`} onClick={() => setConfirmBlock(person.userId)}>Block</Button>}
            </div>
          </div>
        ))}
      </div>
      {outgoing.length > 0 && (
        <div className="connection-group">
          <Label>Waiting for them</Label>
          {outgoing.map((person) => (
            <div className="connection-row" key={person.userId}>
              <Avatar userId={person.userId} name={person.fullName} />
              <div className="leader-copy"><strong>{person.fullName}</strong><span>@{person.handle}</span></div>
              <Button className="mini-text-button" onClick={() => run(() => api.removeConnection(person.userId))}>Cancel</Button>
            </div>
          ))}
        </div>
      )}
      <p className="board-note"><Icon name="shield" size={12} /> Declining or removing is private: the other person is not told. Blocking also hides you from each other.</p>
    </Card>
  );
}

function InviteCard({ user }: { user: AuthUser }) {
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  async function loadCode() {
    if (code) return code;
    const result = await api.invite();
    setCode(result.inviteCode);
    return result.inviteCode;
  }
  async function share() {
    setBusy(true);
    setMessage("");
    try {
      const link = inviteLink(await loadCode());
      const outcome = await shareInvite(link, user.fullName);
      setMessage({
        shared: "Invite shared.",
        copied: "Link copied. Paste it in a message to a friend.",
        cancelled: "",
        manual: "Copy the link below to share it.",
      }[outcome]);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    setBusy(true);
    try {
      const result = await api.newInvite();
      setCode(result.inviteCode);
      setConfirmReset(false);
      setMessage("New link ready. Old links no longer work.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="invite-card">
      <div className="invite-icon"><Icon name="users" /></div>
      <div>
        <strong>Stronger together</strong>
        <p>Share your personal link. When a friend opens it and chooses to connect, you are connected right away, even if your profile is private.</p>
      </div>
      <Button className="secondary-button" disabled={busy} onClick={share}><Icon name="share" size={15} /> {busy ? "Preparing..." : "Share invite"}</Button>
      {code && (
        <label className="invite-link">
          <span>Your invite link</span>
          <input readOnly value={inviteLink(code)} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      {message && <p className="invite-status" role="status">{message}</p>}
      {code && (confirmReset
        ? <div className="invite-reset"><span>Old links will stop working.</span><Button className="mini-text-button danger" disabled={busy} onClick={reset}>Make new link</Button><Button className="mini-text-button" onClick={() => setConfirmReset(false)}>Keep</Button></div>
        : <Button className="mini-text-button" onClick={() => setConfirmReset(true)}>Reset link</Button>)}
    </Card>
  );
}

export function Community({
  user,
  profile,
  connections,
  onChanged,
}: {
  user: AuthUser;
  profile: ProfileResponse | null;
  connections: ConnectionsResponse | null;
  onChanged: () => void;
}) {
  const [showPeople, setShowPeople] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [banner, setBanner] = useState<LeaderboardResponse | null>(null);
  const changed = useCallback(() => {
    setRefreshKey((key) => key + 1);
    onChanged();
  }, [onChanged]);

  useEffect(() => {
    api.leaderboard("global", "month").then(setBanner).catch(() => setBanner(null));
  }, [refreshKey]);
  // Requests accepted elsewhere (the notification bell) also refresh this page.
  useEffect(() => {
    if (connections) setRefreshKey((key) => key + 1);
  }, [connections]);

  return (
    <div className="page">
      <div className="welcome-row">
        <PageTitle subtitle="Train together, climb the ranks, and celebrate every win.">Community</PageTitle>
        <Button className="primary-button" onClick={() => setShowPeople((visible) => !visible)}><Icon name="users" size={18} /> {showPeople ? "Close search" : "Find people"}</Button>
      </div>
      {showPeople && <PeopleSearch onChanged={changed} refreshKey={refreshKey} />}
      <div className="community-banner">
        <div>
          <Label>Last 30 days</Label>
          <div className="community-number">{banner ? banner.boardPoints.toLocaleString() : "—"}</div>
          <span>points earned by {banner ? banner.members.toLocaleString() : "—"} public {banner?.members === 1 ? "athlete" : "athletes"}{profile ? ` · you: ${banner?.you.points.toLocaleString() ?? 0}` : ""}</span>
        </div>
        <div className="banner-avatars">
          {banner?.entries.slice(0, 4).map((entry) => <Avatar key={entry.userId} userId={entry.userId} name={entry.fullName} />)}
          {banner && banner.members > 4 && <div className="avatar avatar-more">+{banner.members - 4}</div>}
        </div>
      </div>
      <div className="community-grid">
        <Leaderboard refreshKey={refreshKey} onChanged={changed} />
        <div className="community-side">
          <ConnectionsCard connections={connections} onChanged={changed} />
          <InviteCard user={user} />
        </div>
      </div>
    </div>
  );
}
