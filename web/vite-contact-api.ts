import type { Plugin } from 'vite'
import {
  contactRateLimited,
  parseContactBody,
  sendContactEmail,
} from './server/sendContact'

/** Local `/api/contact` during `vite` so the form works without `vercel dev`. */
export function contactApiPlugin(): Plugin {
  return {
    name: 'proxy-contact-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/contact')) return next()
        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          res.end()
          return
        }
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(Buffer.from(chunk))
          const raw = Buffer.concat(chunks).toString('utf8')
          const body = raw ? JSON.parse(raw) : {}

          const ip =
            (typeof req.headers['x-forwarded-for'] === 'string'
              ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
              : null) ||
            req.socket.remoteAddress ||
            'local'

          if (contactRateLimited(ip)) {
            res.statusCode = 429
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Too many requests' }))
            return
          }

          const parsed = parseContactBody(body)
          if ('error' in parsed) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: parsed.error }))
            return
          }

          const result = await sendContactEmail(parsed)
          if ('error' in result) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: result.error }))
            return
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (err) {
          console.error('[contact] local handler failed:', err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Failed to send message' }))
        }
      })
    },
  }
}
