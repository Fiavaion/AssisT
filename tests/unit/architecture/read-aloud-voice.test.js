/**
 * Every read-aloud path takes its voice and its numbers from `src/utils/speech-voice.js`.
 *
 * There are many separate speech paths in this codebase (the consolidation is logged in
 * TECHNICAL_DEBT.md). Before this gate, four of them preferred "Google UK English Female" by name,
 * which on desktop Chrome is a network voice, and several turned a saved volume of 0 into 1 with
 * `|| 1.0`. One shared rule for the default voice only holds if no path grows its own again, so
 * this reads the source: a file that speaks must import the helper, and no file may
 * pick a voice by a vendor's name.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../../src');
const HELPER = 'utils/speech-voice.js';

/**
 * Speech paths this gate does not yet cover, with the reason. An entry that stops matching fails.
 * @type {Record<string, string>}
 */
const NOT_YET_COVERED = {};

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = sourceFiles(SRC).map(file => ({
  rel: path.relative(SRC, file).split(path.sep).join('/'),
  text: fs.readFileSync(file, 'utf8'),
}));

/** Comments may name a voice to explain history; code may not. */
const withoutComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** A file that hands anything to the speech engine, or builds an utterance itself. */
const SPEAKS = /\b(?:speechSynthesis|synth)\.speak\(|new\s+(?:window\.)?SpeechSynthesisUtterance\b/;

const speakers = files.filter(file => file.rel !== HELPER && SPEAKS.test(file.text));

test('the gate is looking at the speech paths, not at nothing', () => {
  expect(speakers.length).toBeGreaterThanOrEqual(8);
});

test.each(speakers.map(file => [file.rel, file]))(
  '%s takes its voice from the shared helper',
  (rel, file) => {
    if (NOT_YET_COVERED[rel]) {
      return;
    }
    expect(file.text).toMatch(/from\s+['"][./]*(?:utils\/)?speech-voice\.js['"]/);
  }
);

/**
 * Files that name a vendor voice without choosing it, with the reason. The settings migration names
 * the one voice an earlier popup saved for every student, in order to reset it to the automatic
 * choice; it never selects a voice.
 */
const NAMES_A_VOICE_TO_UNDO_IT = new Set(['utils/settings-migrations.js']);

test('no code picks a voice by a vendor name', () => {
  const offenders = files
    .filter(file =>
      /name\.includes\(['"](?:Google|Microsoft)['"]\)|Google UK/.test(withoutComments(file.text))
    )
    .filter(file => file.rel !== HELPER && !NAMES_A_VOICE_TO_UNDO_IT.has(file.rel))
    .map(file => file.rel);
  expect(offenders).toEqual([]);
});

test('no read-aloud path turns a saved volume of 0 into full volume', () => {
  const offenders = files
    .filter(file => /\.volume\s*\|\|\s*1/.test(withoutComments(file.text)))
    .map(file => file.rel);
  expect(offenders).toEqual([]);
});

test('every allowance still names a file that speaks', () => {
  Object.keys(NOT_YET_COVERED).forEach(rel => {
    expect(speakers.map(file => file.rel)).toContain(rel);
  });
});
