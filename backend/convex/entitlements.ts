import { isSubscriptionActive } from './plans';

type SubRow = { status: string } | null;

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
