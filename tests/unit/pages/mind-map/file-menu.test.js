/**
 * @jest-environment jsdom
 *
 * The File menu.
 *
 * One menu holds everything a map does with files: start one, open one, save, save a copy, bring a
 * file in from another tool, and send one of seven formats out. The exports are graded on the bytes
 * that leave — the file name, the MIME type and the text the serialiser produced — and the imports
 * on what a real File dropped on the real input turns into. jsdom has no object URLs, no canvas, no
 * clipboard and no inflater, so those four are stood up here; everything else, including the whole
 * menu keyboard, is the real thing.
 *
 * The four map commands are callbacks the page supplies, the way every other module on this page
 * is handed what it cannot do for itself. What is graded here is that pressing the item calls the
 * callback and closes the menu — the storage and the dialogs behind them belong to their own specs.
 */

import { DecompressionStream as NodeDecompressionStream } from 'node:stream/web';

import {
  fromFreeMind,
  toFreeMind
} from '../../../../src/features/mindMap/core/serialisers/freemind.js';
import { MindMapError } from '../../../../src/features/mindMap/core/map-model.js';
import { addChild } from '../../../../src/features/mindMap/core/map-ops.js';
import { MAX_DEPTH } from '../../../../src/features/mindMap/core/serialisers/import-map.js';
import { toMarkdown } from '../../../../src/features/mindMap/core/serialisers/markdown.js';
import { attachAccessibleHandler } from '../../../../src/utils/event-handlers.js';
import { mountFileMenu } from '../../../../src/pages/mind-map/file-menu.js';
import { IMPORT_ACCEPT } from '../../../../src/pages/mind-map/import-flow.js';
import { buildZip } from '../../utils/zip-fixtures.js';
import { branchView } from '../../../../src/features/mindMap/core/branch-view.js';

import { activate, makeHistory, makeMap, mouse, press } from './pane-fixtures.js';

/** jsdom hides the platform inflater, so every zip read here goes through Node's. */
const inflater = NodeDecompressionStream;

/** A FreeMind file with a note, a colour, a tick and a cross-link, as Freeplane would write one. */
const FREEMIND = [
  '<map version="1.0.1">',
  '  <node ID="n1" TEXT="Biology">',
  '    <node ID="n2" TEXT="Cells" BACKGROUND_COLOR="#e8f0d8">',
  '      <richcontent TYPE="NOTE"><html><body><p>Membrane first.</p></body></html></richcontent>',
  '      <arrowlink DESTINATION="n3"/>',
  '    </node>',
  '    <node ID="n3" TEXT="Enzymes"><icon BUILTIN="button_ok"/></node>',
  '  </node>',
  '</map>',
  ''
].join('\n');

/** An indented outline, which is what Coggle hands over as text. */
const OUTLINE_TEXT = ['Revision', '\tCells', '\t\tMembrane', '\tEnzymes', ''].join('\n');

/**
 * An `.xmind` archive built byte by byte, deflated the way XMind writes one.
 *
 * The attachment carries a deliberately wrong checksum: it must never be unpacked, and a reader
 * that unpacked everything would refuse this whole file over a picture nothing reads.
 *
 * @param {string} name - the file name the student's disk gives it.
 * @param {Array<Object>} sheets - the `content.json` payload.
 * @returns {File}
 */
const xmindFile = (name, sheets) =>
  new window.File(
    [
      buildZip([
        { name: 'content.json', data: JSON.stringify(sheets), method: 8 },
        { name: 'attachments/diagram.png', data: 'not really a picture', method: 8, crc: 1 }
      ])
    ],
    name,
    { type: 'application/octet-stream' }
  );

const ONE_SHEET = [
  {
    id: 's1',
    rootTopic: {
      id: 'r',
      title: 'Biology',
      children: { attached: [{ id: 'c1', title: 'Cells' }, { id: 'c2', title: 'Enzymes' }] }
    }
  }
];

const TWO_SHEETS = [
  { id: 's1', title: 'Cells', rootTopic: { id: 'r', title: 'Biology' } },
  { id: 's2', title: 'Genetics', rootTopic: { id: 'r2', title: 'Genetics' } }
];

const THREE_SHEETS = [
  { id: 's1', title: 'Cells', rootTopic: { id: 'r', title: 'Biology' } },
  { id: 's2', title: 'Enzymes', rootTopic: { id: 'r2', title: 'Enzymes' } },
  { id: 's3', title: 'Genetics', rootTopic: { id: 'r3', title: 'Genetics' } }
];

const BUSY_REFUSAL =
  'AssisT is still opening a file, so wait for that to finish before picking another.';

