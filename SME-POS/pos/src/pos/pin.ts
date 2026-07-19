import bcrypt from 'bcryptjs';

/**
 * Verifies a cashier PIN offline against the bcrypt hash shipped in bootstrap.
 * This is attribution, not a security boundary — the device token secures the
 * backend (docs/ARCHITECTURE.md §7).
 *
 * Laravel hashes with the `$2y$` prefix; bcryptjs expects `$2a$`/`$2b$`. The two
 * are the same algorithm, so we normalise the prefix before comparing.
 *
 * A missing or malformed hash is NOT a wrong PIN — it means the device synced a
 * staff record without a usable hash (e.g. User::$hidden stripped it server-side,
 * or the staff member has no PIN set). Collapsing both into `false` makes that
 * look like an endlessly rejected PIN, so we raise a distinct error the UI can
 * explain and act on.
 */

const BCRYPT_HASH = /^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export class MissingPinHashError extends Error {
  constructor() {
    super('No usable PIN hash for this cashier.');
    this.name = 'MissingPinHashError';
  }
}

function normalise(hash: string): string {
  // Laravel emits $2y$; bcryptjs speaks $2a$/$2b$. Same algorithm.
  return hash.replace(/^\$2y\$/, '$2b$');
}

export async function verifyPin(pin: string, hash: string | null | undefined): Promise<boolean> {
  if (typeof hash !== 'string' || !BCRYPT_HASH.test(normalise(hash))) {
    throw new MissingPinHashError();
  }

  try {
    return await bcrypt.compare(pin, normalise(hash));
  } catch {
    // A genuine comparison failure on a well-formed hash: treat as a bad PIN.
    return false;
  }
}
