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

const CHARS_PER_TOKEN = 4
const IMAGE_TOKEN_ESTIMATE = 765

export class LargeMessageError extends Error {
  estimatedTokens: number
  maxContextTokens: number

  constructor(estimatedTokens: number, maxContextTokens: number) {
    super(
      `This message is too large for the context window (≈${estimatedTokens.toLocaleString()} tokens; limit ${maxContextTokens.toLocaleString()}). Shorten it and try again, history was not sent and the message was not truncated.`,
    )
    this.name = 'LargeMessageError'
    this.estimatedTokens = estimatedTokens
    this.maxContextTokens = maxContextTokens
  }
}

export type ApiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type ApiMessage = {
  role: string
  content: string | ApiContentPart[]
}

export function estimateTextTokens(text: string | undefined | null): number {
  if (!text) return 0
  return Math.ceil(String(text).length / CHARS_PER_TOKEN)
}

function contentPartsTokens(content: ApiMessage['content']): number {
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

export function estimateMessageTokens(message: ApiMessage | null | undefined): number {
  if (!message) return 0
  return 4 + contentPartsTokens(message.content)
}

export function clampOutputTokens(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_OUTPUT_TOKENS
  return Math.min(MAX_MAX_OUTPUT_TOKENS, Math.max(MIN_MAX_OUTPUT_TOKENS, Math.floor(n)))
}

export function clampMaxContextTokens(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_CONTEXT_TOKENS
  return Math.min(200_000, Math.max(2_048, Math.floor(n)))
}

export function selectHistoryNewestFirst(
  history: ApiMessage[],
  budgetTokens: number,
): ApiMessage[] {
  if (!Array.isArray(history) || history.length === 0 || budgetTokens <= 0) return []
  const picked: ApiMessage[] = []
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

export function buildBudgetedMessages(opts: {
  historyMessages: ApiMessage[]
  currentMessage: ApiMessage
  systemInstruction?: string
  maxContextTokens?: number
}): {
  messages: ApiMessage[]
  meta: {
    systemTokens: number
    currentTokens: number
    historyTokens: number
    historyKept: number
    historyDropped: number
    maxContextTokens: number
  }
} {
  const {
    historyMessages,
    currentMessage,
    systemInstruction = '',
    maxContextTokens = DEFAULT_MAX_CONTEXT_TOKENS,
  } = opts

  const limit = clampMaxContextTokens(maxContextTokens)
  const systemTokens = estimateTextTokens(systemInstruction)
  const currentTokens = estimateMessageTokens(currentMessage)
  const reserved = systemTokens + currentTokens

  if (reserved > limit) {
    throw new LargeMessageError(reserved, limit)
  }

  const historyBudget = limit - reserved
  const history = Array.isArray(historyMessages) ? historyMessages : []
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

export function historyToApiMessages(
  history: { text?: string; sender?: string; images?: string[] }[],
): ApiMessage[] {
  if (!Array.isArray(history)) return []
  return history.map((msg) => {
    const role = msg.sender === 'user' ? 'user' : 'assistant'
    if (msg.images?.length) {
      const content: ApiContentPart[] = [
        { type: 'text', text: msg.text || '' },
        ...msg.images.map((img) => ({ type: 'image_url' as const, image_url: { url: img } })),
      ]
      return { role, content }
    }
    return { role, content: msg.text || '' }
  })
}

export function currentTurnToApiMessage(
  message: string,
  files: { dataUrl: string }[] = [],
): ApiMessage {
  if (files?.length > 0) {
    return {
      role: 'user',
      content: [
        { type: 'text', text: message || '' },
        ...files.map((f) => ({
          type: 'image_url' as const,
          image_url: { url: f.dataUrl },
        })),
      ],
    }
  }
  return { role: 'user', content: message || '' }
}
