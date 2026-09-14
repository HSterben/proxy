/**
 * Normalize model output so react-markdown + KaTeX can render it well.
 * Models often emit LaTeX inside [ ... ] or ( \command ... ) instead of $ / $$.
 */

function looksLikeLatex(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  if (/\\[a-zA-Z]+/.test(t)) return true;
  if (/[_^{}]/.test(t) && /[=+\-*/]|\\|,/.test(t)) return true;
  if (
    /\\text|\\mathbf|\\mathrm|\\ldots|\\dots|\\rightarrow|\\Rightarrow|\\leftrightarrow|\\in\b|\\to\b/.test(
      t
    )
  ) {
    return true;
  }
  // Compact math like "S_0 = {s_0}" or "K = (S, S_0, R, L)"
  if (/^[A-Za-z0-9\\{}()[\]_^=+\-*/,.\s\\]+$/.test(t) && /[=_]/.test(t) && t.length <= 120) {
    return true;
  }
  return false;
}

/** Apply a transform only outside existing $ / $$ math spans. */
function mapOutsideMath(text, transform) {
  const parts = String(text).split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return transform(part);
    })
    .join('');
}

/**
 * @param {string} text
 * @returns {string}
 */
export function normalizeAiMarkdown(text) {
  if (!text || typeof text !== 'string') return '';

  let out = text.replace(/\r\n/g, '\n');

  // Already-standard TeX delimiters \( \) \[ \] → $ $$
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_, inner) => `$${inner.trim()}$`);
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_, inner) => `\n$$\n${inner.trim()}\n$$\n`);

  // Display blocks: a whole line that is [ latex-ish ]
  out = out.replace(/^[ \t]*\[\s*([^\n\]]+?)\s*\][ \t]*$/gm, (full, inner) => {
    if (!looksLikeLatex(inner)) return full;
    return `\n$$\n${inner.trim()}\n$$\n`;
  });

  // Inline paren math, only outside existing math
  out = mapOutsideMath(out, (segment) =>
    segment.replace(
      /\((\\[a-zA-Z]+\{[^}]*\}[^)\n]{0,80}|[^()\n]{0,40}\\[a-zA-Z]+[^)\n]{0,40})\)/g,
      (full, inner) => {
        if (!looksLikeLatex(inner)) return full;
        if (/^\s*[0-9a-zA-Z]\s*$/.test(inner)) return full;
        return `$${inner.trim()}$`;
      }
    )
  );

  // Ensure blank lines before headings / lists when models smash paragraphs together
  out = out.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2');
  out = out.replace(/([^\n])\n([-*+] |\d+\. )/g, '$1\n\n$2');

  // Definition lines: (S): ... → markdown list (outside math)
  out = mapOutsideMath(out, (segment) =>
    segment.replace(/^[ \t]*\(([A-Za-z][A-Za-z0-9_]*)\)\s*:\s+/gm, '- **($1)**: ')
  );

  // Math-labelled definitions: $...$: ... → list items (full string)
  out = out.replace(/^[ \t]*(\$[^$\n]+\$)\s*:\s+/gm, '- $1: ');

  // Collapse 3+ blank lines
  out = out.replace(/\n{3,}/g, '\n\n');

  return out.trim();
}
