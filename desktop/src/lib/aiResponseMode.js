/**
 * AI reply delivery mode.
 *
 * - `'stream'`  , SSE chunks update the UI as they arrive (typing effect)
 * - `'complete'`, wait for the full response, then show it once
 *
 * Flip this one constant to switch behavior.
 */
export const AI_RESPONSE_MODE = /** @type {'stream' | 'complete'} */ ('stream')

/**
 * @param {object} opts
 * @param {'stream' | 'complete'} [opts.mode]
 * @param {(onChunk: (chunk: string) => void) => Promise<string | { content?: string }>} opts.stream
 * @param {() => Promise<string | { content?: string; blocked?: boolean }>} opts.complete
 * @param {(chunk: string) => void} [opts.onChunk]
 * @returns {Promise<{ content: string, blocked?: boolean, usedStream: boolean }>}
 */
export async function fetchAiReply({
  mode = AI_RESPONSE_MODE,
  stream,
  complete,
  onChunk,
}) {
  const toContent = (result) => {
    if (typeof result === 'string') return { content: result, blocked: false }
    return {
      content: (result?.content ?? '').toString(),
      blocked: Boolean(result?.blocked),
    }
  }

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
