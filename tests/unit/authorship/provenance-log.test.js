import { createProvenanceLog } from '../../../src/features/authorship/provenance-log.js';

/**
 * In-memory storage stub that mimics chrome.storage.local's serialization semantics: values are
 * deep-cloned on both get and set (via JSON), so the module under test can never accidentally rely
 * on object identity between what it wrote and what it reads back.
 */
function createMemoryStorage() {
  const data = new Map();
  return {
    async get(key) {
      const raw = data.get(key);
      return raw === undefined ? undefined : JSON.parse(JSON.stringify(raw));
    },
    async set(key, value) {
      data.set(key, JSON.parse(JSON.stringify(value)));
    },
    _dump() {
      return data;
    }
  };
}

/** A fully controllable fake clock — tests set the exact ms epoch for each call. */
function createClock(start = 1700000000000) {
  let t = start;
  const clock = () => t;
  clock.set = (ms) => {
    t = ms;
  };
  clock.advance = (ms) => {
    t += ms;
  };
  return clock;
}

const BANNED_WORDS = ['cheating', 'plagiarism', 'suspicious'];

function expectNoBannedWords(text) {
  const lower = text.toLowerCase();
  for (const word of BANNED_WORDS) {
    expect(lower).not.toContain(word);
  }
}

describe('provenance-log', () => {
  let storage;
  let clock;
  let log;

  beforeEach(() => {
    storage = createMemoryStorage();
    clock = createClock();
    log = createProvenanceLog({ storage, now: clock });
  });

  describe('recordSnapshot — significant-change gating', () => {
    test('always records the first snapshot for a new document (baseline)', async () => {
      const result = await log.recordSnapshot({ docId: 'doc1', title: 'Essay', text: 'Hi' });
      expect(result).toEqual({ recorded: true });
      const timeline = await log.getTimeline('doc1');
      expect(timeline).toHaveLength(1);
    });

    test('does not record a small, sub-threshold edit', async () => {
      await log.recordSnapshot({ docId: 'doc1', text: 'A'.repeat(1000) });
      const result = await log.recordSnapshot({ docId: 'doc1', text: 'A'.repeat(1010) }); // +10 chars, 1%
      expect(result).toEqual({ recorded: false, reason: 'no-significant-change' });
      const timeline = await log.getTimeline('doc1');
      expect(timeline).toHaveLength(1);
    });

    test('records when the absolute char delta crosses the 30-char threshold', async () => {
      await log.recordSnapshot({ docId: 'doc1', text: 'A'.repeat(1000) });
      const result = await log.recordSnapshot({ docId: 'doc1', text: 'A'.repeat(1035) }); // +35 chars
      expect(result.recorded).toBe(true);
    });

    test('records when the percentage delta crosses 5% even under 30 chars', async () => {
      await log.recordSnapshot({ docId: 'doc1', text: 'A'.repeat(400) });
      const result = await log.recordSnapshot({ docId: 'doc1', text: 'A'.repeat(425) }); // +25 chars, 6.25%
      expect(result.recorded).toBe(true);
    });

    test('treats going from an empty baseline to any content as significant', async () => {
      await log.recordSnapshot({ docId: 'doc1', text: '' });
      const result = await log.recordSnapshot({ docId: 'doc1', text: 'Hi' }); // +2 chars, baseline 0
      expect(result.recorded).toBe(true);
    });

    test('rejects a call with no docId', async () => {
      await expect(log.recordSnapshot({ text: 'x' })).rejects.toThrow();
    });
  });

  describe('recordSnapshot — snapshot shape & privacy', () => {
    test('stores metrics and only a 200-char rolling excerpt, never the full text', async () => {
      const longText = 'word '.repeat(500); // 2500 chars
      await log.recordSnapshot({ docId: 'doc1', title: 'Essay', text: longText });
      const [snapshot] = await log.getTimeline('doc1');

      expect(snapshot).toHaveProperty('t');
      expect(snapshot.length).toBe(longText.length);
      expect(snapshot.wordCount).toBe(500);
      expect(snapshot).toHaveProperty('deltaChars');
      expect(snapshot).toHaveProperty('largestInsertion');
      expect(snapshot).toHaveProperty('hash');
      expect(snapshot.excerpt).toBe(longText.slice(0, 200));
      expect(snapshot.excerpt.length).toBeLessThanOrEqual(200);
      expect(snapshot).not.toHaveProperty('text');
      expect(snapshot).not.toHaveProperty('fullText');
    });

    test('the timestamp comes from the injected clock, not the system clock', async () => {
      clock.set(123456789);
      await log.recordSnapshot({ docId: 'doc1', text: 'Hello' });
      const [snapshot] = await log.getTimeline('doc1');
      expect(snapshot.t).toBe(123456789);
    });
  });

  describe('largestInsertion math (paste-detection signal)', () => {
    test('a single large paste in the middle of the text is captured as one large insertion', async () => {
      const before = 'The quick brown fox ';
      const after = 'jumps over the lazy dog.';
      const pasted = 'P'.repeat(200);

      await log.recordSnapshot({ docId: 'doc1', text: before + after });
      const result = await log.recordSnapshot({ docId: 'doc1', text: before + pasted + after });

      expect(result.recorded).toBe(true);
      const timeline = await log.getTimeline('doc1');
      const last = timeline[timeline.length - 1];
      expect(last.largestInsertion).toBe(200);
      expect(last.deltaChars).toBe(200);
    });

    test('several small typed increments stay below the recording threshold until they accumulate', async () => {
      const base = 'X'.repeat(1000);
      await log.recordSnapshot({ docId: 'doc1', text: base });

      let text = base;
      const letters = 'abcde';
      for (let i = 0; i < 5; i++) {
        text += letters[i].repeat(5); // +5 chars each call, well under the 30-char / 5% gate
        const result = await log.recordSnapshot({ docId: 'doc1', text });
        expect(result).toEqual({ recorded: false, reason: 'no-significant-change' });
      }

      // The 6th increment tips the cumulative change (since the last recorded baseline) to 30 chars.
      text += 'f'.repeat(5);
      const finalResult = await log.recordSnapshot({ docId: 'doc1', text });
      expect(finalResult.recorded).toBe(true);

      const timeline = await log.getTimeline('doc1');
      expect(timeline).toHaveLength(2); // baseline + the one accumulated significant edit
      const last = timeline[timeline.length - 1];
      expect(last.deltaChars).toBe(30);
      expect(last.largestInsertion).toBe(30);
    });

    test('deleting text is not reported as an insertion', async () => {
      await log.recordSnapshot({ docId: 'doc1', text: 'A'.repeat(100) });
      const result = await log.recordSnapshot({ docId: 'doc1', text: 'A'.repeat(60) }); // -40 chars

      expect(result.recorded).toBe(true);
      const timeline = await log.getTimeline('doc1');
      const last = timeline[timeline.length - 1];
      expect(last.deltaChars).toBe(-40);
      expect(last.largestInsertion).toBe(0);
    });
  });

  describe('write serialization and fresh-session honesty (reviewer fixes)', () => {
    test('concurrent snapshots for two documents both survive', async () => {
      const textA = 'a'.repeat(120);
      const textB = 'b'.repeat(140);
      await Promise.all([
        log.recordSnapshot({ docId: 'docA', title: 'A', text: textA }),
        log.recordSnapshot({ docId: 'docB', title: 'B', text: textB }),
      ]);
      const docs = await log.listDocs();
      expect(docs.map(d => d.docId).sort()).toEqual(['docA', 'docB']);
    });

    test('a fresh log instance never labels growth as a pasted block', async () => {
      await log.recordSnapshot({ docId: 'doc1', title: 'Essay', text: 'x'.repeat(200) });

      // Same storage, new instance — the in-memory reference text is gone (e.g. SPA navigation).
      const freshLog = createProvenanceLog({ storage, now: clock });
      clock.advance(60000);
      await freshLog.recordSnapshot({ docId: 'doc1', title: 'Essay', text: 'x'.repeat(600) });

      const timeline = await freshLog.getTimeline('doc1');
      const latest = timeline[timeline.length - 1];
      expect(latest.deltaChars).toBe(400);
      expect(latest.largestInsertion).toBe(0);
    });
  });

  describe('getTimeline', () => {
    test('returns snapshots ordered oldest to newest', async () => {
      await log.recordSnapshot({ docId: 'doc1', text: 'A'.repeat(10) });
      clock.advance(1000);
      await log.recordSnapshot({ docId: 'doc1', text: 'A'.repeat(60) });
      clock.advance(1000);
      await log.recordSnapshot({ docId: 'doc1', text: 'A'.repeat(120) });

      const timeline = await log.getTimeline('doc1');
      expect(timeline.map((s) => s.length)).toEqual([10, 60, 120]);
      expect(timeline[0].t).toBeLessThan(timeline[1].t);
      expect(timeline[1].t).toBeLessThan(timeline[2].t);
    });

    test('returns an empty array for an unknown document', async () => {
      expect(await log.getTimeline('nope')).toEqual([]);
    });
  });

  describe('caps & eviction', () => {
    test('per-document snapshots are capped at 200, dropping the oldest', async () => {
      for (let i = 1; i <= 205; i++) {
        clock.advance(60000);
        await log.recordSnapshot({ docId: 'doc1', text: 'x'.repeat(i * 40) });
      }

      const timeline = await log.getTimeline('doc1');
      expect(timeline).toHaveLength(200);
      // The first 5 snapshots (iterations 1-5) should have been evicted; the oldest surviving
      // snapshot is from iteration 6, whose text length was 6 * 40 = 240.
      expect(timeline[0].length).toBe(240);
      expect(timeline[timeline.length - 1].length).toBe(205 * 40);
    });

    test('the global doc cap of 50 evicts the least-recently-updated document', async () => {
      for (let i = 1; i <= 51; i++) {
        clock.advance(1000);
        await log.recordSnapshot({ docId: `doc-${i}`, title: `Doc ${i}`, text: 'Hello world' });
      }

      const docs = await log.listDocs();
      expect(docs).toHaveLength(50);
      expect(docs.find((d) => d.docId === 'doc-1')).toBeUndefined();
      expect(docs.find((d) => d.docId === 'doc-51')).toBeDefined();
    });
  });

  describe('listDocs', () => {
    test('summarises each document with a snapshot count, newest-updated first', async () => {
      await log.recordSnapshot({ docId: 'doc1', title: 'First', text: 'Hello' });
      clock.advance(5000);
      await log.recordSnapshot({ docId: 'doc2', title: 'Second', text: 'World' });
      clock.advance(5000);
      await log.recordSnapshot({ docId: 'doc1', title: 'First', text: 'Hello there, this is longer' });

      const docs = await log.listDocs();
      expect(docs).toHaveLength(2);
      expect(docs[0].docId).toBe('doc1'); // most recently updated
      expect(docs[0].snapshots).toBe(2);
      expect(docs[1].docId).toBe('doc2');
      expect(docs[1].snapshots).toBe(1);
    });
  });

  describe('clearDoc / clearAll', () => {
    test('clearDoc removes only the given document and resets its baseline', async () => {
      await log.recordSnapshot({ docId: 'doc1', text: 'Hello' });
      await log.recordSnapshot({ docId: 'doc2', text: 'World' });

      await log.clearDoc('doc1');

      expect(await log.getTimeline('doc1')).toEqual([]);
      expect(await log.getTimeline('doc2')).toHaveLength(1);

      // After clearing, the next snapshot for doc1 is treated as a fresh baseline (always recorded).
      const result = await log.recordSnapshot({ docId: 'doc1', text: 'x' });
      expect(result.recorded).toBe(true);
    });

    test('clearAll wipes every document', async () => {
      await log.recordSnapshot({ docId: 'doc1', text: 'Hello' });
      await log.recordSnapshot({ docId: 'doc2', text: 'World' });

      await log.clearAll();

      expect(await log.listDocs()).toEqual([]);
      expect(await log.getTimeline('doc1')).toEqual([]);
    });
  });

  describe('buildReport', () => {
    test('handles a document with no recorded snapshots gracefully', async () => {
      const report = await log.buildReport('unknown-doc', { title: 'Ghost Essay' });
      expect(report).toContain('Ghost Essay');
      expect(report).toContain('No snapshots have been recorded');
      expectNoBannedWords(report);
    });

    test('includes an honest header stating what the log can and cannot prove', async () => {
      await log.recordSnapshot({ docId: 'doc1', text: 'Hello world' });
      const report = await log.buildReport('doc1', { title: 'My Essay' });

      expect(report).toMatch(/what this log can and cannot show/i);
      expect(report.toLowerCase()).toContain('cannot');
      expect(report.toLowerCase()).toContain('prove who typed');
    });

    test('summarises session count, date span, and steady growth', async () => {
      clock.set(0);
      await log.recordSnapshot({ docId: 'doc1', title: 'My Essay', text: 'A'.repeat(50) });

      clock.advance(5 * 60 * 1000); // +5 min, same session
      await log.recordSnapshot({ docId: 'doc1', text: 'A'.repeat(120) });

      clock.advance(40 * 60 * 1000); // +40 min, new session
      await log.recordSnapshot({ docId: 'doc1', text: 'A'.repeat(200) });

      const report = await log.buildReport('doc1', { title: 'My Essay' });

      expect(report).toContain('Writing sessions recorded: 2');
      expect(report).toContain('Total snapshots: 3');
      expect(report).toContain('Document grew from 50 characters to 200 characters');

      const tableRows = report.match(/\|\s*\d{4}-\d{2}-\d{2}T[\d:.TZ-]*\s*\|/g) || [];
      expect(tableRows).toHaveLength(3);
      expectNoBannedWords(report);
    });

    test('flags a large single insertion neutrally, without accusing the student', async () => {
      const before = 'Intro paragraph. ';
      const after = 'Concluding paragraph.';
      const pasted = 'Q'.repeat(300);

      await log.recordSnapshot({ docId: 'doc1', title: 'My Essay', text: before + after });
      await log.recordSnapshot({ docId: 'doc1', text: before + pasted + after });

      const report = await log.buildReport('doc1', { title: 'My Essay' });

      expect(report).toContain('## Notable large insertions');
      expect(report).toContain('a block of 300 characters appeared at once');
      expect(report).toContain('pasted from your own notes or an editor');
      expectNoBannedWords(report);
    });

    test('says nothing large happened when no big insertions occurred', async () => {
      await log.recordSnapshot({ docId: 'doc1', title: 'My Essay', text: 'A'.repeat(50) });
      await log.recordSnapshot({ docId: 'doc1', text: 'A'.repeat(90) }); // +40 chars, below the 150 flag

      const report = await log.buildReport('doc1', { title: 'My Essay' });
      expect(report).toContain('No unusually large single insertions were recorded.');
      expectNoBannedWords(report);
    });

    test('never uses accusatory language, across every report scenario in this suite', async () => {
      await log.recordSnapshot({ docId: 'doc1', title: 'My Essay', text: 'A'.repeat(50) });
      await log.recordSnapshot({ docId: 'doc1', text: `${'A'.repeat(50)}${'B'.repeat(300)}` });
      const report = await log.buildReport('doc1', { title: 'My Essay' });
      expectNoBannedWords(report);
    });
  });
});
