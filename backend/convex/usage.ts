import { internalMutation, internalQuery, query } from './_generated/server';
import { v } from 'convex/values';
import {
  DEFAULT_PLAN_ID,
  FREE_PLAN_ID,
  FREE_WEIGHTED_TOKEN_LIMIT,
  isSubscriptionActive,
  quotaForPlan,
} from './plans';
import { freeUserPassesSignupGate } from './signupRateLimit';

/** Paid monthly weighted-token allowance (~10M). */
export const DEFAULT_WEIGHTED_TOKEN_LIMIT = quotaForPlan(DEFAULT_PLAN_ID, true);

/** Billing period length for paid plans: 30 days. Free is lifetime (never resets). */
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

function periodExpired(usagePeriodStart: number, now: number): boolean {
  return now - usagePeriodStart >= PERIOD_MS;
}

async function findSubscription(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
) {
  let sub = await ctx.db
    .query('subscriptions')
    .withIndex('by_workos_id', (q: any) => q.eq('workosId', workosId))
    .first();

  if (!sub) {
    const user = await ctx.db
      .query('users')
      .withIndex('by_workos_id', (q: any) => q.eq('workosId', workosId))
      .first();
    if (user?.email) {
      sub = await ctx.db
        .query('subscriptions')
        .withIndex('by_email', (q: any) => q.eq('email', user.email))
        .first();
    }
  }
  return sub;
}

function snapshotFromRow(
  row: {
    usagePeriodStart: number;
    weightedTokensUsed: number;
    weightedTokenLimit: number;
  } | null,
  now: number,
  subscriptionActive: boolean,
) {
  const defaultLimit = quotaForPlan(
    subscriptionActive ? DEFAULT_PLAN_ID : FREE_PLAN_ID,
    subscriptionActive,
  );

  if (!row) {
    return {
      weightedTokensUsed: 0,
      weightedTokenLimit: defaultLimit,
      usagePeriodStart: now,
    };
  }

  // Free / lapsed: lifetime pool — never reset.
  if (!subscriptionActive) {
    return {
      weightedTokensUsed: row.weightedTokensUsed,
      weightedTokenLimit: Math.min(
        row.weightedTokenLimit || FREE_WEIGHTED_TOKEN_LIMIT,
        FREE_WEIGHTED_TOKEN_LIMIT,
      ),
      usagePeriodStart: row.usagePeriodStart,
    };
  }

  // Paid: rolling 30-day period.
  if (periodExpired(row.usagePeriodStart, now)) {
    return {
      weightedTokensUsed: 0,
      weightedTokenLimit: row.weightedTokenLimit || defaultLimit,
      usagePeriodStart: now,
    };
  }

  return {
    weightedTokensUsed: row.weightedTokensUsed,
    weightedTokenLimit: row.weightedTokenLimit || defaultLimit,
    usagePeriodStart: row.usagePeriodStart,
  };
}

/**
 * Gate before calling the model: free users get a lifetime 30k pool;
 * subscribers get a monthly quota. Both need remaining tokens > 0.
 */
export const assertCanUseAI = internalQuery({
  args: { workosId: v.string() },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      weightedTokensUsed: v.number(),
      weightedTokenLimit: v.number(),
      usagePeriodStart: v.number(),
      subscriptionActive: v.boolean(),
      plan: v.string(),
    }),
    v.object({
      ok: v.literal(false),
      reason: v.string(),
      code: v.union(
        v.literal('subscription_required'),
        v.literal('usage_limit_reached'),
        v.literal('signup_rate_limited'),
      ),
      weightedTokensUsed: v.number(),
      weightedTokenLimit: v.number(),
      usagePeriodStart: v.number(),
      subscriptionActive: v.boolean(),
      plan: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const sub = await findSubscription(ctx, args.workosId);
    const subscriptionActive = isSubscriptionActive(sub?.status);
    const plan = subscriptionActive
      ? (sub?.plan ?? DEFAULT_PLAN_ID)
      : FREE_PLAN_ID;

    const row = await ctx.db
      .query('usage')
      .withIndex('by_workos_id', (q) => q.eq('workosId', args.workosId))
      .first();

    const snap = snapshotFromRow(row, now, subscriptionActive);

    if (!subscriptionActive) {
      const allowed = await freeUserPassesSignupGate(ctx, args.workosId);
      if (!allowed) {
        return {
          ok: false as const,
          reason:
            'Too many free accounts were created from this network today. Try again tomorrow or subscribe.',
          code: 'signup_rate_limited' as const,
          subscriptionActive,
          plan,
          ...snap,
        };
      }
    }

    if (snap.weightedTokensUsed >= snap.weightedTokenLimit) {
      return {
        ok: false as const,
        reason: subscriptionActive
          ? 'Monthly usage limit reached'
          : 'Free token limit reached. Subscribe to PROXY for more.',
        code: 'usage_limit_reached' as const,
        subscriptionActive,
        plan,
        ...snap,
      };
    }

    return {
      ok: true as const,
      subscriptionActive,
      plan,
      ...snap,
    };
  },
});