/** Blobs remember what they were built from, so a test can read the bytes that would be saved. */
class RecordingBlob extends window.Blob {
  constructor(parts, blobOptions) {
    super(parts, blobOptions);
    this.parts = parts;
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('file menu', () => {
  let host;
  let history;
  let announce;
  let onImport;
  let commands;
  let downloads;
  let notify;
  let originalBlob;
  let clickSpy;
  let menu;

  beforeEach(() => {
    originalBlob = window.Blob;
    window.Blob = RecordingBlob;
    global.Blob = RecordingBlob;

    downloads = [];
    window.URL.createObjectURL = jest.fn(blob => {
      downloads.push({ blob });
      return `blob:mind-map-${downloads.length}`;
    });
    window.URL.revokeObjectURL = jest.fn();
    clickSpy = jest
      .spyOn(window.HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function record() {
        downloads[downloads.length - 1].filename = this.download;
      });

    host = document.createElement('div');
    document.body.appendChild(host);
    history = makeHistory();
    announce = jest.fn();
    // The page's `notify` IS `showToast`, which writes the toast AND the live region, prefixing a
    // failure with "Problem:". A bare `jest.fn()` here is what hid every sentence being announced
    // twice: this counts what a screen reader would actually read out.
    notify = jest.fn((text, kind = 'info') =>
      announce(kind === 'error' ? `Problem: ${text}` : text)
    );
    onImport = jest.fn();
    commands = {
      onNew: jest.fn(),
      onOpen: jest.fn(),
      onSave: jest.fn(),
      onSaveAs: jest.fn()
    };
    menu = mountFileMenu(host, {
      history,
      announce,
      notify,
      onImport,
      ...commands,
      decompressionStream: inflater,
      getSvgElement: () => ({ dataset: { layoutMode: 'map' } })
    });
  });

  afterEach(() => {
    menu.destroy();
    host.remove();
    clickSpy.mockRestore();
    window.Blob = originalBlob;
    global.Blob = originalBlob;
  });

  const button = () => host.querySelector('.mm-file__button');
  const panel = () => host.querySelector('[role="menu"]');
  const items = () => [...host.querySelectorAll('[role="menuitem"]')];
  const item = label => items().find(candidate => candidate.textContent === label);
  const lastDownload = () => downloads[downloads.length - 1];
  const savedText = () => lastDownload().blob.parts[0];

  describe('the menu itself', () => {
    it('is a File button that owns a menu', () => {
      expect(button().textContent).toBe('File');
      expect(button().getAttribute('aria-haspopup')).toBe('menu');
      expect(button().getAttribute('aria-expanded')).toBe('false');
      expect(button().getAttribute('aria-controls')).toBe(panel().id);
      expect(panel().hidden).toBe(true);
    });

    it('offers the map commands first, then the ways a map leaves', () => {
      expect(items().map(entry => entry.textContent)).toEqual([
        'New map…',
        'Open…',
        'Save',
        'Save as…',
        'Import a file…',
        'Markdown (.md)',
        'OPML (.opml)',
        'FreeMind (.mm)',
        'JSON (.json)',
        'SVG (.svg)',
        'PNG (.png)',
        'Copy as Markdown'
      ]);
    });

    // Seven exports in a flat list of twelve items is a wall; the group says what the last seven
    // are for. It is named for a screen reader and titled on screen, so neither reading loses it.
    it('gathers the exports into a named group', () => {
      const group = panel().querySelector('[role="group"]');
      expect(group.getAttribute('aria-label')).toBe('Export');
      expect(group.querySelector('.mm-file__group-label').textContent).toBe('Export');
      expect([...group.querySelectorAll('[role="menuitem"]')].map(entry => entry.textContent)).toEqual([
        'Markdown (.md)',
        'OPML (.opml)',
        'FreeMind (.mm)',
        'JSON (.json)',
        'SVG (.svg)',
        'PNG (.png)',
        'Copy as Markdown'
      ]);
      // A heading inside a menu is not a menu item, and a screen reader walking the items should
      // not trip over it; the group's own name carries the word.
      expect(group.querySelector('.mm-file__group-label').getAttribute('aria-hidden')).toBe('true');
    });

    it('separates the commands from each other and from the file work', () => {
      expect(panel().querySelectorAll('[role="separator"]').length).toBe(2);
    });

    it('answers the keyboard, not only the pointer (SC 2.1.1)', () => {
      activate(button());
      expect(panel().hidden).toBe(false);

      activate(item('Markdown (.md)'));

      expect(panel().hidden).toBe(true);
      expect(lastDownload().filename).toBe('essay-plan.md');
    });

    it('carries the hooks the browser suite selects it by', () => {
      expect(button().dataset.testid).toBe('file-button');
      expect(host.querySelector('input[type="file"]').dataset.testid).toBe('file-import');
    });

    it('opens onto the first item', () => {
      press(button());
      expect(panel().hidden).toBe(false);
      expect(button().getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(items()[0]);
    });

    // The exports sit inside a group element, so the roving focus has to walk the items rather
    // than the menu's own children: an arrow key that stopped at the group boundary would strand
    // the keyboard three items short of the PNG export.
    it('moves with the arrow keys across the group boundary and wraps at both ends', () => {
      press(button());
      const list = items();
      const key = name =>
        panel().dispatchEvent(new window.KeyboardEvent('keydown', { key: name, bubbles: true }));

      key('ArrowDown');
      expect(document.activeElement).toBe(list[1]);
      key('ArrowUp');
      key('ArrowUp');
      expect(document.activeElement).toBe(list[list.length - 1]);
      key('Home');
      expect(document.activeElement).toBe(list[0]);
      key('End');
      expect(document.activeElement).toBe(list[list.length - 1]);

      // Step from the last command into the first export and back out again.
      key('Home');
      for (let step = 0; step < 5; step += 1) {
        key('ArrowDown');
      }
      expect(document.activeElement).toBe(item('Markdown (.md)'));
      key('ArrowUp');
      expect(document.activeElement).toBe(item('Import a file…'));
    });

    it('closes on Escape and hands focus back to the button', () => {
      press(button());
      panel().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(panel().hidden).toBe(true);
      expect(document.activeElement).toBe(button());
    });

    it('closes when the pointer goes elsewhere', () => {
      press(button());
      document.body.dispatchEvent(mouse('mousedown'));
      expect(panel().hidden).toBe(true);
    });

    // Every control on this page is wired through the shared event helper, which stops the press
    // dead on its way up. A menu listening in the bubble phase hears none of them, so pressing
    // Help, Undo, a dock tab or an outline row left this menu standing open over the page, with
    // aria-expanded still saying so.
    it('closes when a control that stops its own press is used elsewhere', () => {
      const elsewhere = document.createElement('button');
      elsewhere.type = 'button';
      document.body.appendChild(elsewhere);
      const release = attachAccessibleHandler(elsewhere, 'Elsewhere', () => {});

      press(button());
      press(elsewhere);

      expect(panel().hidden).toBe(true);
      expect(button().getAttribute('aria-expanded')).toBe('false');

      release();
      elsewhere.remove();
    });

    // Opening always puts the keyboard on the first item, and a hidden element cannot hold it:
    // Chrome drops it on the body, which is the top of the page with the student's place lost.
    it('takes the keyboard off an item it is hiding', () => {
      press(button());
      expect(document.activeElement).toBe(items()[0]);

      document.body.dispatchEvent(mouse('mousedown'));

      expect(document.activeElement).toBe(button());
    });

    it('hands the keyboard back to the button before Tab leaves the menu', () => {
      press(button());
      panel().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

      expect(panel().hidden).toBe(true);
      expect(document.activeElement).toBe(button());
    });

    it('stays open long enough for the item that was pressed to run', () => {
      press(button());
      press(item('Markdown (.md)'));
      expect(lastDownload().filename).toBe('essay-plan.md');
      expect(panel().hidden).toBe(true);
    });
  });

  describe('the map commands', () => {
    // Each of these opens a dialog or writes to the database, so the menu closes first: a menu
    // left open behind a modal is a menu the student comes back to still showing.
    it.each([
      ['New map…', 'onNew'],
      ['Open…', 'onOpen'],
      ['Save', 'onSave'],
      ['Save as…', 'onSaveAs']
    ])('%s calls the page and closes the menu', (label, command) => {
      activate(button());
      activate(item(label));

      expect(commands[command]).toHaveBeenCalledTimes(1);
      expect(panel().hidden).toBe(true);
    });

    it('leaves the keyboard on the File button, not on an item that has gone', () => {
      activate(button());
      activate(item('Save'));

      expect(document.activeElement).toBe(button());
    });
  });

  describe('exports', () => {
    beforeEach(() => press(button()));

    it('saves Markdown under the map title', () => {
      press(item('Markdown (.md)'));
      expect(lastDownload().filename).toBe('essay-plan.md');
      expect(lastDownload().blob.type).toBe('text/markdown;charset=utf-8');
      expect(savedText()).toBe(toMarkdown(makeMap()));
      expect(announce).toHaveBeenCalledWith('Downloaded essay-plan.md');
    });

    it('saves OPML', () => {
      press(item('OPML (.opml)'));
      expect(lastDownload().filename).toBe('essay-plan.opml');
      expect(savedText()).toContain('<opml version="2.0">');
      expect(savedText()).toContain('text="Argument"');
    });

    it('saves JSON that reads back as the same map', () => {
      press(item('JSON (.json)'));
      expect(lastDownload().filename).toBe('essay-plan.json');
      expect(JSON.parse(savedText())).toEqual(history.current());
    });

    // The interchange format (ADR 0003): what a student hands to a tutor who uses anything else.
    it('saves a FreeMind file that reads back as the same map', () => {
      press(item('FreeMind (.mm)'));
      expect(lastDownload().filename).toBe('essay-plan.mm');
      expect(lastDownload().blob.type).toBe('application/x-freemind;charset=utf-8');
      expect(savedText()).toBe(toFreeMind(makeMap()));

      let serial = 0;
      const returned = fromFreeMind(savedText(), {
        title: 'essay-plan',
        ids: () => `back-${(serial += 1)}`
      });
      const shape = map =>
        Object.values(map.nodes)
          .map(node => [node.text, node.notes, node.done, node.collapsed, node.symbol].join('|'))
          .sort();
      expect(shape(returned)).toEqual(shape(makeMap()));
      expect(announce).toHaveBeenCalledWith('Downloaded essay-plan.mm');
    });

    // A student sending a map out has to be told what will not be in it before they send it, and a
    // tooltip is not an answer: it is unreachable from the keyboard and unread by a screen reader.
    it('says where a FreeMind file opens and what does not travel', () => {
      const entry = item('FreeMind (.mm)');
      const hint = document.getElementById(entry.getAttribute('aria-describedby'));
      expect(hint.textContent).toBe(
        'Opens in XMind, Coggle, MindMeister and Freeplane. Colour, symbols, ticks and cross-links' +
          ' travel; a captured quote and its source become part of the note, and a citation link is' +
          ' left behind.'
      );
      // The words reach a screen reader as the item's description; a stray run of text inside a
      // menu would otherwise be one more thing to walk past.
      expect(hint.getAttribute('aria-hidden')).toBe('true');
      expect(hint.closest('[role="menuitem"]')).toBeNull();
    });

    it('saves an SVG picture of the whole map, not of the viewport', () => {
      press(item('SVG (.svg)'));
      expect(lastDownload().filename).toBe('essay-plan.svg');
      expect(savedText()).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(savedText()).toContain('<title id="mindmap-title">Essay plan</title>');
      expect(savedText()).toContain('Counterpoint');
    });

    it('names the file from the current title', () => {
      history.apply('setTitle', { title: 'Revision: Photosynthesis (week 3)' });
      press(item('Markdown (.md)'));
      expect(lastDownload().filename).toBe('revision-photosynthesis-week-3.md');
    });

    it('has a name of its own for a title a file system could not take', () => {
      history.apply('setTitle', { title: '***' });
      press(item('Markdown (.md)'));
      expect(lastDownload().filename).toBe('mind-map.md');
    });

    it('never runs a name past sixty characters, or ends one on a hyphen', () => {
      history.apply('setTitle', { title: 'a '.repeat(80) });
      press(item('Markdown (.md)'));

      const name = lastDownload().filename.replace(/\.md$/, '');
      expect(name.length).toBeLessThanOrEqual(60);
      expect(name.endsWith('-')).toBe(false);
    });
  });

  describe('PNG', () => {
    it('rasterises the SVG onto a white ground and saves it', async () => {
      const context = { fillStyle: '', fillRect: jest.fn(), drawImage: jest.fn() };
      const getContext = jest
        .spyOn(window.HTMLCanvasElement.prototype, 'getContext')
        .mockReturnValue(context);
      window.HTMLCanvasElement.prototype.toBlob = function toBlob(callback) {
        callback(new RecordingBlob(['png-bytes'], { type: 'image/png' }));
      };
      // jsdom never loads an image, so the load is stood up here.
      const OriginalImage = window.Image;
      window.Image = class FakeImage {
        set src(value) {
          this.source = value;
          Promise.resolve().then(() => this.onload());
        }
      };
      global.Image = window.Image;

      press(button());
      press(item('PNG (.png)'));
      await flush();

      expect(context.fillStyle).toBe('#ffffff');
      expect(context.fillRect).toHaveBeenCalled();
      expect(context.drawImage).toHaveBeenCalled();
      expect(lastDownload().filename).toBe('essay-plan.png');
      expect(announce).toHaveBeenCalledWith('Downloaded essay-plan.png');

      window.Image = OriginalImage;
      global.Image = OriginalImage;
      getContext.mockRestore();
    });

    it('says so rather than failing silently when the canvas refuses a context', async () => {
      const getContext = jest
        .spyOn(window.HTMLCanvasElement.prototype, 'getContext')
        .mockReturnValue(null);

      press(button());
      press(item('PNG (.png)'));
      await flush();

      // A live region alone reaches a screen reader and nobody else; the same words go on screen.
      // `showToast` does both from one call, so the words are written to the live region once.
      expect(notify).toHaveBeenCalledWith(
        'This browser could not draw the picture, so try the SVG export instead.',
        'error'
      );
      expect(announce.mock.calls).toEqual([
        ['Problem: This browser could not draw the picture, so try the SVG export instead.'],
      ]);
      getContext.mockRestore();
    });

    it('shows the reason a picture could not be drawn, as well as saying it', async () => {
      const context = { fillStyle: '', fillRect: jest.fn(), drawImage: jest.fn() };
      const getContext = jest
        .spyOn(window.HTMLCanvasElement.prototype, 'getContext')
        .mockReturnValue(context);
      const OriginalImage = window.Image;
      window.Image = class FailingImage {
        set src(value) {
          this.source = value;
          Promise.resolve().then(() => this.onerror());
        }
      };
      global.Image = window.Image;

      press(button());
      press(item('PNG (.png)'));
      await flush();

      expect(notify).toHaveBeenCalledWith(
        'The picture could not be saved: The picture could not be drawn.',
        'error'
      );
      expect(announce.mock.calls).toEqual([
        ['Problem: The picture could not be saved: The picture could not be drawn.'],
      ]);

      window.Image = OriginalImage;
      global.Image = OriginalImage;
      getContext.mockRestore();
    });
  });

  describe('copy', () => {
    it('puts the markdown on the clipboard', async () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText },
        configurable: true
      });

      press(button());
      press(item('Copy as Markdown'));
      await flush();

      expect(writeText).toHaveBeenCalledWith(toMarkdown(makeMap()));
      expect(announce).toHaveBeenCalledWith('Copied the map as Markdown');
      expect(notify).not.toHaveBeenCalled();
    });

    it('shows a refused clipboard rather than only announcing it', async () => {
      Object.defineProperty(window.navigator, 'clipboard', {
        value: undefined,
        configurable: true
      });

      press(button());
      press(item('Copy as Markdown'));
      await flush();

      expect(notify).toHaveBeenCalledWith(
        'This browser did not allow copying; use the Markdown download instead.',
        'error'
      );
    });
  });

