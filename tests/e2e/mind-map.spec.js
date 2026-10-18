/**
 * Mind maps, with the AI switched off — the path a student walks without any model in the room.
 *
 * ADR 0001 makes the outline the canonical editor and the canvas a rendering of the same history,
 * so almost everything here is asserted through ARIA: levels, positions, the single tab stop, the
 * live region. A jsdom suite can prove the modules agree with each other; only a real Chrome can
 * prove the built extension opens the page, keeps the map in Dexie across a reload, hands the
 * browser a file, and lets the popup and a highlight reach the same database from three realms.
 *
 * Each test starts from a fresh profile — the fixture launches its own persistent context — and
 * builds the map it needs, so no test depends on what another one left behind.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect, openReadyPopup, waitForPopupReady } from './extension-fixture.js';
import { buildZip } from '../unit/utils/zip-fixtures.js';

const EDITOR = id => `chrome-extension://${id}/src/pages/mind-map/mindmap.html`;

/** Downloads and the import file land here and are removed again; overridable for CI. */
const SCRATCH = process.env.ASSIST_E2E_SCRATCH || path.join(os.tmpdir(), 'assist-mind-map-e2e');

const FIXTURE_PAGE = fileURLToPath(new URL('./fixtures/mind-map-page.html', import.meta.url));

/**
 * An LMS URL, so the manifest injects the content script without a permission prompt, served from
 * the local fixture so the test does not depend on Canvas being reachable or on its markup.
 */
const LMS_URL = 'https://canvas.instructure.com/courses/1/pages/photosynthesis';

/** The quote captured in the highlight test; the node text is the same words. */
const CALVIN_TEXT =
  'The stroma reactions fix carbon dioxide into a three carbon sugar without needing light directly.';

test.beforeAll(async () => {
  await mkdir(SCRATCH, { recursive: true });
});

test.afterAll(async () => {
  await rm(SCRATCH, { recursive: true, force: true });
});

/**
 * The outline as ARIA reports it, in document order.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{text: string, level: number, position: number, setSize: number,
 *   selected: boolean, expanded: string|null, tabStop: boolean}>>}
 */
function outlineOf(page) {
  return page.locator('[role="tree"] [role="treeitem"]').evaluateAll(items =>
    items.map(item => ({
      text:
        item.querySelector(':scope > .assist-mm-row > [data-testid="outline-row-text"]')
          ?.textContent ?? '',
      level: Number(item.getAttribute('aria-level')),
      position: Number(item.getAttribute('aria-posinset')),
      setSize: Number(item.getAttribute('aria-setsize')),
      selected: item.getAttribute('aria-selected') === 'true',
      expanded: item.getAttribute('aria-expanded'),
      tabStop: item.getAttribute('tabindex') === '0',
    }))
  );
}

/**
 * A tree has exactly one tab stop, whatever has just happened to it. Checked after every
 * structural step: a rebuild that loses the roving tabindex locks a keyboard student out of the
 * editor entirely, and it is the failure a purely visual assertion would never see.
 *
 * @param {import('@playwright/test').Page} page
 */
const outlineText = page => outlineOf(page).then(items => items.map(item => item.text));

/**
 * Click with a key held. `page.mouse.click` has no `modifiers` option (only `locator.click`
 * does) and ignores one without a word, so the key is pressed for real around the click.
 */
async function clickHolding(page, key, x, y) {
  await page.keyboard.down(key);
  await page.mouse.click(x, y);
  await page.keyboard.up(key);
}

async function expectOneTabStop(page) {
  await expect
    .poll(async () => (await outlineOf(page)).filter(item => item.tabStop).length)
    .toBe(1);
}

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} extensionId
 * @returns {Promise<import('@playwright/test').Page>} the library, drawn and listed.
 */
async function openLibrary(context, extensionId) {
  const page = await context.newPage();
  await page.goto(EDITOR(extensionId));
  await expect(page.getByRole('button', { name: 'New map', exact: true })).toBeVisible({
    timeout: 15000,
  });
  return page;
}

/**
 * Start a map the way a student does: the New map dialog, a template, a title. The page navigates
 * to `?map=<id>`, so the same Page object is the editor afterwards.
 *
 * @param {import('@playwright/test').Page} page - showing the library
 * @param {{title: string, template: string}} options - template is a TEMPLATES id
 */
async function startMap(page, { title, template }) {
  await page.getByRole('button', { name: 'New map', exact: true }).click();
  await page.locator('#assist-mm-new-input').fill(title);
  await page.locator(`#assist-mm-template-${template}`).check();
  await page.getByRole('button', { name: 'Create map' }).click();
  await expect(page.locator('[role="tree"] [role="treeitem"]').first()).toBeVisible({
    timeout: 15000,
  });
}

/**
 * Open the fixture page at an LMS address so the content script is injected by the manifest, and
 * wait until it says it is ready — the one signal that does not depend on any feature being on.
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @returns {Promise<import('@playwright/test').Page>}
 */
