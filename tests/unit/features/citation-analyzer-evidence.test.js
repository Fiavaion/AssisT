/**
 * @jest-environment jsdom
 *
 * What the citation analyser tells a student about a source.
 *
 * It used to show "78/100 — High Credibility" from a count of keywords around a baseline of 50,
 * where two keyword hits could move the number 35 points. A precise number from a coarse count
 * invites a student to trust it more than it deserves. The panel now shows a plain band that says
 * it is a quick look, the good and warning signs it found, and, just as prominently, what it did
 * not check or could not tell. The band follows from those lists, so the student can see why.
 */

jest.mock('../../../src/features/shared/ai-feature-client.js', () => ({
  ...jest.requireActual('../../../src/features/shared/ai-feature-client.js'),
  getAIMode: jest.fn(),
  checkAIAvailable: jest.fn(),
  generateWithAI: jest.fn(),
  setAIStatusBar: jest.fn(),
  getSuccessStatusMessage: jest.fn(),
}));

const aiClient = require('../../../src/features/shared/ai-feature-client.js');

const JOURNAL =
  'Smith, J., & Lee, K. (2021). Working memory in dyslexia. Journal of Learning Disabilities, ' +
  '54(3), pp. 201-215. https://doi.org/10.1177/0022219420123456';
const BLOG =
  'My top 10 study hacks, a blog by Sam. Obviously the best way to learn is to reread your notes.';
const NO_DATE_OR_AUTHOR = 'Learning styles are a way of thinking about how people learn best.';

const BAND = {
  reliable: 'Looks reliable',
  check: 'Check before you use it',
  unclear: 'Hard to tell',
};

const ALWAYS_NOT_CHECKED = [
  'Did not check whether it is peer reviewed',
  'Did not check whether what it says is true',
  'Did not look it up online to see that it exists',
];

/** Any number presented as a score: "78/100", "78 / 100", "78 out of 100", "Score: 78". */
const NUMERIC_SCORE = /\d+\s*(\/|out of)\s*100|score\s*:?\s*\d/i;

let mod;

const settle = async () => {
  for (let i = 0; i < 10; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

const panel = () => document.getElementById('assist-citation-panel');
const content = () => panel().querySelector('.assist-citation-content');
const bandLabel = () => content().querySelector('.assist-citation-band-label').textContent.trim();
/** The items of one evidence list; the list itself must be there, even when it is empty. */
function items(kind) {
  const list = content().querySelector(`.assist-citation-evidence-${kind}`);
  expect(list).not.toBeNull();
  return Array.from(list.querySelectorAll('li:not(.assist-citation-evidence-none)')).map(spoken);
}

/** An element's text as a screen reader hears it: aria-hidden glyphs left out. */
function spoken(el) {
  const copy = el.cloneNode(true);
  copy.querySelectorAll('[aria-hidden="true"]').forEach(hidden => hidden.remove());
  return copy.textContent.trim();
}

function useHeuristic() {
  aiClient.getAIMode.mockResolvedValue({ isOff: true, mode: 'off' });
  aiClient.checkAIAvailable.mockResolvedValue({ available: false, reason: 'AI is off' });
}

function useAI(json) {
  aiClient.getAIMode.mockResolvedValue({
    mode: 'cloud',
    isCloud: true,
    isLocal: false,
    isOff: false,
    displayLabel: 'Claude',
  });
  aiClient.checkAIAvailable.mockResolvedValue({ available: true });
  aiClient.getSuccessStatusMessage.mockReturnValue('Analysis complete');
  aiClient.generateWithAI.mockResolvedValue({ text: JSON.stringify(json), json });
}

async function analyse(text) {
  await mod.citation_show();
  await mod.citation_runAnalysis(text, {});
  await settle();
}

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mod = await import('../../../src/features/citationAnalyzer/citationAnalyzer.js');
});

beforeEach(() => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  chrome.runtime.sendMessage = jest.fn().mockResolvedValue({});
  useHeuristic();
});

afterEach(() => {
  mod.citation_hide();
});

