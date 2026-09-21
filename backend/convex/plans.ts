/** Product plans and per-plan weighted-token quotas. */

export const PLANS = {
  proxy: {
    id: 'proxy',
    label: 'PROXY',
    weightedTokenLimit: 10_000_000,
  },
} as const;

export type PlanId = keyof typeof PLANS;

export const DEFAULT_PLAN_ID: PlanId = 'proxy';

/** Free tier: lifetime token pool (no monthly reset). */
export const FREE_PLAN_ID = 'free';
export const FREE_WEIGHTED_TOKEN_LIMIT = 50_000;

/** One-time free-tier boost for beta testers (lifetime pool, not monthly). */
export const BETA_TESTER_WEIGHTED_TOKEN_LIMIT = 100_000;

/**
 * How many States may be active/selected at once.
 * Paid (`null`) = unlimited. Library access is separate from activation.
 */
export const FREE_ACTIVE_STATE_LIMIT = 3;
export const BETA_ACTIVE_STATE_LIMIT = 5;

/**
 * Preferred official States to keep active first when migrating free users
 * off the old "forced three States" model. Not an access restriction.
 */
export const LEGACY_FREE_STATE_NAMES = ['Simplify', 'List', 'Critique'] as const;

/** @deprecated Use LEGACY_FREE_STATE_NAMES, kept for older clients. */
export const FREE_STATE_NAMES = LEGACY_FREE_STATE_NAMES;

export type FreeStateName = (typeof LEGACY_FREE_STATE_NAMES)[number];

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

export function isSubscriptionActive(status?: string | null): boolean {
  return Boolean(status && ACTIVE_SUBSCRIPTION_STATUSES.has(status));
}

/** @deprecated Access is no longer limited by name; prefer active-slot limits. */
export function isFreeStateName(name: string): boolean {
  const needle = name.trim().toLowerCase();
  return LEGACY_FREE_STATE_NAMES.some((n) => n.toLowerCase() === needle);
}

/** Quota for a plan. Free / unsubscribed → lifetime 30k. */
export function quotaForPlan(
  planId?: string | null,
  subscriptionActive = true,
): number {
  if (!subscriptionActive || !planId || planId === FREE_PLAN_ID) {
    return FREE_WEIGHTED_TOKEN_LIMIT;
  }
  if (planId in PLANS) {
    return PLANS[planId as PlanId].weightedTokenLimit;
  }
  return PLANS[DEFAULT_PLAN_ID].weightedTokenLimit;
}

export function resolvePlanId(
  plan?: string | null,
  subscriptionActive = false,
): string {
  if (!subscriptionActive) return FREE_PLAN_ID;
  return plan && plan in PLANS ? plan : DEFAULT_PLAN_ID;
}
