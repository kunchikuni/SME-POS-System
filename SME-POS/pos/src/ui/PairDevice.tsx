import { useState } from 'react';
import { api, ApiError, OfflineError } from '../sync/apiClient';
import { clearSession, saveSession, type DeviceSession } from '../sync/session';

/**
 * One-time device provisioning. The operator enters (or scans) the token
 * generated for this till in the dashboard. Premium dark design consistent
 * with the rest of the POS UI.
 */
export function PairDevice({ onPaired }: { onPaired: (session: DeviceSession) => void }) {
  const [token, setToken] = useState('');
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pair() {
    setBusy(true);
    setError(null);

    saveSession({
      token: token.trim(),
      device: { id: '', name: '' },
      branch: { id: '', name: '' },
      tenant: { name: '', theme: {}, mode: 'retail', currency: 'USD', taxRateBps: 0 },
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
        setError('Couldn\u2019t reach the server. Pairing needs a connection once.');
      } else if (e instanceof ApiError && e.status === 401) {
        setError('That token wasn\u2019t recognised. Check it and try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center pos-bg p-4 sm:p-6 relative overflow-hidden">
      {/* Radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(124,58,237,0.10)_0%,transparent_65%)]" />

      <div className="relative z-10 w-full max-w-sm anim-pop-in">
        {/* Logo lockup */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 text-2xl shadow-[0_0_30px_rgba(124,58,237,0.4)] ring-1 ring-white/10">
            🛒
          </div>
          <h1 className="text-2xl font-bold text-white">Pair this till</h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Enter the device token from your Wivae dashboard
          </p>
          <p className="text-xs text-slate-600 mt-0.5">Devices → Add device</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 backdrop-blur-sm">
          <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2" htmlFor="token">
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
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all"
            placeholder="paste token here"
          />

          {error && (
            <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-400 ring-1 ring-red-500/20">
              {error}
            </p>
          )}

          <button
            onClick={pair}
            disabled={busy || token.trim() === ''}
            className="btn-retail mt-5 w-full rounded-xl py-3.5 font-bold text-white text-sm tracking-wide"
          >
            {busy ? 'Pairing…' : 'Pair device'}
          </button>
        </div>
      </div>
    </div>
  );
}
