/**
 * The popup's tool registry — one declaration of what the extension offers.
 *
 * Sections are declared one file at a time under `tools/`. A section counts as declared when its
 * file exports tools, so a section still being transcribed is visibly pending rather than quietly
 * passing as complete. `isComplete()` is the honest answer to "can a view rely on this yet?".
 *
 * Two axes, both kept:
 *   - `section` is the shipped accordion (`data-section` in popup.html). `ui_visibility` and the
 *     current popup depend on it, so it does not change. A tool drawn outside every accordion
 *     section says so with `UNSECTIONED` — see tool-schema.js.
 *   - `group` is one of the five the Flat view arranges tools into. Presentation only.
 */

import { validateRegistry } from './tool-schema.js';
import { AI_ASSIST_TOOLS } from './tools/ai-assist.js';
import { LOOKUP_TOOLS } from './tools/lookup.js';
import { POINTER_ZOOM_TOOLS } from './tools/pointer-zoom.js';
import { PRODUCTIVITY_TOOLS } from './tools/productivity.js';
import { READING_AIDS_TOOLS } from './tools/reading-aids.js';
import { READING_TOOLS } from './tools/reading.js';
import { SCHOOL_TOOLS } from './tools/school.js';
import { TEXT_STATS_TOOLS } from './tools/text-stats.js';
import { VISUAL_COMFORT_TOOLS } from './tools/visual-comfort.js';
import { WRITING_TOOLS } from './tools/writing.js';

/**
 * Accordion sections in popup.html, in the order they appear.
 *
 * The nine `data-section` blocks and nothing else. `UNSECTIONED` is deliberately not among them:
 * it is the absence of a section, and adding it here would make `isComplete()` and the per-section
 * drift checks start looking for markup that does not exist.
 */
export const SECTIONS = [
  'reading',
  'writing',
  'lookup',
  'reading-aids',
  'pointer-zoom',
  'visual-comfort',
  'productivity',
  'school',
  'ai-assist',
];

/** @type {Object[]} every declared tool, in the order popup.html draws them. */
export const TOOLS = [
  // Drawn above `<main>`, so it comes before the first accordion section.
  ...TEXT_STATS_TOOLS,
  ...READING_TOOLS,
  ...WRITING_TOOLS,
  ...LOOKUP_TOOLS,
  ...READING_AIDS_TOOLS,
  ...POINTER_ZOOM_TOOLS,
  ...VISUAL_COMFORT_TOOLS,
  ...PRODUCTIVITY_TOOLS,
  ...SCHOOL_TOOLS,
  ...AI_ASSIST_TOOLS,
];

/** Sections that have actually been transcribed, derived rather than maintained by hand. */
export const DECLARED_SECTIONS = SECTIONS.filter(section =>
  TOOLS.some(tool => tool.section === section)
);

/**
 * Whether every accordion section has been declared. Until it is true, a surface that needs the
 * complete picture (the Flat view, a rewritten Console) must keep its existing source.
 * @returns {boolean}
 */
export function isComplete() {
  return SECTIONS.every(section => DECLARED_SECTIONS.includes(section));
}

/**
 * One tool by id.
 * @param {string} id
 * @returns {Object|undefined}
 */
export function toolById(id) {
  return TOOLS.find(tool => tool.id === id);
}

/**
 * Every tool in one accordion section.
 * @param {string} section
 * @returns {Object[]}
 */
export function toolsBySection(section) {
  return TOOLS.filter(tool => tool.section === section);
}

/**
 * Every tool in one Flat group.
 * @param {string} group
 * @returns {Object[]}
 */
export function toolsByGroup(group) {
  return TOOLS.filter(tool => tool.group === group);
}

/**
 * Problems with the registry as it currently stands.
 * @returns {string[]} empty when the registry is well-formed
 */
export function registryProblems() {
  return validateRegistry(TOOLS);
}
