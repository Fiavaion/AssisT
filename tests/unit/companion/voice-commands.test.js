import { parseCommand, COMMAND_HELP } from '../../../src/features/companion/voice-commands.js';

describe('voice-commands: read-page', () => {
  test('"read this page" matches read-page', () => {
    expect(parseCommand('read this page')).toEqual({
      action: 'read-page',
      matchedPhrase: 'read this page',
    });
  });

  test('"read aloud" matches read-page', () => {
    expect(parseCommand('read aloud').action).toBe('read-page');
  });

  test('"start reading" matches read-page', () => {
    expect(parseCommand('start reading').action).toBe('read-page');
  });
});

describe('voice-commands: stop-reading', () => {
  test('"stop reading" matches stop-reading', () => {
    expect(parseCommand('stop reading').action).toBe('stop-reading');
  });

  test('"stop" alone matches stop-reading', () => {
    expect(parseCommand('stop').action).toBe('stop-reading');
  });

  test('"pause reading" matches stop-reading', () => {
    expect(parseCommand('pause reading').action).toBe('stop-reading');
  });

  test('"pause" alone matches stop-reading', () => {
    expect(parseCommand('pause').action).toBe('stop-reading');
  });
});

describe('voice-commands: save-citation', () => {
  test('"cite this source" matches save-citation', () => {
    expect(parseCommand('cite this source').action).toBe('save-citation');
  });

  test('"save citation" matches save-citation', () => {
    expect(parseCommand('save citation').action).toBe('save-citation');
  });

  test('"capture source" matches save-citation', () => {
    expect(parseCommand('capture source').action).toBe('save-citation');
  });
});

describe('voice-commands: open-library', () => {
  test('"open my library" matches open-library', () => {
    expect(parseCommand('open my library').action).toBe('open-library');
  });

  test('"open citations" matches open-library', () => {
    expect(parseCommand('open citations').action).toBe('open-library');
  });
});

describe('voice-commands: retired due-date and focus phrases stay dictation', () => {
  test.each([
    "what's due",
    'what is due this week',
    'show deadlines',
    'start a focus session',
    'start pomodoro',
    'focus for 25 minutes',
    'start a focus session for 15 minutes',
  ])('%s returns null', (phrase) => {
    expect(parseCommand(phrase)).toBeNull();
  });
});

describe('voice-commands: summarize / simplify / open-calculator / help', () => {
  test('"summarize this" matches summarize', () => {
    expect(parseCommand('summarize this').action).toBe('summarize');
  });

  test('"summarize the page" matches summarize', () => {
    expect(parseCommand('summarize the page').action).toBe('summarize');
  });

  test('"simplify this" matches simplify', () => {
    expect(parseCommand('simplify this').action).toBe('simplify');
  });

  test('"open calculator" matches open-calculator', () => {
    expect(parseCommand('open calculator').action).toBe('open-calculator');
  });

  test('"what can i say" matches help', () => {
    expect(parseCommand('what can i say').action).toBe('help');
  });
});

describe('voice-commands: wake-word tolerance', () => {
  test('"assist read this page" matches read-page (wake prefix, no comma)', () => {
    expect(parseCommand('assist read this page').action).toBe('read-page');
  });

  test('"assist, stop reading" matches stop-reading (wake prefix with comma)', () => {
    expect(parseCommand('assist, stop reading').action).toBe('stop-reading');
  });

  test('matchedPhrase excludes the stripped wake word', () => {
    const result = parseCommand('assist open my library');
    expect(result.matchedPhrase).toBe('open my library');
  });
});

describe('voice-commands: filler tolerance', () => {
  test('"please read this page" matches read-page', () => {
    expect(parseCommand('please read this page').action).toBe('read-page');
  });

  test('"can you open my library" matches open-library', () => {
    expect(parseCommand('can you open my library').action).toBe('open-library');
  });

  test('"hey summarize this" matches summarize', () => {
    expect(parseCommand('hey summarize this').action).toBe('summarize');
  });

  test('wake word + filler combined: "assist please read this page" matches read-page', () => {
    expect(parseCommand('assist please read this page').action).toBe('read-page');
  });

  test('only one leading filler is tolerated: "please can you read this page" does not match', () => {
    expect(parseCommand('please can you read this page')).toBeNull();
  });
});

describe('voice-commands: anchoring — mid-sentence mentions are not commands', () => {
  test('"I will read this page later" returns null (trailing words)', () => {
    expect(parseCommand('I will read this page later')).toBeNull();
  });

  test('"she told me to stop reading" returns null (leading words)', () => {
    expect(parseCommand('she told me to stop reading')).toBeNull();
  });

  test('"the library was closed today" returns null (mentions library, not a command)', () => {
    expect(parseCommand('the library was closed today')).toBeNull();
  });

  test('"can you believe the pomodoro technique is popular" returns null', () => {
    expect(parseCommand('can you believe the pomodoro technique is popular')).toBeNull();
  });
});

describe('voice-commands: punctuation and case robustness', () => {
  test('all-caps with exclamation: "READ THIS PAGE!" matches read-page', () => {
    expect(parseCommand('READ THIS PAGE!').action).toBe('read-page');
  });

  test('trailing period and mixed case: "Cite This Source." matches save-citation', () => {
    expect(parseCommand('Cite This Source.').action).toBe('save-citation');
  });

  test('extra internal whitespace is collapsed: "read   this    page" matches read-page', () => {
    expect(parseCommand('read   this    page').action).toBe('read-page');
  });
});

describe('voice-commands: non-matching input returns null', () => {
  test('empty string returns null', () => {
    expect(parseCommand('')).toBeNull();
  });

  test('whitespace-only string returns null', () => {
    expect(parseCommand('   ')).toBeNull();
  });

  test('non-string input returns null', () => {
    expect(parseCommand(undefined)).toBeNull();
    expect(parseCommand(null)).toBeNull();
    expect(parseCommand(42)).toBeNull();
  });

  test('unrelated dictation returns null', () => {
    expect(parseCommand('banana banana')).toBeNull();
  });
});

describe('COMMAND_HELP', () => {
  test('lists every supported action exactly once', () => {
    const actions = COMMAND_HELP.map((entry) => entry.action);
    const expected = [
      'read-page',
      'stop-reading',
      'save-citation',
      'open-library',
      'summarize',
      'simplify',
      'open-calculator',
      'help',
    ];
    expect(actions.sort()).toEqual(expected.sort());
  });

  test('every entry has a non-empty example and description', () => {
    for (const entry of COMMAND_HELP) {
      expect(typeof entry.example).toBe('string');
      expect(entry.example.length).toBeGreaterThan(0);
      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});
