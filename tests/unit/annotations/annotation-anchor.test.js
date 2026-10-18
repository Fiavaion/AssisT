/**
 * Anchoring gate: an annotation must come back on the text it was made on, or not come back
 * at all. Highlighting the wrong sentence is a worse failure than failing to highlight.
 *
 * The old anchor was an index-based XPath (`div[3]/p[2]`) plus character offsets. Anything
 * inserted above or before the annotated text — an ad slot, a consent banner, a lazy-loaded
 * section — shifts those indices, and the annotation lands somewhere else. These tests pin
 * the W3C Web Annotation selector strategy that replaces it.
 */

import {
  CONTEXT_LENGTH,
  describeRange,
  resolveAnchor,
} from '../../../src/features/annotations/annotation-anchor.js';
import { wrapRangeInHighlights } from '../../../src/features/annotations/annotation-range.js';

/** Build a range over `text` inside `el`'s first text node. */
function rangeOver(el, text) {
  const node = el.firstChild;
  const at = node.data.indexOf(text);
  if (at === -1) {
    throw new Error(`"${text}" not found in "${node.data}"`);
  }
  const range = document.createRange();
  range.setStart(node, at);
  range.setEnd(node, at + text.length);
  return range;
}

/** What the resolved range actually covers, read back through the same normalisation. */
function resolvedText(position) {
  const outcome = resolveAnchor(position);
  return outcome ? describeRange(outcome.range).quote.exact : null;
}

describe('describeRange — what gets stored', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="c"><p id="p1">The tax treatment of exchange-traded funds is unusual.</p></div>';
  });

  test('stores the quote, its surrounding context, and a document text position', () => {
    const position = describeRange(rangeOver(document.getElementById('p1'), 'exchange-traded'));

    expect(position.quote.exact).toBe('exchange-traded');
    expect(position.quote.suffix.startsWith(' funds is unusual.')).toBe(true);
    expect(position.quote.prefix.endsWith('The tax treatment of ')).toBe(true);
    expect(position.textPosition.end - position.textPosition.start).toBe(
      'exchange-traded'.length
    );
  });

  test('keeps the legacy XPath fields so an older build could still read the record', () => {
    const position = describeRange(rangeOver(document.getElementById('p1'), 'unusual'));

    expect(position.containerXPath).toBe('//*[@id="p1"]');
    expect(position.endOffset - position.startOffset).toBe('unusual'.length);
  });

  test('context is capped at the conventional length', () => {
    document.body.innerHTML = `<p id="p1">${'a'.repeat(200)}TARGET${'b'.repeat(200)}</p>`;
    const position = describeRange(rangeOver(document.getElementById('p1'), 'TARGET'));

    expect(position.quote.prefix.length).toBe(CONTEXT_LENGTH);
    expect(position.quote.suffix.length).toBe(CONTEXT_LENGTH);
  });

  test('refuses a collapsed or whitespace-only selection rather than storing a bad anchor', () => {
    const node = document.getElementById('p1').firstChild;
    const collapsed = document.createRange();
    collapsed.setStart(node, 4);
    collapsed.setEnd(node, 4);

    expect(describeRange(collapsed)).toBeNull();
  });
});

describe('describeRange — a boundary that sits on an ELEMENT, not a text node', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="c"><p>Alpha.</p><p id="p2">Beta.</p></div>';
  });

  test('resolves the child index to a real character offset instead of yielding 0', () => {
    const container = document.getElementById('c');
    const range = document.createRange();
    // Child index 1 = "start at the second paragraph", NOT "character 0 of the container".
    range.setStart(container, 1);
    range.setEnd(document.getElementById('p2').firstChild, 4);

    const position = describeRange(range);

    // "Alpha." is 6 characters, so the second paragraph starts at legacy offset 6.
    expect(position.startOffset).toBe(6);
    expect(position.endOffset).toBe(10);
    expect(position.quote.exact).toBe('Beta');
  });

  test('an element end boundary lands after the last character, not at 0', () => {
    const container = document.getElementById('c');
    const range = document.createRange();
    range.setStart(document.getElementById('p2').firstChild, 0);
    range.setEnd(container, 2);

    expect(describeRange(range).quote.exact).toBe('Beta.');
  });
});

