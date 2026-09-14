import { Resend } from 'resend'

export type ContactPayload = {
  name: string
  email: string
  projectType?: string
  message: string
}

const MAX_PER_HOUR = 5
const hits = new Map<string, { count: number; resetAt: number }>()

export function contactRateLimited(ip: string): boolean {
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

export function parseContactBody(body: unknown): ContactPayload | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid body' }
  const data = body as Record<string, unknown>
  const name = clean(data.name, 120)
  const email = clean(data.email, 200)
  const projectType = clean(data.projectType, 80)
  const message = clean(data.message, 8000)

  if (!name || !email || !message) return { error: 'Name, email, and message are required' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Invalid email' }

  return { name, email, projectType, message }
}

export async function sendContactEmail(payload: ContactPayload): Promise<{ ok: true } | { error: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { error: 'Email is not configured' }

  const to = process.env.CONTACT_TO_EMAIL || 'contact@sterben.dev'
  const from =
    process.env.CONTACT_FROM_EMAIL || 'PROXY Contact <onboarding@resend.dev>'

  const topic = payload.projectType ? ` · ${payload.projectType}` : ''
  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from,
    to: [to],
    replyTo: payload.email,
    subject: `PROXY contact from ${payload.name}${topic}`,
    text: [
      `Name: ${payload.name}`,
      `Email: ${payload.email}`,
      payload.projectType ? `Topic: ${payload.projectType}` : null,
      '',
      payload.message,
    ]
      .filter((line) => line !== null)
      .join('\n'),
  })

  if (error) {
    console.error('[contact] Resend error:', error)
    return { error: 'Failed to send message' }
  }
  return { ok: true }
}
