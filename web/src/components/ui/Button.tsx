import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'

type ButtonProps = {
  children: ReactNode
  href?: string
  variant?: 'primary' | 'primary-light' | 'outline-dark' | 'outline-light' | 'ghost-dark' | 'ghost-light'
  className?: string
  icon?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
}

const variants = {
  primary:
    'min-h-11 rounded-[12px] bg-black px-6 py-3 text-base font-semibold tracking-[-0.01em] text-white shadow-[0_1px_0_rgb(255_255_255_/_0.12)_inset] transition-[background-color,box-shadow,transform] duration-200 hover:bg-black/85',
  'primary-light':
    'min-h-11 rounded-[12px] bg-white px-6 py-3 text-base font-semibold tracking-[-0.01em] text-black shadow-[0_1px_0_rgb(255_255_255_/_0.9)_inset,0_8px_24px_rgb(0_0_0_/_0.18)] transition-[background-color,box-shadow,transform] duration-200 hover:bg-white/92',
  'outline-dark':
    'min-h-11 rounded-[12px] border border-hairline bg-transparent px-6 py-3 text-base font-medium tracking-[-0.01em] text-ink transition-[border-color,background-color,transform] duration-200 hover:border-ink/35 hover:bg-ink/[0.03]',
  'outline-light':
    'min-h-11 rounded-[12px] border border-white/18 bg-transparent px-6 py-3 text-base font-medium tracking-[-0.01em] text-white transition-[border-color,background-color,transform] duration-200 hover:border-white/55 hover:bg-white/[0.06]',
  'ghost-dark':
    'min-h-11 rounded-[12px] px-4 py-2 text-base font-medium text-ink/70 transition-[color,transform] duration-200 hover:text-ink',
  'ghost-light':
    'min-h-11 rounded-[12px] px-4 py-2 text-base font-medium text-white/70 transition-[color,transform] duration-200 hover:text-white',
}

export default function Button({
  children,
  href,
  variant = 'primary',
  className = '',
  icon = false,
  onClick,
  type = 'button',
}: ButtonProps) {
  const classes = `pressable inline-flex items-center justify-center gap-2 ${variants[variant]} ${className}`

  const content = (
    <>
      {children}
      {icon && <ArrowUpRight className="h-4 w-4" />}
    </>
  )

  if (href) {
    const isExternal = href.startsWith('http')
    if (isExternal) {
      return (
        <a href={href} className={classes} target="_blank" rel="noreferrer">
          {content}
        </a>
      )
    }
    return (
      <Link to={href} className={classes}>
        {content}
      </Link>
    )
  }

  return (
    <button type={type} className={classes} onClick={onClick}>
      {content}
    </button>
  )
}
