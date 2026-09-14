import { faqs } from '../../data/content'
import Reveal from '../ui/Reveal'

export default function FAQ() {
  return (
    <section
      id="faq"
      className="border-t border-hairline/80 bg-white/80 py-20 text-ink md:py-24"
      aria-labelledby="faq-heading"
    >
      <div className="mx-auto w-full max-w-3xl px-5 md:px-8">
        <Reveal className="mb-12">
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-heading" className="display mt-3 font-semibold">
            Common questions
          </h2>
          <p className="mt-4 max-w-[54ch] text-base leading-relaxed text-ink/55">
            Short answers about what PROXY is, states, pricing, and where to chat on Windows or the
            web.
          </p>
        </Reveal>

        <div className="border-t border-hairline/80">
          {faqs.map((faq, i) => (
            <Reveal key={faq.question} delay={i * 35}>
              <details
                className="group border-b border-hairline/80"
                open={i === 0}
              >
                <summary className="pressable flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-5 text-left marker:content-none md:py-6 [&::-webkit-details-marker]:hidden">
                  <h3 className="m-0 text-base font-semibold tracking-[-0.015em] md:text-lg">
                    {faq.question}
                  </h3>
                  <span
                    className="shrink-0 text-ink/35 transition-transform duration-200 group-open:rotate-180"
                    aria-hidden
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </summary>
                <div className="pb-6">
                  <p className="max-w-[62ch] text-base leading-relaxed text-ink/55">{faq.answer}</p>
                </div>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
