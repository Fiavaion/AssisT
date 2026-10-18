/**
 * Shared stylesheet for the citation manager UI (library view, citation cards, reassurance panel,
 * verification badge, style switcher, claim-sentinel badge, and the step-rail wizard).
 *
 * Injected as a single idempotent <style> rather than shipped as a .css asset, matching the proven
 * action-tray pattern. This keeps the content-script mount working WITHOUT adding bundled
 * CSS paths to manifest `web_accessible_resources` (a FERPA/least-privilege change boundary we avoid).
 *
 * Design language: a calm, low-arousal, executive-function-friendly surface — generous spacing,
 * line-height >= 1.5, no truncation of meaningful text, never colour alone for meaning (every
 * reassurance state pairs colour with an icon + word). All classes are prefixed `assist-cite-` so
 * they cannot collide with the host LMS page.
 *
 * Accessibility budget baked into the tokens here:
 *   - SC 1.4.3 / 1.4.11 contrast: text + UI tokens meet >= 4.5:1 (>= 3:1 for large/UI) on their bg.
 *   - SC 1.4.12 text spacing: text blocks wrap freely, no fixed heights, no overflow clipping on
 *     reference/preview text.
 *   - SC 2.4.7 / focus: a single high-contrast focus ring token used everywhere.
 *   - prefers-reduced-motion: all transitions/animations disabled.
 *   - forced-colors / prefers-contrast: explicit borders + system colours so the UI survives.
 */

import { Z } from '../../../utils/z-index.js';

const STYLE_ID = 'assist-citation-ui-styles';