describe('resolveAnchor — surviving a DOM that moved', () => {
  const ARTICLE =
    '<div id="wrap"><div class="body"><p>Revenue confirmed the change in April.</p>' +
    '<p>The deemed disposal rule no longer applies to these funds.</p></div></div>';

  beforeEach(() => {
    document.body.innerHTML = ARTICLE;
  });

  /** Annotate the sentence the reader cares about. */
  function anchorTheSentence() {
    const target = document.querySelectorAll('#wrap p')[1];
    return describeRange(rangeOver(target, 'deemed disposal rule'));
  }

  test('restores after content is inserted BEFORE the annotated text', () => {
    const position = anchorTheSentence();

    // An ad slot and a consent banner arrive after load, above the article.
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<aside class="ad">Sponsored: buy a thing today.</aside>' +
        '<div class="consent"><p>We use cookies to improve your experience.</p></div>'
    );

    const outcome = resolveAnchor(position);
    expect(outcome).not.toBeNull();
    expect(outcome.strategy).toBe('quote');
    expect(outcome.range.toString()).toBe('deemed disposal rule');
    expect(outcome.range.startContainer.parentElement.closest('#wrap')).not.toBeNull();
  });

  test('restores after the ancestor structure changes around the text', () => {
    const position = anchorTheSentence();

    // An SPA re-render adds two wrapper layers and drops the old class.
    const body = document.querySelector('.body');
    const rewrapped = document.createElement('main');
    const inner = document.createElement('article');
    rewrapped.appendChild(inner);
    while (body.firstChild) {
      inner.appendChild(body.firstChild);
    }
    body.replaceWith(rewrapped);

    const outcome = resolveAnchor(position);
    expect(outcome.strategy).toBe('quote');
    expect(outcome.range.toString()).toBe('deemed disposal rule');
  });

  test('does not anchor when the quoted text is gone from the page', () => {
    const position = anchorTheSentence();
    document.body.innerHTML = '<p>An entirely different article about something else.</p>';

    expect(resolveAnchor(position)).toBeNull();
  });
});

describe('resolveAnchor — a quote that appears more than once', () => {
  test('picks the right occurrence using the stored prefix and suffix', () => {
    document.body.innerHTML =
      '<div id="c"><p id="p1">Under the old rules the charge applied every eight years.</p>' +
      '<p id="p2">Under the new rules the charge applied only on sale.</p></div>';

    const position = describeRange(rangeOver(document.getElementById('p2'), 'the charge applied'));

    // Shift everything so the stored offsets are no longer usable on their own.
    document.body.insertAdjacentHTML('afterbegin', `<p>${'filler. '.repeat(6)}</p>`);

    const outcome = resolveAnchor(position);
    expect(outcome.strategy).toBe('quote');
    expect(outcome.range.startContainer.parentElement.closest('#p2')).not.toBeNull();
    expect(outcome.range.toString()).toBe('the charge applied');
  });

  test('fails safely rather than guessing when the occurrences are indistinguishable', () => {
    // Six identical rows: an interior one has the same 32 characters of context on both
    // sides as its neighbour, so prefix/suffix cannot choose between them.
    const row = '<p>one two three four</p>';
    document.body.innerHTML = `<div id="c">${row.repeat(6)}</div>`;

    const target = document.querySelectorAll('#c p')[2];
    const position = describeRange(rangeOver(target, 'two three'));

    // Confirm it resolves cleanly while the page is unchanged...
    expect(resolveAnchor(position).strategy).toBe('quote');

    // ...then push the document text far out of position, so "nearest to the stored
    // offset" is no longer evidence of anything.
    document.body.insertAdjacentHTML('afterbegin', `<p>${'padding text. '.repeat(200)}</p>`);

    expect(resolveAnchor(position)).toBeNull();
  });
});

