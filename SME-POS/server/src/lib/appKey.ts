/**
 * Is APP_KEY fit to run production on? null = yes, otherwise why not.
 *
 * APP_KEY encrypts every session cookie AND signs the sign-up hand-off links, so
 * anyone who knows it can forge a login as any user. The example value shipped in
 * .env.example ("change-me-to-a-32-character-random-string!!") is 43 characters --
 * it sailed through a plain length check -- so placeholders and keys that are
 * obviously not random are refused too.
 *
 * One definition, two users: the server refuses to boot on it (index.ts), and
 * `npm run preflight` reports it before a deploy rather than after.
 */
const PLACEHOLDER = /change[-_ ]?me|dev-only|example|placeholder|your[-_ ]?(key|secret)|secret|password|123456|qwerty/i;

export function appKeyProblem(key: string | undefined): string | null {
  if (!key || key.length < 32) {
    return 'APP_KEY must be set (≥32 chars) in production — refusing to start.';
  }
  if (PLACEHOLDER.test(key) || new Set(key).size < 12) {
    return (
      'APP_KEY looks like a placeholder, not a random key — refusing to start. ' +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  return null;
}
