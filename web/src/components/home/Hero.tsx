import { ArrowUpRight, Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import Orb from '../Orb'
import { DESKTOP_DOWNLOAD_URL } from '../../data/content'
import { productImages } from '../../data/productImages'
import { smoothScrollTo } from '../../lib/smoothScroll'

const springEnter = { type: 'spring' as const, bounce: 0, duration: 0.4 }

export default function Hero() {
  const reduce = useReducedMotion()
  const enter = (delay: number) =>
    reduce
      ? { initial: false as const, animate: { opacity: 1 }, transition: { duration: 0.2 } }
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { ...springEnter, delay },
        }

  return (
    <section
      data-nav-tone="dark"
      className="relative min-h-screen overflow-hidden bg-[#0b0d0f] px-3 pb-4 pt-20 text-light md:min-h-[100dvh] md:px-4 md:pb-5 md:pt-24"
    >
      {/* Atmospheric depth behind the bento */}

      <div className="relative mx-auto flex h-full max-w-[1400px] flex-col">
        <div className="grid flex-1 grid-cols-6 gap-2 md:grid-cols-12 md:grid-rows-[minmax(280px,34vh)_minmax(140px,auto)_minmax(120px,auto)] md:gap-3">
          <motion.div
            className="hero-radius hero-material col-span-6 flex min-h-[220px] flex-col justify-end bg-paper p-7 text-ink md:col-span-5 md:col-start-1 md:row-start-1 md:min-h-0 md:p-10 lg:p-12"
            {...enter(0)}
          >
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink/40">
              PROXY
            </p>
            <h1 className="text-[1.7rem] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-3xl md:text-[2.05rem] lg:text-[2.55rem]">
              Chat with states
              <br />
              you control.
            </h1>
            <p className="mt-4 max-w-[28ch] text-[15px] leading-snug text-muted-dark md:text-base">
              Windows and the web. One account. Named triggers that shape every reply.
            </p>
          </motion.div>

          <motion.div
            className="hero-radius hero-material col-span-3 hidden aspect-square bg-paper text-ink md:col-span-2 md:col-start-11 md:row-start-1 md:flex"
            {...enter(0.05)}
          >
            <a
              href={DESKTOP_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              className="pressable group flex h-full w-full flex-col justify-between p-5 lg:p-6"
              aria-label="Download Windows app"
            >
              <ArrowUpRight
                className="h-7 w-7 self-end transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={1.4}
              />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/45">Windows</p>
                <p className="mt-2 text-[1.35rem] font-semibold leading-tight tracking-[-0.025em] lg:text-[1.5rem]">
                  Download
                  <br />
                  the app
                </p>
              </div>
            </a>
          </motion.div>

          <motion.div
            className="hero-radius relative col-span-6 aspect-square overflow-hidden bg-ink md:col-span-5 md:col-start-6 md:row-span-3 md:row-start-1 md:aspect-auto md:min-h-0"
            initial={reduce ? false : { opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.24, delay: 0.08 }}
          >
            <div className="absolute inset-0">
              <Orb hue={0} hoverIntensity={0} rotateOnHover backgroundColor="#0b0d0f" />
            </div>
          </motion.div>

          <motion.div
            className="hero-radius col-span-6 flex flex-col justify-between bg-paper p-5 text-ink md:col-span-2 md:col-start-11 md:row-span-2 md:row-start-2 md:min-h-[220px] md:p-6"
            {...enter(0.12)}
          >
            <Sparkles className="h-5 w-5 text-ink/35" strokeWidth={1.5} />
            <p className="text-[15px] leading-snug tracking-[-0.01em]">
              <span className="font-semibold">States:</span>{' '}
              <span className="text-muted-dark">
                Name a trigger, set the instructions, reuse it every time you chat.
              </span>
            </p>
          </motion.div>

          <motion.div
            className="col-span-6 flex flex-col justify-between gap-6 px-1 md:col-span-5 md:col-start-1 md:row-span-2 md:row-start-2 md:px-2"
            {...enter(0.04)}
          >
            <div>
              <a
                href="#features"
                className="link-underline-light mt-5 w-fit"
                onClick={(e) => {
                  e.preventDefault()
                  smoothScrollTo('features')
                }}
              >
                See how PROXY works
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>

            <div className="relative overflow-hidden rounded-[1.35rem] border border-white/[0.08] bg-surface-dark shadow-[0_24px_60px_rgba(0,0,0,0.4),0_1px_0_rgba(255,255,255,0.06)_inset]">
              <img
                src={productImages.chat}
                alt="PROXY chat with the Simplify state"
                className="block w-full object-cover object-top"
                width={1280}
                height={800}
                decoding="async"
              />
            </div>
          </motion.div>

          <motion.div className="col-span-6 flex gap-2 md:hidden" {...enter(0.14)}>
            <a
              href={DESKTOP_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              className="pressable hero-radius hero-material flex min-h-11 flex-1 flex-col justify-between bg-paper p-5 text-ink"
              aria-label="Download Windows app"
            >
              <ArrowUpRight className="h-5 w-5 self-end" strokeWidth={1.5} />
              <span className="text-[15px] font-semibold leading-snug tracking-[-0.02em]">
                Download
                <br />
                the app
              </span>
            </a>
            <a
              href={DESKTOP_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              className="pressable hero-radius hero-material flex min-h-11 flex-[2] items-center justify-center gap-2 bg-paper p-5 text-[15px] font-semibold tracking-[-0.015em] text-ink"
            >
              Download for Windows
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
