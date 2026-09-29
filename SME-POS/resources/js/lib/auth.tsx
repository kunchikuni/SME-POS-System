/**
 * Auth context — provides the current user without Inertia's usePage().
 * Populated from the dedicated /api/me endpoint.
 *
 * The AuthProvider wraps the entire app in app.tsx and fetches the current
 * user once on mount. All components read from useAuth().
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { api } from './api.js';

export interface CurrentUser {
  id: string;
  name: string;
  role: 'owner' | 'manager' | 'cashier' | 'waiter';
  email: string | null;
}

export interface TenantInfo {
  id: string;
  name: string;
  subdomain: string;
  currency: string;
  plan: string;
  trialEndsAt: string | null;
  taxRateBps: number;
  branding: Record<string, string | null> | null;
  /** Till modes in use across live branches, e.g. ["retail"] or ["retail", "restaurant"]. */
  modes?: string[];
}

interface AuthState {
  user: CurrentUser | null;
  tenant: TenantInfo | null;
  loading: boolean;
  refetch: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  tenant: null,
  loading: true,
  refetch: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = async () => {
    try {
      // NOTE: was fetch('/me') — that path collided with the SPA's own
      // route namespace before the /api prefix fix (server/src/index.ts).
      // Every JSON endpoint now lives under /api.
      const data = await fetch('/api/me', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      }).then((r) => (r.ok ? r.json() : null));

      if (data) {
        setUser(data.user);
        setTenant(data.tenant);
      } else {
        setUser(null);
        setTenant(null);
      }
    } catch {
      setUser(null);
      setTenant(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchMe(); }, []);

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, tenant, loading, refetch: fetchMe, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
