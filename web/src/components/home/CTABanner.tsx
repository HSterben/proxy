import Button from '../ui/Button'
import Reveal from '../ui/Reveal'
import Sparkline from '../ui/Sparkline'
import { DESKTOP_DOWNLOAD_URL } from '../../data/content'

export default function CTABanner() {
  return (
    <section data-nav-tone="dark" className="bg-graphite py-20 text-white md:py-24">
      <div className="page">
        <Reveal>
          <div className="relative overflow-hidden rounded-[16px] border border-white/[0.06] bg-[#0a0a0a] px-8 py-14 shadow-[0_1px_0_rgb(255_255_255_/_0.04)_inset] md:px-16 md:py-20">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,rgb(32_227_255_/_0.08),transparent_55%)]"
              aria-hidden="true"
            />
            <div className="relative">
              <p className="text-center text-[11px] font-medium uppercase tracking-[0.2em] text-white/42">
                Web <span className="mx-1.5 inline-block h-1 w-1 rounded-full bg-signal align-middle" /> Windows{' '}
                <span className="mx-1.5 inline-block h-1 w-1 rounded-full bg-signal align-middle" /> States
              </p>
              <h2 className="display mx-auto mt-5 max-w-2xl text-center font-semibold">
                Open PROXY in the browser or install on Windows
              </h2>
              <p className="mx-auto mt-4 max-w-[40ch] text-center text-lg leading-relaxed text-white/52">
                Sign in to chat with an active plan. Download the latest Windows installer from GitHub
                Releases.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Button href="/app" variant="primary-light" className="w-full sm:w-auto">
                  Open PROXY Web
                </Button>
                <Button href={DESKTOP_DOWNLOAD_URL} variant="outline-light" className="w-full sm:w-auto">
                  Download for Windows
                </Button>
              </div>
              <Sparkline className="mx-auto mt-12 h-16 w-full max-w-xl opacity-70" />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
