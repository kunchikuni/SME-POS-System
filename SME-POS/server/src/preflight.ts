/**
 * `npm run preflight --workspace=server` -- is this environment ready for real
 * customers? Reads the server's own settings (server/.env, or the host's variables
 * when run there, e.g. `railway run npm run preflight --workspace=server`) and the
 * database they point at, and prints what is wrong and how to fix it. See
 * lib/preflight.ts. It changes nothing; the exit code is 1 if anything must be fixed.
 */
import 'dotenv/config';
import { checkDatabase, checkEnvironment, isReady, renderReport, type Finding } from './lib/preflight.js';

const findings: Finding[] = checkEnvironment(process.env);

if (!process.env.DATABASE_URL) {
  findings.push({ level: 'fail', area: 'Database', message: 'Database not checked: DATABASE_URL is not set', fix: 'Set it, then run this again.' });
} else {
  // Say WHICH database this is -- the one mistake worth catching before anything else is
  // pointing a "production" check at the development project. Host and name only, never the password.
  try {
    const u = new URL(process.env.DATABASE_URL);
    console.log(`Checking the database at ${u.hostname}${u.port ? ':' + u.port : ''} as ${decodeURIComponent(u.username)}\n`);
  } catch { /* checkEnvironment already reports an unreadable string */ }

  // db.ts throws at import without DATABASE_URL, so it is only loaded here.
  const { db } = await import('./lib/db.js');
  try {
    findings.push(...(await checkDatabase((sql) => db.$queryRawUnsafe(sql))));
  } finally {
    await db.$disconnect();
  }
}

console.log(renderReport(findings));
process.exit(isReady(findings) ? 0 : 1);
