/**
 * @jest-environment jsdom
 *
 * "Check your essay" panel — the in-text ↔ reference-list mismatch checker UI.
 * Deterministic, offline, anxiety-aware: results are announced in a live region, phrased in
 * plain language, and the essay text never leaves the page.
 */

import { createReferenceCheckPanel } from '../../../../src/features/citations/ui/reference-check-panel.js';

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

const LIBRARY = [
  { id: '1', title: 'Memory and rehearsal', authors: ['Jane Smith'], publicationDate: '2023' },
  { id: '2', title: 'Sleep and learning', authors: ['Tom Doe'], publicationDate: '2021' },
];

describe('createReferenceCheckPanel', () => {
  let panel;

  beforeEach(() => {
    document.body.innerHTML = '';
    panel = createReferenceCheckPanel({ getCitations: () => LIBRARY });
    document.body.appendChild(panel.el);
  });

  afterEach(() => {
    panel.destroy();
  });

  it('renders a labelled textarea, a check button, and an on-device privacy note', () => {
    const ta = panel.el.querySelector('textarea');
    expect(ta).toBeTruthy();
    expect(ta.getAttribute('aria-label') || ta.labels?.length).toBeTruthy();
    const btn = [...panel.el.querySelectorAll('button')].find(b => /check/i.test(b.textContent));
    expect(btn).toBeTruthy();
    expect(panel.el.textContent).toMatch(/never leaves|on your device|on this device/i);
  });

  it('announces results in a live region', () => {
    const results = panel.el.querySelector('[role="status"], [aria-live]');
    expect(results).toBeTruthy();
  });

  it('reports the all-clear when every in-text citation is in the library', () => {
    panel.el.querySelector('textarea').value =
      'Rehearsal aids recall (Smith, 2023). Doe (2021) agrees.';
    fireMousedown([...panel.el.querySelectorAll('button')].find(b => /check/i.test(b.textContent)));
    expect(panel.el.textContent).toMatch(/nice work|all|every source/i);
  });

  it('flags a source cited in the essay but missing from the library', () => {
    panel.el.querySelector('textarea').value = 'As shown by (Nguyen, 2020), memory is fallible.';
    fireMousedown([...panel.el.querySelectorAll('button')].find(b => /check/i.test(b.textContent)));
    expect(panel.el.textContent).toContain('Nguyen');
  });

  it('flags library references never cited in the essay', () => {
    panel.el.querySelector('textarea').value = 'Only one source here (Smith, 2023).';
    fireMousedown([...panel.el.querySelectorAll('button')].find(b => /check/i.test(b.textContent)));
    expect(panel.el.textContent).toMatch(/never cited|not cited/i);
    expect(panel.el.textContent).toContain('Sleep and learning');
  });

  it('offers a near-miss suggestion for a year mismatch', () => {
    panel.el.querySelector('textarea').value = 'Memory research shows this (Smith, 2019).';
    fireMousedown([...panel.el.querySelectorAll('button')].find(b => /check/i.test(b.textContent)));
    expect(panel.el.textContent).toMatch(/2023/);
  });

  it('asks for text instead of erroring when the textarea is empty', () => {
    fireMousedown([...panel.el.querySelectorAll('button')].find(b => /check/i.test(b.textContent)));
    expect(panel.el.textContent).toMatch(/paste|add some text/i);
  });
});
