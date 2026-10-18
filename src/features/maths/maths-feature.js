/**
 * Maths Support — feature orchestration (settings → mounted tools).
 *
 * Maps the `assist_settings.maths` block onto the on-page maths tools for dyscalculic students:
 *   - calculator: the floating calculator + scratchpad FAB (math-calculator.js)
 *   - numberFormat: grouped, screen-reader-correct large numbers (math-format-dom.js), with an
 *     optional place-value colour aid
 * Both tools are lazy chunks — nothing loads until a student actually switches a tool on, so the
 * default (OFF) content-script path is byte-unchanged. Self-initializing via initFeatureSettings,
 * like every other feature module.
 */

import { initFeatureSettings } from '../../content/utils/storage-utils.js';

/** Defaults for `assist_settings.maths` — master toggle opt-in, calculator on once enabled. */
export const MATHS_DEFAULT_SETTINGS = {
  enabled: false,
  calculator: true,
  numberFormat: false,
  placeValue: false,
};

/** id of the injected stylesheet backing the number-format spans. */
export const MATHS_FORMAT_STYLE_ID = 'assist-mathfmt-styles';

/**
 * Reduce a raw settings block to the effective tool state. Sub-toggles only count while the
 * master toggle is on; absent values fall back to the defaults.
 * @param {object|null|undefined} settings
 * @returns {{ calculator: boolean, numberFormat: boolean, placeValue: boolean }}
 */
export function resolveMathsState(settings) {
  const s = { ...MATHS_DEFAULT_SETTINGS, ...(settings || {}) };
  const enabled = s.enabled === true;
  return {
    calculator: enabled && s.calculator !== false,
    numberFormat: enabled && s.numberFormat === true,
    placeValue: s.placeValue === true,
  };
}

/**
 * Stylesheet for the number-format spans. Colour tints are translucent backgrounds UNDER the
 * page's own text (≤ 0.14 alpha), so text contrast is preserved on any host page; forced-colors
 * mode drops the tints entirely (system colours win). Classes come from math-format-dom.js.
 */
function mathsFormatCss() {
  return `
.assist-mathfmt { font-variant-numeric: tabular-nums; border-radius: 3px; }
.assist-mathfmt .assist-mathfmt-group-0 { background: rgba(37, 99, 235, 0.12); }
.assist-mathfmt .assist-mathfmt-group-1 { background: rgba(22, 163, 74, 0.12); }
.assist-mathfmt .assist-mathfmt-group-2 { background: rgba(217, 119, 6, 0.14); }
.assist-mathfmt .assist-mathfmt-group-3 { background: rgba(147, 51, 234, 0.12); }
.assist-mathfmt .assist-mathfmt-group-4 { background: rgba(8, 145, 178, 0.12); }
.assist-mathfmt .assist-mathfmt-group-5 { background: rgba(190, 24, 93, 0.12); }
@media (forced-colors: active) {
  .assist-mathfmt [class^='assist-mathfmt-group'] { background: none; }
}
`;
}

/**
 * Build the applier that converges the page onto a resolved tool state. Loaders are injectable
 * for tests; the real ones are dynamic imports so each tool stays a lazy chunk.
 * @param {{ loadCalculator?: Function, loadFormatter?: Function, doc?: Document }} [deps]
 */
export function createMathsApplier(deps = {}) {
  const {
    loadCalculator = () => import('./math-calculator.js'),
    loadFormatter = () => import('./math-format-dom.js'),
    doc = typeof document !== 'undefined' ? document : null,
  } = deps;

  let state = { calculator: false, numberFormat: false, placeValue: false };
  let calculatorHandle = null;
  // Serialise applies so a rapid toggle flurry can't interleave mounts/unmounts.
  let queue = Promise.resolve();

  function removeFormatStyle() {
    doc.getElementById(MATHS_FORMAT_STYLE_ID)?.remove();
  }

  function injectFormatStyle() {
    if (doc.getElementById(MATHS_FORMAT_STYLE_ID)) {
      return;
    }
    const style = doc.createElement('style');
    style.id = MATHS_FORMAT_STYLE_ID;
    style.textContent = mathsFormatCss();
    (doc.head || doc.documentElement).appendChild(style);
  }

  async function applyCalculator(next) {
    if (next.calculator === state.calculator) {
      return;
    }
    const mod = await loadCalculator();
    if (next.calculator) {
      calculatorHandle = mod.mountMathCalculator();
    } else {
      mod.unmountMathCalculator();
      calculatorHandle = null;
    }
  }

  /**
   * Publish window.assistFeatures.maths while Maths Support is on, so the voice command
   * "open calculator" can open the panel, or tell the student which switch is off.
   */
  function publishEntry(enabled) {
    if (!enabled) {
      delete window.assistFeatures?.maths;
      return;
    }
    const handle = calculatorHandle;
    window.assistFeatures = window.assistFeatures || {};
    window.assistFeatures.maths = handle ? { openCalculator: () => handle.open() } : {};
  }

  async function applyNumberFormat(next) {
    const changed =
      next.numberFormat !== state.numberFormat ||
      (next.numberFormat && next.placeValue !== state.placeValue);
    if (!changed) {
      return;
    }
    const mod = await loadFormatter();
    mod.removeNumberFormatting(doc.body);
    removeFormatStyle();
    if (next.numberFormat) {
      injectFormatStyle();
      mod.applyNumberFormatting(doc.body, { placeValue: next.placeValue });
    }
  }

  async function converge(next, enabled) {
    // Each tool converges independently — one failed lazy chunk must not block the other.
    try {
      await applyCalculator(next);
    } catch (error) {
      console.warn('[Maths] calculator toggle failed:', error?.message);
    }
    try {
      await applyNumberFormat(next);
    } catch (error) {
      console.warn('[Maths] number formatting failed:', error?.message);
    }
    state = { ...next };
    publishEntry(enabled);
  }

  return {
    /** Apply a raw settings block; safe to call repeatedly, never rejects. */
    applySettings(settings) {
      const next = resolveMathsState(settings);
      const enabled = settings?.enabled === true;
      queue = queue.then(() => converge(next, enabled));
      return queue;
    },
    getState: () => ({ ...state }),
  };
}

// ---- self-init (content-script) --------------------------------------------------------------------

if (typeof document !== 'undefined' && globalThis.chrome?.storage?.onChanged?.addListener) {
  const applier = createMathsApplier();
  initFeatureSettings(
    'maths',
    MATHS_DEFAULT_SETTINGS,
    settings => applier.applySettings(settings),
    settings => applier.applySettings(settings)
  );
}
