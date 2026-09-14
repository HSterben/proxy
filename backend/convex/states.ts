import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { v } from 'convex/values';
import {
  DEFAULT_STATES,
  defaultStateNames,
  isDefaultStateName,
} from './defaultStates';
import {
  ensureUserFromIdentity,
  resolveDisplayName,
} from './users';
import {
  requireActiveSubscription,
  userHasActiveSubscription,
} from './entitlements';
import { FREE_STATE_NAMES, isFreeStateName } from './plans';

/** One chat "state" (preset) — flexible fields match desktop presets JSON. */
export const stateValueValidator = v.object({
  description: v.optional(v.string()),
  desc: v.optional(v.string()),
  systemInstruction: v.optional(v.string()),
  system_instruction: v.optional(v.string()),
  temperature: v.optional(v.number()),
  maxTokens: v.optional(v.number()),
  topP: v.optional(v.number()),
  frequencyPenalty: v.optional(v.number()),
  presencePenalty: v.optional(v.number()),
  stop: v.optional(v.union(v.string(), v.array(v.string()))),
  visibility: v.optional(v.union(v.literal('public'), v.literal('private'))),
});

export type StateValue = {
  description?: string;
  desc?: string;
  systemInstruction?: string;
  system_instruction?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
  visibility?: 'public' | 'private';
};

export type Visibility = 'public' | 'private';

export function normalizeState(raw: unknown): StateValue {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const next: StateValue = {};
  if (typeof src.description === 'string') next.description = src.description;
  if (typeof src.desc === 'string') next.desc = src.desc;
  if (typeof src.systemInstruction === 'string') {
    next.systemInstruction = src.systemInstruction;
  }
  if (typeof src.system_instruction === 'string') {
    next.system_instruction = src.system_instruction;
  }
  if (typeof src.temperature === 'number') next.temperature = src.temperature;
  if (typeof src.maxTokens === 'number') next.maxTokens = src.maxTokens;
  if (typeof src.topP === 'number') next.topP = src.topP;
  if (typeof src.frequencyPenalty === 'number') {
    next.frequencyPenalty = src.frequencyPenalty;
  }
  if (typeof src.presencePenalty === 'number') {
    next.presencePenalty = src.presencePenalty;
  }
  if (typeof src.stop === 'string') next.stop = src.stop;
  else if (Array.isArray(src.stop) && src.stop.every((s) => typeof s === 'string')) {
    next.stop = src.stop as string[];
  }
  if (src.visibility === 'public' || src.visibility === 'private') {
    next.visibility = src.visibility;
  }
  return next;
}

export function normalizeStates(raw: unknown): Record<string, StateValue> {
  const states: Record<string, StateValue> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return states;
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    states[name] = normalizeState(value);
  }
  return states;
}

export function resolveVisibility(
  row: { visibility?: Visibility | null; isOfficial?: boolean | null }
): Visibility {
  if (row.visibility === 'public' || row.visibility === 'private') return row.visibility;
  if (row.isOfficial) return 'public';
  return 'private';
}

function statePayloadWithoutVisibility(value: StateValue): StateValue {
  const { visibility: _v, ...rest } = value;
  return rest;
}

function instructionOf(value: StateValue | unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const v = value as StateValue;
  return (v.systemInstruction || v.system_instruction || '').trim();
}

function matchesStockDefault(name: string, value: StateValue): boolean {
  if (!isDefaultStateName(name)) return false;
  const stock = DEFAULT_STATES[name];
  if (!stock) return false;
  return instructionOf(value) === (stock.systemInstruction || '').trim();
}

async function officialIdByKey(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any }
): Promise<Map<string, Id<'states'>>> {
  const map = new Map<string, Id<'states'>>();
  for (const key of defaultStateNames()) {
    const row = await ctx.db
      .query('states')
      .withIndex('by_official_key', (q: any) => q.eq('officialKey', key))
      .first();
    if (row) map.set(key, row._id);
  }
  return map;
}

