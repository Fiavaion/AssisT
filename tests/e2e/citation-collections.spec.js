/**
 * Collections in the citation library, driven the way a student uses them: made from the rail by
 * keyboard and by mouse, renamed, deleted with their sources safely returned, filled from a card and
 * from the selection bar, and used as a filter on their own and together with a search.
 *
 * Every step is checked twice: what the student sees on the page, and what the offscreen store
 * actually holds (read back through the same CITATION_DB_OP relay the extension uses).
 */

import { test, expect } from './extension-fixture.js';

const LIBRARY = id => `chrome-extension://${id}/src/pages/citation-library/library.html`;

function record(title, over = {}) {
  const now = Date.now();
  return {
    type: 'website',
    url: `https://example.org/${encodeURIComponent(title)}`,
    title,
    authors: ['Example, Eve'],
    publicationDate: '2024',
    accessDate: '2026-09-04',
    extra: {},
    tags: [],
    createdAt: now,
    updatedAt: now,
    projectId: null,
    ...over,
  };
}

/** One storage call through the extension's own relay. Throws on a refused call. */
async function dbOp(page, op, args = []) {
  const reply = await page.evaluate(
    ([o, a]) => chrome.runtime.sendMessage({ type: 'CITATION_DB_OP', op: o, args: a }),
    [op, args]
  );
  if (!reply || reply.ok !== true) {
    throw new Error(`${op} failed: ${reply && reply.error}`);
  }
  return reply.result;
}

async function openLibrary(context, extensionId) {
  const page = await context.newPage();
  await page.goto(LIBRARY(extensionId));
  await expect(page.getByRole('button', { name: /new collection/i })).toBeVisible({ timeout: 15000 });
  return page;
}

/**
 * Seed collections and citations, then reload so the page paints them from storage.
 * A citation's `collection` names the collection it is filed in.
 * @returns {Promise<{ projects: Record<string,string>, citations: Record<string,string> }>}
 */
async function seed(page, { collections = [], citations = [] }) {
  const projects = {};
  for (const name of collections) {
    projects[name] = await dbOp(page, 'CIT_PROJECT_CREATE', [name, '']);
  }
  const ids = {};
  let t = Date.now() - citations.length * 1000;
  for (const { title, collection, ...over } of citations) {
    t += 1000;
    ids[title] = await dbOp(page, 'CIT_ADD', [
      record(title, {
        createdAt: t,
        updatedAt: t,
        projectId: collection ? projects[collection] : null,
        ...over,
      }),
    ]);
  }
  await page.reload();
  await expect(page.getByRole('button', { name: /new collection/i })).toBeVisible({ timeout: 15000 });
  if (citations.length > 0) {
    await expect(cardHeading(page, citations[0].title)).toBeVisible({ timeout: 15000 });
  }
  return { projects, citations: ids };
}

/** Wait for every running animation to finish before touching anything inside it. */
async function settle(page) {
  await page.waitForFunction(() =>
    document.getAnimations().every(a => a.playState !== 'running')
  );
}

const rail = page => page.getByRole('navigation', { name: 'Collections and tags' });
const railRow = (page, text) => rail(page).getByRole('button', { name: text, exact: true });
const cardHeading = (page, title) => page.getByRole('heading', { name: title, exact: true });
const card = (page, title) =>
  page.locator('li.assist-cite-card').filter({ has: cardHeading(page, title) });
const tray = (page, text) => page.locator('.assist-action-tray').filter({ hasText: text });

async function storedProjects(page) {
  return dbOp(page, 'CIT_PROJECT_GET_ALL');
}

async function storedCitations(page) {
  return dbOp(page, 'CIT_GET_ALL', [{}]);
}

/** Where each live citation is filed, by title: the project id as text, or null. */
async function filing(page) {
  const all = await storedCitations(page);
  return Object.fromEntries(
    all.map(c => [c.title, c.projectId === null || c.projectId === undefined ? null : String(c.projectId)])
  );
}

