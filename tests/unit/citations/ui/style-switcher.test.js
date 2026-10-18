/**
 * @jest-environment jsdom
 *
 * Unit tests for ui/style-switcher.js — createStyleSwitcher().
 *
 * EVENT DISPATCH NOTES:
 *   attachAccessibleHandler() wires:
 *     - mousedown (not click) via attachInteractiveHandler — preventDefault + stopPropagation.
 *     - keydown for Enter and Space.
 *   Trigger option selection by: fireMousedown(btn)
 *   Arrow navigation fires keydown on the radiogroup container.
 *
 * SC 1.4.1  — never colour alone: diff is amber text + amber bg (CSS; structural test checks span).
 * SC 1.4.12 — preview has no fixed height or overflow clip (CSS handles it; no JS assertion needed).
 * SC 2.1.1  — keyboard operable: arrow keys navigate + select.
 * SC 4.1.3  — preview is aria-live="polite" so style changes are announced.
 */

import { createStyleSwitcher } from '../../../../src/features/citations/ui/style-switcher.js';
import { STYLES, formatReference } from '../../../../src/features/citations/citation-styles/index.js';

// ── Fixture ───────────────────────────────────────────────────────────────────

/** A realistic citation that all four formatters can render to non-identical strings. */
const CITATION = {
  id: 'fix-001',
  type: 'website',
  title: 'Accessible Learning in Higher Education',
  authors: ['Murphy, Claire'],
  publicationDate: '2021',
  url: 'https://example.edu/accessible-learning',
  accessDate: '2024-03-15',
  siteName: 'Example Education',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

function fireKeydown(el, key) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/** Return all role="radio" buttons within the switcher element. */
function getOptions(el) {
  return Array.from(el.querySelectorAll('[role="radio"]'));
}

/** Return the option button for a given styleId. */
function getOption(el, styleId) {
  return el.querySelector(`[data-style="${styleId}"]`);
}

/** Return the preview <p> element. */
function getPreview(el) {
  return el.querySelector('.assist-cite-switcher__preview');
}

/** Return all diff spans in the preview. */
function getDiffSpans(el) {
  return Array.from(el.querySelectorAll('.assist-cite-switcher__diff'));
}

// ── Structure ─────────────────────────────────────────────────────────────────

describe('createStyleSwitcher() — structure', () => {
  test('returns el, setCitation, setStyle, getStyle, destroy', () => {
    const sw = createStyleSwitcher();
    expect(sw.el).toBeInstanceOf(HTMLDivElement);
    expect(sw.el.className).toBe('assist-cite-switcher');
    expect(typeof sw.setCitation).toBe('function');
    expect(typeof sw.setStyle).toBe('function');
    expect(typeof sw.getStyle).toBe('function');
    expect(typeof sw.destroy).toBe('function');
  });

  test('renders exactly 4 role="radio" buttons in STYLES order', () => {
    const { el } = createStyleSwitcher({ citation: CITATION });
    const opts = getOptions(el);
    expect(opts).toHaveLength(4);
    opts.forEach((btn, i) => {
      expect(btn.getAttribute('data-style')).toBe(STYLES[i].id);
      expect(btn.textContent).toBe(STYLES[i].label);
    });
  });

  test('radiogroup container has role="radiogroup" and aria-label', () => {
    const { el } = createStyleSwitcher({ citation: CITATION });
    const group = el.querySelector('[role="radiogroup"]');
    expect(group).not.toBeNull();
    expect(group.getAttribute('aria-label')).toBe('Citation style');
  });

  test('initial style option has aria-checked="true" and tabindex="0"', () => {
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'apa7' });
    const apa7Btn = getOption(el, 'apa7');
    expect(apa7Btn.getAttribute('aria-checked')).toBe('true');
    expect(apa7Btn.tabIndex).toBe(0);
  });

  test('non-selected options have aria-checked="false" and tabindex="-1"', () => {
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'apa7' });
    getOptions(el).forEach(btn => {
      if (btn.getAttribute('data-style') !== 'apa7') {
        expect(btn.getAttribute('aria-checked')).toBe('false');
        expect(btn.tabIndex).toBe(-1);
      }
    });
  });

  test('preview has aria-live="polite"', () => {
    const { el } = createStyleSwitcher({ citation: CITATION });
    expect(getPreview(el).getAttribute('aria-live')).toBe('polite');
  });

  test('preview has class assist-cite-switcher__preview', () => {
    const { el } = createStyleSwitcher({ citation: CITATION });
    expect(getPreview(el)).not.toBeNull();
  });

  test('default style is harvard when not specified', () => {
    const sw = createStyleSwitcher({ citation: CITATION });
    expect(sw.getStyle()).toBe('harvard');
  });
});

