import type { AuthResponse, AuthUser, LoginRequest, RegisterRequest } from "@gatorgainz/types";

export class AuthApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "AuthApiError";
  }
}

function messageForStatus(status: number): string {
  if (status === 400) return "Check the required fields and try again.";
  if (status === 401) return "Email or password is incorrect.";
  if (status === 409) return "An account already exists for this email. Try logging in.";
  if (status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (status === 503) return "The account service is unavailable. Please try again.";
  return "We could not complete your request. Please try again.";
}

async function authRequest(path: string, body?: LoginRequest | RegisterRequest): Promise<Response> {
  try {
    return await fetch(`/api/auth/${path}`, {
      method: body || path === "logout" ? "POST" : "GET",
      credentials: "same-origin",
      headers: body || path === "logout"
        ? { "Content-Type": "application/json", "X-GatorGainz-Request": "1" }
        : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new AuthApiError(0, "Unable to reach GatorGainz. Check your connection and try again.");
  }
}

async function readUser(response: Response): Promise<AuthUser> {
  if (!response.ok) throw new AuthApiError(response.status, messageForStatus(response.status));
  try {
    const data: AuthResponse = await response.json();
    if (!data.user || typeof data.user.id !== "string" || typeof data.user.fullName !== "string"
      || typeof data.user.email !== "string" || typeof data.user.joinedAt !== "string") {
      throw new Error("Invalid account response");
    }
    return data.user;
  } catch {
    throw new AuthApiError(0, "We could not read your account. Please try again.");
  }
}

export async function registerAccount(input: RegisterRequest): Promise<AuthUser> {
  return readUser(await authRequest("register", input));
}

export async function loginAccount(input: LoginRequest): Promise<AuthUser> {
  return readUser(await authRequest("login", input));
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const response = await authRequest("me");
  if (response.status === 401) return null;
  return readUser(response);
}

export async function logoutAccount(): Promise<void> {
  const response = await authRequest("logout");
  if (!response.ok) throw new AuthApiError(response.status, messageForStatus(response.status));
}

export function getAuthErrorMessage(error: unknown): string {
  return error instanceof AuthApiError ? error.message : "We could not complete your request. Please try again.";
}
