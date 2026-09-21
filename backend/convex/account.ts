import { action, query } from './_generated/server';
import { v } from 'convex/values';
import { api, internal } from './_generated/api';
import {
  DEFAULT_PLAN_ID,
  FREE_WEIGHTED_TOKEN_LIMIT,
  isSubscriptionActive,
  quotaForPlan,
  resolvePlanId,
} from './plans';
import { freeUserPassesSignupGate } from './signupRateLimit';
import { resolveStateEntitlements } from './entitlements';

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

function periodExpired(usagePeriodStart: number, now: number): boolean {
  return now - usagePeriodStart >= PERIOD_MS;
}

type SubRow = {
  workosId?: string;
  email?: string;
  status: string;
  plan?: string;
  currentPeriodEnd?: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
};

async function findSubscriptionForIdentity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
  email?: string | null,
): Promise<SubRow | null> {
  const byWorkos = await ctx.db
    .query('subscriptions')
    .withIndex('by_workos_id', (q: any) => q.eq('workosId', workosId))
    .first();
  if (byWorkos) return byWorkos;

  if (!email) return null;
  return await ctx.db
    .query('subscriptions')
    .withIndex('by_email', (q: any) => q.eq('email', email))
    .first();
}

/**
 * Single account snapshot for clients (desktop, web chat).
 * Commerce happens on the website; the app only reads this.
 */
