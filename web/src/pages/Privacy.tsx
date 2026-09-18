import { Link } from 'react-router-dom'
import Reveal from '../components/ui/Reveal'
import { SITE_LINKS } from '../lib/site'

const LAST_UPDATED = 'September 15, 2026'

type Section = {
  id: string
  title: string
  paragraphs: string[]
  bullets?: string[]
  afterBullets?: string[]
}

const sections: Section[] = [
  {
    id: 'scope',
    title: '1. Scope',
    paragraphs: [
      'This Privacy Policy describes how PROXY (“PROXY,” “we,” “us,” or “our”) collects, uses, shares, and protects information when you use getproxy.ca, PROXY Web chat, the Windows desktop app, and related services (together, the “Services”).',
      'By using the Services, you agree to this Policy. If you do not agree, do not use the Services.',
    ],
  },
  {
    id: 'account',
    title: '2. Account and identity data',
    paragraphs: [
      'To sign in, we use WorkOS AuthKit. Depending on how you authenticate, we may receive and store:',
    ],
    bullets: [
      'Name and email address',
      'WorkOS user identifier and related authentication metadata',
      'Profile details you choose to add (for example display name or avatar where available)',
      'Account and plan status tied to your PROXY user record',
    ],
    afterBullets: [
      'We use this information to create and secure your account, sync access across web and Windows, enforce plan limits, and communicate about the Services (including support replies).',
    ],
  },
  {
    id: 'ai',
    title: '3. Prompts, states, and AI interactions',
    paragraphs: [
      'When you chat, your messages, attached content you upload for a request, conversation context you send, and active state instructions (system prompts / triggers) are processed so we can generate a reply.',
      'That content is transmitted to our backend and to our AI provider(s) to complete the request. Do not submit secrets, passwords, payment card numbers, or information you are not allowed to share.',
      'We also store PROXY “states” you create or save (trigger names, instructions, and related settings), including states you publish to the gallery when you choose to make them public.',
      'Chat transcripts may be held temporarily in your client session for continuity. We process prompts server-side to fulfill requests and to measure usage; we do not sell your prompts. Provider processing is also subject to the AI provider’s own terms and privacy practices.',
    ],
  },
  {
    id: 'usage',
    title: '4. Usage and technical data',
    paragraphs: [
      'We collect operational data needed to run and protect the Services, which may include:',
    ],
    bullets: [
      'Approximate usage metrics (for example request counts or weighted token usage against free or paid allowances)',
      'IP address and related network signals used for abuse prevention (such as free-tier signup limits)',
      'Device, browser, or app version information when provided by the client',
      'Diagnostic logs (errors, auth events, billing webhooks) used for reliability and security',
      'Cookies or local storage used for session continuity on the website',
    ],
  },
  {
    id: 'processors',
    title: '5. Service providers and processors',
    paragraphs: [
      'We use third parties to operate PROXY. They process data only as needed to provide their services to us:',
    ],
    bullets: [
      'Convex, application database, backend functions, and HTTP APIs that power accounts, states, usage, and chat endpoints',
      'WorkOS, authentication and identity (sign-in, sessions, user lifecycle events)',
      'AI providers, model inference for generating chat responses from your prompts and state instructions',
      'Stripe, payment processing for paid plans (card details are handled by Stripe; we receive subscription and customer identifiers, plan status, and related billing metadata)',
      'Hosting and delivery providers for getproxy.ca and related infrastructure',
    ],
    afterBullets: [
      'We do not sell your personal information. We may disclose information if required by law, to protect rights and safety, or in connection with a business transfer (for example a merger), with appropriate safeguards.',
    ],
  },
  {
    id: 'payments',
    title: '6. Payments (Stripe)',
    paragraphs: [
      'If you subscribe to a paid plan, billing is handled through Stripe Checkout and the Stripe Customer Portal on getproxy.ca. Stripe processes payment method details under its own privacy policy. We store subscription status, plan, and Stripe customer/subscription IDs needed to unlock Pro features and manage entitlements across web and Windows.',
    ],
  },
  {
    id: 'retention',
    title: '7. Retention and deletion',
    paragraphs: [
      'We retain account, state, usage, and billing linkage data for as long as your account is active and as needed to provide the Services, comply with law, resolve disputes, and enforce agreements.',
      'You may request deletion of your PROXY account data by contacting us (see Contact below). We will delete or de-identify personal data we control, subject to legal retention needs and data held independently by processors (for example Stripe invoices or WorkOS identity records). Published gallery states may need to be unpublished or removed as part of deletion.',
      'After deletion, residual copies may remain briefly in backups or logs until they are rotated in the ordinary course of operations.',
    ],
  },
  {
    id: 'security',
    title: '8. Security',
    paragraphs: [
      'We use industry-standard measures appropriate to the nature of the Services, including encrypted transport (HTTPS), authenticated API access (bearer tokens / sessions), and access controls on backend systems. No method of transmission or storage is completely secure; we cannot guarantee absolute security.',
    ],
  },
  {
    id: 'rights',
    title: '9. Your rights and choices',
    paragraphs: [
      'Depending on where you live, you may have rights to access, correct, delete, or obtain a copy of personal information we hold about you, or to object to or restrict certain processing. To exercise these rights, email us at the address below. We may need to verify your identity before responding.',
      'You can update some profile information in-product, manage billing through Stripe’s portal, and sign out of sessions. You may also contact us to close your account.',
    ],
  },
  {
    id: 'children',
    title: '10. Children',
    paragraphs: [
      'The Services are not directed to children under 13 (or the minimum age required in your jurisdiction). We do not knowingly collect personal information from children. If you believe a child has provided us data, contact us and we will take appropriate steps to delete it.',
    ],
  },
  {
    id: 'international',
    title: '11. International processing',
    paragraphs: [
      'PROXY and its processors may process data in the United States and other countries. If you access the Services from another region, your information may be transferred to and processed in countries that may have different data-protection laws than your own.',
    ],
  },
  {
    id: 'changes',
    title: '12. Changes to this Policy',
    paragraphs: [
      'We may update this Privacy Policy from time to time. We will post the revised version at https://getproxy.ca/privacy and update the “Last updated” date. Material changes may also be highlighted on the site or by email when appropriate. Continued use of the Services after an update means you accept the revised Policy.',
    ],
  },
  {
    id: 'contact',
    title: '13. Contact',
    paragraphs: [
      'Questions about privacy, data requests, or this Policy:',
    ],
  },
]

