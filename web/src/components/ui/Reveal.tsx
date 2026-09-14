import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

type RevealProps = {
  children: ReactNode
  className?: string
  delay?: number
}

/** Critically damped spring, Apple default for non-momentum UI (bounce 0, ~0.4s response). */
export default function Reveal({ children, className = '', delay = 0 }: RevealProps) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12, margin: '0px 0px -6% 0px' }}
      transition={
        reduce
          ? { duration: 0.18 }
          : { type: 'spring', bounce: 0, duration: 0.4, delay: delay / 1000 }
      }
    >
      {children}
    </motion.div>
  )
}