  /*
   * Markdown carries depth as indentation, and the import reads a hundred levels, so anything
   * past that is written at the last one: levels a student built come back as siblings. Every
   * other export keeps them. A student who is not told chooses the export that loses their work.
   */
  describe('a map deeper than Markdown can hold', () => {
    const DEEP_NOTICE =
      'This map is more than 100 levels deep, so Markdown lists the deeper levels side by side.' +
      ' FreeMind and OPML keep every level.';

    /** A map indented past the deepest level an import reads. */
    const deepMap = () => {
      let map = makeMap();
      let parentId = map.rootId;
      for (let level = 0; level <= MAX_DEPTH; level += 1) {
        const id = `deep-${level}`;
        map = addChild(map, { parentId, node: { id, text: `Level ${level}` } });
        parentId = id;
      }
      return map;
    };

    /** Mount the menu over a map of this test's choosing, in place of the shallow default. */
    const over = map => {
      menu.destroy();
      history = makeHistory(map);
      menu = mountFileMenu(host, {
        history,
        announce,
        notify,
        onImport,
        ...commands,
        decompressionStream: inflater,
        getSvgElement: () => ({ dataset: { layoutMode: 'map' } })
      });
    };

    const stubClipboard = () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText },
        configurable: true
      });
      return writeText;
    };

    it('says so once after the Markdown download, and says which exports keep the levels', () => {
      over(deepMap());

      press(button());
      press(item('Markdown (.md)'));

      // The file still leaves: a map that is too deep for Markdown is still worth exporting.
      expect(lastDownload().filename).toBe('essay-plan.md');
      expect(notify.mock.calls).toEqual([[DEEP_NOTICE, 'info']]);
    });

    it('says so once after Copy as Markdown', async () => {
      over(deepMap());
      stubClipboard();

      press(button());
      press(item('Copy as Markdown'));
      await flush();

      expect(notify.mock.calls).toEqual([[DEEP_NOTICE, 'info']]);
    });

    it('says nothing of the kind for a map Markdown holds', async () => {
      stubClipboard();

      press(button());
      press(item('Markdown (.md)'));
      press(button());
      press(item('Copy as Markdown'));
      await flush();

      expect(notify).not.toHaveBeenCalled();
    });
  });

  describe('import', () => {
    const input = () => host.querySelector('input[type="file"]');

    /** Enough turns of the loop for a file read and a zip inflate to finish. */
    const settle = async () => {
      for (let turn = 0; turn < 12; turn += 1) {
        await flush();
      }
    };

    /** Put a file on the input the way the picker does, without settling it. */
    const offer = file => {
      Object.defineProperty(input(), 'files', { value: [file], configurable: true });
      input().dispatchEvent(new window.Event('change', { bubbles: true }));
    };

    const pick = async file => {
      offer(file);
      await settle();
    };

    const chooseFile = (name, text) =>
      pick(new window.File([text], name, { type: 'text/plain' }));

    /** Everything a screen reader would read out, in order. */
    const spoken = () => announce.mock.calls.map(call => call[0]);

    /** The map the page was handed, and the sentence it was told to carry across the navigation. */
    const handed = () => onImport.mock.calls[onImport.mock.calls.length - 1];
    const imported = () => handed()[0];
    const outcome = () => handed()[1];

    const importItem = () => item('Import a file…');
    const nodeTexts = map => Object.values(map.nodes).map(node => node.text);

    it('offers a file input restricted to the formats it can read', () => {
      expect(input().accept).toBe('.mm,.xmind,.md,.markdown,.opml,.xml,.json,.txt');
      expect(input().accept).toBe(IMPORT_ACCEPT);
      expect(input().getAttribute('aria-label')).toBe('Import a mind map file');
    });

    it('reads a markdown outline and hands the map back', async () => {
      await chooseFile('lecture-notes.md', '# Lecture notes\n\n- Cells\n  - Membrane\n');
      expect(onImport).toHaveBeenCalledTimes(1);
      expect(imported().title).toBe('Lecture notes');
      expect(nodeTexts(imported())).toEqual(expect.arrayContaining(['Cells', 'Membrane']));
      // The heading names the map and the one top-level bullet is its centre, so the file that
      // reads as three lines is two nodes; the sentence counts what arrived, not what was typed.
      expect(outcome()).toBe("Opened 'Lecture notes' from Markdown: 2 nodes.");
    });

    it('reads a FreeMind file, with its notes, tick and cross-link', async () => {
      await chooseFile('biology.mm', FREEMIND);
      expect(imported().title).toBe('Biology');
      expect(nodeTexts(imported())).toEqual(expect.arrayContaining(['Cells', 'Enzymes']));
      expect(Object.values(imported().nodes).some(node => node.done)).toBe(true);
      expect(imported().links.length).toBe(1);
      expect(outcome()).toBe("Opened 'Biology' from FreeMind: 3 nodes.");
    });

    it('reads an indented text outline', async () => {
      await chooseFile('revision.txt', OUTLINE_TEXT);
      expect(nodeTexts(imported())).toEqual(['Revision', 'Cells', 'Membrane', 'Enzymes']);
      expect(outcome()).toBe("Opened 'Revision' from a text outline: 4 nodes.");
    });

    it('unpacks an XMind file and leaves its attachments alone', async () => {
      await pick(xmindFile('Biology.xmind', ONE_SHEET));
      expect(nodeTexts(imported())).toEqual(['Biology', 'Cells', 'Enzymes']);
      expect(outcome()).toBe("Opened 'Biology' from XMind: 3 nodes.");
    });

    // The sheets that did not come in are not on screen and nothing else would ever mention them,
    // so the one sentence has to. One verb, said once.
    it('says which sheet came in, and how many did not, for a file of several', async () => {
      await pick(xmindFile('Biology.xmind', THREE_SHEETS));
      expect(onImport).toHaveBeenCalledTimes(1);
      expect(outcome()).toBe(
        "Opened 'Cells', the first of 3 sheets, from XMind: 1 node." +
          ' The other 2 sheets were not imported.'
      );
    });

    it('counts the sheets left behind in the singular when there is one', async () => {
      await pick(xmindFile('Biology.xmind', TWO_SHEETS));
      expect(outcome()).toBe(
        "Opened 'Cells', the first of 2 sheets, from XMind: 1 node." +
          ' The other sheet was not imported.'
      );
    });

    it('reads the bytes when the extension is wrong', async () => {
      await chooseFile('notes.txt', FREEMIND);
      expect(outcome()).toBe("Opened 'Biology' from FreeMind: 3 nodes.");

      await pick(new window.File([FREEMIND], 'notes.xml', { type: 'text/xml' }));
      expect(outcome()).toBe("Opened 'Biology' from FreeMind: 3 nodes.");

      await pick(xmindFile('lecture.txt', ONE_SHEET));
      expect(outcome()).toBe("Opened 'Biology' from XMind: 3 nodes.");
    });

    /*
     * Two letters are not a zip. "PK" is where a revision outline about phenylketonuria starts,
     * and the archive test used to be `startsWith('PK')` on the decoded text — so the file came
     * back refused as a broken archive.
     */
    it.each([
      ['pku.txt', 'PKU revision\n\tGlucose\n', "Opened 'PKU revision' from a text outline: 2 nodes."],
      ['unit.txt', 'PK unit revision\n', "Opened 'PK unit revision' from a text outline: 1 node."],
      ['two-bytes.txt', 'PK', "Opened 'PK' from a text outline: 1 node."]
    ])('opens %s, which begins PK, rather than calling it a broken archive', async (
      name,
      text,
      sentence
    ) => {
      await chooseFile(name, text);

      expect(onImport).toHaveBeenCalledTimes(1);
      expect(outcome()).toBe(sentence);
    });

    // The rule is that a file with the wrong extension still opens. `.xmind` on something whose
    // first bytes are not an archive is a wrong extension like any other.
    it('opens a FreeMind file that was saved as .xmind', async () => {
      await pick(new window.File([FREEMIND], 'biology.xmind'));

      expect(onImport).toHaveBeenCalledTimes(1);
      expect(nodeTexts(imported())).toEqual(expect.arrayContaining(['Cells', 'Enzymes']));
      expect(outcome()).toBe("Opened 'Biology' from FreeMind: 3 nodes.");
    });

    it('refuses a file too large to open before reading a byte of it', async () => {
      const file = new window.File(['# Plan\n'], 'huge.md', { type: 'text/markdown' });
      Object.defineProperty(file, 'size', { value: 21 * 1024 * 1024, configurable: true });
      const reader = jest.spyOn(window.FileReader.prototype, 'readAsText');

      await pick(file);

      expect(reader).not.toHaveBeenCalled();
      expect(onImport).not.toHaveBeenCalled();
      // One limit and one number: the same 20 MB the XML scanner refuses a document at.
      expect(notify).toHaveBeenCalledWith(
        'huge.md is larger than 20 MB, so AssisT did not open it.',
        'error'
      );
      reader.mockRestore();
    });

    it('shows a refused archive in the reader’s own words', async () => {
      await pick(new window.File(['not a zip at all'], 'broken.xmind'));

      expect(onImport).not.toHaveBeenCalled();
      const sentence = notify.mock.calls[notify.mock.calls.length - 1][0];
      expect(sentence).toMatch(/zip/);
      expect(sentence).toMatch(/^[A-Z].*\.$/s);
    });

    it('shows a damaged mind map file in its own words', async () => {
      await chooseFile('broken.json', '{ not json');

      expect(onImport).not.toHaveBeenCalled();
      const sentence = notify.mock.calls[notify.mock.calls.length - 1][0];
      expect(sentence).toContain('not valid JSON');
      expect(notify).toHaveBeenCalledWith(sentence, 'error');
    });

    it('has a sentence of its own for a failure it does not recognise', async () => {
      // Not a Blob, so the reader throws something neither serialiser wrote. A stack trace or the
      // word "undefined" in the live region is the failure this guards against.
      await pick({ name: 'notes.md', size: 12 });

      expect(onImport).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith('That file could not be opened.', 'error');
    });

    // A file that read and then would not store is a file the student watched disappear. The page
    // says why in its own sentence, and the keyboard comes back to where the import started.
    it('shows a map the page could not store in the page’s own words', async () => {
      onImport.mockRejectedValue(
        new MindMapError('NOT_STORED', "'Biology' was read but could not be saved: disk full")
      );

      await pick(xmindFile('Biology.xmind', ONE_SHEET));

      expect(notify).toHaveBeenCalledWith(
        "'Biology' was read but could not be saved: disk full",
        'error'
      );
      expect(document.activeElement).toBe(button());
    });

    it('says a file is being opened, and stops saying it when the file is in', async () => {
      offer(xmindFile('Biology.xmind', ONE_SHEET));

      expect(notify).toHaveBeenCalledWith('Opening Biology.xmind…', 'info');
      expect(host.querySelector('.mm-file').getAttribute('aria-busy')).toBe('true');
      expect(importItem().getAttribute('aria-disabled')).toBe('true');

      await settle();

      expect(host.querySelector('.mm-file').hasAttribute('aria-busy')).toBe(false);
      expect(importItem().hasAttribute('aria-disabled')).toBe(false);
      expect(outcome()).toBe("Opened 'Biology' from XMind: 3 nodes.");
    });

    it('refuses a second file while one is still opening, rather than racing it', async () => {
      offer(xmindFile('Biology.xmind', ONE_SHEET));
      offer(new window.File([OUTLINE_TEXT], 'revision.txt'));
      await settle();

      expect(onImport).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledWith(BUSY_REFUSAL, 'error');
      expect(outcome()).toBe("Opened 'Biology' from XMind: 3 nodes.");
    });

    it('says why the Import item cannot act while a file is opening', async () => {
      offer(xmindFile('Biology.xmind', ONE_SHEET));

      press(button());
      press(importItem());

      expect(notify).toHaveBeenCalledWith(BUSY_REFUSAL, 'error');
      await settle();
      expect(onImport).toHaveBeenCalledTimes(1);
    });

    it('gives the keyboard back to the File button when a file is refused', async () => {
      const elsewhere = document.createElement('button');
      document.body.appendChild(elsewhere);
      elsewhere.focus();

      await chooseFile('broken.json', '{ not json');

      expect(document.activeElement).toBe(button());
      elsewhere.remove();
    });

    /*
     * The defect this is written against: `announce(text)` followed by `notify(text)`, where the
     * page's notify is `showToast`, which announces too. Every progress sentence reached a screen
     * reader twice and every refusal arrived as the words, then the words again prefixed
     * "Problem:" — two pieces of news for one thing that happened.
     */
    describe('what a screen reader hears', () => {
      /** Run one import and hand back every live-region write it caused, in order. */
      const writes = async run => {
        announce.mockClear();
        await run();
        return spoken();
      };

      it('writes the live region exactly once for a file that opens', async () => {
        // The outcome sentence is not among them: opening the map replaces this page, so it is
        // carried across the load and said there instead.
        expect(await writes(() => pick(xmindFile('Biology.xmind', ONE_SHEET)))).toEqual([
          'Opening Biology.xmind…'
        ]);
        expect(outcome()).toBe("Opened 'Biology' from XMind: 3 nodes.");
      });

      it('writes it exactly once for a file that is too large', async () => {
        const file = new window.File(['# Plan\n'], 'huge.md');
        Object.defineProperty(file, 'size', { value: 21 * 1024 * 1024, configurable: true });

        expect(await writes(() => pick(file))).toEqual([
          'Opening huge.md…',
          'Problem: huge.md is larger than 20 MB, so AssisT did not open it.'
        ]);
      });

      it('writes it exactly once for an archive it cannot trust', async () => {
        expect(
          await writes(() => pick(new window.File(['not a zip at all'], 'broken.xmind')))
        ).toEqual([
          'Opening broken.xmind…',
          'Problem: This file has no zip directory at its end, so it is either not a zip file or' +
            ' it is truncated.'
        ]);
      });

      it('writes it exactly once for a damaged mind map file', async () => {
        const said = await writes(() => chooseFile('broken.json', '{ not json'));

        expect(said).toHaveLength(2);
        expect(said[0]).toBe('Opening broken.json…');
        expect(said[1]).toMatch(/^Problem: .*not valid JSON/);
      });

      it('writes it exactly once for a failure it does not recognise', async () => {
        expect(await writes(() => pick({ name: 'notes.md', size: 12 }))).toEqual([
          'Opening notes.md…',
          'Problem: That file could not be opened.'
        ]);
      });

      it('writes it exactly once for the second file picked mid-read', async () => {
        const said = await writes(async () => {
          offer(xmindFile('Biology.xmind', ONE_SHEET));
          offer(new window.File([OUTLINE_TEXT], 'revision.txt'));
          await settle();
        });

        expect(said).toEqual(['Opening Biology.xmind…', 'Problem: ' + BUSY_REFUSAL]);
      });
    });
  });
});

