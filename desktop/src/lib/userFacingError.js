/**
 * Turn Convex / fetch / unknown errors into short copy for the UI.
 * Never surface request IDs, `[CONVEX M(...)]`, or stack-like server dumps.
 */
export function userFacingError(err, fallback = 'Something went wrong. Try again.') {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : fallback;

  let text = String(raw)
    .replace(/\[CONVEX[^\]]*\]/gi, ' ')
    .replace(/\[Request ID:[^\]]*\]/gi, ' ')
    .replace(/\bServer Error\b/gi, ' ')
    .replace(/\bUncaught Error:\s*/gi, ' ')
    .replace(/\bCalled by client\b/gi, ' ')
    // Keep the message; drop trailing stack frames ("at handler (file:line:col)").
    .replace(/\s+at\s+\S+\s+\([^)]*\)/g, ' ')
    .replace(/\s+at\s+\S+$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If a stack frame was the only remaining noise mid-string, take the first sentence-ish chunk.
  const frameIdx = text.search(/\bat\s+\S+\s+\(/i);
  if (frameIdx > 0) text = text.slice(0, frameIdx).trim();

  if (!text || /^[\d\s.:-]+$/.test(text) || text.length > 280) {
    return fallback;
  }

  return text;
}
