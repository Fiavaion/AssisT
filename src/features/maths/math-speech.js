/**
 * Equation text-to-speech via the Speech Rule Engine (SRE), bundled and fully offline.
 *
 * WHY this exists: the TTS read path extracts text with `innerText`/`textContent`, which flattens an
 * equation to character soup (MathML `x²+1` → "x21") or skips display math entirely. This module
 * turns MathML into a spoken-language string ("x squared plus 1") so equations read correctly.
 *
 * OFFLINE + CSP-safe: SRE is configured with `mode:'sync'` and a `custom` loader that returns the
 * locale JSON we bundle (base + en). That eliminates every runtime XHR/fetch SRE would otherwise make
 * for its "mathmaps", so no `connect-src`, no `web_accessible_resources`, and `script-src 'self'`
 * are all untouched. (Verified: SRE 4.x requests exactly the `base` and `en` locales.)
 *
 * LAZY: this module — and therefore the SRE bundle + locale JSON — is only imported by the read path
 * when a page actually contains math, mirroring the Tesseract/WebLLM lazy-load pattern.
 *
 * LICENSING: speech-rule-engine is Apache-2.0 (see THIRD-PARTY-NOTICES.md).
 */

import baseMap from 'speech-rule-engine/lib/mathmaps/base.json';
import enMap from 'speech-rule-engine/lib/mathmaps/en.json';
import { collectReadableSegments, hasMath } from './math-dom.js';

/** Bundled locale data, stringified as SRE's custom loader expects (locale name → JSON string). */
const LOCALES = { base: JSON.stringify(baseMap), en: JSON.stringify(enMap) };

let enginePromise = null;

/**
 * Initialise SRE once, in synchronous/offline mode (locales served from the bundle, no network).
 * Idempotent — subsequent calls return the same ready engine.
 * @returns {Promise<Object>} the configured SRE module
 */
export async function initMathSpeech() {
  if (enginePromise) {
    return enginePromise;
  }
  enginePromise = (async () => {
    const mod = await import('speech-rule-engine');
    // CJS/ESM interop: the functions may be top-level named exports or under `default`.
    const SRE = mod && typeof mod.setupEngine === 'function' ? mod : mod.default || mod;
    SRE.setupEngine({
      mode: 'sync',
      custom: name => Promise.resolve(LOCALES[name] || '{}'),
      domain: 'mathspeak',
      style: 'default',
      locale: 'en',
    });
    await SRE.engineReady();
    return SRE;
  })();
  return enginePromise;
}

/**
 * Convert a MathML string to a spoken-language string. Returns '' on any failure so a caller can
 * fall back gracefully.
 * @param {string} mathml
 * @returns {Promise<string>}
 */
export async function mathmlToSpeech(mathml) {
  const src = String(mathml || '').trim();
  if (!src) {
    return '';
  }
  try {
    const SRE = await initMathSpeech();
    return (SRE.toSpeech(src) || '').trim();
  } catch {
    return '';
  }
}

/**
 * Build a spoken-text string for a page subtree, replacing each equation with its spoken form.
 * Returns `null` when the subtree contains no math, so the caller keeps its normal read path
 * byte-for-byte unchanged on the (common) no-math case.
 * @param {Element} root
 * @param {(mathml: string) => Promise<string>} [convert] injectable converter (for testing)
 * @returns {Promise<string|null>}
 */
export async function buildReadableText(root, convert = mathmlToSpeech) {
  if (!hasMath(root)) {
    return null;
  }
  const segments = collectReadableSegments(root);
  const parts = [];
  for (const seg of segments) {
    if (seg.text) {
      parts.push(seg.text);
    } else if ('math' in seg) {
      let spoken = '';
      if (seg.math) {
        try {
          spoken = (await convert(seg.math)) || '';
        } catch {
          spoken = '';
        }
      }
      spoken = spoken || seg.fallback || '';
      if (spoken) {
        parts.push(spoken);
      }
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export default { initMathSpeech, mathmlToSpeech, buildReadableText };