// ── Option selection via pointer ──────────────────────────────────────────────

describe('createStyleSwitcher() — pointer selection', () => {
  test('clicking an option selects it: aria-checked + tabindex move', () => {
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'harvard' });
    const mla9Btn = getOption(el, 'mla9');
    fireMousedown(mla9Btn);

    expect(mla9Btn.getAttribute('aria-checked')).toBe('true');
    expect(mla9Btn.tabIndex).toBe(0);

    // Previous selection is deselected.
    const harvardBtn = getOption(el, 'harvard');
    expect(harvardBtn.getAttribute('aria-checked')).toBe('false');
    expect(harvardBtn.tabIndex).toBe(-1);
  });

  test('clicking an option fires onChange exactly once with the style id', () => {
    const onChange = jest.fn();
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'harvard', onChange });
    const apa7Btn = getOption(el, 'apa7');
    fireMousedown(apa7Btn);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('apa7');
  });

  test('clicking the already-selected option does NOT fire onChange', () => {
    const onChange = jest.fn();
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'harvard', onChange });
    const harvardBtn = getOption(el, 'harvard');
    fireMousedown(harvardBtn);

    expect(onChange).not.toHaveBeenCalled();
  });

  test('preview text updates to formatReference(citation, selectedStyle) after click', () => {
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'harvard' });
    const apa7Btn = getOption(el, 'apa7');
    fireMousedown(apa7Btn);

    const preview = getPreview(el);
    expect(preview.textContent).toBe(formatReference(CITATION, 'apa7'));
  });
});

// ── Keyboard navigation (Arrow / Home / End) ──────────────────────────────────

describe('createStyleSwitcher() — keyboard navigation', () => {
  test('ArrowRight from harvard selects apa7 and fires onChange', () => {
    const onChange = jest.fn();
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'harvard', onChange });
    const group = el.querySelector('[role="radiogroup"]');
    fireKeydown(group, 'ArrowRight');

    expect(getOption(el, 'apa7').getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledWith('apa7');
  });

  test('ArrowRight wraps from the last style (chicago17) back to the first (harvard)', () => {
    const onChange = jest.fn();
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'chicago17', onChange });
    const group = el.querySelector('[role="radiogroup"]');
    fireKeydown(group, 'ArrowRight');

    expect(getOption(el, 'harvard').getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledWith('harvard');
  });

  test('ArrowLeft from apa7 selects harvard and fires onChange', () => {
    const onChange = jest.fn();
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'apa7', onChange });
    const group = el.querySelector('[role="radiogroup"]');
    fireKeydown(group, 'ArrowLeft');

    expect(getOption(el, 'harvard').getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledWith('harvard');
  });

  test('ArrowLeft wraps from the first style (harvard) to the last (chicago17)', () => {
    const onChange = jest.fn();
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'harvard', onChange });
    const group = el.querySelector('[role="radiogroup"]');
    fireKeydown(group, 'ArrowLeft');

    expect(getOption(el, 'chicago17').getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledWith('chicago17');
  });

  test('ArrowDown behaves the same as ArrowRight', () => {
    const onChange = jest.fn();
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'harvard', onChange });
    const group = el.querySelector('[role="radiogroup"]');
    fireKeydown(group, 'ArrowDown');

    expect(getOption(el, 'apa7').getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledWith('apa7');
  });

  test('ArrowUp behaves the same as ArrowLeft', () => {
    const onChange = jest.fn();
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'apa7', onChange });
    const group = el.querySelector('[role="radiogroup"]');
    fireKeydown(group, 'ArrowUp');

    expect(getOption(el, 'harvard').getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledWith('harvard');
  });

  test('Home jumps to the first style (harvard)', () => {
    const onChange = jest.fn();
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'chicago17', onChange });
    const group = el.querySelector('[role="radiogroup"]');
    fireKeydown(group, 'Home');

    expect(getOption(el, 'harvard').getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledWith('harvard');
  });

  test('End jumps to the last style (chicago17)', () => {
    const onChange = jest.fn();
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'harvard', onChange });
    const group = el.querySelector('[role="radiogroup"]');
    fireKeydown(group, 'End');

    expect(getOption(el, 'chicago17').getAttribute('aria-checked')).toBe('true');
    expect(onChange).toHaveBeenCalledWith('chicago17');
  });

  test('ArrowRight updates preview text correctly', () => {
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'harvard' });
    const group = el.querySelector('[role="radiogroup"]');
    fireKeydown(group, 'ArrowRight'); // → apa7

    const preview = getPreview(el);
    expect(preview.textContent).toBe(formatReference(CITATION, 'apa7'));
  });
});

