import { internalMutation, internalQuery, mutation } from './_generated/server';
import { v } from 'convex/values';
import { FREE_WEIGHTED_TOKEN_LIMIT } from './plans';

/** Max new free accounts per client IP (hashed) per UTC day. */
export const MAX_SIGNUPS_PER_IP_PER_DAY = 2;

export function utcDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Seed free lifetime usage when missing (idempotent). */
export async function ensureFreeUsageRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
  now = Date.now(),
): Promise<boolean> {
  const existing = await ctx.db
    .query('usage')
    .withIndex('by_workos_id', (q: any) => q.eq('workosId', workosId))
    .first();
  if (existing) return false;
  await ctx.db.insert('usage', {
    workosId,
    usagePeriodStart: now,
    weightedTokensUsed: 0,
    weightedTokenLimit: FREE_WEIGHTED_TOKEN_LIMIT,
    inputTokensUsed: 0,
    outputTokensUsed: 0,
    updatedAt: now,
  });
  return true;
}

/** Claimed users and grandfathered older / already-active free accounts pass. */
export async function freeUserPassesSignupGate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
): Promise<boolean> {
  const claim = await ctx.db
    .query('signupClaims')
    .withIndex('by_workos_id', (q: any) => q.eq('workosId', workosId))
    .first();
  if (claim) return true;

  const user = await ctx.db
    .query('users')
    .withIndex('by_workos_id', (q: any) => q.eq('workosId', workosId))
    .first();
  if (!user) return false;

  // Grandfather accounts older than 24h (pre-rate-limit / returning devices).
  if (Date.now() - user.createdAt > 24 * 60 * 60 * 1000) return true;

  const usage = await ctx.db
    .query('usage')
    .withIndex('by_workos_id', (q: any) => q.eq('workosId', workosId))
    .first();
  // Already consumed free quota → returning real user, not a fresh spam account.
  if (usage && usage.weightedTokensUsed > 0) return true;

  return false;
}

export const freeUserHasSignupClaim = internalQuery({
  args: { workosId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => freeUserPassesSignupGate(ctx, args.workosId),
});

/** Authenticated repair: seed free usage if the webhook created a user without a quota row. */
export const ensureMyFreeUsage = mutation({
  args: {},
  returns: v.object({ seeded: v.boolean() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Authentication required');
    const seeded = await ensureFreeUsageRow(ctx, identity.subject);
    return { seeded };
  },
});

/**
 * Record an IP-bound signup claim for a WorkOS user.
 * Returning users (already claimed) succeed without consuming a slot.
 * New users are limited to MAX_SIGNUPS_PER_IP_PER_DAY per IP hash / UTC day.
 */
export const claimIpSignup = internalMutation({
  args: {
    workosId: v.string(),
    ipHash: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      alreadyClaimed: v.boolean(),
    }),
    v.object({
      ok: v.literal(false),
      code: v.literal('signup_rate_limited'),
      reason: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const now = Date.now();
    const workosId = args.workosId.trim();
    const ipHash = args.ipHash.trim();
    if (!workosId || !ipHash) {
      return {
        ok: false as const,
        code: 'signup_rate_limited' as const,
        reason: 'Could not verify sign-up origin.',
      };
    }

    const existingClaim = await ctx.db
      .query('signupClaims')
      .withIndex('by_workos_id', (q) => q.eq('workosId', workosId))
      .first();
    if (existingClaim) {
      await ensureFreeUsageRow(ctx, workosId, now);
      return { ok: true as const, alreadyClaimed: true };
    }

    const dayKey = utcDayKey(now);
    // Per-user "noip:" hashes must not share a rate-limit bucket.
    const enforceIpCap = !ipHash.startsWith('noip:');
    if (enforceIpCap) {
      const todaysClaims = await ctx.db
        .query('signupClaims')
        .withIndex('by_ip_day', (q) => q.eq('ipHash', ipHash).eq('dayKey', dayKey))
        .collect();

      if (todaysClaims.length >= MAX_SIGNUPS_PER_IP_PER_DAY) {
        return {
          ok: false as const,
          code: 'signup_rate_limited' as const,
          reason:
            'Too many free accounts were created from this network today. Try again tomorrow or subscribe.',
        };
      }
    }

    // Ensure user row exists (web AuthKit / desktop may hit this first).
    let user = await ctx.db
      .query('users')
      .withIndex('by_workos_id', (q) => q.eq('workosId', workosId))
      .first();
    if (!user) {
      const userId = await ctx.db.insert('users', {
        workosId,
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        profilePictureUrl: args.profilePictureUrl,
        createdAt: now,
        updatedAt: now,
      });
      user = (await ctx.db.get(userId))!;
    }

    await ensureFreeUsageRow(ctx, workosId, now);

    await ctx.db.insert('signupClaims', {
      workosId,
      ipHash,
      dayKey,
      createdAt: now,
    });

    return { ok: true as const, alreadyClaimed: false };
  },
});
