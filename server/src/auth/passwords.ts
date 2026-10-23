import bcrypt from 'bcrypt';

export const PASSWORD_MIN_CHARACTERS = 15;
export const PASSWORD_MAX_BYTES = 72;

export function isValidNewPassword(password: string): boolean {
  return (
    Array.from(password).length >= PASSWORD_MIN_CHARACTERS &&
    Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_BYTES
  );
}

/** Bcrypt's cost is 12; reject input that would otherwise be silently truncated. */
export async function hashPassword(password: string): Promise<string> {
  if (!isValidNewPassword(password)) {
    throw new Error('Password must be at least 15 characters and at most 72 UTF-8 bytes.');
  }
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return false;
  return bcrypt.compare(password, hash);
}