// ── Amber diff ────────────────────────────────────────────────────────────────

describe('createStyleSwitcher() — amber diff', () => {
  test('after switching styles, at least one .assist-cite-switcher__diff span appears', () => {
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'harvard' });
    const apa7Btn = getOption(el, 'apa7');
    fireMousedown(apa7Btn);

    // Harvard and APA 7 produce different strings for this citation, so a diff MUST appear.
    const spans = getDiffSpans(el);
    expect(spans.length).toBeGreaterThan(0);
  });

  test('preview textContent reassembles to exactly formatReference(citation, newStyle)', () => {
    const { el } = createStyleSwitcher({ citation: CITATION, style: 'harvard' });
    const mla9Btn = getOption(el, 'mla9');
    fireMousedown(mla9Btn);

    const expected = formatReference(CITATION, 'mla9');
    expect(getPreview(el).textContent).toBe(expected);
  });

  test('switching back to the same effective output (setStyle same id) yields NO diff span', () => {
    const sw = createStyleSwitcher({ citation: CITATION, style: 'harvard' });

    // setStyle to the same id — prev===next so no diff.
    sw.setStyle('harvard');
    expect(getDiffSpans(sw.el)).toHaveLength(0);
  });

  test('first render (setCitation with no prior preview) shows NO diff span', () => {
    // Create with no citation so prevPreviewText is null, then set a citation.
    const sw = createStyleSwitcher({ style: 'harvard' });
    sw.setCitation(CITATION);

    // First render — no previous text, so no diff highlight.
    expect(getDiffSpans(sw.el)).toHaveLength(0);
  });

  test('prefix + diff-span + suffix textContent reconstructs the full reference exactly', () => {
    const sw = createStyleSwitcher({ citation: CITATION, style: 'mla9' });
    // Now switch to apa7 to generate a diff.
    sw.setStyle('apa7');

    const preview = getPreview(sw.el);
    const fullText = preview.textContent;
    const expected = formatReference(CITATION, 'apa7');

    expect(fullText).toBe(expected);

    // Verify at least one diff span exists for this switch.
    expect(getDiffSpans(sw.el).length).toBeGreaterThan(0);

    // Verify the diff span text is contained within the full reference string.
    getDiffSpans(sw.el).forEach(span => {
      expect(expected).toContain(span.textContent);
    });
  });
});

// ── XSS prevention ────────────────────────────────────────────────────────────

