import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { verifyPin } from '../pos/pin';

describe('verifyPin', () => {
  it('accepts the correct PIN against a Laravel-style $2y$ hash', async () => {
    const laravelHash = bcrypt.hashSync('1234', 10).replace(/^\$2[ab]\$/, '$2y$');
    expect(laravelHash.startsWith('$2y$')).toBe(true);
    expect(await verifyPin('1234', laravelHash)).toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    const laravelHash = bcrypt.hashSync('1234', 10).replace(/^\$2[ab]\$/, '$2y$');
    expect(await verifyPin('0000', laravelHash)).toBe(false);
  });

  it('returns false on a malformed hash instead of throwing', async () => {
    expect(await verifyPin('1234', 'not-a-hash')).toBe(false);
  });
});
