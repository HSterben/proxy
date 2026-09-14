import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  users: defineTable({
    workosId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarStorageId: v.optional(v.id('_storage')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workos_id', ['workosId'])
    .index('by_email', ['email']),

  subscriptions: defineTable({
    workosId: v.optional(v.string()),
    email: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    status: v.string(),
    plan: v.optional(v.string()),
    currentPeriodEnd: v.optional(v.number()),
    priceId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workos_id', ['workosId'])
    .index('by_email', ['email'])
    .index('by_stripe_customer_id', ['stripeCustomerId'])
    .index('by_stripe_subscription_id', ['stripeSubscriptionId']),

  usage: defineTable({
    workosId: v.string(),
    usagePeriodStart: v.number(),
    weightedTokensUsed: v.number(),
    weightedTokenLimit: v.number(),
    inputTokensUsed: v.optional(v.number()),
    outputTokensUsed: v.optional(v.number()),
    updatedAt: v.number(),
  }).index('by_workos_id', ['workosId']),

  /**
   * Canonical chat states (presets). Visibility:
   * - public: searchable in the gallery
   * - private: author-only (default for new user-created states)
   */
  states: defineTable({
    name: v.string(),
    description: v.string(),
    authorWorkosId: v.string(),
    authorDisplayName: v.string(),
    state: v.any(),
    tags: v.optional(v.array(v.string())),
    visibility: v.union(v.literal('public'), v.literal('private')),
    saveCount: v.number(),
    starCount: v.optional(v.number()),
    isOfficial: v.optional(v.boolean()),
    officialKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_created', ['createdAt'])
    .index('by_author', ['authorWorkosId'])
    .index('by_official_key', ['officialKey'])
    .index('by_stars', ['starCount'])
    .index('by_visibility', ['visibility']),

  /**
   * M:N library membership — one row per (user, state).
   * Optional `states` / `updatedAt` remain so legacy blob rows on older
   * deployments can validate until migrateLegacyUserStates converts them.
   */
  userStates: defineTable({
    workosId: v.string(),
    stateId: v.optional(v.id('states')),
    states: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index('by_workos_id', ['workosId'])
    .index('by_state', ['stateId'])
    .index('by_user_state', ['workosId', 'stateId']),

  /** One star per user per state. */
  stateStars: defineTable({
    workosId: v.string(),
    stateId: v.id('states'),
    createdAt: v.number(),
  })
    .index('by_user_state', ['workosId', 'stateId'])
    .index('by_state', ['stateId']),

  /**
   * IP-hashed signup claims for free-tier anti-spam.
   * Max 2 new accounts per IP hash per UTC day.
   */
  signupClaims: defineTable({
    workosId: v.string(),
    ipHash: v.string(),
    dayKey: v.string(),
    createdAt: v.number(),
  })
    .index('by_workos_id', ['workosId'])
    .index('by_ip_day', ['ipHash', 'dayKey']),
});