describe('no number pretends to be a score', () => {
  test.each([JOURNAL, BLOG, NO_DATE_OR_AUTHOR, 'x'])('the rendered result for %p', async text => {
    await analyse(text);
    expect(content().querySelector('.assist-citation-band')).not.toBeNull();
    expect(panel().textContent).not.toMatch(NUMERIC_SCORE);
    expect(panel().textContent).not.toMatch(/credibility/i);
  });

  test('the copied report and the spoken summary carry no score either', async () => {
    await analyse(JOURNAL);

    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const copy = panel().querySelector('[data-command="copy"]');
    copy.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await settle();
    expect(writeText).toHaveBeenCalledTimes(1);
    const report = writeText.mock.calls[0][0];
    expect(report).toContain(BAND.reliable);
    expect(report).toContain('Has a DOI');
    expect(report).toContain(ALWAYS_NOT_CHECKED[0]);
    expect(report).not.toMatch(NUMERIC_SCORE);

    window.readText = jest.fn();
    const speak = panel().querySelector('[data-command="speak"]');
    speak.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(window.readText).toHaveBeenCalledTimes(1);
    const spoken = window.readText.mock.calls[0][0];
    expect(spoken).toContain(BAND.reliable);
    expect(spoken).toContain(ALWAYS_NOT_CHECKED[0]);
    expect(spoken).not.toMatch(NUMERIC_SCORE);
    delete window.readText;
  });

  test('a score the AI sends anyway is never shown', async () => {
    useAI({
      sourceType: 'academic',
      credibilityScore: 78,
      credibilityRating: 'High',
      goodSigns: ['Published in a named journal', 'Lists its references'],
      warningSigns: [],
      couldNotTell: [],
      keyClaims: ['Working memory differs in dyslexia'],
      summary: 'A journal article.',
    });
    await analyse(JOURNAL);
    expect(panel().textContent).not.toMatch(/78/);
    expect(panel().textContent).not.toMatch(NUMERIC_SCORE);
  });
});

describe('the band follows from the evidence (heuristic, on this device)', () => {
  test('a journal article with a DOI looks reliable, and says why', async () => {
    await analyse(JOURNAL);
    expect(bandLabel()).toBe(BAND.reliable);
    expect(items('good')).toEqual(
      expect.arrayContaining([
        'Has a DOI (a permanent ID for published research)',
        'Looks like academic writing, such as a journal or university',
        'Names an author',
        'Shows when it was published (2021)',
      ])
    );
    expect(items('warning')).toEqual([]);
    expect(items('notchecked')).toEqual(expect.arrayContaining(ALWAYS_NOT_CHECKED));
    expect(items('notchecked')).not.toContain('Could not see a publication date');
    expect(items('notchecked')).not.toContain('Could not see an author');
  });

  test('a blog is one to check, and the warning signs say why', async () => {
    await analyse(BLOG);
    expect(bandLabel()).toBe(BAND.check);
    expect(items('warning')).toEqual(
      expect.arrayContaining([
        "Looks like a blog, which may be one person's opinion",
        'Uses loaded words, such as "obviously" or "everyone knows"',
      ])
    );
    expect(items('good')).not.toContain('Looks like a news publication');
  });

  test('a page with no date or author is hard to tell, and says what it could not see', async () => {
    await analyse(NO_DATE_OR_AUTHOR);
    expect(bandLabel()).toBe(BAND.unclear);
    expect(items('good')).toEqual([]);
    expect(items('warning')).toEqual([]);
    expect(items('notchecked')).toEqual(
      expect.arrayContaining([
        ...ALWAYS_NOT_CHECKED,
        'Could not see a publication date',
        'Could not see an author',
        'Could not tell what kind of source this is',
      ])
    );
  });

  test('an old source is not marked down, but the student is told its age was not judged', async () => {
    await analyse('Brown, A. (1998). Reading and the brain. Oxford University Press.');
    expect(bandLabel()).toBe(BAND.reliable);
    expect(items('notchecked')).toContain(
      'Could not tell if a source from 1998 is still up to date'
    );
  });

  test('an APA web reference is not mistaken for a blog', async () => {
    await analyse(
      'Department of Education. (2022). Special educational needs. Retrieved from https://www.gov.ie/sen'
    );
    expect(items('warning')).not.toContain("Looks like a blog, which may be one person's opinion");
  });

  test('"sometimes" is not read as a newspaper name', async () => {
    await analyse('Students sometimes find this hard, and a posture guide can help.');
    expect(items('good')).not.toContain('Looks like a news publication');
  });

  test('with the online check turned on, "did not look it up online" is not claimed', async () => {
    mod.citation_settings.verifyOnline = true;
    chrome.runtime.sendMessage = jest.fn().mockResolvedValue({ success: false, code: 'not-found' });
    try {
      await analyse(JOURNAL);
      expect(items('notchecked')).not.toContain(ALWAYS_NOT_CHECKED[2]);
    } finally {
      mod.citation_settings.verifyOnline = false;
    }
  });

  test('an empty page has nothing to go on', () => {
    const result = mod.citation_fallback('');
    expect(result.band).toBe('unclear');
    expect(result.evidence.good).toEqual([]);
    expect(result.evidence.warnings).toEqual([]);
    expect(result.evidence.notChecked).toEqual(
      expect.arrayContaining([...ALWAYS_NOT_CHECKED, 'Could not see a publication date'])
    );
    expect(JSON.stringify(result)).not.toMatch(/credibilityScore/);
  });
});