/** The full stylesheet as a string (also exported for tests / Storybook-style harnesses). */
export const CITATION_CSS = `
  /* ── Design tokens ─────────────────────────────────────────────────────── */
  .assist-cite-root {
    --ac-surface: #ffffff;
    --ac-surface-sunken: #f3f4f6;
    --ac-surface-raised: #ffffff;
    --ac-text: #1f2937;
    --ac-text-muted: #4b5563;
    --ac-border: #d1d5db;
    --ac-border-strong: #9ca3af;
    --ac-accent: #2563eb;
    --ac-accent-text: #ffffff;
    --ac-focus: #2563eb;

    /* Reassurance states — colour is ALWAYS paired with an icon + word in markup. */
    --ac-green-bg: #dcfce7;
    --ac-green-text: #14532d;
    --ac-green-border: #16a34a;
    --ac-amber-bg: #fef3c7;
    --ac-amber-text: #7c4a03;
    --ac-amber-border: #d97706;
    --ac-red-bg: #fee2e2;
    --ac-red-text: #991b1b;
    --ac-red-border: #dc2626;

    --ac-radius: 10px;
    --ac-radius-sm: 6px;
    --ac-gap: 12px;
    --ac-pad: 16px;
    --ac-font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;

    box-sizing: border-box;
    font-family: var(--ac-font);
    color: var(--ac-text);
    line-height: 1.6;
    font-size: 14px;
  }
  .assist-cite-root *,
  .assist-cite-root *::before,
  .assist-cite-root *::after {
    box-sizing: border-box;
  }

  /* ── Shared button ─────────────────────────────────────────────────────── */
  .assist-cite-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 8px 14px;
    border: 1px solid var(--ac-border-strong);
    border-radius: var(--ac-radius-sm);
    background: var(--ac-surface-raised);
    color: var(--ac-text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .assist-cite-btn:hover { background: var(--ac-surface-sunken); }
  .assist-cite-btn--primary {
    background: var(--ac-accent);
    color: var(--ac-accent-text);
    border-color: var(--ac-accent);
  }
  .assist-cite-btn--primary:hover { background: #1d4ed8; }
  .assist-cite-btn--ghost { border-color: transparent; background: transparent; }
  .assist-cite-btn--ghost:hover { background: var(--ac-surface-sunken); }
  .assist-cite-btn:disabled { opacity: 0.55; cursor: not-allowed; }

  /* Visible keyboard focus everywhere (SC 2.4.7). */
  .assist-cite-root :focus-visible {
    outline: 3px solid var(--ac-focus);
    outline-offset: 2px;
    border-radius: 3px;
  }

  /* Visually-hidden but screen-reader available. */
  .assist-cite-sr-only {
    position: absolute !important;
    width: 1px; height: 1px;
    padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0);
    white-space: nowrap; border: 0;
  }

  /* ── Library view shell ────────────────────────────────────────────────── */
  .assist-cite-library {
    display: flex;
    flex-direction: column;
    gap: var(--ac-gap);
    background: var(--ac-surface);
    color: var(--ac-text);
    padding: var(--ac-pad);
    max-width: 720px;
  }
  /* The hidden attribute has to WIN. A class selector outranks the browser's own [hidden] rule, so
     any flex container below (the toolbar, the trash panel, the list) would stay on screen after
     setting el.hidden without this. Scoped to the citation root so the host page is untouched. */
  .assist-cite-root[hidden],
  .assist-cite-root [hidden] {
    display: none !important;
  }
  .assist-cite-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ac-gap);
  }
  .assist-cite-toolbar__search {
    flex: 1 1 220px;
    min-width: 0;
    min-height: 40px;
    padding: 8px 12px;
    border: 1px solid var(--ac-border-strong);
    border-radius: var(--ac-radius-sm);
    font: inherit;
  }
  /* "Select all shown" — the head of the multi-select, in the toolbar. */
  .assist-cite-toolbar__selectall {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  /* Every selection checkbox is a 24px target (SC 2.5.8), toolbar and card alike. */
  .assist-cite-toolbar__selectall-box,
  .assist-cite-card__select {
    width: 24px;
    height: 24px;
    margin: 0;
    flex: 0 0 auto;
    accent-color: var(--ac-accent);
  }

  /* ── The selection bar ─────────────────────────────────────────────────── */
  /* Appears between the toolbar and the list once anything is ticked, and acts on the whole
     selection. Hidden (not removed) so the live count keeps its place in the DOM. */
  .assist-cite-selectbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--ac-surface-sunken);
    border: 1px solid var(--ac-border-strong);
    border-radius: var(--ac-radius);
  }
  .assist-cite-selectbar__count {
    margin: 0;
    font-weight: 700;
  }
  .assist-cite-selectbar__filelabel,
  .assist-cite-selectbar__exportlabel {
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .assist-cite-empty {
    padding: 24px;
    text-align: center;
    color: var(--ac-text-muted);
    background: var(--ac-surface-sunken);
    border-radius: var(--ac-radius);
  }

  /* ── Recently removed (the trash) ──────────────────────────────────────── */
  /* Takes the toolbar's place, so the library's search/sort/style controls are not offered for a
     list of things that are on their way out. */
  .assist-cite-trash {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    background: var(--ac-surface-sunken);
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius);
  }
  .assist-cite-trash__heading {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
  }
  .assist-cite-trash__note {
    margin: 0;
    color: var(--ac-text-muted);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .assist-cite-trash__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* ── Citation list ─────────────────────────────────────────────────────── */
  .assist-cite-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ── Citation card ─────────────────────────────────────────────────────── */
  .assist-cite-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    background: var(--ac-surface-raised);
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius);
  }
  .assist-cite-card__head {
    display: flex;
    align-items: flex-start;
    /* The selection checkbox leads the head, so the title sits beside it rather than being
       pushed to the far edge by a space-between. */
    justify-content: flex-start;
    gap: 10px;
  }
  .assist-cite-card__title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    /* No clamping — Text-Spacing (SC 1.4.12) must not truncate the title. */
    overflow-wrap: anywhere;
  }
  .assist-cite-card__meta {
    margin: 0;
    color: var(--ac-text-muted);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .assist-cite-card__reference {
    margin: 0;
    padding: 10px 12px;
    background: var(--ac-surface-sunken);
    border-radius: var(--ac-radius-sm);
    /* Reference text is one freely-wrapping block — never a fixed-height clipped box. */
    white-space: normal;
    overflow-wrap: anywhere;
  }
  /* ── "Check your essay" panel ─────────────────────────────────────────── */
  .assist-cite-refcheck {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: min(560px, 80vw);
  }
  .assist-cite-refcheck__text {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
  }
  .assist-cite-refcheck__results {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .assist-cite-refcheck__line {
    margin: 0;
    padding: 8px 12px;
    border-radius: var(--ac-radius-sm);
    background: var(--ac-surface-sunken);
  }
  .assist-cite-refcheck__line--good {
    border-left: 3px solid #15803d;
  }
  .assist-cite-refcheck__line--attention {
    border-left: 3px solid #b45309;
  }
  .assist-cite-refcheck__line--info {
    border-left: 3px solid var(--ac-border-strong);
  }

  /* Reading capture: the source's exact words, always visibly flagged as a quote (attribution
     firewall), plus the student's own one-line note. */
  .assist-cite-card__quotewrap {
    margin: 0;
  }
  .assist-cite-card__quotelabel {
    margin: 0 0 2px;
    color: var(--ac-text-muted);
    font-size: 12px;
  }
  .assist-cite-card__quote {
    margin: 0;
    padding: 8px 12px;
    border-left: 3px solid var(--ac-border-strong);
    background: var(--ac-surface-sunken);
    border-radius: 0 var(--ac-radius-sm) var(--ac-radius-sm) 0;
    overflow-wrap: anywhere;
  }
  .assist-cite-card__note {
    margin: 0;
    color: var(--ac-text-muted);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .assist-cite-card__badges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .assist-cite-card__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* Filing a saved source into a collection, from the card itself. Wraps rather than shrinks, so
     it survives 200% zoom and increased text spacing (SC 1.4.4 / 1.4.12). */
  .assist-cite-card__collection {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .assist-cite-card__collection-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--ac-text-muted);
  }
  .assist-cite-card__collection-select {
    min-height: 44px;
    max-width: 100%;
  }

  /* ── Reassurance panel + state chips (icon + word + colour) ────────────── */
  .assist-cite-reassure {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid var(--ac-border);
    border-left-width: 6px;
    border-radius: var(--ac-radius);
    background: var(--ac-surface-raised);
  }
  .assist-cite-reassure--green { border-left-color: var(--ac-green-border); background: var(--ac-green-bg); color: var(--ac-green-text); }
  .assist-cite-reassure--amber { border-left-color: var(--ac-amber-border); background: var(--ac-amber-bg); color: var(--ac-amber-text); }
  .assist-cite-reassure--red   { border-left-color: var(--ac-red-border);   background: var(--ac-red-bg);   color: var(--ac-red-text); }
  .assist-cite-reassure__head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
  }
  .assist-cite-reassure__icon { font-size: 18px; line-height: 1; }
  .assist-cite-reassure__list { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
  .assist-cite-reassure__fix {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 2px 0;
    color: inherit;
    font: inherit;
    font-weight: 700;
    text-decoration: underline;
    cursor: pointer;
  }

  /* Small inline state chip (used on cards) — colour + icon + word. */
  .assist-cite-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    border: 1px solid currentColor;
  }
  .assist-cite-chip--green { background: var(--ac-green-bg); color: var(--ac-green-text); }
  .assist-cite-chip--amber { background: var(--ac-amber-bg); color: var(--ac-amber-text); }
  .assist-cite-chip--red   { background: var(--ac-red-bg);   color: var(--ac-red-text); }

  /* ── Verification badge ────────────────────────────────────────────────── */
  .assist-cite-verify {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    border: 1px solid var(--ac-border-strong);
    background: var(--ac-surface-sunken);
    color: var(--ac-text-muted);
    cursor: pointer;
  }
  .assist-cite-verify--locked {
    background: #e0e7ff;
    color: #3730a3;
    border-color: #6366f1;
  }
  .assist-cite-verify__icon { font-size: 13px; line-height: 1; }

  /* ── Claim-sentinel badge (M7 AI; 4-state; rendered only when AI is available) ── */
  .assist-cite-sentinel {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    border: 1px solid var(--ac-border-strong);
    background: var(--ac-surface-sunken);
    color: var(--ac-text-muted);
  }
  .assist-cite-sentinel__icon { font-size: 13px; line-height: 1; }
  .assist-cite-sentinel--checking   { background: #e0e7ff; color: #3730a3; border-color: #6366f1; }
  .assist-cite-sentinel--supported  { background: var(--ac-green-bg); color: var(--ac-green-text); border-color: var(--ac-green-border); }
  .assist-cite-sentinel--unsupported{ background: var(--ac-red-bg);   color: var(--ac-red-text);   border-color: var(--ac-red-border); }

  /* ── AI analysis (optional; on-demand educational source assessment) ────── */
  .assist-cite-btn--ai { border-color: #6366f1; color: #3730a3; }
  .assist-cite-btn--ai:hover { background: #e0e7ff; }
  .assist-cite-card__analysis {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid var(--ac-border);
    border-left-width: 6px;
    border-left-color: #6366f1;
    border-radius: var(--ac-radius);
    background: var(--ac-surface-sunken);
  }
  .assist-cite-card__analysis-summary { margin: 0; overflow-wrap: anywhere; }
  .assist-cite-card__analysis-list {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* ── Style switcher (radiogroup + live preview) ────────────────────────── */
  .assist-cite-switcher { display: flex; flex-direction: column; gap: 10px; }
  .assist-cite-switcher__options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .assist-cite-switcher__option {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    min-height: 40px;
    border: 1px solid var(--ac-border-strong);
    border-radius: var(--ac-radius-sm);
    background: var(--ac-surface-raised);
    /* Explicit colour + font so host-page button styles can't leak in (some sites set white
       button text, which made these labels invisible on the light option background). */
    color: var(--ac-text);
    font: inherit;
    cursor: pointer;
  }
  .assist-cite-switcher__option[aria-checked="true"] {
    border-color: var(--ac-accent);
    background: #eff6ff;
    color: var(--ac-text);
    box-shadow: inset 0 0 0 1px var(--ac-accent);
  }
  .assist-cite-switcher__preview {
    margin: 0;
    padding: 12px 14px;
    background: var(--ac-surface-sunken);
    border-radius: var(--ac-radius-sm);
    /* One wrapping block — Text-Spacing must never clip the formatted reference. */
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.7;
  }
  .assist-cite-switcher__diff {
    font-weight: 700;
    color: var(--ac-amber-text);
    background: var(--ac-amber-bg);
    border-radius: 3px;
    padding: 0 2px;
  }

  /* ── Step-rail wizard ──────────────────────────────────────────────────── */
  .assist-cite-wizard {
    display: flex;
    flex-direction: column;
    gap: var(--ac-gap);
    background: var(--ac-surface);
    padding: var(--ac-pad);
    max-width: 560px;
  }
  .assist-cite-wizard__provenance {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .assist-cite-wizard__provenance-text { margin: 0; }
  .assist-cite-breadcrumb {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .assist-cite-breadcrumb__step {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    border: 1px solid var(--ac-border);
    color: var(--ac-text-muted);
    background: var(--ac-surface-sunken);
  }
  .assist-cite-breadcrumb__step--current {
    border-color: var(--ac-accent);
    color: var(--ac-accent);
    background: #eff6ff;
  }
  .assist-cite-breadcrumb__step--done {
    border-color: var(--ac-green-border);
    color: var(--ac-green-text);
    background: var(--ac-green-bg);
  }
  .assist-cite-step { display: flex; flex-direction: column; gap: 10px; }
  .assist-cite-step__legend { margin: 0; font-size: 18px; font-weight: 700; }
  .assist-cite-step__help { margin: 0; color: var(--ac-text-muted); }
  .assist-cite-step__field {
    width: 100%;
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid var(--ac-border-strong);
    border-radius: var(--ac-radius-sm);
    font: inherit;
  }
  /* A problem is always said in words (never colour alone); the colour only makes it easy to find. */
  .assist-cite-step__error {
    margin: 0;
    font-weight: 600;
    color: var(--ac-red-text);
  }
  /* "Which authors are organisations?" — one checkbox per author under the authors box. No fixed
     heights, so a student's own line and letter spacing (SC 1.4.12) never clips a long name. */
  .assist-cite-step__organisations {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 4px 0 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  .assist-cite-step__organisations[hidden] { display: none; }
  .assist-cite-step__organisation {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .assist-cite-step__organisation input {
    width: 24px;
    height: 24px;
    margin: 0;
    flex: 0 0 auto;
    accent-color: var(--ac-accent);
  }
  .assist-cite-step__organisation label { overflow-wrap: anywhere; }
  .assist-cite-wizard__problems {
    padding: 8px 10px;
    border: 1px solid var(--ac-red-border);
    border-radius: var(--ac-radius-sm);
    background: var(--ac-red-bg);
  }
  .assist-cite-step__nav {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
  }

  /* ── Capture bar (in-page entry points) ────────────────────────────────── */
  /* Placement comes from the shared corner rail - see src/utils/corner-slots.js. */
  .assist-cite-capture-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px;
    background: var(--ac-surface);
    border: 1px solid var(--ac-border);
    border-radius: var(--ac-radius);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  }
  /* Voice capture's status line, on its own row under the buttons. */
  .assist-cite-capture-status {
    flex: 1 0 100%;
    max-width: 22em;
    margin: 0;
    color: var(--ac-text);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  /* Empty, it stays in the accessibility tree (so its first message is announced) but takes no
     room on screen. */
  .assist-cite-capture-status:empty {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  /* ── Modal overlay (content-script host for the library + wizard) ───────── */
  .assist-cite-overlay-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(17, 24, 39, 0.55);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 5vh 16px;
    overflow: auto;
  }
  .assist-cite-overlay-dialog {
    background: var(--ac-surface);
    color: var(--ac-text);
    border-radius: var(--ac-radius);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
    max-width: 760px;
    width: 100%;
    max-height: 90vh;
    overflow: auto;
  }

  /* ── Reduced motion ────────────────────────────────────────────────────── */
  @media (prefers-reduced-motion: reduce) {
    .assist-cite-root * {
      transition: none !important;
      animation: none !important;
    }
  }

  /* ── High contrast / forced colours ────────────────────────────────────── */
  @media (prefers-contrast: more) {
    .assist-cite-card,
    .assist-cite-reassure,
    .assist-cite-card__analysis,
    .assist-cite-btn { border-width: 2px; }
  }
  @media (forced-colors: active) {
    .assist-cite-card,
    .assist-cite-reassure,
    .assist-cite-chip,
    .assist-cite-verify,
    .assist-cite-btn,
    .assist-cite-switcher__option,
    .assist-cite-breadcrumb__step,
    .assist-cite-card__collection-select {
      border: 1px solid CanvasText;
    }
    .assist-cite-switcher__option[aria-checked="true"] { outline: 2px solid Highlight; }
    .assist-cite-switcher__diff { color: Highlight; background: Canvas; }
  }

  /* First-run migration prompt */
  .assist-cite-migration { max-width: 32rem; }
  .assist-cite-migration__title { margin: 0 0 0.5rem; font-size: 1.15rem; }
  .assist-cite-migration__intro { margin: 0 0 0.75rem; }
  .assist-cite-migration__note { font-size: 0.9rem; opacity: 0.85; margin: 0.75rem 0 0; }
  .assist-cite-migration__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1rem;
  }
`;

/**
 * Inject the citation UI stylesheet once. Idempotent and safe to call before every mount.
 * No-op when there is no document (e.g. service worker).
 * @param {Document} [doc=document]
 */
export function injectCitationStyles(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) {
    return;
  }
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  // z-index tokens live in JS; surface them as CSS vars so components can reference layer values.
  style.textContent = `:root{--ac-z-controls:${Z.CONTROLS};--ac-z-modal:${Z.MODAL};--ac-z-toast:${Z.TOAST};}\n${CITATION_CSS}`;
  doc.head.appendChild(style);
}

export default { CITATION_CSS, injectCitationStyles };
