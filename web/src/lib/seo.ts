/** Canonical marketing site origin (no trailing slash). */
export const SITE_URL = 'https://getproxy.ca'

export const SITE_NAME = 'PROXY'

/** Default social / link-preview image (1200×630). */
export const OG_IMAGE_PATH = '/og-preview.png'
export const OG_IMAGE_URL = `${SITE_URL}${OG_IMAGE_PATH}`
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630
export const OG_IMAGE_ALT =
  'PROXY | Fast customizable AI assistance. Named triggers that shape every reply. getproxy.ca'

export const SITE_TAGLINE = 'Fast customizable AI assistance'
export const SITE_TAGLINE_SECONDARY = 'Named triggers that shape every reply.'

export const DEFAULT_DESCRIPTION =
  'PROXY is a fast, customizable AI assistant for Windows and the web. Use named states, trigger words with your instructions, so every reply matches how you work. Free tier available; Pro from $10/month. Streaming chat, synced account, states gallery at getproxy.ca.'

export const DEFAULT_TITLE = `${SITE_NAME}, ${SITE_TAGLINE}`

export type PageMeta = {
  title: string
  description: string
  path: string
  /** When false, hint crawlers not to index (auth / app surfaces). */
  index?: boolean
  ogType?: 'website' | 'article' | 'profile'
}

export const PAGE_META: Record<string, PageMeta> = {
  '/': {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    path: '/',
    index: true,
  },
  '/about': {
    title: `About PROXY | Customizable AI chat with named states`,
    description:
      'PROXY is an AI chat app for Windows and the web. Reusable states (named triggers + instructions) sync to your account. Built for people who want repeatable setups, not one-off prompts.',
    path: '/about',
    index: true,
  },
  '/states': {
    title: `PROXY states gallery, Browse and save AI triggers`,
    description:
      'Browse PROXY states: named triggers with custom instructions. Save official or community states, or publish your own with Pro. Works in PROXY Web and the Windows app.',
    path: '/states',
    index: true,
  },
  '/contact': {
    title: `Contact PROXY | Support and partnerships`,
    description:
      'Contact the PROXY team about the Windows app, PROXY Web, billing, states, or partnerships. Email contact@sterben.dev or use the form on this page.',
    path: '/contact',
    index: true,
  },
  '/privacy': {
    title: `Privacy Policy, PROXY`,
    description:
      'PROXY privacy policy: account and identity data, prompts and AI processing, usage metrics, Convex, WorkOS, AI providers, Stripe billing, retention, security, and your rights.',
    path: '/privacy',
    index: true,
  },
  '/account': {
    title: `Account, ${SITE_NAME}`,
    description: 'Manage your PROXY account, profile, and chat settings.',
    path: '/account',
    index: false,
  },
  '/account/billing': {
    title: `Billing, ${SITE_NAME}`,
    description: 'Manage your PROXY subscription and billing for web and Windows chat.',
    path: '/account/billing',
    index: false,
  },
  '/app': {
    title: `PROXY Web, Chat`,
    description:
      'Chat with PROXY in the browser. Pick a state, send a message, and get streaming replies shaped by your triggers.',
    path: '/app',
    index: false,
  },
}

export function metaForPath(pathname: string): PageMeta {
  if (PAGE_META[pathname]) return PAGE_META[pathname]
  if (pathname.startsWith('/u/')) {
    return {
      title: `Profile, ${SITE_NAME}`,
      description: 'Public PROXY profile and published states.',
      path: pathname,
      index: true,
      ogType: 'profile',
    }
  }
  if (pathname.startsWith('/account')) {
    return PAGE_META['/account']
  }
  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    path: pathname,
    index: false,
  }
}

export function absoluteUrl(path: string) {
  if (path.startsWith('http')) return path
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
}
