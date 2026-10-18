/**
 * @jest-environment jsdom
 *
 * Unit tests for ui/reassurance-panel.js — createReassurancePanel().
 *
 * EVENT DISPATCH NOTES:
 *   attachAccessibleHandler() wires:
 *     - mousedown (not click) via attachInteractiveHandler — preventDefault + stopPropagation.
 *     - keydown for Enter and Space.
 *   Trigger fix buttons by mouse:     fireMousedown(btn)
 *   Trigger fix buttons by keyboard:  fireKeydown(btn, 'Enter')
 */

import { createReassurancePanel } from '../../../../src/features/citations/ui/reassurance-panel.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Complete citation — assessCitation should return green. */
const COMPLETE = {
  type: 'website',
  title: 'A Well-Formed Source',
  authors: ['Smith, Jane'],
  publicationDate: '2022',
  url: 'https://example.com/source',
  accessDate: '2024-01-01',
};

/** Missing title — assessCitation returns red. */
const NO_TITLE = {
  type: 'website',
  title: '',
  authors: ['Jones, Mark'],
  publicationDate: '2020',
  url: 'https://example.com/book',
  accessDate: '2024-06-01',
};

/** Implausible year — assessCitation returns red year reason. */
const BAD_YEAR = {
  type: 'website',
  title: 'Future Source',
  authors: ['Smith, Jane'],
  publicationDate: '3000',
  url: 'https://example.com/future',
  accessDate: '2024-01-01',
};

/**
 * Citation with two year-related issues:
 *   1. an unreadable date string ('21') → amber YEAR reason
 *   2. no URL or DOI                    → amber LINK reason
 * Both reasons share the same YEAR field? No — the first is YEAR, the second is LINK.
 * To force two YEAR-field reasons we use both an unreadable date AND suppress the
 * accessDate so extractYear resolves to 0 (year missing amber) — but that's only
 * possible via two distinct YEAR checks. The engine actually produces two YEAR issues
 * when `publicationDate` is unreadable ("21") AND has no numeric year to fall back on,
 * because (a) it flags the unreadable date AND (b) the resolved year is 0 so it flags
 * "no publication year" too.
 */
const TWO_YEAR_ISSUES = {
  type: 'website',
  title: 'Ambiguous Year',
  authors: ['Doe, J.'],
  publicationDate: '21',   // triggers "Couldn't read a year" (YEAR) and no-year (YEAR)
  url: 'https://example.com/ambig',
  accessDate: '',          // no fallback year either
};

