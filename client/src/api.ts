import type {
  BlockedUser,
  ConnectionResponse,
  ConnectionsResponse,
  InvitePreview,
  InviteResponse,
  LeaderboardRange,
  LeaderboardResponse,
  LeaderboardScope,
  NewWorkoutRequest,
  PeopleSearchResponse,
  ProfileResponse,
  ScoredWorkoutResponse,
  SessionsResponse,
  UpdateProfileRequest,
  UpdateWorkoutRequest,
  WorkoutDetailResponse,
  WorkoutHistoryResponse,
} from "@gatorgainz/types";

/** An API failure with the server's message, safe to show to the user. */
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: method === "GET"
        ? undefined
        : { "X-GatorGainz-Request": "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Unable to reach GatorGainz. Check your connection and try again.");
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data && typeof data.error === "string" ? data.error : "Something went wrong. Please try again.";
    throw new ApiError(response.status, message);
  }
  return data as T;
}

/** The user's local calendar date, so streaks and weekly totals follow their own day. */
export function localDate(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

const today = () => `today=${localDate()}`;

export const api = {
  profile: () => request<ProfileResponse>("GET", `/api/me/profile?${today()}`),
  updateProfile: (update: UpdateProfileRequest) =>
    request<ProfileResponse>("PATCH", `/api/me/profile?${today()}`, update),

  submitWorkout: (workout: NewWorkoutRequest) => request<ScoredWorkoutResponse>("POST", "/api/workouts", workout),
  recentWorkouts: (limit = 5) => request<WorkoutHistoryResponse>("GET", `/api/me/workouts?limit=${limit}`),
  history: (options: { start?: string; end?: string; cursor?: string | null; limit?: number }) => {
    const params = new URLSearchParams({ limit: String(options.limit ?? 20) });
    if (options.cursor) params.set("cursor", options.cursor);
    else {
      if (options.start) params.set("start", options.start);
      if (options.end) params.set("end", options.end);
    }
    return request<WorkoutHistoryResponse>("GET", `/api/me/workouts?${params}`);
  },
  workoutDetail: (id: string) => request<WorkoutDetailResponse>("GET", `/api/me/workouts/${encodeURIComponent(id)}`),
  updateWorkout: (id: string, body: UpdateWorkoutRequest) =>
    request<ScoredWorkoutResponse>("PUT", `/api/me/workouts/${encodeURIComponent(id)}`, body),
  deleteWorkout: (id: string) => request<void>("DELETE", `/api/me/workouts/${encodeURIComponent(id)}`),
  person: (userId: string) => request<ConnectionResponse>("GET", `/api/community/people/${encodeURIComponent(userId)}`),

  sessions: () => request<SessionsResponse>("GET", "/api/auth/sessions"),
  signOutOthers: () => request<{ revoked: number }>("POST", "/api/auth/sessions/revoke-others"),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("POST", "/api/auth/password", { currentPassword, newPassword }),
  deleteAccount: (password: string) => request<void>("DELETE", "/api/auth/account", { password, confirm: "DELETE" }),

  connections: () => request<ConnectionsResponse>("GET", "/api/me/connections"),
  connectByHandle: (handle: string) => request<ConnectionResponse>("POST", "/api/me/connections", { handle }),
  connectByInvite: (inviteCode: string) => request<ConnectionResponse>("POST", "/api/me/connections", { inviteCode }),
  acceptConnection: (userId: string) => request<ConnectionResponse>("POST", `/api/me/connections/${encodeURIComponent(userId)}/accept`),
  removeConnection: (userId: string) => request<void>("DELETE", `/api/me/connections/${encodeURIComponent(userId)}`),
  block: (userId: string) => request<void>("POST", "/api/me/blocks", { userId }),
  unblock: (userId: string) => request<void>("DELETE", `/api/me/blocks/${encodeURIComponent(userId)}`),
  blocks: () => request<{ blocked: BlockedUser[] }>("GET", "/api/me/blocks"),

  searchPeople: (query: string) =>
    request<PeopleSearchResponse>("GET", `/api/community/people?q=${encodeURIComponent(query)}`),
  leaderboard: (scope: LeaderboardScope, range: LeaderboardRange) =>
    request<LeaderboardResponse>("GET", `/api/community/leaderboard?scope=${scope}&range=${range}&${today()}`),

  invite: () => request<InviteResponse>("GET", "/api/me/invite"),
  newInvite: () => request<InviteResponse>("POST", "/api/me/invite"),
  previewInvite: (code: string) => request<InvitePreview>("GET", `/api/invites/${encodeURIComponent(code)}`),
};

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
}

// ---- Invite links ----

const pendingInviteKey = "gatorgainz-pending-invite";
const INVITE_CODE = /^[A-Za-z0-9_-]{12,16}$/;

export function inviteLink(code: string): string {
  return `${window.location.origin}/?invite=${encodeURIComponent(code)}`;
}

/** Moves ?invite=… from the address bar into session storage, so it survives sign-up. */
export function captureInviteFromUrl(): void {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("invite");
  if (code === null) return;
  url.searchParams.delete("invite");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  if (!INVITE_CODE.test(code)) return;
  try {
    window.sessionStorage.setItem(pendingInviteKey, code);
  } catch {
    // Without storage the invite is simply not remembered.
  }
}

export function pendingInvite(): string | null {
  try {
    return window.sessionStorage.getItem(pendingInviteKey);
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    window.sessionStorage.removeItem(pendingInviteKey);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Shares with the device share sheet when there is one, otherwise copies to the clipboard.
 * Returns what happened so the UI can say so; "manual" means show the link to copy by hand.
 */
export async function shareInvite(link: string, inviterName: string): Promise<"shared" | "copied" | "cancelled" | "manual"> {
  const data = {
    title: "Join me on GatorGainz",
    text: `${inviterName} invited you to train together on GatorGainz.`,
    url: link,
  };
  if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare(data))) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    return "copied";
  } catch {
    return "manual";
  }
}
