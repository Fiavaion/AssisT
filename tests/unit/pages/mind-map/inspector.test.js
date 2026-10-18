/**
 * @jest-environment jsdom
 *
 * Inspector.
 *
 * Two things are worth more than the field list: that every write lands in the history (so undo
 * covers it and the other panes see it), and that a re-render triggered by the student's own
 * keystroke does not yank the caret out of the box they are typing in.
 */

jest.mock('../../../../src/features/citations/citation-rpc.js', () => ({
  CitationStorageRPC: { getAll: jest.fn() },
}));

import * as mapOps from '../../../../src/features/mindMap/core/map-ops.js';
import { mountInspector } from '../../../../src/pages/mind-map/inspector.js';
import { CitationStorageRPC } from '../../../../src/features/citations/citation-rpc.js';
import {
  ROOT_ID,
  activate,
  createSelectionStub,
  makeHistory,
  makeMap,
  press,
} from './pane-fixtures.js';

/** Two citations shaped the way the library stores them. */
const LIBRARY = [
  {
    id: 'cit-1',
    type: 'journal-article',
    title: 'Working memory and note taking',
    authors: ['Ahmed, Layla'],
    publicationDate: '2019-04-02',
  },
  {
    id: 'cit-2',
    type: 'webpage',
    title: 'Study skills guide',
    authors: ['Byrne, Sean'],
    publicationDate: '2023',
  },
];

/** The debounce is real, so a typed value only reaches the history once the timers run out. */
const settle = () => jest.advanceTimersByTime(250);

const typeInto = (element, value) => {
  element.value = value;
  element.dispatchEvent(new window.Event('input', { bubbles: true }));
};

const flip = (element, checked) => {
  element.checked = checked;
  element.dispatchEvent(new window.Event('change', { bubbles: true }));
};

