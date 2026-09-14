import { Box, GitBranch, Maximize2, Crosshair } from 'lucide-react'
import Reveal from '../ui/Reveal'
import { productImages } from '../../data/productImages'

const traits = [
  { icon: Box, label: 'States' },
  { icon: GitBranch, label: 'Triggers' },
  { icon: Maximize2, label: 'Windows' },
  { icon: Crosshair, label: 'Web' },
]

export default function Benefits() {
  return (
    <section id="features" className="bg-canvas py-20 text-ink md:py-24">
      <div className="page">
        <Reveal className="mb-12 max-w-xl">
          <p className="eyebrow">Why PROXY</p>
          <h2 className="display mt-3 font-semibold">Chat on desktop or web, with states you define.</h2>
        </Reveal>

        <div className="grid gap-3 lg:grid-cols-5">
          <Reveal className="card-dark relative lg:col-span-3 p-8 pb-14 md:p-11 md:pb-16">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/42">
              Ask <span className="mx-1.5 inline-block h-1 w-1 rounded-full bg-signal align-middle" /> Stream{' '}
              <span className="mx-1.5 inline-block h-1 w-1 rounded-full bg-signal align-middle" /> Revise
            </p>
            <h3 className="mt-5 text-xl font-semibold tracking-[-0.02em] md:text-[22px]">Streaming replies</h3>
            <p className="mt-3 max-w-[42ch] text-base leading-relaxed text-white/58">
              PROXY shows the answer as it arrives. Open the Windows bubble or the web client, send a
              message, and keep working while text streams in.
            </p>
            <div className="relative mt-8">
            <div className="overflow-hidden rounded-[14px] border border-white/[0.08] bg-graphite shadow-[0_28px_70px_rgba(0,0,0,0.5)]">
                <img
                  src={productImages.chat}
                  alt="PROXY chat window with a Simplify state reply"
                  className="block w-full object-cover object-top"
                  width={1280}
                  height={800}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <img
                src={productImages.bubble}
                alt="PROXY desktop bubble"
                className="absolute -bottom-8 right-0 w-[52%] max-w-[17rem] rounded-[1.25rem] border border-white/[0.08] object-cover drop-shadow-[0_20px_44px_rgba(0,0,0,0.55)] sm:-bottom-9 sm:right-2 sm:max-w-[19rem] sm:rounded-[1.35rem] lg:right-4"
                width={720}
                height={360}
                loading="lazy"
                decoding="async"
              />
            </div>
          </Reveal>

          <div className="grid gap-3 lg:col-span-2">
            <Reveal delay={80} className="card p-8">
              <h3 className="text-xl font-semibold tracking-[-0.02em] md:text-[22px]">States instead of one-off prompts</h3>
              <p className="mt-3 text-base leading-relaxed text-ink/55">
                Save instructions under a trigger word. Reuse Simplify, Shortly, or a state you wrote,
                by typing that name first in chat.
              </p>
            </Reveal>
            <Reveal delay={120} className="card p-8">
              <h3 className="text-xl font-semibold tracking-[-0.02em] md:text-[22px]">Same account on both surfaces</h3>
              <p className="mt-3 text-base leading-relaxed text-ink/55">
                Sign in once. States sync to your PROXY account. Billing stays on the website.
              </p>
              <ul className="mt-6 grid grid-cols-2 gap-3 border-t border-hairline pt-5">
                {traits.map(({ icon: Icon, label }) => (
                  <li key={label} className="flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] text-ink/55">
                    <Icon className="h-4 w-4 text-signal" strokeWidth={1.5} />
                    {label}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  )
}