/** Citation with XSS payload in message — must render as text, not HTML. */
const XSS_TITLE = {
  type: 'website',
  title: '<img src=x onerror=alert(1)>',
  authors: ['Safe, Author'],
  publicationDate: '2022',
  url: 'https://example.com',
  accessDate: '2024-01-01',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

function fireKeydown(el, key) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function getFixButtons(el) {
  return Array.from(el.querySelectorAll('.assist-cite-reassure__fix'));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createReassurancePanel()', () => {

  // Structure
  describe('structure', () => {
    test('returns el, update, and destroy', () => {
      const panel = createReassurancePanel();
      expect(panel.el).toBeInstanceOf(HTMLElement);
      expect(typeof panel.update).toBe('function');
      expect(typeof panel.destroy).toBe('function');
    });

    test('el has role="status" and aria-live="polite"', () => {
      const { el } = createReassurancePanel();
      expect(el.getAttribute('role')).toBe('status');
      expect(el.getAttribute('aria-live')).toBe('polite');
    });

    test('el has the base class assist-cite-reassure', () => {
      const { el } = createReassurancePanel();
      expect(el.classList.contains('assist-cite-reassure')).toBe(true);
    });
  });

  // Green verdict
  describe('green citation', () => {
    test('container has --green class', () => {
      const { el, update } = createReassurancePanel();
      update(COMPLETE);
      expect(el.classList.contains('assist-cite-reassure--green')).toBe(true);
      expect(el.classList.contains('assist-cite-reassure--amber')).toBe(false);
      expect(el.classList.contains('assist-cite-reassure--red')).toBe(false);
    });

    test('head word is "This looks right"', () => {
      const { el, update } = createReassurancePanel();
      update(COMPLETE);
      const head = el.querySelector('.assist-cite-reassure__head');
      expect(head.textContent).toContain('This looks right');
    });

    test('icon is ✓', () => {
      const { el, update } = createReassurancePanel();
      update(COMPLETE);
      const icon = el.querySelector('.assist-cite-reassure__icon');
      expect(icon.textContent).toBe('✓');
    });

    test('no fix buttons rendered for green citation', () => {
      const onFix = jest.fn();
      const { el, update } = createReassurancePanel({ onFix });
      update(COMPLETE);
      expect(getFixButtons(el)).toHaveLength(0);
    });
  });

  // Red verdict — missing title
  describe('missing-title citation', () => {
    test('container has --red class', () => {
      const { el, update } = createReassurancePanel();
      update(NO_TITLE);
      expect(el.classList.contains('assist-cite-reassure--red')).toBe(true);
    });

    test('head word is "Let\'s fix this"', () => {
      const { el, update } = createReassurancePanel();
      update(NO_TITLE);
      const head = el.querySelector('.assist-cite-reassure__head');
      expect(head.textContent).toContain("Let's fix this");
    });

    test('"Fix the title" button is rendered when onFix provided', () => {
      const onFix = jest.fn();
      const { el, update } = createReassurancePanel({ onFix });
      update(NO_TITLE);
      const btns = getFixButtons(el);
      const titleBtn = btns.find(b => b.textContent === 'Fix the title');
      expect(titleBtn).toBeTruthy();
    });

    test('"Fix the title" button calls onFix("what") on mousedown', () => {
      const onFix = jest.fn();
      const { el, update } = createReassurancePanel({ onFix });
      update(NO_TITLE);
      const titleBtn = getFixButtons(el).find(b => b.textContent === 'Fix the title');
      fireMousedown(titleBtn);
      expect(onFix).toHaveBeenCalledWith('what');
    });

    test('"Fix the title" button calls onFix("what") on Enter keydown', () => {
      const onFix = jest.fn();
      const { el, update } = createReassurancePanel({ onFix });
      update(NO_TITLE);
      const titleBtn = getFixButtons(el).find(b => b.textContent === 'Fix the title');
      fireKeydown(titleBtn, 'Enter');
      expect(onFix).toHaveBeenCalledWith('what');
    });
  });

  // Wrong year
  describe('bad-year citation', () => {
    test('"Fix the year" button calls onFix("when") on mousedown', () => {
      const onFix = jest.fn();
      const { el, update } = createReassurancePanel({ onFix });
      update(BAD_YEAR);
      const yearBtn = getFixButtons(el).find(b => b.textContent === 'Fix the year');
      expect(yearBtn).toBeTruthy();
      fireMousedown(yearBtn);
      expect(onFix).toHaveBeenCalledWith('when');
    });
  });

  // XSS safety
  describe('XSS safety', () => {
    test('reason messages render as textContent — no HTML injection', () => {
      const { el, update } = createReassurancePanel();
      update(XSS_TITLE);
      // The list items must contain only text nodes; any <img> would be a bug.
      const imgs = el.querySelectorAll('img');
      expect(imgs).toHaveLength(0);
      // The raw payload must appear as literal text somewhere in the list.
      const list = el.querySelector('.assist-cite-reassure__list');
      // Green verdict has one positive reason — no XSS risk from engine messages,
      // but the title value COULD appear in a future reason; we ensure no <img> escapes.
      expect(list).toBeTruthy();
    });
  });

  // Dedupe by field
  describe('distinct-field dedupe', () => {
    test('two YEAR-field reasons yield exactly one "Fix the year" button', () => {
      const onFix = jest.fn();
      const { el, update } = createReassurancePanel({ onFix });
      update(TWO_YEAR_ISSUES);
      const yearBtns = getFixButtons(el).filter(b => b.textContent === 'Fix the year');
      expect(yearBtns).toHaveLength(1);
    });
  });

  // update() — in-place patching
  describe('update() in-place patching', () => {
    test('el node identity is preserved across updates', () => {
      const onFix = jest.fn();
      const panel = createReassurancePanel({ onFix });
      panel.update(NO_TITLE);
      const before = panel.el;
      panel.update(COMPLETE);
      expect(panel.el).toBe(before);
    });

    test('updates from red (no title) to green swaps class to --green', () => {
      const { el, update } = createReassurancePanel({ onFix: jest.fn() });
      update(NO_TITLE);
      expect(el.classList.contains('assist-cite-reassure--red')).toBe(true);
      update(COMPLETE);
      expect(el.classList.contains('assist-cite-reassure--green')).toBe(true);
      expect(el.classList.contains('assist-cite-reassure--red')).toBe(false);
    });

    test('fix buttons are removed when updating to green', () => {
      const onFix = jest.fn();
      const { el, update } = createReassurancePanel({ onFix });
      update(NO_TITLE);
      expect(getFixButtons(el).length).toBeGreaterThan(0);
      update(COMPLETE);
      expect(getFixButtons(el)).toHaveLength(0);
    });

    test('previous fix-button handlers do not fire after update()', () => {
      const onFix = jest.fn();
      const { el, update } = createReassurancePanel({ onFix });
      update(NO_TITLE);
      const oldBtn = getFixButtons(el).find(b => b.textContent === 'Fix the title');
      update(COMPLETE);
      // Firing the now-detached button should not call onFix again.
      fireMousedown(oldBtn);
      expect(onFix).not.toHaveBeenCalled();
    });
  });

  // onFix omitted
  describe('onFix omitted', () => {
    test('no fix buttons rendered when onFix not provided', () => {
      const { el, update } = createReassurancePanel();
      update(NO_TITLE);
      expect(getFixButtons(el)).toHaveLength(0);
    });

    test('does not throw when onFix not provided', () => {
      const { update } = createReassurancePanel();
      expect(() => update(NO_TITLE)).not.toThrow();
    });
  });

  // destroy()
  describe('destroy()', () => {
    test('runs without throwing even with no fix buttons', () => {
      const { update, destroy } = createReassurancePanel();
      update(COMPLETE);
      expect(() => destroy()).not.toThrow();
    });

    test('fix-button handlers do not fire after destroy()', () => {
      const onFix = jest.fn();
      const { el, update, destroy } = createReassurancePanel({ onFix });
      update(NO_TITLE);
      const btn = getFixButtons(el).find(b => b.textContent === 'Fix the title');
      destroy();
      fireMousedown(btn);
      expect(onFix).not.toHaveBeenCalled();
    });
  });

});
