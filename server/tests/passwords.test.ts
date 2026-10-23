import { hashPassword, verifyPassword } from '../src/auth/passwords';
import bcrypt from 'bcrypt';

describe('bcrypt password helpers', () => {
  it('hashes a password and verifies matching and incorrect passwords', async () => {
    const hash = await hashPassword('example-password');
    expect(hash).not.toBe('example-password');
    expect(bcrypt.getRounds(hash)).toBe(12);
    expect(await verifyPassword('example-password', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
    expect(await verifyPassword('example-password' + 'x'.repeat(72), hash)).toBe(false);
  });

  it('rejects passwords below 15 Unicode characters and above 72 UTF-8 bytes', async () => {
    await expect(hashPassword('short')).rejects.toThrow();
    await expect(hashPassword('a'.repeat(14))).rejects.toThrow();
    await expect(hashPassword('🐊'.repeat(8))).rejects.toThrow();
    await expect(hashPassword('a'.repeat(73))).rejects.toThrow();
    await expect(hashPassword('🐊'.repeat(19))).rejects.toThrow();
  });

  it('accepts the exact byte boundary and Unicode passwords within both limits', async () => {
    const boundary = 'a'.repeat(72);
    expect(await verifyPassword(boundary, await hashPassword(boundary))).toBe(true);
    const unicode = '🐊'.repeat(15);
    expect(await verifyPassword(unicode, await hashPassword(unicode))).toBe(true);
  });
});
