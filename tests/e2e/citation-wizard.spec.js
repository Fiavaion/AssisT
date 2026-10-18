/**
 * The citation wizard, from the library's "New citation" and "Add by DOI", in real Chrome against
 * the built extension: every step by keyboard alone, a save refused for want of a title, the Check
 * step's reassurance verdict following the fields, tags becoming sidebar chips, a quote and locator
 * making "Copy quote + citation", and a DOI lookup opening the wizard with Crossref's fields locked.
 *
 * Crossref is always answered from a fixture (tests/e2e/fixtures/citation-harness.js), and the DOI
 * is under Crossref's test prefix, so a lookup that escaped the route could not produce the record
 * these tests expect.
 */

import { test, expect } from './extension-fixture.js';
import {
  SOURCE,
  TEST_DOI,
  routeCrossref,
  allCitations,
  rpc,
  record,
  setConsent,
  lastClip,
  settle,
  tabTo,
  CLIPBOARD_TAP,
} from './fixtures/citation-harness.js';
import { consentPanelTitle, clickConsentButton } from './fixtures/consent-panel.js';

const LIBRARY = id => `chrome-extension://${id}/src/pages/citation-library/library.html`;

const WORK = Object.freeze({
  title: 'The magical number seven, plus or minus two',
  author: 'Miller, George A.',
  year: '1956',
  url: 'https://doi.org/10.1037/h0043158',
  quote: 'The span of absolute judgment is somewhat limited',
  locator: '81',
});

async function openLibrary(context, extensionId) {
  const page = await context.newPage();
  await page.addInitScript(CLIPBOARD_TAP);
  await page.goto(LIBRARY(extensionId));
  await expect(page.getByRole('button', { name: /new collection/i })).toBeVisible({
    timeout: 15000,
  });
  return page;
}

