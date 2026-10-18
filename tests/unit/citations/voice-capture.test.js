/**
 * Voice-capture tests — trigger detection, paragraph snapshot into a draft, non-trigger pass, and
 * debounce of repeat fires.
 */

import {
  matchesTrigger,
  createVoiceCapture,
} from '../../../src/features/citations/capture/voice-capture.js';

describe('voice-capture', () => {
  it('matchesTrigger detects trigger phrases case-insensitively', () => {
    expect(matchesTrigger('please cite this now')).toBe(true);
    expect(matchesTrigger('capture SOURCE')).toBe(true);
    expect(matchesTrigger('just reading aloud')).toBe(false);
  });

  it.each([
    'cite this',
    'Cite this.',
    'cite, this',
    'site this',
    'Sight this',
    'okay site this paragraph',
    'capture source',
    'capture the source',
    'Save citation',
    'save the citation',
    'Save the citation.',
  ])('matchesTrigger hits "%s"', text => {
    expect(matchesTrigger(text)).toBe(true);
  });

  it.each([
    'website this week',
    'the site',
    'on this site',
    'a sight to see this',
    'source of this',
    'capture the moment',
    'citation needed',
    '',
  ])('matchesTrigger misses "%s"', text => {
    expect(matchesTrigger(text)).toBe(false);
  });

  it('handleResult snapshots the paragraph into a voice draft on a trigger', async () => {
    const vc = createVoiceCapture({
      getContext: async () => ({ url: 'https://x', title: 'T', paragraph: 'A paragraph about memory.' }),
    });

    const draft = await vc.handleResult('cite this');
    expect(draft).toMatchObject({
      source: 'voice',
      url: 'https://x',
      quotedText: 'A paragraph about memory.',
      passageMissing: false,
    });
  });

  it('returns null for non-trigger speech', async () => {
    const vc = createVoiceCapture({ getContext: async () => ({}) });
    expect(await vc.handleResult('unrelated speech')).toBeNull();
  });

  it('debounces repeat fires of the same trigger', async () => {
    const vc = createVoiceCapture({ getContext: async () => ({ paragraph: 'p' }) });
    const a = await vc.handleResult('cite this');
    const b = await vc.handleResult('cite this');
    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });
});

