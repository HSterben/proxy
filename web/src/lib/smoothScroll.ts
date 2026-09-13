import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrollSmoother } from 'gsap/ScrollSmoother'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'

let registered = false

export function registerSmoothScrollPlugins() {
  if (registered) return
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother, ScrollToPlugin)
  registered = true
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Offset for fixed site nav (~h-16 + breathing room). */
const NAV_OFFSET = 'top 80px'

/**
 * Scroll to an element or hash, preferring ScrollSmoother when active.
 */
export function smoothScrollTo(
  target: string | Element | number,
  options: { immediate?: boolean } = {},
) {
  const immediate = options.immediate ?? prefersReducedMotion()
  const smoother = ScrollSmoother.get()

  if (typeof target === 'string') {
    const id = target.replace(/^#/, '')
    const el = document.getElementById(id)
    if (!el) return
    if (smoother) {
      smoother.scrollTo(el, !immediate, NAV_OFFSET)
      return
    }
    el.scrollIntoView({ behavior: immediate ? 'auto' : 'smooth', block: 'start' })
    return
  }

  if (typeof target === 'number') {
    if (smoother) {
      smoother.scrollTo(target, !immediate)
      return
    }
    window.scrollTo({ top: target, left: 0, behavior: immediate ? 'auto' : 'smooth' })
    return
  }

  if (smoother) {
    smoother.scrollTo(target, !immediate, NAV_OFFSET)
    return
  }
  target.scrollIntoView({ behavior: immediate ? 'auto' : 'smooth', block: 'start' })
}

export function smoothScrollTop(immediate = true) {
  const smoother = ScrollSmoother.get()
  if (smoother) {
    smoother.scrollTo(0, !immediate)
    return
  }
  window.scrollTo({ top: 0, left: 0, behavior: immediate ? 'auto' : 'smooth' })
}
