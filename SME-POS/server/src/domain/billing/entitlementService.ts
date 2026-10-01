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

import { maintenanceFeeCents, paysMaintenance } from './maintenance.js';
import { usd } from './pricing.js';

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

function isOnTrial(tenant: TenantForEntitlement, now: Date = new Date()): boolean {
  return (
    tenant.plan === 'trial' &&
    tenant.trialEndsAt !== null &&
    new Date(tenant.trialEndsAt) > now
  );
}

function activeSubscription(tenant: TenantForEntitlement, now: Date = new Date()) {
  const sub = tenant.subscription;
  if (!sub || sub.status !== 'active') return null;
  if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < now) return null;
  return sub;
}

/** Can the tenant use the product at all right now? */
export function hasAccess(tenant: TenantForEntitlement, now: Date = new Date()): boolean {
  if (isOnTrial(tenant, now)) return true;
  return activeSubscription(tenant, now) !== null;
}

/**
 * How long a till keeps syncing after the trial or subscription runs out. The
 * dashboard locks at once (it is where the owner pays), but a till is on a
 * counter with customers at it — and the owner may simply not have seen the
 * reminder yet — so it gets a runway before sync pauses.
 */
export const DEVICE_GRACE_DAYS = 3;

/**
 * Standard and Premium get far longer. They paid $200+ up front for hardware
 * they are using, and what they are late with is a small monthly maintenance fee: cutting their sync
 * after three days over that would be out of all proportion. Two weeks is time
 * to notice a missed email or text, be away, or wait for a payday.
 */
export const MAINTENANCE_GRACE_DAYS = 14;

/** How many days a till of a business on this plan keeps syncing after its period ends. */
export function deviceGraceDays(plan: string): number {
  return paysMaintenance(plan) ? MAINTENANCE_GRACE_DAYS : DEVICE_GRACE_DAYS;
}

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
  if (hasAccess(tenant, now)) return { state: 'active', graceEndsAt: null };
  const ended = accessEndedAt(tenant);
  if (!ended) return { state: 'lapsed', graceEndsAt: null };
  const graceEndsAt = new Date(ended.getTime() + deviceGraceDays(tenant.plan) * 24 * 60 * 60 * 1000);
  return { state: graceEndsAt > now ? 'grace' : 'lapsed', graceEndsAt };
}

export type AccessSummary = {
  /** The dashboard is shut: no trial running and no paid period in force. */
  blocked: boolean;
  /** For the till: see accessState(). Surfaced so the dashboard can tell the owner their tills are still selling. */
  state: AccessState['state'];
  graceEndsAt: Date | null;
  /** What runs out: the free trial, BYOD's monthly period, or Standard/Premium's maintenance month. */
  kind: 'trial' | 'monthly' | 'maintenance';
  /** When the trial or paid period ends (ended, if blocked). null = no end date on record. */
  endsAt: Date | null;
  /** Whole days left while access is open; null once it has ended or when there is no end date. */
  daysLeft: number | null;
  /** The upkeep fee, for plans that pay one. */
  maintenanceFeeCents: number | null;
  /** Which gated features the plan includes — the dashboard locks the rest in its menu. */
  features: { aiInsights: boolean; payroll: boolean; fiscalisation: boolean };
};

/** Everything the dashboard needs to explain a payment block, a countdown, or a locked menu item. */
export function accessSummary(tenant: TenantForEntitlement, now: Date = new Date()): AccessSummary {
  const access = accessState(tenant, now);
  const kind = tenant.plan === 'trial' ? 'trial' : paysMaintenance(tenant.plan) ? 'maintenance' : 'monthly';
  const endsAt = accessEndedAt(tenant);
  const blocked = !hasAccess(tenant, now);
  return {
    blocked,
    state: access.state,
    graceEndsAt: access.graceEndsAt,
    kind,
    endsAt,
    daysLeft: !blocked && endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000)) : null,
    maintenanceFeeCents: kind === 'maintenance' ? maintenanceFeeCents(tenant.plan) : null,
    features: {
      aiInsights: hasFeature(tenant, 'ai insights', now),
      payroll: hasFeature(tenant, 'payroll', now),
      fiscalisation: hasFeature(tenant, 'fiscalisation', now),
    },
  };
}

/** What a blocked dashboard is told: a message that matches why it is blocked, and a stable reason code. */
export function blockedNotice(tenant: TenantForEntitlement): {
  message: string;
  reason: 'trial_ended' | 'maintenance_due' | 'subscription_ended';
} {
  const { kind, endsAt, maintenanceFeeCents: fee } = accessSummary(tenant);
  if (kind === 'trial') {
    return { reason: 'trial_ended', message: 'Your trial has ended. Choose a plan to keep using Wivae.' };
  }
  if (kind === 'maintenance' && endsAt) {
    return {
      reason: 'maintenance_due',
      message: `Your monthly maintenance${fee ? ` (${usd(fee)})` : ''} is overdue. Pay it to keep using Wivae.`,
    };
  }
  return { reason: 'subscription_ended', message: 'Your subscription has ended. Renew to keep using Wivae.' };
}

/** Effective plan key for feature/limit checks */
export function planKey(tenant: TenantForEntitlement, now: Date = new Date()): string {
  if (isOnTrial(tenant, now)) return 'premium';
  return tenant.plan;
}

/** Does the tenant's plan include a named feature? */
export function hasFeature(tenant: TenantForEntitlement, feature: string, now: Date = new Date()): boolean {
  if (feature.toLowerCase() === 'fiscalisation') {
    const sub = activeSubscription(tenant, now);
    return isOnTrial(tenant, now) || planKey(tenant, now) === 'premium' || (sub?.zimraAddon ?? false);
  }

  const plan = PLANS[planKey(tenant, now)];
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