/** Open the wizard from "New citation" with the mouse, and let it finish opening. */
async function newCitation(page) {
  await page.getByRole('button', { name: 'New citation', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a citation' });
  await expect(dialog).toBeVisible();
  await settle(page);
  return dialog;
}

const button = (dialog, name) => dialog.getByRole('button', { name, exact: true });

/** The rail says which step this is, and focus sits on the step's question. */
async function expectStep(page, dialog, rail, question) {
  await expect(
    dialog.getByRole('navigation', { name: 'Citation steps' }).locator('[aria-current="step"]')
  ).toContainText(rail);
  await expect(page.locator(':focus')).toHaveText(question);
}

/** Press Next `times` times with the mouse. */
async function next(dialog, times = 1) {
  for (let i = 0; i < times; i++) {
    await button(dialog, 'Next').click();
  }
}

async function back(dialog, times = 1) {
  for (let i = 0; i < times; i++) {
    await button(dialog, 'Back').click();
  }
}

/** A card in the library, found by its heading (the title also appears in the reference). */
const card = (page, title) =>
  page.locator('li.assist-cite-card', {
    has: page.getByRole('heading', { name: title, exact: true }),
  });

// Crossref's host is an optional permission that comes with the consent (ADR 0009). These tests
// grant the consent in storage, so the build under test also holds the host, as it would after a
// student allowed Crossref; asking for both is covered by third-party-consent.spec.js.
test.use({ grantedHosts: ['https://api.crossref.org/*'] });

test.beforeEach(() => {
  test.setTimeout(120000);
});

test.describe('the citation wizard', () => {
  // Fails if: any field or button is unreachable by Tab, Enter does not activate Next/Back/Save,
  // focus does not move to each step's question, Back loses what was typed, or the saved record
  // differs from what was entered.
  test('every step can be completed with the keyboard alone', async ({ context, extensionId }) => {
    const page = await openLibrary(context, extensionId);

    await page.getByRole('button', { name: 'New citation', exact: true }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Add a citation' });
    await expect(dialog).toBeVisible();
    await settle(page);
    const pressNext = async () => {
      await tabTo(page, button(dialog, 'Next'));
      await page.keyboard.press('Enter');
    };

    await tabTo(page, dialog.getByLabel('Title (required)'));
    await page.keyboard.type(WORK.title);
    await pressNext();

    await expectStep(page, dialog, 'Who', 'Who is behind it?');
    await tabTo(page, dialog.getByLabel('Author(s)'));
    await page.keyboard.type(WORK.author);
    await pressNext();

    await expectStep(page, dialog, 'When', 'When was it published?');
    await tabTo(page, dialog.getByLabel('Year published'));
    await page.keyboard.type(WORK.year);
    await pressNext();

    await expectStep(page, dialog, 'Where', 'Where can it be found?');
    await tabTo(page, dialog.getByLabel('Link (URL)'));
    await page.keyboard.type(WORK.url);

    // Back keeps what was typed.
    await tabTo(page, button(dialog, 'Back'));
    await page.keyboard.press('Enter');
    await expectStep(page, dialog, 'When', 'When was it published?');
    await expect(dialog.getByLabel('Year published')).toHaveValue(WORK.year);
    await pressNext();
    await expect(dialog.getByLabel('Link (URL)')).toHaveValue(WORK.url);
    await pressNext();

    await expectStep(page, dialog, 'Notes', 'What did it say?');
    await tabTo(page, dialog.getByLabel(/exact words/));
    await page.keyboard.type(WORK.quote);
    await tabTo(page, dialog.getByLabel('Page or spot'));
    await page.keyboard.type(WORK.locator);
    await tabTo(page, dialog.getByLabel('Tags', { exact: true }));
    await page.keyboard.type('memory, attention');
    await pressNext();

    await expectStep(page, dialog, 'Check', 'Is this right?');
    await expect(dialog.locator('.assist-cite-reassure')).toContainText('This looks right');
    await expect(button(dialog, 'Next')).toHaveCount(0);

    await tabTo(page, button(dialog, 'Save'));
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    await expect(card(page, WORK.title)).toBeVisible({ timeout: 10000 });
    // The student lands on the source they just saved, not at the top of the page.
    await expect
      .poll(() => card(page, WORK.title).evaluate(el => el.contains(document.activeElement)), {
        timeout: 5000,
      })
      .toBe(true);

    const stored = await allCitations(page);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      title: WORK.title,
      url: WORK.url,
      quote: WORK.quote,
      locator: WORK.locator,
      tags: ['memory', 'attention'],
    });
    expect(stored[0].authors).toHaveLength(1);
    expect(stored[0].authors[0]).toMatch(/^Miller, George/);
    expect(String(stored[0].publicationDate)).toMatch(new RegExp(`^${WORK.year}`));
  });

  // Fails if: a source with no title is stored, the dialog closes, the refusal is not in an
  // alert, the message does not name the title, or the field is not marked invalid and focused.
  test('saving without a title is refused with an announced error naming the field', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const dialog = await newCitation(page);

    await button(dialog, 'Save').click();

    await expect(dialog.getByRole('alert').filter({ hasText: 'Not saved yet' })).toBeVisible();
    await expect(dialog.getByRole('alert').filter({ hasText: /title/i })).toBeVisible();
    const title = dialog.getByLabel('Title (required)');
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await expect(title).toBeFocused();
    await expect(title).toHaveAccessibleDescription(/title/i);
    await expect(dialog).toBeVisible();
    expect(await allCitations(page)).toHaveLength(0);

    // Fixing it clears the error and the save goes through.
    await title.fill('A titled source');
    await expect(title).not.toHaveAttribute('aria-invalid', 'true');
    await button(dialog, 'Save').click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });
    expect((await allCitations(page)).map(c => c.title)).toEqual(['A titled source']);
  });

  // Fails if: the verdict does not change as fields are filled or emptied, or the words and the
  // level class disagree.
  test('the Check step reassurance follows the fields as they are filled and emptied', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    const dialog = await newCitation(page);
    const chip = dialog.locator('.assist-cite-reassure');

    await dialog.getByLabel('Title (required)').fill('Working memory');
    await next(dialog, 5);
    await expect(chip).toHaveClass(/assist-cite-reassure--amber/);
    await expect(chip).toContainText('Worth a check');
    await expect(chip).toContainText('No author listed');

    // "Fix the author" goes to the step that fixes it.
    await chip.getByRole('button', { name: 'Fix the author' }).click();
    await expectStep(page, dialog, 'Who', 'Who is behind it?');
    await dialog.getByLabel('Author(s)').fill('Baddeley, Alan');
    await next(dialog);
    await dialog.getByLabel('Year published').fill('2000');
    await next(dialog);
    await dialog.getByLabel('Link (URL)').fill('https://example.org/working-memory');
    await next(dialog, 2);
    await expect(chip).toHaveClass(/assist-cite-reassure--green/);
    await expect(chip).toContainText('This looks right');

    // Emptied: the year goes, and the verdict says so.
    await back(dialog, 3);
    await dialog.getByLabel('Year published').fill('');
    await next(dialog, 3);
    await expect(chip).toHaveClass(/assist-cite-reassure--amber/);
    await expect(chip).toContainText('No publication year');

    // Wrong: a year in the future is a red flag.
    await back(dialog, 3);
    await dialog.getByLabel('Year published').fill('3100');
    await next(dialog, 3);
    await expect(chip).toHaveClass(/assist-cite-reassure--red/);
    await expect(chip).toContainText("Let's fix this");
  });

  // Fails if: tags typed on Notes are not stored, no sidebar chip appears for them, or a chip does
  // not filter the library to the tagged source.
  test('tags entered on the Notes step appear as sidebar chips that filter the library', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await rpc(page, 'CIT_ADD', [record()]);
    await page.reload();
    await expect(card(page, 'Array programming with NumPy')).toBeVisible({ timeout: 15000 });

    const dialog = await newCitation(page);
    await dialog.getByLabel('Title (required)').fill('A tagged source');
    await next(dialog, 4);
    await dialog.getByLabel('Tags', { exact: true }).fill('memory, reading');
    await button(dialog, 'Save').click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    // A chip is named by its tag, inside the list the Tags heading labels.
    const tags = page.getByRole('list', { name: 'Tags' });
    await expect(tags.getByRole('button', { name: 'memory', exact: true })).toBeVisible();
    await expect(tags.getByRole('button', { name: 'reading', exact: true })).toBeVisible();

    await tags.getByRole('button', { name: 'memory', exact: true }).click();
    await expect(card(page, 'A tagged source')).toBeVisible();
    await expect(card(page, 'Array programming with NumPy')).toHaveCount(0);
  });

  // Fails if: the button is missing when there is a quote, present when there is not, or the copy
  // lacks the quote marks, the in-text citation or the page.
  test('a quote and a locator make "Copy quote + citation" appear and copy the expected text', async ({
    context,
    extensionId,
  }) => {
    const page = await openLibrary(context, extensionId);
    await rpc(page, 'CIT_ADD', [record()]);
    await page.reload();
    await expect(card(page, 'Array programming with NumPy')).toBeVisible({ timeout: 15000 });

    const dialog = await newCitation(page);
    await dialog.getByLabel('Title (required)').fill(WORK.title);
    await next(dialog);
    await dialog.getByLabel('Author(s)').fill(WORK.author);
    await next(dialog);
    await dialog.getByLabel('Year published').fill(WORK.year);
    await next(dialog, 2);
    await dialog.getByLabel(/exact words/).fill(WORK.quote);
    await dialog.getByLabel('Page or spot').fill(WORK.locator);
    await button(dialog, 'Save').click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });

    const quoted = card(page, WORK.title);
    await expect(quoted).toBeVisible();
    await settle(page);
    await expect(
      card(page, 'Array programming with NumPy').getByRole('button', {
        name: 'Copy quote + citation',
      })
    ).toHaveCount(0);

    await quoted.getByRole('button', { name: 'Copy quote + citation' }).click();
    await expect
      .poll(async () => (await lastClip(page))?.['text/plain'])
      .toBe(`“${WORK.quote}” (Miller, ${WORK.year}, p. ${WORK.locator})`);

    await quoted.getByRole('button', { name: 'Copy in-text' }).click();
    await expect
      .poll(async () => (await lastClip(page))?.['text/plain'])
      .toBe(`(Miller, ${WORK.year}, p. ${WORK.locator})`);
  });
});

