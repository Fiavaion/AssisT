/**
 * Voice capture while reading.
 *
 * The AssisT-unique capture mode: the user, mid-reading (using the existing TTS/STT stack), says
 * a trigger phrase and the passage they are pointing at (selection, or the paragraph holding the
 * caret or focus) + page URL are snapshotted as a draft citation — no tab switching, no typing. This module is only the trigger grammar + draft snapshot; it consumes
 * the STT controller's `onResult(processedText, finalTranscript)` callback and does NOT touch the
 * STT engine. Wiring it to the live controller (and suppressing the command text from insertion)
 * is M6.
 */

/** The trigger phrases as a student says them, for telling the student what to say. */
export const SPOKEN_PHRASES = Object.freeze(['cite this', 'capture source', 'save citation']);

/**
 * Default trigger patterns. Chrome often hears "cite" as "site" or "sight", puts punctuation
 * between the words, and the student may say "the" in the second and third phrases.
 */
export const DEFAULT_TRIGGERS = Object.freeze([
  /\b(?:cite|site|sight)\W+this\b/i,
  /\bcapture\W+(?:the\W+)?source\b/i,
  /\bsave\W+(?:the\W+)?citation\b/i,
]);

/** Minimum gap between two voice captures, to swallow STT repeat-fires. */
const DEBOUNCE_MS = 1500;

/**
 * True when text contains a trigger phrase.
 * @param {string} text
 * @param {RegExp[]} [triggers]
 * @returns {boolean}
 */
export function matchesTrigger(text, triggers = DEFAULT_TRIGGERS) {
  const value = String(text || '');
  return triggers.some(re => re.test(value));
}

/**
 * Create a voice-capture handler.
 * @param {{triggers?: RegExp[], getContext?: () => (Promise<Object>|Object)}} [opts]
 *   getContext returns `{ url, title, paragraph }` for the current reading position. Without it,
 *   the page is read: the selection, else the caret's paragraph, else focused page content.
 *   Every draft carries `passageMissing: true` when no passage could be captured, so the
 *   wizard can say so rather than show an empty quote as if one had been taken.
 * @returns {{ handleResult: (processedText: string, finalTranscript?: string) => Promise<Object|null> }}
 */
export function createVoiceCapture(opts = {}) {
  const triggers = opts.triggers || DEFAULT_TRIGGERS;
  const resolveContext = typeof opts.getContext === 'function' ? opts.getContext : defaultContext;
  let lastFire = 0;

  return {
    /**
     * Consume one STT final result. Returns a draft on a trigger match, for the caller to open in
     * the wizard; otherwise returns null. Debounced so a repeated final transcript fires once.
     */
    async handleResult(processedText) {
      if (!matchesTrigger(processedText, triggers)) {
        return null;
      }
      const now = Date.now();
      if (now - lastFire < DEBOUNCE_MS) {
        return null;
      }
      lastFire = now;

      const ctx = (await resolveContext()) || {};
      const paragraph = ctx.paragraph || '';
      return {
        source: 'voice',
        url: ctx.url || '',
        title: ctx.title || '',
        paragraph,
        quotedText: paragraph,
        passageMissing: !paragraph,
        trigger: String(processedText || '').trim(),
      };
    },
  };
}

/** Elements that bound a "paragraph" when widening a caret or focus to its surrounding text. */
const BLOCK_SELECTOR =
  'p, li, blockquote, dd, dt, td, th, h1, h2, h3, h4, h5, h6, figcaption, caption, pre, ' +
  'summary, div, section, article, main, aside';

/** The field a student dictates into, which is their own writing, never the source. */
const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';

/** AssisT's own controls (capture bar, mic button, panels), whose labels are not page text. */
const OWN_UI_SELECTOR = '[id^="assist-"], [class^="assist-"], [class*=" assist-"]';

/** @param {Node|null} node @returns {Element|null} the node itself, or a text node's parent */
function elementOf(node) {
  if (!node) {
    return null;
  }
  return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
}

/** True when the element is page content the student is reading, not a field or AssisT UI. */
function isReadablePageContent(el) {
  return Boolean(
    el &&
      el !== document.body &&
      el !== document.documentElement &&
      !el.closest(EDITABLE_SELECTOR) &&
      !el.closest(OWN_UI_SELECTOR)
  );
}

/** Text content only (never markup), with runs of whitespace collapsed. */
function plainText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The longest passage a caret or focus is widened to. A page with no paragraph elements puts the
 * caret in a wrapper holding the whole article, and a quote box holding the whole article helps no
 * one. A selection is the student's own choice and is never shortened.
 */
const MAX_WIDENED_PASSAGE = 1000;

/** The text of the nearest paragraph-like block around `el`, cut at a word if it runs long. */
function paragraphAround(el) {
  const block = el.closest(BLOCK_SELECTOR);
  const scope = block && block !== document.body ? block : el;
  const text = plainText(scope.textContent);
  if (text.length <= MAX_WIDENED_PASSAGE) {
    return text;
  }
  const cut = text.slice(0, MAX_WIDENED_PASSAGE);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}

/**
 * The passage the student is pointing at: their selection, else the paragraph holding the caret,
 * else the paragraph around focused page content. Their own editable field and AssisT's controls
 * are never read. Returns '' when there is nothing to capture.
 * @returns {string}
 */
function readPassage() {
  // The student is writing, not reading. Chrome reports a caret or selection inside a textarea on
  // the field's PARENT, and its toString() is the words selected in the field, so without this the
  // "passage" became the form block around the field (their own essay included) or their own
  // selected words. An iframe is an editor too: Canvas's rich text editor lives in one.
  const active = document.activeElement;
  if (active && (active.matches(EDITABLE_SELECTOR) || active.tagName === 'IFRAME')) {
    return '';
  }
  const selection = typeof window.getSelection === 'function' ? window.getSelection() : null;
  if (selection && selection.rangeCount > 0) {
    const anchor = elementOf(selection.anchorNode);
    if (isReadablePageContent(anchor)) {
      const selected = plainText(selection.toString());
      if (selected) {
        return selected;
      }
      if (selection.isCollapsed) {
        return paragraphAround(anchor);
      }
    }
  }
  const focused = document.activeElement;
  return isReadablePageContent(focused) ? paragraphAround(focused) : '';
}

function defaultContext() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { url: '', title: '', paragraph: '' };
  }
  return {
    url: (window.location && window.location.href) || '',
    title: document.title || '',
    paragraph: readPassage(),
  };
}

export default { DEFAULT_TRIGGERS, matchesTrigger, createVoiceCapture };
