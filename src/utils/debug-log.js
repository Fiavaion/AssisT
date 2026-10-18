/**
 * The one switch that lets a developer see a student's own words.
 *
 * AssisT handles coursework, dictation and AI answers about a student's essay. All of it is FERPA
 * data, and the browser console is the least private place it could land: it sits on the screen in
 * a shared lab, and it is what gets pasted whole into a bug report. Production code therefore logs
 * measurements — a length, a type, a count, an elapsed time, an id — and never the content.
 *
 * When the content itself is genuinely needed to reproduce a bug, it goes through `debugLog()`,
 * which is silent unless the student has turned on Settings → Preferences → Debug mode
 * (`assist_settings.appearance.debug_mode`). That is the existing switch; there is deliberately no
 * second one.
 *
 * The flag is read once and then kept current from `chrome.storage.onChanged`, so `debugLog()` can
 * stay synchronous and be called from a hot path. Realms without `chrome.storage` — the offscreen
 * document has only `runtime` — simply never turn it on, which is the safe answer.
 */

let enabled = false;

/** Reads the stored flag, and keeps it current. Failures leave debug logging off. */
function watchFlag() {
  const storage = globalThis.chrome?.storage;
  if (!storage?.local?.get) {
    return;
  }
  try {
    storage.local.get('assist_settings', result => {
      if (globalThis.chrome?.runtime?.lastError) {
        return;
      }
      enabled = result?.assist_settings?.appearance?.debug_mode === true;
    });
    storage.onChanged?.addListener?.((changes, area) => {
      if (area !== 'local' || !changes.assist_settings) {
        return;
      }
      enabled = changes.assist_settings.newValue?.appearance?.debug_mode === true;
    });
  } catch {
    enabled = false;
  }
}

watchFlag();

/** True when the student has switched debug mode on for this browser. */
export function isDebugLoggingEnabled() {
  return enabled;
}

/**
 * Logs only while debug mode is on. Use it for the values that would otherwise be redacted —
 * transcripts, page text, prompts, AI answers — and plain `console.*` for everything else.
 */
export function debugLog(...args) {
  if (enabled) {
    console.log(...args);
  }
}

/** Test seam: sets the cached flag directly, so a suite need not fake chrome.storage. */
export function setDebugLoggingForTests(value) {
  enabled = value === true;
}