describe('createStyleSwitcher() — XSS prevention', () => {
  test('a citation title containing HTML markup renders as plain text, not as DOM', () => {
    const xssCitation = {
      ...CITATION,
      title: '<img src=x onerror="alert(1)"> Injected Title',
    };
    const sw = createStyleSwitcher({ citation: xssCitation, style: 'harvard' });
    const preview = getPreview(sw.el);

    // No img element must exist anywhere in the preview.
    expect(preview.querySelector('img')).toBeNull();

    // The raw string must appear as text content (partially — it gets formatted).
    // At minimum, no script-injection attribute should be executable.
    // The formatted reference includes the title text content.
    const text = preview.textContent;
    // The literal angle-bracket content should appear as text (not as markup).
    // We confirm no img element leaked through.
    expect(preview.querySelector('img')).toBeNull();
    // And no onerror attribute exists anywhere in the subtree.
    const allEls = Array.from(preview.querySelectorAll('*'));
    allEls.forEach(el => {
      expect(el.getAttribute('onerror')).toBeNull();
    });
    // The text content should include the raw angle-bracket characters as text.
    expect(text).toContain('<img');
  });

  test('style label XSS: option button textContent is the raw label string, not parsed HTML', () => {
    // STYLES labels are fixed in the source, but verify the buttons use textContent.
    const { el } = createStyleSwitcher();
    const opts = getOptions(el);
    // None of the labels should cause img/script elements inside option buttons.
    opts.forEach(btn => {
      expect(btn.querySelector('img')).toBeNull();
      expect(btn.querySelector('script')).toBeNull();
    });
  });
});

// ── setCitation ───────────────────────────────────────────────────────────────

describe('createStyleSwitcher() — setCitation', () => {
  test('setCitation(null) shows the placeholder text', () => {
    const sw = createStyleSwitcher({ citation: CITATION, style: 'harvard' });
    sw.setCitation(null);
    expect(getPreview(sw.el).textContent).toBe('Select a source to preview its reference.');
  });

  test('setCitation(null) then setCitation(citation) renders the reference with no diff span', () => {
    const sw = createStyleSwitcher({ style: 'harvard' });
    sw.setCitation(null);
    sw.setCitation(CITATION);

    // The first render after a new citation has no prev, so no diff span.
    expect(getDiffSpans(sw.el)).toHaveLength(0);
    expect(getPreview(sw.el).textContent).toBe(formatReference(CITATION, 'harvard'));
  });

  test('setCitation(newCitation) then switching style produces diff from the new citation reference', () => {
    const sw = createStyleSwitcher({ citation: CITATION, style: 'harvard' });

    // Replace with a different citation — resets prev.
    const otherCitation = {
      ...CITATION,
      title: 'Another Source',
      authors: ['Brown, Alex'],
      publicationDate: '2019',
    };
    sw.setCitation(otherCitation);
    // First render with new citation — no diff.
    expect(getDiffSpans(sw.el)).toHaveLength(0);

    // Now switch style — should produce diff between harvard and apa7 of otherCitation.
    sw.setStyle('apa7');

    // Preview must equal the formatted apa7 version.
    expect(getPreview(sw.el).textContent).toBe(formatReference(otherCitation, 'apa7'));
  });
});

// ── setStyle (programmatic) ───────────────────────────────────────────────────

describe('createStyleSwitcher() — setStyle', () => {
  test('setStyle updates getStyle()', () => {
    const sw = createStyleSwitcher({ citation: CITATION, style: 'harvard' });
    sw.setStyle('chicago17');
    expect(sw.getStyle()).toBe('chicago17');
  });

  test('setStyle does NOT fire onChange', () => {
    const onChange = jest.fn();
    const sw = createStyleSwitcher({ citation: CITATION, style: 'harvard', onChange });
    sw.setStyle('mla9');
    expect(onChange).not.toHaveBeenCalled();
  });

  test('setStyle updates aria-checked and tabindex on the buttons', () => {
    const sw = createStyleSwitcher({ citation: CITATION, style: 'harvard' });
    sw.setStyle('mla9');
    expect(getOption(sw.el, 'mla9').getAttribute('aria-checked')).toBe('true');
    expect(getOption(sw.el, 'mla9').tabIndex).toBe(0);
    expect(getOption(sw.el, 'harvard').getAttribute('aria-checked')).toBe('false');
    expect(getOption(sw.el, 'harvard').tabIndex).toBe(-1);
  });

  test('setStyle to an unknown id is a no-op', () => {
    const sw = createStyleSwitcher({ citation: CITATION, style: 'harvard' });
    sw.setStyle('nonexistent');
    expect(sw.getStyle()).toBe('harvard');
  });
});

