/**
 * "Check your essay" panel — UI over reference-check.js, the in-text ↔ reference-list mismatch
 * checker (the top mark-loss mechanism at university, otherwise served only by paid tools).
 *
 * Anxiety-aware by design: plain-language results in a live region, problems phrased as next
 * steps rather than accusations, and an explicit note that the essay is checked on-device and
 * never leaves the page (deterministic, offline, AI-off).
 *
 * Public API:
 *   createReferenceCheckPanel({ getCitations, getStyle }) -> { el, destroy() }
 */

import { checkReferences, describeCheckResult } from '../reference-check.js';
import { attachAccessibleHandler } from '../../../utils/event-handlers.js';
import { injectCitationStyles } from './citation-styles.js';

/**
 * @param {Object} options
 * @param {() => Array<Object>} options.getCitations - returns the CURRENT library records
 * @param {() => string} [options.getStyle] - returns the student's CURRENT citation style, whose
 *   year letters the essay is checked against
 * @returns {{ el: HTMLDivElement, destroy: Function }}
 */
export function createReferenceCheckPanel(options = {}) {
  const { getCitations = () => [], getStyle = () => undefined } = options;

  injectCitationStyles();

  const el = document.createElement('div');
  el.className = 'assist-cite-root assist-cite-refcheck';

  const heading = document.createElement('h2');
  heading.className = 'assist-cite-step__legend';
  heading.textContent = 'Check your essay against your reference list';
  el.appendChild(heading);

  const help = document.createElement('p');
  help.className = 'assist-cite-step__help';
  help.textContent =
    'Paste your essay text and AssisT will match every in-text citation against your saved ' +
    'references — the mismatches are what markers check first. Checked on this device; your ' +
    'essay never leaves the page.';
  el.appendChild(help);

  const label = document.createElement('label');
  label.className = 'assist-cite-field__label';
  label.setAttribute('for', 'assist-refcheck-text');
  label.textContent = 'Your essay text';
  el.appendChild(label);

  const textarea = document.createElement('textarea');
  textarea.id = 'assist-refcheck-text';
  textarea.className = 'assist-cite-field__control assist-cite-refcheck__text';
  textarea.rows = 8;
  textarea.setAttribute(
    'aria-label',
    'Your essay text — paste it here to check citations against your reference list'
  );
  el.appendChild(textarea);

  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'assist-cite-btn assist-cite-btn--primary';
  checkBtn.textContent = 'Check citations';
  el.appendChild(checkBtn);

  // Results land in a polite live region so the outcome is announced without stealing focus.
  const results = document.createElement('div');
  results.className = 'assist-cite-refcheck__results';
  results.setAttribute('role', 'status');
  results.setAttribute('aria-live', 'polite');
  el.appendChild(results);

  /** One result line. */
  function addLine(text, level) {
    const p = document.createElement('p');
    p.className = `assist-cite-refcheck__line assist-cite-refcheck__line--${level}`;
    p.textContent = text;
    results.appendChild(p);
  }

  function runCheck() {
    results.replaceChildren();
    const essay = textarea.value || '';
    if (!essay.trim()) {
      addLine('Paste your essay text above first, then press Check citations.', 'info');
      return;
    }

    const outcome = checkReferences(essay, getCitations(), getStyle());

    // Headline sentences from the checker (already plain-language and non-blaming).
    for (const line of describeCheckResult(outcome)) {
      addLine(line, outcome.counts.problems === 0 ? 'good' : 'attention');
    }

    // Concrete next steps for each cited-but-not-listed source, with near-miss hints.
    for (const missing of outcome.citedNotListed) {
      const who = missing.families.join(' and ');
      const cite = missing.year ? `${who} (${missing.year})` : who;
      let line = `${cite} is cited in your essay but isn’t in your reference list yet.`;
      if (missing.suggestion && missing.suggestion.type === 'year-mismatch') {
        line += ` Your library has ${missing.suggestion.family} (${missing.suggestion.year}) — is the year in your essay right?`;
      } else if (missing.suggestion && missing.suggestion.type === 'spelling') {
        line += ` Your library has “${missing.suggestion.family}” — check the spelling.`;
      }
      addLine(line, 'attention');
    }

    // References never cited — markers often check this direction too.
    if (outcome.listedNotCited.length > 0) {
      const titles = outcome.listedNotCited
        .map(c => `“${String(c.title || 'Untitled').slice(0, 60)}”`)
        .join(', ');
      addLine(
        `Not cited in the text: ${titles}. If you used them, add an in-text citation; if not, they can come out of the list.`,
        'info'
      );
    }
  }

  const checkCleanup = attachAccessibleHandler(checkBtn, 'Check citations', runCheck);

  function destroy() {
    checkCleanup();
    el.remove();
  }

  return { el, destroy };
}

export default { createReferenceCheckPanel };