async function openFixturePage(context) {
  const html = await readFile(FIXTURE_PAGE, 'utf8');
  const page = await context.newPage();
  const logs = [];
  page.on('console', message => logs.push(message.text()));
  await page.route(LMS_URL, route =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  );
  await page.goto(LMS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await expect
    .poll(() => logs.some(line => line.includes('[AssisT] Ready!')), { timeout: 20000 })
    .toBe(true);
  return page;
}

/**
 * Open the popup and wait for Flat, the way flat-popup.spec.js does.
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} extensionId
 * @returns {Promise<import('@playwright/test').Page>}
 */
async function openFlatPopup(context, extensionId) {
  const page = await openReadyPopup(context, extensionId);
  await page.waitForSelector('#flat-root .assist-flat__row', { timeout: 15000 });
  return page;
}

test.describe('Mind map editor', () => {
  test('a fresh profile has no maps, and a template starts one', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);

    // The empty state has to say what to do next, not merely that there is nothing here.
    const empty = page.getByTestId('library-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('no mind maps yet');
    await expect(page.getByTestId('map-card')).toHaveCount(0);

    await startMap(page, { title: 'Photosynthesis essay', template: 'essay-plan' });

    await expect(page.locator('[role="tree"]')).toHaveAttribute('aria-label', 'Mind map outline');

    const items = await outlineOf(page);
    // The template's own shape: the title at the centre, its six sections beneath it.
    expect(items[0]).toMatchObject({ text: 'Photosynthesis essay', level: 1, position: 1 });
    expect(items.filter(item => item.level === 2).map(item => item.text)).toEqual([
      'Introduction',
      'Argument one',
      'Argument two',
      'Argument three',
      'Counter-argument',
      'Conclusion',
    ]);
    // Every row carries a level, and a leaf sits one deeper than its section.
    expect(items.every(item => Number.isInteger(item.level) && item.level >= 1)).toBe(true);
    expect(items.some(item => item.level === 3 && item.text === 'Thesis statement')).toBe(true);
    expect(items.filter(item => item.level === 2).every(item => item.setSize === 6)).toBe(true);

    await expectOneTabStop(page);
    await page.close();
  });

  test('the outline can be built and unbuilt from the keyboard alone', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Keyboard map', template: 'blank' });

    const items = page.locator('[role="tree"] [role="treeitem"]');
    const editing = page.getByTestId('outline-row-edit');
    const live = page.locator('#assist-mm-live');

    // Into the tree, and nothing but the keyboard from here.
    await items.first().focus();
    await expect(items.first()).toBeFocused();
    await expect(items.first()).toHaveAttribute('aria-selected', 'true');

    // Enter on the centre of the map makes a child of it — there is nothing to be a sibling of.
    await page.keyboard.press('Enter');
    await expect(editing).toBeFocused();
    await page.keyboard.type('First branch');
    // Ctrl+Enter finishes the node and stays; plain Enter would finish it and open the next one.
    await page.keyboard.press('Control+Enter');
    await expect(editing).toHaveCount(0);
    await expect(items).toHaveCount(2);
    await expectOneTabStop(page);

    await page.keyboard.press('Enter');
    await expect(editing).toBeFocused();
    await page.keyboard.type('Second branch');
    await page.keyboard.press('Control+Enter');
    await expect(items).toHaveCount(3);
    expect(await outlineOf(page)).toMatchObject([
      { text: 'Keyboard map', level: 1, position: 1, setSize: 1 },
      { text: 'First branch', level: 2, position: 1, setSize: 2 },
      { text: 'Second branch', level: 2, position: 2, setSize: 2, selected: true },
    ]);
    await expectOneTabStop(page);

    // Tab indents the node under the one above it, Shift+Tab brings it back out.
    await page.keyboard.press('Tab');
    await expect
      .poll(async () => (await outlineOf(page)).map(item => item.level))
      .toEqual([1, 2, 3]);
    await expectOneTabStop(page);

    await page.keyboard.press('Shift+Tab');
    await expect
      .poll(async () => (await outlineOf(page)).map(item => item.level))
      .toEqual([1, 2, 2]);
    await expectOneTabStop(page);

    // Alt+Down reorders among siblings rather than moving focus.
    await page.keyboard.press('ArrowUp');
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press('Alt+ArrowDown');
    await expect
      .poll(async () => (await outlineOf(page)).map(item => item.text))
      .toEqual(['Keyboard map', 'Second branch', 'First branch']);
    await expectOneTabStop(page);

    // Shift+Enter goes inwards: a child of the node that has focus.
    await page.keyboard.press('Shift+Enter');
    await expect(editing).toBeFocused();
    await page.keyboard.type('Leaf');
    await page.keyboard.press('Control+Enter');
    expect(await outlineOf(page)).toMatchObject([
      { text: 'Keyboard map', level: 1 },
      { text: 'Second branch', level: 2 },
      { text: 'First branch', level: 2, expanded: 'true' },
      { text: 'Leaf', level: 3, selected: true },
    ]);
    await expectOneTabStop(page);

    // A deletion a student cannot see has to be said, including the way back.
    await page.keyboard.press('Delete');
    await expect(items).toHaveCount(3);
    await expect(live).toContainText("Deleted 'Leaf'. Press Ctrl+Z to undo");
    await expectOneTabStop(page);

    await page.keyboard.press('Control+z');
    await expect(items).toHaveCount(4);
    await expect
      .poll(async () => (await outlineOf(page)).map(item => item.text))
      .toEqual(['Keyboard map', 'Second branch', 'First branch', 'Leaf']);
    await expectOneTabStop(page);
    await page.close();
  });

  test('an edit survives a reload and the library counts it', async ({ context, extensionId }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Persistence check', template: 'blank' });

    // Every line the status bar shows, recorded as it is written. Reading the element after the
    // edit would be a race in both directions: the map opens already saying "Saved", and the
    // autosave writes 600 ms after the last keystroke, so a single read can miss either state.
    await page.evaluate(() => {
      const status = document.getElementById('assist-mm-status');
      window.__mmStatus = [];
      new MutationObserver(() => window.__mmStatus.push(status.textContent)).observe(status, {
        characterData: true,
        childList: true,
        subtree: true,
      });
    });

    await page.locator('[role="tree"] [role="treeitem"]').first().focus();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Saved branch');
    await page.keyboard.press('Control+Enter');

    // Dirty first, then written: a "Saved" that was never preceded by unsaved work is the line
    // the editor already showed when the map opened, and proves nothing about this edit.
    const statusSaw = pattern =>
      page.evaluate(
        source => (window.__mmStatus || []).some(line => new RegExp(source).test(line)),
        pattern.source
      );
    await expect.poll(() => statusSaw(/Unsaved changes|Saving/)).toBe(true);
    await expect.poll(() => statusSaw(/^Saved /), { timeout: 15000 }).toBe(true);

    expect(page.url()).toContain('mindmap.html?map=');
    await page.reload();
    await expect(page.locator('[role="tree"] [role="treeitem"]')).toHaveCount(2, {
      timeout: 15000,
    });
    await expect
      .poll(async () => (await outlineOf(page)).map(item => item.text))
      .toEqual(['Persistence check', 'Saved branch']);

    // And the library, which reads the same records back through its own summary path.
    await page.goto(EDITOR(extensionId));
    const card = page.getByTestId('map-card').filter({ hasText: 'Persistence check' });
    await expect(card).toHaveCount(1, { timeout: 15000 });
    await expect(card.getByTestId('map-card-meta')).toContainText('2 nodes');
    await page.close();
  });

  test('the canvas and the outline are two views of one selection', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Two views', template: 'lecture-notes' });

    const items = page.locator('[role="tree"] [role="treeitem"]');
    const svg = page.getByTestId('canvas-svg');
    await expect(page.getByTestId('canvas-svg').locator('g.mm-node').first()).toBeVisible({
      timeout: 15000,
    });

    // The picture names itself and says how big it is; a screen reader gets that much and is sent
    // to the outline for the rest.
    await expect(svg).toHaveAttribute('role', 'img');
    const total = await items.count();
    await expect(svg).toHaveAttribute('aria-label', new RegExp(`Map canvas, ${total} nodes`));

    // Canvas to outline.
    const branchId = await items.nth(1).getAttribute('data-id');
    // The node's text sits above its box and takes the pointer; the group receives either.
    await page.locator(`g.mm-node[data-node-id="${branchId}"]`).click();
    await expect(page.locator(`[role="treeitem"][data-id="${branchId}"]`)).toHaveAttribute(
      'aria-selected',
      'true'
    );

    // Outline to canvas: the selected node is marked by a class and a ring, not by colour alone.
    const rootId = await items.first().getAttribute('data-id');
    await items.first().focus();
    await expect(page.locator(`g.mm-node[data-node-id="${rootId}"]`)).toHaveClass(
      /mm-node--selected/
    );
    await expect(
      page.locator(`g.mm-node[data-node-id="${rootId}"] rect.mm-node__ring`)
    ).toHaveCount(1);
    await expect(page.locator(`g.mm-node[data-node-id="${branchId}"]`)).not.toHaveClass(
      /mm-node--selected/
    );
    await page.close();
  });

  test('a map leaves as Markdown and an outline file comes back as a map', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Photosynthesis essay', template: 'essay-plan' });

    const fileMenuButton = page.getByTestId('file-button');

    // A menu has to get out of the way of whatever the student presses next. Every control on this
    // page stops its own press before it reaches the document, so a menu watching for the press in
    // the bubble phase heard none of them and stood open over the page — and the keyboard, which
    // opening had put on the first item, went to the body when the menu was hidden under it.
    await fileMenuButton.click();
    await expect(fileMenuButton).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: 'Help' }).click();
    await expect(fileMenuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('dialog.assist-mm-shortcuts')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.assist-mm-shortcuts')).toBeHidden();
    await expect(fileMenuButton).toBeFocused();

    // Opened and driven from the keyboard: it is a menu, so ArrowDown opens it onto the first
    // item and the arrows walk down to the one wanted. A student who cannot use a pointer has no
    // other way to get their map out, so this is asserted through the keys rather than through a
    // click — if the download never arrives, the menu item is answering the pointer only
    // (SC 2.1.1). The walk crosses into the Export group, which is where a roving focus that
    // stopped at the group boundary would strand the keyboard.
    await fileMenuButton.focus();
    await page.keyboard.press('ArrowDown');
    await expect(fileMenuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('menuitem', { name: 'New map…' })).toBeFocused();
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press('ArrowDown');
    }
    await expect(page.getByRole('menuitem', { name: 'Markdown (.md)' })).toBeFocused();

    const download = page.waitForEvent('download', { timeout: 15000 });
    await page.keyboard.press('Enter');
    const saved = path.join(SCRATCH, 'photosynthesis-essay.md');
    await (await download).saveAs(saved);

    const markdown = await readFile(saved, 'utf8');
    expect(markdown.startsWith('# Photosynthesis essay')).toBe(true);
    // The centre of the map is the first bullet, so a section sits one step in.
    expect(markdown).toMatch(/^ {2}- Introduction$/m);
    // Depth is the whole point of an outline export: a leaf is indented under its section.
    expect(markdown).toMatch(/^ {4}- Thesis statement$/m);

    // And back in. A file always arrives as a new map, never over one already here.
    const importFile = path.join(SCRATCH, 'imported-outline.md');
    await writeFile(
      importFile,
      ['# Imported outline', '', '- Roots', '  - Absorb water', '- Leaves', ''].join('\n'),
      'utf8'
    );
    await page.getByTestId('file-import').setInputFiles(importFile);

    await expect(page.locator('#assist-mm-title-input')).toHaveValue('Imported outline', {
      timeout: 15000,
    });
    await expect
      .poll(async () => (await outlineOf(page)).map(item => `${item.level}:${item.text}`))
      .toEqual(['1:Imported outline', '2:Roots', '3:Absorb water', '2:Leaves']);
    await page.close();
  });

  /**
   * The interchange path (ADR 0003). A student arrives with maps from Coggle, MindMeister, XMind or
   * Freeplane and leaves for a tutor who uses one of them, and `.mm` is the format all of them read.
   * Only a real Chrome can prove the file input takes the file and the download leaves the browser.
   */
  test('a map goes out as FreeMind and a FreeMind file comes back in', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Cell biology', template: 'essay-plan' });

    const importFile = path.join(SCRATCH, 'freeplane-export.mm');
    await writeFile(
      importFile,
      [
        '<map version="1.0.1">',
        '  <node ID="n1" TEXT="Photosynthesis">',
        '    <node ID="n2" TEXT="Light reactions">',
        '      <richcontent TYPE="NOTE"><html><body><p>Thylakoid membrane.</p></body></html>',
        '      </richcontent>',
        '    </node>',
        '    <node ID="n3" TEXT="Calvin cycle"><icon BUILTIN="button_ok"/></node>',
        '  </node>',
        '</map>',
        '',
      ].join('\n'),
      'utf8'
    );
    await page.getByTestId('file-import').setInputFiles(importFile);

    // A file always arrives as a new map, never over the one that was open.
    await expect(page.locator('#assist-mm-title-input')).toHaveValue('Photosynthesis', {
      timeout: 15000,
    });
    await expect
      .poll(async () => (await outlineOf(page)).map(item => `${item.level}:${item.text}`))
      .toEqual(['1:Photosynthesis', '2:Light reactions', '2:Calvin cycle']);
    await expectOneTabStop(page);

    // And out again, from the keyboard: the menu, the Export group, the FreeMind item.
    const fileMenuButton = page.getByTestId('file-button');
    await fileMenuButton.focus();
    await page.keyboard.press('ArrowDown');
    const freeMind = page.getByRole('menuitem', { name: 'FreeMind (.mm)' });
    for (let step = 0; step < 20; step += 1) {
      if (await freeMind.evaluate(item => item === document.activeElement)) {
        break;
      }
      await page.keyboard.press('ArrowDown');
    }
    await expect(freeMind).toBeFocused();
    // What does not travel is said before the file leaves, as the item's own description.
    const described = await freeMind.getAttribute('aria-describedby');
    await expect(page.locator(`#${described}`)).toContainText('a citation link is left behind');

    const download = page.waitForEvent('download', { timeout: 15000 });
    await page.keyboard.press('Enter');
    const saved = path.join(SCRATCH, 'photosynthesis.mm');
    await (await download).saveAs(saved);

    const written = await readFile(saved, 'utf8');
    // The declaration names the encoding; the map element is the version FreeMind 1.0.1 opens.
    expect(written.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(written).toContain('<map version="1.0.1">');
    expect(written).toContain('TEXT="Light reactions"');
    expect(written).toContain('Thylakoid membrane.');
    // The done tick travels as the icon FreeMind and Freeplane both draw.
    expect(written).toContain('BUILTIN="button_ok"');
    await page.close();
  });

  test('an XMind file comes back as a map', async ({ context, extensionId }) => {
    const page = await openLibrary(context, extensionId);

    // A real archive: deflated entries, correct checksums, and an attachment that is never unpacked.
    const archive = buildZip([
      {
        name: 'content.json',
        method: 8,
        data: JSON.stringify([
          {
            id: 's1',
            title: 'Cells',
            rootTopic: {
              id: 'r',
              title: 'Biology',
              children: {
                attached: [
                  { id: 'c1', title: 'Membrane' },
                  { id: 'c2', title: 'Nucleus', markers: [{ markerId: 'task-done' }] },
                ],
              },
            },
          },
          { id: 's2', title: 'Genetics', rootTopic: { id: 'r2', title: 'Genetics' } },
        ]),
      },
      { name: 'attachments/diagram.png', method: 8, data: 'x'.repeat(2048) },
    ]);
    const importFile = path.join(SCRATCH, 'Biology.xmind');
    await writeFile(importFile, Buffer.from(archive));

    await page.getByTestId('library-import-file').setInputFiles(importFile);

    await expect(page.locator('#assist-mm-title-input')).toHaveValue('Cells', { timeout: 15000 });
    await expect
      .poll(async () => (await outlineOf(page)).map(item => `${item.level}:${item.text}`))
      .toEqual(['1:Biology', '2:Membrane', '2:Nucleus']);
    await expectOneTabStop(page);

    /*
     * The sheet that did not come in is the whole reason this sentence exists: it is not on screen
     * and nothing else would ever mention it. Opening the map reloads the page, so the words have
     * to survive that load — they used to be announced into the document that was being replaced,
     * while the toast still read "Opening Biology.xmind…".
     */
    const said =
      "Opened 'Cells', the first of 2 sheets, from XMind: 3 nodes." +
      ' The other sheet was not imported.';
    const toast = page.locator('#assist-mm-toast');
    await expect(toast).toBeVisible({ timeout: 15000 });
    await expect(toast).toHaveText(said);
    // Said as well as shown, and exactly once: the live region holds it and nothing else.
    await expect(page.locator('#assist-mm-live')).toHaveText(said);

    // And not again on the next load: the sentence is taken away as it is read.
    await page.reload();
    await expect(page.locator('#assist-mm-title-input')).toHaveValue('Cells', { timeout: 15000 });
    await expect(page.locator('#assist-mm-toast')).toBeHidden();
    await page.close();
  });

  /*
   * Two letters are not a zip. A revision outline that starts "PKU" was refused as a damaged
   * archive, because the archive test read the decoded text for "PK" instead of the four bytes a
   * zip really opens with. Only a real Chrome proves the file input and the byte read together.
   */
  test('a text outline that begins PK opens as an outline, not as a broken archive', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);

    const importFile = path.join(SCRATCH, 'pku-revision.txt');
    await writeFile(
      importFile,
      ['PKU revision', '\tPhenylalanine', '\t\tLow protein diet', '\tScreening', ''].join('\n'),
      'utf8'
    );

    await page.getByTestId('library-import-file').setInputFiles(importFile);

    await expect(page.locator('#assist-mm-title-input')).toHaveValue('PKU revision', {
      timeout: 15000,
    });
    await expect
      .poll(async () => (await outlineOf(page)).map(item => `${item.level}:${item.text}`))
      .toEqual(['1:PKU revision', '2:Phenylalanine', '3:Low protein diet', '2:Screening']);
    await expect(page.locator('#assist-mm-toast')).toHaveText(
      "Opened 'PKU revision' from a text outline: 4 nodes."
    );
    await expectOneTabStop(page);
    await page.close();
  });

  test('a copy is named and another map is opened, from the keyboard alone', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Revision plan', template: 'blank' });

    // Ctrl+Shift+S names a copy. The box is prefilled and selected, so the student who wants a
    // different name types over it and the one who wants this name presses Enter.
    await page.keyboard.press('Control+Shift+S');
    const saveAs = page.locator('dialog[data-dialog="save-as"]');
    await expect(saveAs).toBeVisible({ timeout: 15000 });
    const copyName = page.locator('#assist-mm-save-as-input');
    await expect(copyName).toBeFocused();
    await expect(copyName).toHaveValue('Revision plan copy');

    await page.keyboard.type('Second draft');
    await page.keyboard.press('Enter');

    // The copy is a map of its own, and it is the one now on screen.
    await expect(page.locator('#assist-mm-title-input')).toHaveValue('Second draft', {
      timeout: 15000,
    });

    // Ctrl+O lists both, and says in words which one is already open.
    await page.keyboard.press('Control+o');
    const openDialog = page.locator('dialog[data-dialog="open"]');
    await expect(openDialog).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#assist-mm-open-filter')).toBeFocused();
    await expect(openDialog.locator('.assist-mm-open__map')).toHaveCount(2);
    await expect(
      openDialog.locator('.assist-mm-open__map', { hasText: 'Second draft' })
    ).toContainText('Open now');

    // Filter down to the original and open it with Tab and Enter.
    await page.keyboard.type('Revision');
    await expect(openDialog.locator('.assist-mm-open__map')).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect(openDialog.locator('.assist-mm-open__map')).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.locator('#assist-mm-title-input')).toHaveValue('Revision plan', {
      timeout: 15000,
    });
    await page.close();
  });
});

