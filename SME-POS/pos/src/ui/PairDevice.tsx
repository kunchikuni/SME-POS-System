import { useState } from 'react';
import { api, ApiError, OfflineError } from '../sync/apiClient';
import { clearSession, saveSession, type DeviceSession } from '../sync/session';

/**
 * One-time device provisioning. The operator enters (or, later, scans) the
 * token generated for this till in the dashboard. We store it, probe
 * /pos/session to validate it and fetch the branch + branding, and on success
 * hand the full session up to the app. An invalid token is rolled back so the
 * app stays on this screen.
 */
export function PairDevice({ onPaired }: { onPaired: (session: DeviceSession) => void }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pair() {
    setBusy(true);
    setError(null);

    // The api client reads the token from the stored session, so write it first.
    saveSession({
      token: token.trim(),
      device: { id: '', name: '' },
      branch: { id: '', name: '' },
      tenant: { name: '', theme: {} },
    });

    try {
      const s = await api.session();
      const full: DeviceSession = {
        token: token.trim(),
        device: s.device,
        branch: s.branch,
        tenant: s.tenant,
      };
      saveSession(full);
      onPaired(full);
    } catch (e) {
      clearSession();
      if (e instanceof OfflineError) {
        setError('Couldn’t reach the server. Pairing needs a connection once.');
      } else if (e instanceof ApiError && e.status === 401) {
        setError('That token wasn’t recognised. Check it and try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Pair this till</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter the device token from your Wivae dashboard (Devices → Add device).
        </p>

        <label className="mt-6 block text-sm font-medium text-slate-700" htmlFor="token">
          Device token
        </label>
        <input
          id="token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && token.trim() && !busy && pair()}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          placeholder="paste token"
        />

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          onClick={pair}
          disabled={busy || token.trim() === ''}
          className="mt-6 w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Pairing…' : 'Pair device'}
        </button>
      </div>
    </div>
  );
}
