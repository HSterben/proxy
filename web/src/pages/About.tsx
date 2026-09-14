import Reveal from '../components/ui/Reveal'
import Button from '../components/ui/Button'
import { SITE_LINKS } from '../lib/site'
import { pricingPlans } from '../data/content'

const values = [
  {
    title: 'States you can name',
    description:
      'A PROXY state is a trigger word plus instructions and optional model settings. Create one, save one from the gallery, or start with built-ins like Simplify, List, and Critique.',
  },
  {
    title: 'Windows and web',
    description:
      'Chat from the desktop app or PROXY Web with the same account. States and plan access sync; billing stays on getproxy.ca.',
  },
  {
    title: 'Small desktop install',
    description:
      'The Windows build ships from GitHub Releases. Install it when you want a bubble and shortcuts outside the browser.',
  },
]

export default function About() {
  return (
    <>
      <section data-nav-tone="dark" className="bg-graphite pb-16 pt-28 text-white">
        <div className="page">
          <Reveal className="card max-w-3xl p-8 text-ink md:p-12">
            <p className="eyebrow">About</p>
            <h1 className="display mt-4 font-semibold">
              PROXY is a customizable AI chat assistant with reusable states
            </h1>
            <p className="mt-6 max-w-[52ch] text-lg text-ink/55">
              PROXY helps you chat with AI using named setups you reuse. Instead of pasting a long
              system prompt every time, you activate a state by name, on Windows or in the browser —
              with one PROXY account.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/app">Open PROXY Web</Button>
              <Button href="/#pricing" variant="outline-dark">
                See pricing
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-canvas py-16 text-ink md:py-20">
        <div className="page">
          <Reveal className="mb-10 max-w-3xl">
            <h2 className="display font-semibold">What PROXY is for</h2>
            <p className="mt-4 max-w-[56ch] text-lg text-ink/55">
              PROXY is built for people who want a repeatable chat setup: summarize, critique, draft,
              or follow a custom instruction set. Free accounts can try chat with a small lifetime
              allowance. Pro ({pricingPlans[1]?.price}
              {pricingPlans[1]?.period}) adds monthly capacity and publishing custom states.
            </p>
          </Reveal>
          <div className="grid gap-3 md:grid-cols-3">
            {values.map((value, i) => (
              <Reveal key={value.title} delay={i * 60}>
                <div className={`p-6 md:p-8 ${i === 1 ? 'card-dark' : 'card'}`}>
                  <h3 className="text-xl font-semibold">{value.title}</h3>
                  <p className={`mt-3 text-base leading-relaxed ${i === 1 ? 'text-white/60' : 'text-ink/55'}`}>
                    {value.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-12 max-w-2xl">
            <h2 className="text-xl font-semibold">Who builds PROXY</h2>
            <p className="mt-3 text-base leading-relaxed text-ink/55">
              PROXY is developed by Sterben. Public source and Windows releases:{' '}
              <a className="underline underline-offset-2" href={SITE_LINKS.github}>
                {SITE_LINKS.github.replace('https://', '')}
              </a>
              . Support:{' '}
              <a className="underline underline-offset-2" href={`mailto:${SITE_LINKS.email}`}>
                {SITE_LINKS.email}
              </a>
              .
            </p>
          </Reveal>
        </div>
      </section>
    </>
  )
}