/*
 * Pointer parity (SC 2.5.7). A drag reorders siblings and re-parents; everything it does has a
 * single-pointer and a keyboard route in the Details panel, and the selected node carries two
 * buttons for building on without a drag at all. Only a real browser can play a mouse drag, so the
 * drag is asserted here and its two alternatives are asserted beside it, from the keyboard alone.
 */
test.describe('Mind map pointer parity', () => {
  /**
   * Build a three-branch map from the keyboard, the way the outline test does, and hand back the
   * node ids in outline order.
   *
   * @param {import('@playwright/test').Page} page
   * @param {string[]} names
   * @returns {Promise<string[]>}
   */
  async function buildBranches(page, names) {
    const items = page.locator('[role="tree"] [role="treeitem"]');
    await items.first().focus();
    for (const [index, name] of names.entries()) {
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('outline-row-edit')).toBeFocused();
      await page.keyboard.type(name);
      await page.keyboard.press('Control+Enter');
      // Each branch is committed before the next Enter, so a loaded machine cannot run two together.
      await expect(page.getByTestId('outline-row-edit')).toHaveCount(0);
      await expect(items).toHaveCount(index + 2);
    }
    return items.evaluateAll(list => list.map(item => item.dataset.id));
  }

  const outlineLevels = page => outlineOf(page).then(items => items.map(item => item.level));

  test('a real mouse drag onto a node’s top edge reorders the siblings', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Reorder check', template: 'blank' });
    const ids = await buildBranches(page, ['First', 'Second', 'Third']);
    const live = page.locator('#assist-mm-live');

    const node = id => page.locator(`g.mm-node[data-node-id="${id}"] rect.mm-node__box`);
    const third = await node(ids[3]).boundingBox();
    const first = await node(ids[1]).boundingBox();

    // From the middle of Third to a few pixels inside the top edge of First: the "before" zone.
    await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2);
    await page.mouse.down();
    await page.mouse.move(first.x + first.width / 2, first.y + 3, { steps: 8 });
    // The insertion mark is a line with a caret on it, not a colour change (SC 1.4.1).
    await expect(page.locator('g.mm-canvas__dropHint')).toBeVisible();
    await expect(page.locator('path.mm-canvas__dropCaret')).toHaveCount(1);
    await page.mouse.up();

    await expect
      .poll(() => outlineText(page))
      .toEqual(['Reorder check', 'Third', 'First', 'Second']);
    await expect(live).toContainText("Moved 'Third' before 'First'.");
    await expect(page.locator('g.mm-canvas__dropHint')).toBeHidden();
    await expectOneTabStop(page);

    // One undo step for the whole gesture.
    await page.keyboard.press('Control+z');
    await expect
      .poll(() => outlineText(page))
      .toEqual(['Reorder check', 'First', 'Second', 'Third']);
    await page.close();
  });

  test('a drag onto the middle of a node still makes a child of it', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Reparent check', template: 'blank' });
    const ids = await buildBranches(page, ['First', 'Second']);

    const node = id => page.locator(`g.mm-node[data-node-id="${id}"] rect.mm-node__box`);
    const second = await node(ids[2]).boundingBox();
    const first = await node(ids[1]).boundingBox();

    await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2);
    await page.mouse.down();
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2, { steps: 8 });
    await expect(page.locator(`g.mm-node[data-node-id="${ids[1]}"]`)).toHaveClass(
      /mm-node--dropTarget/
    );
    await page.mouse.up();

    await expect.poll(() => outlineLevels(page)).toEqual([1, 2, 3]);
    await expect(page.locator('#assist-mm-live')).toContainText("Moved 'Second' into 'First'.");
    await page.close();
  });

  test('Move to… re-parents a node from the keyboard alone', async ({ context, extensionId }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Move check', template: 'blank' });
    await buildBranches(page, ['Reading', 'Writing']);

    // Alt+M is the way in, from wherever the student is standing.
    await page.locator('[role="tree"] [role="treeitem"]').nth(2).focus();
    await page.keyboard.press('Alt+m');
    const find = page.getByLabel('Find a parent');
    await expect(find).toBeFocused();

    // Search for the parent by name, choose it, choose where it sits, and move.
    await page.keyboard.type('Read');
    const parent = page.getByLabel('New parent');
    // The list opens on a placeholder, so nothing is chosen for the student; after it, the one match.
    const candidates = parent.locator('option:not([value=""])');
    await expect.poll(() => candidates.count()).toBe(1);
    // Each candidate carries its path, so two nodes with one name can be told apart.
    const candidate = candidates.first();
    await expect(candidate).toHaveText('Reading (under Move check)');
    await parent.selectOption(await candidate.getAttribute('value'));
    await page.getByLabel('Place it').selectOption('last');
    const move = page.getByRole('button', { name: 'Move', exact: true });
    await move.focus();
    await page.keyboard.press('Enter');

    await expect.poll(() => outlineText(page)).toEqual(['Move check', 'Reading', 'Writing']);
    await expect.poll(() => outlineLevels(page)).toEqual([1, 2, 3]);
    await expect(page.locator('#assist-mm-live')).toContainText("Moved 'Writing' into 'Reading'.");
    await expect(move).toBeFocused();
    await expectOneTabStop(page);
    await page.close();
  });

  test('Move to… says why the centre cannot move, without going dark', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Centre check', template: 'blank' });

    await page.locator('[role="tree"] [role="treeitem"]').first().focus();
    const move = page.getByRole('button', { name: 'Move', exact: true });
    await expect(move).toHaveAttribute('aria-disabled', 'true');
    await expect(move).not.toHaveAttribute('disabled', '');
    // Reachable, because a control that has something to explain has to be reachable to explain it.
    await move.focus();
    await expect(move).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#assist-mm-live')).toContainText(
      'The centre of the map cannot be moved.'
    );
    await page.close();
  });

  test('Escape after typing a name keeps the node the handle made', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Escape check', template: 'blank' });
    const editing = page.locator('input.mm-canvas__editor');

    await page.locator('[role="tree"] [role="treeitem"]').first().focus();
    await page.getByRole('button', { name: "Add a child to 'Escape check'" }).click();
    await expect(editing).toBeFocused();
    await page.keyboard.type('Half a thought');

    // Escape cancels the naming, not the node: the words are the student's.
    await page.keyboard.press('Escape');

    await expect.poll(() => outlineText(page)).toEqual(['Escape check', 'Half a thought']);
    await expect(page.locator('#assist-mm-live')).toContainText(
      "Kept 'Half a thought'. Press Delete to remove it."
    );
    await page.close();
  });

  /*
   * The handles sit beside the selected node, and the collapse badge sits on its edge. Worked out in
   * the picture's own units and then grown to the 24 pixel floor, they landed on top of that badge at
   * the zoom an ordinary map opens on: the student aimed at "collapse" and made a node instead.
   */
  test('a click on a node’s collapse badge at Fit collapses it and makes nothing', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Badge check', template: 'blank' });

    // Forty nodes, so the map opens zoomed out the way a real one does.
    const items = page.locator('[role="tree"] [role="treeitem"]');
    await items.first().focus();
    for (let branch = 0; branch < 8; branch += 1) {
      await page.keyboard.press('Home');
      await page.keyboard.press('Enter');
      await page.keyboard.type(`Branch ${branch}`);
      await page.keyboard.press('Control+Enter');
      for (let child = 0; child < 4; child += 1) {
        await page.keyboard.press('Shift+Enter');
        await page.keyboard.type(`Point ${branch}.${child}`);
        await page.keyboard.press('Control+Enter');
        await page.keyboard.press('ArrowUp');
      }
    }
    const before = await items.count();
    await page.locator('#assist-mm-fit').click();

    // The first branch is selected, so it is the node carrying the handles.
    const branchId = await items.nth(1).getAttribute('data-id');
    await items.nth(1).focus();
    const badge = page.locator(`button[data-toggle-for="${branchId}"]`);
    await expect(badge).toHaveAttribute('aria-expanded', 'true');

    await badge.click();

    await expect(badge).toHaveAttribute('aria-expanded', 'false');
    // Nothing was created: the press reached the control it was aimed at.
    await expect
      .poll(async () => page.evaluate(() => document.querySelectorAll('[role="treeitem"]').length))
      .toBeLessThan(before);
    await expect(page.locator('#assist-mm-live')).not.toContainText('Type to name it');
    await page.close();
  });

  test('Alt+M does nothing while the student is naming a node on the canvas', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Guard check', template: 'blank' });
    const editing = page.locator('input.mm-canvas__editor');

    await page.locator('[role="tree"] [role="treeitem"]').first().focus();
    await page.getByRole('button', { name: "Add a child to 'Guard check'" }).click();
    await expect(editing).toBeFocused();
    await page.keyboard.type('Still typing');

    await page.keyboard.press('Alt+m');

    // The field keeps the keyboard, and the half-typed name with it.
    await expect(editing).toBeFocused();
    await expect(editing).toHaveValue('Still typing');
    await expect(page.getByLabel('Find a parent')).not.toBeFocused();
    await page.close();
  });

  test('the quick-add handles build the map from the canvas, by click and by key', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Handle check', template: 'blank' });
    const items = page.locator('[role="tree"] [role="treeitem"]');
    const editing = page.locator('input.mm-canvas__editor');

    // Nothing but the centre yet, so there is a child handle and no sibling handle.
    await items.first().focus();
    const child = page.getByRole('button', { name: "Add a child to 'Handle check'" });
    await expect(child).toBeVisible();
    await expect(page.getByRole('button', { name: /^Add a sibling after/ })).toHaveCount(0);

    // A pointer press opens the editor on the canvas, where the student is looking.
    await child.click();
    await expect(editing).toBeFocused();
    await page.keyboard.type('Method');
    await page.keyboard.press('Control+Enter');
    await expect(items).toHaveCount(2);
    await expect.poll(() => outlineText(page)).toEqual(['Handle check', 'Method']);
    await expectOneTabStop(page);

    // And the keyboard reaches the same buttons (SC 2.1.1). The new node is selected, so the
    // sibling handle is now on it.
    const sibling = page.getByRole('button', { name: "Add a sibling after 'Method'" });
    await sibling.focus();
    await page.keyboard.press('Enter');
    await expect(editing).toBeFocused();
    await page.keyboard.type('Results');
    await page.keyboard.press('Control+Enter');
    await expect.poll(() => outlineText(page)).toEqual(['Handle check', 'Method', 'Results']);

    // A node the student never named goes, and the keyboard comes back to the handle they pressed.
    const again = page.getByRole('button', { name: "Add a child to 'Results'" });
    await again.focus();
    await page.keyboard.press('Enter');
    await expect(editing).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#assist-mm-live')).toContainText('New node discarded');
    await expect.poll(() => outlineText(page)).toEqual(['Handle check', 'Method', 'Results']);
    await expect(page.getByRole('button', { name: "Add a child to 'Results'" })).toBeFocused();
    await expectOneTabStop(page);

    // Both handles clear the 24px floor at any zoom (SC 2.5.8).
    await page.locator('#assist-mm-fit').click();
    for (let out = 0; out < 3; out += 1) {
      await page.getByRole('button', { name: 'Zoom out' }).click();
    }
    const size = await page.getByRole('button', { name: "Add a child to 'Results'" }).boundingBox();
    expect(size.width).toBeGreaterThanOrEqual(24);
    expect(size.height).toBeGreaterThanOrEqual(24);
    await page.close();
  });
});

