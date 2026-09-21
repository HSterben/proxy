import { mutation, query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { v } from 'convex/values';
import {
  DEFAULT_STATES,
  DEFAULT_STATE_TAGS,
  OFFICIAL_AUTHOR_ID,
  OFFICIAL_AUTHOR_NAME,
  defaultStateNames,
  isDefaultStateName,
  isReplaceableDefaultClone,
  normalizeTags,
} from './defaultStates';
import {
  ensureUserFromIdentity,
  resolveDisplayName,
} from './users';
import {
  requireActiveSubscription,
  resolveStateEntitlements,
  activeStateLimitMessage,
  userHasActiveSubscription,
} from './entitlements';
import { LEGACY_FREE_STATE_NAMES, isFreeStateName } from './plans';

/** One chat "state" (preset), flexible fields match desktop presets JSON. */
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
  return isReplaceableDefaultClone(name, value);
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

/** Keep official PROXY defaults aligned with DEFAULT_STATES (prompt / params). */
export async function upsertOfficialDefaultStates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
): Promise<number> {
  const now = Date.now();
  let upserted = 0;

  for (const [name, value] of Object.entries(DEFAULT_STATES)) {
    const existing = await ctx.db
      .query('states')
      .withIndex('by_official_key', (q: any) => q.eq('officialKey', name))
      .first();

    const description = value.description || name;
    const state = normalizeState(value);
    const tags = normalizeTags(DEFAULT_STATE_TAGS[name]);

    if (existing) {
      const prev = normalizeState(existing.state);
      const sameInstruction =
        instructionOf(prev) === instructionOf(state) &&
        (prev.description || existing.description || '') === (state.description || description);
      if (
        sameInstruction &&
        existing.name === name &&
        existing.isOfficial &&
        existing.officialKey === name
      ) {
        continue;
      }
      await ctx.db.patch(existing._id, {
        name,
        description,
        state,
        tags,
        visibility: 'public',
        authorWorkosId: OFFICIAL_AUTHOR_ID,
        authorDisplayName: OFFICIAL_AUTHOR_NAME,
        isOfficial: true,
        officialKey: name,
        updatedAt: now,
        starCount: existing.starCount ?? 0,
        saveCount: existing.saveCount ?? 0,
      });
    } else {
      await ctx.db.insert('states', {
        name,
        description,
        authorWorkosId: OFFICIAL_AUTHOR_ID,
        authorDisplayName: OFFICIAL_AUTHOR_NAME,
        state,
        tags,
        visibility: 'public',
        saveCount: 0,
        starCount: 0,
        isOfficial: true,
        officialKey: name,
        createdAt: now,
        updatedAt: now,
      });
    }
    upserted += 1;
  }

  return upserted;
}

/** All official States are available in every user's library (access ≠ active). */
async function officialSeedIdsForPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  _subscribed?: boolean,
): Promise<Id<'states'>[]> {
  const official = await officialIdByKey(ctx);
  return [...official.values()];
}

/**
 * Ensure every official PROXY default is in the user's library.
 * Does not remove custom or gallery saves. Activation is separate (`isActive`).
 */
export async function syncOfficialLibraryForPlan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
  _subscribed?: boolean,
): Promise<Id<'states'>[]> {
  const current = await listLibraryStateIds(ctx, workosId);
  const required = await officialSeedIdsForPlan(ctx);
  const kept = [...current];
  for (const id of required) {
    if (!kept.includes(id)) kept.push(id);
  }

  const changed =
    kept.length !== current.length || kept.some((id, i) => id !== current[i]);
  if (changed) {
    await replaceLibraryStateIds(ctx, workosId, kept);
  }
  await ensureActiveSlots(ctx, workosId);
  return await listLibraryStateIds(ctx, workosId);
}

async function listMembershipRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
): Promise<Doc<'userStates'>[]> {
  return await ctx.db
    .query('userStates')
    .withIndex('by_workos_id', (q: any) => q.eq('workosId', workosId))
    .collect();
}

