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
export const FREE_WEIGHTED_TOKEN_LIMIT = 30_000;

/**
 * Free accounts may only use these official states.
 * Creating / publishing states requires an active subscription.
 */
export const FREE_STATE_NAMES = ['Simplify', 'List', 'Critique'] as const;

export type FreeStateName = (typeof FREE_STATE_NAMES)[number];

export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

export function isSubscriptionActive(status?: string | null): boolean {
  return Boolean(status && ACTIVE_SUBSCRIPTION_STATUSES.has(status));
}

export function isFreeStateName(name: string): boolean {
  const needle = name.trim().toLowerCase();
  return FREE_STATE_NAMES.some((n) => n.toLowerCase() === needle);
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
