/**
 * The File menu: everything a map does with files, under one button.
 *
 * Start a map, open another, save, save a copy, bring an outline in, send one out. The four map
 * commands are callbacks the page supplies — this module owns no database and no dialog — while
 * import and export are done here, beside the serialisers they mirror.
 *
 * ADR 0001 puts the export half plainly: export is the outline. Markdown, OPML, FreeMind and JSON
 * are the round trips (JSON is the lossless one); SVG and PNG are snapshots. All of them are built
 * by the serialisers in `core/`, so a picture on disk and a picture on screen come from the same
 * layout.
 *
 * ADR 0003 adds the other half of that: a student arrives with maps from Coggle, MindMeister, XMind
 * or Freeplane and leaves for a tutor who uses one of them. `.mm` is the interchange format both
 * ways, `.xmind` comes in only, and a plain indented outline is read because it is what a student
 * pastes. Bringing one in is `import-flow.js`'s, so that the menu and the library do it the same
 * way down to the sentence; what the Import item owns here is the picker and its one menu entry.
 *
 * The picture is exported on a white ground whatever the editor's theme is: it is going into a
 * document, an assignment or a printer, not back into the editor.
 *
 * @module pages/mind-map/file-menu
 */

import { isBranchView } from '../../features/mindMap/core/branch-view.js';
import { layoutMap } from '../../features/mindMap/core/layout.js';
import { MindMapError } from '../../features/mindMap/core/map-model.js';
import { walk } from '../../features/mindMap/core/map-ops.js';
import { toFreeMind } from '../../features/mindMap/core/serialisers/freemind.js';
import { MAX_DEPTH } from '../../features/mindMap/core/serialisers/import-map.js';
import { toJSON } from '../../features/mindMap/core/serialisers/json.js';
import { toMarkdown } from '../../features/mindMap/core/serialisers/markdown.js';
import { toOPML } from '../../features/mindMap/core/serialisers/opml.js';
import { toSVG } from '../../features/mindMap/core/serialisers/svg.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';

import { IMPORT_ACCEPT, createImportFlow } from './import-flow.js';

import './file-menu.css';

/** Matches the padding core/serialisers/svg.js puts around the bounds. */
const SVG_PADDING = 24;

/** Twice the CSS size so the picture stays crisp when zoomed or printed; capped so a 3x screen
 *  does not ask for a canvas four times larger than it needs. */
const pngScale = () => Math.min(2 * (window.devicePixelRatio || 1), 4);

/** File names are the map's title; 60 characters is long enough to recognise and short enough to
 *  survive every file system this could land on. */
const MAX_NAME = 60;

/** Ids must be unique per document; a page could hold more than one menu. */
let menuSerial = 0;

/**
 * A file name from a map title: lower case, words joined by hyphens, nothing a file system minds.
 *
 * @param {string} title
 * @returns {string} never empty.
 */
function slugify(title) {
  const slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_NAME)
    .replace(/-+$/, '');
  return slug || 'mind-map';
}

/** Hand the browser a file. The anchor is removed straight away; the URL is released with it. */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const loadImage = source =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The picture could not be drawn.'));
    image.src = source;
  });

/**
 * Mount the File menu.
 *
 * @param {HTMLElement} host - emptied on mount.
 * @param {Object} options
 * @param {Object} options.history - a `createHistory` instance; the map is read from `current()`.
 * @param {() => SVGSVGElement} [options.getSvgElement] - the live canvas, read for the layout mode
 *   so the exported picture matches the one the student is looking at.
 * @param {(text: string) => void} [options.announce] - writes into the page's live region. Used
 *   for what an export did; everything the import says goes through `notify`, which writes both.
 * @param {(text: string, kind: string) => void} [options.notify] - the page's `showToast`, which
 *   writes the toast AND the live region in one call. A failure here is a file that did not arrive
 *   or did not leave, and a live region is only heard by a screen reader: everything that goes
 *   wrong is said AND shown.
 * @param {(map: Object, sentence: string) => (void|Promise<void>)} [options.onImport] - handed the
 *   parsed map and the sentence saying what came in; the page stores it and opens it.
 * @param {Function} [options.decompressionStream] - the inflater an `.xmind` archive is unpacked
 *   with, defaulting to the platform's `DecompressionStream`; threaded through for the suite.
 * @param {() => void} [options.onNew] - start a map. The page owns the dialog and the database;
 * @param {() => void} [options.onOpen] - open another map;
 * @param {() => void} [options.onSave] - write this one now;
 * @param {() => void} [options.onSaveAs] - write a copy of it under a new name.
 * @returns {{destroy: () => void}}
 */
