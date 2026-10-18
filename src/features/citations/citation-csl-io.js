/**
 * CSL-JSON import / export for AssisT citations.
 *
 * Provides two public functions that bridge the flat AssisT citation shape and the
 * portable CSL-JSON format understood by reference managers and CSL processors:
 *
 *   exportAsCSL(citations) — flat[] → pretty-printed JSON string of CSL-JSON items.
 *   importFromCSL(text)    — JSON string → flat citation array.
 *
 * All CSL field mapping is delegated to csl-adapter.js (toCSL / fromCSL) — this module
 * is purely concerned with the serialisation layer (JSON encode/decode) and the three
 * accepted top-level input shapes.
 *
 * Accepted input shapes for importFromCSL:
 *   • JSON array of CSL items          — [ { type, title, … }, … ]
 *   • Single CSL item object           — { type, title, … }
 *   • CSL-JSON "citation" wrapper      — { items: [ … ] }
 *
 * Non-object members inside an array are silently skipped; a completely unparseable
 * string or a top-level value that is neither array nor object throws an Error.
 */

import { toCSL, fromCSL } from './csl-adapter.js';

/**
 * Serialise an array of flat AssisT citations to a CSL-JSON string.
 *
 * @param {object[]} citations - Flat citation objects (may include searchTokens — ignored by toCSL).
 * @returns {string} Pretty-printed (2-space) JSON array of CSL-JSON items.
 */
export function exportAsCSL(citations) {
  if (!Array.isArray(citations) || citations.length === 0) {
    return '[]';
  }
  const cslItems = citations.map(c => toCSL(c));
  return JSON.stringify(cslItems, null, 2);
}

/**
 * Parse a CSL-JSON string and return an array of flat AssisT citations.
 *
 * Accepts a bare JSON array, a single CSL item object, or an object with an `items`
 * array (the CSL-JSON "citation" wrapper).  Non-object array members are silently
 * skipped.  Throws only when the string is not valid JSON or the top-level value is
 * neither an array nor an object.
 *
 * @param {string} text - JSON string to parse.
 * @returns {object[]} Flat citation objects produced via fromCSL().
 * @throws {Error} If `text` is not parseable JSON or the parsed value is a primitive.
 */
export function importFromCSL(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid CSL-JSON: input is not valid JSON — ${String(text ?? '').slice(0, 80)}`
    );
  }

  let items;
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed !== null && typeof parsed === 'object') {
    // Support the CSL-JSON "citation" wrapper { items: [...] }
    if (Array.isArray(parsed.items)) {
      items = parsed.items;
    } else {
      // Single CSL item object
      items = [parsed];
    }
  } else {
    throw new Error(`Invalid CSL-JSON: expected an array or object, got ${typeof parsed}`);
  }

  return items
    .filter(item => item !== null && typeof item === 'object' && !Array.isArray(item))
    .map(item => fromCSL(item));
}
