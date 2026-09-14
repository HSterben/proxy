import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { api, internal } from './_generated/api';
import { getAiModelDiagnostics } from './ai/model';
import {
  generateAI,
  streamAI,
  weightedTokensFromUsage,
  type ChatMessage,
} from './ai/provider';

const http = httpRouter();

function proxyWebsiteBase(): string {
  return (process.env.PROXY_WEBSITE_URL || 'https://getproxy.ca').replace(/\/$/, '');
}

/** Never bounce OAuth back onto Convex itself (causes login↔callback loops). */
function safeWebsiteBase(): string {
  const base = proxyWebsiteBase();
  if (/\.convex\.(site|cloud)(\/|$)/i.test(base)) {
    return 'https://getproxy.ca';
  }
  return base;
}

function desktopAuthHtml(opts: {
  title: string;
  body: string;
  deepLink?: string;
  isError?: boolean;
}) {
  const deepLink = opts.deepLink
    ? `<script>
  try { window.location.href = ${JSON.stringify(opts.deepLink)}; } catch (e) {}
  setTimeout(function () {
    var el = document.getElementById('fallback');
    if (el) el.style.display = 'block';
  }, 800);
</script>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${opts.title}</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;max-width:28rem;margin:3rem auto;padding:0 1.25rem;color:#111;line-height:1.5}
    h1{font-size:1.35rem;margin:0 0 .75rem}
    p{margin:.5rem 0;color:#444}
    .ok{color:#0a7a3e}
    .err{color:#b00020}
    #fallback{display:none;margin-top:1.25rem;padding:1rem;border:1px solid #ddd;border-radius:10px;background:#fafafa}
    a.btn{display:inline-block;margin-top:.75rem;padding:.65rem 1rem;border-radius:8px;background:#111;color:#fff;text-decoration:none;font-weight:600}
  </style>
</head>
<body>
  <h1 class="${opts.isError ? 'err' : 'ok'}">${opts.title}</h1>
  <p>${opts.body}</p>
  ${deepLink}
  <div id="fallback">
    <p>If the PROXY app did not open automatically, return to the app and try Sign in again.</p>
    ${
      opts.deepLink
        ? `<p><a class="btn" href="${opts.deepLink}">Open PROXY</a></p>`
        : ''
    }
  </div>
</body>
</html>`;
}

async function syncEntitlementsForWorkos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  workosId: string | undefined,
  status: string,
  plan = 'proxy'
) {
  if (!workosId) return;
  await ctx.runMutation(internal.billing.syncEntitlements, { workosId, status, plan });
}

function htmlResponse(html: string, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

const STRIPE_SECRET_KEY = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return key;
};

async function stripeApiRequest(path: string, form: URLSearchParams) {
  const resp = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = (data as any)?.error?.message || `Stripe API error: ${resp.status}`;
    throw new Error(message);
  }
  return data as any;
}

