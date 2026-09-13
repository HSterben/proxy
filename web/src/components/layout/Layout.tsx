import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrollSmoother } from 'gsap/ScrollSmoother'
import Navbar from './Navbar'
import Footer from './Footer'
import {
  prefersReducedMotion,
  registerSmoothScrollPlugins,
  smoothScrollTo,
  smoothScrollTop,
} from '../../lib/smoothScroll'

registerSmoothScrollPlugins()

export default function Layout() {
  const { pathname, hash } = useLocation()

  useGSAP(
    () => {
      if (prefersReducedMotion()) return

      document.documentElement.classList.add('has-smooth-scroll')

      const smoother = ScrollSmoother.create({
        wrapper: '#smooth-wrapper',
        content: '#smooth-content',
        smooth: 0.65,
        effects: true,
        smoothTouch: 0.05,
        ignoreMobileResize: true,
        onUpdate: () => {
          window.dispatchEvent(new Event('proxy:smooth-scroll'))
        },
      })

      return () => {
        document.documentElement.classList.remove('has-smooth-scroll')
        smoother.kill()
      }
    },
    { dependencies: [] },
  )

  useEffect(() => {
    // Recalc after route paint (images / outlet swap).
    const id = requestAnimationFrame(() => ScrollTrigger.refresh())

    if (hash) {
      const t = window.setTimeout(() => smoothScrollTo(hash), 40)
      return () => {
        cancelAnimationFrame(id)
        window.clearTimeout(t)
      }
    }

    smoothScrollTop(true)
    return () => cancelAnimationFrame(id)
  }, [pathname, hash])

  return (
    <div className="min-h-screen bg-canvas">
      <Navbar />
      <div id="smooth-wrapper">
        <div id="smooth-content">
          <main>
            <Outlet />
          </main>
          <Footer />
        </div>
      </div>
    </div>
  )
}
