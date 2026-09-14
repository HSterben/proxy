import { useReducedMotion, AnimatePresence, motion } from 'framer-motion'
import {
  ArrowUp,
  Copy,
  Grid2X2,
  MessageSquare,
  MoreHorizontal,
  Sun,
  ThumbsDown,
  ThumbsUp,
  User,
} from 'lucide-react'
import BrandMark from './BrandMark'

export type LengthMode = 'concise' | 'detailed'
export type ToneMode = 'casual' | 'professional'
export type StyleMode = 'creative' | 'precise'

type ProductPreviewProps = {
  length?: LengthMode
  tone?: ToneMode
  style?: StyleMode
  processing?: boolean
  className?: string
}

const replies: Record<`${LengthMode}-${ToneMode}-${StyleMode}`, string> = {
  'concise-professional-precise':
    'Here is a tighter client email: thank them, confirm the timeline, and ask for the two missing assets by Friday.',
  'concise-professional-creative':
    'Lead with the outcome, then one clear ask. I can draft a version that still sounds like you.',
  'concise-casual-precise':
    'Short version: thanks, timeline confirmed, need those two files by Friday.',
  'concise-casual-creative':
    'Keep it light and short, thanks, we’re on track, send the files when you can this week.',
  'detailed-professional-precise':
    'Thank you for the update. We can keep the original Friday delivery if we receive the remaining two assets by end of day Thursday. I’ll send a revised outline once those files are in.',
  'detailed-professional-creative':
    'Appreciate the note. We’re in a good place on structure. If the remaining assets arrive Thursday, I can turn around a polished draft Friday morning and leave room for your review.',
  'detailed-casual-precise':
    'Thanks for the update. If those two files land Thursday, we still hit Friday. I’ll send a revised outline as soon as I have them.',
  'detailed-casual-creative':
    'Thanks, we’re in good shape. Send the last two files when you can; I’ll reshape the draft around them and have something ready for Friday.',
}

function stateLabel(length: LengthMode, tone: ToneMode, style: StyleMode) {
  if (length === 'concise' && tone === 'casual') return 'Simplify'
  if (tone === 'professional' && style === 'precise') return 'Writing'
  if (style === 'creative') return 'Creative'
  return 'Everyday'
}

export default function ProductPreview({
  length = 'concise',
  tone = 'professional',
  style = 'precise',
  processing = false,
  className = '',
}: ProductPreviewProps) {
  const reduce = useReducedMotion()
  const replyKey = `${length}-${tone}-${style}` as const
  const reply = replies[replyKey]
  const state = stateLabel(length, tone, style)

  return (
    <div
      className={`relative flex min-h-[420px] overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0e1116] shadow-[0_28px_70px_rgb(0_0_0_/_0.5),0_1px_0_rgb(255_255_255_/_0.06)_inset] md:min-h-[480px] ${className}`}
    >
      {/* App rail */}
      <aside className="flex w-12 shrink-0 flex-col items-center border-r border-white/8 bg-[#0a0c10] py-3 md:w-14">
        <BrandMark inverted className="mb-5 h-6 w-6" />
        <div className="flex flex-1 flex-col items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-signal/20 text-signal">
            <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white/35">
            <Grid2X2 className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white/35">
            <Sun className="h-4 w-4" strokeWidth={1.75} />
          </span>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full text-white/35">
          <User className="h-4 w-4" strokeWidth={1.75} />
        </span>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-[#12151a]">
        {/* Title bar */}
        <header className="flex items-center justify-between gap-3 border-b border-white/8 px-3 py-2.5 md:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-[13px] text-white/45">State</span>
            <span className="truncate rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[13px] font-medium text-white">
              {state}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-[13px] text-red-400/90 sm:inline">Sign out</span>
            <MoreHorizontal className="h-4 w-4 text-white/40" strokeWidth={1.75} />
            <div className="hidden items-center gap-1.5 text-white/35 sm:flex" aria-hidden="true">
              <span className="h-px w-2.5 bg-current" />
              <span className="h-2.5 w-2.5 border border-current" />
              <span className="text-[11px] leading-none">×</span>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-3 py-4 md:px-5 md:py-5">
          <div className="ml-auto max-w-[85%]">
            <div className="rounded-[12px] bg-[#1a2330] px-3.5 py-2.5 text-white shadow-sm">
              <p className="text-[11px] font-medium text-white/45">{state}</p>
              <p className="mt-1 text-[14px] leading-relaxed">Rewrite this paragraph for a client email.</p>
            </div>
            <p className="mt-1.5 text-right text-[11px] text-white/35">21:01</p>
          </div>

          <div className="max-w-[92%]">
            <div className="relative min-h-[4.5rem] overflow-hidden rounded-[12px] border border-white/10 bg-[#161a20]">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={processing ? 'processing' : replyKey}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.22, ease: [0.26, 0.02, 0.23, 0.94] }}
                  className="px-3.5 py-2.5 text-[14px] leading-relaxed text-white/92"
                >
                  {processing ? (
                    <span className="inline-flex items-center gap-2 text-white/45">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" />
                      Processing
                    </span>
                  ) : (
                    reply
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="mt-2 flex items-center gap-3 text-white/35">
              <Copy className="h-3.5 w-3.5" strokeWidth={1.6} />
              <ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.6} />
              <ThumbsDown className="h-3.5 w-3.5" strokeWidth={1.6} />
              <span className="text-[11px]">21:01</span>
            </div>
          </div>

        </div>

        {/* Composer */}
        <div className="border-t border-white/8 px-3 py-3 md:px-4 md:py-3.5">
          <div className="flex items-center gap-2 rounded-[14px] border border-white/10 bg-[#161a20] px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[14px] text-white/35">Message PROXY…</span>
            <span className="hidden rounded-full border border-white/12 px-2.5 py-1 text-[12px] font-medium text-white/70 sm:inline">
              {state}
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal text-white">
              <ArrowUp className="h-4 w-4" strokeWidth={2} />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
