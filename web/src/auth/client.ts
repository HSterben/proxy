import { createClient } from '@workos-inc/authkit-js'

export type AuthClient = Awaited<ReturnType<typeof createClient>>

const REFRESH_TOKEN_KEY = 'workos:refresh-token'
const CODE_VERIFIER_KEY = 'workos:code-verifier'

export function workosRedirectUri() {
  return import.meta.env.VITE_WORKOS_REDIRECT_URI || `${window.location.origin}/auth/callback`
}

/** Absolute same-origin URL for AuthKit signOut `returnTo` (must match WorkOS Logout redirect allowlist). */
export function workosLogoutReturnTo(path = '/') {
  try {
    const url = new URL(path, window.location.origin)
    if (url.origin !== window.location.origin) {
      return `${window.location.origin}/`
    }
    return url.href
  } catch {
    return `${window.location.origin}/`
  }
}


export function workosDevMode() {
  const override = import.meta.env.VITE_WORKOS_DEV_MODE
  if (override === 'true') return true
  if (override === 'false') return false
  if (!import.meta.env.VITE_WORKOS_API_HOSTNAME) return true
  return Boolean(import.meta.env.DEV)
}

let clientPromise: Promise<AuthClient> | null = null
let initError: Error | null = null
let fetchPatched = false

export function getAuthInitError() {
  return initError
}

/** Dev-only: proxy WorkOS API through Vite to avoid browser CORS blocks. */
function patchFetchForDevProxy() {
  if (fetchPatched || !import.meta.env.DEV) return
  fetchPatched = true
  const orig = window.fetch.bind(window)
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const raw = String(input instanceof Request ? input.url : input)
    if (raw.includes('api.workos.com')) {
      const next = raw.replace('https://api.workos.com', window.location.origin)
      if (input instanceof Request) return orig(new Request(next, input), init)
      return orig(next, init)
    }
    return orig(input, init)
  }) as typeof fetch
}

export async function startWorkosSignIn(state?: { returnTo?: string }) {
  const client = await getAuthClient()
  await client.signIn({ state })
}

export async function switchWorkosAccount(state?: { returnTo?: string }) {
  const client = await getAuthClient()

  try {
    await client.signOut({
      navigate: false,
      returnTo: workosLogoutReturnTo(state?.returnTo || '/account'),
    })
  } catch {
    // Already signed out — continue to account picker.
  }

  window.localStorage.removeItem(REFRESH_TOKEN_KEY)
  window.sessionStorage.removeItem(CODE_VERIFIER_KEY)

  const url = await client.getSignInUrl({ state: state ?? { returnTo: '/account' } })
  const parsed = new URL(url)
  parsed.searchParams.set('prompt', 'select_account')
  window.location.assign(parsed.toString())
}

export function getAuthClient() {
  if (!clientPromise) {
    patchFetchForDevProxy()

    const clientId = import.meta.env.VITE_WORKOS_CLIENT_ID as string | undefined
    if (!clientId) {
      initError = new Error('Missing VITE_WORKOS_CLIENT_ID in web/.env')
      return Promise.reject(initError)
    }

    const apiHostname = import.meta.env.VITE_WORKOS_API_HOSTNAME as string | undefined

    clientPromise = createClient(clientId, {
      redirectUri: workosRedirectUri(),
      ...(apiHostname ? { apiHostname } : {}),
      devMode: workosDevMode(),
      onRedirectCallback: ({ state }) => {
        initError = null
        const returnTo =
          state && typeof state === 'object' && 'returnTo' in state && state.returnTo
            ? String(state.returnTo)
            : '/account'
        sessionStorage.setItem('auth:returnTo', returnTo)
      },
    })
      .then((client) => {
        if (client.getUser()) {
          initError = null
          return client
        }

        const onCallback =
          window.location.pathname === '/auth/callback' ||
          window.location.pathname.endsWith('/auth/callback/')
        if (onCallback) {
          initError = new Error(
            `Sign-in callback failed. In WorkOS Dashboard → Authentication, add ${window.location.origin} as an allowed origin and ${workosRedirectUri()} as a redirect URI.`,
          )
        }
        return client
      })
      .catch((err: unknown) => {
        initError = err instanceof Error ? err : new Error(String(err))
        clientPromise = null
        throw err
      })
  }
  return clientPromise
}
