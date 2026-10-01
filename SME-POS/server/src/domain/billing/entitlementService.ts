/**
 * Plan entitlement service — port of EntitlementService.php
 *
 * Single place that answers "is this tenant allowed to use X?"
 * Mirrors the exact logic from the PHP version:
 *   - Trial tenants get full (Premium-equivalent) access
 *   - hasAccess() = trial OR active subscription
 *   - hasFeature() = substring match against plan feature strings
 *   - 'fiscalisation' is a special case: Premium OR zimra_addon
 */

export type TenantForEntitlement = {
  plan: string;
  trialEndsAt: Date | null;
  subscription?: {
    status: string;
    zimraAddon: boolean;
    currentPeriodEnd: Date | null;
  } | null;
};

/** Plan feature config — mirrors config/paynow.php plans array */
const PLANS: Record<string, { features: string[]; branches: number | null }> = {
  byod: {
    features: ['Unlimited products', 'Offline POS'],
    branches: 1,
  },
  standard: {
    features: ['Unlimited products', 'Offline POS', 'Multiple branches', 'Analytics', 'AI insights'],
    branches: 3,
  },
  pro: {
    features: [
      'Unlimited products',
      'Offline POS',
      'Multiple branches',
      'Analytics',
      'Payroll & HR',
      'AI insights',
      'Fiscalisation',
    ],
    branches: null, // unlimited
  },
  premium: {
    features: [
      'Unlimited products',
      'Offline POS',
      'Multiple branches',
      'Analytics',
      'Payroll & HR',
      'AI insights',
      'Fiscalisation',
    ],
    branches: null,
  },
};

function isOnTrial(tenant: TenantForEntitlement): boolean {
  return (
    tenant.plan === 'trial' &&
    tenant.trialEndsAt !== null &&
    new Date(tenant.trialEndsAt) > new Date()
  );
}

function activeSubscription(tenant: TenantForEntitlement) {
  const sub = tenant.subscription;
  if (!sub || sub.status !== 'active') return null;
  if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < new Date()) return null;
  return sub;
}

/** Can the tenant use the product at all right now? */
export function hasAccess(tenant: TenantForEntitlement): boolean {
  if (isOnTrial(tenant)) return true;
  return activeSubscription(tenant) !== null;
}

/**
 * How long a till keeps syncing after the trial or subscription runs out. The
 * dashboard locks at once (it is where the owner pays), but a till is on a
 * counter with customers at it — and the owner may simply not have seen the
 * reminder yet — so it gets a short runway before sync pauses.
 */
export const DEVICE_GRACE_DAYS = 3;

export type AccessState = {
  /** active = paid or on trial · grace = just ended, tills still sync · lapsed = tills paused */
  state: 'active' | 'grace' | 'lapsed';
  /** When the grace period ends (or ended). null when there was no end date to count from. */
  graceEndsAt: Date | null;
};

/** When did the tenant's trial or paid period end? null = no end date on record. */
function accessEndedAt(tenant: TenantForEntitlement): Date | null {
  if (tenant.plan === 'trial') return tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : null;
  // The caller loads the latest status='active' subscription; a lapsed monthly one keeps its past end date.
  return tenant.subscription?.currentPeriodEnd ? new Date(tenant.subscription.currentPeriodEnd) : null;
}

/** Where a tenant stands for the TILL: fully active, in its grace period, or paused. */
export function accessState(tenant: TenantForEntitlement, now: Date = new Date()): AccessState {
  if (hasAccess(tenant)) return { state: 'active', graceEndsAt: null };
  const ended = accessEndedAt(tenant);
  if (!ended) return { state: 'lapsed', graceEndsAt: null };
  const graceEndsAt = new Date(ended.getTime() + DEVICE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  return { state: graceEndsAt > now ? 'grace' : 'lapsed', graceEndsAt };
}

/** Effective plan key for feature/limit checks */
export function planKey(tenant: TenantForEntitlement): string {
  if (isOnTrial(tenant)) return 'premium';
  return tenant.plan;
}

/** Does the tenant's plan include a named feature? */
export function hasFeature(tenant: TenantForEntitlement, feature: string): boolean {
  if (feature.toLowerCase() === 'fiscalisation') {
    const sub = activeSubscription(tenant);
    return isOnTrial(tenant) || planKey(tenant) === 'premium' || (sub?.zimraAddon ?? false);
  }

  const plan = PLANS[planKey(tenant)];
  return (plan?.features ?? []).some((line) =>
    line.toLowerCase().includes(feature.toLowerCase()),
  );
}

/** null = unlimited */
export function branchLimit(tenant: TenantForEntitlement): number | null {
  if (isOnTrial(tenant)) return null;
  return PLANS[planKey(tenant)]?.branches ?? 1;
}

export function canAddBranch(tenant: TenantForEntitlement, currentCount: number): boolean {
  const limit = branchLimit(tenant);
  return limit === null || currentCount < limit;
}
