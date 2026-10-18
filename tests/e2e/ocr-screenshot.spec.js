/**
 * E2E tests for the OCR / screenshot tool, in real Chrome against the built extension.
 *
 * This file used to carry two popup checks plus five skipped `describe` blocks of eleven empty
 * test bodies. The old copy in tests/e2e-full-suite-backup (removed, and kept in git history)
 * had real bodies, honest as far as they went: they set each control and read its label back. The
 * ones that still describe controls that exist have been brought forward here, rewritten against
 * the current ids and against what the settings are for rather than against the slider's own echo.
 *
 * What each setting then does is proven in jsdom by
 * tests/unit/ocr/ocr-settings-are-honoured.test.js: the language reaches the recognition worker,
 * the confidence threshold really discards the word the engine was unsure of, the zoom factor
 * really resizes the image, and auto-activate reading mode is read by the capture path. One of the
 * five — auto-play TTS — is proven there to be read by nothing at all.
 *
 * What is left here is the browser's half: that the controls exist, are named, default to the
 * values the feature falls back to, and that changing one is still there after the popup closes.
 * Recognition itself is not driven from a spec: it needs a real capture and a multi-megabyte
 * language model download, which belongs in a manual pass, not in CI.
 */

import { test, expect } from './extension-fixture.js';

/**
 * Turn OCR on in Flat and wait for its settings to be drawn under its row. Each Flat control
 * (`#flat-<id>`) drives the hidden accordion control of the same id, whose handler saves it.
 */
async function enableOcr(popupPage) {
  await popupPage.waitForLoadState('domcontentloaded');
  await popupPage.locator('#flat-ocr').setChecked(true, { force: true });
  await expect(popupPage.locator('#ocr-enabled')).toBeChecked();
  await expect(popupPage.locator('#flat-root [data-settings-for="ocr"]')).toBeVisible();
}

/** Every OCR setting currently in chrome.storage, read from the popup's own realm. */
async function storedOcrSettings(popupPage) {
  return popupPage.evaluate(
    () =>
      new Promise(resolve => {
        chrome.storage.local.get('assist_settings', stored =>
          resolve((stored.assist_settings && stored.assist_settings.ocr) || {})
        );
      })
  );
}

test.describe('OCR - the controls exist and are named', () => {
  test('turning OCR on reveals all five settings', async ({ popupPage }) => {
    await enableOcr(popupPage);

    for (const id of [
      'ocr-language',
      'ocr-confidence-threshold',
      'ocr-upscale-factor',
      'ocr-auto-reading-mode',
      'ocr-auto-tts',
    ]) {
      await expect(popupPage.locator(`#flat-${id}`)).toBeVisible();
    }
  });

  test('every OCR control has a name a screen reader can read', async ({ popupPage }) => {
    await enableOcr(popupPage);

    const unnamed = await popupPage.evaluate(ids => {
      return ids.filter(id => {
        const element = document.getElementById(id);
        if (!element) {
          return true;
        }
        const label = document.querySelector(`label[for="${id}"]`);
        const name = (
          element.getAttribute('aria-label') ||
          label?.textContent ||
          ''
        ).trim();
        return name.length === 0;
      });
    }, [
      'flat-ocr-language',
      'flat-ocr-confidence-threshold',
      'flat-ocr-upscale-factor',
      'flat-ocr-auto-reading-mode',
      'flat-ocr-auto-tts',
      'flat-ocr',
    ]);

    expect(unnamed).toEqual([]);
  });

  test('the capture button is a real button, named for what it does', async ({ popupPage }) => {
    await enableOcr(popupPage);

    const trigger = popupPage.locator('#flat-btn-trigger-ocr');
    await trigger.scrollIntoViewIfNeeded();
    await expect(trigger).toBeVisible();

    const described = await trigger.evaluate(element => ({
      tag: element.tagName,
      name: (element.getAttribute('aria-label') || element.textContent || '').trim(),
    }));
    expect(described.tag).toBe('BUTTON');
    expect(described.name.toLowerCase()).toMatch(/captur|scan|screenshot|text/);
  });
});

test.describe('OCR - the language list', () => {
  test('the popup offers every language the recognition engine is asked for', async ({
    popupPage,
  }) => {
    // The values are Tesseract language codes, passed through verbatim (proved in
    // tests/unit/ocr/ocr-settings-are-honoured.test.js). A label with no code behind it would
    // look like a recognition failure rather than a wiring one.
    await enableOcr(popupPage);

    const options = await popupPage.$$eval('#ocr-language option', elements =>
      elements.map(element => ({ value: element.value, label: element.textContent.trim() }))
    );

    expect(options.length).toBeGreaterThanOrEqual(14);
    options.forEach(option => {
      expect(option.value).toMatch(/^[a-z]{3}(_[a-z]+)?$/);
      expect(option.label.length).toBeGreaterThan(0);
    });
    expect(options.map(option => option.value)).toContain('eng');
    expect(new Set(options.map(option => option.value)).size).toBe(options.length);
  });

  test('choosing a language is saved where the capture path reads it', async ({ popupPage }) => {
    await enableOcr(popupPage);

    await popupPage.locator('#flat-ocr-language').selectOption('spa');
    await popupPage.waitForTimeout(500);

    expect((await storedOcrSettings(popupPage)).language).toBe('spa');
  });
});

