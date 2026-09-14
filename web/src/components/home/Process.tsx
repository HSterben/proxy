import { processSteps } from '../../data/content'
import Reveal from '../ui/Reveal'

export default function Process() {
  return (
    <section id="process" className="border-y border-hairline/70 bg-white/70 py-20 text-ink md:py-24">
      <div className="page">
        <Reveal className="mb-12 max-w-xl">
          <p className="eyebrow">How it works</p>
          <h2 className="display mt-3 font-semibold">Sign in, pick a state, send a message.</h2>
        </Reveal>

        <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
          <div
            className="pointer-events-none absolute top-4 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-hairline to-transparent md:block"
            aria-hidden="true"
          />
          {processSteps.map((step, i) => (
            <li key={step.title} className="relative">
              <Reveal delay={i * 60}>
                <span className="relative z-[1] inline-flex h-8 items-center bg-white/90 pr-3 text-[12px] font-medium uppercase tracking-[0.18em] text-signal backdrop-blur-sm">
                  {step.step}
                </span>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.02em] md:text-[22px]">{step.title}</h3>
                <p className="mt-3 max-w-[36ch] text-base leading-relaxed text-ink/55">
                  {step.description}
                </p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
