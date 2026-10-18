/**
 * Minimal, safe Markdown renderer for OCR output.
 *
 * Renders the constrained subset that layout reconstruction (B1) and cloud-vision (B3) emit —
 * headings (#–###), paragraphs, and inline bold/italic — into HTML. The security boundary is simple
 * and total: every piece of text is HTML-escaped BEFORE any tag is introduced, so untrusted OCR or AI
 * output can never inject markup. Pure and deterministic; the modal call site additionally runs the
 * result through DOMPurify as defense-in-depth.
 *
 * Intentionally not a full Markdown engine (no raw HTML, no links/images, no scripts) — a deliberately
 * small surface keeps it safe and dependency-free.
 */

/** Escape the five HTML-significant characters. */
export function escapeHtml(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Apply inline emphasis to already-escaped text. `**x**` → bold, `*x*` → italic. Safe because the
 * text is escaped first (no `<`/`>` survive) and only `<strong>`/`<em>` tags are introduced.
 */
function applyInline(escaped) {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

/** Render one block (heading or paragraph) to a single HTML element string. */
function renderBlock(block) {
  const headingMatch = /^(#{1,3})\s+(.*)$/.exec(block.trim());
  if (headingMatch) {
    const level = headingMatch[1].length;
    return `<h${level}>${applyInline(escapeHtml(headingMatch[2].trim()))}</h${level}>`;
  }
  // Paragraph: reflow internal single newlines into spaces.
  const text = block
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ');
  return `<p>${applyInline(escapeHtml(text))}</p>`;
}

/**
 * Render the Markdown subset to safe HTML.
 * @param {string} markdown
 * @returns {string} HTML (empty string for empty input)
 */
export function renderMarkdownToHtml(markdown) {
  const source = String(markdown === null || markdown === undefined ? '' : markdown).trim();
  if (!source) {
    return '';
  }
  return source
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(renderBlock)
    .join('\n');
}

/**
 * Strip Markdown syntax to plain spoken prose for text-to-speech, so the reader never voices symbols
 * like "hash hash hash" for `###`. Removes heading/list/quote markers, emphasis, inline code, and
 * link/image syntax (keeping the visible text), while preserving line and paragraph breaks so the
 * reader still pauses naturally. The visual preview keeps its formatting — only what is *spoken*
 * changes.
 *
 * @param {string} markdown
 * @returns {string} plain text suitable for speech synthesis
 */
export function stripMarkdownForSpeech(markdown) {
  const source = String(markdown === null || markdown === undefined ? '' : markdown);
  if (!source.trim()) {
    return '';
  }
  return source
    .split('\n')
    .map(rawLine => {
      let line = rawLine;
      // Horizontal rule (---, ***, ___) → drop the line entirely.
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
        return '';
      }
      line = line.replace(/^\s*#{1,6}\s+/, ''); // heading markers
      line = line.replace(/^\s*>\s?/, ''); // blockquote
      line = line.replace(/^\s*[-*+]\s+/, ''); // bullet list marker
      line = line.replace(/^\s*\d+\.\s+/, ''); // ordered list marker
      line = line.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1'); // image → alt text
      line = line.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'); // link → link text
      line = line.replace(/\*\*([^*]+)\*\*/g, '$1'); // bold
      line = line.replace(/\*([^*]+)\*/g, '$1'); // italic
      line = line.replace(/__([^_]+)__/g, '$1'); // bold (underscore)
      line = line.replace(/_([^_]+)_/g, '$1'); // italic (underscore)
      line = line.replace(/`([^`]+)`/g, '$1'); // inline code
      return line.trim();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default { renderMarkdownToHtml, escapeHtml, stripMarkdownForSpeech };
