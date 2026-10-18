/**
 * The shape of a tool in the popup's registry.
 *
 * The popup has never had a list of its own tools. Each feature's icon, label, description and
 * sub-controls are hand-written into a fixed position in popup.html, and popup.js binds to those
 * element ids one at a time. Every surface that needs to answer "what tools exist, and which are
 * switched on?" has therefore had to re-derive the answer — the Console reads it back out of the
 * rendered DOM, the hide-unused filter walks the same DOM again, the discovery quiz keeps its own
 * list. This module is the schema for saying it once.
 *
 * It is deliberately only a schema and a validator. The data lives per section (see `tools/`), and
 * rendering lives elsewhere: a registry that knew how to draw itself would be the monolith again.
 *
 * ABOUT `keywords`. Every tool carries a plain space-separated string of them, and it is the whole
 * semantic layer of the Flat view's search (`popup/flat/flat-search.js`) — there is no model and no
 * AI behind it, so a support is only findable by the words written there. They are therefore written
 * in the language a student uses about a PROBLEM, not about a product: "the words move", "too
 * bright", "lose my place", "cant type". Multi-word phrases are fine; the search tokenises them.
 * Left unvalidated on purpose — a missing keyword is a discoverability gap, not a broken tool.
 */

/** The five groups the Flat view arranges tools into. Sections stay as they are in popup.html. */
export const GROUPS = ['Reading', 'Writing', 'Seeing', 'Focus', 'Study'];

/**
 * The `section` of a tool that belongs to no accordion section.
 *
 * `section` is the shipped accordion identity — the `data-section` block in popup.html that
 * `ui_visibility` and the current popup are built around — and for every tool but one that is the
 * whole story. It is not the whole of popup.html: Show Text Stats is drawn above `<main>`, in the
 * popup's own chrome, inside no `data-section` at all. Saying so is the honest declaration, and it
 * keeps the two axes doing one job each — `section` says WHERE in popup.html a tool is drawn,
 * `surface` (below) says WHETHER its markup is in that file at all.
 *
 * There is no `data-section="unsectioned"` block and there must never be one: this value means the
 * absence of a section, not another one. It is deliberately excluded from `SECTIONS`, so the
 * per-section drift checks and `isComplete()` behave for every sectioned tool exactly as before.
 */
export const UNSECTIONED = 'unsectioned';

/**
 * Where a piece of state lives.
 *  - `settings`: a path inside `assist_settings`, which is what almost everything uses.
 *  - `local`: a top-level chrome.storage.local key. AI Assist is the one tool that works this way
 *    (`aiMode`), which is why it has no `-enabled` checkbox for the DOM scrapers to find.
 */
const STORES = ['settings', 'local'];

/**
 * Where a control is drawn today.
 *
 *  - `popup`: static markup in popup.html — the default, and the only surface the drift test can
 *    hold the registry to.
 *  - `advanced`: built by popup.js as innerHTML when the Advanced Options modal opens. Just as real
 *    to the student, and invisible to a test that reads popup.html. Declaring these keeps the
 *    registry a description of the popup rather than of one file, and stops a view showing a
 *    switched-on tool with nothing under it.
 */
const SURFACES = ['popup', 'advanced'];

/**
 * Control types the generic renderer will understand.
 *
 * `chips` is a multi-select drawn as a row of toggle buttons, each writing its membership of one
 * array (the STT vocabulary presets). It is not a select: several may be on at once, and each chip
 * is its own button with its own id.
 */
const CONTROL_TYPES = ['switch', 'range', 'select', 'radio', 'chips'];

const isNonEmptyString = value => typeof value === 'string' && value.trim() !== '';

/**
 * The further keys a declaration writes alongside its own path, each with the store it lands in.
 *
 * A mirror is usually another path in the same store, so it may be written as a bare string. Show
 * Text Stats needs the other form: its one switch also writes two top-level chrome.storage.local
 * keys, because that is how the content script hears about the change. Those are objects —
 * `{ store: 'local', path: 'textStatsBadgeVisible' }` — so a writer built from this file sets
 * everything the popup's own handler sets, rather than half of it.
 *
 * @param {{store?:string, alsoWrites?:Array<string|{store?:string, path:string}>}} declaration
 * @returns {Array<{store:string, path:string}>}
 */
export function mirrorTargets(declaration) {
  const mirrors = (declaration && declaration.alsoWrites) || [];
  return mirrors.map(mirror =>
    isNonEmptyString(mirror)
      ? { store: declaration.store || 'settings', path: mirror }
      : { store: mirror.store || declaration.store || 'settings', path: mirror.path }
  );
}

/**
 * Check the further paths a control — or a tool's own switch — writes alongside its own.
 *
 * Two things in the popup are a single switch over more than one setting: the STT punctuation
 * checkbox writes `punctuationCommands` and `autoPunctuation`, and the Show Text Stats bar writes
 * the text-stats badge and notification keys together. Declaring the mirrors beats a comment
 * nobody reads, and holding tool state and controls to the same rule keeps it one idea.
 *
 * @param {string} where - the control or tool the mirrors belong to, for the message
 * @param {*} alsoWrites
 * @returns {string[]}
 */
