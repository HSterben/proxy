import { proofItems } from '../../data/content'

export default function ProofStrip() {
  return (
    <section className="border-y border-hairline/70 bg-white/60 py-6 backdrop-blur-[2px]">
      <div className="page">
        <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
          {proofItems.map((item, i) => (
            <li key={item} className="flex items-center gap-5">
              {i > 0 && <span className="h-1 w-1 rounded-full bg-signal/80" aria-hidden="true" />}
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/58">
                {item}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