describe('voice-capture default reading context (no getContext supplied)', () => {
  const selectText = (node, start, end) => {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };
  const placeCaret = (node, offset) => selectText(node, offset, offset);

  beforeEach(() => {
    window.getSelection().removeAllRanges();
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    document.title = 'Week 3 reading';
    document.body.innerHTML = '';
  });

  it('captures the text the student has selected on the page', async () => {
    document.body.innerHTML =
      '<article><p id="p1">Working memory   holds about four chunks.</p><p>Other text.</p></article>';
    const text = document.getElementById('p1').firstChild;
    selectText(text, 0, 'Working memory   holds'.length);

    const draft = await createVoiceCapture().handleResult('cite this');
    expect(draft).toMatchObject({
      source: 'voice',
      url: window.location.href,
      title: 'Week 3 reading',
      paragraph: 'Working memory holds',
      quotedText: 'Working memory holds',
      passageMissing: false,
    });
  });

  it('captures the paragraph holding the caret when nothing is selected', async () => {
    document.body.innerHTML =
      '<section><p>First paragraph.</p><p id="p2">Second <em>paragraph</em> here.</p></section>';
    placeCaret(document.querySelector('#p2 em').firstChild, 3);

    const draft = await createVoiceCapture().handleResult('cite this');
    expect(draft.paragraph).toBe('Second paragraph here.');
    expect(draft.passageMissing).toBe(false);
  });

  it('keeps a caret in a huge wrapper to a readable length, ending on a whole word', async () => {
    // A page with no paragraph elements: the nearest block round the caret is a wrapper holding
    // the whole article, which would otherwise arrive in the quote box in one piece.
    const words = Array.from({ length: 900 }, (_, i) => `word${i}`).join(' ');
    document.body.innerHTML = `<div id="wrap">${words}</div>`;
    placeCaret(document.getElementById('wrap').firstChild, 10);

    const draft = await createVoiceCapture().handleResult('cite this');
    expect(draft.paragraph.length).toBeLessThanOrEqual(1001);
    expect(draft.paragraph.startsWith('word0 word1 ')).toBe(true);
    expect(draft.paragraph.endsWith('…')).toBe(true);
    expect(words.startsWith(draft.paragraph.slice(0, -1).trimEnd())).toBe(true);
    expect(draft.passageMissing).toBe(false);
  });

  it('never shortens words the student selected themselves', async () => {
    const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
    document.body.innerHTML = `<p id="long">${words}</p>`;
    const text = document.getElementById('long').firstChild;
    selectText(text, 0, words.length);

    const draft = await createVoiceCapture().handleResult('cite this');
    expect(draft.paragraph).toBe(words);
  });

  it('captures the paragraph around focused page content when there is no caret', async () => {
    document.body.innerHTML =
      '<p>Unrelated.</p><p id="p3">See the <a href="#ref" id="link">original study</a> for details.</p>';
    document.getElementById('link').focus();

    const draft = await createVoiceCapture().handleResult('cite this');
    expect(draft.paragraph).toBe('See the original study for details.');
    expect(draft.passageMissing).toBe(false);
  });

  it('does not capture the field the student is dictating into (textarea)', async () => {
    document.body.innerHTML =
      '<p>Page text the student is not pointing at.</p><textarea id="essay">My essay so far</textarea>';
    document.getElementById('essay').focus();

    const draft = await createVoiceCapture().handleResult('cite this');
    expect(draft.paragraph).toBe('');
    expect(draft.quotedText).toBe('');
    expect(draft.passageMissing).toBe(true);
  });

  /**
   * Chrome reports a caret or selection inside a textarea on the field's PARENT, and
   * getSelection().toString() returns the words selected inside the field. So the checks above,
   * with the textarea straight under <body>, could not fail: here the field sits in a form block
   * beside page text, as it does on Canvas, and the selection is shaped the way Chrome reports it.
   */
  describe('the student is writing in a field inside a form block (Chrome\'s selection shape)', () => {
    const FORM =
      '<div id="block"><label>Your answer</label><textarea id="essay">My essay so far</textarea>' +
      '<span>Word count: 4</span></div>';

    /** A selection as Chrome reports it for a field: anchored on the field's parent. */
    const chromeSelection = ({ collapsed, text }) => {
      const block = document.getElementById('block');
      const index = [...block.childNodes].indexOf(document.getElementById('essay'));
      const range = document.createRange();
      range.setStart(block, index);
      range.setEnd(block, index);
      jest.spyOn(window, 'getSelection').mockReturnValue({
        rangeCount: 1,
        anchorNode: block,
        isCollapsed: collapsed,
        getRangeAt: () => range,
        toString: () => text,
        removeAllRanges: () => {},
      });
    };

    afterEach(() => jest.restoreAllMocks());

    it('a caret in the field captures nothing, not the block around it', async () => {
      document.body.innerHTML = FORM;
      document.getElementById('essay').focus();
      chromeSelection({ collapsed: true, text: '' });

      const draft = await createVoiceCapture().handleResult('cite this');
      expect(draft).toMatchObject({ paragraph: '', quotedText: '', passageMissing: true });
    });

    it('words selected in the field are the student\'s own, never the quote', async () => {
      document.body.innerHTML = FORM;
      document.getElementById('essay').focus();
      chromeSelection({ collapsed: false, text: 'essay so' });

      const draft = await createVoiceCapture().handleResult('cite this');
      expect(draft).toMatchObject({ paragraph: '', quotedText: '', passageMissing: true });
    });

    it('an editor in an iframe (Canvas\'s rich text editor) captures nothing', async () => {
      document.body.innerHTML = '<p id="page">Page text beside the editor.</p><iframe id="rce"></iframe>';
      const frame = document.getElementById('rce');
      jest.spyOn(document, 'activeElement', 'get').mockReturnValue(frame);
      placeCaret(document.getElementById('page').firstChild, 3);

      const draft = await createVoiceCapture().handleResult('cite this');
      expect(draft).toMatchObject({ paragraph: '', passageMissing: true });
    });
  });

  it('does not capture a contenteditable editor holding the caret', async () => {
    document.body.innerHTML =
      '<div contenteditable="true" id="rce"><p id="mine">My own draft sentence.</p></div>';
    placeCaret(document.getElementById('mine').firstChild, 4);

    const draft = await createVoiceCapture().handleResult('cite this');
    expect(draft.paragraph).toBe('');
    expect(draft.passageMissing).toBe(true);
  });

  it("ignores a selection or focus inside AssisT's own controls", async () => {
    document.body.innerHTML =
      '<div class="assist-cite-root assist-cite-capture-bar"><button id="btn">Cite</button></div>';
    selectText(document.getElementById('btn').firstChild, 0, 4);
    document.getElementById('btn').focus();

    const draft = await createVoiceCapture().handleResult('cite this');
    expect(draft.paragraph).toBe('');
    expect(draft.passageMissing).toBe(true);
  });

  it('says explicitly that no passage was captured when there is nothing to read', async () => {
    document.body.innerHTML = '<p>Some page text.</p>';

    const draft = await createVoiceCapture().handleResult('cite this');
    expect(draft).toMatchObject({ paragraph: '', quotedText: '', passageMissing: true });
    expect(draft.url).toBe(window.location.href);
  });

  it('treats page text as data: markup-like text stays literal and no markup is carried', async () => {
    document.body.innerHTML =
      '<p id="p4">Type &lt;img src=x onerror=alert(1)&gt; <b>carefully</b>.</p>';
    placeCaret(document.getElementById('p4').firstChild, 2);

    const draft = await createVoiceCapture().handleResult('cite this');
    expect(draft.paragraph).toBe('Type <img src=x onerror=alert(1)> carefully.');
    expect(draft.paragraph).not.toContain('<b>');
  });
});

describe('voice-capture passageMissing with a supplied context reader', () => {
  it('is false when the reader supplies a passage', async () => {
    const vc = createVoiceCapture({ getContext: () => ({ paragraph: 'A passage.' }) });
    expect((await vc.handleResult('cite this')).passageMissing).toBe(false);
  });

  it('is true when the reader supplies no passage', async () => {
    const vc = createVoiceCapture({ getContext: () => ({ url: 'https://x' }) });
    expect((await vc.handleResult('cite this')).passageMissing).toBe(true);
  });
});
