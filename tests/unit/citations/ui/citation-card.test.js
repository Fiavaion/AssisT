/**
 * @jest-environment jsdom
 *
 * Unit tests for ui/citation-card.js — createCitationCard().
 *
 * EVENT DISPATCH NOTE:
 *   attachInteractiveHandler() wires mousedown (not click) and calls
 *   e.preventDefault() + e.stopPropagation(). Trigger button handlers by
 *   dispatching a mousedown MouseEvent (bubbles + cancelable).
 */

import { createCitationCard } from '../../../../src/features/citations/ui/citation-card.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A complete citation — assessCitation should return green. */
const COMPLETE = {
  id: 'abc-123',
  type: 'website',
  title: 'A Well-Formed Source',
  authors: ['Smith, Jane'],
  publicationDate: '2022',
  url: 'https://example.com/source',
  accessDate: '2024-01-01',
  siteName: 'Example Site',
};

/** A citation missing its title — assessCitation should return red. */
const NO_TITLE = {
  id: 'def-456',
  type: 'book',
  title: '',
  authors: ['Jones, Mark'],
  publicationDate: '2020',
  url: 'https://example.com/book',
  accessDate: '2024-06-01',
};

// ── Helper ────────────────────────────────────────────────────────────────────

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

// ── createCitationCard — structure ────────────────────────────────────────────