test.describe('Mind map one way to make a node', () => {
  /*
   * ADR 0001: the outline is the editor, so it owns making a node. The toolbar used to apply the ops
   * itself with the literal text "New node" and then tell the student to go and press F2 — a third
   * way to make one, keeping none of the rules the other two keep.
   */
  test('the toolbar makes a node and puts the student straight into naming it', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Toolbar check', template: 'blank' });
    const editing = page.getByTestId('outline-row-edit');

    await page.locator('[role="tree"] [role="treeitem"]').first().focus();
    await page.locator('#assist-mm-new-child').click();

    await expect(editing).toBeFocused();
    await page.keyboard.type('From the toolbar');
    await page.keyboard.press('Control+Enter');
    await expect.poll(() => outlineText(page)).toEqual(['Toolbar check', 'From the toolbar']);
    await expectOneTabStop(page);

    // One press back, because making a node and naming it is one thing the student did.
    await page.keyboard.press('Control+z');
    await expect(page.locator('[role="tree"] [role="treeitem"]')).toHaveCount(1);
    await page.close();
  });
});

test.describe('Mind map entry points', () => {
  test('the popup opens the map library in its own tab', async ({ context, extensionId }) => {
    const page = await openFlatPopup(context, extensionId);

    const row = page.locator('#flat-root .assist-flat__row[data-tool="mindmap"]');
    await expect(row).toBeVisible();
    await expect(row.locator('.assist-flat__name')).toHaveText('Mind Map');

    // Filed with the other study supports, not under Reading or Writing.
    const group = await page.evaluate(() => {
      let node = document.querySelector('#flat-root .assist-flat__row[data-tool="mindmap"]');
      while (node && !node.classList.contains('assist-flat__group')) {
        node = node.previousElementSibling;
      }
      return node ? node.textContent : null;
    });
    expect(group).toBe('Study');

    const opened = context.waitForEvent('page', { timeout: 15000 });
    // Activated from the keyboard: this button is drawn by the registry renderer, and a student
    // who never touches a mouse has to be able to reach the map library (SC 2.1.1).
    await page.locator('#flat-btn-open-mind-maps').focus();
    await page.keyboard.press('Enter');
    const library = await opened;
    await library.waitForLoadState('domcontentloaded');
    expect(library.url()).toMatch(/\/src\/pages\/mind-map\/mindmap\.html$/);
    await expect(library.getByRole('button', { name: 'New map', exact: true })).toBeVisible({
      timeout: 15000,
    });
    await library.close();
  });

  test('Map this page turns the page headings into branches', async ({ context, extensionId }) => {
    const lms = await openFixturePage(context);
    const popup = await openReadyPopup(context, extensionId);

    // The popup reads the active tab once, at startup. Opening it took the foreground, so the page
    // under test is put back in front and the popup is re-initialised against it.
    await lms.bringToFront();
    await popup.reload();
    await waitForPopupReady(popup);

    const opened = context.waitForEvent('page', { timeout: 20000 });
    // Activated from the keyboard. It is the honest test — a student has to be able to map a page
    // without a mouse — and it is also the reliable one here: the popup is deliberately in the
    // background, where Chrome does not guarantee hit testing for a synthesised mouse event, while
    // a key event goes straight to the focused element in the page.
    // Flat draws the button under the Mind Map row, which is on by default.
    await popup.waitForSelector('#flat-btn-map-this-page', { timeout: 15000 });
    await popup.locator('#flat-btn-map-this-page').focus();
    await popup.keyboard.press('Enter');
    const editor = await opened;

    await expect(editor.locator('[role="tree"] [role="treeitem"]').first()).toBeVisible({
      timeout: 20000,
    });
    expect(editor.url()).toContain('/src/pages/mind-map/mindmap.html?map=');
    // The editor drops `&from=page` from the address as soon as it has read it, so the banner is
    // what proves the map came from a page rather than from a template.
    await expect(editor.locator('#assist-mm-banner')).toBeVisible();
    await expect(editor.locator('#assist-mm-banner-text')).toContainText('Photosynthesis notes');

    expect(await outlineOf(editor)).toMatchObject([
      { text: 'Photosynthesis notes', level: 1 },
      { text: 'Photosynthesis', level: 2 },
      { text: 'Light reactions', level: 2 },
      { text: 'The Calvin cycle', level: 2 },
      { text: 'Rubisco', level: 3 },
    ]);

    await editor.close();
    await popup.close();
    await lms.close();
  });

  test('a highlight on a page lands in the Inbox map', async ({ context, extensionId }) => {
    const lms = await openFixturePage(context);

    // The toast clears itself after two seconds, so what it said is recorded as it is written
    // rather than raced for afterwards.
    await lms.evaluate(() => {
      window.__assistToasts = [];
      new MutationObserver(() => {
        const toast = document.getElementById('assist-toast');
        if (toast) {
          window.__assistToasts.push(toast.textContent);
        }
      }).observe(document.body, { childList: true, subtree: true });
    });

    // A selection, then the mouseup the highlight menu listens for.
    await lms.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById('calvin'));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    const addToMap = lms.locator('#assist-highlight-menu button[aria-label="Add to mind map"]');
    await expect(addToMap).toBeVisible({ timeout: 10000 });
    await addToMap.click();

    await expect
      .poll(() => lms.evaluate(() => window.__assistToasts || []), { timeout: 15000 })
      .toContain('Added to your mind map Inbox.');

    const library = await context.newPage();
    await library.goto(EDITOR(extensionId));
    const inbox = library.getByTestId('map-card').filter({ hasText: 'Inbox' });
    await expect(inbox).toHaveCount(1, { timeout: 15000 });
    await expect(inbox.getByTestId('map-card-meta')).toContainText('2 nodes');

    await inbox.getByRole('button', { name: /^Open / }).click();
    await expect
      .poll(async () => (await outlineOf(library)).map(item => item.text), { timeout: 15000 })
      .toContain(CALVIN_TEXT);

    await library.close();
    await lms.close();
  });
});