describe('file menu — an export is of the whole map', () => {
  let host;
  let menu;
  let madeUrl;
  let announce;

  beforeEach(() => {
    madeUrl = jest.spyOn(window.URL, 'createObjectURL').mockImplementation(() => 'blob:none');
  });

  afterEach(() => {
    menu.destroy();
    host.remove();
    madeUrl.mockRestore();
  });

  it('refuses to write one branch out under the whole map’s name', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const history = makeHistory();
    announce = jest.fn();
    // A history handed to this pane by mistake: its `current()` is one branch of the map, carrying
    // the same id and the same title. Every export reads the map through one accessor, and that is
    // where the refusal lives — a file named for the student's map that held a third of it is a file
    // they would not find out was wrong until they needed it.
    const branch = branchView(history.current(), 'arg');
    menu = mountFileMenu(host, {
      history: { ...history, current: () => branch },
      announce,
      notify: jest.fn(),
      getSvgElement: () => ({ dataset: { layoutMode: 'map' } })
    });

    const markdown = [...host.querySelectorAll('[role="menuitem"]')].find(
      entry => entry.textContent === 'Markdown (.md)'
    );
    activate(markdown);

    // No file was made and nothing was announced as downloaded: the export stopped at the accessor
    // rather than writing part of the map out under the whole map's name.
    expect(madeUrl).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalledWith(expect.stringContaining('Downloaded'));
  });
});
