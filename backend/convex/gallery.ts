import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { v } from 'convex/values';
import {
  DEFAULT_STATE_TAGS,
  OFFICIAL_AUTHOR_ID,
  OFFICIAL_AUTHOR_NAME,
  normalizeTags,
} from './defaultStates';
import {
  addLibraryMembership,
  listLibraryStateIds,
  normalizeState,
  resolveLibraryIds,
  resolveVisibility,
  stateValueValidator,
  upsertOfficialDefaultStates,
  type Visibility,
} from './states';
import {
  ensureUserFromIdentity,
  resolveAvatarUrl,
  resolveDisplayName,
} from './users';
import {
  requireActiveSubscription,
  requireCanCreateStates,
} from './entitlements';

const listItemValidator = v.object({
  _id: v.id('states'),
  name: v.string(),
  description: v.string(),
  authorDisplayName: v.string(),
  authorWorkosId: v.string(),
  authorAvatarUrl: v.union(v.string(), v.null()),
  tags: v.array(v.string()),
  visibility: v.union(v.literal('public'), v.literal('private')),
  saveCount: v.number(),
  starCount: v.number(),
  starredByMe: v.boolean(),
  savedByMe: v.boolean(),
  isOfficial: v.boolean(),
  createdAt: v.number(),
  state: stateValueValidator,
});

async function authorPresentation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any; storage: any },
  row: Doc<'states'>,
  userCache: Map<string, Doc<'users'> | null>
): Promise<{ displayName: string; avatarUrl: string | null }> {
  if (row.isOfficial || row.authorWorkosId === OFFICIAL_AUTHOR_ID) {
    return { displayName: OFFICIAL_AUTHOR_NAME, avatarUrl: null };
  }
  let user: Doc<'users'> | null = null;
  if (userCache.has(row.authorWorkosId)) {
    user = userCache.get(row.authorWorkosId) ?? null;
  } else {
    const found = await ctx.db
      .query('users')
      .withIndex('by_workos_id', (q: any) => q.eq('workosId', row.authorWorkosId))
      .first();
    user = (found as Doc<'users'> | null) ?? null;
    userCache.set(row.authorWorkosId, user);
  }
  if (user) {
    return {
      displayName: resolveDisplayName(user),
      avatarUrl: await resolveAvatarUrl(ctx, user),
    };
  }
  return {
    displayName: row.authorDisplayName || 'PROXY user',
    avatarUrl: null,
  };
}

async function libraryIdSet(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string | undefined
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!workosId) return ids;
  for (const id of await listLibraryStateIds(ctx, workosId)) {
    ids.add(id);
  }
  return ids;
}

async function mapListItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any; storage: any },
  rows: Doc<'states'>[],
  workosId: string | undefined,
  libraryIds: Set<string>
) {
  const userCache = new Map<string, Doc<'users'> | null>();
  const result = [];
  for (const row of rows) {
    let starredByMe = false;
    if (workosId) {
      const star = await ctx.db
        .query('stateStars')
        .withIndex('by_user_state', (q: any) =>
          q.eq('workosId', workosId).eq('stateId', row._id)
        )
        .first();
      starredByMe = Boolean(star);
    }
    const tags =
      normalizeTags(row.tags).length > 0
        ? normalizeTags(row.tags)
        : normalizeTags(DEFAULT_STATE_TAGS[row.officialKey || row.name]);
    const author = await authorPresentation(ctx, row, userCache);
    const visibility = resolveVisibility(row);
    result.push({
      _id: row._id,
      name: row.name,
      description: row.description,
      authorDisplayName: author.displayName,
      authorWorkosId: row.authorWorkosId,
      authorAvatarUrl: author.avatarUrl,
      tags,
      visibility,
      saveCount: row.saveCount ?? 0,
      starCount: row.starCount ?? 0,
      starredByMe,
      savedByMe: libraryIds.has(row._id),
      isOfficial: Boolean(row.isOfficial),
      createdAt: row.createdAt,
      state: { ...normalizeState(row.state), visibility },
    });
  }
  return result;
}

function isPublicRow(row: Doc<'states'>): boolean {
  return resolveVisibility(row) === 'public';
}

