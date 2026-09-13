import { ArrowUpRight, Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import Orb from '../Orb'
import { DESKTOP_DOWNLOAD_URL } from '../../data/content'
import { productImages } from '../../data/productImages'
import { smoothScrollTo } from '../../lib/smoothScroll'

export default function Hero() {
  const reduce = useReducedMotion()
  const enter = (delay: number) =>
    reduce
      ? { initial: false as const, animate: { opacity: 1 }, transition: { duration: 0.2 } }
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.22, delay },
        }

  return (
    <section
      data-nav-tone="dark"
      className="relative min-h-screen bg-[#0b0d0f] px-3 pb-4 pt-20 text-light md:min-h-[100dvh] md:px-4 md:pb-5 md:pt-24"
 
    >
      <div className="mx-auto flex h-full max-w-[1400px] flex-col">
        <div className="grid flex-1 grid-cols-6 gap-2 md:grid-cols-12 md:grid-rows-[minmax(280px,34vh)_minmax(140px,auto)_minmax(120px,auto)] md:gap-3">
          <motion.div
            className="hero-radius col-span-6 flex min-h-[220px] items-end bg-paper p-7 text-ink md:col-span-5 md:col-start-1 md:row-start-1 md:min-h-0 md:p-10 lg:p-12"
            {...enter(0)}
          >
            <h1 className="text-[1.65rem] font-semibold leading-[1.12] tracking-tight sm:text-3xl md:text-[2rem] lg:text-[2.45rem]">
              PROXY for Windows and the web.
              <br />
              Chat with states you control.
            </h1>
          </motion.div>

          <motion.div
            className="hero-radius col-span-3 hidden aspect-square bg-paper text-ink md:col-span-2 md:col-start-11 md:row-start-1 md:flex"
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
                className="h-7 w-7 self-end transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={1.4}
              />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink/45">Windows</p>
                <p className="mt-2 text-[1.35rem] font-semibold leading-tight tracking-tight lg:text-[1.5rem]">
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
            <p className="text-[15px] leading-snug">
              <span className="font-semibold">Install:</span>{' '}
              <span className="text-muted-dark">
                Get the Windows build from GitHub Releases, or open chat in the browser.
              </span>
            </p>
          </motion.div>

          <motion.div
            className="col-span-6 flex flex-col justify-between gap-6 px-1 md:col-span-5 md:col-start-1 md:row-span-2 md:row-start-2 md:px-2"
            {...enter(0.06)}
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

            <div className="relative overflow-hidden rounded-[1.25rem] border border-border-dark bg-surface-dark shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
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

          <motion.div className="col-span-6 flex gap-2 md:hidden" {...enter(0.22)}>
            <a
              href={DESKTOP_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              className="pressable hero-radius flex min-h-11 flex-1 flex-col justify-between bg-paper p-5 text-ink"
              aria-label="Download Windows app"
            >
              <ArrowUpRight className="h-5 w-5 self-end" strokeWidth={1.5} />
              <span className="text-[15px] font-semibold leading-snug">
                Download
                <br />
                the app
              </span>
            </a>
            <a
              href={DESKTOP_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              className="pressable hero-radius flex min-h-11 flex-[2] items-center justify-center gap-2 bg-paper p-5 text-[15px] font-semibold text-ink"
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
