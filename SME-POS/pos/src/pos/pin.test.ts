import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { MissingPinHashError, verifyPin } from '../pos/pin';

const laravelHash = (pin: string) => bcrypt.hashSync(pin, 10).replace(/^\$2[ab]\$/, '$2y$');

describe('verifyPin', () => {
  it('accepts the correct PIN against a Laravel-style $2y$ hash', async () => {
    const hash = laravelHash('1234');
    expect(hash.startsWith('$2y$')).toBe(true);
    expect(await verifyPin('1234', hash)).toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    expect(await verifyPin('0000', laravelHash('1234'))).toBe(false);
  });

  /**
   * Regression: User::$hidden contains 'pin_hash', so the bootstrap payload
   * silently shipped staff with no hash and EVERY pin was rejected. A missing
   * hash must be distinguishable from a wrong PIN, or that bug is invisible.
   */
  it('throws (not "wrong PIN") when the hash is missing or malformed', async () => {
    await expect(verifyPin('1234', undefined)).rejects.toBeInstanceOf(MissingPinHashError);
    await expect(verifyPin('1234', null)).rejects.toBeInstanceOf(MissingPinHashError);
    await expect(verifyPin('1234', '')).rejects.toBeInstanceOf(MissingPinHashError);
    await expect(verifyPin('1234', 'not-a-hash')).rejects.toBeInstanceOf(MissingPinHashError);
  });

  it('accepts native $2a$/$2b$ hashes too', async () => {
    expect(await verifyPin('4321', bcrypt.hashSync('4321', 10))).toBe(true);
  });
});
