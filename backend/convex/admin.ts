import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import {
  BETA_TESTER_WEIGHTED_TOKEN_LIMIT,
  FREE_WEIGHTED_TOKEN_LIMIT,
} from './plans';
import { ensureFreeUsageRow } from './signupRateLimit';
import { nameFromParts, resolveDisplayName } from './users';

/** Comma-separated admin emails (WorkOS identity email). */
function adminEmails(): Set<string> {
  const raw =
    process.env.ADMIN_EMAILS?.trim() ||
    'contact@sterben.dev,hxdisterben@gmail.com';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function requireAdmin(ctx: {
  auth: { getUserIdentity: () => Promise<{ email?: string | null; subject: string } | null> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Sign in required');
  const email = identity.email?.trim().toLowerCase();
  if (!email || !adminEmails().has(email)) {
    throw new Error('Admin access required');
  }
  return identity;
}

export const amIAdmin = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const email = identity?.email?.trim().toLowerCase();
    return Boolean(email && adminEmails().has(email));
  },
});

export const listUsersForBeta = query({
  args: {},
  returns: v.array(
    v.object({
      workosId: v.string(),
      email: v.union(v.string(), v.null()),
      name: v.string(),
      betaTester: v.boolean(),
      weightedTokensUsed: v.number(),
      weightedTokenLimit: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query('users').collect();
    const rows = [];
    for (const user of users) {
      const usage = await ctx.db
        .query('usage')
        .withIndex('by_workos_id', (q) => q.eq('workosId', user.workosId))
        .first();
      rows.push({
        workosId: user.workosId,
        email: user.email ?? null,
        name: resolveDisplayName(user),
        betaTester: Boolean(user.betaTester),
        weightedTokensUsed: usage?.weightedTokensUsed ?? 0,
        weightedTokenLimit:
          usage?.weightedTokenLimit ?? FREE_WEIGHTED_TOKEN_LIMIT,
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return rows;
  },
});

/**
 * One-time: mark user as beta tester and raise their lifetime weighted token
 * limit to at least BETA_TESTER_WEIGHTED_TOKEN_LIMIT (100k). Does not reset used.
 */
export const grantBetaTester = mutation({
  args: {
    email: v.optional(v.string()),
    workosId: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.literal(true),
    alreadyGranted: v.boolean(),
    email: v.union(v.string(), v.null()),
    name: v.string(),
    weightedTokenLimit: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const email = args.email?.trim().toLowerCase();
    const workosId = args.workosId?.trim();
    if (!email && !workosId) throw new Error('Provide email or workosId');

    let user = workosId
      ? await ctx.db
          .query('users')
          .withIndex('by_workos_id', (q) => q.eq('workosId', workosId))
          .first()
      : null;

    if (!user && email) {
      user = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', email))
        .first();
      // Case-insensitive fallback if stored email casing differs
      if (!user) {
        const all = await ctx.db.query('users').collect();
        user =
          all.find((u) => u.email?.trim().toLowerCase() === email) ?? null;
      }
    }

    if (!user) throw new Error('User not found. They must sign in to PROXY once first.');

    const now = Date.now();
    const alreadyGranted = Boolean(user.betaTester);

    if (!alreadyGranted) {
      await ctx.db.patch(user._id, {
        betaTester: true,
        betaTesterGrantedAt: now,
        updatedAt: now,
      });
    }

    await ensureFreeUsageRow(ctx, user.workosId, now);
    const usage = await ctx.db
      .query('usage')
      .withIndex('by_workos_id', (q) => q.eq('workosId', user!.workosId))
      .first();

    let weightedTokenLimit = BETA_TESTER_WEIGHTED_TOKEN_LIMIT;
    if (usage) {
      weightedTokenLimit = Math.max(
        usage.weightedTokenLimit || 0,
        BETA_TESTER_WEIGHTED_TOKEN_LIMIT,
      );
      await ctx.db.patch(usage._id, {
        weightedTokenLimit,
        updatedAt: now,
      });
    }

    return {
      ok: true as const,
      alreadyGranted,
      email: user.email ?? null,
      name:
        resolveDisplayName(user) ||
        nameFromParts(user.firstName, user.lastName, user.email),
      weightedTokenLimit,
    };
  },
});
