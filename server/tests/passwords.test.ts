import { hashPassword, verifyPassword } from '../src/auth/passwords';

describe('bcrypt password helpers', () => {
  it('hashes a password and verifies matching and incorrect passwords', async () => {
    const hash = await hashPassword('example-password');
    expect(hash).not.toBe('example-password');
    expect(await verifyPassword('example-password', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
    expect(await verifyPassword('example-password' + 'x'.repeat(72), hash)).toBe(false);
  });

  it('rejects short passwords and passwords exceeding bcrypt’s byte limit', async () => {
    await expect(hashPassword('short')).rejects.toThrow();
    await expect(hashPassword('a'.repeat(73))).rejects.toThrow();
    await expect(hashPassword('🐊'.repeat(19))).rejects.toThrow();
  });
});
