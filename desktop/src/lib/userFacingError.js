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
    .replace(/\s+/g, ' ')
    .trim();

  if (
    !text ||
    /^[\d\s.:-]+$/.test(text) ||
    /at\s+\S+\s+\(/i.test(text) ||
    text.length > 280
  ) {
    return fallback;
  }

  return text;
}
