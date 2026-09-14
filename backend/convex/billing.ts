import { internalMutation } from './_generated/server';
import { v } from 'convex/values';
import {
  DEFAULT_PLAN_ID,
  FREE_WEIGHTED_TOKEN_LIMIT,
  isSubscriptionActive,
  quotaForPlan,
} from './plans';

/**
 * After Stripe webhooks update subscription status, sync plan + quota on the user.
 * Activating a paid plan starts a fresh monthly token period.
 * Lapsing a plan clamps the limit back to the free lifetime pool (usage kept).
 */
export const syncEntitlements = internalMutation({
  args: {
    workosId: v.string(),
    status: v.string(),
    plan: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const active = isSubscriptionActive(args.status);
    const plan = active ? (args.plan ?? DEFAULT_PLAN_ID) : 'free';
    const weightedTokenLimit = active
      ? quotaForPlan(plan, true)
      : FREE_WEIGHTED_TOKEN_LIMIT;

    const sub = await ctx.db
      .query('subscriptions')
      .withIndex('by_workos_id', (q) => q.eq('workosId', args.workosId))
      .first();

    if (sub && active && sub.plan !== plan) {
      await ctx.db.patch(sub._id, { plan, updatedAt: now });
    }

    const usage = await ctx.db
      .query('usage')
      .withIndex('by_workos_id', (q) => q.eq('workosId', args.workosId))
      .first();

    if (!usage) {
      await ctx.db.insert('usage', {
        workosId: args.workosId,
        usagePeriodStart: now,
        weightedTokensUsed: 0,
        weightedTokenLimit,
        inputTokensUsed: 0,
        outputTokensUsed: 0,
        updatedAt: now,
      });
      return null;
    }

    if (active) {
      await ctx.db.patch(usage._id, {
        weightedTokenLimit,
        usagePeriodStart: now,
        weightedTokensUsed: 0,
        inputTokensUsed: 0,
        outputTokensUsed: 0,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.patch(usage._id, {
      weightedTokenLimit: FREE_WEIGHTED_TOKEN_LIMIT,
      updatedAt: now,
    });

    return null;
  },
});