async function activeMembershipCount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
): Promise<number> {
  const rows = await listMembershipRows(ctx, workosId);
  return rows.filter((r) => r.stateId && r.isActive === true).length;
}

/**
 * Migrate undefined `isActive` flags and enforce the plan's active-slot cap.
 * Prefers the legacy free trio when first assigning actives.
 */
async function ensureActiveSlots(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
): Promise<void> {
  const entitlements = await resolveStateEntitlements(ctx, workosId);
  const rows = (await listMembershipRows(ctx, workosId)).filter((r) => r.stateId);
  if (rows.length === 0) return;

  const now = Date.now();
  const anyFlagged = rows.some(
    (r) => r.isActive === true || r.isActive === false,
  );

  if (!anyFlagged) {
    const official = await officialIdByKey(ctx);
    const preferred = new Set(
      LEGACY_FREE_STATE_NAMES.map((n) => official.get(n))
        .filter(Boolean)
        .map(String),
    );
    const ordered = [
      ...rows.filter((r) => preferred.has(String(r.stateId))),
      ...rows.filter((r) => !preferred.has(String(r.stateId))),
    ];
    const limit =
      entitlements.activeLimit == null
        ? ordered.length
        : Math.min(entitlements.activeLimit, ordered.length);
    for (let i = 0; i < ordered.length; i++) {
      await ctx.db.patch(ordered[i]._id, {
        isActive: i < limit,
        updatedAt: now,
      });
    }
    return;
  }

  for (const row of rows) {
    if (row.isActive === undefined) {
      await ctx.db.patch(row._id, { isActive: false, updatedAt: now });
    }
  }

  if (entitlements.activeLimit != null) {
    const refreshed = (await listMembershipRows(ctx, workosId)).filter(
      (r) => r.stateId && r.isActive === true,
    );
    if (refreshed.length > entitlements.activeLimit) {
      refreshed.sort((a, b) => a.createdAt - b.createdAt);
      for (const row of refreshed.slice(entitlements.activeLimit)) {
        await ctx.db.patch(row._id, { isActive: false, updatedAt: now });
      }
    }
  }
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
      isActive: false,
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
    isActive: false,
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
  const subscribed = await userHasActiveSubscription(ctx, workosId);
  const next: Id<'states'>[] = [];
  const chosenByName = new Map<string, Id<'states'>>();

  const choose = async (lower: string, id: Id<'states'>, doc: Doc<'states'>) => {
    const existingId = chosenByName.get(lower);
    if (!existingId) {
      chosenByName.set(lower, id);
      next.push(id);
      return;
    }
    if (existingId === id) return;
    const existing = await ctx.db.get(existingId);
    // Prefer official when two docs share a name.
    if (doc.isOfficial && existing && !existing.isOfficial) {
      const idx = next.indexOf(existingId);
      if (idx >= 0) next[idx] = id;
      chosenByName.set(lower, id);
      if (
        existing.authorWorkosId === workosId &&
        resolveVisibility(existing) === 'private'
      ) {
        await ctx.db.delete(existing._id);
      }
      return;
    }
    if (
      doc.authorWorkosId === workosId &&
      !doc.isOfficial &&
      resolveVisibility(doc) === 'private'
    ) {
      await ctx.db.delete(doc._id);
    }
  };

  for (const id of libraryIds) {
    const doc = await ctx.db.get(id);
    if (!doc) continue;

    const lower = doc.name.toLowerCase();
    const owned = doc.authorWorkosId === workosId && !doc.isOfficial;
    const officialId = official.get(doc.name);
    const forceOfficialFree =
      !subscribed && owned && isFreeStateName(doc.name) && Boolean(officialId);
    const replaceableClone =
      owned && officialId && matchesStockDefault(doc.name, normalizeState(doc.state));

    if ((forceOfficialFree || replaceableClone) && officialId) {
      if (resolveVisibility(doc) === 'private') {
        await ctx.db.delete(doc._id);
      }
      await choose(lower, officialId, (await ctx.db.get(officialId))!);
      continue;
    }

    await choose(lower, doc._id, doc);
  }

  const seenName = new Set(chosenByName.keys());

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
    if (!subscribed && isFreeStateName(doc.name)) {
      await ctx.db.delete(doc._id);
      continue;
    }
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
 * Ensure M:N library exists. Empty libraries get plan-appropriate official defaults.
 */
export async function resolveLibraryIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
  displayName: string
): Promise<Id<'states'>[]> {
  await migrateLegacyUserStates(ctx, workosId, displayName);

  const membershipIds = await listLibraryStateIds(ctx, workosId);
  if (membershipIds.length === 0) {
    const seed = await officialSeedIdsForPlan(ctx);
    if (seed.length === 0) return [];
    await replaceLibraryStateIds(ctx, workosId, seed);
    const reconciled = await reconcileLibraryIds(ctx, workosId, seed);
    await ensureActiveSlots(ctx, workosId);
    return reconciled;
  }

  const synced = await syncOfficialLibraryForPlan(ctx, workosId);
  return await reconcileLibraryIds(ctx, workosId, synced);
}

