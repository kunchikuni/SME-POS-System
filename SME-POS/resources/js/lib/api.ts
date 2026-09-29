/**
 * Wivae API client — typed fetch wrapper for the Node.js REST API.
 *
 * Provides the same data shapes as Inertia shared props so React pages
 * can be switched one-by-one with zero visual changes.
 *
 * Usage:
 *   import { api } from '@/lib/api';
 *   const products = await api.products.list({ q: 'coffee' });
 */

// ── Base ────────────────────────────────────────────────────────────────────

// Every JSON route on the server lives under /api (see server/src/index.ts's
// docblock for why: it used to share paths 1:1 with the SPA's own routes,
// which meant any hard navigation — refresh, typed URL, bookmark — hit the
// API directly and rendered raw JSON instead of the app shell). Defaulting
// to '/api' here is what makes every relative path below resolve correctly
// against the new server mount without editing each one individually.
//
// If VITE_API_URL is set (e.g. a separate-origin deployment), it must now
// include the /api suffix itself, e.g. https://api.wivae.com/api.
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
        public body?: unknown,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestInit,
): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        method,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        ...options,
    });

    if (!res.ok) {
        let errorBody: unknown;
        try { errorBody = await res.json(); } catch {}
        throw new ApiError(res.status, (errorBody as any)?.message ?? res.statusText, errorBody);
    }

    if (res.status === 204) return undefined as T;

    return res.json() as Promise<T>;
}

async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            // Deliberately NOT setting Content-Type: the browser sets it itself
            // for FormData, including the multipart boundary — setting it
            // manually here would omit the boundary and break the upload.
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: formData,
    });

    if (!res.ok) {
        let errorBody: unknown;
        try { errorBody = await res.json(); } catch {}
        throw new ApiError(res.status, (errorBody as any)?.message ?? res.statusText, errorBody);
    }

    return res.json() as Promise<T>;
}

const get  = <T>(path: string, params?: Record<string, string>) =>
    request<T>('GET', params ? `${path}?${new URLSearchParams(params)}` : path);
const post   = <T>(path: string, body?: unknown) => request<T>('POST', path, body);
const patch  = <T>(path: string, body?: unknown) => request<T>('PATCH', path, body);
const del    = <T>(path: string)                 => request<T>('DELETE', path);

// ── Typed shapes ─────────────────────────────────────────────────────────────

export interface ProductListItem {
    id: string;
    name: string;
    brand: string | null;
    sku: string;
    barcode: string | null;
    priceCents: number;
    category: string | null;
    /** Live branches only; just the selected branch when filtered. */
    onHand: number;
    byBranch: { branchId: string; branch: string; qty: number }[];
    tracked: boolean;
    lowStock: boolean;
}

export interface TransactionRow {
    id: string;
    method: string;
    amountCents: number;
    receivedCents: number | null;
    sale: {
        occurredAt: string;
        status: string;
        branch: { name: string } | null;
        cashier: { name: string } | null;
        customer: { name: string } | null;
    } | null;
}

export interface CreditCustomer {
    id: string;
    name: string;
    phone: string | null;
    /** What they owe; negative = overpaid. */
    balanceCents: number;
}

export interface CustomerStatementEntry {
    kind: 'sale' | 'payment';
    id: string;
    at: string;
    branch: string;
    amountCents: number;
    note: string;
    /** Sales only. */
    status?: string;
    /** Sales only: what was taken, at the name/price captured at the till. */
    items?: { name: string; qty: number; unitPriceCents: number; lineTotalCents: number }[];
}

/** One product's total across a customer's (non-voided) credit sales. */
export interface CustomerProductTotal {
    name: string;
    qty: number;
    totalCents: number;
}

export interface StaffMember {
    id: string;
    name: string;
    email: string | null;
    role: string;
    branch: string | null;
    branchId: string | null;
    hasPin: boolean;
    dashboard: boolean;
    deletedAt: string | null;
}

export interface Branch {
    id: string;
    name: string;
    address: string | null;
    isDefault: boolean;
    isActive: boolean;
    mode: string;
    branchId?: string | null;
}

export interface Device {
    id: string;
    name: string;
    branch: string;
    lastSeenAt: string | null;
}