describe('inspector', () => {
  let host;
  let history;
  let selection;
  let announce;
  let notify;
  let inspector;

  const control = selector => host.querySelector(selector);
  const labelled = labelText =>
    [...host.querySelectorAll('label')]
      .filter(label => label.textContent === labelText)
      .map(label => host.querySelector(`#${label.htmlFor}`))[0];

  beforeEach(() => {
    jest.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub();
    announce = jest.fn();
    notify = jest.fn();
    CitationStorageRPC.getAll.mockResolvedValue(LIBRARY);
    inspector = mountInspector(host, { history, selection, announce, notify });
  });

  afterEach(() => {
    inspector.destroy();
    host.remove();
    jest.useRealTimers();
  });

  describe('empty state', () => {
    it('names itself and asks for a selection', () => {
      const form = control('form.mm-inspector');
      const title = host.querySelector(`#${form.getAttribute('aria-labelledby')}`);
      expect(title.textContent).toBe('Node details');
      expect(control('.mm-inspector__empty').hidden).toBe(false);
      expect(control('.mm-inspector__empty').textContent).toBe('Select a node');
    });

    it('disables every field until a node is chosen', () => {
      expect(control('fieldset.mm-inspector__fields').disabled).toBe(true);
      selection.set('arg', { source: 'outline' });
      expect(control('fieldset.mm-inspector__fields').disabled).toBe(false);
      expect(control('.mm-inspector__empty').hidden).toBe(true);
    });
  });

  describe('text and notes', () => {
    beforeEach(() => selection.set('arg', { source: 'outline' }));

    it('shows the selected node and follows a change of selection', () => {
      expect(labelled('Text').value).toBe('Argument');
      selection.set('src', { source: 'canvas' });
      expect(labelled('Text').value).toBe('Sources');
    });

    it('writes text through the history once typing settles', () => {
      typeInto(labelled('Text'), 'Main argument');
      expect(history.current().nodes.arg.text).toBe('Argument');
      settle();
      expect(history.current().nodes.arg.text).toBe('Main argument');
    });

    it('writes notes through the history', () => {
      typeInto(labelled('Notes'), 'Three paragraphs, one per source.');
      settle();
      expect(history.current().nodes.arg.notes).toBe('Three paragraphs, one per source.');
    });

    it('leaves the field the student is typing in alone when the map changes under it', () => {
      const field = labelled('Notes');
      field.focus();
      typeInto(field, 'Half a sen');
      settle();
      // The write comes back round as a history change; the caret must survive it.
      expect(document.activeElement).toBe(field);
      expect(field.value).toBe('Half a sen');
    });

    /**
     * A blank name is a blank box on the canvas, a blank row in the outline and an empty line in
     * every export. Both other editors refuse one on every way out; this field wrote one silently.
     */
    describe('a name that was emptied', () => {
      const leave = {
        blur: field => field.dispatchEvent(new window.FocusEvent('blur')),
        Enter: field =>
          field.dispatchEvent(
            new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
          ),
      };

      it('is never written, however long the student leaves the field empty', () => {
        const before = history.current();
        typeInto(labelled('Text'), '');
        settle();
        expect(history.current()).toBe(before);
        expect(history.current().nodes.arg.text).toBe('Argument');
      });

      it('is never written when it is only spaces', () => {
        typeInto(labelled('Text'), '   ');
        settle();
        expect(history.current().nodes.arg.text).toBe('Argument');
      });

      for (const [how, exit] of Object.entries(leave)) {
        for (const typed of ['', '   ']) {
          // Through `notify`, not `announce`: the field filling itself back in is a repair the
          // student did not ask for, and one only a screen reader was ever told about.
          it(`puts the name back on ${how} (${JSON.stringify(typed)}) and shows so`, () => {
            const field = labelled('Text');
            field.focus();
            typeInto(field, typed);

            exit(field);

            expect(field.value).toBe('Argument');
            expect(history.current().nodes.arg.text).toBe('Argument');
            expect(notify).toHaveBeenLastCalledWith("A node needs a name. Kept 'Argument'.");
            expect(announce).not.toHaveBeenCalledWith("A node needs a name. Kept 'Argument'.");
          });
        }
      }

      it('says nothing of the kind when a real name is typed', () => {
        const field = labelled('Text');
        typeInto(field, 'Main argument');
        settle();
        leave.blur(field);

        expect(history.current().nodes.arg.text).toBe('Main argument');
        expect(notify).not.toHaveBeenCalledWith(expect.stringContaining('needs a name'));
      });

      // A node the outline has just made and not yet named has nothing to keep, and "Kept ''" is
      // not a sentence to read out.
      it('has nothing to say about a node with no name yet', () => {
        history.apply('addChild', { parentId: 'arg', node: { id: 'fresh', text: '' } });
        selection.set('fresh', { source: 'outline' });
        const field = labelled('Text');
        field.focus();
        typeInto(field, '');

        leave.blur(field);

        expect(field.value).toBe('');
        expect(announce).not.toHaveBeenCalledWith(expect.stringContaining('needs a name'));
      });

      it('leaves Enter alone once there is a name in the field', () => {
        const field = labelled('Text');
        typeInto(field, 'Two');
        const event = new window.KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        });
        field.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
      });
    });

    it('still writes a pending edit to the node it was typed into', () => {
      typeInto(labelled('Text'), 'Renamed while moving on');
      selection.set('src', { source: 'outline' });
      settle();
      expect(history.current().nodes.arg.text).toBe('Renamed while moving on');
      expect(history.current().nodes.src.text).toBe('Sources');
    });

    /**
     * The field is filled for one node, and the selection can move while the student is mid-word in
     * it: a shortcut, a click in another pane, an undo. The panel then rewrites the field with the
     * NEW node's text, and the next keystroke used to write that text plus the letter to the NEW
     * node - a silent edit to a node the student was not even looking at.
     */
    describe('a field the selection moved out from under', () => {
      it('takes the caret out of the field, so the next keystroke cannot reach the new node', () => {
        const field = labelled('Text');
        field.focus();
        typeInto(field, 'Argum');

        selection.set('src', { source: 'canvas' });

        // On the panel, not dropped on the document: the next Tab carries on from here.
        expect(document.activeElement).toBe(control('form.mm-inspector'));
        // A keystroke that arrives at the field anyway writes nothing at all.
        typeInto(field, `${field.value}e`);
        settle();

        expect(history.current().nodes.src.text).toBe('Sources');
        // What was typed before the change belongs to the node it was typed into.
        expect(history.current().nodes.arg.text).toBe('Argum');
      });

      it('holds the same line for Notes', () => {
        const field = labelled('Notes');
        field.focus();
        typeInto(field, 'Half a thought');

        selection.set('src', { source: 'canvas' });
        typeInto(field, 'Half a thoughts');
        settle();

        expect(history.current().nodes.src.notes).toBe('');
        expect(history.current().nodes.arg.notes).toBe('Half a thought');
      });

      it('writes to the new node once the student puts the caret back in', () => {
        const field = labelled('Text');
        field.focus();
        typeInto(field, 'Argum');
        selection.set('src', { source: 'canvas' });

        field.focus();
        typeInto(field, 'Sources and notes');
        settle();

        expect(history.current().nodes.src.text).toBe('Sources and notes');
        expect(history.current().nodes.arg.text).toBe('Argum');
      });

      it('leaves a field nobody was typing in able to edit the node it now shows', () => {
        typeInto(labelled('Text'), 'Argument, reworded');
        selection.set('src', { source: 'canvas' });
        settle();

        typeInto(labelled('Text'), 'Sources and notes');
        settle();

        expect(history.current().nodes.arg.text).toBe('Argument, reworded');
        expect(history.current().nodes.src.text).toBe('Sources and notes');
      });
    });
  });

  describe('branch colour', () => {
    beforeEach(() => selection.set('arg', { source: 'outline' }));

    it('offers Inherit plus every named colour, each with a name beside the swatch', () => {
      const group = control('fieldset.mm-inspector__colours-group');
      expect(group.querySelector('legend').textContent).toBe('Branch colour');
      const names = [...group.querySelectorAll('.mm-inspector__colour')].map(l => l.textContent);
      expect(names[0]).toBe('Inherit');
      expect(names).toContain('Green');
      expect(names).toHaveLength(9);
      // The swatch is decorative; the name is what a screen reader and a colour-blind eye get.
      expect(group.querySelector('.mm-inspector__swatch').getAttribute('aria-hidden')).toBe('true');
    });

    it('writes the chosen colour and announces it by name', () => {
      const green = [...host.querySelectorAll('input[type="radio"]')].find(r => r.value === '3');
      flip(green, true);
      expect(history.current().nodes.arg.colour).toBe(3);
      expect(announce).toHaveBeenCalledWith('Branch colour Green');
    });

    it('goes back to inheriting', () => {
      history.apply('setColour', { id: 'arg', colour: 3 });
      const inherit = [...host.querySelectorAll('input[type="radio"]')].find(r => r.value === '');
      flip(inherit, true);
      expect(history.current().nodes.arg.colour).toBeNull();
      expect(announce).toHaveBeenCalledWith('Branch colour inherited');
    });

    it('reflects the colour the node already carries', () => {
      history.apply('setColour', { id: 'arg', colour: 5 });
      const checked = [...host.querySelectorAll('input[type="radio"]')].find(r => r.checked);
      expect(checked.value).toBe('5');
    });

    /**
     * Choosing a colour leaves the keyboard on the radio, so an undo of that very choice arrives
     * with a radio focused. Skipping the group to protect the caret left the panel claiming a colour
     * the map no longer holds - and a student pressing the same radio again changes nothing, because
     * it is already the one that looks chosen.
     */
    it('follows an undo and a redo of the colour while a radio holds the keyboard', () => {
      const radios = () => [...host.querySelectorAll('.mm-inspector__colour input')];
      const green = radios().find(radio => radio.value === '3');
      flip(green, true);
      green.focus();

      history.undo();

      expect(history.current().nodes.arg.colour).toBeNull();
      expect(radios().find(radio => radio.checked).value).toBe('');
      // The student stays where they were: the state moved, the keyboard did not.
      expect(document.activeElement).toBe(green);

      history.redo();

      expect(radios().find(radio => radio.checked).value).toBe('3');
      expect(document.activeElement).toBe(green);
    });
  });

  describe('symbol', () => {
    beforeEach(() => selection.set('src', { source: 'outline' }));

    it('accepts at most two characters typed by hand', () => {
      const input = labelled('Symbol');
      expect(input.maxLength).toBe(2);
      typeInto(input, '⭐');
      settle();
      expect(history.current().nodes.src.symbol).toBe('⭐');
    });

    it('offers twelve quick picks in a named group', () => {
      const group = control('.mm-inspector__quickPick');
      expect(group.getAttribute('aria-label')).toBe('Quick symbols');
      expect(group.querySelectorAll('button')).toHaveLength(12);
    });

    it('applies a quick pick immediately and announces it', () => {
      const pick = control('.mm-inspector__quickPick button');
      activate(pick);
      expect(history.current().nodes.src.symbol).toBe(pick.textContent);
      expect(announce).toHaveBeenCalledWith(`Symbol ${pick.textContent}`);
    });

    it('clears the symbol', () => {
      history.apply('setSymbol', { id: 'src', symbol: '📌' });
      const clear = [...host.querySelectorAll('button')].find(b => b.textContent === 'Clear');
      activate(clear);
      expect(history.current().nodes.src.symbol).toBeNull();
      expect(announce).toHaveBeenCalledWith('Symbol cleared');
    });
  });

  describe('source', () => {
    beforeEach(() => selection.set('src', { source: 'outline' }));

    it('hides the open link until there is somewhere to go', () => {
      expect(control('.mm-inspector__sourceLink').hidden).toBe(true);
    });

    it('stores a URL and a quote together, and opens the link safely', () => {
      typeInto(labelled('Source URL'), 'https://example.org/paper');
      typeInto(labelled('Quote'), 'A sentence worth keeping.');
      settle();
      expect(history.current().nodes.src.source).toEqual({
        url: 'https://example.org/paper',
        quote: 'A sentence worth keeping.',
        title: '',
      });

      const link = control('.mm-inspector__sourceLink');
      expect(link.hidden).toBe(false);
      expect(link.getAttribute('href')).toBe('https://example.org/paper');
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener');
    });

    it('keeps the captured page title when the student edits the URL', () => {
      history.apply('setSource', {
        id: 'src',
        source: { url: 'https://example.org/a', quote: 'q', title: 'A paper' },
      });
      typeInto(labelled('Source URL'), 'https://example.org/b');
      settle();
      expect(history.current().nodes.src.source.title).toBe('A paper');
    });

    it('drops the source entirely when both fields are emptied', () => {
      history.apply('setSource', {
        id: 'src',
        source: { url: 'https://a.test', quote: '', title: '' },
      });
      typeInto(labelled('Source URL'), '');
      settle();
      expect(history.current().nodes.src.source).toBeNull();
    });
  });

  describe('done', () => {
    it('ticks and unticks through the history', () => {
      selection.set('counter', { source: 'outline' });
      const checkbox = host.querySelector('input[type="checkbox"]');
      flip(checkbox, true);
      expect(history.current().nodes.counter.done).toBe(true);
      expect(announce).toHaveBeenCalledWith('Marked Counterpoint done');

      flip(checkbox, false);
      expect(history.current().nodes.counter.done).toBe(false);
    });
  });

  describe('cross-links', () => {
    beforeEach(() => selection.set('ev', { source: 'outline' }));

    it('offers every other node, telling same-named branches apart by their parent', () => {
      labelled('Add link to').dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
      const select = labelled('Add link to');
      const values = [...select.options].map(option => option.value);
      expect(values).not.toContain('ev');
      expect(values).toContain('src');
      const sources = [...select.options].find(option => option.value === 'src');
      expect(sources.textContent).toBe('Sources (under Essay plan)');
    });

    it('adds a labelled link and announces it', () => {
      labelled('Add link to').dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
      labelled('Add link to').value = 'src';
      typeInto(labelled('Link label'), 'supports');
      const add = [...host.querySelectorAll('button')].find(b => b.textContent === 'Add');
      activate(add);

      expect(history.current().links).toEqual([
        { id: 'ev->src', from: 'ev', to: 'src', label: 'supports' },
      ]);
      expect(announce).toHaveBeenCalledWith('Linked Evidence to Sources');
    });

    it('reports a repeated link instead of throwing', () => {
      history.apply('addLink', { from: 'ev', to: 'src', label: '' });
      labelled('Add link to').dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
      labelled('Add link to').value = 'src';
      const add = [...host.querySelectorAll('button')].find(b => b.textContent === 'Add');
      expect(() => activate(add)).not.toThrow();
      expect(history.current().links).toHaveLength(1);
      expect(announce).toHaveBeenCalledWith(expect.stringContaining('already holds a link'));
    });

    it('lists the links out of this node and removes one', () => {
      history.apply('addLink', { from: 'ev', to: 'src', label: 'supports' });
      const items = [...host.querySelectorAll('.mm-inspector__link')];
      expect(items).toHaveLength(1);
      expect(items[0].textContent).toContain('Sources — supports');

      const remove = items[0].querySelector('button');
      expect(remove.getAttribute('aria-label')).toBe('Remove cross-link to Sources');
      activate(remove);
      expect(history.current().links).toHaveLength(0);
      expect(announce).toHaveBeenCalledWith('Removed the cross-link to Sources');
    });

    it('says so when a node has no links', () => {
      expect(host.querySelector('.mm-inspector__links').textContent).toBe(
        'No cross-links from this node'
      );
    });
  });

  describe('the linked citation', () => {
    /** The library is read once, asynchronously, so the options land a microtask after mount. */
    const loaded = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    beforeEach(async () => {
      selection.set('arg', { source: 'outline' });
      await loaded();
    });

    it('lists every citation as author, year and short title', () => {
      const select = labelled('Linked citation');
      const labels = [...select.options].map(option => option.textContent);
      expect(labels[0]).toBe('No citation');
      expect(labels).toContain('Ahmed, Layla, 2019, Working memory and note taking');
      expect(labels).toContain('Byrne, Sean, 2023, Study skills guide');
    });

    it('writes the choice through the history so undo covers it', () => {
      const select = labelled('Linked citation');
      select.value = 'cit-1';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));

      expect(history.current().nodes.arg.citationId).toBe('cit-1');
      history.undo();
      expect(history.current().nodes.arg.citationId).toBe(null);
    });

    it('shows the short reference beside a linked citation', () => {
      const select = labelled('Linked citation');
      select.value = 'cit-1';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
      expect(control('.mm-inspector__citationRef').textContent).toBe('(Ahmed, 2019)');
    });

    it('letters the reference within the citation’s reference list', async () => {
      inspector.destroy();
      host.replaceChildren();
      // A second 2019 work by Ahmed, unfiled like cit-1, whose title sorts first.
      CitationStorageRPC.getAll.mockResolvedValue([
        ...LIBRARY,
        { id: 'cit-3', type: 'book', title: 'Attention in class', authors: ['Ahmed, Layla'], publicationDate: '2019' },
      ]);
      inspector = mountInspector(host, { history, selection, announce });
      selection.set('arg', { source: 'outline' });
      await loaded();
      history.apply('setCitation', { id: 'arg', citationId: 'cit-1' });
      expect(control('.mm-inspector__citationRef').textContent).toBe('(Ahmed, 2019b)');
    });

    it('clears the link', () => {
      history.apply('setCitation', { id: 'arg', citationId: 'cit-1' });
      activate(control('.mm-inspector__citationClear'));
      expect(history.current().nodes.arg.citationId).toBe(null);
      expect(control('.mm-inspector__citationRef').textContent).toBe('');
    });

    it('says the library is unavailable rather than showing an empty picker', async () => {
      inspector.destroy();
      host.replaceChildren();
      CitationStorageRPC.getAll.mockRejectedValue(new Error('offscreen document not ready'));
      inspector = mountInspector(host, { history, selection, announce });
      selection.set('arg', { source: 'outline' });
      await loaded();

      expect(labelled('Linked citation').disabled).toBe(true);
      expect(control('.mm-inspector__citationRef').textContent).toBe(
        'Citation library unavailable'
      );
    });

    it('falls back to author and year when the linked citation has gone', () => {
      history.apply('setCitation', { id: 'arg', citationId: 'cit-gone' });
      expect(control('.mm-inspector__citationRef').textContent).toBe(
        'Citation no longer in your library'
      );
    });
  });

  // Ids reach this pane from a selection restored with a stored map and from the links of an
  // imported one. Every object answers to `constructor`, so a lookup that tested for truthiness
  // would hand this pane a function and then read `.text` off it.
  describe('an id that is not a node on the map', () => {
    it('leaves the panel in its empty state rather than showing a function', () => {
      selection.set('constructor', { source: 'program' });

      expect(control('fieldset.mm-inspector__fields').disabled).toBe(true);
      expect(control('.mm-inspector__empty').hidden).toBe(false);
      expect(labelled('Text').value).toBe('');
    });

    it('writes nothing when the selected id is not a node', () => {
      const before = history.current();
      selection.set('constructor', { source: 'program' });
      typeInto(labelled('Text'), 'Typed into nothing');
      settle();

      expect(history.current()).toBe(before);
    });

    it('names a cross-link whose other end is not here as untitled', () => {
      const linked = {
        ...makeMap(),
        links: [{ id: 'l1', from: 'arg', to: 'constructor', label: 'see also' }],
      };
      inspector.destroy();
      host.replaceChildren();
      history = makeHistory(linked);
      inspector = mountInspector(host, { history, selection, announce });
      selection.set('arg', { source: 'outline' });

      expect(control('.mm-inspector__link span').textContent).toBe('(untitled) — see also');
    });
  });

  /**
   * "Move to…" is the single-pointer and keyboard alternative to both canvas drags (SC 2.5.7), so
   * every assertion here is made without a drag: a filter, two selects and a button.
   */
  describe('move to', () => {
    const filter = () => labelled('Find a parent');
    const parent = () => labelled('New parent');
    const place = () => labelled('Place it');
    const group = () => control('fieldset.mm-inspector__move');
    const moveButton = () => control('.mm-inspector__moveButton');
    const why = () => control('.mm-inspector__why');
    const optionValues = select => [...select.options].map(option => option.value);
    const optionLabels = select => [...select.options].map(option => option.textContent);

    /**
     * Reach into the control the way a student does, with the keyboard or with a pointer. Nothing is
     * built before this: a map of two thousand nodes cannot afford a list per keystroke.
     *
     * The keyboard really goes in, rather than a `focusin` being posted at the control: whether the
     * control is open is asked of the document on every render, because a flag set here and never
     * cleared meant one Alt+M rebuilt the lists for the rest of the session.
     */
    const open = () => filter().focus();

    /** And back out again, which is what leaving the panel amounts to. */
    const leave = () => filter().blur();

    it('lists every node except the selected one and its own subtree', () => {
      selection.set('arg', { source: 'outline' });
      open();

      expect(optionValues(parent())).toEqual(['', ROOT_ID, 'src']);
    });

    it('names each candidate by its path, so two nodes called the same can be told apart', () => {
      selection.set('src', { source: 'outline' });
      open();

      expect(optionLabels(parent())).toEqual([
        'Choose a parent',
        'Essay plan',
        'Argument (under Essay plan)',
        'Evidence (under Argument, Essay plan)',
        'Counterpoint (under Argument, Essay plan)',
      ]);
    });

    it('narrows the list as the student types, and says how many are left', () => {
      selection.set('src', { source: 'outline' });

      typeInto(filter(), 'evid');

      expect(optionValues(parent())).toEqual(['', 'ev']);
      settle();
      expect(announce).toHaveBeenCalledWith('1 place matches "evid".');
    });

    it('says so when nothing matches, rather than offering an empty list in silence', () => {
      selection.set('src', { source: 'outline' });

      typeInto(filter(), 'bibliography');
      settle();

      expect(optionValues(parent())).toEqual(['']);
      expect(announce).toHaveBeenCalledWith('No place matches "bibliography".');
    });

    it('starts on the node’s own parent, so the control also reorders siblings', () => {
      selection.set('ev', { source: 'outline' });
      open();

      expect(parent().value).toBe('arg');
      // Last, because that is where a drag into a node puts it, and the two must agree.
      expect(place().value).toBe('last');
      expect(optionValues(place())).toEqual(['first', 'last', 'before:counter', 'after:counter']);
      expect(optionLabels(place())).toEqual(['First', 'Last', 'Counterpoint', 'Counterpoint']);
    });

    it('groups the named siblings under Before and After', () => {
      selection.set('ev', { source: 'outline' });
      open();
      const groups = [...place().querySelectorAll('optgroup')].map(group => group.label);

      expect(groups).toEqual(['Before', 'After']);
    });

    it('relists the places when a different parent is chosen', () => {
      selection.set('ev', { source: 'outline' });
      open();

      parent().value = ROOT_ID;
      parent().dispatchEvent(new window.Event('change', { bubbles: true }));

      expect(optionValues(place())).toEqual([
        'first',
        'last',
        'before:arg',
        'before:src',
        'after:arg',
        'after:src',
      ]);
    });

    // A student who types, chooses and presses Move quickly used to hear the match count land after
    // the move and replace "Moved…", so a screen reader never said the move had happened.
    it('a move made before the match count is said is not talked over by it', () => {
      selection.set('ev', { source: 'outline' });
      typeInto(filter(), 'sour');
      parent().value = 'src';
      parent().dispatchEvent(new window.Event('change', { bubbles: true }));
      place().value = 'last';

      activate(moveButton());
      settle();

      expect(announce).toHaveBeenLastCalledWith("Moved 'Evidence' into 'Sources'.");
      expect(announce).not.toHaveBeenCalledWith('1 place matches "sour".');
    });

    it('moves the node under a new parent in one undo step, and says so', () => {
      selection.set('ev', { source: 'outline' });
      open();
      parent().value = 'src';
      parent().dispatchEvent(new window.Event('change', { bubbles: true }));
      place().value = 'last';

      activate(moveButton());

      expect(history.current().nodes.src.children).toEqual(['ev']);
      expect(history.current().nodes.arg.children).toEqual(['counter']);
      expect(announce).toHaveBeenCalledWith("Moved 'Evidence' into 'Sources'.");
      history.undo();
      expect(history.current().nodes.arg.children).toEqual(['ev', 'counter']);
      expect(history.canUndo()).toBe(false);
    });

    it('puts it before a named sibling', () => {
      selection.set('counter', { source: 'outline' });
      open();
      place().value = 'before:ev';

      activate(moveButton());

      expect(history.current().nodes.arg.children).toEqual(['counter', 'ev']);
      expect(announce).toHaveBeenCalledWith("Moved 'Counterpoint' before 'Evidence'.");
    });

    it('puts it after a named sibling', () => {
      selection.set('ev', { source: 'outline' });
      open();
      place().value = 'after:counter';

      activate(moveButton());

      expect(history.current().nodes.arg.children).toEqual(['counter', 'ev']);
      expect(announce).toHaveBeenCalledWith("Moved 'Evidence' after 'Counterpoint'.");
    });

    it('puts it first among its new siblings', () => {
      selection.set('ev', { source: 'outline' });
      open();
      parent().value = ROOT_ID;
      parent().dispatchEvent(new window.Event('change', { bubbles: true }));
      place().value = 'first';

      activate(moveButton());

      expect(history.current().nodes[ROOT_ID].children).toEqual(['ev', 'arg', 'src']);
    });

    it('opens a shut branch it moves a node into, as one step', () => {
      history.apply('toggleCollapsed', { id: 'src' });
      selection.set('ev', { source: 'outline' });
      open();
      parent().value = 'src';
      parent().dispatchEvent(new window.Event('change', { bubbles: true }));
      place().value = 'last';

      activate(moveButton());

      expect(history.current().nodes.src.collapsed).toBe(false);
      expect(announce).toHaveBeenCalledWith("Moved 'Evidence' into 'Sources' and expanded it.");
      history.undo();
      expect(history.current().nodes.src.collapsed).toBe(true);
      expect(history.current().nodes.arg.children).toEqual(['ev', 'counter']);
    });

    it('keeps the node selected, brings it into view and puts the keyboard on the button', () => {
      const reveal = jest.fn();
      inspector.destroy();
      host.replaceChildren();
      inspector = mountInspector(host, { history, selection, announce, reveal });
      selection.set('ev', { source: 'outline' });
      open();
      place().value = 'after:counter';

      press(moveButton());

      expect(selection.get()).toBe('ev');
      expect(reveal).toHaveBeenCalledWith('ev');
      expect(document.activeElement).toBe(moveButton());
    });

    it('says the node is already there rather than cutting a step that changes nothing', () => {
      selection.set('ev', { source: 'outline' });
      open();
      place().value = 'first';
      const before = history.current();

      activate(moveButton());

      expect(history.current()).toBe(before);
      expect(announce).toHaveBeenCalledWith("'Evidence' is already there.");
    });

    it('refuses the centre in words, and stays reachable so the words can be read', () => {
      selection.set(ROOT_ID, { source: 'outline' });

      expect(moveButton().getAttribute('aria-disabled')).toBe('true');
      expect(moveButton().hasAttribute('disabled')).toBe(false);
      expect(moveButton().getAttribute('aria-describedby')).toBe(why().id);
      expect(why().textContent).toBe(
        'The centre of the map cannot be moved. Move one of its branches instead.'
      );
    });

    it('does nothing but say why when the refusing button is pressed', () => {
      selection.set(ROOT_ID, { source: 'outline' });
      const before = history.current();

      activate(moveButton());

      expect(history.current()).toBe(before);
      expect(announce).toHaveBeenCalledWith(
        'The centre of the map cannot be moved. Move one of its branches instead.'
      );
    });

    it('has nothing to say about a node that can move', () => {
      selection.set('ev', { source: 'outline' });

      expect(moveButton().getAttribute('aria-disabled')).toBe('false');
      expect(why().textContent).toBe('');
    });

    /**
     * The button said no and the three controls above it stayed live: a student filtered a list,
     * chose a parent and a place for the centre of the map, and only the press told them none of it
     * could happen. The refusal belongs to the whole control, in the same words and the same way the
     * button gives it - reachable, so the sentence beside it can still be read.
     */
    describe('a refusal covers the pickers as well as the button', () => {
      const moveControls = () => [filter(), parent(), place(), moveButton()];

      it('marks every control disabled and points each at the reason', () => {
        selection.set(ROOT_ID, { source: 'outline' });

        for (const control_ of moveControls()) {
          expect(control_.getAttribute('aria-disabled')).toBe('true');
          expect(control_.hasAttribute('disabled')).toBe(false);
          expect(control_.getAttribute('aria-describedby')).toBe(why().id);
        }
        expect(why().textContent).toBe(
          'The centre of the map cannot be moved. Move one of its branches instead.'
        );
      });

      it('opens them again for a node that can move', () => {
        selection.set(ROOT_ID, { source: 'outline' });
        selection.set('ev', { source: 'outline' });

        for (const control_ of moveControls()) {
          expect(control_.getAttribute('aria-disabled')).toBe('false');
        }
      });

      it('says why rather than counting places nothing can move to', () => {
        selection.set(ROOT_ID, { source: 'outline' });

        typeInto(filter(), 'ev');
        settle();

        expect(announce).toHaveBeenLastCalledWith(
          'The centre of the map cannot be moved. Move one of its branches instead.'
        );
      });
    });

    /**
     * Building the list of places means a path for every node in the map. Done on every history
     * change — and a write lands every 200 milliseconds while a student types, from this panel and
     * from the outline — that was 184 milliseconds a keystroke on a two thousand node map. The list
     * is worth building when the student reaches for it and at no other time.
     */
    describe('the list of places is built when it is wanted', () => {
      it('leaves the cross-link picker unbuilt until the student reaches into that form too', () => {
        selection.set('ev', { source: 'outline' });
        const link = labelled('Add link to');
        expect([...link.options].map(option => option.textContent)).toEqual(['Choose a node']);
        const paths = jest.spyOn(mapOps, 'walk');

        history.apply('setText', { id: 'src', text: 'Reading list' });

        expect(paths).not.toHaveBeenCalled();
        link.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
        expect([...link.options].map(option => option.value)).toEqual([
          '',
          ROOT_ID,
          'arg',
          'counter',
          'src',
        ]);
        paths.mockRestore();
      });

      it('offers a placeholder until the student reaches into the control', () => {
        selection.set('ev', { source: 'outline' });

        expect(optionLabels(parent())).toEqual(['Choose a parent']);
        expect(optionValues(place())).toEqual(['first', 'last']);
      });

      it('does no work per node while the control is closed', () => {
        selection.set('ev', { source: 'outline' });
        const paths = jest.spyOn(mapOps, 'pathTo');

        history.apply('setText', { id: 'src', text: 'Reading list' });
        history.apply('setText', { id: 'arg', text: 'The argument' });

        expect(paths).not.toHaveBeenCalled();
        expect(optionLabels(parent())).toEqual(['Choose a parent']);
        paths.mockRestore();
      });

      it('builds the lists once the control has focus', () => {
        selection.set('ev', { source: 'outline' });

        open();

        expect(optionValues(parent())).toEqual(['', ROOT_ID, 'arg', 'counter', 'src']);
      });

      it('builds them for a pointer before the picker opens', () => {
        selection.set('ev', { source: 'outline' });

        parent().dispatchEvent(new window.Event('pointerdown', { bubbles: true }));

        expect(optionValues(parent())).toEqual(['', ROOT_ID, 'arg', 'counter', 'src']);
      });

      it('does no work per node once the student has left the control again', () => {
        selection.set('ev', { source: 'outline' });
        open();
        expect(optionValues(parent()).length).toBeGreaterThan(1);

        leave();
        const walked = jest.spyOn(mapOps, 'walk');
        history.apply('setText', { id: 'src', text: 'Reading list' });

        expect(walked).not.toHaveBeenCalled();
        walked.mockRestore();
      });

      it('rebuilds them once, not once per node, when the map changes under an open control', () => {
        selection.set('ev', { source: 'outline' });
        open();
        const paths = jest.spyOn(mapOps, 'pathTo');

        history.apply('setText', { id: 'src', text: 'Reading list' });

        expect(paths).toHaveBeenCalled();
        expect(optionLabels(parent())).toContain('Reading list (under Essay plan)');
        paths.mockRestore();
      });

      it('builds nothing twice for a history change that changed no map', () => {
        selection.set('ev', { source: 'outline' });
        open();
        const paths = jest.spyOn(mapOps, 'pathTo');

        // The same text again: the op returns the same map, so nothing about the lists has moved.
        history.apply('setText', { id: 'src', text: 'Sources' });
        history.apply('setText', { id: 'src', text: 'Sources' });

        expect(paths).not.toHaveBeenCalled();
        paths.mockRestore();
      });
    });

    /**
     * The map can change under an open control — another tab, an undo, a generation — and the place
     * the student chose may not be there any more. Pressing Move used to throw a CYCLE out of the
     * ops and into the shared handler, which logged it: the button did nothing and said nothing.
     */
    describe('a place that is no longer there', () => {
      it('says so, and offers the list again, when the chosen parent has gone', () => {
        selection.set('ev', { source: 'outline' });
        open();
        parent().value = 'src';
        parent().dispatchEvent(new window.Event('change', { bubbles: true }));
        history.apply('removeNode', { id: 'src' });
        const before = history.current();

        activate(moveButton());

        expect(history.current()).toBe(before);
        expect(announce).toHaveBeenLastCalledWith(
          'That place is no longer available. Choose again.'
        );
        expect(optionValues(parent())).not.toContain('src');
      });

      it('says so when the sibling it was going beside has gone', () => {
        selection.set('ev', { source: 'outline' });
        open();
        place().value = 'before:counter';
        history.apply('removeNode', { id: 'counter' });
        const before = history.current();

        activate(moveButton());

        expect(history.current()).toBe(before);
        expect(announce).toHaveBeenLastCalledWith(
          'That place is no longer available. Choose again.'
        );
      });

      it('refuses a parent that has become part of the node’s own branch, in the drag’s words', () => {
        selection.set('arg', { source: 'outline' });
        open();
        parent().value = 'src';
        parent().dispatchEvent(new window.Event('change', { bubbles: true }));
        // Another pane moves Sources under Argument, so Argument can no longer go under Sources.
        history.apply('moveNode', { id: 'src', newParentId: 'arg' });
        const before = history.current();

        activate(moveButton());

        expect(history.current()).toBe(before);
        expect(announce).toHaveBeenLastCalledWith("'Argument' cannot move into its own branch.");
      });

      it('keeps the focus, the filter and a parent that is still there when the map changes', () => {
        selection.set('ev', { source: 'outline' });
        open();
        typeInto(filter(), 'sour');
        parent().value = 'src';
        parent().dispatchEvent(new window.Event('change', { bubbles: true }));
        parent().focus();

        history.apply('setText', { id: 'arg', text: 'The argument in full' });

        expect(document.activeElement).toBe(parent());
        expect(filter().value).toBe('sour');
        expect(parent().value).toBe('src');
      });
    });

    it('forgets the filter and the chosen parent when the selection moves', () => {
      selection.set('ev', { source: 'outline' });
      open();
      typeInto(filter(), 'sour');
      expect(optionValues(parent())).toEqual(['', 'src']);

      selection.set('counter', { source: 'outline' });

      // The term and the choice are the student's answer about the node they were on, and one press
      // of Move would send the next node somewhere they never chose. The list itself is rebuilt for
      // the node now selected, because the keyboard is still standing in the control.
      expect(filter().value).toBe('');
      expect(parent().value).toBe('arg');
      expect(optionValues(parent())).toEqual(['', ROOT_ID, 'arg', 'ev', 'src']);
    });

    it('forgets the pickers altogether when the student has left the control', () => {
      selection.set('ev', { source: 'outline' });
      open();
      typeInto(filter(), 'sour');
      leave();

      selection.set('counter', { source: 'outline' });

      expect(filter().value).toBe('');
      expect(optionLabels(parent())).toEqual(['Choose a parent']);
    });

    it('stays out of the fieldset that goes dead when nothing is selected', () => {
      expect(control('fieldset.mm-inspector__fields').disabled).toBe(true);
      expect(group().closest('fieldset.mm-inspector__fields')).toBeNull();
      expect(moveButton().disabled).toBe(false);
      expect(moveButton().getAttribute('aria-disabled')).toBe('true');
      expect(why().textContent).toBe('Select a node first.');
    });

    it('is where Alt+M sends the keyboard', () => {
      selection.set('ev', { source: 'outline' });

      inspector.focusMoveTo();

      expect(document.activeElement).toBe(filter());
    });

    it('hands the page the reason when Alt+M arrives somewhere it cannot act', () => {
      selection.set(ROOT_ID, { source: 'outline' });

      // The page shows it once, as a toast; saying it here as well would say it twice.
      expect(inspector.focusMoveTo()).toBe(
        'The centre of the map cannot be moved. Move one of its branches instead.'
      );
      expect(announce).not.toHaveBeenCalledWith(expect.stringContaining('cannot be moved'));
    });

    it('hands back nothing when the node can be moved', () => {
      selection.set('ev', { source: 'outline' });

      expect(inspector.focusMoveTo()).toBe('');
    });
  });

  describe('lifecycle', () => {
    it('drops its subscriptions and its markup on destroy', () => {
      selection.set('arg', { source: 'outline' });
      inspector.destroy();
      expect(host.querySelector('form.mm-inspector')).toBeNull();
      expect(() => history.apply('setText', { id: 'arg', text: 'After' })).not.toThrow();
    });
  });
});

