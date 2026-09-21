import {
  BETA_ACTIVE_STATE_LIMIT,
  FREE_ACTIVE_STATE_LIMIT,
  isSubscriptionActive,
} from './plans';

type SubRow = { status: string } | null;

export type StateTier = 'free' | 'beta' | 'paid';

export type StateEntitlements = {
  tier: StateTier;
  /** null = unlimited (paid). */
  activeLimit: number | null;
  canCreateStates: boolean;
  canPublishStates: boolean;
};

/** Look up subscription by workosId, then by user email. */
export async function findSubscriptionForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
): Promise<SubRow> {
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

export async function userHasActiveSubscription(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
): Promise<boolean> {
  const sub = await findSubscriptionForUser(ctx, workosId);
  return isSubscriptionActive(sub?.status);
}

export async function resolveStateEntitlements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
): Promise<StateEntitlements> {
  if (await userHasActiveSubscription(ctx, workosId)) {
    return {
      tier: 'paid',
      activeLimit: null,
      canCreateStates: true,
      canPublishStates: true,
    };
  }

  const user = await ctx.db
    .query('users')
    .withIndex('by_workos_id', (q: any) => q.eq('workosId', workosId))
    .first();

  if (user?.betaTester) {
    return {
      tier: 'beta',
      activeLimit: BETA_ACTIVE_STATE_LIMIT,
      canCreateStates: true,
      canPublishStates: false,
    };
  }

  return {
    tier: 'free',
    activeLimit: FREE_ACTIVE_STATE_LIMIT,
    canCreateStates: false,
    canPublishStates: false,
  };
}

export function activeStateLimitMessage(tier: StateTier): string {
  if (tier === 'free') return 'Free accounts can have up to 3 active States.';
  if (tier === 'beta') return 'Beta accounts can have up to 5 active States.';
  return '';
}

export async function requireActiveSubscription(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
  action = 'create or publish states',
): Promise<void> {
  const ok = await userHasActiveSubscription(ctx, workosId);
  if (!ok) {
    throw new Error(`Subscribe to PROXY to ${action}.`);
  }
}

export async function requireCanCreateStates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: { db: any },
  workosId: string,
): Promise<StateEntitlements> {
  const entitlements = await resolveStateEntitlements(ctx, workosId);
  if (!entitlements.canCreateStates) {
    throw new Error(
      'Free accounts cannot create custom States. Activate up to 3 official States, or subscribe / get beta access to create your own.',
    );
  }
  return entitlements;
}