test.describe('Mind map accessibility', () => {
  test('the editor is reachable, escapable and usable at 320 pixels', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Access check', template: 'lecture-notes' });

    // A positive tabindex reorders the whole document for everyone who tabs (SC 2.4.3).
    const positive = await page
      .locator('#assist-mm-editor [tabindex]')
      .evaluateAll(elements =>
        elements.map(element => Number(element.getAttribute('tabindex'))).filter(value => value > 0)
      );
    expect(positive).toEqual([]);

    // The way past the toolbar is the first thing a keyboard reaches (SC 2.4.1).
    const firstFocusable = await page.evaluate(() => {
      const candidates = document.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      for (const element of candidates) {
        if (element.offsetParent !== null || element.classList.contains('assist-mm-skip')) {
          return element.className;
        }
      }
      return null;
    });
    expect(firstFocusable).toContain('assist-mm-skip');
    await page.keyboard.press('Tab');
    await expect(page.locator('.assist-mm-skip')).toBeFocused();

    // Help is one keystroke away from anywhere, and gives focus back where it found it (SC 3.2.6).
    // Fit is the canvas's own control, in the zoom cluster: the toolbar's copy of it is gone, so
    // this id names one button rather than two that could drift apart.
    const fit = page.locator('#assist-mm-fit');
    await expect(fit).toBeVisible();
    await fit.focus();
    await page.keyboard.press('?');
    const dialog = page.locator('dialog.assist-mm-shortcuts');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(fit).toBeFocused();

    // Reflow: a student at 400% zoom must not have to scroll sideways to read (SC 1.4.10).
    await page.setViewportSize({ width: 320, height: 800 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth), { timeout: 10000 })
      .toBeLessThanOrEqual(320);
    await page.close();
  });

  /*
   * Details, AI and Study were two focus-trapped popovers and a boxed-in third column before this,
   * both able to be open at once and to cover the canvas's zoom cluster between them. One dock, one
   * visible panel, no trap.
   */
  test('the right dock shows one panel at a time and never holds the keyboard', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await startMap(page, { title: 'Dock check', template: 'blank' });

    const tab = name => page.locator(`#assist-mm-tab-${name}`);
    const panel = name => page.locator(`#assist-mm-panel-${name}`);

    await expect(tab('details')).toHaveAttribute('aria-selected', 'true');
    await expect(panel('details')).toBeVisible();
    await expect(panel('study')).toBeHidden();

    // One tab stop in the list; the arrows move between the tabs inside it (WAI-ARIA tabs).
    await tab('details').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(tab('study')).toBeFocused();
    await expect(panel('study')).toBeVisible();
    await expect(panel('details')).toBeHidden();
    await expect(panel('ai')).toBeHidden();

    // The zoom cluster is a corner of the canvas, not something a panel can sit over.
    await expect(page.locator('#assist-mm-fit')).toBeVisible();

    // Escape leaves the panel rather than closing anything the student cannot reopen.
    await page.keyboard.press('Escape');
    await expect(panel('details')).toBeVisible();
    await expect(tab('details')).toBeFocused();

    // And the toolbar button says whether its panel is the one showing.
    const study = page.locator('#assist-mm-study');
    await expect(study).toHaveAttribute('aria-pressed', 'false');
    await study.focus();
    await page.keyboard.press('Enter');
    await expect(study).toHaveAttribute('aria-pressed', 'true');
    await expect(panel('study')).toBeVisible();

    // Below 900px the docks become sheets over the canvas. The zoom cluster must stay on top of
    // them: a click is the proof, because Playwright refuses to click an element another one covers.
    // Narrowing with both docks open closes the right one, so the canvas is not buried under two.
    await page.setViewportSize({ width: 800, height: 700 });
    await expect(panel('study')).toBeHidden();
    await expect(study).toHaveAttribute('aria-pressed', 'false');
    await study.focus();
    await page.keyboard.press('Enter');
    await expect(study).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#assist-mm-fit').click({ timeout: 5000 });
    await expect(panel('study')).toBeVisible();

    await page.close();
  });
});

