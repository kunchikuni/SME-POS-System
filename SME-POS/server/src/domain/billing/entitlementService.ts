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
    features: ['Unlimited products', 'Offline POS', 'Multiple branches', 'Analytics'],
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

/** Effective plan key for feature/limit checks */
export function planKey(tenant: TenantForEntitlement): string {
  const sub = activeSubscription(tenant);
  return sub ? tenant.plan : 'premium'; // trial → premium-equivalent
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