export interface Task {
    id: string;
    title: string;
    notes: string | null;
    status: string;
    dueAt: string | null;
    assignedTo: string | null;
    assignee?: { name: string } | null;
    creator?: { name: string } | null;
}

export interface KitchenOrder {
    id: string;
    status: string;
    ticketNo: number | null;
    placedAt: string;
    readyAt: string | null;
    table?: { name: string } | null;
    sale: {
        lines: { qty: number; name: string; unitPriceCents: number; product: { name: string } | null }[];
    };
}

export interface DashboardSummary {
    today: { totalCents: number; count: number };
    month: { totalCents: number; count: number };
    products: number;
    lowStock: number;
    openTasks: number;
}

export interface CredentialReveal {
    name: string;
    kind: 'password' | 'pin';
    value: string;
}

export interface OrderRow {
    id: string;
    occurredAt: string;
    totalCents: number;
    status: string;
    cashier?: { name: string } | null;
    branch?: { name: string } | null;
    /** Set on credit sales. */
    customer?: { name: string } | null;
    lines: { qty: number; name: string; unitPriceCents: number }[];
    payments: { method: string; amountCents: number }[];
    voidRequest: {
        id: string;
        status: string;
        reason: string;
        requestedByName: string;
        createdAt: string;
    } | null;
}

export interface PendingVoidRequest {
    id: string;
    reason: string;
    createdAt: string;
    requestedByName: string;
    sale: { id: string; totalCents: number; occurredAt: string; status: string } | null;
}

// ── API modules ───────────────────────────────────────────────────────────────