/** Ordered state IDs in the user's library (M:N rows only). */
export async function listLibraryStateIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string
): Promise<Id<'states'>[]> {
  const rows: Doc<'userStates'>[] = await ctx.db
    .query('userStates')
    .withIndex('by_workos_id', (q: any) => q.eq('workosId', workosId))
    .collect();
  const ids: Id<'states'>[] = [];
  for (const row of rows) {
    if (row.stateId) ids.push(row.stateId);
  }
  return ids;
}

/**
 * Convert legacy userStates blob docs `{ states: Record }` into M:N
 * membership rows pointing at `states` documents, then delete the blob.
 */
async function migrateLegacyUserStates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
  displayName: string
): Promise<void> {
  const rows: Doc<'userStates'>[] = await ctx.db
    .query('userStates')
    .withIndex('by_workos_id', (q: any) => q.eq('workosId', workosId))
    .collect();

  const legacy = rows.filter((row) => !row.stateId && row.states != null);
  if (legacy.length === 0) return;

  const official = await officialIdByKey(ctx);
  const now = Date.now();
  const nextIds: Id<'states'>[] = [];
  const seen = new Set<string>();

  for (const row of legacy) {
    const incoming = normalizeStates(row.states);
    for (const [name, value] of Object.entries(incoming)) {
      const key = name.trim();
      if (!key) continue;
      const lower = key.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);

      if (matchesStockDefault(key, value)) {
        const officialId = official.get(key);
        if (officialId) {
          nextIds.push(officialId);
          continue;
        }
      }

      const visibility: Visibility =
        value.visibility === 'public' ? 'public' : 'private';
      const stateBody = statePayloadWithoutVisibility(value);
      const description = value.description || value.desc || key;
      const id = await ctx.db.insert('states', {
        name: key,
        description,
        authorWorkosId: workosId,
        authorDisplayName: displayName,
        state: stateBody,
        tags: [],
        visibility,
        saveCount: 0,
        starCount: 0,
        isOfficial: false,
        createdAt: now,
        updatedAt: now,
      });
      nextIds.push(id);
    }
    await ctx.db.delete(row._id);
  }

  // Keep any M:N rows that already existed alongside the blob.
  const existingIds = await listLibraryStateIds(ctx, workosId);
  const merged = [...new Set([...existingIds.map(String), ...nextIds.map(String)])].map(
    (id) => id as Id<'states'>
  );
  await replaceLibraryStateIds(ctx, workosId, merged);
}

async function replaceLibraryStateIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
  nextIds: Id<'states'>[]
): Promise<void> {
  const now = Date.now();
  const existing: Doc<'userStates'>[] = await ctx.db
    .query('userStates')
    .withIndex('by_workos_id', (q: any) => q.eq('workosId', workosId))
    .collect();

  const keep = new Set(nextIds.map(String));
  const have = new Set<string>();

  for (const row of existing) {
    // Drop leftover legacy blobs during membership rewrite.
    if (!row.stateId) {
      await ctx.db.delete(row._id);
      continue;
    }
    if (!keep.has(row.stateId)) {
      await ctx.db.delete(row._id);
    } else {
      have.add(row.stateId);
    }
  }

  for (const stateId of nextIds) {
    if (have.has(stateId)) continue;
    await ctx.db.insert('userStates', {
      workosId,
      stateId,
      createdAt: now,
    });
  }
}

export async function addLibraryMembership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
  stateId: Id<'states'>
): Promise<boolean> {
  const existing = await ctx.db
    .query('userStates')
    .withIndex('by_user_state', (q: any) =>
      q.eq('workosId', workosId).eq('stateId', stateId)
    )
    .first();
  if (existing) return false;
  await ctx.db.insert('userStates', {
    workosId,
    stateId,
    createdAt: Date.now(),
  });
  return true;
}

/**
 * Remove redundant private clones of official defaults and duplicate owned
 * rows; rewrite M:N membership to the reconciled ID list.
 */
