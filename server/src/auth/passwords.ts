import bcrypt from 'bcrypt';

/** Ready for a future registration route; bcrypt accepts at most 72 UTF-8 bytes. */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Password must be at least 8 characters and at most 72 UTF-8 bytes.');
  }
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (Buffer.byteLength(password, 'utf8') > 72) return false;
  return bcrypt.compare(password, hash);
}