/** Public gallery only. */
export const list = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(listItemValidator),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 80, 1), 120);
    const identity = await ctx.auth.getUserIdentity();
    const workosId = identity?.subject;
    const libraryIds = await libraryIdSet(ctx, workosId);

    const rows = (await ctx.db.query('states').collect()).filter(isPublicRow);
    rows.sort((a, b) => {
      const ao = a.isOfficial ? 1 : 0;
      const bo = b.isOfficial ? 1 : 0;
      if (ao !== bo) return bo - ao;
      const starsA = a.starCount ?? 0;
      const starsB = b.starCount ?? 0;
      if (starsA !== starsB) return starsB - starsA;
      return b.createdAt - a.createdAt;
    });

    return await mapListItems(ctx, rows.slice(0, limit), workosId, libraryIds);
  },
});

export const listByAuthor = query({
  args: {
    workosId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(listItemValidator),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 80, 1), 120);
    const identity = await ctx.auth.getUserIdentity();
    const me = identity?.subject;
    const libraryIds = await libraryIdSet(ctx, me);
    const authorId = args.workosId.trim();

    const rows = (
      await ctx.db
        .query('states')
        .withIndex('by_author', (q) => q.eq('authorWorkosId', authorId))
        .collect()
    ).filter((row) => isPublicRow(row) || (me === authorId && !row.isOfficial));

    rows.sort((a, b) => b.createdAt - a.createdAt);
    return await mapListItems(ctx, rows.slice(0, limit), me, libraryIds);
  },
});

export const listMine = query({
  args: {},
  returns: v.array(listItemValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const libraryIds = await libraryIdSet(ctx, identity.subject);
    const rows = await ctx.db
      .query('states')
      .withIndex('by_author', (q) => q.eq('authorWorkosId', identity.subject))
      .collect();
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return await mapListItems(ctx, rows, identity.subject, libraryIds);
  },
});

export const seedOfficialDefaults = mutation({
  args: {},
  returns: v.object({ upserted: v.number() }),
  handler: async (ctx) => {
    const upserted = await upsertOfficialDefaultStates(ctx);
    return { upserted };
  },
});

export const publish = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    state: stateValueValidator,
    tags: v.optional(v.array(v.string())),
    visibility: v.optional(v.union(v.literal('public'), v.literal('private'))),
  },
  returns: v.object({ id: v.id('states') }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Sign in to create a state');

    const entitlements = await requireCanCreateStates(ctx, identity.subject);

    const name = args.name.trim();
    if (!name || name.length > 64) throw new Error('Name must be 1–64 characters');
    const description = args.description.trim();
    if (!description || description.length > 500) {
      throw new Error('Description must be 1–500 characters');
    }

    const state = normalizeState(args.state);
    const hasInstruction =
      Boolean(state.systemInstruction?.trim()) ||
      Boolean(state.system_instruction?.trim());
    if (!hasInstruction) throw new Error('Add a system instruction before saving');

    const tags = normalizeTags(args.tags);
    if (tags.length > 3) throw new Error('Pick up to 3 tags');

    const visibility: Visibility =
      args.visibility === 'public' ? 'public' : 'private';
    if (visibility === 'public' && !entitlements.canPublishStates) {
      throw new Error('Subscribe to PROXY to publish states.');
    }

    const user = await ensureUserFromIdentity(ctx, identity);
    const displayName = resolveDisplayName(user);
    const now = Date.now();

    await resolveLibraryIds(ctx, identity.subject, displayName);

    const id = await ctx.db.insert('states', {
      name,
      description,
      authorWorkosId: identity.subject,
      authorDisplayName: displayName,
      state,
      tags,
      visibility,
      saveCount: 0,
      starCount: 0,
      isOfficial: false,
      createdAt: now,
      updatedAt: now,
    });

    await addLibraryMembership(ctx, identity.subject, id);
    return { id };
  },
});