function mirrorProblems(where, alsoWrites) {
  if (alsoWrites === undefined) {
    return [];
  }
  const mirrors = Array.isArray(alsoWrites) ? alsoWrites : [];
  const wellFormed = mirror =>
    isNonEmptyString(mirror) ||
    (mirror !== null &&
      typeof mirror === 'object' &&
      isNonEmptyString(mirror.path) &&
      (mirror.store === undefined || STORES.includes(mirror.store)));
  if (mirrors.length === 0 || !mirrors.every(wellFormed)) {
    return [`${where}: alsoWrites must be a non-empty array of paths, or {store, path}`];
  }
  return [];
}

/**
 * Check one control.
 * @param {Object} control
 * @returns {string[]} problems, empty when the control is well-formed
 */
export function validateControl(control) {
  const problems = [];
  if (!control || typeof control !== 'object') {
    return ['control: not an object'];
  }
  const where = control.id || control.label || 'control';

  if (!CONTROL_TYPES.includes(control.type)) {
    problems.push(`${where}: type must be one of ${CONTROL_TYPES.join(', ')}`);
  }
  if (!isNonEmptyString(control.id)) {
    problems.push(`${where}: id is required`);
  }
  if (!isNonEmptyString(control.label)) {
    problems.push(`${where}: label is required`);
  }
  if (!isNonEmptyString(control.path)) {
    problems.push(`${where}: path is required`);
  }
  // Controls live in `assist_settings` unless they say otherwise. AI Assist's mode radios are the
  // exception — they write the top-level `aiMode` key.
  if (control.store !== undefined && !STORES.includes(control.store)) {
    problems.push(`${where}: store must be one of ${STORES.join(', ')}`);
  }
  if (control.surface !== undefined && !SURFACES.includes(control.surface)) {
    problems.push(`${where}: surface must be one of ${SURFACES.join(', ')}`);
  }

  if (control.type === 'range') {
    if (typeof control.min !== 'number' || typeof control.max !== 'number') {
      problems.push(`${where}: a range needs a numeric min and max`);
    }
    if (typeof control.step !== 'number') {
      problems.push(`${where}: a range needs a step`);
    }
  }

  // Speed presets: buttons that set the slider to one value each. They only make sense on a
  // slider, and only at values the slider itself can reach.
  if (control.presets !== undefined) {
    const presets = Array.isArray(control.presets) ? control.presets : [];
    const reachable = value =>
      typeof value === 'number' && value >= control.min && value <= control.max;
    if (control.type !== 'range' || presets.length === 0 || !presets.every(reachable)) {
      problems.push(`${where}: presets must be values a range can reach`);
    }
  }

  if (control.type === 'select') {
    const hasStaticOptions = Array.isArray(control.options) && control.options.length > 0;
    // Voices are enumerated by the speech engine at runtime, so a select may name its source
    // instead of listing options here.
    if (!hasStaticOptions && !isNonEmptyString(control.optionsFrom)) {
      problems.push(`${where}: a select needs options or an optionsFrom source`);
    }
  }

  if (control.type === 'chips') {
    const options = Array.isArray(control.options) ? control.options : [];
    if (options.length === 0) {
      problems.push(`${where}: a chip group needs options`);
    }
    options.forEach(option => {
      if (!isNonEmptyString(option.id) || !isNonEmptyString(option.label)) {
        problems.push(`${where}: every chip needs its own element id and a label`);
      }
      if (option.value === undefined) {
        problems.push(`${where}: every chip needs the value it adds to the array`);
      }
    });
  }

  if (control.type === 'radio') {
    if (!isNonEmptyString(control.group)) {
      problems.push(`${where}: a radio needs the group (input name) it belongs to`);
    }
    // Most radio groups store one value. Dyslexia Mode's variant is stored as three parallel
    // booleans instead, so an option may declare the sub-keys it writes rather than a scalar.
    const writesFlags = control.writes && typeof control.writes === 'object';
    if (control.value === undefined && !writesFlags) {
      problems.push(`${where}: a radio needs the value it selects, or a writes map`);
    }
  }

  problems.push(...mirrorProblems(where, control.alsoWrites));

  return problems;
}

/**
 * Check one tool.
 * @param {Object} tool
 * @returns {string[]} problems, empty when the tool is well-formed
 */