async function reconcileLibraryIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
  libraryIds: Id<'states'>[]
): Promise<Id<'states'>[]> {
  const official = await officialIdByKey(ctx);
  const now = Date.now();
  const next: Id<'states'>[] = [];
  const seenName = new Set<string>();

  for (const id of libraryIds) {
    const doc = await ctx.db.get(id);
    if (!doc) continue;

    const lower = doc.name.toLowerCase();
    const owned = doc.authorWorkosId === workosId && !doc.isOfficial;

    if (owned && matchesStockDefault(doc.name, normalizeState(doc.state))) {
      const officialId = official.get(doc.name);
      if (officialId) {
        if (resolveVisibility(doc) === 'private') {
          await ctx.db.delete(doc._id);
        }
        if (!seenName.has(lower)) {
          seenName.add(lower);
          next.push(officialId);
        }
        continue;
      }
    }

    if (seenName.has(lower)) {
      if (owned && resolveVisibility(doc) === 'private') {
        await ctx.db.delete(doc._id);
      }
      continue;
    }

    seenName.add(lower);
    next.push(doc._id);
  }

  const authored: Doc<'states'>[] = await ctx.db
    .query('states')
    .withIndex('by_author', (q: any) => q.eq('authorWorkosId', workosId))
    .collect();
  const inLibrary = new Set(next);
  const libraryInstructions = new Set<string>();
  for (const id of next) {
    const doc = await ctx.db.get(id);
    if (!doc) continue;
    const instr = instructionOf(normalizeState(doc.state));
    if (instr) libraryInstructions.add(instr);
  }
  for (const doc of authored) {
    if (doc.isOfficial || inLibrary.has(doc._id)) continue;
    if (resolveVisibility(doc) !== 'private') continue;
    if (matchesStockDefault(doc.name, normalizeState(doc.state))) {
      await ctx.db.delete(doc._id);
      continue;
    }
    if (seenName.has(doc.name.toLowerCase())) {
      await ctx.db.delete(doc._id);
      continue;
    }
    const instr = instructionOf(normalizeState(doc.state));
    if (instr && libraryInstructions.has(instr)) {
      await ctx.db.delete(doc._id);
    }
  }

  const byInstruction = new Map<string, Doc<'states'>[]>();
  for (const id of next) {
    const doc = await ctx.db.get(id);
    if (!doc || doc.isOfficial || doc.authorWorkosId !== workosId) continue;
    if (resolveVisibility(doc) !== 'private') continue;
    const instr = instructionOf(normalizeState(doc.state));
    if (!instr) continue;
    const list = byInstruction.get(instr) ?? [];
    list.push(doc);
    byInstruction.set(instr, list);
  }
  const dropIds = new Set<string>();
  for (const group of byInstruction.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    for (const extra of group.slice(1)) {
      dropIds.add(extra._id);
      await ctx.db.delete(extra._id);
    }
  }
  const collapsed = next.filter((id) => !dropIds.has(id));

  await replaceLibraryStateIds(ctx, workosId, collapsed);
  return collapsed;
}

/**
 * Ensure M:N library exists. Empty libraries get official defaults.
 */
export async function resolveLibraryIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
  displayName: string
): Promise<Id<'states'>[]> {
  await migrateLegacyUserStates(ctx, workosId, displayName);

  const membershipIds = await listLibraryStateIds(ctx, workosId);
  if (membershipIds.length > 0) {
    return await reconcileLibraryIds(ctx, workosId, membershipIds);
  }

  const official = await officialIdByKey(ctx);
  const libraryIds = [...official.values()];
  if (libraryIds.length === 0) return [];
  await replaceLibraryStateIds(ctx, workosId, libraryIds);
  return await reconcileLibraryIds(ctx, workosId, libraryIds);
}

const libraryItemValidator = v.object({
  id: v.id('states'),
  name: v.string(),
  description: v.string(),
  visibility: v.union(v.literal('public'), v.literal('private')),
  isOfficial: v.boolean(),
  isOwner: v.boolean(),
  state: stateValueValidator,
});

