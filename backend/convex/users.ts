import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { v } from 'convex/values';
import { OFFICIAL_AUTHOR_ID, OFFICIAL_AUTHOR_NAME } from './defaultStates';
import { ensureFreeUsageRow } from './signupRateLimit';

export function nameFromParts(
  firstName?: string | null,
  lastName?: string | null,
  email?: string | null
): string {
  const full = [firstName, lastName]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .join(' ');
  if (full) return full;
  if (email?.trim()) return email.trim().split('@')[0] || 'PROXY user';
  return 'PROXY user';
}

export function resolveDisplayName(user: {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  if (user.displayName?.trim()) return user.displayName.trim();
  return nameFromParts(user.firstName, user.lastName, user.email);
}

export async function resolveAvatarUrl(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { storage: { getUrl: (id: Id<'_storage'>) => Promise<string | null> } },
  user: { avatarStorageId?: Id<'_storage'> | null; profilePictureUrl?: string | null }
): Promise<string | null> {
  if (user.avatarStorageId) {
    const url = await ctx.storage.getUrl(user.avatarStorageId);
    if (url) return url;
  }
  if (user.profilePictureUrl?.trim()) return user.profilePictureUrl.trim();
  return null;
}

export async function ensureUserFromIdentity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  identity: {
    subject: string;
    email?: string | null;
    name?: string | null;
    givenName?: string | null;
    familyName?: string | null;
    pictureUrl?: string | null;
  }
): Promise<Doc<'users'>> {
  const existing = await ctx.db
    .query('users')
    .withIndex('by_workos_id', (q: any) => q.eq('workosId', identity.subject))
    .first();
  if (existing) return existing;

  const now = Date.now();
  const nameParts = (identity.name || '').trim().split(/\s+/).filter(Boolean);
  const firstName =
    identity.givenName?.trim() ||
    nameParts[0] ||
    undefined;
  const lastName =
    identity.familyName?.trim() ||
    (nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined);

  const id = await ctx.db.insert('users', {
    workosId: identity.subject,
    email: identity.email ?? undefined,
    firstName,
    lastName,
    profilePictureUrl: identity.pictureUrl ?? undefined,
    createdAt: now,
    updatedAt: now,
  });

  // Seed free lifetime usage so quotas show up before the first chat.
  await ensureFreeUsageRow(ctx, identity.subject, now);

  return (await ctx.db.get(id))!;
}

const publicProfileValidator = v.object({
  workosId: v.string(),
  displayName: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
  isOfficial: v.boolean(),
  isMe: v.boolean(),
  publishedCount: v.number(),
});

// Upsert from WorkOS webhook / auth flows
export const upsertUser = mutation({
  args: {
    workosId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
  },
  returns: v.id('users'),
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query('users')
      .withIndex('by_workos_id', (q) => q.eq('workosId', args.workosId))
      .first();

    const now = Date.now();

    if (existingUser) {
      // Preserve custom displayName / avatarStorageId
      await ctx.db.patch(existingUser._id, {
        email: args.email,
        firstName: args.firstName,
        lastName: args.lastName,
        profilePictureUrl: args.profilePictureUrl,
        updatedAt: now,
      });
      return existingUser._id;
    }

    const userId = await ctx.db.insert('users', {
      workosId: args.workosId,
      email: args.email,
      firstName: args.firstName,
      lastName: args.lastName,
      profilePictureUrl: args.profilePictureUrl,
      createdAt: now,
      updatedAt: now,
    });
    await ensureFreeUsageRow(ctx, args.workosId, now);
    return userId;
  },
});

