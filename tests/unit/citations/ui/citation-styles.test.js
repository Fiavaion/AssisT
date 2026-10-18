/**
 * @jest-environment jsdom
 *
 * Unit tests for ui/citation-styles.js — the shared injected stylesheet for the citation UI.
 */

import {
  CITATION_CSS,
  injectCitationStyles,
} from '../../../../src/features/citations/ui/citation-styles.js';

const STYLE_ID = 'assist-citation-ui-styles';

afterEach(() => {
  document.querySelectorAll(`#${STYLE_ID}`).forEach(el => el.remove());
});

describe('citation-styles', () => {
  test('CITATION_CSS carries the accessibility-critical blocks', () => {
    // Reduced motion + forced colours are mandatory for this UI.
    expect(CITATION_CSS).toContain('prefers-reduced-motion');
    expect(CITATION_CSS).toContain('forced-colors');
    // Text-spacing safety: the reference/preview text must not be clipped.
    expect(CITATION_CSS).toContain('overflow-wrap: anywhere');
  });

  test('injectCitationStyles adds exactly one <style> and is idempotent', () => {
    injectCitationStyles();
    injectCitationStyles();
    injectCitationStyles();
    const styles = document.querySelectorAll(`#${STYLE_ID}`);
    expect(styles).toHaveLength(1);
    expect(styles[0].tagName).toBe('STYLE');
    expect(styles[0].textContent).toContain('.assist-cite-card');
    // z-index tokens are surfaced as CSS custom properties.
    expect(styles[0].textContent).toContain('--ac-z-controls');
  });

  test('injectCitationStyles no-ops without a document', () => {
    expect(() => injectCitationStyles(null)).not.toThrow();
  });
});
