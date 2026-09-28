/**
 * Lightweight data-fetching hooks for the REST API.
 * Replaces Inertia's `usePage().props` pattern with SWR-style hooks.
 *
 * No external library required — built on native React + fetch.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { ApiError } from './api.js';

// ── useQuery ─────────────────────────────────────────────────────────────────

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /**
   * Structured detail behind `error`, when the server sent one — currently
   * just the plan-gate shape from requireFeature(). Pages check
   * `errorInfo?.code === 'plan_upgrade_required'` to render an upgrade card
   * instead of silently rendering with empty data (see UpgradeRequired.tsx).
   */
  errorInfo: { code: string; feature?: string; plan?: string } | null;
}

/**
 * Fetch data from the API and keep it fresh.
 *
 * @example
 *   const { data, loading, error, refetch } = useQuery(() => api.products.list({ q: '' }));
 */
export function useQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
) {
  const [state, setState] = useState<QueryState<T>>({ data: null, loading: true, error: null, errorInfo: null });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Latest-wins guard. Without it, this hook had a real race: typing in the
  // Products search fires one request per keystroke, and nothing stopped an
  // EARLIER (slower) response from resolving after a later one and
  // overwriting fresh results with stale ones. Each call takes a ticket;
  // only the most recent ticket is allowed to commit state. The same counter
  // makes post-unmount resolutions no-ops.
  //
  // This is interim hardening, not the destination — see the audit report:
  // the plan of record is to replace this hook with TanStack Query, which
  // solves this class of problem (races, caching, dedup, retries) wholesale.
  const ticketRef = useRef(0);

  const refetch = useCallback(async () => {
    const ticket = ++ticketRef.current;
    setState((s) => ({ ...s, loading: true, error: null, errorInfo: null }));
    try {
      const data = await fetcherRef.current();
      if (ticket !== ticketRef.current) return; // superseded — drop silently
      setState({ data, loading: false, error: null, errorInfo: null });
    } catch (err) {
      if (ticket !== ticketRef.current) return; // superseded — drop silently
      const msg = err instanceof ApiError
        ? err.message
        : err instanceof Error
        ? err.message
        : 'Something went wrong.';

      const body = err instanceof ApiError ? (err.body as any) : null;
      const errorInfo = body?.code ? { code: body.code, feature: body.feature, plan: body.plan } : null;

      setState({ data: null, loading: false, error: msg, errorInfo });
    }
  }, []);

  useEffect(() => {
    void refetch();
    // Invalidate any in-flight request when deps change or on unmount, so a
    // late resolution can never call setState on a stale/unmounted tree.
    return () => { ticketRef.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, refetch };
}

// ── useMutation ───────────────────────────────────────────────────────────────

interface MutationState {
  loading: boolean;
  error: string | null;
  errors: Record<string, string>;
}

/**
 * Wraps a POST/PATCH/DELETE call with loading + error state.
 *
 * @example
 *   const { submit, loading, error, errors } = useMutation(
 *     (data) => api.staff.create(data),
 *     { onSuccess: () => refetch() }
 *   );
 */
export function useMutation<TArgs, TResult = void>(
  mutator: (args: TArgs) => Promise<TResult>,
  options?: {
    onSuccess?: (result: TResult) => void;
    onError?: (err: ApiError | Error) => void;
  },
) {
  const [state, setState] = useState<MutationState>({ loading: false, error: null, errors: {} });

  const submit = useCallback(
    async (args: TArgs) => {
      setState({ loading: true, error: null, errors: {} });
      try {
        const result = await mutator(args);
        setState({ loading: false, error: null, errors: {} });
        options?.onSuccess?.(result);
        return result;
      } catch (err) {
        let msg = 'Something went wrong.';
        let fieldErrors: Record<string, string> = {};

        if (err instanceof ApiError) {
          msg = err.message;
          // Extract Zod validation errors if present
          const body = err.body as any;
          if (body?.errors && typeof body.errors === 'object') {
            fieldErrors = body.errors;
          }
          options?.onError?.(err);
        } else if (err instanceof Error) {
          msg = err.message;
          options?.onError?.(err);
        }

        setState({ loading: false, error: msg, errors: fieldErrors });
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutator],
  );

  return { submit, ...state };
}

// ── usePageTitle ──────────────────────────────────────────────────────────────

/** Sets the document title, cleaning up on unmount. */
export function usePageTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} · Wivae` : 'Wivae';
    return () => { document.title = prev; };
  }, [title]);
}

// ── useFlash ─────────────────────────────────────────────────────────────────

interface FlashState {
  message: string | null;
  type: 'success' | 'error';
}

/**
 * Simple flash message state — replaces Laravel's session flash.
 */
export function useFlash() {
  const [flash, setFlash] = useState<FlashState>({ message: null, type: 'success' });

  const showFlash = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setFlash({ message, type });
    setTimeout(() => setFlash({ message: null, type: 'success' }), 4000);
  }, []);

  return { flash, showFlash };
}