describe('what the panel says about how it got its answer', () => {
  test('the on-device result says it ran without AI and is a quick look, not a verdict', async () => {
    await analyse(JOURNAL);
    const text = content().textContent;
    expect(text).toMatch(/worked out on this device from the text itself,\s+without AI/);
    expect(text).toMatch(/quick look at clues in the text, not a verdict/);
  });

  test('the AI result says AI wrote it, not that it ran without AI', async () => {
    useAI({
      sourceType: 'news',
      goodSigns: ['Names the reporter', 'Gives a date'],
      warningSigns: ['Quotes only one side'],
      couldNotTell: ['Could not tell who funded it'],
      keyClaims: [],
      summary: 'A news report.',
    });
    await analyse('Reporter, A. (2024). Schools change reading tests. The Irish Times.');
    const text = content().textContent;
    expect(text).not.toMatch(/without AI/);
    expect(text).toMatch(/written by AI/);
    expect(bandLabel()).toBe(BAND.check);
    expect(items('good')).toEqual(['Names the reporter', 'Gives a date']);
    expect(items('warning')).toEqual(['Quotes only one side']);
    expect(items('notchecked')).toEqual(
      expect.arrayContaining(['Could not tell who funded it', ...ALWAYS_NOT_CHECKED])
    );
  });

  test('two AI good signs and no warnings look reliable; one alone is hard to tell', async () => {
    useAI({ sourceType: 'academic', goodSigns: ['A', 'B'], warningSigns: [], couldNotTell: [] });
    await analyse(JOURNAL);
    expect(bandLabel()).toBe(BAND.reliable);
    mod.citation_hide();

    useAI({ sourceType: 'academic', goodSigns: ['A'], warningSigns: [], couldNotTell: [] });
    await analyse(JOURNAL);
    expect(bandLabel()).toBe(BAND.unclear);
  });
});

describe('accessibility of the result', () => {
  test('the band is never colour alone: it has an icon and its words', async () => {
    await analyse(BLOG);
    const band = content().querySelector('.assist-citation-band');
    const icon = band.querySelector('.assist-citation-band-icon');
    expect(icon).not.toBeNull();
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.textContent.trim().length).toBeGreaterThan(0);
    expect(band.textContent).toContain(BAND.check);
  });

  test('the result is announced once, as one sentence, through its own status region', async () => {
    await analyse(JOURNAL);
    const announcer = panel().querySelector('.assist-citation-announce');
    expect(announcer.getAttribute('role')).toBe('status');
    expect(announcer.textContent).toMatch(/^Quick look: Looks reliable\./);
    // The status bar stays the first live region, so failures still announce there.
    expect(panel().querySelector('[role="status"]').classList).toContain('assist-citation-status');
    // The result body itself is not live, so it is not read out piece by piece.
    expect(content().getAttribute('aria-live')).toBeNull();
    expect(content().querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
  });
});
