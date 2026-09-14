import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  contactRateLimited,
  parseContactBody,
  sendContactEmail,
} from '../server/sendContact'

function clientIp(req: VercelRequest): string {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0]!.trim()
  if (Array.isArray(xf) && xf[0]) return xf[0].split(',')[0]!.trim()
  return req.socket?.remoteAddress || 'unknown'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
}
