/**
 * @jest-environment jsdom
 *
 * The popup's route into the citation guide.
 *
 * The accordion is hidden behind the Flat view, so a button that exists only in the accordion is
 * one no student can reach. Flat draws a tool's actions from the registry and presses the real
 * accordion button behind them, so the declaration is what makes the button reachable, and these
 * are the assertions that hold it there.
 *
 * The gating is the other half: the button must sit inside the container the Citations switch
 * shows and hides, so it appears exactly when the feature does.
 */

import fs from 'fs';
import path from 'path';

import { toolsBySection } from '../../../src/popup/registry/tool-registry.js';
import { proxyAction } from '../../../src/popup/flat/flat-mount.js';

const POPUP_HTML = path.join(__dirname, '../../../src/popup/popup.html');
const html = fs.readFileSync(POPUP_HTML, 'utf8');

const GUIDE_BUTTON_ID = 'btn-citation-guide';

/** The Citations tool as the registry declares it. */
const citationTool = toolsBySection('school').find(tool => tool.id === 'citation');

describe('the citation guide button — registry', () => {
  it('is declared as an action of the Citations tool, so Flat draws it', () => {
    const action = citationTool.actions.find(a => a.id === GUIDE_BUTTON_ID);
    expect(action).toBeDefined();
    expect(action.label).toBe('How to use citations');
  });

  it('is drawn in popup.html, not built later, so the drift test can see it', () => {
    const action = citationTool.actions.find(a => a.id === GUIDE_BUTTON_ID);
    expect(action.surface === undefined || action.surface === 'popup').toBe(true);
  });

  it('hangs off a tool with a switch, so Flat shows it only when Citations is on', () => {
    // Flat mounts a tool's settings — and the action strip within them — only for a row that is
    // on. That is the same gate as the accordion's options container, expressed as state.
    expect(citationTool.actionOnly).toBeUndefined();
    expect(citationTool.state.path).toBe('citation.enabled');
  });
});

describe('the citation guide button — the accordion', () => {
  it('exists in popup.html', () => {
    expect(html).toContain(`id="${GUIDE_BUTTON_ID}"`);
  });

  it('sits inside the container the Citations switch shows and hides', () => {
    const start = html.indexOf('id="citation-options-container"');
    const end = html.indexOf('id="canvas-integration-section"');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(html.slice(start, end)).toContain(`id="${GUIDE_BUTTON_ID}"`);
  });

  it('carries an accessible name that says what pressing it does', () => {
    const doc = document.implementation.createHTMLDocument('popup');
    doc.documentElement.innerHTML = html.replace(/<!doctype html>/i, '');
    const button = doc.getElementById(GUIDE_BUTTON_ID);
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('aria-label')).toMatch(/how to use citations/i);
    // The emoji is decoration; the words carry the name.
    expect(button.querySelector('.btn-icon').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('the citation guide button — Flat reaches the same button', () => {
  it('presses the accordion button the declaration names', () => {
    document.body.innerHTML = `<button id="${GUIDE_BUTTON_ID}" type="button">How to use citations</button>`;
    const button = document.getElementById(GUIDE_BUTTON_ID);
    const pressed = jest.fn();
    button.addEventListener('mousedown', pressed);

    const find = selector => document.querySelector(selector);
    const action = citationTool.actions.find(a => a.id === GUIDE_BUTTON_ID);

    expect(proxyAction(find, action)).toBe(true);
    expect(pressed).toHaveBeenCalled();
  });

  it('reports honestly when the button is not in the document', () => {
    document.body.innerHTML = '';
    const action = citationTool.actions.find(a => a.id === GUIDE_BUTTON_ID);
    expect(proxyAction(selector => document.querySelector(selector), action)).toBe(false);
  });
});