const libraryItemValidator = v.object({
  id: v.id('states'),
  name: v.string(),
  description: v.string(),
  visibility: v.union(v.literal('public'), v.literal('private')),
  isOfficial: v.boolean(),
  isOwner: v.boolean(),
  isActive: v.boolean(),
  state: stateValueValidator,
});

export const getMyStates = query({
  args: {},
  returns: v.union(
    v.object({
      /** Active States only, safe for chat pickers / local chat cache. */
      states: v.record(v.string(), stateValueValidator),
      library: v.array(libraryItemValidator),
      defaultNames: v.array(v.string()),
      activeCount: v.number(),
      activeLimit: v.union(v.number(), v.null()),
      tier: v.union(v.literal('free'), v.literal('beta'), v.literal('paid')),
      canCreateStates: v.boolean(),
      updatedAt: v.optional(v.number()),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const workosId = identity.subject;
    const entitlements = await resolveStateEntitlements(ctx, workosId);
    const official = await officialIdByKey(ctx);
    let libraryIds = await listLibraryStateIds(ctx, workosId);

    // Read-only: show all official when empty (mutations live in ensureMyLibrary).
    if (libraryIds.length === 0) {
      libraryIds = await officialSeedIdsForPlan(ctx);
    } else {
      const required = await officialSeedIdsForPlan(ctx);
      const have = new Set(libraryIds.map(String));
      for (const id of required) {
        if (!have.has(id)) libraryIds.push(id);
      }
    }

    const membershipByState = new Map<string, boolean>();
    const membershipRows = await listMembershipRows(ctx, workosId);
    for (const row of membershipRows) {
      if (row.stateId) {
        membershipByState.set(row.stateId, row.isActive === true);
      }
    }

    const library: Array<{
      id: Id<'states'>;
      name: string;
      description: string;
      visibility: Visibility;
      isOfficial: boolean;
      isOwner: boolean;
      isActive: boolean;
      state: StateValue & { visibility: Visibility; description?: string };
    }> = [];
    const usedNames = new Set<string>();

    const pushDoc = (doc: Doc<'states'>, isActive: boolean) => {
      const lower = doc.name.toLowerCase();
      const visibility = resolveVisibility(doc);
      const state = {
        ...normalizeState(doc.state),
        visibility,
        description:
          normalizeState(doc.state).description ||
          normalizeState(doc.state).desc ||
          doc.description,
      };
      if (usedNames.has(lower) && !doc.isOfficial) return;
      if (usedNames.has(lower) && doc.isOfficial) {
        const idx = library.findIndex((row) => row.name.toLowerCase() === lower);
        if (idx >= 0) library.splice(idx, 1);
      }
      usedNames.add(lower);
      library.push({
        id: doc._id,
        name: doc.name,
        description: doc.description,
        visibility,
        isOfficial: Boolean(doc.isOfficial),
        isOwner: doc.authorWorkosId === workosId,
        isActive,
        state,
      });
    };

    const officialFirst: Doc<'states'>[] = [];
    const rest: Doc<'states'>[] = [];
    for (const id of libraryIds) {
      const doc = await ctx.db.get(id);
      if (!doc) continue;
      if (
        !doc.isOfficial &&
        isDefaultStateName(doc.name) &&
        matchesStockDefault(doc.name, normalizeState(doc.state))
      ) {
        const officialId = official.get(doc.name);
        const officialDoc = officialId ? await ctx.db.get(officialId) : null;
        if (officialDoc) {
          officialFirst.push(officialDoc);
          continue;
        }
      }
      if (doc.isOfficial) officialFirst.push(doc);
      else rest.push(doc);
    }

    const seenIds = new Set<string>();
    for (const doc of [...officialFirst, ...rest]) {
      if (seenIds.has(doc._id)) continue;
      seenIds.add(doc._id);
      const isActive = membershipByState.get(doc._id) === true;
      pushDoc(doc, isActive);
    }

    // Rebuild active states map cleanly after possible name collisions.
    const activeStates: Record<string, StateValue> = {};
    for (const item of library) {
      if (item.isActive) activeStates[item.name] = item.state;
    }

    return {
      states: activeStates,
      library,
      defaultNames: defaultStateNames(),
      activeCount: library.filter((i) => i.isActive).length,
      activeLimit: entitlements.activeLimit,
      tier: entitlements.tier,
      canCreateStates: entitlements.canCreateStates,
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
    await upsertOfficialDefaultStates(ctx);
    const user = await ensureUserFromIdentity(ctx, identity);
    const ids = await resolveLibraryIds(ctx, identity.subject, resolveDisplayName(user));
    return { count: ids.length };
  },
});

async function buildLibraryResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
  entitlements: Awaited<ReturnType<typeof resolveStateEntitlements>>,
  updatedAt?: number,
) {
  const membershipByState = new Map<string, boolean>();
  for (const row of await listMembershipRows(ctx, workosId)) {
    if (row.stateId) membershipByState.set(row.stateId, row.isActive === true);
  }
  const libraryIds = await listLibraryStateIds(ctx, workosId);
  const states: Record<string, StateValue> = {};
  const library = [];
  for (const id of libraryIds) {
    const doc = await ctx.db.get(id);
    if (!doc) continue;
    const visibility = resolveVisibility(doc);
    const state = { ...normalizeState(doc.state), visibility };
    const isActive = membershipByState.get(id) === true;
    if (isActive) states[doc.name] = state;
    library.push({
      id: doc._id,
      name: doc.name,
      description: doc.description,
      visibility,
      isOfficial: Boolean(doc.isOfficial),
      isOwner: doc.authorWorkosId === workosId,
      isActive,
      state,
    });
  }
  return {
    states,
    library,
    activeCount: library.filter((i) => i.isActive).length,
    activeLimit: entitlements.activeLimit,
    updatedAt: updatedAt ?? Date.now(),
  };
}

export const saveMyStates = mutation({
  args: {
    states: v.record(v.string(), stateValueValidator),
  },
  returns: v.object({
    states: v.record(v.string(), stateValueValidator),
    library: v.array(libraryItemValidator),
    activeCount: v.number(),
    activeLimit: v.union(v.number(), v.null()),
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Authentication required');

    const workosId = identity.subject;
    const entitlements = await resolveStateEntitlements(ctx, workosId);
    const user = await ensureUserFromIdentity(ctx, identity);
    const displayName = resolveDisplayName(user);
    const now = Date.now();
    const incomingRaw = normalizeStates(args.states);
    const official = await officialIdByKey(ctx);

    for (const [name, value] of Object.entries(incomingRaw)) {
      if (value.visibility === 'public' && !entitlements.canPublishStates) {
        throw new Error('Subscribe to PROXY to publish states.');
      }
      const isOfficialName = [...official.keys()].some(
        (k) => k.toLowerCase() === name.trim().toLowerCase(),
      );
      if (!entitlements.canCreateStates && !isOfficialName) {
        throw new Error(
          'Free accounts cannot create custom States. Activate up to 3 official States, or subscribe / get beta access to create your own.',
        );
      }
    }

    // Free: only touch official refs from the payload (no custom docs).
    const incoming = entitlements.canCreateStates
      ? incomingRaw
      : Object.fromEntries(
          Object.entries(incomingRaw).filter(([name]) =>
            [...official.keys()].some(
              (k) => k.toLowerCase() === name.trim().toLowerCase(),
            ),
          ),
        );

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

      if (!entitlements.canCreateStates) {
        const officialId = official.get(key);
        if (officialId) nextIds.push(officialId);
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

    // Keep library members not mentioned in the payload (inactive official, etc.).
    for (const id of previousIds) {
      if (!nextIds.includes(id)) nextIds.push(id);
    }
    // Always keep every official State accessible.
    for (const id of official.values()) {
      if (!nextIds.includes(id)) nextIds.push(id);
    }

    if (entitlements.canCreateStates) {
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
    }

    const reconciled = await reconcileLibraryIds(ctx, workosId, nextIds);
    await ensureActiveSlots(ctx, workosId);
    return await buildLibraryResponse(ctx, workosId, entitlements, now);
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
    activeCount: v.number(),
    activeLimit: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Authentication required');

    const workosId = identity.subject;
    const entitlements = await resolveStateEntitlements(ctx, workosId);
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
    if (doc && (doc.isOfficial || Boolean(doc.officialKey))) {
      // Official States stay accessible; deactivate instead of removing.
      const row = await ctx.db
        .query('userStates')
        .withIndex('by_user_state', (q) =>
          q.eq('workosId', workosId).eq('stateId', targetId),
        )
        .first();
      if (row) {
        await ctx.db.patch(row._id, {
          isActive: false,
          updatedAt: Date.now(),
        });
      }
      return await buildLibraryResponse(ctx, workosId, entitlements);
    }

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
    await ensureActiveSlots(ctx, workosId);
    return await buildLibraryResponse(ctx, workosId, entitlements);
  },
});

/** Activate or deactivate a library State (slot-limited by plan). Atomic. */
export const setStateActive = mutation({
  args: {
    stateId: v.id('states'),
    active: v.boolean(),
  },
  returns: v.object({
    states: v.record(v.string(), stateValueValidator),
    library: v.array(libraryItemValidator),
    activeCount: v.number(),
    activeLimit: v.union(v.number(), v.null()),
    isActive: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Authentication required');

    const workosId = identity.subject;
    const entitlements = await resolveStateEntitlements(ctx, workosId);
    const user = await ensureUserFromIdentity(ctx, identity);
    await resolveLibraryIds(ctx, workosId, resolveDisplayName(user));

    const doc = await ctx.db.get(args.stateId);
    if (!doc) throw new Error('State not found');

    const row = await ctx.db
      .query('userStates')
      .withIndex('by_user_state', (q) =>
        q.eq('workosId', workosId).eq('stateId', args.stateId),
      )
      .first();
    if (!row) throw new Error('State is not in your library');

    if (args.active) {
      if (row.isActive === true) {
        const built = await buildLibraryResponse(ctx, workosId, entitlements);
        return { ...built, isActive: true };
      }
      if (entitlements.activeLimit != null) {
        const count = await activeMembershipCount(ctx, workosId);
        if (count >= entitlements.activeLimit) {
          throw new Error(activeStateLimitMessage(entitlements.tier));
        }
      }
      await ctx.db.patch(row._id, {
        isActive: true,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(row._id, {
        isActive: false,
        updatedAt: Date.now(),
      });
    }

    const built = await buildLibraryResponse(ctx, workosId, entitlements);
    return {
      ...built,
      isActive: args.active,
    };
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
        isActive: false,
        createdAt: doc.createdAt,
      });
      added += 1;
    }
    return { added };
  },
});
