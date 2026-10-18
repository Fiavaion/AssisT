/**
 * Type-registry seam tests.
 *
 * The registry is the single source of truth for canonical-type metadata. These tests lock the
 * two guarantees the seam provides:
 *   1. Derivation fidelity — every registered type appears, with matching values, across the
 *      tables citation-types.js exposes (labels, weights, BibTeX, RIS). So adding one
 *      registerType() line in type-registry.js propagates everywhere with no other edit.
 *   2. Formatter fallback — a type with no bespoke renderer formats via `website` in every style,
 *      so adding a canonical type never requires editing a formatter `switch` (there isn't one).
 */

import {
  registerType,
  getType,
  getTypeIds,
  UI_ORDER,
} from '../../../src/features/citations/type-registry.js';
import {
  CITATION_TYPES,
  TYPE_LABELS,
  getBibTeXType,
  getRISType,
  getSourceTypeWeight,
} from '../../../src/features/citations/citation-types.js';
import * as apa7 from '../../../src/features/citations/citation-styles/apa7.js';
import * as mla9 from '../../../src/features/citations/citation-styles/mla9.js';
import * as chicago17 from '../../../src/features/citations/citation-styles/chicago17.js';
import * as harvard from '../../../src/features/citations/citation-styles/harvard.js';

describe('type-registry', () => {
  it('registerType returns a frozen def and getType retrieves it', () => {
    const def = registerType('__probe__', { label: 'Probe', weight: 0.42, bibtex: 'misc', ris: 'GEN' });
    expect(Object.isFrozen(def)).toBe(true);
    expect(getType('__probe__')).toEqual({
      id: '__probe__',
      label: 'Probe',
      weight: 0.42,
      bibtex: 'misc',
      ris: 'GEN',
    });
  });

  it('exposes the 10 canonical types first, in registration order', () => {
    // The registry is module-level state; other tests may append probe types, so assert the
    // canonical set as the leading prefix rather than exact-length equality.
    expect(getTypeIds().slice(0, 10)).toEqual([
      'website',
      'book',
      'chapter',
      'journal',
      'newspaper',
      'video',
      'social_media',
      'pdf',
      'thesis',
      'other',
    ]);
  });

  it('registers book chapters and theses with their export types', () => {
    expect(getType('chapter')).toEqual({
      id: 'chapter',
      label: 'Book Chapter',
      weight: 0.9,
      bibtex: 'incollection',
      ris: 'CHAP',
    });
    expect(getType('thesis')).toEqual({
      id: 'thesis',
      label: 'Thesis or Dissertation',
      weight: 0.85,
      bibtex: 'phdthesis',
      ris: 'THES',
    });
  });

  it('places chapter after book and thesis after pdf in the picker order', () => {
    expect(UI_ORDER.indexOf('chapter')).toBe(UI_ORDER.indexOf('book') + 1);
    expect(UI_ORDER.indexOf('thesis')).toBe(UI_ORDER.indexOf('pdf') + 1);
  });
});

describe('derivation fidelity — citation-types tables follow the registry', () => {
  // Only the canonical types existed when citation-types.js built its frozen tables at import;
  // the __probe__ registered above came later, so we assert against the canonical set explicitly.
  const canonical = [
    'website',
    'book',
    'chapter',
    'journal',
    'newspaper',
    'video',
    'social_media',
    'pdf',
    'thesis',
    'other',
  ];

  it.each(canonical)('%s appears as a CITATION_TYPES value and a label', id => {
    expect(Object.values(CITATION_TYPES)).toContain(id);
    expect(TYPE_LABELS[id]).toBe(getType(id).label);
  });

  it.each(canonical)('%s derives its BibTeX / RIS / weight from the registry def', id => {
    const def = getType(id);
    const citation = { type: id };
    expect(getBibTeXType(citation)).toBe(def.bibtex);
    expect(getRISType(citation)).toBe(def.ris);
    expect(getSourceTypeWeight(citation)).toBe(def.weight);
  });

  it('CITATION_TYPES keys are the upper-cased ids', () => {
    expect(CITATION_TYPES.SOCIAL_MEDIA).toBe('social_media');
    expect(CITATION_TYPES.WEBSITE).toBe('website');
  });
});

describe('formatter fallback — an unmapped type formats via website (no switch to edit)', () => {
  const styles = [
    ['apa7', apa7],
    ['mla9', mla9],
    ['chicago17', chicago17],
    ['harvard', harvard],
  ];
  // A normalised citation whose type has no bespoke renderer in any style.
  const unmapped = {
    type: 'podcast',
    title: 'On Working Memory',
    authors: ['Smith, J.'],
    publicationDate: '2021',
    url: 'https://example.com/ep1',
    siteName: 'Example',
    extra: {},
  };
  const asWebsite = { ...unmapped, type: 'website' };

  it.each(styles)('%s routes an unmapped type to the website renderer', (_name, style) => {
    expect(style.formatReference(unmapped)).toBe(style.formatReference(asWebsite));
  });
});
