/**
 * Console privacy gate — the student's own words must never reach the browser console.
 *
 * AssisT reads coursework aloud, takes dictation, and sends essays to an AI. Every one of those
 * values is student data under FERPA. A `console.log` of it is not harmless: the log is on the
 * student's screen in a shared lab, and it is what gets pasted into a bug report. The 1.0.0
 * pre-release audit found the shipped build logging full dictation transcripts, whole AI answers
 * and 50-character previews of the page being read.
 *
 * The rule this gate enforces: log the length, the type, the count, the elapsed time or an id —
 * never the content. Where the text itself is genuinely needed to debug, it goes behind
 * `debugLog()` (`src/utils/debug-log.js`), which is off in every normal build.
 *
 * The scanner's blind spots are listed in `LIMITS`; a green run means no content-bearing *name*
 * reaches `console.*`, not that no content can.
 */

const { scanConsoleCalls, blankLiterals, LIMITS } = require('./console-privacy-scan.js');
const allowlist = require('./console-privacy-allowlist.js');

const key = finding => `${finding.file}:${finding.identifier}`;

describe('console privacy gate', () => {
  const findings = scanConsoleCalls();

  test("no console call in src/ is handed the student's own words", () => {
    const unexplained = findings.filter(finding => !allowlist[key(finding)]);

    const report = [
      `${unexplained.length} console call(s) in src/ pass a content-bearing value.`,
      'Log the length, the type, the count or an id instead, or move the value into debugLog().',
      '',
      ...unexplained.map(f => `  ${f.file}:${f.line}  [${f.identifier}]  ${f.snippet}`),
      '',
      `Scanner limits: ${LIMITS.join(' ')}`,
    ].join('\n');

    expect(unexplained.length === 0 ? '' : report).toBe('');
  });

  test('every allowlist entry is still needed, and says why', () => {
    const live = new Set(findings.map(key));
    const stale = Object.keys(allowlist).filter(entry => !live.has(entry));
    expect(stale).toEqual([]);

    const unexplained = Object.entries(allowlist)
      .filter(([, reason]) => typeof reason !== 'string' || reason.trim().length < 30)
      .map(([entry]) => entry);
    expect(unexplained).toEqual([]);
  });
});

describe('the scanner itself', () => {
  test('sees a bare content value and a preview of one', () => {
    const findings = scanConsoleCalls.forSource(
      'demo.js',
      [
        'console.log("dictated:", transcript);',
        'console.log("read:", text.substring(0, 50));',
      ].join('\n')
    );
    expect(findings.map(f => f.identifier)).toEqual(['transcript', 'text']);
  });

  test('accepts a measurement of the same value', () => {
    const findings = scanConsoleCalls.forSource(
      'demo.js',
      [
        'console.log("dictated chars:", transcript.length);',
        'console.log("prompt size", promptLength, response?.status);',
      ].join('\n')
    );
    expect(findings).toEqual([]);
  });

  test('ignores the word inside a string but not inside a template hole', () => {
    const clean = scanConsoleCalls.forSource('demo.js', 'console.log("response text received");');
    expect(clean).toEqual([]);

    const leak = scanConsoleCalls.forSource('demo.js', 'console.log(`answer: ${response}`);');
    expect(leak.map(f => f.identifier)).toEqual(['response']);
  });

  test('blanks comments and string bodies while keeping line numbers', () => {
    const blanked = blankLiterals('// transcript\nconst a = "transcript";\n');
    expect(blanked).not.toMatch(/transcript/);
    expect(blanked.split('\n')).toHaveLength(3);
  });
});

/**
 * The thirteen `console.*` calls the 1.0.0 privacy sweep removed, replayed verbatim.
 *
 * A fresh reviewer took these lines back out of the diff and fed them to the gate: nine walked
 * through it, because the word list of the day knew only nine content nouns and none of these named
 * one. A URL is the page the student is reading, a title is their assignment, a query is what they
 * searched for, the root settings object carries their API key, and a storage `value` is whatever
 * they just saved. The gate is only worth having if it rejects all thirteen, so it is graded on
 * them here rather than on a hand-picked pair.
 */
const REMOVED_LEAKS = [
  ["the page the student asked to be fetched", "console.log('[AssisT] Fetching image:', message.url);"],
  ["their assignment's title", "console.log('[Canvas] Assignment detected:', assignment.title);"],
  [
    'what they searched their annotations for',
    'console.log(`[AnnotationSidebar] Search found ${results.length} results for "${query}"`);',
  ],
  ["the whole settings object", "console.log('[WAI-Adapt] Text spacing applied:', settings);"],
  [
    'every value written to storage, the API key among them',
    "console.log('[Storage] Setting updated:', path, value);",
  ],
  [
    'the title of a document they uploaded to compare',
    'console.log(`[MultiDocCompare] Added document: ${doc.title} (${doc.wordCount} words)`);',
  ],
  [
    'a word taken from their dictation and auto-learned',
    'console.log(`[STT] Vocabulary word added: ${entry.word}`);',
  ],
  [
    'the root settings object again, reached through this',
    "console.log('[Popup][loadSettings] Settings loaded successfully:', this.settings);",
  ],
  ['the word they looked up', 'console.log(`[Dictionary] Looking up: ${word}`);'],
  [
    'the first 50 characters of the page being read aloud',
    "console.log('[AssisT][readText] Reading:', text.substring(0, 50) + '...');",
  ],
  ["their dictated sentence", "console.log('[StickyNotes] STT final:', finalTranscript);"],
  [
    "the tutor's answer about their essay",
    "console.log('[SocraticTutor] Raw response:', aiResult.text.substring(0, 300));",
  ],
  [
    'the translation of what they selected',
    'console.log(`[Translation] MyMemory success: ${translatedText.substring(0, 50)}...`);',
  ],
];

describe('the shapes this gate exists to reject', () => {
  test('all thirteen leaks removed in the privacy sweep are rejected', () => {
    const passed = REMOVED_LEAKS.filter(
      ([, line]) => scanConsoleCalls.forSource('replay.js', line).length === 0
    ).map(([what, line]) => `  ${what}: ${line}`);

    expect(passed.join('\n')).toBe('');
  });

  test('a credential reaches the console under its own name too', () => {
    const findings = scanConsoleCalls.forSource(
      'replay.js',
      [
        "console.log('[AI] key:', apiKey);",
        "console.log('[AI] bearer:', authToken);",
        "console.log('[Summarize] result:', summary, answer);",
      ].join('\n')
    );
    expect(findings.map(f => f.identifier)).toEqual([
      'apiKey',
      'authToken',
      'summary',
      'answer',
    ]);
  });

  test('does not cry wolf over structure that carries nothing', () => {
    const quiet = [
      "console.log('[Popup] fields:', Object.keys(settings).join(', '));",
      "console.log('[Translation] cache key:', cacheKey, sortedKeys.length);",
      "console.log('[Popup] language:', event.target.value);",
      "console.log('[AISetup] mode:', settings.aiMode);",
      "console.log('[Shortcuts] pressed:', event.key, keyboard.layout);",
      "console.log('[Popup] found:', document.querySelector('#tools'));",
      "console.log('[FeatureName] loaded:', { settings: featureName_settings.enabled });",
      "console.log('[QuizHelper] question', question.number);",
      "console.log('[STT] chars dictated:', transcript.length, promptTokens);",
    ].join('\n');
    expect(scanConsoleCalls.forSource('quiet.js', quiet)).toEqual([]);
  });
});