export const setMyEmail = mutation({
  args: { email: v.string() },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Authentication required');
    const email = args.email.trim();
    if (!email.includes('@')) throw new Error('Invalid email');

    const user = await ensureUserFromIdentity(ctx, {
      ...identity,
      email: identity.email ?? email,
    });
    await ctx.db.patch(user._id, {
      email,
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

export const deleteUser = mutation({
  args: {
    workosId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_workos_id', (q) => q.eq('workosId', args.workosId))
      .first();

    if (user) {
      if (user.avatarStorageId) {
        try {
          await ctx.storage.delete(user.avatarStorageId);
        } catch {
          // ignore missing file
        }
      }
      await ctx.db.delete(user._id);
      return true;
    }
    return false;
  },
});

/**
 * Self-service account deletion. Requires auth + typed confirmation matching
 * "Delete my account <display name>". Removes Convex user data (profile, states,
 * library, stars, usage, subscription rows, signup claims). Does not cancel Stripe
 * or delete the WorkOS identity, cancel billing first if subscribed.
 */
export const deleteMyAccount = mutation({
  args: {
    confirmation: v.string(),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Sign in required');

    const workosId = identity.subject;
    const user = await ctx.db
      .query('users')
      .withIndex('by_workos_id', (q) => q.eq('workosId', workosId))
      .first();

    const accountName = user
      ? resolveDisplayName(user)
      : identity.name?.trim() ||
        nameFromParts(
          (identity as { givenName?: string }).givenName,
          (identity as { familyName?: string }).familyName,
          identity.email,
        );

    const expected = `Delete my account ${accountName}`;
    if (args.confirmation.trim() !== expected) {
      throw new Error(`Type exactly: ${expected}`);
    }

    // Owned gallery / private states (+ stars and library memberships on those states)
    const ownedStates = await ctx.db
      .query('states')
      .withIndex('by_author', (q) => q.eq('authorWorkosId', workosId))
      .collect();
    for (const post of ownedStates) {
      if (post.isOfficial) continue;
      const stars = await ctx.db
        .query('stateStars')
        .withIndex('by_state', (q) => q.eq('stateId', post._id))
        .collect();
      for (const star of stars) await ctx.db.delete(star._id);

      const memberships = await ctx.db
        .query('userStates')
        .withIndex('by_state', (q) => q.eq('stateId', post._id))
        .collect();
      for (const m of memberships) await ctx.db.delete(m._id);

      await ctx.db.delete(post._id);
    }

    // Remaining library rows + stars this user placed on others' states
    const library = await ctx.db
      .query('userStates')
      .withIndex('by_workos_id', (q) => q.eq('workosId', workosId))
      .collect();
    for (const row of library) await ctx.db.delete(row._id);

    const myStars = await ctx.db
      .query('stateStars')
      .withIndex('by_user_state', (q) => q.eq('workosId', workosId))
      .collect();
    for (const star of myStars) {
      const state = await ctx.db.get(star.stateId);
      if (state && typeof state.starCount === 'number' && state.starCount > 0) {
        await ctx.db.patch(state._id, {
          starCount: Math.max(0, state.starCount - 1),
          updatedAt: Date.now(),
        });
      }
      await ctx.db.delete(star._id);
    }

    const usageRows = await ctx.db
      .query('usage')
      .withIndex('by_workos_id', (q) => q.eq('workosId', workosId))
      .collect();
    for (const row of usageRows) await ctx.db.delete(row._id);

    const subs = await ctx.db
      .query('subscriptions')
      .withIndex('by_workos_id', (q) => q.eq('workosId', workosId))
      .collect();
    for (const row of subs) await ctx.db.delete(row._id);

    const claims = await ctx.db
      .query('signupClaims')
      .withIndex('by_workos_id', (q) => q.eq('workosId', workosId))
      .collect();
    for (const row of claims) await ctx.db.delete(row._id);

    if (user) {
      if (user.avatarStorageId) {
        try {
          await ctx.storage.delete(user.avatarStorageId);
        } catch {
          // ignore
        }
      }
      await ctx.db.delete(user._id);
    }

    return { ok: true as const };
  },
});

export const getUserByEmail = query({
  args: { email: v.string() },
  returns: v.union(
    v.object({
      _id: v.id('users'),
      workosId: v.string(),
      email: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', args.email))
      .first();
    if (!user) return null;
    return { _id: user._id, workosId: user.workosId, email: user.email };
  },
});

export const getUserByWorkosId = query({
  args: {
    workosId: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id('users'),
      _creationTime: v.number(),
      workosId: v.string(),
      email: v.optional(v.string()),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      profilePictureUrl: v.optional(v.string()),
      displayName: v.optional(v.string()),
      avatarStorageId: v.optional(v.id('_storage')),
      betaTester: v.optional(v.boolean()),
      betaTesterGrantedAt: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query('users')
      .withIndex('by_workos_id', (q) => q.eq('workosId', args.workosId))
      .first();
  },
});

/** Public profile card for /u/:workosId */
export const getPublicProfile = query({
  args: { workosId: v.string() },
  returns: v.union(publicProfileValidator, v.null()),
  handler: async (ctx, args) => {
    const workosId = args.workosId.trim();
    if (!workosId) return null;

    const identity = await ctx.auth.getUserIdentity();
    const published = await ctx.db
      .query('states')
      .withIndex('by_author', (q) => q.eq('authorWorkosId', workosId))
      .collect();
    const publishedCount = published.filter((p) => !p.isOfficial).length;

    if (workosId === OFFICIAL_AUTHOR_ID) {
      return {
        workosId,
        displayName: OFFICIAL_AUTHOR_NAME,
        avatarUrl: null as string | null,
        isOfficial: true,
        isMe: false,
        publishedCount: published.length,
      };
    }

    const user = await ctx.db
      .query('users')
      .withIndex('by_workos_id', (q) => q.eq('workosId', workosId))
      .first();

    if (!user) {
      // Fall back to latest published snapshot so old posts still link somewhere useful
      const latest = published.sort((a, b) => b.createdAt - a.createdAt)[0];
      if (!latest) return null;
      return {
        workosId,
        displayName: latest.authorDisplayName || 'PROXY user',
        avatarUrl: null as string | null,
        isOfficial: false,
        isMe: identity?.subject === workosId,
        publishedCount,
      };
    }

    return {
      workosId: user.workosId,
      displayName: resolveDisplayName(user),
      avatarUrl: await resolveAvatarUrl(ctx, user),
      isOfficial: false,
      isMe: identity?.subject === user.workosId,
      publishedCount,
    };
  },
});

/** Signed-in user's editable profile. */
export const getMyProfile = query({
  args: {},
  returns: v.union(
    v.object({
      workosId: v.string(),
      email: v.optional(v.string()),
      displayName: v.string(),
      displayNameCustom: v.union(v.string(), v.null()),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      avatarUrl: v.union(v.string(), v.null()),
      hasCustomAvatar: v.boolean(),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query('users')
      .withIndex('by_workos_id', (q) => q.eq('workosId', identity.subject))
      .first();

    if (!user) {
      const fallbackName =
        identity.name?.trim() ||
        nameFromParts(
          (identity as { givenName?: string }).givenName,
          (identity as { familyName?: string }).familyName,
          identity.email
        );
      return {
        workosId: identity.subject,
        email: identity.email,
        displayName: fallbackName,
        displayNameCustom: null as string | null,
        firstName: undefined,
        lastName: undefined,
        avatarUrl: (identity as { pictureUrl?: string }).pictureUrl ?? null,
        hasCustomAvatar: false,
      };
    }

    return {
      workosId: user.workosId,
      email: user.email,
      displayName: resolveDisplayName(user),
      displayNameCustom: user.displayName?.trim() || null,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: await resolveAvatarUrl(ctx, user),
      hasCustomAvatar: Boolean(user.avatarStorageId),
    };
  },
});

export const generateAvatarUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Sign in to upload a profile picture');
    await ensureUserFromIdentity(ctx, identity);
    return await ctx.storage.generateUploadUrl();
  },
});

export const updateMyProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    clearDisplayName: v.optional(v.boolean()),
    avatarStorageId: v.optional(v.id('_storage')),
    clearAvatar: v.optional(v.boolean()),
  },
  returns: v.object({
    displayName: v.string(),
    avatarUrl: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Sign in to update your profile');

    const user = await ensureUserFromIdentity(ctx, identity);
    const now = Date.now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = { updatedAt: now };

    if (args.clearDisplayName) {
      patch.displayName = undefined;
    } else if (args.displayName !== undefined) {
      const name = args.displayName.trim();
      if (!name) throw new Error('Display name cannot be empty');
      if (name.length > 48) throw new Error('Display name must be 48 characters or fewer');
      patch.displayName = name;
    }

    if (args.clearAvatar) {
      if (user.avatarStorageId) {
        try {
          await ctx.storage.delete(user.avatarStorageId);
        } catch {
          // ignore
        }
      }
      patch.avatarStorageId = undefined;
    } else if (args.avatarStorageId) {
      if (user.avatarStorageId && user.avatarStorageId !== args.avatarStorageId) {
        try {
          await ctx.storage.delete(user.avatarStorageId);
        } catch {
          // ignore
        }
      }
      patch.avatarStorageId = args.avatarStorageId;
    }

    await ctx.db.patch(user._id, patch);
    const updated = (await ctx.db.get(user._id))!;
    const displayName = resolveDisplayName(updated);

    // Keep community post bylines in sync with the live profile name
    if (args.displayName !== undefined || args.clearDisplayName) {
      const posts = await ctx.db
        .query('states')
        .withIndex('by_author', (q) => q.eq('authorWorkosId', user.workosId))
        .collect();
      for (const post of posts) {
        if (post.isOfficial) continue;
        await ctx.db.patch(post._id, {
          authorDisplayName: displayName,
          updatedAt: now,
        });
      }
    }

    return {
      displayName,
      avatarUrl: await resolveAvatarUrl(ctx, updated),
    };
  },
});
