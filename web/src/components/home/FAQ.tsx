import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { faqs } from '../../data/content'
import Reveal from '../ui/Reveal'

const springPanel = { type: 'spring' as const, bounce: 0, duration: 0.35 }
const springChevron = { type: 'spring' as const, bounce: 0, duration: 0.3 }

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0)
  const reduce = useReducedMotion()

  return (
    <section className="border-t border-hairline/80 bg-white/80 py-20 text-ink md:py-24">
      <div className="mx-auto w-full max-w-3xl px-5 md:px-8">
        <Reveal className="mb-12">
          <p className="eyebrow">FAQ</p>
          <h2 className="display mt-3 font-semibold">Common questions</h2>
        </Reveal>

        <div className="border-t border-hairline/80">
          {faqs.map((faq, i) => {
            const isOpen = open === i
            return (
              <Reveal key={faq.question} delay={i * 35}>
                <div className="border-b border-hairline/80">
                  <button
                    type="button"
                    className="pressable flex min-h-14 w-full items-center justify-between gap-4 py-5 text-left md:py-6"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${i}`}
                    id={`faq-button-${i}`}
                  >
                    <span className="text-base font-semibold tracking-[-0.015em] md:text-lg">
                      {faq.question}
                    </span>
                    <motion.span
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={reduce ? { duration: 0.15 } : springChevron}
                      className="flex"
                    >
                      <ChevronDown className="h-5 w-5 shrink-0 text-ink/35" strokeWidth={1.5} />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={`faq-panel-${i}`}
                        role="region"
                        aria-labelledby={`faq-button-${i}`}
                        key="answer"
                        initial={reduce ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={reduce ? { duration: 0.15 } : springPanel}
                        className="overflow-hidden"
                      >
                        <div className="pb-6">
                          <p className="max-w-[62ch] text-base leading-relaxed text-ink/55">
                            {faq.answer}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