export const getMyStates = query({
  args: {},
  returns: v.union(
    v.object({
      states: v.record(v.string(), stateValueValidator),
      library: v.array(libraryItemValidator),
      defaultNames: v.array(v.string()),
      updatedAt: v.optional(v.number()),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const workosId = identity.subject;
    const subscribed = await userHasActiveSubscription(ctx, workosId);
    let libraryIds = await listLibraryStateIds(ctx, workosId);

    if (libraryIds.length === 0) {
      const official = await officialIdByKey(ctx);
      libraryIds = subscribed
        ? [...official.values()]
        : FREE_STATE_NAMES.map((n) => official.get(n)).filter(Boolean) as Id<'states'>[];
    }

    const states: Record<string, StateValue> = {};
    const library = [];
    for (const id of libraryIds) {
      const doc = await ctx.db.get(id);
      if (!doc) continue;
      if (!subscribed && !isFreeStateName(doc.name)) continue;
      const visibility = resolveVisibility(doc);
      const state = {
        ...normalizeState(doc.state),
        visibility,
        description:
          normalizeState(doc.state).description ||
          normalizeState(doc.state).desc ||
          doc.description,
      };
      states[doc.name] = state;
      library.push({
        id: doc._id,
        name: doc.name,
        description: doc.description,
        visibility,
        isOfficial: Boolean(doc.isOfficial),
        isOwner: doc.authorWorkosId === workosId,
        state,
      });
    }

    // Guarantee free defaults are present even if library was empty/mis-seeded.
    if (!subscribed) {
      const official = await officialIdByKey(ctx);
      for (const name of FREE_STATE_NAMES) {
        if (states[name]) continue;
        const id = official.get(name);
        if (!id) continue;
        const doc = await ctx.db.get(id);
        if (!doc) continue;
        const visibility = resolveVisibility(doc);
        const state = {
          ...normalizeState(doc.state),
          visibility,
          description:
            normalizeState(doc.state).description ||
            normalizeState(doc.state).desc ||
            doc.description,
        };
        states[doc.name] = state;
        library.push({
          id: doc._id,
          name: doc.name,
          description: doc.description,
          visibility,
          isOfficial: Boolean(doc.isOfficial),
          isOwner: false,
          state,
        });
      }
    }

    return {
      states,
      library,
      defaultNames: subscribed ? defaultStateNames() : [...FREE_STATE_NAMES],
      updatedAt: undefined,
    };
  },
});

export const ensureMyLibrary = mutation({
  args: {},
  returns: v.object({ count: v.number() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Authentication required');
    const user = await ensureUserFromIdentity(ctx, identity);
    const ids = await resolveLibraryIds(ctx, identity.subject, resolveDisplayName(user));
    return { count: ids.length };
  },
});

export const saveMyStates = mutation({
  args: {
    states: v.record(v.string(), stateValueValidator),
  },
  returns: v.object({
    states: v.record(v.string(), stateValueValidator),
    library: v.array(libraryItemValidator),
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Authentication required');

    const workosId = identity.subject;
    const subscribed = await userHasActiveSubscription(ctx, workosId);
    const user = await ensureUserFromIdentity(ctx, identity);
    const displayName = resolveDisplayName(user);
    const now = Date.now();
    const incomingRaw = normalizeStates(args.states);
    const incoming = subscribed
      ? incomingRaw
      : Object.fromEntries(
          Object.entries(incomingRaw).filter(([name]) => isFreeStateName(name)),
        );

    if (!subscribed) {
      for (const [name, value] of Object.entries(incomingRaw)) {
        if (value.visibility === 'public') {
          throw new Error('Subscribe to PROXY to publish states.');
        }
        if (!isFreeStateName(name)) {
          throw new Error(
            'Free accounts can only use Simplify, List, and Critique. Subscribe to create more states.',
          );
        }
      }
    }

    const official = await officialIdByKey(ctx);

    let previousIds = await resolveLibraryIds(ctx, workosId, displayName);

    const ownedByName = new Map<string, Doc<'states'>>();
    const nonOwnedByName = new Map<string, Doc<'states'>>();
    for (const id of previousIds) {
      const doc = await ctx.db.get(id);
      if (!doc) continue;
      if (doc.isOfficial || doc.authorWorkosId !== workosId) {
        nonOwnedByName.set(doc.name.toLowerCase(), doc);
      } else {
        ownedByName.set(doc.name.toLowerCase(), doc);
      }
    }

    const nextIds: Id<'states'>[] = [];
    const seenNames = new Set<string>();
    type Pending = {
      key: string;
      lower: string;
      visibility: Visibility;
      stateBody: StateValue;
      description: string;
      value: StateValue;
    };
    const pendingInserts: Pending[] = [];

    for (const [name, value] of Object.entries(incoming)) {
      const key = name.trim();
      if (!key) continue;
      const lower = key.toLowerCase();
      if (seenNames.has(lower)) continue;
      seenNames.add(lower);

      const visibility: Visibility =
        value.visibility === 'public' ? 'public' : 'private';
      const stateBody = statePayloadWithoutVisibility(value);
      const description = value.description || value.desc || key;

      if (matchesStockDefault(key, value)) {
        const officialId = official.get(key);
        if (officialId) {
          const owned = ownedByName.get(lower);
          if (owned) {
            ownedByName.delete(lower);
            if (resolveVisibility(owned) === 'private') {
              await ctx.db.delete(owned._id);
            }
          }
          nonOwnedByName.delete(lower);
          nextIds.push(officialId);
          continue;
        }
      }

      if (!subscribed) {
        // Free: only official free-state refs — never create custom docs.
        const officialId = official.get(key);
        if (officialId && isFreeStateName(key)) {
          nextIds.push(officialId);
        }
        continue;
      }

      const existing = ownedByName.get(lower);
      if (existing) {
        await ctx.db.patch(existing._id, {
          name: key,
          description,
          state: stateBody,
          visibility,
          updatedAt: now,
        });
        nextIds.push(existing._id);
        ownedByName.delete(lower);
        continue;
      }

      // Keep gallery / official / others' states as library references.
      // Never apply the client's visibility (or content) to someone else's doc.
      const shared = nonOwnedByName.get(lower);
      if (shared) {
        nextIds.push(shared._id);
        nonOwnedByName.delete(lower);
        continue;
      }

      pendingInserts.push({
        key,
        lower,
        visibility,
        stateBody,
        description,
        value,
      });
    }

    // Ensure free users always keep the three default official states.
    if (!subscribed) {
      for (const name of FREE_STATE_NAMES) {
        const id = official.get(name);
        if (id && !nextIds.includes(id)) nextIds.push(id);
      }
    }

    for (const item of pendingInserts) {
      const wantInstr = instructionOf(item.value);
      let renamed: Doc<'states'> | null = null;
      if (wantInstr) {
        for (const [ownedLower, doc] of ownedByName) {
          if (instructionOf(normalizeState(doc.state)) === wantInstr) {
            renamed = doc;
            ownedByName.delete(ownedLower);
            break;
          }
        }
      }

      if (renamed) {
        await ctx.db.patch(renamed._id, {
          name: item.key,
          description: item.description,
          state: item.stateBody,
          visibility: item.visibility,
          updatedAt: now,
        });
        nextIds.push(renamed._id);
      } else {
        const id = await ctx.db.insert('states', {
          name: item.key,
          description: item.description,
          authorWorkosId: workosId,
          authorDisplayName: displayName,
          state: item.stateBody,
          tags: [],
          visibility: item.visibility,
          saveCount: 0,
          starCount: 0,
          isOfficial: false,
          createdAt: now,
          updatedAt: now,
        });
        nextIds.push(id);
      }
    }

    for (const leftover of ownedByName.values()) {
      if (resolveVisibility(leftover) === 'private') {
        await ctx.db.delete(leftover._id);
      }
    }

    const reconciled = await reconcileLibraryIds(ctx, workosId, nextIds);

    const states: Record<string, StateValue> = {};
    const library = [];
    for (const id of reconciled) {
      const doc = await ctx.db.get(id);
      if (!doc) continue;
      const visibility = resolveVisibility(doc);
      const state = { ...normalizeState(doc.state), visibility };
      states[doc.name] = state;
      library.push({
        id: doc._id,
        name: doc.name,
        description: doc.description,
        visibility,
        isOfficial: Boolean(doc.isOfficial),
        isOwner: doc.authorWorkosId === workosId,
        state,
      });
    }

    return { states, library, updatedAt: now };
  },
});

export const removeMyState = mutation({
  args: {
    name: v.optional(v.string()),
    stateId: v.optional(v.id('states')),
  },
  returns: v.object({
    states: v.record(v.string(), stateValueValidator),
    library: v.array(libraryItemValidator),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Authentication required');

    const workosId = identity.subject;
    const user = await ensureUserFromIdentity(ctx, identity);
    const displayName = resolveDisplayName(user);
    let libraryIds = await resolveLibraryIds(ctx, workosId, displayName);

    let targetId = args.stateId;
    if (!targetId && args.name) {
      const want = args.name.trim().toLowerCase();
      for (const id of libraryIds) {
        const doc = await ctx.db.get(id);
        if (doc && doc.name.toLowerCase() === want) {
          targetId = id;
          break;
        }
      }
    }
    if (!targetId) throw new Error('State not found in your library');

    const doc = await ctx.db.get(targetId);
    libraryIds = libraryIds.filter((id) => id !== targetId);

    if (
      doc &&
      doc.authorWorkosId === workosId &&
      !doc.isOfficial &&
      resolveVisibility(doc) === 'private'
    ) {
      await ctx.db.delete(targetId);
    }

    await replaceLibraryStateIds(ctx, workosId, libraryIds);

    const states: Record<string, StateValue> = {};
    const library = [];
    for (const id of libraryIds) {
      const d = await ctx.db.get(id);
      if (!d) continue;
      const visibility = resolveVisibility(d);
      const state = { ...normalizeState(d.state), visibility };
      states[d.name] = state;
      library.push({
        id: d._id,
        name: d.name,
        description: d.description,
        visibility,
        isOfficial: Boolean(d.isOfficial),
        isOwner: d.authorWorkosId === workosId,
        state,
      });
    }
    return { states, library };
  },
});

export const setMyStateVisibility = mutation({
  args: {
    stateId: v.id('states'),
    visibility: v.union(v.literal('public'), v.literal('private')),
  },
  returns: v.object({ visibility: v.union(v.literal('public'), v.literal('private')) }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Authentication required');
    if (args.visibility === 'public') {
      await requireActiveSubscription(
        ctx,
        identity.subject,
        'publish states',
      );
    }
    const doc = await ctx.db.get(args.stateId);
    if (!doc) throw new Error('State not found');
    if (doc.isOfficial) throw new Error('Official states cannot change visibility');
    if (doc.authorWorkosId !== identity.subject) {
      throw new Error('You can only change visibility on your own states');
    }
    await ctx.db.patch(doc._id, {
      visibility: args.visibility,
      updatedAt: Date.now(),
    });
    return { visibility: args.visibility };
  },
});

export const addToLibrary = mutation({
  args: { stateId: v.id('states') },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Sign in to save a state');

    const doc = await ctx.db.get(args.stateId);
    if (!doc) throw new Error('State not found');
    if (resolveVisibility(doc) !== 'public' && doc.authorWorkosId !== identity.subject) {
      throw new Error('This state is private');
    }

    const subscribed = await userHasActiveSubscription(ctx, identity.subject);
    if (!subscribed && !isFreeStateName(doc.name)) {
      throw new Error(
        'Free accounts can only use Simplify, List, and Critique. Subscribe to save more states.',
      );
    }

    const user = await ensureUserFromIdentity(ctx, identity);
    await resolveLibraryIds(ctx, identity.subject, resolveDisplayName(user));
    const added = await addLibraryMembership(ctx, identity.subject, args.stateId);
    if (added) {
      await ctx.db.patch(doc._id, {
        saveCount: (doc.saveCount ?? 0) + 1,
        updatedAt: Date.now(),
      });
    }
    return { ok: true as const };
  },
});

/** Ensure every non-official state has a library row for its author. */
export const repairAuthorLibraryMemberships = mutation({
  args: {},
  returns: v.object({ added: v.number() }),
  handler: async (ctx) => {
    const all = await ctx.db.query('states').collect();
    let added = 0;
    for (const doc of all) {
      if (doc.isOfficial) continue;
      const exists = await ctx.db
        .query('userStates')
        .withIndex('by_user_state', (q) =>
          q.eq('workosId', doc.authorWorkosId).eq('stateId', doc._id)
        )
        .first();
      if (exists) continue;
      await ctx.db.insert('userStates', {
        workosId: doc.authorWorkosId,
        stateId: doc._id,
        createdAt: doc.createdAt,
      });
      added += 1;
    }
    return { added };
  },
});
