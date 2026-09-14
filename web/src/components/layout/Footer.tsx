import { Link } from 'react-router-dom'
import { footerLinks, homeAnchors, socialLinks } from '../../data/content'
import BrandMark from '../ui/BrandMark'

export default function Footer() {
  return (
    <footer data-nav-tone="dark" className="border-t border-white/[0.08] bg-graphite py-16 text-white">
      <div className="page">
        <div className="grid gap-12 md:grid-cols-3">
          <div>
            <Link to="/" className="pressable flex items-center gap-2.5">
              <BrandMark inverted className="h-6 w-6" />
              <span className="text-[17px] font-semibold tracking-[-0.02em]">PROXY</span>
            </Link>
            <p className="mt-4 max-w-[32ch] text-base leading-relaxed text-white/48">
              Chat on Windows and the web with states synced to your PROXY account.
            </p>
            <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.2em] text-white/38">
              Web <span className="mx-1.5 inline-block h-1 w-1 rounded-full bg-signal align-middle" /> Windows{' '}
              <span className="mx-1.5 inline-block h-1 w-1 rounded-full bg-signal align-middle" /> States
            </p>
          </div>

          <div>
            <h3 className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-white/38">Navigation</h3>
            <ul className="space-y-1">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="inline-flex min-h-11 items-center text-base text-white/52 transition-colors duration-200 hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-white/38">Product</h3>
            <ul className="space-y-1">
              {homeAnchors.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="inline-flex min-h-11 items-center text-base text-white/52 transition-colors duration-200 hover:text-white"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-white/[0.08] pt-7 md:flex-row md:items-center">
          <p className="text-sm text-white/38">
            &copy; {new Date().getFullYear()} PROXY. All rights reserved.
          </p>
          <div className="flex gap-6">
            {socialLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-white/38 transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