test.describe('Mind map more than one node at a time', () => {
  /**
   * Open the editor on a new map, watching for anything the page throws.
   *
   * Every case here asserts that nothing was raised: the pointer rules below run through d3-drag,
   * and the way they fail is an exception out of a gesture handler — which changes nothing on screen
   * and so passes every assertion about the map.
   *
   * @param {import('@playwright/test').BrowserContext} context
   * @param {string} extensionId
   * @param {string} title
   * @returns {Promise<{page: import('@playwright/test').Page, errors: string[]}>}
   */
  async function openMapPage(context, extensionId, title) {
    const page = await openLibrary(context, extensionId);
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await startMap(page, { title, template: 'blank' });
    return { page, errors };
  }

  /**
   * Build a flat set of branches from the keyboard and hand back the node ids in outline order.
   *
   * @param {import('@playwright/test').Page} page
   * @param {string[]} names
   * @returns {Promise<string[]>}
   */
  async function buildBranches(page, names) {
    const items = page.locator('[role="tree"] [role="treeitem"]');
    await items.first().focus();
    for (const [index, name] of names.entries()) {
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('outline-row-edit')).toBeFocused();
      await page.keyboard.type(name);
      await page.keyboard.press('Control+Enter');
      // Each branch is committed before the next Enter, so a loaded machine cannot run two together.
      await expect(page.getByTestId('outline-row-edit')).toHaveCount(0);
      await expect(items).toHaveCount(index + 2);
    }
    return items.evaluateAll(list => list.map(item => item.dataset.id));
  }

  const selectedText = page =>
    outlineOf(page)
      .then(items => items.filter(item => item.selected))
      .then(items => items.map(item => item.text));

  const levels = page => outlineOf(page).then(items => items.map(item => item.level));

  const nodeBox = (page, id) =>
    page.locator(`g.mm-node[data-node-id="${id}"] rect.mm-node__box`).boundingBox();
  const nodeGroup = (page, id) => page.locator(`g.mm-node[data-node-id="${id}"]`);
  const inspector = page => page.locator('.mm-inspector');

  /** Press, move and release the real mouse, which is the only way a drag happens in Chrome. */
  async function dragBetween(page, fromBox, toBox) {
    await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 8 });
    await page.mouse.up();
  }

  test('the tree says it takes a set, and marks every node in it', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Set marks');
    await buildBranches(page, ['First', 'Second', 'Third']);

    await expect(page.locator('[role="tree"]')).toHaveAttribute('aria-multiselectable', 'true');

    // Every row carries aria-selected, whether it is in the set or not.
    const flags = await page
      .locator('[role="tree"] [role="treeitem"]')
      .evaluateAll(items => items.map(item => item.getAttribute('aria-selected')));
    expect(flags.every(flag => flag === 'true' || flag === 'false')).toBe(true);

    await page.locator('[role="treeitem"][tabindex="0"]').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    await expect.poll(() => selectedText(page)).toEqual(['First', 'Second']);
    await expect(page.locator('#assist-mm-live')).toContainText('2 nodes selected.');
    await expectOneTabStop(page);
    expect(errors).toEqual([]);
    await page.close();
  });

  test('a Shift range indents as one block, and one undo puts it back', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Block indent');
    await buildBranches(page, ['First', 'Second', 'Third']);

    await page.locator('[role="treeitem"][tabindex="0"]').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await expect.poll(() => selectedText(page)).toEqual(['Second', 'Third']);

    await page.keyboard.press('Tab');

    // Both went under 'First', in the order they were in, as one step.
    await expect.poll(() => levels(page)).toEqual([1, 2, 3, 3]);
    await expect
      .poll(() => outlineText(page))
      .toEqual(['Block indent', 'First', 'Second', 'Third']);
    await expect(page.locator('#assist-mm-live')).toContainText('Indented 2 nodes.');
    await expect.poll(() => selectedText(page)).toEqual(['Second', 'Third']);
    await expectOneTabStop(page);

    await page.keyboard.press('Control+z');
    await expect.poll(() => levels(page)).toEqual([1, 2, 2, 2]);
    expect(errors).toEqual([]);
    await page.close();
  });

  test('a plain click on an unselected node selects that node alone', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Plain click');
    const ids = await buildBranches(page, ['First', 'Second']);

    // 'Second' is selected, being the one just made. A plain click on 'First' takes the selection
    // there and nowhere else — the press decides it, not the release.
    await expect(nodeGroup(page, ids[2])).toHaveClass(/mm-node--selected/);
    const first = await nodeBox(page, ids[1]);
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();

    await expect(nodeGroup(page, ids[1])).toHaveClass(/mm-node--selected/);
    await expect(nodeGroup(page, ids[2])).not.toHaveClass(/mm-node--selected/);
    await page.mouse.up();

    await expect.poll(() => selectedText(page)).toEqual(['First']);
    await expect(nodeGroup(page, ids[1]).locator('rect.mm-node__ring')).toHaveCount(1);
    await expect(nodeGroup(page, ids[2]).locator('rect.mm-node__ring')).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.close();
  });

  test('Ctrl+click picks two nodes on the canvas and a drag moves both', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Set drag');
    const ids = await buildBranches(page, ['Target', 'First', 'Second']);

    const first = await nodeBox(page, ids[2]);
    await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2);
    await expect.poll(() => selectedText(page)).toEqual(['First']);
    const second = await nodeBox(page, ids[3]);
    await clickHolding(page, 'Control', second.x + second.width / 2, second.y + second.height / 2);
    await expect.poll(() => selectedText(page)).toEqual(['First', 'Second']);

    // Both rings are on the picture, and the primary is marked apart from the other.
    await expect(nodeGroup(page, ids[2]).locator('rect.mm-node__ring')).toHaveCount(1);
    await expect(nodeGroup(page, ids[3]).locator('rect.mm-node__ring')).toHaveCount(1);
    await expect(nodeGroup(page, ids[3])).toHaveClass(/mm-node--primary/);
    // The quick-add handles belong to one node, so they stand down for a set.
    await expect(page.locator('button.mm-canvas__handle')).toHaveCount(0);

    await dragBetween(page, first, await nodeBox(page, ids[1]));

    await expect.poll(() => levels(page)).toEqual([1, 2, 3, 3]);
    await expect(page.locator('#assist-mm-live')).toContainText("Moved 2 nodes into 'Target'.");
    // The set is still the set: a drag is not a way of choosing.
    await expect.poll(() => selectedText(page)).toEqual(['First', 'Second']);

    await page.keyboard.press('Control+z');
    await expect.poll(() => levels(page)).toEqual([1, 2, 2, 2]);
    expect(errors).toEqual([]);
    await page.close();
  });

  test('a plain click on one node of a set collapses to it on the release', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Collapse on release');
    const ids = await buildBranches(page, ['First', 'Second']);

    const first = await nodeBox(page, ids[1]);
    await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2);
    const second = await nodeBox(page, ids[2]);
    await clickHolding(page, 'Control', second.x + second.width / 2, second.y + second.height / 2);
    await expect.poll(() => selectedText(page)).toEqual(['First', 'Second']);

    // Down on one of them: the set stays, because this press may be a drag of all of it.
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await page.mouse.down();
    await expect.poll(() => selectedText(page)).toEqual(['First', 'Second']);

    await page.mouse.up();
    await expect.poll(() => selectedText(page)).toEqual(['First']);
    expect(errors).toEqual([]);
    await page.close();
  });

  test('Shift+click on the canvas adds a node and takes it out again', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Shift click');
    const ids = await buildBranches(page, ['First', 'Second']);

    const first = await nodeBox(page, ids[1]);
    await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2);
    const second = await nodeBox(page, ids[2]);

    await clickHolding(page, 'Shift', second.x + second.width / 2, second.y + second.height / 2);
    await expect.poll(() => selectedText(page)).toEqual(['First', 'Second']);

    await clickHolding(page, 'Shift', second.x + second.width / 2, second.y + second.height / 2);
    await expect.poll(() => selectedText(page)).toEqual(['First']);
    expect(errors).toEqual([]);
    await page.close();
  });

  test('pressing the centre and dragging moves nothing and raises nothing', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Centre drag');
    const ids = await buildBranches(page, ['First', 'Second']);

    const centre = await nodeBox(page, ids[0]);
    const first = await nodeBox(page, ids[1]);
    await dragBetween(page, centre, first);

    // The centre cannot move, so the map is untouched — and the press still chose it.
    await expect.poll(() => levels(page)).toEqual([1, 2, 2]);
    await expect.poll(() => selectedText(page)).toEqual(['Centre drag']);
    await expect(page.locator('.mm-node--dragging')).toHaveCount(0);
    expect(errors).toEqual([]);
    await page.close();
  });

  test('Delete with three selected says the count, and one undo brings all three back', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Set delete');
    await buildBranches(page, ['First', 'Second', 'Third']);

    await page.locator('[role="treeitem"][tabindex="0"]').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await expect.poll(() => selectedText(page)).toEqual(['First', 'Second', 'Third']);

    await page.keyboard.press('Delete');

    await expect.poll(() => outlineText(page)).toEqual(['Set delete']);
    await expect(page.locator('#assist-mm-live')).toContainText('Deleted 3 nodes.');
    await expectOneTabStop(page);

    await page.keyboard.press('Control+z');
    await expect.poll(() => outlineText(page)).toEqual(['Set delete', 'First', 'Second', 'Third']);
    expect(errors).toEqual([]);
    await page.close();
  });

  test('the Details panel says Mixed and then sets one colour on the whole set', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Set colour');
    await buildBranches(page, ['First', 'Second']);

    // One colour on the first node only, so the two disagree.
    await page.locator('[role="treeitem"][tabindex="0"]').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    const teal = inspector(page).getByRole('radio', { name: 'Teal', exact: true });
    await teal.check();
    await expect(teal).toBeChecked();

    await page.locator('[role="treeitem"][tabindex="0"]').focus();
    await page.keyboard.press('Shift+ArrowDown');
    await expect.poll(() => selectedText(page)).toEqual(['First', 'Second']);

    await expect(page.locator('.mm-inspector__title')).toHaveText('2 nodes selected');
    await expect(page.locator('.mm-inspector__colours-group .mm-inspector__mixed')).toContainText(
      'Mixed: these nodes have different colours.'
    );
    await expect(teal).not.toBeChecked();
    // Text is edited one node at a time, so it is not offered for a set.
    await expect(inspector(page).getByLabel('Text', { exact: true })).toBeHidden();

    await inspector(page).getByRole('radio', { name: 'Violet', exact: true }).check();

    await expect(page.locator('#assist-mm-live')).toContainText('Branch colour Violet on 2 nodes.');
    await expect(page.locator('.mm-inspector__colours-group .mm-inspector__mixed')).toBeHidden();

    // One undo step for the pair.
    await page.keyboard.press('Control+z');
    await expect(page.locator('.mm-inspector__colours-group .mm-inspector__mixed')).toContainText(
      'Mixed'
    );
    expect(errors).toEqual([]);
    await page.close();
  });

  test('a rename with another panel writing mid-way leaves no blank one undo away', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Blank guard');
    await buildBranches(page, ['First']);
    const row = page.locator('[role="tree"] [role="treeitem"]').nth(1);

    // A note typed in the Details panel, left at once: its write is still on a timer.
    const notes = inspector(page).getByLabel('Notes', { exact: true });
    await notes.click();
    await page.keyboard.type('A note about First');

    // Back to the outline WITH THE KEYBOARD. This is the move that used to break: leaving the field
    // flushes the pending write, the map changes, and a tree that rebuilt itself took away the row
    // the browser was in the middle of moving focus to — which drops focus on `<body>`. A click hides
    // it completely, because the row's own press handler puts focus back afterwards.
    let landed = false;
    for (let step = 0; step < 30 && !landed; step += 1) {
      await page.keyboard.press('Shift+Tab');
      landed = await page.evaluate(
        () => document.activeElement?.getAttribute('role') === 'treeitem'
      );
    }
    expect(landed).toBe(true);
    await expect(row).toBeFocused();

    // And the keyboard works where it landed: into a rename, clear the name, type a new one, finish.
    await page.keyboard.press('F2');
    await expect(page.getByTestId('outline-row-edit')).toBeFocused();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.type('First, reworded');
    await page.keyboard.press('Control+Enter');
    await expect.poll(() => outlineText(page)).toEqual(['Blank guard', 'First, reworded']);

    // One press back: the name the student started with, and never an empty row.
    await page.keyboard.press('Control+z');
    await expect.poll(() => outlineText(page)).toEqual(['Blank guard', 'First']);
    expect(errors).toEqual([]);
    await page.close();
  });

  test('the question mark opens nothing while another dialog is up', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Help guard');
    const shortcuts = page.locator('dialog.assist-mm-shortcuts');

    await page.keyboard.press('Control+o');
    const openDialog = page.locator('dialog[data-dialog="open"]');
    await expect(openDialog).toBeVisible();

    await page.keyboard.press('?');
    await page.keyboard.press('Control+/');
    await expect(shortcuts).toBeHidden();
    await expect(openDialog).toBeVisible();

    // And Help is back the moment the dialog is closed. The "?" went into the dialog's search box,
    // as it should, and Escape in a search box empties it before it closes anything.
    await page.keyboard.press('Escape');
    if (await openDialog.isVisible()) {
      await page.keyboard.press('Escape');
    }
    await expect(openDialog).toBeHidden();
    // From somewhere that is not a text field: a field keeps the "?" for itself, which is right.
    await page.locator('[role="treeitem"][tabindex="0"]').focus();
    await page.keyboard.press('?');
    await expect(shortcuts).toBeVisible();
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
    await page.close();
  });

  test('Enter with three rows selected says the other two were dropped', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Dropped set');
    await buildBranches(page, ['First', 'Second', 'Third']);

    await page.locator('[role="treeitem"][tabindex="0"]').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await expect.poll(() => selectedText(page)).toEqual(['First', 'Second', 'Third']);

    await page.keyboard.press('Enter');

    await expect(page.locator('#assist-mm-live')).toContainText(
      'New node. The other 2 nodes are no longer selected. Type to name it.'
    );
    await expect(page.getByTestId('outline-row-edit')).toBeFocused();
    // The new node is the only thing selected, and no count is read over the sentence above.
    await expect.poll(() => selectedText(page)).toHaveLength(1);
    await expect(page.locator('#assist-mm-live')).not.toContainText('1 node selected');

    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
    await page.close();
  });

  // ── One branch at a time ──────────────────────────────────────────────────
  //
  // Focus mode is a VIEW: the outline and the picture show one branch, and nothing about the map
  // changes. Only a real Chrome can show that the two panes agree about what is on screen, that the
  // trail is reachable, and that the strip carrying it does not land on top of anything.

  const crumbs = page =>
    page.locator('nav[aria-label="Focused branch"] .assist-mm-crumb').evaluateAll(list =>
      list.map(control => ({
        text: control.textContent,
        tag: control.tagName,
        current: control.getAttribute('aria-current'),
      }))
    );

  /**
   * "Map > Body > [Argument 1, Argument 2], Sources", built from the keyboard alone.
   *
   * @param {import('@playwright/test').Page} page
   * @returns {Promise<string[]>} the node ids in outline order.
   */
  async function buildEssay(page) {
    await buildBranches(page, ['Body', 'Argument 1', 'Argument 2', 'Sources']);
    const items = page.locator('[role="tree"] [role="treeitem"]');
    for (const steps of [2, 3]) {
      await items.first().focus();
      await page.keyboard.press('Home');
      for (let step = 0; step < steps; step += 1) {
        await page.keyboard.press('ArrowDown');
      }
      await page.keyboard.press('Tab');
    }
    await expect.poll(() => levels(page)).toEqual([1, 2, 3, 3, 2]);
    return items.evaluateAll(list => list.map(item => item.dataset.id));
  }

  /**
   * Put the keyboard on a row by its text.
   *
   * @param {import('@playwright/test').Page} page
   * @param {string} text
   */
  async function focusRow(page, text) {
    // Rows nest, so "the first tree item that contains this text" is the centre. Find the row whose
    // OWN text it is, and press it: a press selects, which a bare focus() does not.
    await page.getByTestId('outline-row-text').getByText(text, { exact: true }).first().click();
    // A press on the row that is already selected starts a rename; this helper only wants the row.
    if (await page.getByTestId('outline-row-edit').isVisible()) {
      await page.keyboard.press('Escape');
    }
    const row = page.locator('[role="treeitem"][tabindex="0"]');
    await expect(row.getByTestId('outline-row-text').first()).toHaveText(text);
    await row.focus();
  }

  test('one branch fills both panes, entered by the key and by the button', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Focused essay');
    const ids = await buildEssay(page);

    await focusRow(page, 'Body');
    await page.keyboard.press('Alt+Shift+F');

    // The outline: the branch alone, with the levels rebased so nothing reads "level 3" at the top.
    await expect.poll(() => outlineText(page)).toEqual(['Body', 'Argument 1', 'Argument 2']);
    await expect.poll(() => levels(page)).toEqual([1, 2, 2]);
    expect(await outlineOf(page)).toMatchObject([
      { text: 'Body', level: 1, position: 1, setSize: 1 },
      { text: 'Argument 1', level: 2, position: 1, setSize: 2 },
      { text: 'Argument 2', level: 2, position: 2, setSize: 2 },
    ]);

    // The picture: the same three nodes and nothing else.
    await expect(page.locator('g.mm-node')).toHaveCount(3);
    await expect(nodeGroup(page, ids[0])).toHaveCount(0);
    await expect(nodeGroup(page, ids[1])).toHaveClass(/mm-node--root/);

    // The trail: every ancestor a button, the branch itself not one.
    expect(await crumbs(page)).toEqual([
      { text: 'Focused essay', tag: 'BUTTON', current: null },
      { text: 'Body', tag: 'SPAN', current: 'location' },
    ]);
    await expect(page.locator('#assist-mm-focus')).toHaveAttribute('aria-pressed', 'true');
    await expectOneTabStop(page);

    // And the toolbar button is the same command: pressed again, the whole map is back.
    await page.locator('#assist-mm-focus').click();
    await expect.poll(() => outlineText(page)).toHaveLength(5);
    await expect(page.locator('#assist-mm-focus')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('nav[aria-label="Focused branch"]')).toBeHidden();

    expect(errors).toEqual([]);
    await page.close();
  });

  test('an edit made inside a branch is an edit to the whole map', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Edit inside');
    await buildEssay(page);

    await focusRow(page, 'Body');
    await page.keyboard.press('Alt+Shift+F');
    await focusRow(page, 'Argument 2');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('outline-row-edit')).toBeFocused();
    await page.keyboard.type('Argument 3');
    await page.keyboard.press('Control+Enter');

    await page.keyboard.press('Escape');

    await expect
      .poll(() => outlineText(page))
      .toEqual(['Edit inside', 'Body', 'Argument 1', 'Argument 2', 'Argument 3', 'Sources']);
    await expect(page.locator('#assist-mm-live')).toContainText('Showing the whole map.');
    // It survives the trip to the database, which is what makes it an edit rather than a view.
    await page.reload();
    await expect
      .poll(() => outlineText(page))
      .toEqual(['Edit inside', 'Body', 'Argument 1', 'Argument 2', 'Argument 3', 'Sources']);
    // View state is per tab and is not stored: a reload comes back to the whole map.
    await expect(page.locator('nav[aria-label="Focused branch"]')).toBeHidden();

    expect(errors).toEqual([]);
    await page.close();
  });

  test('Escape drops the set, then the branch, then leaves the outline', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Escape order');
    await buildEssay(page);

    await focusRow(page, 'Body');
    await page.keyboard.press('Alt+Shift+F');
    await focusRow(page, 'Argument 1');
    await page.keyboard.press('Shift+ArrowDown');
    await expect.poll(() => selectedText(page)).toEqual(['Argument 1', 'Argument 2']);

    await page.keyboard.press('Escape');
    await expect.poll(() => selectedText(page)).toHaveLength(1);
    await expect.poll(() => outlineText(page)).toHaveLength(3);

    await page.keyboard.press('Escape');
    await expect.poll(() => outlineText(page)).toHaveLength(5);
    await expect(page.locator('[role="tree"]')).toContainText('Sources');

    await page.keyboard.press('Escape');
    await expect(page.locator('#assist-mm-outline-hint')).toBeFocused();

    expect(errors).toEqual([]);
    await page.close();
  });

  test('an undo the student cannot see says what it did', async ({ context, extensionId }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Invisible undo');
    await buildEssay(page);

    // A change outside the branch, made before narrowing the view to the branch.
    await focusRow(page, 'Sources');
    await page.keyboard.press('F2');
    await page.keyboard.type(' and reading');
    await page.keyboard.press('Control+Enter');

    await focusRow(page, 'Body');
    await page.keyboard.press('Alt+Shift+F');
    await expect.poll(() => outlineText(page)).toEqual(['Body', 'Argument 1', 'Argument 2']);

    await page.locator('#assist-mm-canvas-host').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');

    await expect(page.locator('#assist-mm-toast')).toContainText(
      'Undone: a change outside this branch.'
    );
    await expect(page.locator('#assist-mm-live')).toContainText(
      'Undone: a change outside this branch.'
    );
    // Still the branch, unchanged.
    await expect.poll(() => outlineText(page)).toEqual(['Body', 'Argument 1', 'Argument 2']);
    // And the change really was taken back.
    await page.keyboard.press('Escape');
    await expect.poll(() => outlineText(page)).toContain('Sources');

    expect(errors).toEqual([]);
    await page.close();
  });

  test('an undo that takes the branch away brings the whole map back, in words', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Branch undone');
    await buildEssay(page);

    // A branch made and then focused on, so one Ctrl+Z is enough to take it away again.
    await focusRow(page, 'Sources');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Extra');
    await page.keyboard.press('Control+Enter');
    await focusRow(page, 'Extra');
    await page.keyboard.press('Alt+Shift+F');
    await expect.poll(() => outlineText(page)).toEqual(['Extra']);

    await page.keyboard.press('Control+z');

    await expect(page.locator('#assist-mm-toast')).toContainText(
      "'Extra' is no longer here, so this is the whole map again."
    );
    await expect(page.locator('nav[aria-label="Focused branch"]')).toBeHidden();
    await expect.poll(() => outlineText(page)).toHaveLength(5);
    await expectOneTabStop(page);

    expect(errors).toEqual([]);
    await page.close();
  });

  test('the whole round trip is possible from the keyboard alone', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Keyboard branch');
    await buildEssay(page);

    await focusRow(page, 'Argument 1');
    await page.keyboard.press('Alt+Shift+F');
    await expect.poll(() => outlineText(page)).toEqual(['Argument 1']);

    // Into the toolbar: one tab stop for the whole strip, and Focus is reachable with the arrows.
    const toolbar = page.locator('[role="toolbar"]');
    await expect
      .poll(() =>
        toolbar
          .locator('button, select')
          .evaluateAll(list => list.filter(control => control.tabIndex === 0).length)
      )
      .toBe(1);
    await page.locator('[role="toolbar"] [tabindex="0"]').focus();
    for (let step = 0; step < 12; step += 1) {
      if (
        await page.locator('#assist-mm-focus').evaluate(node => node === document.activeElement)
      ) {
        break;
      }
      await page.keyboard.press('ArrowRight');
    }
    await expect(page.locator('#assist-mm-focus')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => outlineText(page)).toHaveLength(5);

    // And the trail, reached by Tab from the map region rather than by pointing at it.
    await focusRow(page, 'Body');
    await page.keyboard.press('Alt+Shift+F');
    const crumb = page.locator('nav[aria-label="Focused branch"] button').first();
    await crumb.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => outlineText(page)).toHaveLength(5);
    await expect(page.locator('nav[aria-label="Focused branch"]')).toBeHidden();

    expect(errors).toEqual([]);
    await page.close();
  });

  test('the trail sits clear of the toolbar and the zoom cluster on a phone', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Narrow trail');
    await buildEssay(page);
    await page.setViewportSize({ width: 380, height: 700 });

    await focusRow(page, 'Argument 2');
    await page.keyboard.press('Alt+Shift+F');
    const nav = page.locator('nav[aria-label="Focused branch"]');
    await expect(nav).toBeVisible();

    const trail = await nav.boundingBox();
    const toolbar = await page.locator('[role="toolbar"]').boundingBox();
    const zoom = await page.locator('.mm-canvas__zoom').boundingBox();

    // Its own row: it starts where the toolbar ends.
    expect(trail.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height - 1);
    // And the zoom cluster is below it, not under it.
    expect(zoom.y).toBeGreaterThanOrEqual(trail.y + trail.height - 1);
    // Nothing runs off the side of a page that does not scroll sideways.
    expect(trail.x + trail.width).toBeLessThanOrEqual(380);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);

    expect(errors).toEqual([]);
    await page.close();
  });

  /**
   * Record every sentence the live region says from here on.
   *
   * The region is written by replacing its text, so a later announcement takes the earlier one away
   * before an assertion can read it. Watching it is the only way to grade a sentence that is followed
   * by another.
   *
   * @param {import('@playwright/test').Page} page
   */
  async function watchSpeech(page) {
    await page.evaluate(() => {
      window.__assistSaid = [];
      const live = document.getElementById('assist-mm-live');
      new MutationObserver(() => {
        const text = live.textContent;
        if (text) {
          window.__assistSaid.push(text);
        }
      }).observe(live, { childList: true, characterData: true, subtree: true });
    });
  }

  const speech = page => page.evaluate(() => window.__assistSaid || []);

  test('undoing with the mouse while naming a node stores nothing nameless', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Undo while naming');
    const items = page.locator('[role="tree"] [role="treeitem"]');
    await items.first().focus();
    await watchSpeech(page);

    // A new node, half named, with the caret still in the field.
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('outline-row-edit')).toBeFocused();
    await page.keyboard.type('Hello');

    // The toolbar's Undo, pressed with the MOUSE: the shared event helper prevents the mousedown
    // default, so the caret never leaves the field and the step lands with the editor still open.
    await page.locator('#assist-mm-undo').click();

    // What matters is the outcome: the half-made node is gone and the field with it. Which true
    // sentence is heard depends on the browser's event order: Chrome says "Undone" (the student
    // pressed Undo and the node went), the unit environment says "New node discarded".
    await expect(page.getByTestId('outline-row-edit')).toHaveCount(0);
    await expect.poll(() => outlineText(page)).toEqual(['Undo while naming']);
    await expect
      .poll(() => speech(page).then(said => said.join(' | ')))
      .toMatch(/Undone|New node discarded/);

    // Past the autosave's quiet time, and then back from the database: nothing nameless was written.
    await page.waitForTimeout(1500);
    await page.reload();
    await expect(items.first()).toBeVisible({ timeout: 15000 });
    expect(await outlineText(page)).toEqual(['Undo while naming']);
    await expectOneTabStop(page);

    expect(errors).toEqual([]);
    await page.close();
  });

  test('read aloud says it is reading the branch when one is focused', async ({
    context,
    extensionId,
  }) => {
    const { page, errors } = await openMapPage(context, extensionId, 'Read the branch');
    await buildEssay(page);

    await focusRow(page, 'Body');
    await page.keyboard.press('Alt+Shift+F');
    await expect.poll(() => outlineText(page)).toEqual(['Body', 'Argument 1', 'Argument 2']);
    await watchSpeech(page);

    await page.keyboard.press('Alt+r');

    await expect
      .poll(() => speech(page).then(said => said.join(' | ')))
      .toContain('in this branch');
    // Three nodes, which is the branch and nothing else.
    await expect.poll(() => speech(page).then(said => said.join(' | '))).toContain('3 nodes aloud');

    expect(errors).toEqual([]);
    await page.close();
  });
  // ── The release pass ──────────────────────────────────────────────────────
  //
  // One case for each thing found by hand in Chrome before 1.0.0 and invisible to jsdom: where the
  // caret is after a press, what a press commits, what is drawn over what, and whether a control
  // can be reached at all. Every one of these was green in the unit suite while broken on screen.

  test.describe('Mind map release pass', () => {
    /** What the canvas has drawn in a node, which is the other half of "the map changed". */
    const canvasText = (page, id) =>
      page.locator(`g.mm-node[data-node-id="${id}"] text.mm-node__text`).textContent();

    /** The Details panel's Text box. */
    const textField = page => page.locator('.mm-inspector').getByLabel('Text', { exact: true });

    /** Whether two boxes share no pixel at all. */
    const clearOf = (a, b) =>
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y;

    test('a press on the canvas takes the caret out of the Details text box', async ({
      context,
      extensionId,
    }) => {
      const { page, errors } = await openMapPage(context, extensionId, 'Caret release');
      const ids = await buildBranches(page, ['Alpha', 'Beta']);

      await focusRow(page, 'Alpha');
      const field = textField(page);
      await expect(field).toHaveValue('Alpha');

      // The caret in the middle of the word, which is where a student correcting a name puts it.
      await field.click();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.type('XX');
      await expect.poll(() => outlineText(page)).toEqual(['Caret release', 'AlXXpha', 'Beta']);

      const beta = await nodeBox(page, ids[2]);
      await page.mouse.click(beta.x + beta.width / 2, beta.y + beta.height / 2);
      await expect.poll(() => selectedText(page)).toEqual(['Beta']);

      // The box was given its blur, so the keyboard is no longer in it — and the two Backspaces
      // that follow are not, as they used to be, edits to whichever node the panel swung round to.
      expect(await field.evaluate(element => element === document.activeElement)).toBe(false);
      // And it landed somewhere real. Dropped on `<body>` instead, nothing owned the focus the
      // student had just moved: the panel's own rescue never ran and their next Tab started again at
      // the top of the page. The canvas they pressed is where they are.
      const landed = await page.evaluate(() => ({
        tag: document.activeElement?.tagName ?? null,
        onCanvas: Boolean(document.activeElement?.closest('.mm-canvas')),
      }));
      expect(landed.tag).not.toBe('BODY');
      expect(landed.onCanvas).toBe(true);
      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');

      await expect.poll(() => outlineText(page)).toEqual(['Caret release', 'AlXXpha', 'Beta']);
      expect(await canvasText(page, ids[2])).toBe('Beta');
      expect(await canvasText(page, ids[1])).toBe('AlXXpha');
      expect(errors).toEqual([]);
      await page.close();
    });

    test('a rename begun on the canvas is kept when the next node is pressed', async ({
      context,
      extensionId,
    }) => {
      const { page, errors } = await openMapPage(context, extensionId, 'Rename kept');
      const ids = await buildBranches(page, ['Alpha', 'Beta']);
      const editing = page.locator('input.mm-canvas__editor');

      const alpha = await nodeBox(page, ids[1]);
      await page.mouse.dblclick(alpha.x + alpha.width / 2, alpha.y + alpha.height / 2);
      await expect(editing).toBeFocused();
      // The field opens with the name selected, so what is typed replaces it.
      await page.keyboard.type('Renamed');

      const beta = await nodeBox(page, ids[2]);
      await page.mouse.click(beta.x + beta.width / 2, beta.y + beta.height / 2);

      // The press closes the field by COMMITTING it: the words are the student's, and only Escape
      // throws them away.
      await expect(editing).toHaveCount(0);
      await expect.poll(() => outlineText(page)).toEqual(['Rename kept', 'Renamed', 'Beta']);
      expect((await outlineText(page)).every(text => text.trim() !== '')).toBe(true);
      expect(await canvasText(page, ids[1])).toBe('Renamed');
      await expectOneTabStop(page);
      expect(errors).toEqual([]);
      await page.close();
    });

    test('Shift+Enter part way through naming a node starts one inside it', async ({
      context,
      extensionId,
    }) => {
      const { page, errors } = await openMapPage(context, extensionId, 'Inside node');
      const items = page.locator('[role="tree"] [role="treeitem"]');
      await items.first().focus();
      await watchSpeech(page);

      await page.keyboard.press('Enter');
      await expect(page.getByTestId('outline-row-edit')).toBeFocused();
      await page.keyboard.type('Gamma');
      await page.keyboard.press('Shift+Enter');
      await expect(page.getByTestId('outline-row-edit')).toBeFocused();
      await page.keyboard.type('Gamma child');
      await page.keyboard.press('Enter');
      // Enter offers another node after the one just named; nothing is typed into it, so it goes.
      await expect(page.getByTestId('outline-row-edit')).toBeFocused();
      await page.keyboard.press('Escape');

      await expect.poll(() => outlineText(page)).toEqual(['Inside node', 'Gamma', 'Gamma child']);
      // One level deeper, which is the whole of what Shift+Enter promises in the shortcut list.
      await expect.poll(() => levels(page)).toEqual([1, 2, 3]);
      await expect
        .poll(() => speech(page).then(said => said.join(' | ')))
        .toContain("New node inside 'Gamma'.");
      await expectOneTabStop(page);
      expect(errors).toEqual([]);
      await page.close();
    });

    test('the arrow keys walk past the Layout select without changing it', async ({
      context,
      extensionId,
    }) => {
      const { page, errors } = await openMapPage(context, extensionId, 'Toolbar rove');
      const layout = page.locator('#assist-mm-layout');
      const study = page.locator('#assist-mm-study');
      const chosen = await layout.inputValue();

      /** Where the keyboard is along the strip, counted the way the toolbar's own code counts it. */
      const standingAt = () =>
        page.evaluate(() => {
          const bar = document.querySelector('[role="toolbar"]');
          const all = [...bar.querySelectorAll('button, select')].filter(
            control => !control.disabled && !control.closest('[hidden]')
          );
          return all.indexOf(document.activeElement);
        });

      const roveTo = async target => {
        for (let step = 0; step < 15; step += 1) {
          if (await target.evaluate(element => element === document.activeElement)) {
            return;
          }
          await page.keyboard.press('ArrowRight');
        }
      };

      await page.locator('#assist-mm-undo').focus();
      await roveTo(layout);
      await expect(layout).toBeFocused();

      const before = await standingAt();
      await page.keyboard.press('ArrowRight');

      // Right is the strip's key, not the select's: it moves the keyboard one control along and the
      // press is taken, so the layout — and the picture it draws — stays where the student left it.
      await expect(layout).toHaveValue(chosen);
      expect(await standingAt()).toBe(before + 1);

      // And the walk carries on to the end of the strip, which is what the select used to stop.
      await roveTo(study);
      await expect(study).toBeFocused();
      await expect(layout).toHaveValue(chosen);
      expect(errors).toEqual([]);
      await page.close();
    });

    test('the find box shows what it found and keeps the keyboard', async ({
      context,
      extensionId,
    }) => {
      const { page, errors } = await openMapPage(context, extensionId, 'Revision map');
      await buildBranches(page, ['Photosynthesis notes', 'Photosynthesis sources', 'Timeline']);
      const items = page.locator('[role="tree"] [role="treeitem"]');
      const find = page.locator('#assist-mm-find');
      const status = page.locator('#assist-mm-find-status');

      await find.click();
      await page.keyboard.type('Photosynthesis');

      // Seen, not only said: the outline does not move while the student types, by design.
      await expect(status).toBeVisible();
      await expect(status).toHaveText('2 matches');

      await page.keyboard.press('Enter');
      await expect(status).toHaveText('Match 1 of 2');
      await page.keyboard.press('Enter');
      await expect(status).toHaveText('Match 2 of 2');

      // The caret never left the box, so the second Enter asked for the next match instead of
      // making a nameless node on the outline row the first one had jumped to.
      await expect(find).toBeFocused();
      await expect(items).toHaveCount(4);
      await expect
        .poll(() => outlineText(page))
        .toEqual(['Revision map', 'Photosynthesis notes', 'Photosynthesis sources', 'Timeline']);
      expect(errors).toEqual([]);
      await page.close();
    });

    test('emptying a name in the outline says so where the student can see it', async ({
      context,
      extensionId,
    }) => {
      const { page, errors } = await openMapPage(context, extensionId, 'Kept name');
      await buildBranches(page, ['Alpha']);
      const toast = page.locator('#assist-mm-toast');

      await focusRow(page, 'Alpha');
      await page.keyboard.press('F2');
      await expect(page.getByTestId('outline-row-edit')).toBeFocused();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Delete');
      await page.keyboard.press('Enter');

      // The row writing its old name back in is not on its own an explanation.
      await expect(toast).toBeVisible();
      await expect(toast).toHaveText("A node needs a name. Kept 'Alpha'.");
      await expect.poll(() => outlineText(page)).toEqual(['Kept name', 'Alpha']);
      expect(errors).toEqual([]);
      await page.close();
    });

    test('a toast stays clear of the zoom cluster, wide and narrow', async ({
      context,
      extensionId,
    }) => {
      const { page, errors } = await openMapPage(context, extensionId, 'Toast clearance');
      await buildEssay(page);
      await page.setViewportSize({ width: 1280, height: 800 });

      // A change outside the branch, made before narrowing the view to the branch: one Ctrl+Z is
      // then a step nobody can see, which is the longest sentence this page puts in a toast.
      await focusRow(page, 'Sources');
      await page.keyboard.press('F2');
      await page.keyboard.type(' and further reading');
      await page.keyboard.press('Control+Enter');
      await focusRow(page, 'Body');
      await page.keyboard.press('Alt+Shift+F');
      await expect.poll(() => outlineText(page)).toEqual(['Body', 'Argument 1', 'Argument 2']);

      const toast = page.locator('#assist-mm-toast');
      const zoom = page.locator('.mm-canvas__zoom');

      await page.locator('#assist-mm-canvas-host').click({ position: { x: 5, y: 5 } });
      await page.keyboard.press('Control+z');
      await expect(toast).toBeVisible();
      await expect(toast).toHaveText('Undone: a change outside this branch.');
      expect(clearOf(await toast.boundingBox(), await zoom.boundingBox())).toBe(true);

      // And again where the sentence has to wrap and the cluster is nearer to it.
      await page.setViewportSize({ width: 800, height: 700 });
      await page.keyboard.press('Control+Shift+z');
      await expect(toast).toBeVisible();
      await expect(toast).toHaveText('Redone: a change outside this branch.');
      expect(clearOf(await toast.boundingBox(), await zoom.boundingBox())).toBe(true);

      expect(errors).toEqual([]);
      await page.close();
    });

    test('a drop where the node already is says so and moves nothing', async ({
      context,
      extensionId,
    }) => {
      const { page, errors } = await openMapPage(context, extensionId, 'Already there');
      const ids = await buildBranches(page, ['First', 'Second', 'Third']);

      const first = await nodeBox(page, ids[1]);
      const second = await nodeBox(page, ids[2]);
      // From the middle of First to a few pixels inside Second's top edge — the "before" zone,
      // which is exactly where First already sits.
      await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
      await page.mouse.down();
      await page.mouse.move(second.x + second.width / 2, second.y + 3, { steps: 8 });
      await page.mouse.up();

      // Nothing changed, which is precisely why it has to be said.
      await expect(page.locator('#assist-mm-live')).toContainText("'First' is already there.");
      await expect
        .poll(() => outlineText(page))
        .toEqual(['Already there', 'First', 'Second', 'Third']);
      await expectOneTabStop(page);
      expect(errors).toEqual([]);
      await page.close();
    });

    test('the quick-add handles are still there on a whole map fitted to the view', async ({
      context,
      extensionId,
    }) => {
      // Seventeen nodes is seventeen names typed in; the build is the slow part, not the map.
      test.slow();
      const { page, errors } = await openMapPage(context, extensionId, 'Seventeen nodes');
      await buildBranches(
        page,
        Array.from({ length: 17 }, (unused, at) => `Topic ${at + 1}`)
      );

      await page.locator('#assist-mm-fit').click();
      await focusRow(page, 'Topic 9');

      // The column beside a node on a map this crowded is taken, and a handle nobody can see is
      // the same as no handle at all: they go on the node's own box instead.
      const child = page.getByRole('button', { name: "Add a child to 'Topic 9'" });
      const sibling = page.getByRole('button', { name: "Add a sibling after 'Topic 9'" });
      await expect(child).toBeVisible();
      await expect(sibling).toBeVisible();
      expect(await child.evaluate(element => element.hidden)).toBe(false);
      expect(await sibling.evaluate(element => element.hidden)).toBe(false);

      await child.click();
      await expect(page.locator('input.mm-canvas__editor')).toBeFocused();
      await page.keyboard.type('Sub topic');
      await page.keyboard.press('Control+Enter');

      await expect.poll(() => outlineText(page)).toContain('Sub topic');
      const rows = await outlineOf(page);
      const parent = rows.find(row => row.text === 'Topic 9');
      const made = rows.find(row => row.text === 'Sub topic');
      expect(made.level).toBe(parent.level + 1);
      expect(errors).toEqual([]);
      await page.close();
    });

    test('an undo of a colour leaves the radio group showing the map', async ({
      context,
      extensionId,
    }) => {
      const { page, errors } = await openMapPage(context, extensionId, 'Colour undo');
      await buildBranches(page, ['Alpha']);
      const inherit = inspector(page).getByRole('radio', { name: 'Inherit', exact: true });
      const teal = inspector(page).getByRole('radio', { name: 'Teal', exact: true });

      await focusRow(page, 'Alpha');
      await teal.focus();
      await page.keyboard.press(' ');
      await expect(teal).toBeChecked();
      await expect(teal).toBeFocused();

      // The keyboard reaches this group by choosing a colour, so an undo of that very choice
      // arrives with a radio focused — which is when the group used to stop being redrawn and go
      // on showing a colour the map no longer held.
      await page.keyboard.press('Control+z');
      await expect(inherit).toBeChecked();
      await expect(teal).not.toBeChecked();
      await expect(teal).toBeFocused();
      expect(errors).toEqual([]);
      await page.close();
    });
  });
});
