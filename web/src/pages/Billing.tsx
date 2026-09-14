import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ConvexClient } from 'convex/browser'
import { useAuth } from '../auth/AuthSessionProvider'
import { api } from '../convex/api'
import { convexSiteUrl, convexUrl } from '../lib/convexUrls'
import { userFacingError } from '../lib/userFacingError'

export default function Billing() {
  const { user, isLoading, signIn, getAccessToken } = useAuth()
  const convex = useRef(new ConvexClient(convexUrl))
  const [params] = useSearchParams()
  const checkout = params.get('checkout')
  const [plans, setPlans] = useState<{ monthly: string | null; yearly: string | null }>({
    monthly: null,
    yearly: null,
  })
  const [accountActive, setAccountActive] = useState<boolean | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${convexSiteUrl}/stripe/plans`)
      .then((r) => r.json())
      .then((data) => setPlans({ monthly: data.monthly ?? null, yearly: data.yearly ?? null }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) return
    convex.current.setAuth(async () => (await getAccessToken()) ?? null)
    void convex.current
      .query(api.account.getMyAccount, {})
      .then((data) => setAccountActive(Boolean((data as { subscriptionActive?: boolean })?.subscriptionActive)))
      .catch(() => setAccountActive(false))
  }, [user, getAccessToken])

  async function fetchWithAuth(path: string, body: object) {
    const token = await getAccessToken()
    const res = await fetch(`${convexSiteUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
    return data as { url?: string }
  }

  const startCheckout = async (priceId: string | null) => {
    if (!priceId) return
    setLoading(priceId)
    setError('')
    try {
      const data = await fetchWithAuth('/stripe/create-checkout-session-auth', {
        priceId,
        email: user?.email ?? undefined,
      })
      if (!data.url) throw new Error('No checkout URL returned')
      window.location.href = data.url
    } catch (err) {
      setError(userFacingError(err, 'Checkout failed'))
      setLoading(null)
    }
  }

  const openPortal = async () => {
    setLoading('portal')
    setError('')
    try {
      const data = await fetchWithAuth('/stripe/create-portal-session-auth', {})
      if (!data.url) throw new Error('No portal URL returned')
      window.location.href = data.url
    } catch (err) {
      setError(userFacingError(err, 'Could not open billing portal'))
      setLoading(null)
    }
  }

  if (isLoading) {
    return <div className="page py-20 text-ink/50">Loading…</div>
  }

  if (!user) {
    return (
      <div className="page flex min-h-[50vh] flex-col items-center justify-center gap-4 py-20 text-center">
          <h1 className="display text-2xl font-semibold">Sign in to manage billing</h1>
          <button
            type="button"
            className="pressable rounded-[10px] bg-black px-5 py-3 text-[15px] font-semibold text-white"
            onClick={() => void signIn({ state: { returnTo: '/account/billing' } })}
          >
            Log in
          </button>
      </div>
    )
  }

  return (
    <div className="page max-w-2xl py-12 md:py-16">
        <Link to="/account" className="text-[15px] text-ink/50 hover:text-ink">
          ← Account
        </Link>
        <p className="eyebrow mt-6">Billing</p>
        <h1 className="display mt-3 text-3xl font-semibold">Plan and payments</h1>

        {checkout === 'success' && (
          <p className="mt-6 rounded-[10px] border border-brand/30 bg-brand-surface px-4 py-3 text-[15px] text-ink">
            Payment received. Your subscription should activate within a minute.
          </p>
        )}
        {checkout === 'cancel' && (
          <p className="mt-6 rounded-[10px] border border-hairline bg-paper-muted px-4 py-3 text-[15px] text-ink/70">
            Checkout was cancelled. No charges were made.
          </p>
        )}
        {error && (
          <p className="mt-6 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[15px] text-red-800">
            {error}
          </p>
        )}

        <section className="card mt-8 p-6 md:p-8">
          {accountActive ? (
            <>
              <p className="text-[15px] text-ink/55">
                Your subscription is active. Update payment details or cancel anytime.
              </p>
              <button
                type="button"
                className="pressable mt-5 inline-flex min-h-11 items-center rounded-[10px] bg-black px-5 text-[15px] font-semibold text-white disabled:opacity-60"
                disabled={loading === 'portal'}
                onClick={() => void openPortal()}
              >
                {loading === 'portal' ? 'Opening…' : 'Open billing portal'}
              </button>
            </>
          ) : (
            <>
              <p className="text-[15px] text-ink/55">
                Choose monthly or yearly to chat on the web client and Windows app.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="pressable inline-flex min-h-11 items-center rounded-[10px] bg-black px-5 text-[15px] font-semibold text-white disabled:opacity-60"
                  disabled={!plans.monthly || Boolean(loading)}
                  onClick={() => void startCheckout(plans.monthly)}
                >
                  {loading === plans.monthly ? 'Opening…' : 'Subscribe monthly'}
                </button>
                <button
                  type="button"
                  className="pressable inline-flex min-h-11 items-center rounded-[10px] border border-hairline px-5 text-[15px] font-semibold text-ink disabled:opacity-60"
                  disabled={!plans.yearly || Boolean(loading)}
                  onClick={() => void startCheckout(plans.yearly)}
                >
                  {loading === plans.yearly ? 'Opening…' : 'Subscribe yearly'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
  )
}