export const api = {
    auth: {
        login: (email: string, password: string) =>
            post<{ user: { id: string; name: string; role: string } }>('/login', { email, password }),
        logout: () => post<void>('/logout'),
        /** Trade registration's one-time hand-off token for a session on this workspace. */
        welcome: (token: string) =>
            post<{ user: { id: string; name: string; role: string } }>('/welcome', { token }),
    },

    onboarding: {
        status: () =>
            get<{
                mode: string;
                /** The kind of business (Pharmacy, Bottle store…) — drives the example products. */
                businessType: { key: string; label: string };
                steps: { products: boolean; till: boolean; sale: boolean };
                counts: { products: number; devices: number; sales: number };
            }>('/onboarding'),
        loadStarterProducts: () => post<{ message: string; count: number }>('/onboarding/starter-products'),
        /** Creates a device for this browser; the token is used once to open the till paired. */
        createTill: () => post<{ id: string; name: string; branch: string; token: string }>('/onboarding/till'),
    },

    dashboard: {
        summary: () => get<DashboardSummary>('/dashboard'),
    },

    products: {
        list: (params?: { q?: string; page?: string; branchId?: string }) =>
            get<{
                data: ProductListItem[]; total: number; page: number; perPage: number;
                /** Live branches, default first. */
                branches: { id: string; name: string }[];
                filters: { q: string; branchId: string | null };
            }>(
                '/products',
                params as Record<string, string> | undefined,
            ),
        formData: () => get<{ categories: { id: string; name: string }[] }>('/products/form-data'),
        create: (data: Record<string, unknown>) => post<{ id: string; sku: string; message: string }>('/products', data),
        delete: (id: string) => del<{ message: string }>(`/products/${id}`),
        restock: (id: string, qty: number, branchId?: string) =>
            post<{ message: string }>(`/products/${id}/restock`, { qty, branchId }),
        /** Stock take: set a branch's level to what was physically counted. */
        count: (id: string, counted: number, branchId?: string) =>
            post<{ message: string; before: number; counted: number; delta: number }>(`/products/${id}/count`, { counted, branchId }),
        export: () => `${BASE_URL}/products/export`,
        importTemplate: () => `${BASE_URL}/products/import/template`,
        import: (file: File) => {
            const formData = new FormData();
            formData.append('file', file);
            return uploadFile<{ message: string; created: number; updated: number; skipped: number }>('/products/import', formData);
        },
        barcodes: () => get<{ products: { id: string; name: string; sku: string; code: string; price: string }[] }>('/products/barcodes'),
    },

    categories: {
        list: () => get<{ categories: { id: string; name: string; products_count: number }[] }>('/categories'),
        create: (name: string) => post<{ id: string; name: string }>('/categories', { name }),
        delete: (id: string) => del<{ message: string }>(`/categories/${id}`),
        /** Ready-made categories for this kind of business that aren't added yet. */
        suggestions: () => get<{ businessType: string; suggestions: string[] }>('/categories/suggestions'),
        /** Adds the named suggestions, or all of them when `names` is omitted. */
        addSuggestions: (names?: string[]) =>
            post<{ added: string[]; message: string }>('/categories/suggestions', names ? { names } : {}),
    },

    staff: {
        list: () => get<{ staff: StaffMember[]; branches: { id: string; name: string }[] }>('/staff'),
        create: (data: Record<string, unknown>) =>
            post<{ staffCredential: CredentialReveal; message: string }>('/staff', data),
        update: (id: string, data: Record<string, unknown>) =>
            patch<{ message: string }>(`/staff/${id}`, data),
        delete: (id: string) => del<{ message: string }>(`/staff/${id}`),
        restore: (id: string) => post<{ message: string }>(`/staff/${id}/restore`),
        resetPin: (id: string) => post<{ staffCredential: CredentialReveal; message: string }>(`/staff/${id}/reset-pin`),
        resetPassword: (id: string) =>
            post<{ staffCredential: CredentialReveal; message: string }>(`/staff/${id}/reset-password`),
    },

    customers: {
        list: (q?: string) =>
            get<{ customers: CreditCustomer[]; totalOwedCents: number }>('/customers', q ? { q } : undefined),
        show: (id: string) =>
            get<{ customer: CreditCustomer; entries: CustomerStatementEntry[]; products: CustomerProductTotal[] }>(`/customers/${id}`),
        recordPayment: (id: string, data: { amountCents: number; method: string; branchId?: string }) =>
            post<{ message: string; balanceCents: number }>(`/customers/${id}/payments`, data),
        update: (id: string, data: { name?: string; phone?: string | null }) =>
            patch<CreditCustomer>(`/customers/${id}`, data),
        delete: (id: string) => del<{ message: string }>(`/customers/${id}`),
    },

    branches: {
        list: () => get<{ branches: Branch[] }>('/branches'),
        create: (data: Record<string, unknown>) => post<Branch>('/branches', data),
        update: (id: string, data: Record<string, unknown>) => patch<Branch>(`/branches/${id}`, data),
        delete: (id: string) => del<{ message: string }>(`/branches/${id}`),
    },

    devices: {
        list: () => get<{ devices: Device[]; branches: { id: string; name: string }[] }>('/devices'),
        create: (data: { name: string; branchId: string }) =>
            post<{ id: string; name: string; token: string }>('/devices', data),
        delete: (id: string) => del<{ message: string }>(`/devices/${id}`),
    },

    tasks: {
        list: () => get<{ tasks: Task[] }>('/tasks'),
        create: (data: Record<string, unknown>) => post<Task>('/tasks', data),
        update: (id: string, data: Record<string, unknown>) => patch<Task>(`/tasks/${id}`, data),
        complete: (id: string) => post<Task>(`/tasks/${id}/complete`),
        reopen: (id: string) => post<Task>(`/tasks/${id}/reopen`),
        delete: (id: string) => del<{ message: string }>(`/tasks/${id}`),
    },

    kitchen: {
        list: () => get<{ orders: KitchenOrder[] }>('/kitchen'),
        updateStatus: (id: string, status: string) => patch<KitchenOrder>(`/kitchen/${id}`, { status }),
    },

    orders: {
        /** With `date` (YYYY-MM-DD or "today", business local time): that day's sales + the whole day's summary. */
        list: (params: { page?: number; date?: string; branchId?: string } = {}) =>
            get<{
                sales: OrderRow[]; total: number; page: number; perPage: number;
                /** The day shown (resolved from "today"), or null for all days. */
                date: string | null;
                /** Today in the business's timezone. */
                today: string;
                summary: {
                    sales: number;
                    takingsCents: number;
                    voided: number;
                    byMethod: { method: string; amountCents: number }[];
                } | null;
            }>('/orders', {
                ...(params.page ? { page: String(params.page) } : {}),
                ...(params.date ? { date: params.date } : {}),
                ...(params.branchId ? { branchId: params.branchId } : {}),
            }),
        requestVoid: (saleId: string, reason: string) =>
            post<{ id: string; message: string }>(`/orders/${saleId}/void-request`, { reason }),
        pendingVoids: () => get<{ requests: PendingVoidRequest[] }>('/orders/void-requests'),
        approveVoid: (id: string) => post<{ message: string }>(`/orders/void-requests/${id}/approve`),
        rejectVoid: (id: string) => post<{ message: string }>(`/orders/void-requests/${id}/reject`),
    },

    analytics: {
        overview: (range?: number) =>
            get<{
                salesByDay: unknown[];
                topProducts: unknown[];
                paymentMethods: unknown[];
                branchPerformance: unknown[];
                range: number;
            }>('/analytics', range ? { range: String(range) } : undefined),
    },

    transactions: {
        /** With `date` (YYYY-MM-DD or "today", business local time): that day's payments + per-method totals. */
        list: (params: { page?: number; date?: string; branchId?: string } = {}) =>
            get<{
                payments: TransactionRow[]; total: number; page: number; perPage: number;
                /** Per-method totals over completed sales (voided sales excluded). */
                summary: { method: string; _sum: { amountCents: number | null }; _count: number }[];
                date: string | null;
                today: string;
            }>('/transactions', {
                ...(params.page ? { page: String(params.page) } : {}),
                ...(params.date ? { date: params.date } : {}),
                ...(params.branchId ? { branchId: params.branchId } : {}),
            }),
    },

    settings: {
        getGeneral: () => get<{ currency: string; taxRateBps: number }>('/settings/general'),
        saveGeneral: (data: Record<string, unknown>) => patch<{ message: string }>('/settings/general', data),
        getAccount: () => get<{ name: string; email: string }>('/settings/account'),
        changePassword: (data: Record<string, unknown>) =>
            patch<{ message: string }>('/settings/account/password', data),
        getBranding: () => get<{ branding: unknown }>('/settings/branding'),
        saveBranding: (data: Record<string, unknown>) =>
            patch<{ message: string; branding: unknown }>('/settings/branding', data),
    },

    billing: {
        get: () => get<{
            subscription: unknown; plan: string; trialEndsAt: string | null;
            /** The plans the server actually charges for — the page renders these, never its own list. */
            plans: { key: string; label: string; amountCents: number; recurring: boolean; branches: number | null; features: string[] }[];
        }>('/billing/payments'),
        /** Starts a Paynow payment for the plan; the server prices it. */
        subscribe: (plan: string) => post<{ redirectUrl: string }>('/billing/payments/subscribe', { plan }),
    },

    fiscalisation: {
        get: () => get<{ device: unknown; zimraEnabled: boolean }>('/settings/fiscalisation'),
        toggle: () => patch<{ zimraEnabled: boolean }>('/settings/fiscalisation/toggle'),
        saveDevice: (data: Record<string, unknown>) => post<unknown>('/settings/fiscalisation/device', data),
        verify: () => post<unknown>('/settings/fiscalisation/verify'),
    },

    payroll: {
        list: () =>
            get<{ runs: unknown[]; staff: unknown[]; nssaRateBps: number; nssaCeilingCents: number }>('/payroll'),
        run: (periodMonth: string) => post<{ message: string; runId: string }>('/payroll/run', { periodMonth }),
        setSalary: (userId: string, monthlySalaryCents: number | null) =>
            patch<{ message: string }>(`/payroll/staff/${userId}/salary`, { monthlySalaryCents }),
        saveNssa: (data: { nssaRateBps: number; nssaCeilingCents: number }) =>
            patch<{ message: string }>('/payroll/nssa', data),
    },

    aiInsights: {
        get: () => get<{ deadStock: unknown[]; lowMargin: unknown[] }>('/ai-insights'),
    },

    enquiries: {
        submit: (data: Record<string, unknown>) => post<{ message: string }>('/enquire', data),
    },
};

export { ApiError };
export type { ApiError as TApiError };
