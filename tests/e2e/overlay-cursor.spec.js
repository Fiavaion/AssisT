/**
 * Screen Colour Overlay and Custom Cursor on a page that owns its pointer and paints in canvas.
 *
 * Google Docs and Sheets draw the document into a canvas, lay transparent divs over it, and stop
 * mousemove at the editor. Nobody can log into Docs from a test, so this plants the same three
 * things on a live page the content script already runs on and checks the two features against
 * them: the tint must leave the transparent layer transparent, and the cursor must keep tracking.
 */

import { test, expect } from './extension-fixture.js';

const PAGE = 'https://canvas.instructure.com/login/canvas';

async function enable(popupPage, keys) {
  await popupPage.evaluate(async wanted => {
    const { assist_settings } = await chrome.storage.local.get('assist_settings');
    for (const key of wanted) {
      assist_settings[key] = { ...(assist_settings[key] || {}), enabled: true };
    }
    await chrome.storage.local.set({ assist_settings });
  }, keys);
}

test.describe('overlay and cursor on a canvas-painted page', () => {
  test('the tint is one multiplying layer and leaves transparent layers transparent', async ({
    context,
    popupPage,
  }) => {
    await enable(popupPage, ['screenOverlay']);

    const page = await context.newPage();
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#assist-screen-overlay', { timeout: 15000 });

    const result = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 100;
      canvas.getContext('2d').fillRect(0, 0, 200, 100);
      const layer = document.createElement('div');
      layer.className = 'kix-selection-overlay content-wrapper';
      layer.style.cssText = 'position:absolute;inset:0;background-color:transparent';
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:100px';
      host.append(canvas, layer);
      document.body.appendChild(host);

      const overlay = document.getElementById('assist-screen-overlay');
      const cs = getComputedStyle(overlay);
      return {
        overlays: document.querySelectorAll('#assist-screen-overlay').length,
        injectedStyle: document.querySelector('style#assist-screen-overlay') !== null,
        position: cs.position,
        blend: cs.mixBlendMode,
        pointer: cs.pointerEvents,
        layerBackground: getComputedStyle(layer).backgroundColor,
        hostBackground: getComputedStyle(host).backgroundColor,
      };
    });

    expect(result.overlays).toBe(1);
    expect(result.injectedStyle).toBe(false);
    expect(result.position).toBe('fixed');
    expect(result.blend).toBe('multiply');
    expect(result.pointer).toBe('none');
    expect(result.layerBackground).toBe('rgba(0, 0, 0, 0)');
    expect(result.hostBackground).toBe('rgba(0, 0, 0, 0)');
    await page.close();
  });

  test('the cursor keeps tracking over an element that stops mousemove propagation', async ({
    context,
    popupPage,
  }) => {
    await enable(popupPage, ['customCursor']);

    const page = await context.newPage();
    await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#assist-custom-cursor', { timeout: 15000 });

    await page.evaluate(() => {
      const editor = document.createElement('div');
      editor.id = 'greedy-editor';
      editor.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:400px;z-index:5';
      editor.addEventListener('mousemove', e => e.stopPropagation());
      document.body.appendChild(editor);
    });

    await page.mouse.move(150, 150);
    await page.mouse.move(151, 150);

    const cursor = await page.evaluate(() => {
      const el = document.getElementById('assist-custom-cursor');
      return { left: el.style.left, top: el.style.top, system: getComputedStyle(document.body).cursor };
    });
    expect(cursor.system).toBe('none');
    expect(cursor.left).toBe('135px');
    expect(cursor.top).toBe('134px');
    await page.close();
  });
});