test.describe('OCR - the sliders', () => {
  test('the confidence slider covers the whole range and saves what it shows', async ({
    popupPage,
  }) => {
    await enableOcr(popupPage);
    const slider = popupPage.locator('#flat-ocr-confidence-threshold');
    await slider.scrollIntoViewIfNeeded();

    expect(await slider.getAttribute('min')).toBe('0');
    expect(await slider.getAttribute('max')).toBe('100');

    await slider.fill('80');
    await popupPage.waitForTimeout(400);
    await expect(popupPage.locator('#ocr-confidence-label')).toHaveText('80%');
    expect((await storedOcrSettings(popupPage)).confidenceThreshold).toBe(80);

    await slider.fill('50');
    await popupPage.waitForTimeout(400);
    await expect(popupPage.locator('#ocr-confidence-label')).toHaveText('50%');
    expect((await storedOcrSettings(popupPage)).confidenceThreshold).toBe(50);
  });

  test('the zoom slider tells the student what the number means', async ({ popupPage }) => {
    // The number alone says nothing; the words under the slider in the popup say why a student
    // would move it, and the slider points at them so they are heard with it too.
    await enableOcr(popupPage);
    const slider = popupPage.locator('#flat-ocr-upscale-factor');
    await slider.scrollIntoViewIfNeeded();
    await expect(slider).toHaveAttribute('aria-describedby', 'flat-ocr-upscale-label');
    await expect(popupPage.locator('#flat-ocr-upscale-label')).toBeVisible();

    await slider.fill('1');
    await popupPage.waitForTimeout(400);
    expect((await popupPage.locator('#flat-ocr-upscale-label').textContent()).toLowerCase()).toContain(
      'none'
    );

    await slider.fill('2');
    await popupPage.waitForTimeout(400);
    expect((await popupPage.locator('#flat-ocr-upscale-label').textContent()).toLowerCase()).toContain(
      'high'
    );
    expect((await storedOcrSettings(popupPage)).upscaleFactor).toBe(2);

    await slider.fill('3');
    await popupPage.waitForTimeout(400);
    expect((await popupPage.locator('#flat-ocr-upscale-label').textContent()).toLowerCase()).toContain(
      'small text'
    );
  });
});

test.describe('OCR - the switches and the defaults', () => {
  test('auto reading mode is saved both ways round', async ({ popupPage }) => {
    await enableOcr(popupPage);
    const toggle = popupPage.locator('#flat-ocr-auto-reading-mode');
    await toggle.scrollIntoViewIfNeeded();

    await toggle.uncheck({ force: true });
    await popupPage.waitForTimeout(400);
    expect((await storedOcrSettings(popupPage)).autoActivateReadingMode).toBe(false);

    await toggle.check({ force: true });
    await popupPage.waitForTimeout(400);
    expect((await storedOcrSettings(popupPage)).autoActivateReadingMode).toBe(true);
  });

  test('the shipped defaults are the ones the capture path falls back to', async ({
    popupPage,
  }) => {
    // src/features/ocr/ocr.js:1483-1486 falls back to eng, 60 and 1.5. If the popup's markup
    // shipped anything else, a student who never touches these would be reading at settings
    // nothing in the code agrees with.
    await enableOcr(popupPage);

    const markup = await popupPage.evaluate(() => ({
      language: document.getElementById('ocr-language').querySelector('option[selected]')?.value,
      confidence: document.getElementById('ocr-confidence-threshold').getAttribute('value'),
      upscale: document.getElementById('ocr-upscale-factor').getAttribute('value'),
      autoReadingMode: document.getElementById('ocr-auto-reading-mode').hasAttribute('checked'),
    }));

    expect(markup.language).toBe('eng');
    expect(markup.confidence).toBe('60');
    expect(parseFloat(markup.upscale)).toBe(1.5);
    expect(markup.autoReadingMode).toBe(true);
  });

  test('a changed setting is still there when the popup is opened again', async ({ popupPage }) => {
    await enableOcr(popupPage);
    await popupPage.locator('#flat-ocr-confidence-threshold').fill('45');
    await popupPage.locator('#flat-ocr-language').selectOption('fra');
    await popupPage.waitForTimeout(600);

    await popupPage.reload();
    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.waitForTimeout(800);

    expect(await popupPage.locator('#ocr-confidence-threshold').inputValue()).toBe('45');
    expect(await popupPage.locator('#ocr-language').inputValue()).toBe('fra');
  });
});
