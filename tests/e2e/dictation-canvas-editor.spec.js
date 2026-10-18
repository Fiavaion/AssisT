/**
 * Dictation into Canvas's Rich Content Editor, in real Chrome.
 *
 * The RCE is TinyMCE: its editing area is a same-origin iframe whose `<body contenteditable>` IS
 * the student's essay. AssisT injects nothing into that document (editable-document-guard.js), so
 * dictation is served from the parent frame: the microphone sits in the page beside the iframe,
 * and the dictation shortcut works with the caret in the essay. Before this was built, clicking
 * into the editor showed no microphone at all, the shortcut did nothing, and with a textarea on the
 * page the microphone stayed on the textarea, so dictation would have gone into the wrong field.
 *
 * Real speech cannot be produced here, and the recogniser lives in the content script's isolated
 * world, which a spec cannot stub. So "recognition was started for the editor" is read from what
 * the product already shows and prints: the recording bar, the microphone's own log line naming
 * the field it serves (the editor's field is a BODY; nothing else on these pages is), and the
 * controller's start log.
 *
 * The Authorship Shield is served the same way: the page listens to the editor's document and
 * records the essay in its on-device log, which the last test reads back from an extension page.
 */

import { test, expect, openReadyPopup } from './extension-fixture.js';
import { clickConsentButton, consentPanelTitle } from './fixtures/consent-panel.js';

const LMS_ORIGIN = 'https://rce.instructure.com';
const EDITOR_URL = `${LMS_ORIGIN}/courses/1/assignments/5/edit`;

const sleep = (page, ms) => page.waitForTimeout(ms);

/** A Canvas edit page whose only field is the editor iframe. */
const EDITOR_ONLY_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Edit assignment - Canvas</title>
<style>body { margin: 0; padding: 24px; font: 16px/1.6 system-ui, sans-serif; }</style></head>
<body><h1>Edit assignment</h1>
<iframe id="editor" src="/editor-frame" width="600" height="300" title="Rich Content Editor"></iframe>
<button id="after-editor" type="button">Save</button></body></html>`;

/** The same page with a plain textarea above the editor. */
const EDITOR_AND_TEXTAREA_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Edit assignment - Canvas</title>
<style>body { margin: 0; padding: 24px; font: 16px/1.6 system-ui, sans-serif; }
textarea { display: block; width: 500px; height: 100px; }</style></head>
<body><h1>Edit assignment</h1>
<label for="title-notes">Notes</label><textarea id="title-notes"></textarea>
<iframe id="editor" src="/editor-frame" width="600" height="300" title="Rich Content Editor"></iframe>
<button id="after-editor" type="button">Save</button></body></html>`;

/** The editor's own document: its body IS the student's field. */
const EDITOR_FRAME_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Rich Content Editor</title></head>
<body class="mce-content-body" contenteditable="true"></body></html>`;

async function routeLms(context, main) {
  await context.route(`${LMS_ORIGIN}/**`, route =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: route.request().url().includes('editor-frame') ? EDITOR_FRAME_HTML : main,
    })
  );
}

/**
 * Write settings the way the popup does — nested feature keys under `assist_settings` — from an
 * extension page, which is the only realm with chrome.storage.
 */
async function store(context, extensionId, features) {
  const page = await openReadyPopup(context, extensionId);
  await page.evaluate(
    patches =>
      new Promise(resolve => {
        chrome.storage.local.get('assist_settings', stored => {
          const settings = stored.assist_settings || {};
          for (const [key, patch] of Object.entries(patches)) {
            settings[key] = { ...settings[key], ...patch };
          }
          chrome.storage.local.set({ assist_settings: settings }, () => resolve());
        });
      }),
    features
  );
  await page.close();
}

/** Voice typing on with its floating button, the microphone allowed for the fixture origin. */
async function openEditorPage(context, extensionId, html) {
  await store(context, extensionId, { stt: { enabled: true, floatingButton: true } });
  await context.grantPermissions(['microphone'], { origin: LMS_ORIGIN });
  await routeLms(context, html);

  const page = await context.newPage();
  const logs = [];
  page.on('console', message => logs.push(message.text()));
  page.on('pageerror', error => logs.push(`pageerror: ${error.message}`));
  await page.goto(EDITOR_URL);
  await page.waitForSelector('#assist-annotation-sidebar', { state: 'attached', timeout: 30000 });
  await sleep(page, 2500);
  return { page, logs, editor: page.frameLocator('#editor') };
}

/** Is box `inner` inside box `outer`, give or take a pixel? */
function inside(inner, outer) {
  return (
    inner.x >= outer.x - 1 &&
    inner.y >= outer.y - 1 &&
    inner.x + inner.width <= outer.x + outer.width + 1 &&
    inner.y + inner.height <= outer.y + outer.height + 1
  );
}

/** Nothing of AssisT's in the editor's document: no id, no class. */
async function assistNodesInEditor(editor) {
  return editor
    .locator('html')
    .evaluate(
      root =>
        root.querySelectorAll('[id^="assist-"], [class*="assist-"], [class*="assist_"]').length
    );
}

const mic = page => page.locator('.assist-stt-mic-button.visible');

/** The Authorship Shield's on-device log, read from an extension page (the realm with storage). */
async function readProvenanceLog(context, extensionId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  const log = await page.evaluate(
    () =>
      new Promise(resolve =>
        chrome.storage.local.get('authorshipProvenanceLog', stored =>
          resolve(stored.authorshipProvenanceLog || { docs: {} })
        )
      )
  );
  await page.close();
  return log;
}