describe('createCitationCard()', () => {
  test('returns id, el, update, and destroy', () => {
    const card = createCitationCard(COMPLETE);
    expect(card.id).toBe('abc-123');
    expect(card.el).toBeInstanceOf(HTMLLIElement);
    expect(card.el.className).toBe('assist-cite-card');
    expect(typeof card.update).toBe('function');
    expect(typeof card.destroy).toBe('function');
  });

  test('id is an empty string when citation has no id', () => {
    const card = createCitationCard({ ...COMPLETE, id: undefined });
    expect(card.id).toBe('');
  });

  // ── Title ──────────────────────────────────────────────────────────────────

  test('renders the title via textContent — not as HTML', () => {
    const hostile = { ...COMPLETE, title: '<img src=x onerror=alert(1)>' };
    const card = createCitationCard(hostile);
    const h3 = card.el.querySelector('.assist-cite-card__title');
    expect(h3).not.toBeNull();
    // The raw string is the textContent, NOT parsed as markup.
    expect(h3.textContent).toBe('<img src=x onerror=alert(1)>');
    // No <img> element should exist inside the card.
    expect(card.el.querySelector('img')).toBeNull();
  });

  // ── Meta line ─────────────────────────────────────────────────────────────

  test('renders the meta line with author, year, type label, siteName', () => {
    const card = createCitationCard(COMPLETE);
    const meta = card.el.querySelector('.assist-cite-card__meta');
    expect(meta).not.toBeNull();
    // 'Smith' is the family name from 'Smith, Jane'
    expect(meta.textContent).toContain('Smith');
    expect(meta.textContent).toContain('2022');
    expect(meta.textContent).toContain('Example Site');
  });

  test('meta omits empty fields and joins the rest with ·', () => {
    const sparse = { ...COMPLETE, siteName: '', publicationDate: '' };
    const card = createCitationCard(sparse);
    const meta = card.el.querySelector('.assist-cite-card__meta');
    // Should not start or end with ' · ', and no double separators.
    expect(meta.textContent).not.toMatch(/^\s*·/);
    expect(meta.textContent).not.toMatch(/·\s*$/);
    expect(meta.textContent).not.toMatch(/·\s*·/);
  });

  // ── Formatted reference ───────────────────────────────────────────────────

  test('renders a formatted reference paragraph (non-empty for complete citation)', () => {
    const card = createCitationCard(COMPLETE, { style: 'harvard' });
    const ref = card.el.querySelector('.assist-cite-card__reference');
    expect(ref).not.toBeNull();
    expect(ref.textContent.length).toBeGreaterThan(0);
  });

  // ── Reassurance chip ──────────────────────────────────────────────────────

  test('chip has correct level class and visible word — green for a complete citation', () => {
    const card = createCitationCard(COMPLETE);
    const chip = card.el.querySelector('.assist-cite-chip');
    expect(chip).not.toBeNull();
    expect(chip.classList.contains('assist-cite-chip--green')).toBe(true);
    const word = chip.querySelector('.assist-cite-chip__word');
    expect(word.textContent).toBe('Looks right');
  });

  test('chip is red when title is missing', () => {
    const card = createCitationCard(NO_TITLE);
    const chip = card.el.querySelector('.assist-cite-chip');
    expect(chip.classList.contains('assist-cite-chip--red')).toBe(true);
    const word = chip.querySelector('.assist-cite-chip__word');
    expect(word.textContent).toBe('Needs fixing');
  });

  test('chip icon is marked aria-hidden', () => {
    const card = createCitationCard(COMPLETE);
    const icon = card.el.querySelector('.assist-cite-chip__icon');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  // ── Actions row ───────────────────────────────────────────────────────────

  test('renders no buttons when no callbacks are provided', () => {
    const card = createCitationCard(COMPLETE);
    const btns = card.el.querySelectorAll('button');
    expect(btns.length).toBe(0);
  });

  test('renders only the buttons for provided callbacks', () => {
    const onInsert = jest.fn();
    const card = createCitationCard(COMPLETE, { onInsert });
    const btns = card.el.querySelectorAll('button');
    expect(btns.length).toBe(1);
    expect(btns[0].textContent).toBe('Copy reference');
    expect(btns[0].classList.contains('assist-cite-btn--primary')).toBe(true);
  });

  test('Insert button calls onInsert with the citation on mousedown', () => {
    const onInsert = jest.fn();
    const card = createCitationCard(COMPLETE, { onInsert });
    const btn = card.el.querySelector('button');
    fireMousedown(btn);
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'abc-123' }));
  });

  test('Insert button is keyboard-activatable (Enter) — SC 2.1.1', () => {
    const onInsert = jest.fn();
    const card = createCitationCard(COMPLETE, { onInsert });
    const btn = card.el.querySelector('button');
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'abc-123' }));
  });

  test('Edit button calls onEdit with the citation on mousedown', () => {
    const onEdit = jest.fn();
    const card = createCitationCard(COMPLETE, { onEdit });
    const btn = card.el.querySelector('button');
    fireMousedown(btn);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'abc-123' }));
  });

  test('Remove button calls onRemove with the citation on mousedown', () => {
    const onRemove = jest.fn();
    const card = createCitationCard(COMPLETE, { onRemove });
    const btn = card.el.querySelector('button');
    fireMousedown(btn);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: 'abc-123' }));
  });

  test('Remove button has ghost modifier class', () => {
    const card = createCitationCard(COMPLETE, { onRemove: jest.fn() });
    const btn = card.el.querySelector('button');
    expect(btn.classList.contains('assist-cite-btn--ghost')).toBe(true);
  });

  test('renders all three buttons when all callbacks are provided', () => {
    const card = createCitationCard(COMPLETE, {
      onInsert: jest.fn(),
      onEdit: jest.fn(),
      onRemove: jest.fn(),
    });
    const btns = card.el.querySelectorAll('button');
    expect(btns.length).toBe(3);
    const labels = Array.from(btns).map(b => b.textContent);
    expect(labels).toContain('Copy reference');
    expect(labels).toContain('Edit');
    expect(labels).toContain('Remove');
  });

  // ── Copy in-text / copy quote / reading capture ───────────────────────────

  test('Copy in-text button appears when its callback is provided and fires with the citation', () => {
    const onCopyInText = jest.fn();
    const card = createCitationCard(COMPLETE, { onCopyInText });
    const btn = [...card.el.querySelectorAll('button')].find(b => b.textContent === 'Copy in-text');
    expect(btn).toBeTruthy();
    fireMousedown(btn);
    expect(onCopyInText).toHaveBeenCalledWith(expect.objectContaining({ id: 'abc-123' }));
  });

  test('Copy quote button appears ONLY when the citation carries a quote', () => {
    const onCopyQuote = jest.fn();
    const noQuote = createCitationCard(COMPLETE, { onCopyQuote });
    expect(
      [...noQuote.el.querySelectorAll('button')].some(b => /copy quote/i.test(b.textContent))
    ).toBe(false);

    const withQuote = createCitationCard({ ...COMPLETE, quote: 'Exact words.' }, { onCopyQuote });
    const btn = [...withQuote.el.querySelectorAll('button')].find(b =>
      /copy quote/i.test(b.textContent)
    );
    expect(btn).toBeTruthy();
    fireMousedown(btn);
    expect(onCopyQuote).toHaveBeenCalledWith(expect.objectContaining({ quote: 'Exact words.' }));
  });

  test('update() toggles the quote button and quote display as the quote appears/disappears', () => {
    const card = createCitationCard(COMPLETE, { onCopyQuote: jest.fn() });
    expect(card.el.querySelector('.assist-cite-card__quotewrap').hidden).toBe(true);

    card.update({ ...COMPLETE, quote: 'Exact words.', locator: '24' });
    const wrap = card.el.querySelector('.assist-cite-card__quotewrap');
    expect(wrap.hidden).toBe(false);
    expect(card.el.querySelector('.assist-cite-card__quote').textContent).toBe('Exact words.');
    expect(card.el.querySelector('.assist-cite-card__quotelabel').textContent).toContain('p. 24');
    expect(card.el.querySelector('.assist-cite-card__quotelabel').textContent).toMatch(/not yours/i);
    expect(
      [...card.el.querySelectorAll('button')].some(b => /copy quote/i.test(b.textContent))
    ).toBe(true);

    card.update({ ...COMPLETE, quote: '' });
    expect(card.el.querySelector('.assist-cite-card__quotewrap').hidden).toBe(true);
    expect(
      [...card.el.querySelectorAll('button')].some(b => /copy quote/i.test(b.textContent))
    ).toBe(false);
  });

  test('the student’s own note is shown when present and hidden when absent', () => {
    const card = createCitationCard({ ...COMPLETE, notes: 'Backs up my point on memory.' });
    const note = card.el.querySelector('.assist-cite-card__note');
    expect(note.hidden).toBe(false);
    expect(note.textContent).toContain('Backs up my point on memory.');

    card.update({ ...COMPLETE, notes: '' });
    expect(note.hidden).toBe(true);
  });

  // ── update() — same el node reference ─────────────────────────────────────

  test('update() does not replace el — same node reference before and after', () => {
    const card = createCitationCard(COMPLETE);
    const before = card.el;
    card.update({ ...COMPLETE, title: 'Updated Title' });
    expect(card.el).toBe(before);
  });

  test('update() changes the title text in place', () => {
    const card = createCitationCard(COMPLETE);
    card.update({ ...COMPLETE, title: 'Brand New Title' });
    const h3 = card.el.querySelector('.assist-cite-card__title');
    expect(h3.textContent).toBe('Brand New Title');
  });

  test('update() re-formats the reference when style changes', () => {
    const card = createCitationCard(COMPLETE, { style: 'harvard' });
    const harvardText = card.el.querySelector('.assist-cite-card__reference').textContent;
    card.update(COMPLETE, { style: 'apa7' });
    const apa7Text = card.el.querySelector('.assist-cite-card__reference').textContent;
    // Different styles produce different output for the same citation.
    expect(apa7Text).not.toBe(harvardText);
  });

  test('update() swaps the chip level when citation completeness changes', () => {
    const card = createCitationCard(COMPLETE);
    const chip = card.el.querySelector('.assist-cite-chip');
    expect(chip.classList.contains('assist-cite-chip--green')).toBe(true);

    card.update({ ...COMPLETE, title: '' });
    expect(chip.classList.contains('assist-cite-chip--green')).toBe(false);
    expect(chip.classList.contains('assist-cite-chip--red')).toBe(true);
    expect(chip.querySelector('.assist-cite-chip__word').textContent).toBe('Needs fixing');
  });

  test('update() adds a button when a callback is provided for the first time', () => {
    const card = createCitationCard(COMPLETE);
    expect(card.el.querySelectorAll('button').length).toBe(0);
    card.update(COMPLETE, { onInsert: jest.fn() });
    expect(card.el.querySelectorAll('button').length).toBe(1);
  });

  test('update() removes a button when its callback is dropped', () => {
    const onEdit = jest.fn();
    const card = createCitationCard(COMPLETE, { onEdit });
    expect(card.el.querySelectorAll('button').length).toBe(1);
    card.update(COMPLETE, { onEdit: undefined });
    expect(card.el.querySelectorAll('button').length).toBe(0);
  });

  test('update() rewires the button when callback reference changes', () => {
    const first = jest.fn();
    const second = jest.fn();
    const card = createCitationCard(COMPLETE, { onEdit: first });
    const btn = card.el.querySelector('button');

    card.update(COMPLETE, { onEdit: second });

    fireMousedown(btn);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  // ── destroy() ─────────────────────────────────────────────────────────────

  test('destroy() removes el from its parent', () => {
    const card = createCitationCard(COMPLETE, { onInsert: jest.fn() });
    const parent = document.createElement('ul');
    parent.appendChild(card.el);
    document.body.appendChild(parent);

    expect(parent.contains(card.el)).toBe(true);
    card.destroy();
    expect(parent.contains(card.el)).toBe(false);
  });

  test('destroy() does not throw when el has no parent', () => {
    const card = createCitationCard(COMPLETE, { onRemove: jest.fn() });
    expect(() => card.destroy()).not.toThrow();
  });

  test('mousedown on a destroyed button does not throw', () => {
    const onInsert = jest.fn();
    const card = createCitationCard(COMPLETE, { onInsert });
    const btn = card.el.querySelector('button');
    card.destroy();
    // The button no longer has handlers registered; firing mousedown is safe.
    expect(() => fireMousedown(btn)).not.toThrow();
    expect(onInsert).not.toHaveBeenCalled();
  });

  // ── Claim Sentinel badge (DOI-bearing citations only) ──────────────────────

  /** A DOI-bearing citation — the sentinel badge applies only to these (CrossRef needs a DOI). */
  const WITH_DOI = { ...COMPLETE, doi: '10.1000/xyz123' };

  test('no sentinel badge when sentinel option is not provided (AI off)', () => {
    const card = createCitationCard(WITH_DOI);
    expect(card.el.querySelector('.assist-cite-sentinel')).toBeNull();
  });

  test('no sentinel badge for a DOI-less citation even when a sentinel is provided', () => {
    const sentinel = { verify: jest.fn().mockReturnValue(new Promise(() => {})) };
    const card = createCitationCard(COMPLETE, { sentinel });
    expect(card.el.querySelector('.assist-cite-sentinel')).toBeNull();
    expect(sentinel.verify).not.toHaveBeenCalled();
  });

  test('sentinel badge is mounted in badgesEl for a DOI citation when a sentinel is provided', () => {
    const sentinel = { verify: jest.fn().mockReturnValue(new Promise(() => {})) };
    const card = createCitationCard(WITH_DOI, { sentinel });
    expect(card.el.querySelector('.assist-cite-sentinel')).not.toBeNull();
  });

  test('badge starts as checking immediately after create (before verify resolves)', () => {
    const sentinel = { verify: jest.fn().mockReturnValue(new Promise(() => {})) };
    const card = createCitationCard(WITH_DOI, { sentinel });
    const badge = card.el.querySelector('.assist-cite-sentinel');
    const word = badge.querySelector('.assist-cite-sentinel__word');
    expect(word.textContent).toBe('Checking…');
  });

  test('badge moves to supported when verifier returns verified', async () => {
    const sentinel = { verify: jest.fn().mockResolvedValue({ status: 'verified', details: {} }) };
    const card = createCitationCard(WITH_DOI, { sentinel });
    await new Promise(r => setTimeout(r, 0));
    const word = card.el.querySelector('.assist-cite-sentinel__word');
    expect(word.textContent).toBe('Source supports this');
  });

  test('badge moves to unsupported when verifier returns flagged', async () => {
    const sentinel = { verify: jest.fn().mockResolvedValue({ status: 'flagged', details: {} }) };
    const card = createCitationCard(WITH_DOI, { sentinel });
    await new Promise(r => setTimeout(r, 0));
    const word = card.el.querySelector('.assist-cite-sentinel__word');
    expect(word.textContent).toBe('Source may not support this');
  });

  test('badge reverts to unchecked when verifier returns unverifiable', async () => {
    const sentinel = {
      verify: jest.fn().mockResolvedValue({ status: 'unverifiable', details: {} }),
    };
    const card = createCitationCard(WITH_DOI, { sentinel });
    await new Promise(r => setTimeout(r, 0));
    const word = card.el.querySelector('.assist-cite-sentinel__word');
    expect(word.textContent).toBe('Not checked');
  });

  test('sentinel.verify is called with the normalised citation on create', () => {
    const sentinel = { verify: jest.fn().mockReturnValue(new Promise(() => {})) };
    createCitationCard(WITH_DOI, { sentinel });
    expect(sentinel.verify).toHaveBeenCalledTimes(1);
    expect(sentinel.verify).toHaveBeenCalledWith(expect.objectContaining({ id: 'abc-123' }));
  });

  test('update() re-triggers sentinel verification', async () => {
    const sentinel = { verify: jest.fn().mockResolvedValue({ status: 'verified', details: {} }) };
    const card = createCitationCard(WITH_DOI, { sentinel });
    await new Promise(r => setTimeout(r, 0));
    card.update({ ...WITH_DOI, title: 'Updated Title' }, { sentinel });
    expect(sentinel.verify).toHaveBeenCalledTimes(2);
  });

  test('update() adding a DOI mounts the badge; removing the DOI removes it', async () => {
    const sentinel = { verify: jest.fn().mockResolvedValue({ status: 'verified', details: {} }) };
    const card = createCitationCard(COMPLETE, { sentinel });
    expect(card.el.querySelector('.assist-cite-sentinel')).toBeNull();

    card.update(WITH_DOI, { sentinel });
    expect(card.el.querySelector('.assist-cite-sentinel')).not.toBeNull();

    card.update(COMPLETE, { sentinel });
    expect(card.el.querySelector('.assist-cite-sentinel')).toBeNull();
  });
});

