import { TEMPLATES, templateById } from '../../../../../src/features/mindMap/core/templates.js';
import { MAP_SCHEMA, validateMap } from '../../../../../src/features/mindMap/core/map-model.js';
import { nodeCount, walk } from '../../../../../src/features/mindMap/core/map-ops.js';
import { idSource } from './fixtures.js';

const EXPECTED = ['blank', 'essay-plan', 'lecture-notes', 'compare-contrast', 'project-plan', 'reading-notes'];

describe('TEMPLATES', () => {
  it('offers at least the six the feature ships with, each described', () => {
    const ids = TEMPLATES.map(template => template.id);
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(6);
    for (const id of EXPECTED) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of TEMPLATES) {
      expect(typeof template.name).toBe('string');
      expect(template.description.length).toBeGreaterThan(10);
      expect(typeof template.build).toBe('function');
    }
  });

  it('builds a valid map from every template', () => {
    for (const template of TEMPLATES) {
      const map = template.build('My title', idSource(`${template.id}-`));
      expect(validateMap(map)).toEqual([]);
      expect(map.schema).toBe(MAP_SCHEMA);
      expect(map.title).toBe('My title');
      expect(map.nodes[map.rootId].text).toBe('My title');
    }
  });

  it('takes every id from the supplied source, so core never calls crypto', () => {
    for (const template of TEMPLATES) {
      const map = template.build('T', idSource(`${template.id}-`));
      for (const id of Object.keys(map.nodes)) {
        expect(id.startsWith(`${template.id}-`)).toBe(true);
      }
      expect(map.id.startsWith(`${template.id}-`)).toBe(true);
    }
  });

  it('builds the same map twice from the same id source', () => {
    for (const template of TEMPLATES) {
      expect(template.build('T', idSource('x'))).toEqual(template.build('T', idSource('x')));
    }
  });

  it('leaves blank as a single root node and gives the rest a usable skeleton', () => {
    expect(nodeCount(templateById('blank').build('T', idSource()))).toBe(1);
    for (const template of TEMPLATES.filter(entry => entry.id !== 'blank')) {
      expect(nodeCount(template.build('T', idSource()))).toBeGreaterThanOrEqual(5);
    }
  });

  it('colours the first level so the branches are told apart', () => {
    for (const template of TEMPLATES.filter(entry => entry.id !== 'blank')) {
      const map = template.build('T', idSource());
      const branches = map.nodes[map.rootId].children.map(id => map.nodes[id].colour);
      expect(branches.every(colour => Number.isInteger(colour))).toBe(true);
      expect(new Set(branches).size).toBe(branches.length);
    }
  });

  it('writes every prompt as text a student reads, never an empty placeholder', () => {
    for (const template of TEMPLATES) {
      walk(template.build('T', idSource()), node => {
        expect(node.text.trim()).not.toBe('');
      });
    }
  });

  it('plans an essay with a thesis, three arguments and a counter-argument', () => {
    const map = templateById('essay-plan').build('Why access matters', idSource());
    const texts = [];
    walk(map, node => texts.push(node.text.toLowerCase()));
    expect(texts.some(text => text.includes('thesis'))).toBe(true);
    expect(texts.filter(text => text.startsWith('argument')).length).toBe(3);
    expect(texts.some(text => text.includes('counter'))).toBe(true);
    expect(texts.filter(text => text.includes('evidence')).length).toBeGreaterThanOrEqual(3);
    expect(texts.some(text => text.includes('conclusion'))).toBe(true);
  });

  it('templateById returns undefined for a name nothing defines', () => {
    expect(templateById('nope')).toBeUndefined();
  });
});
