/**
 * E2E tests for Dyslexia Mode, in real Chrome against the built extension.
 *
 * This file used to carry two popup checks plus six skipped `describe` blocks whose eleven test
 * bodies were empty braces — "should apply alternating color backgrounds" asserted only that a
 * radio button could be clicked, and "should transform page in under 300ms" timed nothing at all.
 * Those blocks are gone, and so is the copy of them in tests/e2e-full-suite-backup: restoring it
 * would have bought confidence in eleven tests that could not fail.
 *
 * What the transforms actually put on the page is now proven in jsdom, where it belongs, by
 * tests/unit/dyslexia/syllable-and-grammar-transforms.test.js — span structure, tint alternation,
 * the two grammar cues, and the light/dark palette choice. The shipped colours are graded for
 * contrast in tests/unit/dyslexia/syllable-contrast.test.js, and the host page's survival in
 * tests/unit/dyslexia/restore-host-nodes.test.js.
 *
 * What is left here is what only a browser can answer: whether the transform reaches a real
 * article at all through the manifest's content-script injection, whether Chrome paints the
 * underline the grammar set asks for (jsdom reports the inline style, not the computed one), and
 * whether switching variants leaves the previous one's spans behind on a live page.
 *
 * Technique: a fixture article served at an instructure.com URL so the manifest injects the
 * content script, as in tests/e2e/annotations.spec.js and tests/e2e/reading-mode.test.js.
 */

import { test, expect, openReadyPopup } from './extension-fixture.js';

const LMS_ORIGIN = 'https://dyslexia-spec.instructure.com';
const PAGE_URL = `${LMS_ORIGIN}/courses/1/pages/decoding`;

/** Enough real prose for the transforms to have multi-syllable words and taggable parts of speech. */
const ARTICLE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Decoding and fluency - Canvas</title></head>
<body style="background: #ffffff; color: #202020">
<h1 id="heading">Decoding and fluency</h1>
<p id="para1">Readers remember the alphabet before they remember the sounds, and the distance
between those two kinds of memory decides how quickly a beginner becomes fluent. Instruction that
shortens that distance reliably raises comprehension.</p>
<p id="para2">The lazy assumption is that fluency arrives on its own. It does not: a reader who
decodes slowly rehearses the beginning of a sentence while the end arrives, and loses both.</p>
</body></html>`;

/** Serve the fixture for the whole LMS origin, so the manifest's instructure.com match injects. */
async function routeLms(context) {
  await context.route(`${LMS_ORIGIN}/**`, route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: ARTICLE_HTML })
  );
}

/**
 * Write the dyslexia settings the way the popup does, from an extension page — the only realm
 * with chrome.storage. The content script reads `assist_settings` on load, so this runs before
 * the fixture page is opened.
 *
 * @param {import('@playwright/test').BrowserContext} context - The extension context.
 * @param {string} extensionId - The loaded extension's id.
 * @param {'bionic'|'syllable'|'grammar'|null} variant - The variant to select, or null for off.
 */
async function setVariant(context, extensionId, variant) {
  const page = await openReadyPopup(context, extensionId);
  await page.evaluate(
    variant =>
      new Promise(resolve => {
        chrome.storage.local.get('assist_settings', stored => {
          const settings = stored.assist_settings || {};
          settings.dyslexiaMode = {
            ...settings.dyslexiaMode,
            enabled: variant !== null,
            bionicReading: variant === 'bionic',
            syllableHighlighting: variant === 'syllable',
            grammarColors: variant === 'grammar',
          };
          chrome.storage.local.set({ assist_settings: settings }, () => resolve());
        });
      }),
    variant
  );
  await page.close();
}

/** Open the fixture with the variant already saved, and wait for the transform to land. */
async function openWith(context, extensionId, variant, styledSelector) {
  await setVariant(context, extensionId, variant);
  const page = await context.newPage();
  await routeLms(context);
  await page.goto(PAGE_URL);
  await page.waitForSelector(styledSelector, { timeout: 15000 });
  return page;
}