// ── AI analyser (on-demand educational source assessment) ───────────────────────

describe('createCitationCard() — AI analyser', () => {
  const flush = () => new Promise(r => setTimeout(r, 0));

  /** A fake analyser matching the injected contract: { analyse(citation) -> Promise<result> }. */
  function fakeAnalyser(result) {
    return { analyse: jest.fn(() => Promise.resolve(result)) };
  }

  /** Find the "Analyse with AI" button (label changes after a run, so match the stem). */
  function analyseButton(el) {
    return [...el.querySelectorAll('button')].find(b => /Analyse/.test(b.textContent));
  }

  test('no "Analyse with AI" button when no analyser is injected (AI off, no-stub)', () => {
    const card = createCitationCard(COMPLETE);
    expect(analyseButton(card.el)).toBeUndefined();
    expect(card.el.querySelector('.assist-cite-card__analysis')).toBeNull();
  });

  test('renders an "Analyse with AI" button when an analyser is injected', () => {
    const card = createCitationCard(COMPLETE, {
      analyser: fakeAnalyser({ available: true, signal: 'high', summary: 's', considerations: [] }),
    });
    expect(analyseButton(card.el).textContent).toContain('Analyse with AI');
  });

  test('activating analyse calls analyser.analyse with the citation and renders signal + summary + considerations', async () => {
    const analyser = fakeAnalyser({
      available: true,
      signal: 'medium',
      summary: 'A balanced source for an undergraduate essay.',
      considerations: ['Peer-reviewed journal', 'Older than ten years'],
    });
    const card = createCitationCard(COMPLETE, { analyser });

    fireMousedown(analyseButton(card.el));
    expect(analyser.analyse).toHaveBeenCalledTimes(1);
    expect(analyser.analyse.mock.calls[0][0].id).toBe('abc-123');

    await flush();

    const panel = card.el.querySelector('.assist-cite-card__analysis');
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('.assist-cite-chip')).not.toBeNull();
    expect(panel.textContent).toContain('A balanced source for an undergraduate essay.');
    expect(panel.textContent).toContain('Peer-reviewed journal');
    expect(panel.textContent).toContain('Older than ten years');
  });

  test('analysis text is rendered via textContent — model output is never parsed as HTML', async () => {
    const analyser = fakeAnalyser({
      available: true,
      signal: 'low',
      summary: '<b>bold</b>',
      considerations: ['<img src=x onerror=alert(1)>'],
    });
    const card = createCitationCard(COMPLETE, { analyser });

    fireMousedown(analyseButton(card.el));
    await flush();

    const panel = card.el.querySelector('.assist-cite-card__analysis');
    expect(panel.querySelector('img')).toBeNull();
    expect(panel.querySelector('b')).toBeNull();
    expect(panel.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  test('shows an unavailable message when analyse resolves available:false', async () => {
    const analyser = fakeAnalyser({ available: false, reason: 'No AI mode configured' });
    const card = createCitationCard(COMPLETE, { analyser });

    fireMousedown(analyseButton(card.el));
    await flush();

    const panel = card.el.querySelector('.assist-cite-card__analysis');
    expect(panel.hidden).toBe(false);
    expect(panel.textContent.toLowerCase()).toContain('available');
  });

  test('shows a friendly error and re-enables the button when analyse rejects', async () => {
    const analyser = { analyse: jest.fn(() => Promise.reject(new Error('network'))) };
    const card = createCitationCard(COMPLETE, { analyser });
    const btn = analyseButton(card.el);

    fireMousedown(btn);
    await flush();

    const panel = card.el.querySelector('.assist-cite-card__analysis');
    expect(panel.textContent.toLowerCase()).toMatch(/again|could not|sorry/);
    expect(btn.disabled).toBe(false);
  });

  test('update() clears a prior analysis (stale for the new metadata)', async () => {
    const analyser = fakeAnalyser({
      available: true,
      signal: 'high',
      summary: 'Old analysis text',
      considerations: [],
    });
    const card = createCitationCard(COMPLETE, { analyser });

    fireMousedown(analyseButton(card.el));
    await flush();
    const panel = card.el.querySelector('.assist-cite-card__analysis');
    expect(panel.textContent).toContain('Old analysis text');

    card.update({ ...COMPLETE, title: 'Changed Title' }, { analyser });
    expect(panel.hidden).toBe(true);
    expect(panel.textContent).not.toContain('Old analysis text');
  });

  test('update() KEEPS the analysis when the metadata is unchanged (e.g. a style/filter re-render)', async () => {
    const analyser = fakeAnalyser({
      available: true,
      signal: 'high',
      summary: 'Stable analysis text',
      considerations: [],
    });
    const card = createCitationCard(COMPLETE, { analyser, style: 'harvard' });

    fireMousedown(analyseButton(card.el));
    await flush();
    const panel = card.el.querySelector('.assist-cite-card__analysis');
    expect(panel.textContent).toContain('Stable analysis text');

    // Same citation, only the style changed (what the list does on a store re-emit).
    card.update({ ...COMPLETE }, { analyser, style: 'apa7' });

    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('Stable analysis text');
  });

  test('destroy() removes the analyse button handler', () => {
    const analyser = fakeAnalyser({ available: true, signal: 'high', summary: 's', considerations: [] });
    const card = createCitationCard(COMPLETE, { analyser });
    const btn = analyseButton(card.el);

    card.destroy();
    fireMousedown(btn);
    expect(analyser.analyse).not.toHaveBeenCalled();
  });
});

// ── Filing a saved citation into a collection ─────────────────────────────────

describe('the collection picker on a card', () => {
  const PROJECTS = [
    { id: 1, name: 'Essay 1' },
    { id: 2, name: 'Dissertation' },
  ];

  function pickerOf(card) {
    return card.el.querySelector('.assist-cite-card__collection-select');
  }

  test('is absent when the card was given no way to file (nothing to offer)', () => {
    const card = createCitationCard(COMPLETE, { projects: PROJECTS });
    expect(pickerOf(card)).toBeNull();
  });

  test('lists every collection plus an explicit "no collection" choice', () => {
    const card = createCitationCard(COMPLETE, {
      projects: PROJECTS,
      onAssignProject: jest.fn(),
    });
    expect([...pickerOf(card).options].map(o => o.textContent)).toEqual([
      'No collection',
      'Essay 1',
      'Dissertation',
    ]);
  });

  test('shows the collection the citation is already filed in', () => {
    const card = createCitationCard(
      { ...COMPLETE, projectId: '2' },
      { projects: PROJECTS, onAssignProject: jest.fn() }
    );
    expect(pickerOf(card).value).toBe('2');
  });

  test('files the citation on change, reporting the citation and the chosen collection', () => {
    const onAssignProject = jest.fn();
    const card = createCitationCard(COMPLETE, { projects: PROJECTS, onAssignProject });
    const picker = pickerOf(card);
    picker.value = '1';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onAssignProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'abc-123' }), '1');
  });

  test('choosing "no collection" reports an empty choice, so the caller can unfile it', () => {
    const onAssignProject = jest.fn();
    const card = createCitationCard(
      { ...COMPLETE, projectId: '1' },
      { projects: PROJECTS, onAssignProject }
    );
    const picker = pickerOf(card);
    picker.value = '';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onAssignProject).toHaveBeenCalledWith(expect.anything(), '');
  });

  test('names itself after its own citation, so a list of pickers is distinguishable', () => {
    const card = createCitationCard(COMPLETE, { projects: PROJECTS, onAssignProject: jest.fn() });
    const picker = pickerOf(card);
    // SC 2.5.3: the visible label text is contained in the accessible name.
    expect(picker.getAttribute('aria-label')).toContain('Collection');
    expect(picker.getAttribute('aria-label')).toContain('A Well-Formed Source');
    const label = card.el.querySelector('.assist-cite-card__collection-label');
    expect(label.getAttribute('for')).toBe(picker.id);
    expect(label.textContent).toBe('Collection');
  });

  test('update() keeps the picker in step with a new collection list and a moved citation', () => {
    const card = createCitationCard(COMPLETE, { projects: PROJECTS, onAssignProject: jest.fn() });
    card.update(
      { ...COMPLETE, projectId: '3' },
      { projects: [...PROJECTS, { id: 3, name: 'Placement' }] }
    );
    const picker = pickerOf(card);
    expect([...picker.options].map(o => o.textContent)).toContain('Placement');
    expect(picker.value).toBe('3');
  });
});


