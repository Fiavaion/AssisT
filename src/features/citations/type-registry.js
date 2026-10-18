/**
 * Citation Type Registry — single source of truth for CANONICAL citation-type metadata.
 *
 * Each canonical type is registered once with its display label, credibility weight, and
 * BibTeX/RIS export types. `citation-types.js` derives its canonical-level tables (CITATION_TYPES,
 * TYPE_LABELS, UI options, canonical weights, canonical BibTeX/RIS) from here. The style
 * formatters resolve a per-type renderer from a local map, falling back to `website` — so adding a
 * canonical type is ONE registerType() call, plus a renderer entry in a style ONLY if it needs
 * bespoke formatting. There is no formatter `switch` to edit.
 *
 * Out of scope (deliberately kept in citation-types.js): the legacy/CrossRef/export ALIAS table
 * and the fine-grained academic SUB-type maps (conference-paper, report, preprint, …). Those
 * are many-to-one onto these canonical types and are not per-type metadata.
 */

/** @typedef {{ id: string, label: string, weight: number, bibtex: string, ris: string }} TypeDef */

/** Insertion-ordered registry of canonical types. */
const REGISTRY = new Map();

/**
 * Register (or override) a canonical citation type.
 * @param {string} id - canonical id, e.g. 'journal' or 'social_media'
 * @param {{ label: string, weight?: number, bibtex?: string, ris?: string }} def
 * @returns {TypeDef}
 */
export function registerType(id, { label, weight = 0.5, bibtex = 'misc', ris = 'GEN' } = {}) {
  const def = Object.freeze({ id, label, weight, bibtex, ris });
  REGISTRY.set(id, def);
  return def;
}

/** @param {string} id @returns {TypeDef|undefined} */
export function getType(id) {
  return REGISTRY.get(id);
}

/** @returns {string[]} canonical ids, in registration order */
export function getTypeIds() {
  return [...REGISTRY.keys()];
}

/** @returns {TypeDef[]} all type defs, in registration order */
export function getTypes() {
  return [...REGISTRY.values()];
}

// ─── Canonical types ──────────────────────────────────────────────────────────
// Registration order = CITATION_TYPES key order. (UI dropdown order is separate — see UI_ORDER.)
registerType('website', { label: 'Web Page', weight: 0.5, bibtex: 'misc', ris: 'ELEC' });
registerType('book', { label: 'Book', weight: 0.95, bibtex: 'book', ris: 'BOOK' });
registerType('chapter', {
  label: 'Book Chapter',
  weight: 0.9,
  bibtex: 'incollection',
  ris: 'CHAP',
});
registerType('journal', { label: 'Journal Article', weight: 1.0, bibtex: 'article', ris: 'JOUR' });
registerType('newspaper', {
  label: 'Newspaper Article',
  weight: 0.6,
  bibtex: 'article',
  ris: 'NEWS',
});
registerType('video', { label: 'Video', weight: 0.4, bibtex: 'misc', ris: 'VIDEO' });
registerType('social_media', { label: 'Social Media', weight: 0.3, bibtex: 'misc', ris: 'ELEC' });
registerType('pdf', { label: 'PDF Document', weight: 0.5, bibtex: 'misc', ris: 'ELEC' });
registerType('thesis', {
  label: 'Thesis or Dissertation',
  weight: 0.85,
  bibtex: 'phdthesis',
  ris: 'THES',
});
registerType('other', { label: 'Other', weight: 0.5, bibtex: 'misc', ris: 'GEN' });

/** Display order for the edit-modal <select> (intentionally differs from registration order). */
export const UI_ORDER = Object.freeze([
  'website',
  'journal',
  'book',
  'chapter',
  'newspaper',
  'pdf',
  'thesis',
  'video',
  'social_media',
  'other',
]);

export default { registerType, getType, getTypeIds, getTypes, UI_ORDER };
