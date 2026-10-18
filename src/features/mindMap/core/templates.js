/**
 * Starting shapes for a new map.
 *
 * A blank canvas is the hardest thing to face for a student who is stuck, so every template is a
 * set of prompts rather than empty placeholders: each node says something a student can answer or
 * delete. The first level of every template carries a distinct branch colour, so the parts of the
 * plan are told apart by colour as well as by position — never by colour alone, since the outline
 * pane carries the same structure as text.
 *
 * `build` takes the id source rather than making ids itself: core never calls crypto, so the page
 * hands in `crypto.randomUUID` and a test hands in a counter.
 */

import { createMap, createNode } from './map-model.js';
import { addChild } from './map-ops.js';
import { BRANCH_COLOURS } from './palette.js';

/**
 * @param {string} title
 * @param {() => string} ids
 * @param {Array<{text: string, children?: string[]}>} branches - first-level nodes and their leaves.
 * @returns {Object} a valid map.
 */
function build(title, ids, branches) {
  const mapId = ids();
  let map = createMap({ id: mapId, title, rootId: ids(), rootText: title });

  branches.forEach((branch, at) => {
    const branchId = ids();
    map = addChild(map, {
      parentId: map.rootId,
      node: createNode({ id: branchId, text: branch.text, colour: at % BRANCH_COLOURS.length }),
    });
    for (const child of branch.children || []) {
      map = addChild(map, { parentId: branchId, node: createNode({ id: ids(), text: child }) });
    }
  });

  return map;
}

const argument = position => ({
  text: `Argument ${position}`,
  children: ['Point I am making', 'Evidence for it', 'My analysis of the evidence'],
});

/**
 * @type {ReadonlyArray<{id: string, name: string, description: string, build: (title: string, ids: () => string) => Object}>}
 */
export const TEMPLATES = Object.freeze([
  {
    id: 'blank',
    name: 'Blank map',
    description: 'One node to start from, and nothing else in the way.',
    build: (title, ids) => build(title, ids, []),
  },
  {
    id: 'essay-plan',
    name: 'Essay plan',
    description:
      'An introduction, three arguments with evidence, a counter-argument and a conclusion.',
    build: (title, ids) =>
      build(title, ids, [
        {
          text: 'Introduction',
          children: ['How I open', 'Background the reader needs', 'Thesis statement'],
        },
        argument('one'),
        argument('two'),
        argument('three'),
        {
          text: 'Counter-argument',
          children: ['The strongest case against me', 'How I answer it'],
        },
        {
          text: 'Conclusion',
          children: ['What I have shown', 'Why it matters'],
        },
      ]),
  },
  {
    id: 'lecture-notes',
    name: 'Lecture notes',
    description: 'Key ideas, definitions, examples and the questions to ask afterwards.',
    build: (title, ids) =>
      build(title, ids, [
        { text: 'Key ideas', children: ['The one thing to remember'] },
        { text: 'Definitions', children: ['A term I did not know'] },
        { text: 'Examples', children: ['The example that made it click'] },
        { text: 'Questions', children: ['Something to ask or look up'] },
      ]),
  },
  {
    id: 'compare-contrast',
    name: 'Compare and contrast',
    description: 'Two subjects side by side, what they share, where they differ and what follows.',
    build: (title, ids) =>
      build(title, ids, [
        { text: 'First subject', children: ['What it is', 'What stands out'] },
        { text: 'Second subject', children: ['What it is', 'What stands out'] },
        { text: 'What they share', children: ['A likeness that matters'] },
        { text: 'How they differ', children: ['A difference that matters'] },
        { text: 'What follows from the comparison', children: ['My conclusion'] },
      ]),
  },
  {
    id: 'project-plan',
    name: 'Project plan',
    description: 'Goals, the tasks under them, the deadlines they meet and the risks to watch.',
    build: (title, ids) =>
      build(title, ids, [
        { text: 'Goals', children: ['What done looks like'] },
        { text: 'Tasks', children: ['First task', 'Next task'] },
        { text: 'Deadlines', children: ['The date that cannot move'] },
        { text: 'Risks', children: ['What could go wrong', 'What I would do about it'] },
      ]),
  },
  {
    id: 'reading-notes',
    name: 'Reading notes',
    description: 'The claims a text makes, its evidence, my own response and the words to look up.',
    build: (title, ids) =>
      build(title, ids, [
        { text: 'Claims', children: ['What the author argues'] },
        { text: 'Evidence', children: ['What they offer as proof'] },
        { text: 'My response', children: ['Where I agree', 'Where I do not'] },
        { text: 'Vocabulary', children: ['A word to look up'] },
      ]),
  },
]);

/**
 * @param {string} id
 * @returns {Object|undefined} the template with that id.
 */
export function templateById(id) {
  return TEMPLATES.find(template => template.id === id);
}