test.describe('Dyslexia Mode - the popup controls', () => {
  test('the switch and all three variants are present and mutually exclusive', async ({
    popupPage,
  }) => {
    await popupPage.waitForLoadState('domcontentloaded');

    // Flat is the popup's face. Its switch and radios drive the hidden accordion controls of the
    // same ids, whose handlers do the work, so both are checked.
    const toggle = popupPage.locator('#flat-dyslexia-mode');
    await toggle.setChecked(true, { force: true });
    await expect(popupPage.locator('#dyslexia-mode-enabled')).toBeChecked();

    const flatRadio = id => popupPage.locator(`#flat-${id}`);
    for (const id of ['dyslexia-bionic', 'dyslexia-syllable', 'dyslexia-grammar']) {
      await flatRadio(id).scrollIntoViewIfNeeded();
      await expect(flatRadio(id)).toBeVisible();
    }

    await flatRadio('dyslexia-syllable').check({ force: true });
    await expect(popupPage.locator('#dyslexia-syllable')).toBeChecked();
    expect(await popupPage.locator('#dyslexia-bionic').isChecked()).toBe(false);
    expect(await popupPage.locator('#dyslexia-grammar').isChecked()).toBe(false);

    await flatRadio('dyslexia-grammar').check({ force: true });
    await expect(popupPage.locator('#dyslexia-grammar')).toBeChecked();
    expect(await popupPage.locator('#dyslexia-syllable').isChecked()).toBe(false);
  });

  test('every variant radio has a label a screen reader can read', async ({ popupPage }) => {
    await popupPage.waitForLoadState('domcontentloaded');

    // The radios a student meets are Flat's, drawn under the support once it is switched on.
    await popupPage.locator('#flat-dyslexia-mode').setChecked(true, { force: true });
    await expect(popupPage.locator('#flat-dyslexia-bionic')).toBeAttached();
    for (const id of ['flat-dyslexia-bionic', 'flat-dyslexia-syllable', 'flat-dyslexia-grammar']) {
      const named = await popupPage.evaluate(id => {
        const input = document.getElementById(id);
        // input.labels covers both a wrapping <label> and label[for], which is how the browser
        // itself names the control.
        const label = input?.labels?.[0];
        return {
          exists: Boolean(input),
          text: (label?.textContent || input?.getAttribute('aria-label') || '').trim(),
        };
      }, id);
      expect(named.exists).toBe(true);
      expect(named.text.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Dyslexia Mode - on a Canvas page', () => {
  test('syllable highlighting reaches a real article and leaves its words readable', async ({
    context,
    extensionId,
  }) => {
    const page = await openWith(context, extensionId, 'syllable', '.assist-syllable');

    const spanCount = await page.locator('#para1 .assist-syllable').count();
    expect(spanCount).toBeGreaterThan(20);

    // The student must still be reading their own words, in their own order.
    const text = await page.locator('#para1').innerText();
    expect(text).toContain('Readers remember the alphabet');
    expect(text).not.toContain('�');

    // Every span really is painted, not merely styled: an inline background that Chrome resolves
    // to transparent would be a tint that is not there.
    const backgrounds = await page.$$eval('#para1 .assist-syllable', spans =>
      spans.slice(0, 40).map(span => getComputedStyle(span).backgroundColor)
    );
    backgrounds.forEach(background => {
      expect(background).not.toBe('rgba(0, 0, 0, 0)');
      expect(background).not.toBe('transparent');
    });
    expect(new Set(backgrounds).size).toBe(2);

    await page.close();
  });

  test('grammar colours are painted with their second, non-colour cue', async ({
    context,
    extensionId,
  }) => {
    // Colour alone cannot carry four categories at these luminances, so each category also gets
    // a 3px underline: Chrome paints a narrower double border as one solid line, which would make
    // the verb's cue the noun's. Only a browser reports the computed border.
    const page = await openWith(context, extensionId, 'grammar', '.assist-grammar');

    const marked = await page.$$eval('#para2 [data-assist-grammar]', spans =>
      spans.map(span => ({
        category: span.dataset.assistGrammar,
        width: getComputedStyle(span).borderBottomWidth,
        style: getComputedStyle(span).borderBottomStyle,
        colour: getComputedStyle(span).borderBottomColor,
      }))
    );

    expect(marked.length).toBeGreaterThan(0);
    marked.forEach(cue => {
      // Chrome snaps borders to whole device pixels, so 3px reads as 2.667px at a 1.5 ratio. More
      // than 2.5px still tells the 3px rule apart from the old 2px one at any ratio.
      expect(parseFloat(cue.width)).toBeGreaterThan(2.5);
      expect(['solid', 'double', 'dashed', 'dotted']).toContain(cue.style);
      expect(cue.colour).not.toBe('rgba(0, 0, 0, 0)');
    });

    await page.close();
  });

  test('grammar colours tint nouns and verbs in a real article and show a named key', async ({
    context,
    extensionId,
  }) => {
    const page = await openWith(context, extensionId, 'grammar', '.assist-grammar');

    const categoryOf = async word =>
      page.$$eval(
        '#para1 .assist-grammar, #para2 .assist-grammar',
        (spans, target) =>
          spans.filter(span => span.textContent === target).map(span => span.dataset.assistGrammar),
        word
      );

    // Nouns were never tinted before the tagging read compromise term by term.
    expect(await categoryOf('alphabet')).toContain('noun');
    expect(await categoryOf('sentence')).toContain('noun');
    expect(await categoryOf('remember')).toContain('verb');
    expect(await page.locator('#para1 [data-assist-grammar="noun"]').count()).toBeGreaterThan(3);
    expect(await page.locator('#para1 [data-assist-grammar="verb"]').count()).toBeGreaterThan(2);

    // Painted, not merely styled.
    const nounBackground = await page.$eval(
      '#para1 [data-assist-grammar="noun"]',
      span => getComputedStyle(span).backgroundColor
    );
    expect(nounBackground).not.toBe('rgba(0, 0, 0, 0)');

    // The article still reads as it was written.
    expect(await page.locator('#para1').innerText()).toContain('Readers remember the alphabet');

    const key = page.getByRole('region', { name: 'Grammar colours key' });
    await expect(key).toBeVisible();
    for (const name of ['Noun', 'Verb', 'Adjective', 'Adverb']) {
      await expect(key.getByText(name, { exact: true })).toBeVisible();
    }

    // Folding it leaves the button, and the button brings it back from the keyboard.
    const button = key.getByRole('button', { name: 'Grammar colours key' });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(key.getByText('Noun', { exact: true })).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');

    // The key sits in the corner, not on the article.
    const keyBox = await key.boundingBox();
    const paraBox = await page.locator('#para1').boundingBox();
    const overlaps =
      keyBox.x < paraBox.x + paraBox.width &&
      paraBox.x < keyBox.x + keyBox.width &&
      keyBox.y < paraBox.y + paraBox.height &&
      paraBox.y < keyBox.y + keyBox.height;
    expect(overlaps).toBe(false);

    await setVariant(context, extensionId, null);
    await expect(key).toHaveCount(0, { timeout: 15000 });

    await page.close();
  });

  test('switching variant leaves none of the previous variant on the page', async ({
    context,
    extensionId,
  }) => {
    // Two transforms over the same words would double-wrap them and the tints would fight.
    const page = await openWith(context, extensionId, 'bionic', '.assist-bionic');

    await setVariant(context, extensionId, 'syllable');
    await page.waitForSelector('.assist-syllable', { timeout: 15000 });

    expect(await page.locator('.assist-bionic').count()).toBe(0);
    expect(await page.locator('.assist-grammar').count()).toBe(0);

    await page.close();
  });

  test('turning it off gives the article back exactly as it was', async ({
    context,
    extensionId,
  }) => {
    await setVariant(context, extensionId, null);
    const page = await context.newPage();
    await routeLms(context);
    await page.goto(PAGE_URL);
    await page.waitForTimeout(1500);
    const before = await page.locator('#para1').innerHTML();

    await setVariant(context, extensionId, 'syllable');
    await page.waitForSelector('.assist-syllable', { timeout: 15000 });

    await setVariant(context, extensionId, null);
    await page.waitForFunction(() => document.querySelectorAll('.assist-syllable').length === 0, {
      timeout: 15000,
    });

    expect(await page.locator('#para1').innerHTML()).toBe(before);
    expect(await page.locator('[data-assist-dyslexia-processed]').count()).toBe(0);

    await page.close();
  });

  test('the transform does not stop the student interacting with the page', async ({
    context,
    extensionId,
  }) => {
    // The transform rewraps text nodes inside the page's own elements. A selection made
    // afterwards must still return the page's words, or copying a sentence is broken.
    const page = await openWith(context, extensionId, 'syllable', '.assist-syllable');

    const selected = await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById('heading'));
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.toString();
    });

    expect(selected).toBe('Decoding and fluency');

    await page.close();
  });
});