/** GET a Stripe object (e.g. customer) to get email when subscription has no metadata */
async function stripeApiGet(path: string): Promise<any> {
  const resp = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY()}` },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const message = (data as any)?.error?.message || `Stripe API error: ${resp.status}`;
    throw new Error(message);
  }
  return data;
}

/**
 * Prefer live Stripe subscription.status over checkout payment_status.
 * payment_status can be "no_payment_required" (trials) or lag behind while the
 * subscription is already active, leaving our row stuck on "pending".
 */
async function resolveStatusFromCheckoutSession(session: any): Promise<{
  status: string;
  currentPeriodEnd?: number;
  priceId?: string;
}> {
  const subscriptionId =
    typeof session?.subscription === 'string'
      ? session.subscription
      : session?.subscription?.id;

  if (subscriptionId) {
    try {
      const sub = await stripeApiGet(`/subscriptions/${subscriptionId}`);
      if (typeof sub?.status === 'string') {
        return {
          status: sub.status,
          currentPeriodEnd:
            typeof sub.current_period_end === 'number'
              ? sub.current_period_end * 1000
              : undefined,
          priceId: sub?.items?.data?.[0]?.price?.id || undefined,
        };
      }
    } catch (e) {
      console.error('checkout.session.completed: failed to fetch subscription', e);
    }
  }

  const paymentStatus = session?.payment_status;
  if (paymentStatus === 'paid' || paymentStatus === 'no_payment_required') {
    return { status: 'active' };
  }
  return { status: 'pending' };
}

function hexFromBuffer(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEquals(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function verifyStripeWebhookSignature(rawBody: string, signatureHeader: string, secret: string) {
  // Stripe-Signature: t=...,v1=...,v0=...
  const parts = signatureHeader.split(',');
  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [k, v] = part.split('=');
    if (!k || !v) continue;
    if (k === 't') timestamp = v;
    if (k === 'v1') signatures.push(v);
  }

  if (!timestamp || signatures.length === 0) {
    return { ok: false, reason: 'Invalid Stripe-Signature header' };
  }

  // 5 minute tolerance
  const toleranceSeconds = 300;
  const tsSeconds = parseInt(timestamp, 10);
  if (!Number.isFinite(tsSeconds)) {
    return { ok: false, reason: 'Invalid timestamp' };
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > toleranceSeconds) {
    return { ok: false, reason: 'Timestamp outside tolerance window' };
  }

  const signedPayload = `${timestamp}.${rawBody}`;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(signedPayload);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const computed = hexFromBuffer(signatureBuffer);

  const matches = signatures.some((sig) => constantTimeEquals(sig, computed));
  return { ok: matches, reason: matches ? undefined : 'Signature mismatch' };
}

// WorkOS AuthKit OAuth configuration
// WORKOS_CLIENT_ID is public (safe to hardcode)
// WORKOS_API_KEY must be set as a Convex environment variable (it's secret!)
const WORKOS_CLIENT_ID = 'client_01KGNG7JGSBPA9HZWGVKZ8N8MS';
const WORKOS_REDIRECT_URI = (
  process.env.WORKOS_REDIRECT_URI ||
  'https://strong-poodle-712.convex.site/auth/callback'
).replace(/\/$/, '');

// Start OAuth flow - redirects to WorkOS
// ?state=web → callback returns to PROXY_WEBSITE_URL (browser). Default → Electron (proxy://).
http.route({
  path: '/auth/login',
  method: 'GET',
  handler: httpAction(async (_, req) => {
    const loginUrl = new URL(req.url);
    const state = loginUrl.searchParams.get('state') || 'desktop';

    const authUrl = new URL('https://api.workos.com/user_management/authorize');
    authUrl.searchParams.set('client_id', WORKOS_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', WORKOS_REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('provider', 'authkit');
    authUrl.searchParams.set('state', state);

    return new Response(null, {
      status: 302,
      headers: {
        Location: authUrl.toString(),
      },
    });
  }),
});

// OAuth callback - exchanges code for token
http.route({
  path: '/auth/callback',
  method: 'GET',
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const state = url.searchParams.get('state') || 'desktop';
    const isWeb = state === 'web';
    const webBase = safeWebsiteBase();

    // Ignore leftover redirects that already carried tokens/errors (prevents loops)
    if (!code && !error && (url.searchParams.has('token') || url.searchParams.has('refresh'))) {
      return htmlResponse(
        desktopAuthHtml({
          title: 'Already signed in',
          body: 'You can close this tab and return to PROXY.',
        })
      );
    }

    if (error) {
      if (isWeb) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${webBase}/auth/callback?error=${encodeURIComponent(error)}`,
          },
        });
      }
      return htmlResponse(
        desktopAuthHtml({
          title: 'Sign-in failed',
          body: `WorkOS returned an error: ${error}`,
          deepLink: `proxy://auth/error?message=${encodeURIComponent(error)}`,
          isError: true,
        }),
        400
      );
    }

    if (!code) {
      if (isWeb) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${webBase}/auth/callback?error=${encodeURIComponent('No code provided')}`,
          },
        });
      }
      // Do not 302 back to /auth/login, that creates the login↔callback loop
      return htmlResponse(
        desktopAuthHtml({
          title: 'Sign-in incomplete',
          body: 'No authorization code was returned. Close this tab, return to PROXY, and try Sign in again.',
          deepLink: 'proxy://auth/error?message=No%20code%20provided',
          isError: true,
        }),
        400
      );
    }

    try {
      const tokenResponse = await fetch(
        'https://api.workos.com/user_management/authenticate',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: WORKOS_CLIENT_ID,
            client_secret: process.env.WORKOS_API_KEY,
            grant_type: 'authorization_code',
            code,
            redirect_uri: WORKOS_REDIRECT_URI,
          }),
        }
      );

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        console.error('Token exchange failed:', errorData);
        if (isWeb) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `${webBase}/auth/callback?error=${encodeURIComponent('Authentication failed')}`,
            },
          });
        }
        return htmlResponse(
          desktopAuthHtml({
            title: 'Sign-in failed',
            body: 'Could not exchange the login code for a session. Check WORKOS_API_KEY on this Convex deployment, then try again from the app.',
            deepLink: `proxy://auth/error?message=${encodeURIComponent('Authentication failed')}`,
            isError: true,
          }),
          400
        );
      }

      const tokenData = await tokenResponse.json();

      // Bind free-tier signup to client IP (max 2 accounts / IP / UTC day).
      // Do not block login, rate-limited users can still subscribe.
      try {
        const claim = await claimSignupFromRequest(ctx, req, tokenData.user);
        if (claim && 'ok' in claim && claim.ok === false && !('skipped' in claim)) {
          console.warn('[signup] IP claim rejected:', claim);
        }
      } catch (claimErr) {
        console.error('[signup] IP claim failed:', claimErr);
      }

      if (isWeb) {
        const params = new URLSearchParams({
          token: tokenData.access_token,
        });
        if (tokenData.refresh_token) {
          params.set('refresh', tokenData.refresh_token);
        }
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${webBase}/auth/callback?${params.toString()}`,
          },
        });
      }

      // Prefer HTML + JS deep link over HTTP 302 to proxy:// (browsers often mishandle custom-protocol redirects → login loops)
      const deepLink = `proxy://auth/success?token=${encodeURIComponent(tokenData.access_token)}&refresh=${encodeURIComponent(tokenData.refresh_token || '')}`;
      return htmlResponse(
        desktopAuthHtml({
          title: 'Signed in',
          body: 'Returning you to the PROXY app. You can close this tab.',
          deepLink,
        })
      );
    } catch (err) {
      console.error('Auth callback error:', err);
      if (isWeb) {
        return new Response(null, {
          status: 302,
          headers: {
            Location: `${webBase}/auth/callback?error=${encodeURIComponent('Authentication failed')}`,
          },
        });
      }
      return htmlResponse(
        desktopAuthHtml({
          title: 'Sign-in failed',
          body: 'An unexpected error occurred during sign-in. Close this tab and try again from PROXY.',
          deepLink: 'proxy://auth/error?message=Authentication%20failed',
          isError: true,
        }),
        500
      );
    }
  }),
});

