import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
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

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}

/** Keeps title, description, canonical, and social tags in sync with the active route. */
export default function DocumentMeta() {
  const { pathname } = useLocation()

  useEffect(() => {
    const meta = metaForPath(pathname)
    const url = absoluteUrl(meta.path)
    const title = meta.title || DEFAULT_TITLE

    document.title = title

    upsertMeta('name', 'description', meta.description)
    upsertMeta('name', 'robots', meta.index === false ? 'noindex, nofollow' : 'index, follow, max-image-preview:large')

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

    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', meta.description)
    upsertMeta('name', 'twitter:image', OG_IMAGE_URL)
    upsertMeta('name', 'twitter:image:alt', OG_IMAGE_ALT)

    upsertLink('canonical', url)

    // Ensure absolute og:url base stays correct if the host ever differs in preview deploys
    upsertMeta('property', 'og:locale', 'en_CA')
    void SITE_URL
  }, [pathname])

  return null
}