test.describe('citation collections', () => {
  test('a collection made by keyboard: Enter opens, the name field has focus, Enter saves, focus returns to the opener', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const opener = rail(page).getByRole('button', { name: 'New collection', exact: true });

    // Escape first: backing out writes nothing and hands focus back.
    await opener.focus();
    await page.keyboard.press('Enter');
    let dialog = page.getByRole('dialog', { name: 'New collection' });
    await expect(dialog).toBeVisible();
    await settle(page);
    await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused();
    await page.keyboard.type('Should not exist');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    expect(await storedProjects(page)).toHaveLength(0);

    await page.keyboard.press('Enter');
    dialog = page.getByRole('dialog', { name: 'New collection' });
    await expect(dialog).toBeVisible();
    await settle(page);
    const name = dialog.getByLabel('Name', { exact: true });
    await expect(name).toBeFocused();
    await expect(name).toHaveValue('');
    await page.keyboard.type('History essay');
    await page.keyboard.press('Enter');

    await expect(dialog).toBeHidden();
    await expect(railRow(page, 'History essay (0)')).toBeVisible();
    await expect(tray(page, 'Created “History essay”')).toBeVisible();
    await expect(opener).toBeFocused();

    const projects = await storedProjects(page);
    expect(projects.map(p => p.name)).toEqual(['History essay']);
    await page.close();
  });

  test('a collection made by mouse appears in the rail and in every card picker', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await seed(page, { citations: [{ title: 'Unfiled source' }] });

    await rail(page).getByRole('button', { name: 'New collection', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New collection' });
    await expect(dialog).toBeVisible();
    await settle(page);
    await dialog.getByLabel('Name', { exact: true }).fill('Lab report');
    await dialog.getByLabel('Description (optional)', { exact: true }).fill('Week 6 practical');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(dialog).toBeHidden();
    await expect(railRow(page, 'Lab report (0)')).toBeVisible();
    await expect(railRow(page, 'All citations (1)')).toBeVisible();
    // A new collection is immediately somewhere a source can be filed.
    const picker = card(page, 'Unfiled source').getByRole('combobox', { name: /^Collection for/ });
    await expect(picker.locator('option', { hasText: 'Lab report' })).toHaveCount(1);

    const [project] = await storedProjects(page);
    expect(project).toMatchObject({ name: 'Lab report', description: 'Week 6 practical' });
    await page.close();
  });

  test('closing a mouse-opened collection dialog leaves focus on a control, not the page body', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await rail(page).getByRole('button', { name: 'New collection', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New collection' });
    await expect(dialog).toBeVisible();
    await settle(page);
    await dialog.getByLabel('Name', { exact: true }).fill('Seminar');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(railRow(page, 'Seminar (0)')).toBeVisible();

    // Not merely "not the body": back on the button that opened the dialog.
    await expect(
      rail(page).getByRole('button', { name: 'New collection', exact: true })
    ).toBeFocused();
    await page.close();
  });

  test('an empty or blank name is refused with an announced error tied to the Name field', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await rail(page).getByRole('button', { name: 'New collection', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New collection' });
    await expect(dialog).toBeVisible();
    await settle(page);
    const name = dialog.getByLabel('Name', { exact: true });

    for (const typed of ['', '   ']) {
      await name.fill(typed);
      await dialog.getByRole('button', { name: 'Create', exact: true }).click();

      const alert = dialog.getByRole('alert');
      await expect(alert).toHaveText('Please give the collection a name before saving it.');
      await expect(dialog).toBeVisible();
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      // The error is programmatically the Name field's own, not a floating message.
      const errorId = await alert.getAttribute('id');
      await expect(name).toHaveAttribute('aria-errormessage', errorId);
      await expect(name).toBeFocused();
    }

    // Typing starts the fix: the error goes, and the field is no longer marked invalid.
    await name.pressSequentially('R');
    await expect(dialog.getByRole('alert')).toBeHidden();
    await expect(name).not.toHaveAttribute('aria-invalid', 'true');

    expect(await storedProjects(page)).toHaveLength(0);
    await page.close();
  });

  test('rename by keyboard: the name is prefilled, the new name shows and is stored, focus returns to the row', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const { projects } = await seed(page, {
      collections: ['Essay', 'Lab report'],
      citations: [{ title: 'Filed in lab', collection: 'Lab report' }],
    });

    await rail(page).getByRole('button', { name: 'Rename collection Lab report', exact: true }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Rename collection' });
    await expect(dialog).toBeVisible();
    await settle(page);
    const name = dialog.getByLabel('Name', { exact: true });
    await expect(name).toBeFocused();
    await expect(name).toHaveValue('Lab report');
    await name.fill('Lab report final');
    await dialog.getByRole('button', { name: 'Save', exact: true }).press('Enter');

    await expect(dialog).toBeHidden();
    await expect(railRow(page, 'Lab report final (1)')).toBeVisible();
    await expect(railRow(page, 'Lab report (1)')).toHaveCount(0);
    await expect(tray(page, 'Renamed to “Lab report final”')).toBeVisible();
    await expect(
      rail(page).getByRole('button', { name: 'Rename collection Lab report final', exact: true })
    ).toBeFocused();

    const stored = await storedProjects(page);
    expect(stored.find(p => String(p.id) === projects['Lab report']).name).toBe('Lab report final');
    // Renaming moved nothing: the source is still filed where it was.
    expect((await filing(page))['Filed in lab']).toBe(projects['Lab report']);

    // A collection may be renamed to its own name in a different case; that is not a duplicate.
    await rail(page).getByRole('button', { name: 'Rename collection Essay', exact: true }).focus();
    await page.keyboard.press('Enter');
    const again = page.getByRole('dialog', { name: 'Rename collection' });
    await expect(again).toBeVisible();
    await settle(page);
    await again.getByLabel('Name', { exact: true }).fill('ESSAY');
    await page.keyboard.press('Enter');
    await expect(again).toBeHidden();
    await expect(railRow(page, 'ESSAY (0)')).toBeVisible();
    await page.close();
  });

  test('rename refuses a name another collection already has, in any case, with a field-level error', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await seed(page, { collections: ['Essay', 'Lab report'] });

    for (const clash of ['Essay', 'essay']) {
      await rail(page).getByRole('button', { name: 'Rename collection Lab report', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Rename collection' });
      await expect(dialog).toBeVisible();
      await settle(page);
      const name = dialog.getByLabel('Name', { exact: true });
      await name.fill(clash);
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();

      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('alert')).toContainText(/already/i);
      await expect(name).toHaveAttribute('aria-invalid', 'true');
      await expect(name).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
    }

    const names = (await storedProjects(page)).map(p => p.name).sort();
    expect(names).toEqual(['Essay', 'Lab report']);
    await page.close();
  });

  test('a new collection cannot take a name another collection already has, in any case', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await seed(page, { collections: ['Essay'] });

    await rail(page).getByRole('button', { name: 'New collection', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New collection' });
    await expect(dialog).toBeVisible();
    await settle(page);
    const name = dialog.getByLabel('Name', { exact: true });
    await name.fill('ESSAY');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText(/already/i);
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(await storedProjects(page)).toHaveLength(1);
    await page.close();
  });

  test('deleting the collection being viewed keeps every source, says how many came back, and Undo refiles them', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const { projects } = await seed(page, {
      collections: ['Essay', 'Other'],
      citations: [
        { title: 'Essay source one', collection: 'Essay' },
        { title: 'Essay source two', collection: 'Essay' },
        { title: 'Loose source' },
      ],
    });
    const nativeDialogs = [];
    page.on('dialog', d => {
      nativeDialogs.push(d.message());
      d.dismiss();
    });

    await railRow(page, 'Essay (2)').click();
    await expect(cardHeading(page, 'Loose source')).toHaveCount(0);

    await rail(page).getByRole('button', { name: 'Delete collection Essay', exact: true }).click();

    // Undo, not a confirm, is the safety net here.
    expect(nativeDialogs).toEqual([]);
    await expect(
      tray(page, /Deleted “Essay”\. 2 citations moved back to your library\./)
    ).toBeVisible();
    await expect(railRow(page, 'Essay (2)')).toHaveCount(0);
    await expect(railRow(page, 'Essay (0)')).toHaveCount(0);
    // The filter that pointed at the deleted collection falls back to everything.
    await expect(railRow(page, 'All citations (3)')).toHaveAttribute('aria-current', 'true');
    for (const title of ['Essay source one', 'Essay source two', 'Loose source']) {
      await expect(cardHeading(page, title)).toBeVisible();
    }
    await expect(rail(page).getByRole('button', { name: /recently removed \(0\)/i })).toBeVisible();

    const afterDelete = await filing(page);
    expect(afterDelete).toEqual({
      'Essay source one': null,
      'Essay source two': null,
      'Loose source': null,
    });
    expect((await storedProjects(page)).map(p => p.name)).toEqual(['Other']);
    expect(await dbOp(page, 'CIT_GET_TRASHED')).toHaveLength(0);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(tray(page, '“Essay” is back, with everything that was in it.')).toBeVisible();
    await expect(railRow(page, 'Essay (2)')).toBeVisible();

    const restored = (await storedProjects(page)).find(p => p.name === 'Essay');
    expect(restored).toBeTruthy();
    expect(String(restored.id)).not.toBe(projects.Essay);
    expect(await filing(page)).toEqual({
      'Essay source one': String(restored.id),
      'Essay source two': String(restored.id),
      'Loose source': null,
    });
    await page.close();
  });

  test('deleting a collection by keyboard leaves focus in the rail, not on the page body', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await seed(page, { collections: ['Essay', 'Other'] });

    await rail(page).getByRole('button', { name: 'Delete collection Essay', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(railRow(page, 'Essay (0)')).toHaveCount(0);
    await expect(tray(page, 'Deleted “Essay”.')).toBeVisible();

    const focus = await page.evaluate(() => {
      const el = document.activeElement;
      return { tag: el && el.tagName, inRail: !!(el && el.closest('nav.assist-lib-sidebar')) };
    });
    expect(focus.tag).not.toBe('BODY');
    expect(focus.inRail).toBe(true);
    await page.close();
  });

  test('filing from a card moves the source and the rail counts follow every step', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const { projects } = await seed(page, {
      collections: ['Essay', 'Lab report'],
      citations: [{ title: 'Alpha source' }, { title: 'Beta source' }],
    });
    await expect(railRow(page, 'Essay (0)')).toBeVisible();

    const picker = card(page, 'Alpha source').getByRole('combobox', { name: /^Collection for/ });
    await expect(picker).toHaveAttribute('aria-label', 'Collection for “Alpha source”');
    await expect(picker).toHaveValue('');

    await picker.selectOption({ label: 'Essay' });
    await expect(tray(page, 'Filed in “Essay”')).toBeVisible();
    await expect(railRow(page, 'Essay (1)')).toBeVisible();
    await expect(railRow(page, 'Lab report (0)')).toBeVisible();
    await expect(railRow(page, 'All citations (2)')).toBeVisible();
    await expect(picker).toHaveValue(projects.Essay);
    expect((await filing(page))['Alpha source']).toBe(projects.Essay);

    await picker.selectOption({ label: 'Lab report' });
    await expect(tray(page, 'Filed in “Lab report”')).toBeVisible();
    await expect(railRow(page, 'Essay (0)')).toBeVisible();
    await expect(railRow(page, 'Lab report (1)')).toBeVisible();
    expect((await filing(page))['Alpha source']).toBe(projects['Lab report']);

    await picker.selectOption({ label: 'No collection' });
    await expect(tray(page, 'Moved back to your library.')).toBeVisible();
    await expect(railRow(page, 'Lab report (0)')).toBeVisible();
    expect((await filing(page))['Alpha source']).toBeNull();

    // The filing survives a reload: it was stored, not just painted.
    await picker.selectOption({ label: 'Essay' });
    await expect(railRow(page, 'Essay (1)')).toBeVisible();
    await page.reload();
    await expect(railRow(page, 'Essay (1)')).toBeVisible({ timeout: 15000 });
    await expect(
      card(page, 'Alpha source').getByRole('combobox', { name: /^Collection for/ })
    ).toHaveValue(projects.Essay);
    await page.close();
  });

  test('filing a selection from the selection bar files every ticked source in one go', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const { projects } = await seed(page, {
      collections: ['Essay', 'Lab report'],
      citations: [
        { title: 'Alpha source' },
        { title: 'Beta source' },
        { title: 'Gamma source', collection: 'Essay' },
      ],
    });
    await expect(railRow(page, 'Essay (1)')).toBeVisible();

    await page.getByRole('checkbox', { name: 'Select Alpha source', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Select Gamma source', exact: true }).check();
    const bar = page.getByRole('toolbar', { name: 'Actions for the citations you have selected' });
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('2 selected');

    await bar.getByRole('combobox', { name: 'File into collection' }).selectOption({ label: 'Lab report' });

    await expect(tray(page, 'Filed 2 citations in “Lab report”')).toBeVisible();
    await expect(bar).toBeHidden();
    await expect(railRow(page, 'Lab report (2)')).toBeVisible();
    await expect(railRow(page, 'Essay (0)')).toBeVisible();
    await expect(railRow(page, 'All citations (3)')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select Alpha source', exact: true })).not.toBeChecked();

    expect(await filing(page)).toEqual({
      'Alpha source': projects['Lab report'],
      'Beta source': null,
      'Gamma source': projects['Lab report'],
    });
    await page.close();
  });

  test('filtering by collection shows only its sources, marks the row current, and All citations clears it', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await seed(page, {
      collections: ['Essay', 'Lab report'],
      citations: [
        { title: 'Essay source', collection: 'Essay' },
        { title: 'Lab source', collection: 'Lab report' },
        { title: 'Loose source' },
      ],
    });

    const all = railRow(page, 'All citations (3)');
    const essay = railRow(page, 'Essay (1)');
    await expect(all).toHaveAttribute('aria-current', 'true');
    await expect(essay).not.toHaveAttribute('aria-current');

    await essay.focus();
    await page.keyboard.press('Enter');
    await expect(cardHeading(page, 'Essay source')).toBeVisible();
    await expect(cardHeading(page, 'Lab source')).toHaveCount(0);
    await expect(cardHeading(page, 'Loose source')).toHaveCount(0);
    await expect(essay).toHaveAttribute('aria-current', 'true');
    await expect(all).not.toHaveAttribute('aria-current');
    await expect(page.locator('[aria-current="true"]')).toHaveCount(1);
    await expect(rail(page).getByRole('status')).toHaveText('Filtered to Essay. Showing 1 of 3 citations.');
    // The rail re-renders on every filter; the student's place in it must survive that.
    await expect(essay).toBeFocused();

    await railRow(page, 'Lab report (1)').click();
    await expect(cardHeading(page, 'Lab source')).toBeVisible();
    await expect(cardHeading(page, 'Essay source')).toHaveCount(0);
    await expect(railRow(page, 'Lab report (1)')).toHaveAttribute('aria-current', 'true');
    await expect(essay).not.toHaveAttribute('aria-current');

    await all.click();
    for (const title of ['Essay source', 'Lab source', 'Loose source']) {
      await expect(cardHeading(page, title)).toBeVisible();
    }
    await expect(all).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('[aria-current="true"]')).toHaveCount(1);
    await expect(rail(page).getByRole('status')).toHaveText('Showing all 3 citations.');
    await page.close();
  });

  test('a collection filter and a search narrow together, and All citations clears both', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await seed(page, {
      collections: ['Essay'],
      citations: [
        { title: 'Working memory and learning', collection: 'Essay' },
        { title: 'Sleep and attention', collection: 'Essay' },
        { title: 'Memory palace techniques' },
      ],
    });

    await railRow(page, 'Essay (2)').click();
    const search = page.getByRole('searchbox', { name: 'Search your citations' });
    await search.fill('memory');

    await expect(cardHeading(page, 'Working memory and learning')).toBeVisible();
    await expect(cardHeading(page, 'Sleep and attention')).toHaveCount(0);
    // Matches the search, but is not in the collection being viewed.
    await expect(cardHeading(page, 'Memory palace techniques')).toHaveCount(0);
    await expect(railRow(page, 'Essay (2)')).toHaveAttribute('aria-current', 'true');

    await railRow(page, 'All citations (3)').click();
    await expect(search).toHaveValue('');
    for (const title of ['Working memory and learning', 'Sleep and attention', 'Memory palace techniques']) {
      await expect(cardHeading(page, title)).toBeVisible();
    }
    await expect(railRow(page, 'All citations (3)')).toHaveAttribute('aria-current', 'true');
    await page.close();
  });
});
