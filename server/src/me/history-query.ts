/** Parsing and validation for GET /api/me/workouts. Kept free of HTTP and SQL. */

export const DEFAULT_HISTORY_LIMIT = 20;
export const MAX_HISTORY_LIMIT = 100;

/** Position of the last item already returned, in sort order (completedAt, recordedAt, id). */
export interface HistoryPosition {
  completedAt: string;
  recordedAt: string;
  id: string;
}

export interface HistoryQuery {
  limit: number;
  /** Inclusive calendar dates (YYYY-MM-DD). */
  start?: string;
  end?: string;
  after?: HistoryPosition;
}

export type HistoryQueryResult = { query: HistoryQuery } | { error: string };

const ALLOWED_PARAMETERS = new Set(['limit', 'cursor', 'start', 'end']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RECORDED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/;

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

interface CursorPayload {
  v: 1;
  c: string;
  r: string;
  i: string;
  s: string | null;
  e: string | null;
}

/** The cursor is opaque to clients. It carries the last position and the original date window. */
export function encodeCursor(position: HistoryPosition, query: HistoryQuery): string {
  const payload: CursorPayload = {
    v: 1,
    c: position.completedAt,
    r: position.recordedAt,
    i: position.id,
    s: query.start ?? null,
    e: query.end ?? null,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(value: string): CursorPayload | null {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) return null;
  try {
    const payload = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as CursorPayload;
    const dateOrNull = (date: unknown) =>
      date === null || (typeof date === 'string' && isCalendarDate(date));
    return payload?.v === 1 &&
      typeof payload.c === 'string' &&
      isCalendarDate(payload.c) &&
      typeof payload.r === 'string' &&
      RECORDED_AT.test(payload.r) &&
      typeof payload.i === 'string' &&
      UUID.test(payload.i) &&
      dateOrNull(payload.s) &&
      dateOrNull(payload.e)
      ? payload
      : null;
  } catch {
    return null;
  }
}

/** Validates the raw Express query. Every problem is a 400 with a specific message. */
export function parseHistoryQuery(raw: Record<string, unknown>): HistoryQueryResult {
  for (const [key, value] of Object.entries(raw)) {
    if (!ALLOWED_PARAMETERS.has(key)) {
      return {
        error: `Unknown query parameter "${key}". Use limit, cursor, start, or end.`,
      };
    }
    if (typeof value !== 'string') return { error: `Send "${key}" only once.` };
  }
  const params = raw as Record<string, string | undefined>;

  let limit = DEFAULT_HISTORY_LIMIT;
  if (params.limit !== undefined) {
    if (!/^\d{1,3}$/.test(params.limit)) {
      return { error: `limit must be a whole number from 1 to ${MAX_HISTORY_LIMIT}.` };
    }
    limit = Number(params.limit);
    if (limit < 1 || limit > MAX_HISTORY_LIMIT) {
      return { error: `limit must be a whole number from 1 to ${MAX_HISTORY_LIMIT}.` };
    }
  }

  for (const key of ['start', 'end'] as const) {
    const value = params[key];
    if (value !== undefined && !isCalendarDate(value)) {
      return { error: `${key} must be a real date in YYYY-MM-DD format.` };
    }
  }
  let start = params.start;
  let end = params.end;

  let after: HistoryPosition | undefined;
  if (params.cursor !== undefined) {
    const cursor = decodeCursor(params.cursor);
    if (!cursor) return { error: 'cursor is invalid. Use nextCursor from the previous page.' };
    // A continuation keeps the original window. Repeating the same filters is allowed.
    if ((start !== undefined && start !== cursor.s) || (end !== undefined && end !== cursor.e)) {
      return { error: 'start and end cannot change while following a cursor.' };
    }
    start = cursor.s ?? undefined;
    end = cursor.e ?? undefined;
    after = { completedAt: cursor.c, recordedAt: cursor.r, id: cursor.i };
  }

  if (start && end && start > end) return { error: 'start must be on or before end.' };
  return { query: { limit, start, end, after } };
}

/** Sort comparator shared by the in-memory store: newest first, then recordedAt, then id. */
export function compareHistoryDescending(a: HistoryPosition, b: HistoryPosition): number {
  return (
    b.completedAt.localeCompare(a.completedAt) ||
    b.recordedAt.localeCompare(a.recordedAt) ||
    b.id.localeCompare(a.id)
  );
}
