/**
 * Reading tool state from settings, via the registry.
 *
 * Until now the only way to answer "what has this student got switched on?" was to render the
 * popup and read the checkboxes back out of it, which is why the old Console and hide-unused
 * filter both walked the DOM. That works only where the DOM already exists, and it makes the
 * rendered popup the source of truth about its own settings.
 *
 * These functions answer the same question from the settings object and the registry, so any
 * surface can ask it: a view that has not been drawn yet, a filter deciding what to show, a test.
 * They are pure — no storage, no DOM — and the caller supplies the state it has already loaded.
 */

import { readSettingPath } from './tool-schema.js';
import { TOOLS } from './tool-registry.js';

/**
 * Resolve one stored value, falling back to the declared default when nothing is stored.
 *
 * The distinction matters: `false` is a stored value and must win over a default of `true`,
 * whereas `undefined` means the student has never touched it. Popup handlers express this with
 * `?? default`, `|| default` and `!== false` — the registry records which, in `default`, and this
 * applies it uniformly.
 *
 * @param {{path:string, store?:string, default:*}} declaration - a tool's `state` or a control
 * @param {{settings?:Object, local?:Object}} sources
 * @returns {*}
 */
export function resolveValue(declaration, { settings, local } = {}) {
  if (!declaration || !declaration.path) {
    return undefined;
  }
  const source = declaration.store === 'local' ? local : settings;
  const stored = readSettingPath(source, declaration.path);
  return stored === undefined ? declaration.default : stored;
}

/**
 * Whether a tool is switched on.
 *
 * Three shapes, all of them real:
 *   - a boolean switch, which is most tools;
 *   - a mode string with an explicit `offValue`, which is AI Assist (`aiMode`);
 *   - an action-only tool such as Translate Page, which is never "on" because there is nothing to
 *     switch — it is something you do. Reporting it as on would put it in an "in use" list it can
 *     never leave.
 *
 * @param {Object} tool
 * @param {{settings?:Object, local?:Object}} sources
 * @returns {boolean}
 */
export function isToolOn(tool, sources = {}) {
  if (!tool || tool.actionOnly === true || !tool.state) {
    return false;
  }
  const value = resolveValue(tool.state, sources);
  if (tool.state.offValue !== undefined) {
    return value !== undefined && value !== tool.state.offValue;
  }
  return value === true;
}

/**
 * Whether a tool is available to be shown at all.
 *
 * `ui_visibility` lets a student hide a support they never use. A hidden tool is not off — it is
 * absent — so a count of what is in use must not include it, and a filter must not offer it.
 *
 * @param {Object} tool
 * @param {Object} [visibility] - the `ui_visibility` block
 * @returns {boolean}
 */
export function isToolVisible(tool, visibility) {
  if (!tool || !tool.visibilityKey) {
    return true;
  }
  const value = (visibility || {})[tool.visibilityKey];
  return value === undefined ? true : value !== false;
}

/**
 * Whether a tool can do anything right now. A support that depends on another does nothing while
 * its parent is off — Highlight While Reading needs Read Aloud — so a view can show it as
 * unavailable rather than as a switch that appears to work and doesn't.
 *
 * @param {Object} tool
 * @param {{settings?:Object, local?:Object}} sources
 * @returns {boolean}
 */
export function isToolAvailable(tool, sources = {}) {
  if (!tool || !tool.dependsOn) {
    return true;
  }
  const parent = TOOLS.find(candidate => candidate.id === tool.dependsOn);
  return parent ? isToolOn(parent, sources) : true;
}

/**
 * Every tool, with its state resolved.
 *
 * `value` is the stored state itself, not merely whether it is on. Most tools are a boolean and
 * the two say the same thing; AI Assist's state is a mode string, and a view that can only ask
 * "on or off?" has to draw it as a switch that has nothing to switch. It is undefined for an
 * action-only tool, which has no state to read.
 *
 * @param {{settings?:Object, local?:Object, visibility?:Object, tools?:Object[]}} [options]
 * @returns {Array<{tool:Object, on:boolean, visible:boolean, available:boolean, value:*}>}
 */
export function readToolStates({ settings, local, visibility, tools } = {}) {
  const list = Array.isArray(tools) ? tools : TOOLS;
  const sources = { settings, local };
  return list.map(tool => ({
    tool,
    on: isToolOn(tool, sources),
    visible: isToolVisible(tool, visibility),
    available: isToolAvailable(tool, sources),
    value: tool.state ? resolveValue(tool.state, sources) : undefined,
  }));
}

/**
 * The set of tools a student currently has in use — visible and switched on.
 *
 * This is what the "In use only" filter snapshots. It is returned as a Set of ids rather than a
 * live predicate on purpose: the filter must keep showing the rows it captured when it was
 * pressed, so that switching one off does not make its row vanish from under the pointer.
 *
 * @param {{settings?:Object, local?:Object, visibility?:Object, tools?:Object[]}} [options]
 * @returns {Set<string>}
 */
export function inUseToolIds(options = {}) {
  return new Set(
    readToolStates(options)
      .filter(state => state.on && state.visible)
      .map(state => state.tool.id)
  );
}

/**
 * Counts for the line that must always be shown alongside the filter. Hiding what is off also
 * hides the means of switching anything on, so the student has to see how much is hidden.
 *
 * @param {{settings?:Object, local?:Object, visibility?:Object, tools?:Object[]}} [options]
 * @returns {{inUse:number, hidden:number, total:number}}
 */
export function inUseCounts(options = {}) {
  const visible = readToolStates(options).filter(state => state.visible);
  const inUse = visible.filter(state => state.on).length;
  return { inUse, hidden: visible.length - inUse, total: visible.length };
}