/**
 * The invariant behind all of the above, stated once and then attacked, as the outline pane's own
 * 300-key run states it for the tree: whatever a student types in the Details panel, in whatever
 * order, no node in the map is ever left without a name.
 */
describe('no run of keys in the inspector leaves a nameless node', () => {
  /** A small seeded generator, so a failure names a run that can be played again. */
  const seeded = seed => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  let host;
  let history;
  let selection;
  let inspector;

  const field = labelText =>
    [...host.querySelectorAll('label')]
      .filter(label => label.textContent === labelText)
      .map(label => host.querySelector(`#${label.htmlFor}`))[0];

  beforeEach(() => {
    jest.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub();
    CitationStorageRPC.getAll.mockResolvedValue([]);
    inspector = mountInspector(host, { history, selection, announce: () => {} });
    selection.set('arg', { source: 'outline' });
  });

  afterEach(() => {
    inspector.destroy();
    host.remove();
    jest.useRealTimers();
  });

  const nameless = () =>
    Object.values(history.current().nodes)
      .filter(node => node.text.trim() === '')
      .map(node => node.id);

  for (const seed of [1, 2, 3, 4, 5]) {
    it(`holds through 300 keys (run ${seed})`, () => {
      const text = () => field('Text');
      const moves = [
        () => typeInto(text(), ''),
        () => typeInto(text(), '   '),
        () => typeInto(text(), 'Named'),
        () => typeInto(text(), ' Trailing '),
        () => typeInto(text(), 'x'),
        () => text().focus(),
        () => text().dispatchEvent(new window.FocusEvent('blur')),
        () =>
          text().dispatchEvent(
            new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
          ),
        () => selection.set('arg', { source: 'outline' }),
        () => selection.set('src', { source: 'canvas' }),
        () => selection.set('ev', { source: 'outline' }),
        () => selection.set(null, { source: 'program' }),
        () => jest.advanceTimersByTime(250),
        () => history.undo(),
        () => history.redo(),
      ];

      const next = seeded(seed);
      const played = [];
      for (let at = 0; at < 300; at += 1) {
        const move = Math.floor(next() * moves.length);
        played.push(move);
        moves[move]();
        expect({ played: played.join(','), stray: nameless() }).toEqual({
          played: played.join(','),
          stray: [],
        });
      }

      jest.advanceTimersByTime(250);
      expect(nameless()).toEqual([]);
    });
  }
});