test.describe("Dictation into Canvas's Rich Content Editor", () => {
  test('the microphone appears beside the editor, and starts dictation for it', async ({
    context,
    extensionId,
  }) => {
    const { page, logs, editor } = await openEditorPage(context, extensionId, EDITOR_ONLY_HTML);

    await editor.locator('body').click();
    await expect(mic(page)).toHaveCount(1, { timeout: 5000 });

    const frameBox = await page.locator('#editor').boundingBox();
    const micBox = await mic(page).boundingBox();
    expect(inside(micBox, frameBox)).toBe(true);
    expect(logs.some(line => line.includes('[MicButton] Shown for field: BODY'))).toBe(true);

    await mic(page).click();
    await expect.poll(() => consentPanelTitle(page), { timeout: 5000 }).not.toBeNull();
    await clickConsentButton(page, 'Allow');

    // "Starting…" until Chrome's recogniser reports in, "Recording…" after: either way the bar is
    // the student's evidence that dictation began, and the controller says it was asked to start.
    const bar = page.locator('#assist-stt-recording-bar');
    await expect(bar).toHaveCount(1, { timeout: 5000 });
    await expect(bar).toHaveText(/waiting for the microphone|Recording/);
    await expect
      .poll(() => logs.some(line => line.includes('[STT] Start requested, waiting for onstart')), {
        timeout: 5000,
      })
      .toBe(true);

    expect(await assistNodesInEditor(editor)).toBe(0);
    expect((await editor.locator('body').textContent()).trim()).toBe('');
    expect(logs.filter(line => line.startsWith('pageerror'))).toEqual([]);
  });

  test('the microphone moves from a textarea to the editor when the student clicks into it', async ({
    context,
    extensionId,
  }) => {
    const { page, logs, editor } = await openEditorPage(
      context,
      extensionId,
      EDITOR_AND_TEXTAREA_HTML
    );

    await page.locator('#title-notes').click();
    await expect(mic(page)).toHaveCount(1, { timeout: 5000 });
    const textareaBox = await page.locator('#title-notes').boundingBox();
    expect(inside(await mic(page).boundingBox(), textareaBox)).toBe(true);

    await editor.locator('body').click();
    const frameBox = await page.locator('#editor').boundingBox();
    await expect
      .poll(async () => inside(await mic(page).boundingBox(), frameBox), { timeout: 5000 })
      .toBe(true);

    await mic(page).click();
    await expect.poll(() => consentPanelTitle(page), { timeout: 5000 }).not.toBeNull();
    await clickConsentButton(page, 'Allow');
    await expect(page.locator('#assist-stt-recording-bar')).toHaveCount(1, { timeout: 5000 });

    // Nothing went into the textarea, and nothing of AssisT's went into the essay.
    await expect(page.locator('#title-notes')).toHaveValue('');
    expect(await assistNodesInEditor(editor)).toBe(0);
    expect(logs.filter(line => line.startsWith('pageerror'))).toEqual([]);
  });

  test('the dictation shortcut pressed inside the editor asks the dictation question', async ({
    context,
    extensionId,
  }) => {
    const { page, logs, editor } = await openEditorPage(context, extensionId, EDITOR_ONLY_HTML);

    await editor.locator('body').click();
    await page.keyboard.press('Alt+Shift+V');

    await expect.poll(() => consentPanelTitle(page), { timeout: 5000 }).not.toBeNull();
    // The key was the shortcut's, not the essay's: nothing was typed into the editor.
    expect((await editor.locator('body').textContent()).trim()).toBe('');

    await clickConsentButton(page, 'Allow');
    await expect(page.locator('#assist-stt-recording-bar')).toHaveCount(1, { timeout: 5000 });

    expect(await assistNodesInEditor(editor)).toBe(0);
    expect(logs.filter(line => line.startsWith('pageerror'))).toEqual([]);
  });

  test('Tab from the editor reaches the microphone, and Tab again the control after the editor', async ({
    context,
    extensionId,
  }) => {
    const { page, editor } = await openEditorPage(context, extensionId, EDITOR_ONLY_HTML);

    await editor.locator('body').click();
    await expect(mic(page)).toHaveCount(1, { timeout: 5000 });

    await page.keyboard.press('Tab');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.className || ''))
      .toContain('assist-stt-mic-button');

    await page.keyboard.press('Tab');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id || ''))
      .toBe('after-editor');
  });

  test('writing typed into the editor is recorded in the authorship log, from the page', async ({
    context,
    extensionId,
  }) => {
    const { page, logs, editor } = await openEditorPage(context, extensionId, EDITOR_ONLY_HTML);
    const essay = 'My essay starts here, typed straight into the Canvas editor.';

    await editor.locator('body').click();
    await page.keyboard.type(essay);

    // The log records after a 4s pause in typing; the id comes from the iframe (#editor).
    const docId = '/courses/1/assignments/5/edit#editor';
    await expect
      .poll(
        async () => {
          const log = await readProvenanceLog(context, extensionId);
          return log.docs[docId]?.snapshots?.at(-1)?.excerpt || '';
        },
        { timeout: 15000, intervals: [1000] }
      )
      .toBe(essay);

    // The history chip is the page's, and the essay holds only what the student typed.
    await expect(page.locator('#assist-authorship-indicator')).toHaveCount(1);
    expect(await assistNodesInEditor(editor)).toBe(0);
    expect((await editor.locator('body').textContent()).trim()).toBe(essay);
    expect(logs.filter(line => line.startsWith('pageerror'))).toEqual([]);
  });
});