/**
 * Record token usage after a completed (or finished streaming) response.
 * Free: lifetime accumulator. Paid: resets when the 30-day period expires.
 */
export const addUsage = internalMutation({
  args: {
    workosId: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    weightedTokens: v.number(),
  },
  returns: v.object({
    weightedTokensUsed: v.number(),
    weightedTokenLimit: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const sub = await findSubscription(ctx, args.workosId);
    const subscriptionActive = isSubscriptionActive(sub?.status);
    const defaultLimit = quotaForPlan(
      subscriptionActive ? (sub?.plan ?? DEFAULT_PLAN_ID) : FREE_PLAN_ID,
      subscriptionActive,
    );

    const existing = await ctx.db
      .query('usage')
      .withIndex('by_workos_id', (q) => q.eq('workosId', args.workosId))
      .first();

    if (!existing) {
      const weightedTokensUsed = Math.max(0, args.weightedTokens);
      await ctx.db.insert('usage', {
        workosId: args.workosId,
        usagePeriodStart: now,
        weightedTokensUsed,
        weightedTokenLimit: defaultLimit,
        inputTokensUsed: Math.max(0, args.inputTokens),
        outputTokensUsed: Math.max(0, args.outputTokens),
        updatedAt: now,
      });
      return {
        weightedTokensUsed,
        weightedTokenLimit: defaultLimit,
      };
    }

    const reset =
      subscriptionActive && periodExpired(existing.usagePeriodStart, now);
    const nextUsed = reset
      ? Math.max(0, args.weightedTokens)
      : existing.weightedTokensUsed + Math.max(0, args.weightedTokens);
    const nextInput = reset
      ? Math.max(0, args.inputTokens)
      : (existing.inputTokensUsed ?? 0) + Math.max(0, args.inputTokens);
    const nextOutput = reset
      ? Math.max(0, args.outputTokens)
      : (existing.outputTokensUsed ?? 0) + Math.max(0, args.outputTokens);

    let weightedTokenLimit = existing.weightedTokenLimit || defaultLimit;
    if (!subscriptionActive) {
      weightedTokenLimit = FREE_WEIGHTED_TOKEN_LIMIT;
    }

    await ctx.db.patch(existing._id, {
      usagePeriodStart: reset ? now : existing.usagePeriodStart,
      weightedTokensUsed: nextUsed,
      weightedTokenLimit,
      inputTokensUsed: nextInput,
      outputTokensUsed: nextOutput,
      updatedAt: now,
    });

    return {
      weightedTokensUsed: nextUsed,
      weightedTokenLimit,
    };
  },
});

/** Public: current authenticated user's quota snapshot (for Settings UI). */
export const getMyUsage = query({
  args: {},
  returns: v.union(
    v.object({
      weightedTokensUsed: v.number(),
      weightedTokenLimit: v.number(),
      usagePeriodStart: v.number(),
      remaining: v.number(),
      subscriptionActive: v.boolean(),
      plan: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const workosId = identity.subject;
    const now = Date.now();
    const sub = await findSubscription(ctx, workosId);
    const subscriptionActive = isSubscriptionActive(sub?.status);
    const plan = subscriptionActive
      ? (sub?.plan ?? DEFAULT_PLAN_ID)
      : FREE_PLAN_ID;

    const row = await ctx.db
      .query('usage')
      .withIndex('by_workos_id', (q) => q.eq('workosId', workosId))
      .first();

    const snap = snapshotFromRow(row, now, subscriptionActive);
    return {
      ...snap,
      remaining: Math.max(0, snap.weightedTokenLimit - snap.weightedTokensUsed),
      subscriptionActive,
      plan,
    };
  },
});
