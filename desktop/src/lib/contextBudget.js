/**
 * Conversation context budgeting for chat requests.
 *
 * - System/preset + current user message are always reserved first
 * - Prior turns are packed newest → oldest until the history budget is full
 * - Oversized current messages are rejected (never silently truncated)
 */

export const DEFAULT_MAX_CONTEXT_TOKENS = 12_000
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096
export const MIN_MAX_OUTPUT_TOKENS = 2048
export const MAX_MAX_OUTPUT_TOKENS = 4096

/** Rough chars→tokens heuristic. Images billed as a fixed cost. */
const CHARS_PER_TOKEN = 4
const IMAGE_TOKEN_ESTIMATE = 765

export class LargeMessageError extends Error {
  constructor(estimatedTokens, maxContextTokens) {
    super(
      `This message is too large for the context window (≈${estimatedTokens.toLocaleString()} tokens; limit ${maxContextTokens.toLocaleString()}). Shorten it and try again, history was not sent and the message was not truncated.`,
    )
    this.name = 'LargeMessageError'
    this.estimatedTokens = estimatedTokens
    this.maxContextTokens = maxContextTokens
  }
}

export function estimateTextTokens(text) {
  if (!text) return 0
  return Math.ceil(String(text).length / CHARS_PER_TOKEN)
}

function contentPartsTokens(content) {
  if (typeof content === 'string') return estimateTextTokens(content)
  if (!Array.isArray(content)) return estimateTextTokens(String(content ?? ''))
  let total = 0
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    if (part.type === 'text') total += estimateTextTokens(part.text)
    else if (part.type === 'image_url') total += IMAGE_TOKEN_ESTIMATE
  }
  return total
}

export function estimateMessageTokens(message) {
  if (!message) return 0
  return 4 + contentPartsTokens(message.content)
}

export function clampOutputTokens(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_OUTPUT_TOKENS
  return Math.min(MAX_MAX_OUTPUT_TOKENS, Math.max(MIN_MAX_OUTPUT_TOKENS, Math.floor(n)))
}

export function clampMaxContextTokens(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_CONTEXT_TOKENS
  return Math.min(200_000, Math.max(2_048, Math.floor(n)))
}

/**
 * Pack prior API messages newest → oldest until `budgetTokens` is spent.
 * `history` is chronological (oldest first). Return value is also oldest → newest.
 * If the newest remaining message does not fit, stop (do not skip to older turns).
 */
export function selectHistoryNewestFirst(history, budgetTokens) {
  if (!Array.isArray(history) || history.length === 0 || budgetTokens <= 0) return []
  const picked = []
  let used = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]
    const cost = estimateMessageTokens(msg)
    if (used + cost > budgetTokens) break
    picked.unshift(msg)
    used += cost
  }
  return picked
}

function contentFingerprint(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return String(content ?? '').trim()
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      if (part.type === 'text') return String(part.text || '').trim()
      if (part.type === 'image_url') return `img:${part.image_url?.url || ''}`
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * Drop consecutive duplicate user turns, and drop a trailing history user turn
 * that matches the current message (legacy clients used to append current into
 * history before the request, which made the model see the prompt twice).
 */
export function dedupeHistoryForCurrent(historyMessages, currentMessage) {
  const history = Array.isArray(historyMessages) ? [...historyMessages] : []
  const currentFp =
    currentMessage?.role === 'user' ? contentFingerprint(currentMessage.content) : ''

  while (
    currentFp &&
    history.length > 0 &&
    history[history.length - 1]?.role === 'user' &&
    contentFingerprint(history[history.length - 1].content) === currentFp
  ) {
    history.pop()
  }

  const out = []
  for (const msg of history) {
    const prev = out[out.length - 1]
    if (
      prev &&
      prev.role === 'user' &&
      msg?.role === 'user' &&
      contentFingerprint(prev.content) === contentFingerprint(msg.content)
    ) {
      continue
    }
    out.push(msg)
  }
  return out
}

/**
 * @param {object} opts
 * @param {Array<{role: string, content: string|object[]}>} opts.historyMessages - prior turns as API messages (oldest first), excluding current
 * @param {{role: string, content: string|object[]}} opts.currentMessage
 * @param {string} [opts.systemInstruction]
 * @param {number} [opts.maxContextTokens]
 * @returns {{ messages: Array, meta: { systemTokens: number, currentTokens: number, historyTokens: number, historyKept: number, historyDropped: number, maxContextTokens: number } }}
 */
export function buildBudgetedMessages({
  historyMessages,
  currentMessage,
  systemInstruction = '',
  maxContextTokens = DEFAULT_MAX_CONTEXT_TOKENS,
}) {
  const limit = clampMaxContextTokens(maxContextTokens)
  const systemTokens = estimateTextTokens(systemInstruction)
  const currentTokens = estimateMessageTokens(currentMessage)
  const reserved = systemTokens + currentTokens

  if (reserved > limit) {
    throw new LargeMessageError(reserved, limit)
  }

  const historyBudget = limit - reserved
  const history = dedupeHistoryForCurrent(historyMessages, currentMessage)
  const packedHistory = selectHistoryNewestFirst(history, historyBudget)
  const historyTokens = packedHistory.reduce((sum, m) => sum + estimateMessageTokens(m), 0)

  return {
    messages: [...packedHistory, currentMessage],
    meta: {
      systemTokens,
      currentTokens,
      historyTokens,
      historyKept: packedHistory.length,
      historyDropped: Math.max(0, history.length - packedHistory.length),
      maxContextTokens: limit,
    },
  }
}

/**
 * Convert prior conversation turns to OpenAI-style messages.
 * Current turn is passed separately via currentTurnToApiMessage — do not put it in `history`.
 *
 * Prior images are summarized as text only. Re-sending full base64 data URLs on every
 * follow-up balloons the request (often hangs the stream with no reply).
 */
export function historyToApiMessages(history) {
  if (!Array.isArray(history)) return []
  return history.map((msg) => {
    const role = msg.sender === 'user' ? 'user' : 'assistant'
    const imageCount = Array.isArray(msg.images) ? msg.images.length : 0
    if (imageCount > 0) {
      const label =
        imageCount === 1
          ? '[User attached 1 image earlier in this chat]'
          : `[User attached ${imageCount} images earlier in this chat]`
      const text = (msg.text || '').trim()
      return { role, content: text ? `${text}\n\n${label}` : label }
    }
    return { role, content: msg.text || '' }
  })
}

export function currentTurnToApiMessage(message, files = []) {
  if (files?.length > 0) {
    return {
      role: 'user',
      content: [
        { type: 'text', text: message || '' },
        ...files.map((f) => ({
          type: 'image_url',
          image_url: { url: f.dataUrl || f },
        })),
      ],
    }
  }
  return { role: 'user', content: message || '' }
}