describe('resolveAnchor — records written before this change', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="c"><p id="old">This is the sentence an existing user already annotated.</p></div>';
  });

  test('an OLD record carrying only position + XPath still restores', () => {
    // Exactly the shape the shipped build stored: no quote, no textPosition.
    const legacyRecord = {
      startOffset: 12,
      endOffset: 20,
      containerXPath: '//*[@id="old"]',
    };

    const outcome = resolveAnchor(legacyRecord);

    expect(outcome).not.toBeNull();
    expect(outcome.strategy).toBe('xpath');
    expect(outcome.range.toString()).toBe('sentence');
  });

  test('a record with no usable anchor at all resolves to nothing, and does not throw', () => {
    expect(resolveAnchor({ startOffset: 0, endOffset: 5, containerXPath: '//*[@id="gone"]' })).toBeNull();
    expect(resolveAnchor(null)).toBeNull();
    expect(resolveAnchor({})).toBeNull();
  });
});

describe('resolveAnchor — text that spans more than one block', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="c"><p id="p1">No deemed disposal here.</p><p id="p2">A tax-free allowance.</p></div>';
  });

  test('round-trips a selection running from one paragraph into the next', () => {
    const range = document.createRange();
    range.setStart(document.getElementById('p1').firstChild, 3);
    range.setEnd(document.getElementById('p2').firstChild, 9);

    const position = describeRange(range);
    // The inter-block whitespace becomes exactly one space, whatever the source looked like.
    expect(position.quote.exact).toBe('deemed disposal here. A tax-fre');

    document.body.insertAdjacentHTML('afterbegin', '<div><p>Injected above.</p></div>');

    const outcome = resolveAnchor(position);
    expect(outcome.strategy).toBe('quote');
    expect(resolvedText(position)).toBe('deemed disposal here. A tax-fre');
  });

  test('normalises whitespace so a re-serialised page still matches', () => {
    const range = document.createRange();
    range.setStart(document.getElementById('p1').firstChild, 3);
    range.setEnd(document.getElementById('p2').firstChild, 9);
    const position = describeRange(range);

    // Same content, pretty-printed differently — newlines and indentation between blocks.
    document.body.innerHTML =
      '<div id="c">\n  <p id="p1">No deemed disposal here.</p>\n\n  <p id="p2">A tax-free allowance.</p>\n</div>';

    expect(resolveAnchor(position).strategy).toBe('quote');
    expect(resolvedText(position)).toBe('deemed disposal here. A tax-fre');
  });
});

describe('resolveAnchor — seeing through highlights that are already on the page', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div id="c"><p id="p1">The first clause matters, and the second clause matters more.</p></div>';
  });

  test('two overlapping annotations both restore', () => {
    const paragraph = document.getElementById('p1');
    const first = describeRange(rangeOver(paragraph, 'first clause matters, and the second'));
    const second = describeRange(rangeOver(paragraph, 'second clause matters more'));

    // Restore the first — this splits the text node and inserts highlight spans that were
    // not in the DOM when either annotation was captured.
    const firstOutcome = resolveAnchor(first);
    expect(firstOutcome).not.toBeNull();
    wrapRangeInHighlights(firstOutcome.range, { color: 'yellow', annotationId: 1 });
    expect(document.querySelectorAll('.assist-inline-annotation').length).toBeGreaterThan(0);

    // The second annotation overlaps the first and must still resolve onto the same words.
    const secondOutcome = resolveAnchor(second);
    expect(secondOutcome).not.toBeNull();
    expect(secondOutcome.strategy).toBe('quote');
    expect(secondOutcome.range.toString()).toBe('second clause matters more');

    wrapRangeInHighlights(secondOutcome.range, { color: 'blue', annotationId: 2 });
    expect(document.querySelectorAll('[data-annotation-id="2"]').length).toBeGreaterThan(0);
  });

  test('AssisT chrome on the page never counts as page text', () => {
    const position = describeRange(rangeOver(document.getElementById('p1'), 'second clause'));

    // The annotation sidebar renders the comment text into the page.
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<div id="assist-annotation-sidebar"><p>second clause</p></div>'
    );

    const outcome = resolveAnchor(position);
    expect(outcome.strategy).toBe('quote');
    expect(outcome.range.startContainer.parentElement.closest('#p1')).not.toBeNull();
  });
});
