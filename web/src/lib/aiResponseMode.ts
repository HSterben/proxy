/**
 * AI reply delivery mode.
 *
 * - `'stream'`  , SSE chunks update the UI as they arrive (typing effect)
 * - `'complete'`, wait for the full response, then show it once
 *
 * Flip this one constant to switch behavior.
 */
export type AiResponseMode = 'stream' | 'complete'

export const AI_RESPONSE_MODE: AiResponseMode = 'stream'

type StreamFn = (onChunk: (chunk: string) => void) => Promise<string | { content?: string }>
type CompleteFn = () => Promise<string | { content?: string; blocked?: boolean }>

function toContent(result: string | { content?: string; blocked?: boolean }) {
  if (typeof result === 'string') return { content: result, blocked: false }
  return {
    content: (result?.content ?? '').toString(),
    blocked: Boolean(result?.blocked),
  }
}

export async function fetchAiReply(opts: {
  mode?: AiResponseMode
  stream: StreamFn
  complete: CompleteFn
  onChunk?: (chunk: string) => void
}): Promise<{ content: string; blocked?: boolean; usedStream: boolean }> {
  const { mode = AI_RESPONSE_MODE, stream, complete, onChunk } = opts

  if (mode === 'stream') {
    try {
      const result = await stream((chunk) => {
        if (chunk) onChunk?.(chunk)
      })
      const { content, blocked } = toContent(result)
      return { content, blocked, usedStream: true }
    } catch (err) {
      console.warn('[AI] Stream failed, falling back to complete:', err)
      const { content, blocked } = toContent(await complete())
      // Caller replaces message text with `content`, do not append via onChunk
      return { content, blocked, usedStream: false }
    }
  }

  const { content, blocked } = toContent(await complete())
  return { content, blocked, usedStream: false }
}
