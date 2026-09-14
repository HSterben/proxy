import { faqs, processSteps, pricingPlans } from '../data/content'
import { SITE_LINKS } from './site'
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  OG_IMAGE_URL,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  absoluteUrl,
  metaForPath,
} from './seo'

const ORG_ID = `${SITE_URL}/#organization`
const WEBSITE_ID = `${SITE_URL}/#website`
const APP_ID = `${SITE_URL}/#app`

export function organizationLd() {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_NAME,
    legalName: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/apple-touch-icon.png`,
      width: 180,
      height: 180,
    },
    image: OG_IMAGE_URL,
    description: DEFAULT_DESCRIPTION,
    email: SITE_LINKS.email,
    sameAs: [SITE_LINKS.github, SITE_LINKS.linkedin],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: SITE_LINKS.email,
      url: absoluteUrl('/contact'),
      availableLanguage: ['English'],
    },
  }
}

export function websiteLd() {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: `${SITE_URL}/`,
    name: SITE_NAME,
    alternateName: ['PROXY AI', 'getproxy.ca'],
    description: `${SITE_TAGLINE}. Named triggers that shape every reply.`,
    publisher: { '@id': ORG_ID },
    inLanguage: 'en-CA',
    about: { '@id': APP_ID },
  }
}

export function softwareApplicationLd() {
  return {
    '@type': 'SoftwareApplication',
    '@id': APP_ID,
    name: SITE_NAME,
    applicationCategory: 'ProductivityApplication',
    applicationSubCategory: 'AI assistant',
    operatingSystem: 'Windows, Web',
    url: `${SITE_URL}/`,
    downloadUrl: absoluteUrl('/'),
    image: OG_IMAGE_URL,
    description: DEFAULT_DESCRIPTION,
    featureList: [
      'Named states (trigger words with custom instructions)',
      'Windows desktop app and PROXY Web chat',
      'Streaming replies',
      'Synced account and states gallery',
      'Free tier with Simplify, List, and Critique',
    ],
    offers: pricingPlans.map((plan) => ({
      '@type': 'Offer',
      name: plan.name,
      price: String(plan.price).replace(/[^0-9.]/g, '') || '0',
      priceCurrency: 'USD',
      description: plan.description,
      url: absoluteUrl(plan.href),
      availability: 'https://schema.org/InStock',
      ...(plan.period === '/month'
        ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: '10', priceCurrency: 'USD', billingDuration: 'P1M' } }
        : plan.period === '/year'
          ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: '99', priceCurrency: 'USD', billingDuration: 'P1Y' } }
          : {}),
    })),
    publisher: { '@id': ORG_ID },
    author: { '@id': ORG_ID },
  }
}

export function faqPageLd(pageUrl = absoluteUrl('/')) {
  return {
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    url: pageUrl,
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
    isPartOf: { '@id': WEBSITE_ID },
  }
}

export function howToLd() {
  return {
    '@type': 'HowTo',
    '@id': `${SITE_URL}/#howto`,
    name: 'How to use PROXY',
    description:
      'Install or open PROXY, pick a state, and chat with instructions that match that trigger.',
    totalTime: 'PT5M',
    step: processSteps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.title,
      text: step.description,
      url: absoluteUrl(`/#process`),
    })),
  }
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

export function webPageLd(pathname: string) {
  const meta = metaForPath(pathname)
  const url = absoluteUrl(meta.path)
  return {
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: meta.title,
    description: meta.description,
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': APP_ID },
    inLanguage: 'en-CA',
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: OG_IMAGE_URL,
    },
  }
}

/** Route-aware JSON-LD graph for answer engines and rich results. */
export function jsonLdForPath(pathname: string) {
  const graph: Record<string, unknown>[] = [
    organizationLd(),
    websiteLd(),
    softwareApplicationLd(),
    webPageLd(pathname),
  ]

  if (pathname === '/') {
    graph.push(faqPageLd(absoluteUrl('/')), howToLd())
    graph.push(
      breadcrumbLd([{ name: SITE_NAME, path: '/' }]),
    )
  } else if (pathname === '/about') {
    graph.push(
      breadcrumbLd([
        { name: SITE_NAME, path: '/' },
        { name: 'About', path: '/about' },
      ]),
    )
  } else if (pathname === '/states') {
    graph.push(
      breadcrumbLd([
        { name: SITE_NAME, path: '/' },
        { name: 'States gallery', path: '/states' },
      ]),
    )
  } else if (pathname === '/contact') {
    graph.push(
      breadcrumbLd([
        { name: SITE_NAME, path: '/' },
        { name: 'Contact', path: '/contact' },
      ]),
      {
        '@type': 'ContactPage',
        '@id': `${absoluteUrl('/contact')}#contact`,
        url: absoluteUrl('/contact'),
        name: `Contact, ${SITE_NAME}`,
        isPartOf: { '@id': WEBSITE_ID },
        mainEntity: { '@id': ORG_ID },
      },
    )
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
}

export { DEFAULT_TITLE }
