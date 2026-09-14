import { convexSiteUrl } from '../lib/convexUrls'

const claimedKey = (workosId?: string) =>
  workosId ? `proxy:signupClaimed:${workosId}` : 'proxy:signupClaimed'

/** Bind free-tier signup to the request IP (server-side). Idempotent per user. */
export async function claimSignupQuota(
  getAccessToken: () => Promise<string | null | undefined>,
  workosId?: string,
) {
  try {
    const key = claimedKey(workosId)
    if (sessionStorage.getItem(key) === '1') return { ok: true as const, cached: true }

    const token = await getAccessToken()
    if (!token) return { ok: false as const, reason: 'no_token' }

    const res = await fetch(`${convexSiteUrl}/auth/claim-signup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (res.ok) {
      sessionStorage.setItem(key, '1')
      return { ok: true as const }
    }

    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
    return {
      ok: false as const,
      status: res.status,
      error: data.error,
      code: data.code,
    }
  } catch (err) {
    console.error('[signup] claim failed', err)
    return { ok: false as const, reason: 'network' }
  }
}