/**
 * Bind the authenticated WorkOS user to the request IP for free-tier anti-spam.
 * Used by web AuthKit (browser → WorkOS → site) where Convex never saw the OAuth redirect.
 */
http.route({
  path: '/auth/claim-signup',
  method: 'OPTIONS',
  handler: httpAction(async () => corsOptions()),
});

http.route({
  path: '/auth/claim-signup',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return corsJson({ error: 'Authentication required' }, 401);
    }

    const ip = clientIpFromRequest(req);
    // When Convex doesn't forward a client IP, still claim with a per-user hash so
    // free quota is seeded, without consuming the shared IP rate-limit bucket.
    const ipHash = ip
      ? await hashIp(ip)
      : `noip:${await hashIp(identity.subject)}`;
    const nameParts = (identity.name || '').trim().split(/\s+/).filter(Boolean);
    const result = await ctx.runMutation(internal.signupRateLimit.claimIpSignup, {
      workosId: identity.subject,
      ipHash,
      email: identity.email ?? undefined,
      firstName: identity.givenName ?? nameParts[0] ?? undefined,
      lastName:
        identity.familyName ??
        (nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined),
      profilePictureUrl: identity.pictureUrl ?? undefined,
    });

    if (!result.ok) {
      return corsJson(
        { error: result.reason, code: result.code },
        429,
      );
    }

    return corsJson({ ok: true, alreadyClaimed: result.alreadyClaimed });
  }),
});