export const toggleStar = mutation({
  args: {
    stateId: v.optional(v.id('states')),
    communityStateId: v.optional(v.id('states')),
  },
  returns: v.object({
    starred: v.boolean(),
    starCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Sign in to star a state');

    const stateId = args.stateId || args.communityStateId;
    if (!stateId) throw new Error('stateId required');

    const post = await ctx.db.get(stateId);
    if (!post) throw new Error('State not found');
    if (resolveVisibility(post) !== 'public') {
      throw new Error('Only public states can be starred');
    }

    const workosId = identity.subject;
    const existing = await ctx.db
      .query('stateStars')
      .withIndex('by_user_state', (q) =>
        q.eq('workosId', workosId).eq('stateId', stateId)
      )
      .first();

    const now = Date.now();
    let starCount = post.starCount ?? 0;
    let starred: boolean;

    if (existing) {
      await ctx.db.delete(existing._id);
      starCount = Math.max(0, starCount - 1);
      starred = false;
    } else {
      await ctx.db.insert('stateStars', {
        workosId,
        stateId,
        createdAt: now,
      });
      starCount += 1;
      starred = true;
    }

    await ctx.db.patch(post._id, { starCount, updatedAt: now });
    return { starred, starCount };
  },
});

export const saveToMine = mutation({
  args: {
    stateId: v.optional(v.id('states')),
    communityStateId: v.optional(v.id('states')),
    asName: v.optional(v.string()),
  },
  returns: v.object({ savedAs: v.string() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Sign in to save a state');

    const stateId = args.stateId || args.communityStateId;
    if (!stateId) throw new Error('stateId required');

    const post = await ctx.db.get(stateId);
    if (!post) throw new Error('State not found');
    if (resolveVisibility(post) !== 'public') {
      throw new Error('This state is private');
    }

    const user = await ensureUserFromIdentity(ctx, identity);
    await resolveLibraryIds(ctx, identity.subject, resolveDisplayName(user));
    const added = await addLibraryMembership(ctx, identity.subject, stateId);
    if (added) {
      await ctx.db.patch(post._id, {
        saveCount: (post.saveCount ?? 0) + 1,
        updatedAt: Date.now(),
      });
    }

    return { savedAs: args.asName?.trim() || post.name };
  },
});

export const updatePublished = mutation({
  args: {
    stateId: v.optional(v.id('states')),
    communityStateId: v.optional(v.id('states')),
    name: v.string(),
    description: v.string(),
    state: stateValueValidator,
    tags: v.optional(v.array(v.string())),
    visibility: v.optional(v.union(v.literal('public'), v.literal('private'))),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Sign in required');

    await requireActiveSubscription(
      ctx,
      identity.subject,
      'edit or publish states',
    );

    const stateId = args.stateId || args.communityStateId;
    if (!stateId) throw new Error('stateId required');

    const post = await ctx.db.get(stateId);
    if (!post) throw new Error('State not found');
    if (post.isOfficial || post.authorWorkosId === OFFICIAL_AUTHOR_ID) {
      throw new Error('Official PROXY states cannot be edited');
    }
    if (post.authorWorkosId !== identity.subject) {
      throw new Error('You can only edit your own posts');
    }

    const name = args.name.trim();
    if (!name || name.length > 64) throw new Error('Name must be 1–64 characters');
    const description = args.description.trim();
    if (!description || description.length > 500) {
      throw new Error('Description must be 1–500 characters');
    }

    const state = normalizeState(args.state);
    const hasInstruction =
      Boolean(state.systemInstruction?.trim()) ||
      Boolean(state.system_instruction?.trim());
    if (!hasInstruction) throw new Error('Add a system instruction before saving');

    const tags = normalizeTags(args.tags);
    if (tags.length > 3) throw new Error('Pick up to 3 tags');

    const patch: Record<string, unknown> = {
      name,
      description,
      state,
      tags,
      updatedAt: Date.now(),
    };
    if (args.visibility === 'public' || args.visibility === 'private') {
      patch.visibility = args.visibility;
    }

    await ctx.db.patch(post._id, patch);
    return { ok: true as const };
  },
});

export const remove = mutation({
  args: {
    stateId: v.optional(v.id('states')),
    communityStateId: v.optional(v.id('states')),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Sign in required');

    const stateId = args.stateId || args.communityStateId;
    if (!stateId) throw new Error('stateId required');

    const post = await ctx.db.get(stateId);
    if (!post) throw new Error('State not found');
    if (post.isOfficial || post.authorWorkosId === OFFICIAL_AUTHOR_ID) {
      throw new Error('Official PROXY states cannot be deleted');
    }
    if (post.authorWorkosId !== identity.subject) {
      throw new Error('You can only delete your own posts');
    }

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
    return { ok: true as const };
  },
});