export function mountFileMenu(host, options = {}) {
  const {
    history,
    getSvgElement,
    announce = () => {},
    notify = () => {},
    onImport = () => {},
    onNew = () => {},
    onOpen = () => {},
    onSave = () => {},
    onSaveAs = () => {},
    decompressionStream,
  } = options;

  /**
   * Show a failure and say it, in one write.
   *
   * `notify` is the page's `showToast`, which already puts its words in the live region. Calling
   * `announce` as well wrote every failure there twice — once plain, and once more as
   * "Problem: ..." — which a screen reader reads out as two separate pieces of news.
   */
  const reportFailure = text => notify(text, 'error');

  menuSerial += 1;
  const menuId = `mm-file-menu-${menuSerial}`;
  const cleanups = [];

  const root = document.createElement('div');
  root.className = 'mm-file';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mm-file__button';
  button.textContent = 'File';
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', menuId);
  button.dataset.testid = 'file-button';

  const menu = document.createElement('div');
  menu.className = 'mm-file__menu';
  menu.id = menuId;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'File');
  menu.hidden = true;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.className = 'mm-file__file';
  fileInput.accept = IMPORT_ACCEPT;
  fileInput.setAttribute('aria-label', 'Import a mind map file');
  fileInput.dataset.testid = 'file-import';

  root.append(button, menu, fileInput);
  host.replaceChildren(root);

  /**
   * The map every export is made from.
   *
   * Asserted, not assumed. An export is of the WHOLE map however much of it is on screen, so this
   * pane is given the real history — and a file named for the student's map that turned out to hold
   * one branch of it is a file they would not notice was wrong until they needed it.
   *
   * @returns {Object}
   */
  const map = () => {
    const current = history.current();
    if (isBranchView(current)) {
      throw new MindMapError(
        'NOT_A_WHOLE_MAP',
        'Refusing to export one branch of a mind map as the whole map.'
      );
    }
    return current;
  };
  const nameFor = extension => `${slugify(map().title)}.${extension}`;

  /** The canvas records the layout it drew, so the picture on disk matches the one on screen. */
  const layoutOfView = () => {
    const svg = typeof getSvgElement === 'function' ? getSvgElement() : null;
    const mode = svg && svg.dataset.layoutMode === 'tree' ? 'tree' : 'map';
    return layoutMap(map(), { mode });
  };

  function saveText(text, extension, type) {
    const filename = nameFor(extension);
    downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), filename);
    announce(`Downloaded ${filename}`);
  }

  async function savePng() {
    const layout = layoutOfView();
    const width = layout.bounds.maxX - layout.bounds.minX + SVG_PADDING * 2;
    const height = layout.bounds.maxY - layout.bounds.minY + SVG_PADDING * 2;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      reportFailure('This browser could not draw the picture, so try the SVG export instead.');
      return;
    }

    const scale = pngScale();
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const url = URL.createObjectURL(
      new Blob([toSVG(map(), layout)], { type: 'image/svg+xml;charset=utf-8' })
    );
    try {
      const image = await loadImage(url);
      // A PNG has no transparency story worth telling here: a map dropped into a document on a
      // white page should not come with a checkerboard behind it.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const filename = nameFor('png');
      downloadBlob(blob, filename);
      announce(`Downloaded ${filename}`);
    } catch (error) {
      reportFailure(`The picture could not be saved: ${error.message}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Say, once, that Markdown could not hold how deep this map is.
   *
   * Markdown carries depth as indentation and the import reads a hundred levels, so anything past
   * that is written at the last one — levels a student built become siblings. Every other export
   * keeps them, and a student who is not told chooses the export that quietly loses their work.
   */
  function reportMarkdownDepth() {
    let deepest = 0;
    walk(map(), (_node, depth) => {
      deepest = Math.max(deepest, depth);
    });
    if (deepest >= MAX_DEPTH) {
      notify(
        `This map is more than ${MAX_DEPTH} levels deep, so Markdown lists the deeper levels side` +
          ' by side. FreeMind and OPML keep every level.',
        'info'
      );
    }
  }

  async function copyMarkdown() {
    const text = toMarkdown(map());
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      reportFailure('This browser did not allow copying; use the Markdown download instead.');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      announce('Copied the map as Markdown');
      reportMarkdownDepth();
    } catch (error) {
      reportFailure(`The map could not be copied: ${error.message}`);
    }
  }

  /** The item that opens the picker, so it can say why it cannot act while a file is coming in. */
  let importItem = null;

  /**
   * The import, exactly as the library runs it. The keyboard goes back to the File BUTTON on a
   * refusal, not to the item that was pressed: the menu closes before the picker opens, and a
   * hidden element cannot hold focus.
   */
  const importFlow = createImportFlow({
    input: fileInput,
    control: button,
    notify,
    onImport,
    setBusy: busy => {
      if (busy) {
        root.setAttribute('aria-busy', 'true');
        importItem.setAttribute('aria-disabled', 'true');
      } else {
        root.removeAttribute('aria-busy');
        importItem.removeAttribute('aria-disabled');
      }
    },
    decompressionStream,
  });
  cleanups.push(() => importFlow.destroy());

  // What the map does, then what leaves it. The four commands go first because they are what a
  // student reaches for daily; the seven exports are gathered under a heading because seven file
  // formats in a flat list of twelve items is a wall to read past.
  const entries = [
    { label: 'New map…', run: onNew },
    { label: 'Open…', run: onOpen },
    { separator: true },
    { label: 'Save', run: onSave },
    { label: 'Save as…', run: onSaveAs },
    { separator: true },
    { label: 'Import a file…', key: 'import', run: () => importFlow.pick() },
    {
      group: 'Export',
      entries: [
        {
          label: 'Markdown (.md)',
          run: () => {
            saveText(toMarkdown(map()), 'md', 'text/markdown');
            reportMarkdownDepth();
          },
        },
        { label: 'OPML (.opml)', run: () => saveText(toOPML(map()), 'opml', 'text/x-opml') },
        {
          label: 'FreeMind (.mm)',
          // What a map loses on the way out has to be said before it leaves, not discovered in the
          // other tool: the quote and source a student captured while reading are the work.
          description:
            'Opens in XMind, Coggle, MindMeister and Freeplane. Colour, symbols, ticks and' +
            ' cross-links travel; a captured quote and its source become part of the note, and a' +
            ' citation link is left behind.',
          run: () => saveText(toFreeMind(map()), 'mm', 'application/x-freemind'),
        },
        { label: 'JSON (.json)', run: () => saveText(toJSON(map()), 'json', 'application/json') },
        {
          label: 'SVG (.svg)',
          run: () => saveText(toSVG(map(), layoutOfView()), 'svg', 'image/svg+xml'),
        },
        { label: 'PNG (.png)', run: savePng },
        { label: 'Copy as Markdown', run: copyMarkdown },
      ],
    },
  ];

  /** Every menu item in document order, which is the order the arrow keys walk. */
  const items = [];

  /**
   * @param {HTMLElement} parent - the menu, or a group inside it.
   * @param {Array<Object>} list
   */
  function buildItems(parent, list) {
    for (const entry of list) {
      if (entry.separator) {
        const rule = document.createElement('div');
        rule.className = 'mm-file__separator';
        rule.setAttribute('role', 'separator');
        parent.appendChild(rule);
        continue;
      }
      if (entry.group) {
        const group = document.createElement('div');
        group.className = 'mm-file__group';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', entry.group);
        // The heading is the same word the group is named by, so it is hidden from the
        // accessibility tree rather than read twice — and a menu whose children are not all menu
        // items is a menu a screen reader has to guess its way through.
        const label = document.createElement('span');
        label.className = 'mm-file__group-label';
        label.setAttribute('aria-hidden', 'true');
        label.textContent = entry.group;
        group.appendChild(label);
        parent.appendChild(group);
        buildItems(group, entry.entries);
        continue;
      }
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'mm-file__item';
      item.setAttribute('role', 'menuitem');
      // Roving focus: one stop for the whole menu, moved with the arrow keys. The list is flat
      // even where the markup is not, so an arrow key crosses the group boundary without noticing.
      item.tabIndex = -1;
      item.textContent = entry.label;
      parent.appendChild(item);
      items.push(item);
      if (entry.key === 'import') {
        importItem = item;
      }
      if (entry.description) {
        const hint = document.createElement('span');
        hint.className = 'mm-file__hint';
        hint.id = `${menuId}-hint-${items.length}`;
        // Hidden from the tree and read as the item's description instead: a screen reader walking
        // a menu should meet menu items, not loose runs of text between them, and a node that a
        // `aria-describedby` points straight at is used whether it is hidden or not.
        hint.setAttribute('aria-hidden', 'true');
        hint.textContent = entry.description;
        item.setAttribute('aria-describedby', hint.id);
        parent.appendChild(hint);
      }
      cleanups.push(
        attachAccessibleHandler(item, `Mind map file ${entry.label}`, () => {
          // Closed first: every one of these either opens a modal or hands the browser a file, and
          // a menu left standing behind either is one the student comes back to still open.
          close(true);
          entry.run();
        })
      );
    }
  }

  buildItems(menu, entries);

  function open() {
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    items[0].focus();
  }

  /**
   * Hide the menu.
   *
   * `open()` always puts the keyboard on the first item, and a hidden element cannot hold it:
   * Chrome drops it on `<body>`, which is the top of the page with the student's place lost. So
   * any close while the menu holds the keyboard hands it back, whatever the caller asked for —
   * Tab included, which then carries on from the File button to whatever follows it in the header
   * rather than from nowhere at all.
   *
   * @param {boolean} returnFocus - true when the button should take the keyboard even if the menu
   *   never had it: Escape, the toggle, and the item that was just pressed.
   */
  function close(returnFocus) {
    if (menu.hidden) {
      return;
    }
    if (returnFocus || menu.contains(document.activeElement)) {
      button.focus();
    }
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }

  cleanups.push(
    attachAccessibleHandler(button, 'Mind map file menu', () => {
      if (menu.hidden) {
        open();
      } else {
        close(true);
      }
    })
  );

  const onButtonKeydown = event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
      if (event.key === 'ArrowUp') {
        items[items.length - 1].focus();
      }
    }
  };
  button.addEventListener('keydown', onButtonKeydown);
  cleanups.push(() => button.removeEventListener('keydown', onButtonKeydown));

  const onMenuKeydown = event => {
    const at = items.indexOf(document.activeElement);
    const step = to => {
      event.preventDefault();
      items[(to + items.length) % items.length].focus();
    };

    if (event.key === 'ArrowDown') {
      step(at + 1);
    } else if (event.key === 'ArrowUp') {
      step(at - 1);
    } else if (event.key === 'Home') {
      step(0);
    } else if (event.key === 'End') {
      step(items.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') {
      // Tab leaves the menu behind rather than being trapped by it; focus goes where it would.
      close(false);
    }
  };
  menu.addEventListener('keydown', onMenuKeydown);
  cleanups.push(() => menu.removeEventListener('keydown', onMenuKeydown));

  // Capture phase, and the containment test is what keeps the menu alive rather than the phase.
  // Every control on this page is wired through the shared event helper, which stops the press
  // dead on its way up — so in the bubble phase this heard nothing from Help, Undo, a dock tab, an
  // outline row or a node on the canvas, and the menu stood open over whatever the student had
  // just pressed. Capture runs before any of them, and a press inside `root` still closes nothing.
  const onDocumentPress = event => {
    if (!root.contains(event.target)) {
      close(false);
    }
  };
  document.addEventListener('mousedown', onDocumentPress, true);
  cleanups.push(() => document.removeEventListener('mousedown', onDocumentPress, true));

  return {
    destroy() {
      for (const cleanup of cleanups) {
        cleanup();
      }
      root.remove();
    },
  };
}