test.describe('Add by DOI', () => {
  // Fails if: the lookup does not reach Crossref (the route records it), the wizard does not open
  // prefilled from Crossref, the verified fields are editable while locked, the badge does not
  // unlock them, or the saved record lacks the DOI.
  test('a DOI with consent opens the wizard prefilled, with Crossref fields locked', async ({
    context,
    extensionId,
  }) => {
    const hits = await routeCrossref(context);
    const page = await openLibrary(context, extensionId);
    await setConsent(page, 'citations', true);

    await page.getByLabel('Add a source by DOI or DOI link').fill(`https://doi.org/${TEST_DOI}`);
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Add a citation' });
    await expect(dialog).toBeVisible({ timeout: 15000 });
    await settle(page);
    expect(hits).toContain(TEST_DOI);

    const title = dialog.getByLabel('Title (required)');
    await expect(title).toHaveValue(SOURCE.title);
    await expect(title).not.toBeEditable();
    const badge = dialog.getByRole('button', { name: /Verified and locked/ });
    await expect(badge).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByText(/came back verified against CrossRef/)).toBeVisible();

    await badge.click();
    await expect(title).toBeEditable();
    await expect(dialog.getByRole('button', { name: /Verified but unlocked/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    await button(dialog, 'Save').click();
    await expect(dialog).toHaveCount(0, { timeout: 10000 });
    await expect(card(page, SOURCE.title)).toBeVisible();
    const stored = await allCitations(page);
    expect(stored).toHaveLength(1);
    expect(stored[0].doi).toBe(TEST_DOI);
    expect(stored[0].authors.join(' | ')).toMatch(/Snell/);
  });

  // ADR 0006: a DOI is sent to Crossref only with the student's consent. Fails if: the lookup goes
  // out without asking, the question does not name Crossref, or "Not now" still sends the DOI or
  // opens a prefilled wizard.
  test('without consent the student is asked first and "Not now" sends nothing', async ({
    context,
    extensionId,
  }) => {
    const hits = await routeCrossref(context);
    const page = await openLibrary(context, extensionId);

    await page.getByLabel('Add a source by DOI or DOI link').fill(TEST_DOI);
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // The question is in a closed shadow root, which locators cannot reach (fixtures/consent-panel.js).
    await expect.poll(() => consentPanelTitle(page), { timeout: 10000 }).toBe('Use Crossref?');
    expect(hits).toEqual([]);

    await clickConsentButton(page, 'Not now');
    await expect.poll(() => consentPanelTitle(page)).toBeNull();
    await page.waitForTimeout(1000);
    expect(hits).toEqual([]);
    await expect(page.getByRole('dialog', { name: 'Add a citation' })).toHaveCount(0);
  });

  // Fails if: text that is not a DOI is looked up, a wizard opens, or no announced error explains it.
  test('an invalid DOI shows its error and looks nothing up', async ({ context, extensionId }) => {
    const hits = await routeCrossref(context);
    const page = await openLibrary(context, extensionId);
    await setConsent(page, 'citations', true);

    await page.getByLabel('Add a source by DOI or DOI link').fill('not a doi at all');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.getByRole('alert').filter({ hasText: /look like a DOI/ })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: /10\.1000\/xyz123/ })).toBeVisible();
    await page.waitForTimeout(500);
    expect(hits).toEqual([]);
    await expect(page.getByRole('dialog', { name: 'Add a citation' })).toHaveCount(0);
  });
});