// ── destroy ───────────────────────────────────────────────────────────────────

describe('createStyleSwitcher() — destroy', () => {
  test('destroy() removes the radiogroup keydown listener: ArrowRight no longer changes selection', () => {
    const onChange = jest.fn();
    const sw = createStyleSwitcher({ citation: CITATION, style: 'harvard', onChange });
    sw.destroy();

    const group = sw.el.querySelector('[role="radiogroup"]');
    fireKeydown(group, 'ArrowRight');

    // After destroy, the handler was removed — selection must remain on harvard.
    expect(sw.getStyle()).toBe('harvard');
    expect(onChange).not.toHaveBeenCalled();
  });

  test('destroy() removes option mousedown handlers: clicking an option does not fire onChange', () => {
    const onChange = jest.fn();
    const sw = createStyleSwitcher({ citation: CITATION, style: 'harvard', onChange });
    sw.destroy();

    const apa7Btn = getOption(sw.el, 'apa7');
    fireMousedown(apa7Btn);

    expect(onChange).not.toHaveBeenCalled();
  });

  test('destroy() removes el from its parent', () => {
    const parent = document.createElement('div');
    const sw = createStyleSwitcher({ citation: CITATION });
    parent.appendChild(sw.el);
    expect(parent.contains(sw.el)).toBe(true);

    sw.destroy();
    expect(parent.contains(sw.el)).toBe(false);
  });
});

// ── Italics in the preview ────────────────────────────────────────────────────

describe('createStyleSwitcher() — the preview shows the style’s italics', () => {
  /** A book, because every style italicises its title. */
  const BOOK = {
    id: 'book-001',
    type: 'book',
    title: 'Thinking, Fast and Slow',
    authors: ['Kahneman, Daniel'],
    publisher: 'Penguin',
    publicationDate: '2011',
  };

  test('the italicised part of the reference is rendered as <em>, not as text', () => {
    const sw = createStyleSwitcher({ citation: BOOK, style: 'harvard' });
    const italics = [...getPreview(sw.el).querySelectorAll('em')].map(node => node.textContent);
    expect(italics.join(' ')).toContain('Thinking, Fast and Slow');
  });

  test('the plain reading is still exactly the formatted reference', () => {
    const sw = createStyleSwitcher({ citation: BOOK, style: 'harvard' });
    expect(getPreview(sw.el).textContent).toBe(formatReference(BOOK, 'harvard'));
  });

  test('switching style keeps the italics AND marks what changed', () => {
    const sw = createStyleSwitcher({ citation: BOOK, style: 'harvard' });
    fireMousedown(getOption(sw.el, 'apa7'));

    const preview = getPreview(sw.el);
    expect(preview.textContent).toBe(formatReference(BOOK, 'apa7'));
    expect(preview.querySelectorAll('.assist-cite-switcher__diff').length).toBeGreaterThan(0);
    // An italic run is one token, so a diff boundary can never fall inside it and drop the tag.
    expect([...preview.querySelectorAll('em')].map(n => n.textContent).join(' ')).toContain(
      'Thinking, Fast and Slow'
    );
  });

  test('a diffed fragment carries no attribute from the record', () => {
    const sw = createStyleSwitcher({
      citation: { ...BOOK, title: '<img src=x onerror="alert(1)">Scraped' },
      style: 'harvard',
    });
    sw.setStyle('mla9');

    const preview = getPreview(sw.el);
    expect(preview.querySelector('img')).toBeNull();
    expect(preview.textContent).toContain('<img src=x onerror="alert(1)">');
    for (const node of preview.querySelectorAll('*')) {
      expect([...node.attributes].every(a => a.name === 'class')).toBe(true);
    }
  });
});
