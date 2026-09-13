import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { ScrollSmoother } from 'gsap/ScrollSmoother'
import { DESKTOP_DOWNLOAD_URL, navLinks } from '../../data/content'
import { smoothScrollTo } from '../../lib/smoothScroll'
import BrandMark from '../ui/BrandMark'
import AccountMenu from './AccountMenu'

function LogoMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className={`flex items-center gap-2.5 ${inverted ? 'text-light' : 'text-ink'}`} aria-hidden="true">
      <BrandMark className="h-7 w-7" inverted={inverted} />
      <span className="text-base font-semibold tracking-tight">PROXY</span>
    </span>
  )
}

function NavItems({
  onNavigate,
  inverted = false,
}: {
  onNavigate?: () => void
  inverted?: boolean
}) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const idle = inverted ? 'text-light/85 hover:text-light' : 'text-ink/70 hover:text-ink'
  const active = inverted ? 'text-light' : 'text-ink'

  return (
    <>
      {navLinks.map((link) =>
        link.href.startsWith('/#') ? (
          <a
            key={link.href}
            href={link.href}
            className={`text-[15px] font-medium transition-colors duration-200 ${idle}`}
            onClick={(e) => {
              e.preventDefault()
              onNavigate?.()
              const id = link.href.slice(2) // "/#features" → "features"
              if (pathname === '/') {
                smoothScrollTo(id)
                window.history.replaceState(null, '', `#${id}`)
              } else {
                navigate({ pathname: '/', hash: id })
              }
            }}
          >
            {link.label}
          </a>
        ) : (
          <NavLink
            key={link.href}
            to={link.href}
            onClick={onNavigate}
            className={({ isActive }) =>
              `text-[15px] font-medium transition-colors duration-200 ${
                isActive ? active : idle
              }`
            }
          >
            {link.label}
          </NavLink>
        ),
      )}
    </>
  )
}

/** Light text over dark bands; dark text over light bands. Backdrop blur tints the bar itself. */
function useNavTone(): 'light' | 'dark' {
  const { pathname } = useLocation()
  const [tone, setTone] = useState<'light' | 'dark'>(pathname === '/' ? 'dark' : 'light')

  useEffect(() => {
    const update = () => {
      const nodes = document.querySelectorAll<HTMLElement>('[data-nav-tone="dark"]')
      const bandBottom = 72
      let overDark = false
      nodes.forEach((node) => {
        const rect = node.getBoundingClientRect()
        if (rect.top < bandBottom && rect.bottom > 0) overDark = true
      })
      setTone(overDark ? 'dark' : 'light')
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    window.addEventListener('proxy:smooth-scroll', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('proxy:smooth-scroll', update)
    }
  }, [pathname])

  return tone
}

export default function Navbar() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const tone = useNavTone()
  const inverted = tone === 'dark'

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    const smoother = ScrollSmoother.get()
    smoother?.paused(open)
    return () => {
      document.body.style.overflow = ''
      smoother?.paused(false)
    }
  }, [open])

  if (pathname === '/app') return null

  const ctaIdle = inverted
    ? 'border-light/30 text-light hover:border-light hover:bg-light/12'
    : 'border-ink/15 text-ink/75 hover:border-ink/30 hover:bg-ink/[0.05] hover:text-ink'
  const menuBtn = inverted
    ? 'border-light/25 text-light bg-light/5'
    : 'border-ink/12 text-ink bg-ink/[0.03]'

  return (
    <header className={`site-nav fixed inset-x-0 top-0 z-50 ${inverted ? 'site-nav--dark' : 'site-nav--light'}`}>
      <div className="page relative z-10 flex h-16 items-center justify-between gap-4">
        <Link to="/" className="pressable shrink-0" aria-label="PROXY home">
          <LogoMark inverted={inverted} />
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          <NavItems inverted={inverted} />
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={DESKTOP_DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
            className={`pressable inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-[15px] font-medium transition-colors duration-200 ${ctaIdle}`}
          >
            Download for Windows
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </a>
          <Link
            to="/app"
            className={`pressable inline-flex min-h-10 items-center rounded-full border px-4 text-[15px] font-medium transition-colors duration-200 ${ctaIdle}`}
          >
            Open PROXY Web
          </Link>
          <AccountMenu variant={inverted ? 'dark' : 'light'} />
        </div>

        <button
          type="button"
          className={`pressable flex h-11 w-11 items-center justify-center rounded-full border lg:hidden ${menuBtn}`}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" strokeWidth={1.5} /> : <Menu className="h-5 w-5" strokeWidth={1.5} />}
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        </button>
      </div>

      {open && (
        <div
          id="mobile-nav"
          className={`relative z-10 border-t backdrop-blur-2xl lg:hidden ${
            inverted
              ? 'border-light/10 bg-graphite/85'
              : 'border-ink/10 bg-paper/85'
          }`}
        >
          <nav className="page flex flex-col gap-1 py-4" aria-label="Mobile">
            <div
              className={`flex flex-col gap-1 [&_a]:flex [&_a]:min-h-11 [&_a]:items-center [&_a]:text-base ${
                inverted ? '[&_a]:text-light' : '[&_a]:text-ink'
              }`}
            >
              <NavItems inverted={inverted} onNavigate={() => setOpen(false)} />
            </div>
            <Link
              to="/app"
              className={`mt-2 flex min-h-11 items-center justify-center rounded-[10px] border text-base ${
                inverted ? 'border-light/20 text-light' : 'border-hairline text-ink'
              }`}
            >
              Open PROXY Web
            </Link>
            <a
              href={DESKTOP_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
              className={`flex min-h-11 items-center justify-center rounded-[10px] border text-base ${
                inverted ? 'border-light/20 text-light' : 'border-hairline text-ink'
              }`}
            >
              Download for Windows
            </a>
            <div className="mt-3 px-1">
              <AccountMenu variant={inverted ? 'dark' : 'light'} />
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
