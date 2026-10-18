/**
 * @jest-environment jsdom
 *
 * Unit tests for capture/citation-voice-trigger.js.
 */

import { createCitationVoiceTrigger } from '../../../../src/features/citations/capture/citation-voice-trigger.js';


describe('createCitationVoiceTrigger()', () => {
  test('returns false (does not suppress) for non-trigger speech', () => {
    const { onCitationTrigger } = createCitationVoiceTrigger({ getContext: () => ({}) });
    expect(onCitationTrigger('just dictating a sentence')).toBe(false);
  });

  test('returns true (suppresses) for a trigger phrase', () => {
    const { onCitationTrigger } = createCitationVoiceTrigger({ getContext: () => ({}) });
    expect(onCitationTrigger('please cite this for me')).toBe(true);
  });

  test('snapshots a draft and hands it to onDraft for a trigger', async () => {
    const onDraft = jest.fn();
    const getContext = () => ({ url: 'https://example.com/a', title: 'A Page', paragraph: 'Some text.' });
    const { onCitationTrigger } = createCitationVoiceTrigger({ getContext, onDraft });

    const suppressed = onCitationTrigger('cite this');
    expect(suppressed).toBe(true);

    // Let the fire-and-forget draft snapshot settle.
    await new Promise(r => setTimeout(r, 0));
    expect(onDraft).toHaveBeenCalledTimes(1);
    expect(onDraft.mock.calls[0][0]).toEqual(
      expect.objectContaining({ url: 'https://example.com/a', source: 'voice' })
    );
  });

  test('hands the draft on in a content script, where session storage is refused', async () => {
    // A content script cannot use chrome.storage.session unless the extension opens it up, and
    // nothing does: every call rejects. The draft must still reach the wizard.
    const refused = jest.fn(async () => {
      throw new Error('Access to storage is not allowed from this context.');
    });
    chrome.storage.session = { get: refused, set: refused };
    try {
      const onDraft = jest.fn();
      const { onCitationTrigger } = createCitationVoiceTrigger({
        getContext: () => ({ url: 'https://example.com/a', title: 'A Page', paragraph: 'Text.' }),
        onDraft,
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});

      onCitationTrigger('cite this');
      await new Promise(r => setTimeout(r, 0));

      expect(onDraft).toHaveBeenCalledTimes(1);
      expect(refused).not.toHaveBeenCalled();
    } finally {
      delete chrome.storage.session;
    }
  });

  test('does not call onDraft for non-trigger speech', async () => {
    const onDraft = jest.fn();
    const { onCitationTrigger } = createCitationVoiceTrigger({ getContext: () => ({}), onDraft });
    onCitationTrigger('the quick brown fox');
    await new Promise(r => setTimeout(r, 0));
    expect(onDraft).not.toHaveBeenCalled();
  });
});

describe('createCitationVoiceTrigger() as production builds it (no getContext)', () => {
  afterEach(() => {
    window.getSelection().removeAllRanges();
    document.body.innerHTML = '';
  });

  test('the draft carries the passage the student selected', async () => {
    document.body.innerHTML = '<p id="p">Spacing improves recall.</p>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('p'));
    window.getSelection().addRange(range);

    const onDraft = jest.fn();
    const { onCitationTrigger } = createCitationVoiceTrigger({ onDraft });
    expect(onCitationTrigger('cite this')).toBe(true);

    await new Promise(r => setTimeout(r, 0));
    expect(onDraft).toHaveBeenCalledTimes(1);
    expect(onDraft.mock.calls[0][0]).toMatchObject({
      paragraph: 'Spacing improves recall.',
      passageMissing: false,
    });
  });
});
