/**
 * Rich-text clipboard for citations — owns the "paste into any text box" moment.
 *
 * Students write in Google Docs, Word online, and LMS textareas; there is no word-processor plugin
 * on purpose (the clipboard IS the integration). Copy therefore carries BOTH flavours:
 *   - text/html — italics (<em>, as emitted by the style formatters' `html:true` mode) and a
 *     hanging-indent paragraph per reference, so rich editors paste marks-safe formatting;
 *   - text/plain — the exact plain string, so bare textareas keep working.
 * Rich write degrades to plain `writeText`, and total failure reports `{ok:false}` — never throws.
 *
 * SECURITY: the html inputs here are TRUSTED formatter output (plain text + <em> only, all user data
 * escaped upstream by the formatters' escapeHtml). Never pass page-derived or AI-derived HTML in.
 */

import { escapeHtml } from './citation-styles/shared.js';

/** Hanging indent used for reference-list entries (APA/MLA/Harvard convention). */
const HANGING_INDENT = 'margin:0 0 0.6em; padding-left:2em; text-indent:-2em;';

/**
 * Wrap one formatted (html-mode) reference in a hanging-indent paragraph.
 * @param {string} refHtml - trusted formatter output (`formatReference(c, {html:true})`)
 * @returns {string}
 */
export function referenceBlockHtml(refHtml) {
  return `<p style="${HANGING_INDENT}">${refHtml}</p>`;
}

/**
 * Join formatted references into one paste-ready bibliography fragment.
 * @param {string[]} refsHtml - trusted formatter outputs, already in list order
 * @returns {string}
 */
export function bibliographyDocumentHtml(refsHtml) {
  return refsHtml.map(referenceBlockHtml).join('');
}

/**
 * Escape a PLAIN string for use in the text/html flavour (in-text citations and quotes are plain
 * text from the formatters — they must be escaped before entering an HTML payload). The same
 * function the formatters escape their own html flavour with, so the two can never diverge.
 * @param {string} text
 * @returns {string}
 */
export const escapeText = escapeHtml;

/**
 * Wrap an inline snippet (in-text citation, quote + citation) — no block styling, flows into the
 * student's own sentence.
 * @param {string} html - trusted formatter output (escape plain text with escapeText first)
 * @returns {string}
 */
export function inlineHtml(html) {
  return `<span>${html}</span>`;
}

/**
 * Copy dual-flavour content to the clipboard.
 * @param {{ html: string, text: string }} payload
 * @param {{ clipboard?: Clipboard, ClipboardItemCtor?: Function, BlobCtor?: Function }} [deps]
 *   injectable for tests; defaults to the platform clipboard/ClipboardItem/Blob.
 * @returns {Promise<{ ok: boolean, rich: boolean }>} rich=false means the plain fallback was used.
 */
export async function copyRich(payload, deps = {}) {
  const {
    clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined,
    ClipboardItemCtor = typeof ClipboardItem !== 'undefined' ? ClipboardItem : undefined,
    BlobCtor = typeof Blob !== 'undefined' ? Blob : undefined,
  } = deps;

  if (clipboard && typeof clipboard.write === 'function' && ClipboardItemCtor && BlobCtor) {
    try {
      await clipboard.write([
        new ClipboardItemCtor({
          'text/html': new BlobCtor([payload.html], { type: 'text/html' }),
          'text/plain': new BlobCtor([payload.text], { type: 'text/plain' }),
        }),
      ]);
      return { ok: true, rich: true };
    } catch {
      // Fall through to the plain path (permissions, focus loss, flavour rejection).
    }
  }

  try {
    await clipboard.writeText(payload.text);
    return { ok: true, rich: false };
  } catch {
    return { ok: false, rich: false };
  }
}

export default { referenceBlockHtml, bibliographyDocumentHtml, inlineHtml, escapeText, copyRich };