export default function Privacy() {
  return (
    <>
      <section data-nav-tone="dark" className="bg-graphite pb-12 pt-28 text-white">
        <div className="page">
          <Reveal className="card max-w-3xl p-8 text-ink md:p-12">
            <p className="eyebrow">Legal</p>
            <h1 className="display mt-4 font-semibold">Privacy Policy</h1>
            <p className="mt-4 max-w-[48ch] text-lg text-ink/55">
              How PROXY collects and uses information for getproxy.ca, PROXY Web, and the Windows
              app.
            </p>
            <p className="mt-6 text-sm text-ink/45">Last updated: {LAST_UPDATED}</p>
          </Reveal>
        </div>
      </section>

      <section className="bg-canvas pb-20 pt-10 text-ink">
        <div className="page max-w-3xl">
          <Reveal>
            <nav aria-label="Privacy sections" className="mb-10 rounded-[10px] border border-hairline bg-white p-5">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/40">
                On this page
              </p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-sm text-ink/60 underline-offset-2 hover:text-ink hover:underline"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </Reveal>

          <div className="space-y-10">
            {sections.map((section) => (
              <Reveal key={section.id}>
                <article id={section.id} className="scroll-mt-28">
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">{section.title}</h2>
                  {section.paragraphs.map((p) => (
                    <p key={p.slice(0, 48)} className="mt-3 text-base leading-relaxed text-ink/60">
                      {p}
                    </p>
                  ))}
                  {section.bullets && (
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-ink/60">
                      {section.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  )}
                  {section.afterBullets?.map((p) => (
                    <p key={p.slice(0, 48)} className="mt-3 text-base leading-relaxed text-ink/60">
                      {p}
                    </p>
                  ))}
                  {section.id === 'contact' && (
                    <ul className="mt-3 space-y-2 text-base text-ink/60">
                      <li>
                        Email:{' '}
                        <a
                          className="font-medium text-ink underline-offset-2 hover:underline"
                          href={`mailto:${SITE_LINKS.email}`}
                        >
                          {SITE_LINKS.email}
                        </a>
                      </li>
                      <li>
                        Contact form:{' '}
                        <Link className="font-medium text-ink underline-offset-2 hover:underline" to="/contact">
                          getproxy.ca/contact
                        </Link>
                      </li>
                      <li>
                        Website:{' '}
                        <a
                          className="font-medium text-ink underline-offset-2 hover:underline"
                          href={SITE_LINKS.website}
                        >
                          {SITE_LINKS.website.replace('https://', '')}
                        </a>
                      </li>
                    </ul>
                  )}
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
