// Shared Inertia props (see AppServiceProvider@boot).

export interface BrandProps {
  name: string;
  tagline: string;
}

export interface TenantProps {
  name: string;
  onTrial: boolean;
  trialEnd: string | null;
  theme: Record<string, string>;
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