// Refresh token endpoint
http.route({
  path: '/auth/refresh',
  method: 'POST',
  handler: httpAction(async (_, req) => {
    try {
      const body = await req.json();
      const refreshToken = body.refresh_token;

      if (!refreshToken) {
        return new Response(JSON.stringify({ error: 'No refresh token provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const tokenResponse = await fetch(
        'https://api.workos.com/user_management/authenticate',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: WORKOS_CLIENT_ID,
            client_secret: process.env.WORKOS_API_KEY,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        }
      );

      if (!tokenResponse.ok) {
        return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const tokenData = await tokenResponse.json();

      return new Response(
        JSON.stringify({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    } catch (err) {
      console.error('Refresh error:', err);
      return new Response(JSON.stringify({ error: 'Refresh failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }),
});

// CORS preflight for refresh endpoint
http.route({
  path: '/auth/refresh',
  method: 'OPTIONS',
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }),
});

// WorkOS signs: HMAC-SHA256(secret, "{timestamp_ms}.{raw_body}")
async function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string
): Promise<boolean> {
  if (!signature || !timestamp || !secret) {
    return false;
  }

  try {
    // Replay window: WorkOS timestamp is ms; compare in seconds (±5 min).
    const currentTime = Math.floor(Date.now() / 1000);
    const requestTimeMs = parseInt(timestamp, 10);
    const requestTimeSeconds = Math.floor(requestTimeMs / 1000);
    const tolerance = 300;

    if (isNaN(requestTimeMs) || Math.abs(currentTime - requestTimeSeconds) > tolerance) {
      console.error('Webhook timestamp outside tolerance window');
      return false;
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      encoder.encode(signedPayload)
    );
    const computedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (signature.length !== computedSignature.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ computedSignature.charCodeAt(i);
    }
    return result === 0;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}

// WorkOS webhook endpoint
http.route({
  path: '/webhooks/workos',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    try {
      const rawBody = await req.text();

      // WorkOS: "t={timestamp_ms}, v1={signature}"
      const signatureHeader = req.headers.get('workos-signature');

      if (!signatureHeader) {
        console.error('Missing workos-signature header');
        return new Response(JSON.stringify({ error: 'Missing signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const timestampMatch = signatureHeader.match(/t=(\d+)/);
      const signatureMatch = signatureHeader.match(/v1=([a-f0-9]+)/);
      const timestamp = timestampMatch?.[1] ?? null;
      const signature = signatureMatch?.[1] ?? null;

      if (!signature || !timestamp) {
        console.error('Failed to parse workos-signature header');
        return new Response(JSON.stringify({ error: 'Invalid signature format' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const webhookSecret = process.env.WORKOS_SIGNATURE_SECRET;
      if (!webhookSecret) {
        console.error('WORKOS_SIGNATURE_SECRET not configured');
        return new Response(JSON.stringify({ error: 'Server configuration error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const isValid = await verifyWebhookSignature(
        rawBody,
        signature,
        timestamp,
        webhookSecret
      );

      if (!isValid) {
        console.error('Invalid webhook signature');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const payload = JSON.parse(rawBody);
      const event = payload.event;
      const data = payload.data;

      switch (event) {
        case 'user.created':
        case 'user.updated': {
          // Convex optional fields reject null; coerce WorkOS nulls to undefined.
          await ctx.runMutation(api.users.upsertUser, {
            workosId: data.id,
            email: data.email,
            firstName: data.first_name ?? undefined,
            lastName: data.last_name ?? undefined,
            profilePictureUrl: data.profile_picture_url ?? undefined,
          });
          break;
        }

        case 'user.deleted': {
          await ctx.runMutation(api.users.deleteUser, {
            workosId: data.id,
          });
          break;
        }

        default:
          break;
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Webhook processing error:', error);
      return new Response(
        JSON.stringify({
          error: 'Webhook processing failed',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }),
});

function corsJson(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function corsOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/** Best-effort client IP from CDN / proxy headers (never trust body-supplied IPs). */
function clientIpFromRequest(req: Request): string | null {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;
  return null;
}

async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(`proxy-signup-v1:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function claimSignupFromRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  req: Request,
  workosUser: {
    id?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    profile_picture_url?: string;
  } | null | undefined,
) {
  const workosId = workosUser?.id?.trim();
  if (!workosId) return { ok: false as const, skipped: true as const };

  const ip = clientIpFromRequest(req);
  if (!ip) {
    console.warn('[signup] missing client IP for claim; using per-user fallback', workosId);
  }
  const ipHash = ip ? await hashIp(ip) : `noip:${await hashIp(workosId)}`;
  return await ctx.runMutation(internal.signupRateLimit.claimIpSignup, {
    workosId,
    ipHash,
    email: workosUser?.email,
    firstName: workosUser?.first_name,
    lastName: workosUser?.last_name,
    profilePictureUrl: workosUser?.profile_picture_url,
  });
}

/** Claim free-tier signup for an authenticated identity (AI / claim-signup routes). */
async function claimSignupForIdentity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  req: Request,
  identity: {
    subject: string;
    email?: string | null;
    name?: string | null;
    givenName?: string | null;
    familyName?: string | null;
    pictureUrl?: string | null;
  },
) {
  const nameParts = (identity.name || '').trim().split(/\s+/).filter(Boolean);
  return claimSignupFromRequest(ctx, req, {
    id: identity.subject,
    email: identity.email ?? undefined,
    first_name: identity.givenName ?? nameParts[0],
    last_name:
      identity.familyName ??
      (nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined),
    profile_picture_url: identity.pictureUrl ?? undefined,
  });
}

function processMessages(
  messages: ChatMessage[],
  systemInstruction?: string
): ChatMessage[] {
  const processed = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
  if (systemInstruction && !processed.some((m) => m.role === 'system')) {
    processed.unshift({ role: 'system', content: systemInstruction });
  }
  return processed;
}

async function recordUsage(
  ctx: { runMutation: (ref: any, args: any) => Promise<any> },
  workosId: string,
  usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined
) {
  if (!usage) return;
  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  if (inputTokens === 0 && outputTokens === 0) return;
  try {
    await ctx.runMutation(internal.usage.addUsage, {
      workosId,
      inputTokens,
      outputTokens,
      weightedTokens: weightedTokensFromUsage(usage),
    });
  } catch (err) {
    console.error('[usage] failed to record usage:', err);
  }
}

/** Model diagnostic (env); no auth. Paths kept for desktop compatibility. */
const modelDiagnosticHandler = httpAction(async (_, req) => {
  const url = new URL(req.url);
  const clientModel = url.searchParams.get('clientModel') ?? undefined;
  return jsonResponse(getAiModelDiagnostics(clientModel), 200, {
    'Access-Control-Allow-Origin': '*',
  });
});

http.route({ path: '/openrouter/model', method: 'GET', handler: modelDiagnosticHandler });
http.route({ path: '/ai/model', method: 'GET', handler: modelDiagnosticHandler });

/** Streaming Luna endpoint, quota check first, usage after stream finishes. */
const streamHandler = httpAction(async (ctx, req) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return corsJson({ error: 'Authentication required' }, 401);
  }

  const workosId = identity.subject;

  try {
    // Bind free quota + IP signup claim before the usage gate (repairs missing usage rows).
    try {
      await claimSignupForIdentity(ctx, req, identity);
    } catch (claimErr) {
      console.error('[signup] claim before AI failed:', claimErr);
    }

    const gate = await ctx.runQuery(internal.usage.assertCanUseAI, { workosId });
    if (gate.ok === false) {
      // 402: upgrade / wait for next period; clients show billing CTA
      return corsJson({ error: gate.reason, code: gate.code }, 402);
    }

    const body = await req.json();
    const {
      messages,
      model,
      temperature,
      maxTokens,
      topP,
      frequencyPenalty,
      presencePenalty,
      stop,
    } = body;
    const systemInstruction = body.systemInstruction ?? body.system_instruction;

    if (!messages || messages.length === 0) {
      return corsJson({ error: 'Messages are required' }, 400);
    }

    const processedMessages = processMessages(messages, systemInstruction);

    let upstream;
    try {
      upstream = await streamAI({
        messages: processedMessages,
        model,
        temperature,
        maxTokens,
        topP,
        frequencyPenalty,
        presencePenalty,
        stop,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OpenRouter API error';
      const status = message.includes('OPENROUTER_API_KEY') ? 500 : 502;
      return corsJson({ error: message }, status);
    }

    const { response, model: resolvedModel, modelSource } = upstream;
    console.log('[ai/stream] model:', resolvedModel, 'source:', modelSource);

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let lastUsage: {
          prompt_tokens?: number;
          completion_tokens?: number;
        } | null = null;

        const keepaliveMs = 4000;
        const keepaliveId = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
          } catch {
            // controller may be closed
          }
        }, keepaliveMs);

        const handleDataLine = (data: string): 'done' | 'continue' => {
          if (data === '[DONE]') return 'done';
          if (!data) return 'continue';
          try {
            const parsed = JSON.parse(data) as {
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };
            if (parsed.usage) lastUsage = parsed.usage;
            controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
          } catch {
            console.warn('Skipping invalid JSON in stream:', data.substring(0, 100));
          }
          return 'continue';
        };

        if (!reader) {
          clearInterval(keepaliveId);
          controller.close();
          return;
        }

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              if (buffer.trim()) {
                for (const line of buffer.split('\n')) {
                  if (line.startsWith('data: ')) {
                    if (handleDataLine(line.slice(6).trim()) === 'done') {
                      clearInterval(keepaliveId);
                      await recordUsage(ctx, workosId, lastUsage);
                      controller.close();
                      return;
                    }
                  }
                }
              }
              clearInterval(keepaliveId);
              await recordUsage(ctx, workosId, lastUsage);
              controller.close();
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              if (handleDataLine(line.slice(6).trim()) === 'done') {
                clearInterval(keepaliveId);
                await recordUsage(ctx, workosId, lastUsage);
                controller.close();
                return;
              }
            }
          }
        } catch (error) {
          clearInterval(keepaliveId);
          console.error('Stream processing error:', error);
          try {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify({
                  error: error instanceof Error ? error.message : 'Stream error',
                })}\n\n`
              )
            );
          } catch {
            // ignore
          }
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'X-Proxy-Model': resolvedModel,
        'X-Proxy-Model-Source': modelSource,
      },
    });
  } catch (error) {
    console.error('Streaming error:', error);
    return corsJson(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500
    );
  }
});

http.route({ path: '/openrouter/stream', method: 'OPTIONS', handler: httpAction(async () => corsOptions()) });
http.route({ path: '/openrouter/stream', method: 'POST', handler: streamHandler });
http.route({ path: '/ai/stream', method: 'OPTIONS', handler: httpAction(async () => corsOptions()) });
http.route({ path: '/ai/stream', method: 'POST', handler: streamHandler });

/** Non-streaming Luna endpoint (fallback when stream times out). */
const completeHandler = httpAction(async (ctx, req) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return corsJson({ error: 'Authentication required' }, 401);
  }

  const workosId = identity.subject;

  try {
    // Bind free quota + IP signup claim before the usage gate (repairs missing usage rows).
    try {
      await claimSignupForIdentity(ctx, req, identity);
    } catch (claimErr) {
      console.error('[signup] claim before AI failed:', claimErr);
    }

    const gate = await ctx.runQuery(internal.usage.assertCanUseAI, { workosId });
    if (gate.ok === false) {
      // 402: upgrade / wait for next period; clients show billing CTA
      return corsJson({ error: gate.reason, code: gate.code }, 402);
    }

    const body = await req.json();
    const {
      messages,
      model,
      temperature,
      maxTokens,
      topP,
      frequencyPenalty,
      presencePenalty,
      stop,
    } = body;
    const systemInstruction = body.systemInstruction ?? body.system_instruction;

    if (!messages || messages.length === 0) {
      return corsJson({ error: 'Messages are required' }, 400);
    }

    const processedMessages = processMessages(messages, systemInstruction);

    const result = await generateAI({
      messages: processedMessages,
      model,
      temperature,
      maxTokens,
      topP,
      frequencyPenalty,
      presencePenalty,
      stop,
    });

    console.log('[ai/complete] model:', result.model, 'source:', result.modelSource);

    // Return content first; accounting after generation (does not block tokens on stream path)
    const responseBody = {
      content: result.content,
      model: result.model,
      modelSource: result.modelSource,
    };

    await recordUsage(ctx, workosId, result.usage);

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Proxy-Model': result.model,
        'X-Proxy-Model-Source': result.modelSource,
      },
    });
  } catch (error) {
    console.error('AI complete error:', error);
    return corsJson(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      500
    );
  }
});

http.route({ path: '/openrouter/complete', method: 'OPTIONS', handler: httpAction(async () => corsOptions()) });
http.route({ path: '/openrouter/complete', method: 'POST', handler: completeHandler });
http.route({ path: '/ai/complete', method: 'OPTIONS', handler: httpAction(async () => corsOptions()) });
http.route({ path: '/ai/complete', method: 'POST', handler: completeHandler });

// Public subscription page (browser)
http.route({
  path: '/subscribe',
  method: 'GET',
  handler: httpAction(async (_, req) => {
    const url = new URL(req.url);
    const priceMonthly = process.env.STRIPE_PRICE_ID_MONTHLY || '';
    const priceYearly = process.env.STRIPE_PRICE_ID_YEARLY || '';

    return htmlResponse(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PROXY Subscription</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; }
      .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; }
      label { display:block; margin: 10px 0 6px; font-weight: 600; }
      input, select, button { width: 100%; padding: 10px 12px; font-size: 16px; }
      button { margin-top: 14px; cursor: pointer; }
      .muted { color: #6b7280; font-size: 14px; }
      .error { color: #b91c1c; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>Subscribe to PROXY</h1>
    <p class="muted">Enter your email, pick a plan, and you’ll be redirected to Stripe Checkout.</p>

    <div class="card">
      <div id="configError" class="error"></div>
      <label>Email</label>
      <input id="email" type="email" placeholder="you@example.com" required />

      <label>Plan</label>
      <select id="plan">
        <option value="${priceMonthly}">Monthly</option>
        <option value="${priceYearly}">Yearly</option>
      </select>

      <button id="btn">Continue to Checkout</button>
      <div id="err" class="error" style="margin-top:10px;"></div>
    </div>

    <script>
      const priceMonthly = ${JSON.stringify(priceMonthly)};
      const priceYearly = ${JSON.stringify(priceYearly)};
      if (!priceMonthly && !priceYearly) {
        document.getElementById('configError').textContent =
          'Subscription pricing is not configured.\\nSet STRIPE_PRICE_ID_MONTHLY and/or STRIPE_PRICE_ID_YEARLY.';
      }
      const planSelect = document.getElementById('plan');
      if (!priceMonthly) planSelect.querySelector('option[value=\"\"]').textContent = 'Monthly (not configured)';
      if (!priceYearly) planSelect.querySelectorAll('option')[1].textContent = 'Yearly (not configured)';

      document.getElementById('btn').addEventListener('click', async () => {
        const email = document.getElementById('email').value.trim();
        const priceId = planSelect.value;
        const err = document.getElementById('err');
        err.textContent = '';
        if (!email) { err.textContent = 'Email is required.'; return; }
        if (!priceId) { err.textContent = 'Selected plan is not configured.'; return; }
        try {
          const res = await fetch(new URL('/stripe/create-checkout-session', window.location.origin), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, priceId }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
          window.location.href = data.url;
        } catch (e) {
          err.textContent = (e && e.message) ? e.message : String(e);
        }
      });
    </script>
  </body>
</html>`, 200);
  }),
});

http.route({
  path: '/subscribe/success',
  method: 'GET',
  handler: httpAction(async () => {
    return htmlResponse('<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Success</title></head><body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;"><h1>Subscription started</h1><p>You can close this tab.</p></body></html>');
  }),
});

http.route({
  path: '/subscribe/cancel',
  method: 'GET',
  handler: httpAction(async () => {
    return htmlResponse('<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Cancelled</title></head><body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;"><h1>Checkout cancelled</h1><p>No changes were made.</p></body></html>');
  }),
});

http.route({
  path: '/stripe/create-checkout-session',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    try {
      const { email, priceId } = (await req.json()) as { email?: string; priceId?: string };
      if (!email || !priceId) {
        return jsonResponse({ error: 'email and priceId are required' }, 400);
      }

      const baseUrl = new URL(req.url).origin;
      const successUrl = `${baseUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${baseUrl}/subscribe/cancel`;

      // Record intent (so webhook updates have a row to patch)
      await ctx.runMutation(api.subscriptions.upsertByEmail, {
        email,
        status: 'pending',
        priceId,
      });

      const form = new URLSearchParams();
      form.set('mode', 'subscription');
      form.set('customer_email', email);
      form.set('allow_promotion_codes', 'true');
      form.set('success_url', successUrl);
      form.set('cancel_url', cancelUrl);
      form.set('line_items[0][price]', priceId);
      form.set('line_items[0][quantity]', '1');

      // Make email available later on subscription events
      form.set('subscription_data[metadata][email]', email);
      form.set('metadata[email]', email);

      const session = await stripeApiRequest('/checkout/sessions', form);
      if (!session?.url) {
        return jsonResponse({ error: 'Stripe did not return a checkout URL' }, 500);
      }

      return jsonResponse({ url: session.url }, 200);
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : 'Failed to create checkout session' },
        500
      );
    }
  }),
});

// CORS preflight for Stripe auth checkout (required when sending Authorization from Electron)
http.route({
  path: '/stripe/create-checkout-session-auth',
  method: 'OPTIONS',
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }),
});

// Stripe config for in-app subscription UI (public, no secrets)
http.route({
  path: '/stripe/plans',
  method: 'GET',
  handler: httpAction(async () => {
    return jsonResponse(
      {
        monthly: process.env.STRIPE_PRICE_ID_MONTHLY || null,
        yearly: process.env.STRIPE_PRICE_ID_YEARLY || null,
      },
      200,
      { 'Access-Control-Allow-Origin': '*' }
    );
  }),
});

// CORS preflight for Stripe billing portal (required when sending Authorization from Electron)
http.route({
  path: '/stripe/create-portal-session-auth',
  method: 'OPTIONS',
  handler: httpAction(async () => {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }),
});

// Authenticated Stripe Customer Portal (cancel subscription, update payment method, invoices)
http.route({
  path: '/stripe/create-portal-session-auth',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return jsonResponse({ error: 'Authentication required' }, 401, {
        'Access-Control-Allow-Origin': '*',
      });
    }

    const workosId = identity.subject;
    const sub = await ctx.runQuery(api.subscriptions.getByWorkosId, { workosId });
    const stripeCustomerId = sub?.stripeCustomerId;

    if (!stripeCustomerId) {
      return jsonResponse(
        { error: 'No billing account found. Complete checkout first, then try again.' },
        400,
        { 'Access-Control-Allow-Origin': '*' }
      );
    }

    try {
      const site = proxyWebsiteBase();
      const returnUrl = `${site}/account/billing`;

      const form = new URLSearchParams();
      form.set('customer', stripeCustomerId);
      form.set('return_url', returnUrl);

      const session = await stripeApiRequest('/billing_portal/sessions', form);
      if (!session?.url) {
        return jsonResponse({ error: 'Stripe did not return a portal URL' }, 500, {
          'Access-Control-Allow-Origin': '*',
        });
      }

      return jsonResponse({ url: session.url }, 200, { 'Access-Control-Allow-Origin': '*' });
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : 'Failed to create portal session' },
        500,
        { 'Access-Control-Allow-Origin': '*' }
      );
    }
  }),
});

http.route({
  path: '/subscribe/portal-return',
  method: 'GET',
  handler: httpAction(async () => {
    return htmlResponse(
      '<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Billing</title></head><body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;"><h1>Billing updated</h1><p>You can close this tab and return to PROXY.</p></body></html>'
    );
  }),
});

// Authenticated checkout session creation (Flow A: tie to WorkOS account)
http.route({
  path: '/stripe/create-checkout-session-auth',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return jsonResponse({ error: 'Authentication required' }, 401, {
        'Access-Control-Allow-Origin': '*',
      });
    }

    const workosId = identity.subject;
    let body: { priceId?: string; email?: string } = {};
    try {
      body = (await req.json()) as { priceId?: string; email?: string };
    } catch {
      body = {};
    }

    // WorkOS JWT may omit email; fall back to users table, then client-provided email.
    const identityEmail =
      (typeof identity.email === 'string' && identity.email.trim()) ||
      (typeof (identity as { email_address?: string }).email_address === 'string' &&
        (identity as { email_address?: string }).email_address!.trim()) ||
      undefined;
    const storedEmail = (await ctx.runQuery(api.users.getUserByWorkosId, { workosId }))
      ?.email;
    const clientEmail =
      typeof body.email === 'string' && body.email.includes('@')
        ? body.email.trim()
        : undefined;

    const email = identityEmail || storedEmail || clientEmail;

    if (!email) {
      return jsonResponse({ error: 'No email available for this account' }, 400, {
        'Access-Control-Allow-Origin': '*',
      });
    }

    // Persist email onto the user row when we only got it from the client/JWT
    if (!storedEmail || storedEmail !== email) {
      try {
        await ctx.runMutation(api.users.setMyEmail, { email });
      } catch (e) {
        console.warn('Could not sync email to users table', e);
      }
    }

    try {
      const priceId = body.priceId;
      if (!priceId) {
        return jsonResponse({ error: 'priceId is required' }, 400, {
          'Access-Control-Allow-Origin': '*',
        });
      }

      const site = proxyWebsiteBase();
      const successUrl = `${site}/account/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${site}/account/billing?checkout=cancel`;

      await ctx.runMutation(api.subscriptions.upsertByWorkosId, {
        workosId,
        email,
        status: 'pending',
        plan: 'proxy',
        priceId,
      });

      const form = new URLSearchParams();
      form.set('mode', 'subscription');
      form.set('customer_email', email);
      form.set('client_reference_id', workosId);
      form.set('allow_promotion_codes', 'true');
      form.set('success_url', successUrl);
      form.set('cancel_url', cancelUrl);
      form.set('line_items[0][price]', priceId);
      form.set('line_items[0][quantity]', '1');

      // Make WorkOS id + email available in webhook events
      form.set('subscription_data[metadata][workosId]', workosId);
      form.set('subscription_data[metadata][email]', email);
      form.set('subscription_data[metadata][plan]', 'proxy');
      form.set('metadata[workosId]', workosId);
      form.set('metadata[email]', email);
      form.set('metadata[plan]', 'proxy');

      const session = await stripeApiRequest('/checkout/sessions', form);
      if (!session?.url) {
        return jsonResponse({ error: 'Stripe did not return a checkout URL' }, 500, {
          'Access-Control-Allow-Origin': '*',
        });
      }

      return jsonResponse({ url: session.url }, 200, { 'Access-Control-Allow-Origin': '*' });
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : 'Failed to create checkout session' },
        500,
        { 'Access-Control-Allow-Origin': '*' }
      );
    }
  }),
});

// Stripe webhook endpoint (subscriptions)
http.route({
  path: '/webhooks/stripe',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const signatureHeader = req.headers.get('stripe-signature');
    if (!signatureHeader) {
      return jsonResponse({ error: 'Missing stripe-signature header' }, 400);
    }

    const webhookSecret =
      process.env.STRIPE_WEBHOOK_SIGNING_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return jsonResponse(
        { error: 'STRIPE_WEBHOOK_SIGNING_SECRET or STRIPE_WEBHOOK_SECRET not configured' },
        500
      );
    }

    const rawBody = await req.text();

    const verified = await verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret);
    if (!verified.ok) {
      return jsonResponse({ error: verified.reason || 'Invalid signature' }, 400);
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'Invalid JSON payload' }, 400);
    }

    const type = event?.type as string | undefined;
    const obj = event?.data?.object;

    try {
      if (type === 'checkout.session.completed') {
        const session = obj;
        const workosId =
          session?.metadata?.workosId ||
          session?.client_reference_id ||
          undefined;
        const email =
          session?.customer_details?.email ||
          session?.customer_email ||
          session?.metadata?.email ||
          undefined;
        const subscriptionId =
          typeof session?.subscription === 'string'
            ? session.subscription
            : session?.subscription?.id || undefined;
        const customerId =
          typeof session?.customer === 'string'
            ? session.customer
            : session?.customer?.id || undefined;

        const resolved = await resolveStatusFromCheckoutSession(session);
        const status = resolved.status;

        if (workosId) {
          await ctx.runMutation(api.subscriptions.upsertByWorkosId, {
            workosId,
            email,
            status,
            plan: 'proxy',
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            currentPeriodEnd: resolved.currentPeriodEnd,
            priceId: resolved.priceId,
          });
          await syncEntitlementsForWorkos(ctx, workosId, status, 'proxy');
        } else if (email) {
          // Prefer linking to WorkOS when we can, so desktop getMyAccount finds the row
          const user = await ctx.runQuery(api.users.getUserByEmail, { email });
          if (user?.workosId) {
            await ctx.runMutation(api.subscriptions.upsertByWorkosId, {
              workosId: user.workosId,
              email,
              status,
              plan: 'proxy',
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              currentPeriodEnd: resolved.currentPeriodEnd,
              priceId: resolved.priceId,
            });
            await syncEntitlementsForWorkos(ctx, user.workosId, status, 'proxy');
          } else {
            await ctx.runMutation(api.subscriptions.upsertByEmail, {
              email,
              status,
              plan: 'proxy',
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              currentPeriodEnd: resolved.currentPeriodEnd,
              priceId: resolved.priceId,
            });
          }
        }
      }

      if (
        type === 'customer.subscription.created' ||
        type === 'customer.subscription.updated' ||
        type === 'customer.subscription.deleted'
      ) {
        const sub = obj;
        const workosId = sub?.metadata?.workosId || undefined;
        const email = sub?.metadata?.email || undefined;
        const currentPeriodEnd =
          typeof sub?.current_period_end === 'number' ? sub.current_period_end * 1000 : undefined;
        const priceId = sub?.items?.data?.[0]?.price?.id || undefined;
        const status = sub?.status || 'unknown';

        const plan = sub?.metadata?.plan || 'proxy';

        if (workosId) {
          await ctx.runMutation(api.subscriptions.upsertByWorkosId, {
            workosId,
            email,
            status,
            plan,
            stripeCustomerId: sub?.customer || undefined,
            stripeSubscriptionId: sub?.id || undefined,
            currentPeriodEnd,
            priceId,
          });
          await syncEntitlementsForWorkos(ctx, workosId, status, plan);
        } else if (email) {
          await ctx.runMutation(api.subscriptions.upsertByEmail, {
            email,
            status,
            stripeCustomerId: sub?.customer || undefined,
            stripeSubscriptionId: sub?.id || undefined,
            currentPeriodEnd,
            priceId,
          });
        }
        // Always update by subscription id so the row we created in checkout.session.completed gets status active
        if (sub?.id) {
          const updated = await ctx.runMutation(api.subscriptions.updateByStripeSubscriptionId, {
            stripeSubscriptionId: sub.id,
            status,
            plan,
            stripeCustomerId: sub?.customer || undefined,
            currentPeriodEnd,
            priceId,
          });
          // If no row had this subscription id, try updating by customer id
          if (updated === null && sub?.customer) {
            const byCustomer = await ctx.runMutation(api.subscriptions.updateByStripeCustomerId, {
              stripeCustomerId: sub.customer,
              stripeSubscriptionId: sub.id,
              status,
              plan,
              currentPeriodEnd,
              priceId,
            });
            // If still no row (Convex row has no stripe ids set), fetch Stripe customer email and update the row the app uses (by workosId)
            if (byCustomer === null) {
              try {
                const customer = await stripeApiGet(`/customers/${sub.customer}`);
                const customerEmail = typeof customer?.email === 'string' ? customer.email : undefined;
                if (customerEmail) {
                  const user = await ctx.runQuery(api.users.getUserByEmail, { email: customerEmail });
                  if (user?.workosId) {
                    await ctx.runMutation(api.subscriptions.upsertByWorkosId, {
                      workosId: user.workosId,
                      email: customerEmail,
                      status,
                      plan,
                      stripeCustomerId: sub.customer,
                      stripeSubscriptionId: sub.id,
                      currentPeriodEnd,
                      priceId,
                    });
                    await syncEntitlementsForWorkos(ctx, user.workosId, status, plan);
                  } else {
                    await ctx.runMutation(api.subscriptions.upsertByEmail, {
                      email: customerEmail,
                      status,
                      stripeCustomerId: sub.customer,
                      stripeSubscriptionId: sub.id,
                      currentPeriodEnd,
                      priceId,
                    });
                  }
                }
              } catch (e) {
                console.error('Stripe webhook: could not fetch customer for email fallback', e);
              }
            }
          }
        }
      }

      if (type === 'invoice.payment_succeeded' || type === 'invoice.payment_failed') {
        const invoice = obj;
        const workosId =
          invoice?.subscription_details?.metadata?.workosId ||
          invoice?.metadata?.workosId ||
          undefined;
        const email =
          invoice?.customer_email ||
          invoice?.customer_details?.email ||
          invoice?.metadata?.email ||
          undefined;

        if (workosId) {
          const status = type === 'invoice.payment_succeeded' ? 'active' : 'past_due';
          await ctx.runMutation(api.subscriptions.upsertByWorkosId, {
            workosId,
            email,
            status,
            plan: 'proxy',
            stripeCustomerId: invoice?.customer || undefined,
            stripeSubscriptionId: invoice?.subscription || undefined,
          });
          await syncEntitlementsForWorkos(ctx, workosId, status, 'proxy');
        } else if (email) {
          await ctx.runMutation(api.subscriptions.upsertByEmail, {
            email,
            status: type === 'invoice.payment_succeeded' ? 'active' : 'past_due',
            stripeCustomerId: invoice?.customer || undefined,
            stripeSubscriptionId: invoice?.subscription || undefined,
          });
        }
      }

      // Always ACK so Stripe doesn't retry endlessly for unhandled events.
      return jsonResponse({ received: true }, 200);
    } catch (err) {
      console.error('Stripe webhook handling error:', err);
      return jsonResponse({ error: 'Webhook handling failed' }, 500);
    }
  }),
});

export default http;
