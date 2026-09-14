import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { jsonLdForPath } from '../../lib/aeo'
import {
  DEFAULT_TITLE,
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_URL,
  OG_IMAGE_WIDTH,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  metaForPath,
} from '../../lib/seo'

const JSON_LD_ID = 'proxy-jsonld'

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string, attrs?: Record<string, string>) {
  const selector = attrs
    ? `link[rel="${rel}"]${Object.entries(attrs)
        .map(([k, v]) => `[${k}="${v}"]`)
        .join('')}`
    : `link[rel="${rel}"]`
  let el = document.head.querySelector<HTMLLinkElement>(selector)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    }
    document.head.appendChild(el)
  }
  el.href = href
}

function upsertJsonLd(data: unknown) {
  let el = document.getElementById(JSON_LD_ID) as HTMLScriptElement | null
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.id = JSON_LD_ID
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

/** Keeps title, description, canonical, social tags, and JSON-LD in sync with the route. */
export default function DocumentMeta() {
  const { pathname } = useLocation()

  useEffect(() => {
    const meta = metaForPath(pathname)
    const url = absoluteUrl(meta.path)
    const title = meta.title || DEFAULT_TITLE
    const indexable = meta.index !== false

    document.title = title

    upsertMeta('name', 'description', meta.description)
    upsertMeta(
      'name',
      'robots',
      indexable
        ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
        : 'noindex, nofollow',
    )
    upsertMeta(
      'name',
      'googlebot',
      indexable ? 'index, follow, max-image-preview:large' : 'noindex, nofollow',
    )

    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', meta.description)
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:type', meta.ogType ?? 'website')
    upsertMeta('property', 'og:site_name', SITE_NAME)
    upsertMeta('property', 'og:image', OG_IMAGE_URL)
    upsertMeta('property', 'og:image:secure_url', OG_IMAGE_URL)
    upsertMeta('property', 'og:image:type', 'image/png')
    upsertMeta('property', 'og:image:width', String(OG_IMAGE_WIDTH))
    upsertMeta('property', 'og:image:height', String(OG_IMAGE_HEIGHT))
    upsertMeta('property', 'og:image:alt', OG_IMAGE_ALT)
    upsertMeta('property', 'og:locale', 'en_CA')

    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', meta.description)
    upsertMeta('name', 'twitter:image', OG_IMAGE_URL)
    upsertMeta('name', 'twitter:image:alt', OG_IMAGE_ALT)

    upsertLink('canonical', url)
    upsertLink('alternate', url, { hreflang: 'en' })
    upsertLink('alternate', url, { hreflang: 'en-CA' })
    upsertLink('alternate', url, { hreflang: 'x-default' })

    if (indexable) {
      upsertJsonLd(jsonLdForPath(pathname))
    } else {
      document.getElementById(JSON_LD_ID)?.remove()
    }

    void SITE_URL
  }, [pathname])

  return null
}
