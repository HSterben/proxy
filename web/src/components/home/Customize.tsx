import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import Reveal from '../ui/Reveal'
import ProductPreview, { type LengthMode, type StyleMode, type ToneMode } from '../ui/ProductPreview'

function Segment<T extends string>({
  label,
  value,
  options,
  onChange,
  layoutGroup,
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
  layoutGroup: string
}) {
  const reduce = useReducedMotion()

  return (
    <fieldset>
      <legend className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-white/48">
        {label}
      </legend>
      <div className="segment-track flex">
        {options.map((opt) => {
          const selected = value === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(opt.id)}
              className="segment-item pressable relative z-[1]"
            >
              {selected && !reduce && (
                <motion.span
                  layoutId={`segment-thumb-${layoutGroup}`}
                  className="segment-thumb"
                  transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
                />
              )}
              {selected && reduce && <span className="segment-thumb" />}
              <span className="relative z-[1]">{opt.label}</span>
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export default function Customize() {
  const [length, setLength] = useState<LengthMode>('concise')
  const [tone, setTone] = useState<ToneMode>('professional')
  const [style, setStyle] = useState<StyleMode>('precise')

  return (
    <section id="customize" data-nav-tone="dark" className="bg-graphite py-20 text-white md:py-24">
      <div className="page grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <p className="eyebrow-dark">States</p>
          <h2 className="display mt-3 font-semibold">Preview length, tone, and style.</h2>
          <p className="mt-4 max-w-[42ch] text-lg leading-relaxed text-white/52">
            These controls mirror the kinds of preferences you can bake into a PROXY state. Switch
            them and watch the sample reply change.
          </p>

          <div className="mt-9 grid gap-5">
            <Segment
              label="Length"
              layoutGroup="length"
              value={length}
              onChange={setLength}
              options={[
                { id: 'concise', label: 'Concise' },
                { id: 'detailed', label: 'Detailed' },
              ]}
            />
            <Segment
              label="Tone"
              layoutGroup="tone"
              value={tone}
              onChange={setTone}
              options={[
                { id: 'casual', label: 'Casual' },
                { id: 'professional', label: 'Professional' },
              ]}
            />
            <Segment
              label="Style"
              layoutGroup="style"
              value={style}
              onChange={setStyle}
              options={[
                { id: 'creative', label: 'Creative' },
                { id: 'precise', label: 'Precise' },
              ]}
            />
          </div>
        </Reveal>

        <Reveal delay={80} className="min-w-0">
          <ProductPreview length={length} tone={tone} style={style} />
        </Reveal>
      </div>
    </section>
  )
}