export function validateTool(tool) {
  const problems = [];
  if (!tool || typeof tool !== 'object') {
    return ['tool: not an object'];
  }
  const where = tool.id || 'tool';

  ['id', 'icon', 'name', 'description', 'section'].forEach(field => {
    if (!isNonEmptyString(tool[field])) {
      problems.push(`${where}: ${field} is required`);
    }
  });

  if (!GROUPS.includes(tool.group)) {
    problems.push(`${where}: group must be one of ${GROUPS.join(', ')}`);
  }

  // Presentation, and only that: a view draws the word "Beta" beside a tool that says so, and the
  // tool works exactly as any other. Nothing here or anywhere else may read it as a gate — a
  // student is not told a feature is early by having it hidden from them.
  if (tool.beta !== undefined && typeof tool.beta !== 'boolean') {
    problems.push(`${where}: beta must be true or false`);
  }

  // Most tools have a switch. A few are purely something you DO — Translate Page is a button and
  // two selects, and nothing in the codebase reads a `translation.enabled`. Those declare
  // `actionOnly: true` and carry no state, rather than being given an invented always-true switch
  // that a view would then draw as a control the student cannot use.
  if (tool.actionOnly === true) {
    if (tool.state) {
      problems.push(`${where}: an action-only tool must not claim state`);
    }
    if (!Array.isArray(tool.actions) || tool.actions.length === 0) {
      problems.push(`${where}: an action-only tool needs at least one action`);
    }
  } else if (!tool.state || typeof tool.state !== 'object') {
    problems.push(`${where}: state is required — a tool with no state cannot be switched`);
  } else {
    if (!STORES.includes(tool.state.store)) {
      problems.push(`${where}: state.store must be one of ${STORES.join(', ')}`);
    }
    if (!isNonEmptyString(tool.state.path)) {
      problems.push(`${where}: state.path is required`);
    }
    if (tool.state.default === undefined) {
      problems.push(`${where}: state.default is required — the popup must not guess`);
    }
    // A tool's own switch may write more than one setting, just as a control may — Show Text Stats
    // sets the badge and the notification keys together.
    problems.push(...mirrorProblems(`${where} (state)`, tool.state.alsoWrites));
  }

  // `toggleId` may be null (AI Assist has no checkbox), but when present it is the element id in
  // popup.html, and the drift test holds it to that.
  if (tool.toggleId !== null && !isNonEmptyString(tool.toggleId)) {
    problems.push(`${where}: toggleId must be an element id or null`);
  }

  (tool.controls || []).forEach(control => problems.push(...validateControl(control)));

  (tool.actions || []).forEach(action => {
    if (!isNonEmptyString(action.id) || !isNonEmptyString(action.label)) {
      problems.push(`${where}: an action needs an id and a label`);
    }
  });

  problems.push(...statusLineProblems(tool, where));

  return problems;
}

/**
 * Check a tool's status lines.
 *
 * A status line is text the accordion writes as the student works: a result ("Deleted."), or a
 * note that depends on something outside the popup ("Your computer is asking for less motion
 * too"). The accordion is hidden, so Flat shows each declared line as a copy that follows the
 * original. `id` is the element in popup.html; `after` places the copy under one of the tool's
 * controls instead of on the tool's row.
 *
 * @param {Object} tool
 * @param {string} where
 * @returns {string[]}
 */
function statusLineProblems(tool, where) {
  if (tool.statusLines === undefined) {
    return [];
  }
  const controlIds = (tool.controls || []).map(control => control.id);
  const lines = Array.isArray(tool.statusLines) ? tool.statusLines : null;
  const wellFormed = line =>
    line !== null &&
    typeof line === 'object' &&
    isNonEmptyString(line.id) &&
    (line.after === undefined || controlIds.includes(line.after));
  if (!lines || !lines.every(wellFormed)) {
    return [`${where}: every status line needs an element id, and "after" must name its control`];
  }
  return [];
}

/**
 * Check a whole registry: every tool valid, ids unique, and every `dependsOn` resolvable.
 * @param {Object[]} tools
 * @returns {string[]} problems, empty when the registry is well-formed
 */
export function validateRegistry(tools) {
  const problems = [];
  if (!Array.isArray(tools)) {
    return ['registry: not an array'];
  }

  const seen = new Set();
  tools.forEach(tool => {
    problems.push(...validateTool(tool));
    if (tool && tool.id) {
      if (seen.has(tool.id)) {
        problems.push(`${tool.id}: duplicate tool id`);
      }
      seen.add(tool.id);
    }
  });

  tools.forEach(tool => {
    if (tool && tool.dependsOn && !seen.has(tool.dependsOn)) {
      problems.push(`${tool.id}: dependsOn names no tool in the registry (${tool.dependsOn})`);
    }
  });

  return problems;
}

/**
 * The accessible name for a control: its tool, then the control's own label.
 *
 * A student meeting a bare "Speed" in a flat list of two dozen supports has no way to tell which
 * tool it belongs to, and a screen reader reads it with no more context than the eye gets.
 *
 * @param {{name:string}} tool
 * @param {{label:string}} control
 * @returns {string}
 */
export function controlAriaLabel(tool, control) {
  const toolName = (tool && tool.name) || '';
  const label = (control && control.label) || '';
  if (!toolName || label === toolName) {
    return label || toolName;
  }
  return `${toolName} — ${label}`;
}

/**
 * Read a dotted path out of a settings object, without throwing on an absent branch.
 * @param {Object} source
 * @param {string} path
 * @returns {*}
 */
export function readSettingPath(source, path) {
  if (!source || !isNonEmptyString(path)) {
    return undefined;
  }
  return path.split('.').reduce((node, key) => {
    return node === null || node === undefined ? undefined : node[key];
  }, source);
}
