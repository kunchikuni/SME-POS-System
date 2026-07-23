// Shared Inertia props (see AppServiceProvider@boot).

export interface BrandProps {
    name: string;
    tagline: string;
    tenantDomain: string;
}

export interface TenantProps {
    name: string;
    mode: "retail" | "restaurant";
    onTrial: boolean;
    trialEnd: string | null;
    openTaskCount?: number;
    theme: {
        primary?: string;
        accent?: string;
        foreground?: string;
        logo_url?: string | null;
        [key: string]: string | null | undefined;
    };
}

export interface AuthUser {
    name: string;
    role: "owner" | "manager" | "cashier" | "waiter";
}

export interface SharedProps {
    brand: BrandProps;
    tenant: TenantProps | null;
    auth: { user: AuthUser | null };
    [key: string]: unknown;
}
