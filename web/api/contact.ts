type VercelRequest = {
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string }
}

type VercelResponse = {
  setHeader: (name: string, value: string) => void
  status: (code: number) => VercelResponse
  json: (body: unknown) => unknown
  end: () => unknown
}

type ContactPayload = {
  name: string
  email: string
  projectType?: string
  message: string
}

const MAX_PER_HOUR = 5
const hits = new Map<string, { count: number; resetAt: number }>()

function contactRateLimited(ip: string): boolean {
  const now = Date.now()
  const row = hits.get(ip)
  if (!row || now > row.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return false
  }
  if (row.count >= MAX_PER_HOUR) return true
  row.count += 1
  return false
}

function clean(value: unknown, max: number): string {
  return String(value ?? '')
    .trim()
    .slice(0, max)
}

/** Resend accepts `email@domain` or `Display Name <email@domain>`. */
function resolveFromAddress(raw: string | undefined): string {
  const fallback = 'PROXY Contact <onboarding@resend.dev>'
  let value = (raw ?? '').trim()
  if (!value) return fallback

  // Vercel/env UIs often wrap values in quotes
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim()
  }

  const bareEmail = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
  const namedEmail = /^.+\s<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/
  if (bareEmail.test(value)) return `PROXY Contact <${value}>`
  if (namedEmail.test(value)) return value

  console.error('[contact] Invalid CONTACT_FROM_EMAIL; using Resend onboarding sender')
  return fallback
}

function parseContactBody(body: unknown): ContactPayload | { error: string } {
  let data: unknown = body
  if (typeof body === 'string') {
    try {
      data = JSON.parse(body)
    } catch {
      return { error: 'Invalid body' }
    }
  }
  if (!data || typeof data !== 'object') return { error: 'Invalid body' }
  const record = data as Record<string, unknown>
  const name = clean(record.name, 120)
  const email = clean(record.email, 200)
  const projectType = clean(record.projectType, 80)
  const message = clean(record.message, 8000)

  if (!name || !email || !message) return { error: 'Name, email, and message are required' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Invalid email' }

  return { name, email, projectType, message }
}

async function sendContactEmail(
  payload: ContactPayload,
): Promise<{ ok: true } | { error: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY is missing')
    return { error: 'Email is not configured' }
  }

  const to = process.env.CONTACT_TO_EMAIL?.trim() || 'contact@sterben.dev'
  const from = resolveFromAddress(process.env.CONTACT_FROM_EMAIL)

  const topic = payload.projectType ? ` · ${payload.projectType}` : ''
  const text = [
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    payload.projectType ? `Topic: ${payload.projectType}` : null,
    '',
    payload.message,
  ]
    .filter((line) => line !== null)
    .join('\n')

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: payload.email,
        subject: `PROXY contact from ${payload.name}${topic}`,
        text,
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error('[contact] Resend HTTP error:', response.status, detail)
      return { error: 'Failed to send message' }
    }

    return { ok: true }
  } catch (err) {
    console.error('[contact] Resend request failed:', err)
    return { error: 'Failed to send message' }
  }
}

function clientIp(req: VercelRequest): string {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0]!.trim()
  if (Array.isArray(xf) && xf[0]) return xf[0].split(',')[0]!.trim()
  return req.socket?.remoteAddress || 'unknown'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      return res.status(204).end()
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const ip = clientIp(req)
    if (contactRateLimited(ip)) {
      return res.status(429).json({ error: 'Too many requests' })
    }

    const parsed = parseContactBody(req.body)
    if ('error' in parsed) {
      return res.status(400).json({ error: parsed.error })
    }

    const result = await sendContactEmail(parsed)
    if ('error' in result) {
      return res.status(500).json({ error: result.error })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[contact] handler crashed:', err)
    return res.status(500).json({ error: 'Failed to send message' })
  }
}
