/**
 * Admissions to the console privacy gate.
 *
 * The key is `<file relative to src/>:<identifier>`; the value is why that value is safe to print,
 * written so someone else can check it. A reason under thirty characters fails the gate on its own,
 * and an entry that no longer matches anything fails it too — so this file cannot rot.
 *
 * An entry is a claim that the value cannot contain a student's words. It is never a way to make a
 * red run green: if the value can carry page text, a transcript, an essay or an AI answer, log a
 * measurement instead, or put the value behind `debugLog()` from `src/utils/debug-log.js`.
 *
 * Entries opening with DEFECT are leaks we have not fixed yet, recorded rather than hidden.
 */
module.exports = {
  'background/service-worker.js:contentScriptPath':
    "The extension's own bundled script path, read out of our own manifest. Nothing of the student's is in it.",

  'background/service-worker.js:errorText':
    'The error body the local Ollama server returns — its own diagnostic string ("model not found", "out of memory"), not the prompt it was sent. It is the only thing that tells one local-model failure from another.',

  'background/service-worker.js:url':
    "The URL a message asked us to open or fetch, printed only on the security warning that refuses it. It is the student's browsing, so it is a disclosure; it is kept because a refusal nobody can read is a refusal nobody can debug.",

  'features/magnifyingLens/magnifying-lens.js:settings':
    "The lens's own module settings — its zoom, size, shape and on/off flags. No page text, no credential and nothing the student typed passes through this object.",
};