export const getMyAccount = query({
  args: {},
  returns: v.union(
    v.object({
      email: v.optional(v.string()),
      subscriptionActive: v.boolean(),
      status: v.string(),
      plan: v.union(v.string(), v.null()),
      currentPeriodEnd: v.optional(v.number()),
      weightedTokensUsed: v.number(),
      weightedTokenLimit: v.number(),
      remaining: v.number(),
      canUseAI: v.boolean(),
      blockReason: v.union(
        v.literal('usage_limit_reached'),
        v.literal('signup_rate_limited'),
        v.null(),
      ),
      canCreateStates: v.boolean(),
      canPublishStates: v.boolean(),
      /** @deprecated Always empty; active slots replace forced free States. */
      freeStateNames: v.array(v.string()),
      activeStateCount: v.number(),
      activeStateLimit: v.union(v.number(), v.null()),
      stateTier: v.union(v.literal('free'), v.literal('beta'), v.literal('paid')),
      websiteUrl: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const workosId = identity.subject;
    const email = identity.email ?? undefined;
    const now = Date.now();
    const websiteUrl = (
      process.env.PROXY_WEBSITE_URL || 'http://localhost:5173'
    ).replace(/\/$/, '');

    const sub = await findSubscriptionForIdentity(ctx, workosId, email);

    const usageRow = await ctx.db
      .query('usage')
      .withIndex('by_workos_id', (q) => q.eq('workosId', workosId))
      .first();

    const subscriptionActive = isSubscriptionActive(sub?.status);
    const plan = resolvePlanId(sub?.plan, subscriptionActive);
    const defaultLimit = quotaForPlan(plan, subscriptionActive);

    let weightedTokensUsed = 0;
    let weightedTokenLimit = defaultLimit;

    if (usageRow) {
      if (subscriptionActive && periodExpired(usageRow.usagePeriodStart, now)) {
        weightedTokensUsed = 0;
        weightedTokenLimit = usageRow.weightedTokenLimit || defaultLimit;
      } else {
        weightedTokensUsed = usageRow.weightedTokensUsed;
        weightedTokenLimit = subscriptionActive
          ? usageRow.weightedTokenLimit || defaultLimit
          : Math.max(
              usageRow.weightedTokenLimit || FREE_WEIGHTED_TOKEN_LIMIT,
              FREE_WEIGHTED_TOKEN_LIMIT,
            );
      }
    }

    const remaining = Math.max(0, weightedTokenLimit - weightedTokensUsed);
    const signupOk =
      subscriptionActive || (await freeUserPassesSignupGate(ctx, workosId));
    const canUseAI = remaining > 0 && signupOk;
    const blockReason = canUseAI
      ? null
      : !signupOk
        ? ('signup_rate_limited' as const)
        : ('usage_limit_reached' as const);

    const entitlements = await resolveStateEntitlements(ctx, workosId);
    const memberships = await ctx.db
      .query('userStates')
      .withIndex('by_workos_id', (q) => q.eq('workosId', workosId))
      .collect();
    const activeStateCount = memberships.filter(
      (r) => r.stateId && r.isActive === true,
    ).length;

    return {
      email: identity.email,
      subscriptionActive,
      status: sub?.status ?? 'none',
      plan,
      currentPeriodEnd: sub?.currentPeriodEnd,
      weightedTokensUsed,
      weightedTokenLimit,
      remaining,
      canUseAI,
      blockReason,
      canCreateStates: entitlements.canCreateStates,
      canPublishStates: entitlements.canPublishStates,
      freeStateNames: [] as string[],
      activeStateCount,
      activeStateLimit: entitlements.activeLimit,
      stateTier: entitlements.tier,
      websiteUrl,
    };
  },
});

/**
 * Pull the latest Stripe subscription status into Convex and link workosId.
 * Used by "I already subscribed (retry)" when webhooks left the row on pending.
 */
export const syncMySubscription = action({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    status: v.string(),
    subscriptionActive: v.boolean(),
    message: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<{
    ok: boolean;
    status: string;
    subscriptionActive: boolean;
    message?: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        ok: false,
        status: 'none',
        subscriptionActive: false,
        message: 'Not authenticated',
      };
    }

    const workosId = identity.subject;
    let email: string | undefined = identity.email;
    if (!email) {
      const user = await ctx.runQuery(api.users.getUserByWorkosId, { workosId });
      email = user?.email;
    }

    let sub:
      | {
          status: string;
          plan?: string;
          email?: string;
          priceId?: string;
          stripeCustomerId?: string;
          stripeSubscriptionId?: string;
          currentPeriodEnd?: number;
        }
      | null = await ctx.runQuery(api.subscriptions.getByWorkosId, { workosId });
    if (!sub && email) {
      sub = await ctx.runQuery(api.subscriptions.getByEmail, { email });
    }

    if (!sub) {
      return {
        ok: false,
        status: 'none',
        subscriptionActive: false,
        message: 'No subscription record found for this account',
      };
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return {
        ok: false,
        status: sub.status,
        subscriptionActive: isSubscriptionActive(sub.status),
        message: 'STRIPE_SECRET_KEY not configured',
      };
    }

    let stripeSub: any = null;
    try {
      if (sub.stripeSubscriptionId) {
        const resp = await fetch(
          `https://api.stripe.com/v1/subscriptions/${sub.stripeSubscriptionId}`,
          { headers: { Authorization: `Bearer ${stripeKey}` } },
        );
        stripeSub = await resp.json();
        if (!resp.ok) {
          throw new Error(stripeSub?.error?.message || `Stripe ${resp.status}`);
        }
      } else if (sub.stripeCustomerId) {
        const resp = await fetch(
          `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(
            sub.stripeCustomerId,
          )}&status=all&limit=1`,
          { headers: { Authorization: `Bearer ${stripeKey}` } },
        );
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data?.error?.message || `Stripe ${resp.status}`);
        }
        stripeSub = data?.data?.[0] ?? null;
      }
    } catch (e) {
      return {
        ok: false,
        status: sub.status,
        subscriptionActive: isSubscriptionActive(sub.status),
        message: e instanceof Error ? e.message : 'Failed to reach Stripe',
      };
    }

    if (!stripeSub || typeof stripeSub.status !== 'string') {
      return {
        ok: false,
        status: sub.status,
        subscriptionActive: isSubscriptionActive(sub.status),
        message: 'No Stripe subscription found for this customer',
      };
    }

    const status = stripeSub.status as string;
    const plan = stripeSub?.metadata?.plan || sub.plan || DEFAULT_PLAN_ID;
    const currentPeriodEnd =
      typeof stripeSub.current_period_end === 'number'
        ? stripeSub.current_period_end * 1000
        : undefined;
    const priceId = stripeSub?.items?.data?.[0]?.price?.id || sub.priceId;
    const stripeCustomerId =
      typeof stripeSub.customer === 'string'
        ? stripeSub.customer
        : sub.stripeCustomerId;
    const stripeSubscriptionId = stripeSub.id || sub.stripeSubscriptionId;

    await ctx.runMutation(api.subscriptions.upsertByWorkosId, {
      workosId,
      email: email ?? sub.email,
      status,
      plan,
      stripeCustomerId,
      stripeSubscriptionId,
      currentPeriodEnd,
      priceId,
    });
    await ctx.runMutation(internal.billing.syncEntitlements, {
      workosId,
      status,
      plan,
    });

    return {
      ok: isSubscriptionActive(status),
      status,
      subscriptionActive: isSubscriptionActive(status),
      message: isSubscriptionActive(status)
        ? undefined
        : `Stripe subscription status is "${status}"`,
    };
  },
});
