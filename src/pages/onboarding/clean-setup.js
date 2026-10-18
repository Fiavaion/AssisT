/**
 * Clean setup — start from nothing.
 *
 * A student who wants to build their own setup, rather than accept a default or a quiz's
 * recommendation, needs one honest starting point: everything off. Not the popular things off, not
 * the things somebody remembered to list — everything, read aloud included.
 *
 * That is only true if "everything" is derived. The popup's tool registry declares all of the
 * extension's tools with the path each one's state lives at, the store it lives in, the further
 * keys its switch also writes, and its default. So this module iterates the registry and writes
 * each tool's off state. A hand-written list here would drift the moment a tool was added or
 * renamed, and would drift silently — which is exactly what the discovery quiz's two hand-written
 * maps did for a year before they were replaced by the same registry.
 *
 * WHAT IT DOES NOT TOUCH, and why:
 *   - `ui_visibility`. Hiding a tool is not switching it off — it removes the switch. A clean
 *     setup that hid everything would leave a student with nothing to switch back on, and one that
 *     revealed everything would override a deliberate choice to hide a support they never use.
 *   - Content. Citations, annotations, notes and study progress live in their own databases. This
 *     changes preferences only, and the copy in the welcome page says so.
 *   - Controls inside a tool — a voice, a speed, a colour. A control of a tool that is off does
 *     nothing, and wiping them would mean a student who switches Read Aloud back on gets a
 *     stranger's default rather than the voice they had chosen.
 *
 * The companion features are registry tools too (popup/registry/tools/companion.js), so they are
 * switched off with everything else. That includes the lecture companion, which is on unless
 * stored off and listens to the whole room: left on, the student would still be asked about their
 * microphone (owner decision, 2026-09-27).
 *
 * @module pages/onboarding/clean-setup
 */

import { TOOLS } from '../../popup/registry/tool-registry.js';
import { mirrorTargets } from '../../popup/registry/tool-schema.js';
import { applySettingWrites } from '../../utils/setting-writes.js';

/**
 * What "off" is for one tool.
 *
 * Almost every tool is a boolean switch. AI Assist is a mode string, and declares the value that
 * means off (`aiMode: 'off'`), because writing `false` there would leave the extension reading an
 * AI mode it does not recognise.
 *
 * @param {Object} tool
 * @returns {boolean|string}
 */
export function offValueFor(tool) {
  const state = (tool && tool.state) || {};
  return state.offValue === undefined ? false : state.offValue;
}

/**
 * Every storage write needed to leave a student with nothing switched on.
 *
 * @param {Object[]} [tools] - the registry, unless a test supplies its own
 * @returns {Array<{store: string, path: string, value: boolean|string}>}
 */
export function cleanWrites(tools = TOOLS) {
  const writes = [];
  const seen = new Set();

  const add = (store, path, value) => {
    const identity = `${store}:${path}`;
    if (!seen.has(identity)) {
      seen.add(identity);
      writes.push({ store, path, value });
    }
  };

  tools.forEach(tool => {
    // Action-only tools — Translate Page — are something you do, not something that is on. There
    // is no flag to clear, and inventing one would write a key nothing reads.
    if (!tool || tool.actionOnly === true || !tool.state) {
      return;
    }
    const store = tool.state.store || 'settings';
    const value = offValueFor(tool);
    add(store, tool.state.path, value);
    // A switch that sets more than one key has to clear all of them. Show Text Stats is the case:
    // its one checkbox writes two `assist_settings` keys and two top-level local keys, and a
    // writer that clears half of them leaves the badge on screen with its setting off.
    mirrorTargets(tool.state).forEach(mirror => add(mirror.store, mirror.path, value));
  });

  return writes;
}

/**
 * Switch everything off, in one write.
 *
 * @returns {Promise<{toolsOff: number}>} how many tools were switched off, for the message the
 *   student is shown
 */
export async function applyCleanSetup() {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    return { toolsOff: 0 };
  }
  const switchable = TOOLS.filter(tool => tool.actionOnly !== true && tool.state);
  await applySettingWrites(cleanWrites());
  return { toolsOff: switchable.length };
}