// ── Selection checkbox (multi-select) ─────────────────────────────────────────

describe('createCitationCard() — selection checkbox', () => {
  const selectBoxOf = card => card.el.querySelector('input.assist-cite-card__select');

  test('draws no checkbox when no onToggleSelect is provided', () => {
    const card = createCitationCard(COMPLETE);
    expect(selectBoxOf(card)).toBeNull();
  });

  test('draws a checkbox named after its own citation when onToggleSelect is provided', () => {
    const card = createCitationCard(COMPLETE, { onToggleSelect: jest.fn() });
    const box = selectBoxOf(card);
    expect(box).not.toBeNull();
    expect(box.type).toBe('checkbox');
    expect(box.getAttribute('aria-label')).toBe('Select A Well-Formed Source');
  });

  test('the checkbox names an untitled citation without an empty label', () => {
    const card = createCitationCard(NO_TITLE, { onToggleSelect: jest.fn() });
    expect(selectBoxOf(card).getAttribute('aria-label')).toBe('Select this citation');
  });

  test('a change event reports the citation and the new checked state', () => {
    const onToggleSelect = jest.fn();
    const card = createCitationCard(COMPLETE, { onToggleSelect });
    const box = selectBoxOf(card);

    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onToggleSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'abc-123' }),
      true
    );

    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onToggleSelect).toHaveBeenLastCalledWith(expect.anything(), false);
  });

  test('setSelected() drives the checkbox without firing the callback', () => {
    const onToggleSelect = jest.fn();
    const card = createCitationCard(COMPLETE, { onToggleSelect });

    card.setSelected(true);
    expect(selectBoxOf(card).checked).toBe(true);
    card.setSelected(false);
    expect(selectBoxOf(card).checked).toBe(false);
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  test('setSelected() is safe on a card that has no checkbox', () => {
    const card = createCitationCard(COMPLETE);
    expect(() => card.setSelected(true)).not.toThrow();
  });

  test('update() renames the checkbox with the citation and can remove it', () => {
    const card = createCitationCard(COMPLETE, { onToggleSelect: jest.fn() });

    card.update({ ...COMPLETE, title: 'A Renamed Source' });
    expect(selectBoxOf(card).getAttribute('aria-label')).toBe('Select A Renamed Source');

    card.update(COMPLETE, { onToggleSelect: undefined });
    expect(selectBoxOf(card)).toBeNull();
  });

  test('destroy() removes the change listener', () => {
    const onToggleSelect = jest.fn();
    const card = createCitationCard(COMPLETE, { onToggleSelect });
    const box = selectBoxOf(card);

    card.destroy();
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onToggleSelect).not.toHaveBeenCalled();
  });
});

describe('an organisation author on the card', () => {
  test('the meta line names the organisation whole', () => {
    const card = createCitationCard({
      ...COMPLETE,
      authors: ['World Health Organization'],
      extra: { organisationAuthors: ['World Health Organization'] },
    });
    const meta = card.el.querySelector('.assist-cite-card__meta');
    expect(meta.textContent.startsWith('World Health Organization · ')).toBe(true);
  });
});