describe('inspector with several nodes selected', () => {
  let host;
  let history;
  let selection;
  let announce;
  let inspector;

  const control = selector => host.querySelector(selector);
  const labelled = labelText =>
    [...host.querySelectorAll('label')]
      .filter(label => label.textContent === labelText)
      .map(label => host.querySelector(`#${label.htmlFor}`))[0];
  const fieldOf = element => element.closest('.mm-inspector__field');
  const colourRadios = () => [...host.querySelectorAll('.mm-inspector__colour input')];
  const describedText = element =>
    (element.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter(Boolean)
      .map(id => host.querySelector(`#${id}`)?.textContent || '')
      .join(' ');

  beforeEach(() => {
    jest.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub(null, { history });
    announce = jest.fn();
    CitationStorageRPC.getAll.mockResolvedValue([]);
    inspector = mountInspector(host, { history, selection, announce });
    selection.set('ev', { source: 'outline' });
  });

  afterEach(() => {
    inspector.destroy();
    host.remove();
    jest.useRealTimers();
  });

  const selectBoth = () => selection.selectAll(['ev', 'counter'], { source: 'outline' });

  it('says how many nodes it is showing', () => {
    expect(control('.mm-inspector__title').textContent).toBe('Node details');
    selectBoth();
    expect(control('.mm-inspector__title').textContent).toBe('2 nodes selected');
  });

  it('puts away the fields that only make sense for one node, and says why', () => {
    selectBoth();

    expect(fieldOf(labelled('Text')).hidden).toBe(true);
    expect(fieldOf(labelled('Notes')).hidden).toBe(true);
    expect(fieldOf(labelled('Source URL')).hidden).toBe(true);
    expect(fieldOf(labelled('Quote')).hidden).toBe(true);
    expect(fieldOf(labelled('Linked citation')).hidden).toBe(true);
    expect(control('.mm-inspector__links').hidden).toBe(true);
    expect(control('.mm-inspector__setNote').hidden).toBe(false);
    expect(control('.mm-inspector__setNote').textContent).toBe(
      'Text, notes, the source and citations are edited one node at a time.'
    );

    selection.set('ev', { source: 'outline' });
    expect(fieldOf(labelled('Text')).hidden).toBe(false);
    expect(control('.mm-inspector__setNote').hidden).toBe(true);
  });

  it('writes a colour to every selected node, as one undo step', () => {
    selectBoth();

    const second = colourRadios().find(radio => radio.value === '1');
    second.checked = true;
    second.dispatchEvent(new window.Event('change', { bubbles: true }));

    expect(history.current().nodes.ev.colour).toBe(1);
    expect(history.current().nodes.counter.colour).toBe(1);
    expect(announce.mock.calls.at(-1)[0]).toMatch(/^Branch colour .+ on 2 nodes\.$/);

    history.undo();
    expect(history.current().nodes.ev.colour).toBeNull();
    expect(history.current().nodes.counter.colour).toBeNull();
  });

  it('shows no colour checked and says Mixed when the nodes differ', () => {
    history.apply('setColour', { id: 'ev', colour: 1 });
    history.apply('setColour', { id: 'counter', colour: 2 });
    selectBoth();

    expect(colourRadios().some(radio => radio.checked)).toBe(false);
    expect(describedText(control('.mm-inspector__colours-group'))).toContain(
      'Mixed: these nodes have different colours.'
    );
  });

  it('shows the shared colour when every selected node has it', () => {
    history.apply('setColour', { id: 'ev', colour: 1 });
    history.apply('setColour', { id: 'counter', colour: 1 });
    selectBoth();

    expect(
      colourRadios()
        .filter(radio => radio.checked)
        .map(radio => radio.value)
    ).toEqual(['1']);
    expect(describedText(control('.mm-inspector__colours-group'))).not.toContain('Mixed');
  });

  it('marks the done box mixed when only some of them are done', () => {
    history.apply('setDone', { id: 'ev', done: true });
    selectBoth();

    const done = control('.mm-inspector__check input');
    // `indeterminate` and nothing else: ARIA in HTML says not to put aria-checked on a native
    // checkbox, and the native third state already reads as "mixed".
    expect(done.indeterminate).toBe(true);
    expect(done.hasAttribute('aria-checked')).toBe(false);
    expect(describedText(done)).toContain('Mixed: some of these nodes are done.');
  });

  it('ticks every selected node from the one box, as one undo step', () => {
    selectBoth();
    const done = control('.mm-inspector__check input');
    done.checked = true;
    done.dispatchEvent(new window.Event('change', { bubbles: true }));

    expect(history.current().nodes.ev.done).toBe(true);
    expect(history.current().nodes.counter.done).toBe(true);
    expect(announce).toHaveBeenLastCalledWith('Marked 2 nodes done.');
    expect(done.indeterminate).toBe(false);
    expect(done.hasAttribute('aria-checked')).toBe(false);

    history.undo();
    expect(history.current().nodes.ev.done).toBe(false);
    expect(history.current().nodes.counter.done).toBe(false);
  });

  it('writes a symbol to every selected node, and says Mixed when they differ', () => {
    history.apply('setSymbol', { id: 'ev', symbol: '❗' });
    selectBoth();

    const symbol = labelled('Symbol');
    expect(symbol.value).toBe('');
    expect(describedText(symbol)).toContain('Mixed: these nodes have different symbols.');

    activate([...host.querySelectorAll('.mm-inspector__quickPick button')][0]);

    expect(history.current().nodes.ev.symbol).toBe('⭐');
    expect(history.current().nodes.counter.symbol).toBe('⭐');
    expect(announce).toHaveBeenLastCalledWith('Symbol ⭐ on 2 nodes.');
  });

  it('clears the symbol from every selected node', () => {
    history.apply('setSymbol', { id: 'ev', symbol: '⭐' });
    history.apply('setSymbol', { id: 'counter', symbol: '❗' });
    selectBoth();

    activate(control('.mm-inspector__symbolRow > button'));

    expect(history.current().nodes.ev.symbol).toBeNull();
    expect(history.current().nodes.counter.symbol).toBeNull();
    expect(announce).toHaveBeenLastCalledWith('Symbol cleared on 2 nodes.');
  });

  it('moves the whole set to a new parent, as one undo step', () => {
    selectBoth();
    const parent = labelled('New parent');
    parent.dispatchEvent(new window.Event('focusin', { bubbles: true }));
    parent.value = 'src';
    parent.dispatchEvent(new window.Event('change', { bubbles: true }));

    activate(control('.mm-inspector__moveButton'));

    expect(history.current().nodes.src.children).toEqual(['ev', 'counter']);
    expect(announce).toHaveBeenCalledWith("Moved 2 nodes into 'Sources'.");

    history.undo();
    expect(history.current().nodes.arg.children).toEqual(['ev', 'counter']);
  });

  it('never offers a selected node or its branch as the new parent', () => {
    selection.selectAll(['arg', 'src'], { source: 'outline' });
    const parent = labelled('New parent');
    parent.dispatchEvent(new window.Event('focusin', { bubbles: true }));

    const offered = [...parent.options].map(option => option.value);
    expect(offered).not.toContain('arg');
    expect(offered).not.toContain('src');
    expect(offered).not.toContain('ev');
    expect(offered).toContain(ROOT_ID);
  });

  it('will not offer a place beside a sibling that is moving too', () => {
    selectBoth();
    const parent = labelled('New parent');
    parent.dispatchEvent(new window.Event('focusin', { bubbles: true }));
    parent.value = 'arg';
    parent.dispatchEvent(new window.Event('change', { bubbles: true }));

    expect([...labelled('Place it').options].map(option => option.value)).toEqual([
      'first',
      'last',
    ]);
  });

  it('says the centre stays put rather than refusing the whole set', () => {
    selection.selectAll([ROOT_ID, 'ev'], { source: 'outline' });
    expect(control('.mm-inspector__moveButton').getAttribute('aria-disabled')).toBe('false');

    selection.set(ROOT_ID, { source: 'outline' });
    expect(control('.mm-inspector__moveButton').getAttribute('aria-disabled')).toBe('true');
    expect(control('.mm-inspector__move .mm-inspector__why').textContent).toBe(
      'The centre of the map cannot be moved. Move one of its branches instead.'
    );
  });

  it('builds no list per node for a set while the move control is shut', () => {
    const walked = jest.spyOn(mapOps, 'walk');
    selectBoth();
    history.apply('setText', { id: 'src', text: 'Reading list' });

    expect(walked).not.toHaveBeenCalled();
    walked.mockRestore();
  });
});

/**
 * A write that is waiting on a timer lands before anything else happens.
 *
 * The debounce exists so that typing costs one undo step rather than one per keystroke, and the
 * arguments are captured per call so a late write still goes to the node it was typed into. What it
 * must not do is arrive 200 ms into whatever the student did next: a step from this panel landing in
 * the middle of another pane's rename is what stops that rename being folded into one step, and used
 * to leave an emptied name on the undo stack.
 */
describe('a write still on its timer', () => {
  let host;
  let history;
  let selection;
  let inspector;

  const field = labelText =>
    [...host.querySelectorAll('label')]
      .filter(label => label.textContent === labelText)
      .map(label => host.querySelector(`#${label.htmlFor}`))[0];

  beforeEach(() => {
    jest.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub(null, { history });
    CitationStorageRPC.getAll.mockResolvedValue([]);
    inspector = mountInspector(host, { history, selection, announce: () => {} });
    selection.set('ev', { source: 'outline' });
  });

  afterEach(() => {
    inspector.destroy();
    host.remove();
    jest.useRealTimers();
  });

  it('lands on the node it was typed into, the moment the selection moves', () => {
    typeInto(field('Notes'), 'Evidence from chapter two');

    selection.set('counter', { source: 'outline' });

    // Written already, on the FIRST node, with no timer left to fire into whatever comes next.
    expect(history.current().nodes.ev.notes).toBe('Evidence from chapter two');
    expect(history.current().nodes.counter.notes).toBe('');
    const after = history.current();
    jest.advanceTimersByTime(250);
    expect(history.current()).toBe(after);
  });

  it('lands the moment the keyboard leaves the field', () => {
    const notes = field('Notes');
    notes.focus();
    typeInto(notes, 'Half a sentence');

    notes.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));

    expect(history.current().nodes.ev.notes).toBe('Half a sentence');
    const after = history.current();
    jest.advanceTimersByTime(250);
    expect(history.current()).toBe(after);
  });

  it('writes the text and the symbol it was holding too, and nothing it was not', () => {
    typeInto(field('Text'), 'Evidence, reworded');
    typeInto(field('Symbol'), '⭐');

    selection.set('arg', { source: 'outline' });

    expect(history.current().nodes.ev.text).toBe('Evidence, reworded');
    expect(history.current().nodes.ev.symbol).toBe('⭐');
    expect(history.current().nodes.arg.text).toBe('Argument');
  });

  it('still writes nothing at all for a name the student emptied', () => {
    typeInto(field('Text'), '');

    selection.set('arg', { source: 'outline' });

    expect(history.current().nodes.ev.text).toBe('Evidence');
  });
});

