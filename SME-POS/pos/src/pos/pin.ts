import bcrypt from 'bcryptjs';

/**
 * Verifies a cashier PIN offline against the bcrypt hash shipped in bootstrap.
 * This is attribution, not a security boundary — the device token secures the
 * backend (docs/ARCHITECTURE.md §7).
 *
 * Laravel hashes with the `$2y$` prefix; bcryptjs expects `$2a$`/`$2b$`. The two
 * are the same algorithm, so we normalise the prefix before comparing.
 */
export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const normalised = hash.replace(/^\$2y\$/, '$2b$');
  try {
    return await bcrypt.compare(pin, normalised);
  } catch {
    return false;
  }
}