/**
 * "Focus on this branch" with four nodes selected.
 *
 * The button acts on the PRIMARY node - the one the student is standing on - and a set of four gives
 * no hint of which that is. The name stays put (it carries `aria-pressed`, and a name that moves
 * under the state reads as a different control), so the sentence beside it is what says which node.
 */
describe('focus on this branch, from a set', () => {
  let host;
  let history;
  let selection;
  let inspector;
  let reason;
  let on;

  const focusButton = () => host.querySelector('.mm-inspector__focusButton');
  const focusWhy = () => host.querySelector('.mm-inspector__focusField .mm-inspector__why');

  const mount = () => {
    inspector = mountInspector(host, {
      history,
      selection,
      announce: () => {},
      branchFocus: {
        reason: () => reason,
        isOn: () => on,
        toggle: () => {},
        subscribe: () => () => {},
      },
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    selection = createSelectionStub(null, { history });
    CitationStorageRPC.getAll.mockResolvedValue([]);
    reason = '';
    on = false;
    mount();
    selection.set('ev', { source: 'outline' });
  });

  afterEach(() => {
    inspector.destroy();
    host.remove();
    jest.useRealTimers();
  });

  it('says which of the selected nodes it would focus on', () => {
    selection.selectAll(['counter', 'ev'], { source: 'outline' });

    expect(selection.get()).toBe('ev');
    expect(focusWhy().textContent).toBe("Focuses on 'Evidence', the node you are on.");
    expect(focusButton().getAttribute('aria-describedby')).toBe(focusWhy().id);
    // The name is the state's, not the node's.
    expect(focusButton().textContent).toBe('Focus on this branch');
  });

  it('has nothing to explain about a single node', () => {
    expect(focusWhy().textContent).toBe('');
  });

  it('gives the refusal instead when there is one', () => {
    reason = 'Focusing the centre would show the whole map, which is what you are looking at.';
    selection.selectAll(['counter', 'ev'], { source: 'outline' });

    expect(focusWhy().textContent).toBe(reason);
    expect(focusButton().getAttribute('aria-disabled')).toBe('true');
  });

  it('says nothing about a node while the branch is already on screen', () => {
    on = true;
    selection.selectAll(['counter', 'ev'], { source: 'outline' });

    expect(focusButton().getAttribute('aria-pressed')).toBe('true');
    expect(focusWhy().textContent).toBe('');
  });
});
