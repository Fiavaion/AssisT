/**
 * @jest-environment jsdom
 *
 * Tests for the Flat view's DOM.
 *
 * The model's tests cover what should be shown. These cover how it is presented: that the count is
 * announced rather than only drawn, that the filter says what pressing it will do, that switching
 * a support on reveals its settings under its own row rather than somewhere else, and that a
 * support which lives inside another is drawn inside it and appears and disappears with it.
 */

import fs from 'fs';
import path from 'path';

import { createFlatView } from '../../../../src/popup/flat/flat-view.js';
import { createFlatModel } from '../../../../src/popup/flat/flat-model.js';
import { toolById } from '../../../../src/popup/registry/tool-registry.js';
import { COMPANION_FEATURES } from '../../../../src/features/companion/companion-settings.js';

const DEFAULT_ON = [
  'highlight',
  'ocr',
  'highlight-menu',
  'citation',
  'mindmap',
  'canvas',
  'moodle',
  'google-classroom',
];

const write = (settings, id, value) => {
  const [root, key] = toolById(id).state.path.split('.');
  settings[root] = { ...(settings[root] || {}), [key]: value };
  return settings;
};

const settingsWith = ids => {
  const settings = {};
  DEFAULT_ON.filter(id => !ids.includes(id)).forEach(id => write(settings, id, false));
  ids.forEach(id => write(settings, id, true));
  return settings;
};

/** The companion features are on out of the box as well, and live in chrome.storage.local. */
const COMPANION_OFF = {
  companionFeatures: Object.fromEntries(COMPANION_FEATURES.map(feature => [feature.key, false])),
};

/**
 * Watch the count line and collect every announcement it makes.
 *
 * The count line is a live region: a screen reader speaks each write, whether or not the sentence
 * changed. Counting rendered text cannot see a sentence written twice, so these tests watch the
 * node itself. Call `said()` for the sentences written since the watch began.
 */
function watchCount(container) {
  const node = container.querySelector('.assist-flat__count');
  const said = [];
  const observer = new MutationObserver(() => {});
  observer.observe(node, { childList: true, characterData: true, subtree: true });
  return {
    said: () => {
      observer.takeRecords().forEach(record => {
        // The sentence as written, not the one on screen now: a later write must not hide an earlier.
        const added = [...record.addedNodes].map(added => added.textContent).join('');
        said.push(record.type === 'characterData' ? record.target.textContent : added);
      });
      return said;
    },
    stop: () => observer.disconnect(),
  };
}

/**
 * Longer than the view's search debounce, so a typed query has landed.
 *
 * The field waits for a pause in the typing before it searches; without that pause a burst of
 * keystrokes announced a count per letter through the live region. These tests type the whole query
 * at once, so they have to let that pause pass.
 */
const PAST_DEBOUNCE_MS = 400;

/** Let a typed query land. Requires the calling block to be on fake timers. */
const settle = () => jest.advanceTimersByTime(PAST_DEBOUNCE_MS);

/** Mount a view over a model and return both, plus the container. */
function mount(settings = {}, handlers = {}) {
  const model = createFlatModel({ settings, local: COMPANION_OFF });
  const view = createFlatView({ model, valueOf: control => control.default, ...handlers });
  const container = document.createElement('div');
  document.body.appendChild(container);
  view.mount(container);
  return { model, view, container };
}

beforeEach(() => {
  document.body.textContent = '';
  window.matchMedia =
    window.matchMedia ||
    (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
});

describe('the bar', () => {
  it('announces the count rather than only drawing it', () => {
    const { container } = mount();
    const count = container.querySelector('.assist-flat__count');
    expect(count.getAttribute('role')).toBe('status');
    expect(count.getAttribute('aria-live')).toBe('polite');
    expect(count.textContent).toMatch(/^All \d+ supports$/);
  });

  it('names the filter by what pressing it will do', () => {
    const { container } = mount();
    const filter = container.querySelector('.assist-flat__filter');
    expect(filter.getAttribute('aria-pressed')).toBe('false');
    expect(filter.getAttribute('aria-label')).toMatch(/^Show only the \d+ supports in use$/);
  });

  it('collapses the list when pressed, and says how much is hidden', () => {
    const { container } = mount(settingsWith(['tts', 'pomodoro']));
    const before = container.querySelectorAll('.assist-flat__row').length;

    container
      .querySelector('.assist-flat__filter')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(container.querySelectorAll('.assist-flat__row').length).toBeLessThan(before);
    expect(container.querySelector('.assist-flat__count').textContent).toMatch(
      /Showing \d+ in use — \d+ hidden/
    );
    expect(container.querySelector('.assist-flat__filter').getAttribute('aria-pressed')).toBe(
      'true'
    );
  });

  it('keeps focus on the filter across the redraw', () => {
    // Pressing it rebuilds the whole view; losing focus to the body would strand a keyboard user
    // at the top of the document.
    const { container } = mount(settingsWith(['tts']));
    container
      .querySelector('.assist-flat__filter')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.activeElement).toBe(container.querySelector('.assist-flat__filter'));
  });

  it('explains an empty list instead of showing nothing', () => {
    const { container } = mount(settingsWith([]));
    container
      .querySelector('.assist-flat__filter')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(container.querySelector('.assist-flat__empty').textContent).toMatch(/Show all/);
    expect(container.querySelector('.assist-flat__count').textContent).toMatch(/Nothing in use/);
  });
});

describe('the bar holding still', () => {
  // The bug: pressing the filter changed the count's wording AND the button's wording, and with
  // each box sized to whatever it happened to say, the bar re-laid itself out under the pointer.
  // Each box now carries every wording it can ever show, so its size is fixed by the longest of
  // them and the press changes nothing but which one is visible.

  it('holds space for every wording the count can take', () => {
    const { model, container } = mount(settingsWith(['tts']));
    const box = container.querySelector('.assist-flat__countbox');
    const sizers = [...box.querySelectorAll('.assist-flat__count-sizer')];

    expect(sizers.map(node => node.textContent).sort()).toEqual(
      [...model.summaryVariants()].sort()
    );
    // Reserved silently: a screen reader must hear one line, not four.
    sizers.forEach(node => expect(node.getAttribute('aria-hidden')).toBe('true'));
  });

  it('keeps the live region to the wording actually shown', () => {
    const { model, container } = mount(settingsWith(['tts']));
    expect(container.querySelector('.assist-flat__count').textContent).toBe(model.summary());
  });

  it('holds space for both filter wordings, showing one', () => {
    const { container } = mount(settingsWith(['tts']));
    const wordings = [...container.querySelectorAll('.assist-flat__filter-text')];
    expect(wordings.map(node => node.textContent).sort()).toEqual(['In use only', 'Show all']);

    const visible = wordings.filter(
      node => !node.classList.contains('assist-flat__filter-text--sizer')
    );
    expect(visible.map(node => node.textContent)).toEqual(['In use only']);
    expect(visible[0].hasAttribute('aria-hidden')).toBe(false);
  });

  it('is announced once, however many wordings are drawn', () => {
    const { container } = mount(settingsWith(['tts']));
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.querySelector('[role="status"]').className).toBe('assist-flat__count');
  });

  it('has a stylesheet that actually stacks and hides the space-holders', () => {
    // Jest maps the stylesheet to a stub, so every assertion above would pass just as well with a
    // bar that draws all four wordings underneath one another in Chrome. Read the real file: the
    // reservation is a CSS technique, and the markup on its own does not implement it.
    const css = fs
      .readFileSync(path.join(__dirname, '../../../../src/popup/flat/flat-view.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ');
    const rule = selector => {
      const at = css.indexOf(selector);
      expect(at).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf('}', at));
    };

    // One grid cell for every wording, so the box is sized by the largest of them.
    expect(rule('.assist-flat__countbox, .assist-flat__filter-stack')).toMatch(/display: grid/);
    expect(rule('.assist-flat__countbox > *, .assist-flat__filter-stack > *')).toMatch(
      /grid-area: 1 \/ 1/
    );

    // Hidden, not removed: display:none would reserve nothing, opacity:0 would still be read out.
    const held = rule('.assist-flat__count-sizer, .assist-flat__filter-text--sizer');
    expect(held).toMatch(/visibility: hidden/);
    expect(held).not.toMatch(/display: none|opacity: 0/);
  });

  it('swaps which wording is visible without adding or removing one', () => {
    const { container } = mount(settingsWith(['tts']));
    container
      .querySelector('.assist-flat__filter')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    const wordings = [...container.querySelectorAll('.assist-flat__filter-text')];
    expect(wordings).toHaveLength(2);
    const visible = wordings.filter(
      node => !node.classList.contains('assist-flat__filter-text--sizer')
    );
    expect(visible.map(node => node.textContent)).toEqual(['Show all']);
  });
});

describe('the theme control', () => {
  // theme.js offers two states and no third: 'system' was retired, so there is nothing to follow.
  const themeStub = (current = 'dark') => {
    const chosen = { value: current };
    return {
      choices: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
      current: () => chosen.value,
      set: value => {
        chosen.value = value;
      },
      chosen,
    };
  };

  const arrow = (container, key) =>
    container
      .querySelector('.assist-flat__theme')
      .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

  it('is absent unless the popup supplies one', () => {
    const { container } = mount();
    expect(container.querySelector('.assist-flat__theme')).toBeNull();
  });

  it('offers Light and Dark as one choice of two', () => {
    const theme = themeStub();
    const { container } = mount({}, { theme });
    const group = container.querySelector('.assist-flat__theme');
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.getAttribute('aria-label')).toBe('Popup theme');
    expect([...group.querySelectorAll('[role="radio"]')].map(b => b.textContent)).toEqual([
      'Light',
      'Dark',
    ]);
  });

  it('marks the current choice, and only that one', () => {
    const { container } = mount({}, { theme: themeStub('dark') });
    expect(container.querySelector('[data-theme-choice="dark"]').getAttribute('aria-checked')).toBe(
      'true'
    );
    expect(
      container.querySelector('[data-theme-choice="light"]').getAttribute('aria-checked')
    ).toBe('false');
  });

  it('keeps one tab stop for the group, as a radiogroup should', () => {
    const { container } = mount({}, { theme: themeStub('light') });
    const stops = [...container.querySelectorAll('[data-theme-choice]')].filter(
      button => button.tabIndex === 0
    );
    expect(stops).toHaveLength(1);
    expect(stops[0].dataset.themeChoice).toBe('light');
  });

  it('reports the choice and moves the marking to it', () => {
    const theme = themeStub('light');
    const { container } = mount({}, { theme });

    container
      .querySelector('[data-theme-choice="dark"]')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(theme.chosen.value).toBe('dark');
    expect(container.querySelector('[data-theme-choice="dark"]').getAttribute('aria-checked')).toBe(
      'true'
    );
    expect(
      container.querySelector('[data-theme-choice="light"]').getAttribute('aria-checked')
    ).toBe('false');
  });

  it('moves and chooses with the arrow keys', () => {
    // The unchosen option is deliberately not tabbable, so without the arrow keys there is no way
    // to reach it from the keyboard at all.
    const theme = themeStub('light');
    const { container } = mount({}, { theme });

    arrow(container, 'ArrowRight');
    expect(theme.chosen.value).toBe('dark');
    expect(container.querySelector('[data-theme-choice="dark"]').tabIndex).toBe(0);
    expect(container.querySelector('[data-theme-choice="light"]').tabIndex).toBe(-1);

    arrow(container, 'ArrowLeft');
    expect(theme.chosen.value).toBe('light');
  });

  it('wraps around the two options rather than stopping at the end', () => {
    const theme = themeStub('dark');
    const { container } = mount({}, { theme });
    arrow(container, 'ArrowDown');
    expect(theme.chosen.value).toBe('light');
  });

  it('answers to Enter, not only to the mouse', () => {
    const theme = themeStub('dark');
    const { container } = mount({}, { theme });
    container
      .querySelector('[data-theme-choice="light"]')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(theme.chosen.value).toBe('light');
  });
});

describe('groups', () => {
  it('draws a real heading for each group', () => {
    const { container } = mount();
    const headings = [...container.querySelectorAll('h2.assist-flat__group')];
    expect(headings.map(h => h.textContent)).toEqual([
      'Reading',
      'Writing',
      'Seeing',
      'Focus',
      'Study',
    ]);
  });

  it('offers a jump only for groups that have something in them', () => {
    const { container } = mount(settingsWith(['pomodoro']));
    container
      .querySelector('.assist-flat__filter')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const jumps = [...container.querySelectorAll('.assist-flat__jump-btn')].map(b => b.textContent);
    expect(jumps).toEqual(['Focus']);
  });

  it('labels the jump strip as a group of controls', () => {
    const { container } = mount();
    const strip = container.querySelector('.assist-flat__jump');
    expect(strip.getAttribute('role')).toBe('group');
    expect(strip.getAttribute('aria-label')).toBe('Jump to a group');
  });
});

describe('rows', () => {
  it('gives every support a switch that announces its state', () => {
    const { container } = mount(settingsWith(['tts']));
    const input = container.querySelector('#flat-tts');
    expect(input.getAttribute('role')).toBe('switch');
    expect(input.getAttribute('aria-checked')).toBe('true');
    expect(input.getAttribute('aria-label')).toBe('Read Aloud');
  });

  it('reports a switch change to the caller', () => {
    const changes = [];
    const { container } = mount(settingsWith([]), {
      onToggleTool: (tool, on) => changes.push([tool.id, on]),
    });
    const input = container.querySelector('#flat-tts');
    input.checked = true;
    input.dispatchEvent(new Event('change'));
    expect(changes).toEqual([['tts', true]]);
  });

  it('keeps a support that lives inside another off the top level', () => {
    // The complaint this answers: Highlight While Reading listed beside Read Aloud reads as a
    // support you can switch on on its own, and it is not one.
    const { container } = mount(settingsWith(['highlight']));
    expect(container.querySelector('[data-tool="highlight"]')).toBeNull();
    expect(container.querySelector('[data-tool="word-by-word"]')).toBeNull();
    expect(container.querySelector('[data-tool="tts"]')).not.toBeNull();
  });

  it('says on the parent what switching it on brings with it', () => {
    // Nesting takes two supports off the screen. Something has to say they exist, in words — an
    // indent that is not drawn says nothing at all.
    const { container } = mount(settingsWith([]));
    const holds = container.querySelector('[data-tool="tts"] .assist-flat__holds');
    expect(holds.textContent).toBe('Switch on for Highlight While Reading and Word by Word');
  });

  it('reads that line out with the switch it belongs to', () => {
    // A student working through the switches with a screen reader never reads the row's text.
    // Without this they would tab past Read Aloud and never learn the two supports exist.
    const { container } = mount(settingsWith([]));
    expect(container.querySelector('#flat-tts').getAttribute('aria-describedby')).toBe(
      'flat-tts-holds'
    );
    expect(container.querySelector('#flat-tts-holds')).not.toBeNull();
  });

  it('drops that line once the supports themselves are on screen', () => {
    const { container } = mount(settingsWith(['tts']));
    expect(container.querySelector('[data-tool="tts"] .assist-flat__holds')).toBeNull();
    // And stops pointing at it, rather than naming an id that is no longer in the document.
    expect(container.querySelector('#flat-tts').hasAttribute('aria-describedby')).toBe(false);
  });

  it('says Beta in words on a support that declares it, and nothing on one that does not', () => {
    const { container } = mount();

    const beta = container.querySelector('[data-tool="mindmap"] .assist-flat__beta');
    expect(beta.textContent).toBe('Beta');
    // Beside the name, not inside it: the name is the support's name and nothing else.
    expect(container.querySelector('[data-tool="mindmap"] .assist-flat__name').textContent).toBe(
      'Mind Map'
    );
    expect(container.querySelector('[data-tool="tts"] .assist-flat__beta')).toBeNull();
  });

  it('does not let the Beta mark change what the support can do', () => {
    // Presentation only. The row keeps its switch, its settings and its buttons.
    const { container } = mount(settingsWith(['mindmap']));
    const row = container.querySelector('[data-tool="mindmap"]');
    expect(row.querySelector('input[type="checkbox"]').disabled).toBe(false);
    expect(container.querySelector('[data-settings-for="mindmap"]')).not.toBeNull();
  });

  it('marks Beta in a chip the stylesheet can see against both popup themes', () => {
    // Jest stubs the stylesheet, so the markup alone would pass with an invisible chip.
    const css = fs
      .readFileSync(path.join(__dirname, '../../../../src/popup/flat/flat-view.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ');
    const rule = selector => {
      const at = css.indexOf(`${selector} {`);
      expect(at).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf('}', at));
    };

    // Both colours come from the view's own tokens, which each theme redefines.
    const chip = rule('.assist-flat__beta');
    expect(chip).toMatch(/color: var\(--flat-text-quiet\)/);
    expect(chip).toMatch(/border: 1px solid var\(--flat-line\)/);
    // On the name's line rather than under it.
    expect(rule('.assist-flat__nameline')).toMatch(/display: flex/);
  });

  it('gives an action-only support its button instead of a switch', () => {
    const { container } = mount();
    const row = container.querySelector('[data-tool="translation"]');
    expect(row.querySelector('input[type="checkbox"]')).toBeNull();
    expect(row.querySelector('button').textContent).toBe('Translate Page');
  });
});

describe('settings under a row', () => {
  it('shows a switched-on support its settings, and a switched-off one none', () => {
    const { container } = mount(settingsWith(['tts']));
    const rows = [...container.querySelectorAll('.assist-flat__row, .assist-flat__settings')];
    const ttsIndex = rows.findIndex(node => node.dataset && node.dataset.tool === 'tts');

    // Directly under its own row, not collected elsewhere.
    expect(rows[ttsIndex + 1].className).toContain('assist-flat__settings');
    expect(container.querySelector('[data-tool="word-by-word"]')).not.toBeNull();
    expect(rows.filter(node => node.className.includes('settings')).length).toBeGreaterThan(0);
  });

  it('names every control with its tool', () => {
    const { container } = mount(settingsWith(['tts']));
    const speed = container.querySelector('#flat-rate-slider');
    expect(speed.getAttribute('aria-label')).toBe('Read Aloud — Speed');
  });

  it('reports a control change with the tool and control it belongs to', () => {
    const changes = [];
    const { container } = mount(settingsWith(['tts']), {
      onControlChange: (tool, control, value) => changes.push([tool.id, control.id, value]),
    });
    const speed = container.querySelector('#flat-rate-slider');
    speed.value = '1.5';
    speed.dispatchEvent(new Event('input'));
    expect(changes).toEqual([['tts', 'rate-slider', 1.5]]);
  });

  it('offers a switched-on support its actions', () => {
    const invoked = [];
    const { container } = mount(settingsWith(['tts']), {
      onAction: (tool, action) => invoked.push([tool.id, action.id]),
    });
    const button = container.querySelector('#flat-btn-read-page');
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(invoked).toEqual([['tts', 'btn-read-page']]);
  });

  it('leaves the Advanced Options controls out of the popup surface', () => {
    // Annotations' six settings are drawn by the modal, not here; showing them twice would give a
    // student two places to change one thing.
    const { container } = mount(settingsWith(['annotations']));
    expect(container.querySelector('#flat-annotations-auto-save')).toBeNull();
  });
});

describe('supports nested inside another', () => {
  /**
   * Mount over a live settings object, wired the way `mountFlat` wires the real popup: a switch
   * writes the setting, the model re-reads it, and the view patches that one row. Without the
   * patch step these tests would prove nothing about what a student actually sees.
   */
  function mountLive(settings) {
    const model = createFlatModel({ settings });
    const view = createFlatView({
      model,
      valueOf: control => control.default,
      onToggleTool: (tool, on) => {
        write(settings, tool.id, on);
        model.update({ settings });
        view.syncTool(tool.id);
      },
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    view.mount(container);
    return { model, view, container };
  }

  /** Flip one of Flat's switches the way a student does — including from the keyboard. */
  const flip = (container, id, on) => {
    const input = container.querySelector(`#flat-${id}`);
    input.checked = on;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input;
  };

  const nested = container => container.querySelector('[data-nested-under="tts"]');

  it('brings the two nested rows in when Read Aloud is switched on', () => {
    const { container } = mountLive(settingsWith([]));
    expect(nested(container)).toBeNull();

    flip(container, 'tts', true);

    const group = nested(container);
    expect(group).not.toBeNull();
    expect([...group.querySelectorAll('.assist-flat__row')].map(row => row.dataset.tool)).toEqual([
      'highlight',
      'word-by-word',
    ]);
  });

  it('gives each nested row its own switch, named and announcing its state', () => {
    const { container } = mountLive(settingsWith(['tts', 'highlight']));
    const group = nested(container);

    const highlight = group.querySelector('#flat-highlight');
    expect(highlight.getAttribute('role')).toBe('switch');
    expect(highlight.getAttribute('aria-label')).toBe('Highlight While Reading');
    expect(highlight.getAttribute('aria-checked')).toBe('true');
    expect(group.querySelector('#flat-word-by-word').getAttribute('aria-checked')).toBe('false');
    // Nothing is greying them out any more, so nothing has to explain a greyed-out control.
    expect(highlight.hasAttribute('aria-describedby')).toBe(false);
  });

  it('announces the group by the support that holds it', () => {
    const { container } = mountLive(settingsWith(['tts']));
    const group = nested(container);
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Read Aloud options');
  });

  it('takes them away again — settings and all — when Read Aloud goes off', () => {
    const { container } = mountLive(settingsWith(['tts', 'highlight']));
    expect(container.querySelector('[data-settings-for="highlight"]')).not.toBeNull();

    flip(container, 'tts', false);

    expect(nested(container)).toBeNull();
    expect(container.querySelector('[data-tool="highlight"]')).toBeNull();
    expect(container.querySelector('[data-settings-for="highlight"]')).toBeNull();
    expect(container.querySelector('[data-settings-for="tts"]')).toBeNull();
  });

  it('leaves the switch the student is touching exactly where it was', () => {
    // Patching, not redrawing: replacing this row would take their focus with it.
    const { container } = mountLive(settingsWith(['tts']));
    const before = container.querySelector('#flat-tts');
    flip(container, 'tts', false);
    expect(container.querySelector('#flat-tts')).toBe(before);
    // And that same switch now says what it is holding back, without having been replaced.
    expect(container.querySelector('[data-tool="tts"] .assist-flat__holds').textContent).toMatch(
      /Highlight While Reading/
    );
    expect(before.getAttribute('aria-describedby')).toBe('flat-tts-holds');
  });

  it('shows a nested support its own settings, directly under its own row', () => {
    const { container } = mountLive(settingsWith(['tts']));
    flip(container, 'highlight', true);

    const group = nested(container);
    const children = [...group.children];
    const at = children.findIndex(node => node.dataset.tool === 'highlight');
    expect(children[at + 1].dataset.settingsFor).toBe('highlight');
    expect(container.querySelector('#flat-highlight-color')).not.toBeNull();

    flip(container, 'highlight', false);
    expect(group.querySelector('[data-settings-for="highlight"]')).toBeNull();
  });

  it('keeps the tab order: the parent, its controls, then what is nested inside it', () => {
    const { container } = mountLive(settingsWith(['tts']));
    const order = [...container.querySelectorAll('#flat-tts, #flat-rate-slider, #flat-highlight')];
    expect(order.map(node => node.id)).toEqual(['flat-tts', 'flat-rate-slider', 'flat-highlight']);
  });

  it('draws a nested support once, never also at the top level', () => {
    const { container } = mountLive(settingsWith(['tts']));
    expect(container.querySelectorAll('[data-tool="highlight"]')).toHaveLength(1);
    expect(container.querySelector('[data-tool="highlight"]').closest('[data-nested-under]')).toBe(
      nested(container)
    );
  });

  it('draws the indent as a rule the eye can find in both popup themes', () => {
    // Jest stubs the stylesheet, so every assertion above would pass with a group that is not
    // indented at all and reads as two more top-level rows.
    const css = fs
      .readFileSync(path.join(__dirname, '../../../../src/popup/flat/flat-view.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ');
    const at = css.indexOf('.assist-flat__nested {');
    expect(at).toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf('}', at));
    // A token each theme redefines, never a fixed colour that can only suit one of them.
    expect(rule).toMatch(/border-left: 3px solid var\(--flat-accent\)/);
    // Windows high-contrast throws the palette away; the tie has to survive it.
    expect(css).toMatch(/\.assist-flat__nested \{ border-left-color: ButtonBorder/);
  });
});

describe('lifecycle', () => {
  it('gives the container back on destroy', () => {
    const { view, container } = mount();
    view.destroy();
    expect(container.textContent).toBe('');
    expect(container.classList.contains('assist-flat')).toBe(false);
  });
});

describe('the bar and the jump strip from the keyboard', () => {
  // A native button never emits mousedown from the keyboard — Enter and Space produce a click —
  // so these press the key itself. Wired to mousedown alone, both controls pass every test above
  // and are still dead to a keyboard (WCAG 2.2 SC 2.1.1).
  const pressKey = (el, key) =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  it('turns the filter over on Enter', () => {
    const { model, container } = mount();
    pressKey(container.querySelector('.assist-flat__filter'), 'Enter');
    expect(model.isFiltering()).toBe(true);
    expect(container.querySelector('.assist-flat__filter').getAttribute('aria-pressed')).toBe(
      'true'
    );
  });

  it('turns the filter over on Space', () => {
    const { model, container } = mount();
    pressKey(container.querySelector('.assist-flat__filter'), ' ');
    expect(model.isFiltering()).toBe(true);
  });

  it('jumps to a group on Enter', () => {
    const { container } = mount(settingsWith(['pomodoro']));
    const jump = container.querySelector('.assist-flat__jump-btn');
    const heading = container.querySelector(`[data-group="${jump.textContent}"]`);
    heading.scrollIntoView = jest.fn();
    pressKey(jump, 'Enter');
    expect(heading.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(heading);
  });
});

describe('the search field', () => {
  const field = container => container.querySelector('.assist-flat__search-input');

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** Type into the field the way a student does, then let the search land. */
  const type = (container, text) => {
    const input = field(container);
    input.focus();
    input.value = text;
    input.setSelectionRange(text.length, text.length);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    settle();
    return input;
  };

  /** Type one letter at a time and stop, leaving the search still pending. */
  const typeBurst = (container, text) => {
    const input = field(container);
    input.focus();
    [...text].forEach((_, i) => {
      input.value = text.slice(0, i + 1);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return input;
  };

  const themeStub = () => ({
    choices: [
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
    current: () => 'dark',
    set() {},
  });

  it('is a labelled search field, named by a label rather than by its placeholder', () => {
    // A placeholder is not an accessible name: it disappears as soon as the student types, and
    // several screen readers never announce it at all.
    const { container } = mount();
    const search = container.querySelector('[role="search"]');
    expect(search).not.toBeNull();

    const input = field(container);
    expect(input.type).toBe('search');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(search.contains(input)).toBe(true);

    const label = container.querySelector(`label[for="${input.id}"]`);
    expect(label).not.toBeNull();
    expect(label.textContent).toBe('Search supports');
    // Present for a screen reader, out of the way of a 340px column.
    expect(label.classList.contains('sr-only')).toBe(true);
    expect(input.placeholder).toMatch(/^Search supports/);
  });

  it('reports the result count through the count line that is already a live region', () => {
    // One live region in the bar, not two: a second would make every keystroke announce twice.
    const { container } = mount();
    const count = container.querySelector('.assist-flat__count');
    expect(field(container).getAttribute('aria-describedby')).toBe(count.id);
    expect(count.id).not.toBe('');
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('is the first thing in the bar to reach by tab', () => {
    const { container } = mount({}, { theme: themeStub() });
    const bar = container.querySelector('.assist-flat__bar');
    const reachable = [...bar.querySelectorAll('input, button, [tabindex]')].filter(
      node => node.tabIndex !== -1
    );
    expect(reachable[0]).toBe(field(container));
  });

  it('narrows the list as the student types, and says how many matched', () => {
    const { container } = mount();
    const before = container.querySelectorAll('.assist-flat__row').length;
    type(container, 'too bright');

    const rows = [...container.querySelectorAll('.assist-flat__row')];
    expect(rows.length).toBeLessThan(before);
    expect(rows.map(row => row.dataset.tool)).toEqual(['screen-overlay']);
    expect(container.querySelector('.assist-flat__count').textContent).toBe('1 support matches');
  });

  it('keeps focus and the caret in the field while the list changes under it', () => {
    // The one thing that would make the field unusable: rebuilding the bar on every keystroke
    // takes the input out of the document and the student's next letter goes nowhere.
    const { container } = mount();
    const before = field(container);
    type(container, 'read to me');

    expect(field(container)).toBe(before);
    expect(document.activeElement).toBe(before);
    expect(before.selectionStart).toBe('read to me'.length);
    expect(before.value).toBe('read to me');
  });

  it('finds a support by the problem rather than by its name', () => {
    const shown = query => {
      const { container } = mount();
      type(container, query);
      return [...container.querySelectorAll('.assist-flat__row')].map(row => row.dataset.tool);
    };

    expect(shown('cant focus')).toContain('focus-mode');
    expect(shown('i lose my place')).toContain('reading-guide');
    expect(shown('words move when i read')).toContain('dyslexia-mode');
  });

  it('shows the support a match lives inside, so a nested one can be reached', () => {
    const { container } = mount(settingsWith(['tts', 'highlight']));
    type(container, 'karaoke');
    expect(container.querySelector('[data-tool="tts"]')).not.toBeNull();
    const nested = container.querySelector('[data-nested-under="tts"]');
    expect(nested.querySelector('[data-tool="highlight"]')).not.toBeNull();
  });

  it('explains an empty result instead of showing a blank list', () => {
    const { container } = mount();
    type(container, 'xylophone');
    expect(container.querySelectorAll('.assist-flat__row')).toHaveLength(0);
    expect(container.querySelector('.assist-flat__empty').textContent).toMatch(/Nothing matches/);
    expect(container.querySelector('.assist-flat__count').textContent).toBe('Nothing matches');
  });

  it('drops the jump button for a group the query emptied', () => {
    const { container } = mount();
    type(container, 'plan my essay');
    const jumps = [...container.querySelectorAll('.assist-flat__jump-btn')];
    expect(jumps.map(button => button.textContent)).toEqual(['Study']);
  });

  it('narrows what the filter is showing rather than undoing it', () => {
    const { container } = mount(settingsWith(['pomodoro']));
    container
      .querySelector('.assist-flat__filter')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    type(container, 'read to me');
    expect(container.querySelectorAll('.assist-flat__row')).toHaveLength(0);
    expect(container.querySelector('.assist-flat__filter').getAttribute('aria-pressed')).toBe(
      'true'
    );
  });

  it('says nothing until the typing stops, then says it once', () => {
    // The count line is a live region and the field's own description. Searching per keystroke made
    // it a queue: every word of a query has to match, so a half-typed last word matches nothing, and
    // "i lose my place" announced "nothing matches" three times on its way to one answer.
    const { container } = mount();
    const count = container.querySelector('.assist-flat__count');
    const before = count.textContent;

    typeBurst(container, 'i lose my place');
    expect(count.textContent).toBe(before);

    settle();
    expect(count.textContent).not.toBe(before);
    expect(count.textContent).toMatch(/matches$/);
  });

  it('shows the clear button on the first letter, before the search has run', () => {
    // The button belongs to the field, not to the results: waiting for the pause would leave a
    // student who typed a letter with no way to undo it.
    const { container } = mount();
    typeBurst(container, 'r');
    expect(container.querySelector('.assist-flat__search-clear').hidden).toBe(false);
  });

  it('drops a pending search when the field is cleared', () => {
    // Clearing is deliberate, and a search still waiting would land a moment later. It cannot be
    // caught by looking at the list: the pending search re-reads the field, which clearing has just
    // emptied, so it would ask for the same empty query and leave the same list behind. What it would
    // really do is search twice, so this counts the searches.
    const { model, container } = mount();
    const total = container.querySelectorAll('.assist-flat__row').length;
    const setQuery = jest.spyOn(model, 'setQuery');

    typeBurst(container, 'karaoke');
    container
      .querySelector('.assist-flat__search-clear')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    settle();

    expect(setQuery).toHaveBeenCalledTimes(1);
    expect(setQuery).toHaveBeenCalledWith('');
    expect(container.querySelectorAll('.assist-flat__row')).toHaveLength(total);
    setQuery.mockRestore();
  });

  it('announces the result of a query, and again when another query draws other supports', () => {
    // The sentence is only a number, so two one-hit queries read alike. Guarding the live region on
    // the sentence alone left a student who replaced their query hearing nothing at all.
    const { container } = mount();
    const watch = watchCount(container);

    type(container, 'too bright');
    expect(watch.said()).toEqual(['1 support matches']);
    const first = [...container.querySelectorAll('.assist-flat__row')].map(row => row.dataset.tool);

    type(container, 'karaoke');
    const second = [...container.querySelectorAll('.assist-flat__row')].map(
      row => row.dataset.tool
    );
    expect(second).not.toEqual(first);
    // Same sentence, different supports: it has to be said again.
    expect(watch.said()).toEqual(['1 support matches', '1 support matches']);
    watch.stop();
  });

  it('waits for a pause in the typing, not merely for the next tick', () => {
    // The pause is the point: a debounce short enough to fire between keystrokes announces as often
    // as no debounce at all. Anything less than the wait must leave the count line alone.
    const { container } = mount();
    const count = container.querySelector('.assist-flat__count');
    const before = count.textContent;

    typeBurst(container, 'karaoke');
    jest.advanceTimersByTime(100);
    expect(count.textContent).toBe(before);

    settle();
    expect(count.textContent).toBe('1 support matches');
  });

  it('announces the list again after the view is mounted a second time', () => {
    // A second mount builds a fresh, empty count line. Remembering what the old one said would leave
    // the new one blank — and it is the field's own description as well as the live region.
    const { view, container } = mount();
    const said = container.querySelector('.assist-flat__count').textContent;
    expect(said).not.toBe('');

    view.mount(container);
    expect(container.querySelector('.assist-flat__count').textContent).toBe(said);
  });

  it('does not say a count again when the count has not changed', () => {
    // A live region speaks a write, not a difference: assigning the same sentence replaces the text
    // node and is announced again. Dropping a stop word off the end of a query narrows nothing.
    const { container } = mount();
    type(container, 'read');
    const watch = watchCount(container);

    type(container, 'read the');

    expect(watch.said()).toEqual([]);
    watch.stop();
  });

  it('keeps what the student typed across a filter press', () => {
    const { container } = mount();
    type(container, 'i procrastinate');
    container
      .querySelector('.assist-flat__filter')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(field(container).value).toBe('i procrastinate');
  });
});

describe('clearing the search', () => {
  const field = container => container.querySelector('.assist-flat__search-input');
  const clear = container => container.querySelector('.assist-flat__search-clear');

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const type = (container, text) => {
    const input = field(container);
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    settle();
    return input;
  };

  it('offers no clear button until there is something to clear', () => {
    const { container } = mount();
    expect(clear(container).hidden).toBe(true);
    type(container, 'read');
    expect(clear(container).hidden).toBe(false);
  });

  it('names the clear button for what it does', () => {
    const { container } = mount();
    const button = clear(container);
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Clear search');
  });

  it('empties the field and brings the whole list back', () => {
    const { container } = mount();
    const total = container.querySelectorAll('.assist-flat__row').length;
    type(container, 'read to me');
    clear(container).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(field(container).value).toBe('');
    expect(container.querySelectorAll('.assist-flat__row')).toHaveLength(total);
    // The student is still in the middle of searching: leave them in the field, ready to retype.
    expect(document.activeElement).toBe(field(container));
    expect(clear(container).hidden).toBe(true);
  });

  it('clears from the keyboard as well as the pointer', () => {
    // attachInteractiveHandler binds mousedown alone; a clear button reachable only by mouse is a
    // control a keyboard user can see and cannot use.
    const { container } = mount();
    type(container, 'read to me');
    clear(container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(field(container).value).toBe('');
  });

  it('clears on Escape while there is text, and lets Escape through once there is none', () => {
    // Escape closes the Chrome popup. Swallowing it while the field is empty would leave the
    // student in a popup they cannot dismiss; swallowing it while there is text is the point.
    const { container } = mount();
    type(container, 'read to me');

    const swallowed = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    field(container).dispatchEvent(swallowed);
    expect(field(container).value).toBe('');
    expect(swallowed.defaultPrevented).toBe(true);

    const passed = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    field(container).dispatchEvent(passed);
    expect(passed.defaultPrevented).toBe(false);
  });
});

describe('the search field, in the stylesheet', () => {
  const flatCss = () =>
    fs
      .readFileSync(path.join(__dirname, '../../../../src/popup/flat/flat-view.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ');

  const rule = selector => {
    const text = flatCss();
    const at = text.indexOf(selector);
    expect(at).toBeGreaterThan(-1);
    return text.slice(at, text.indexOf('}', at));
  };

  it('gives the field a line of the bar to itself', () => {
    expect(rule('.assist-flat__search ')).toMatch(/display: flex/);
  });

  it('clears the 24px minimum target size on the clear button (SC 2.5.8)', () => {
    const button = rule('.assist-flat__search-clear ');
    const sizes = [...button.matchAll(/min-(?:width|height): (\d+)px/g)].map(match =>
      Number(match[1])
    );
    expect(sizes).toHaveLength(2);
    sizes.forEach(value => expect(value).toBeGreaterThanOrEqual(24));
  });

  it('keeps the clear button hidden whenever the markup says it is', () => {
    // The button is shown and hidden with the `hidden` property, and a `display` on its own class
    // beats the browser's default rule for [hidden] — which would leave it on screen for good.
    expect(rule('.assist-flat__search-clear[hidden]')).toMatch(/display: none/);
  });

  it('grows with the text instead of clipping it (SC 1.4.12)', () => {
    // A fixed height cuts the descenders off at 1.5 line-height; a minimum grows instead.
    const input = rule('.assist-flat__search-input');
    expect(input).toMatch(/min-height/);
    expect(input).not.toMatch(/[^-]height: \d/);
  });

  it('paints the field from the view’s own tokens, so it follows the popup theme', () => {
    const input = rule('.assist-flat__search-input');
    expect(input).toMatch(/background: var\(--flat-surface/);
    expect(input).toMatch(/color: var\(--flat-text\)/);
  });
});

describe('searching for a support that holds others', () => {
  const field = container => container.querySelector('.assist-flat__search-input');

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const type = (container, text) => {
    const input = field(container);
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    settle();
    return input;
  };

  it('keeps the nested group when the query named the support that holds it', () => {
    // Naming the parent must not erase what it holds. The nested group is built from the model's
    // children alone, so a query matching only "Read Aloud" took Highlight While Reading and Word by
    // Word out of the document with nothing on screen saying where they had gone.
    const { container } = mount(settingsWith(['tts', 'highlight']));
    type(container, 'read aloud');

    const nested = container.querySelector('[data-nested-under="tts"]');
    expect(nested).not.toBeNull();
    expect([...nested.querySelectorAll('.assist-flat__row')].map(row => row.dataset.tool)).toEqual([
      'highlight',
      'word-by-word',
    ]);
  });

  it('re-counts when switching the support on draws what it holds', () => {
    // Under a query, the rows a support holds only become drawable once it is switched on. The count
    // line is the only live region here, so leaving it behind announced a number the list contradicts.
    const settings = settingsWith([]);
    const model = createFlatModel({ settings });
    const view = createFlatView({
      model,
      valueOf: control => control.default,
      onToggleTool: (tool, on) => {
        write(settings, tool.id, on);
        model.update({ settings });
        view.syncTool(tool.id);
      },
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    view.mount(container);

    type(container, 'karaoke');
    const count = container.querySelector('.assist-flat__count');
    expect(count.textContent).toBe('1 support matches');

    const switchEl = container.querySelector('#flat-tts');
    switchEl.checked = true;
    switchEl.dispatchEvent(new Event('change', { bubbles: true }));

    const drawn = container.querySelectorAll('.assist-flat__row').length;
    expect(drawn).toBe(2);
    expect(count.textContent).toBe('2 supports match');
  });

  it('counts the rows it actually drew, not the ones the search touched', () => {
    // Read Aloud is off, so there is nowhere inside it to draw what matched: one row is drawn, and
    // the line beside it has to say one.
    const { container } = mount(settingsWith([]));
    type(container, 'karaoke');

    const rows = [...container.querySelectorAll('.assist-flat__row')];
    expect(rows.map(row => row.dataset.tool)).toEqual(['tts']);
    expect(container.querySelector('.assist-flat__count').textContent).toBe('1 support matches');
    // And the row says in words what switching it on would bring back.
    expect(container.querySelector('.assist-flat__holds').textContent).toMatch(
      /Highlight While Reading/
    );
  });
});

describe('status lines', () => {
  // Words the hidden accordion writes as the student works. Flat draws each declared one where the
  // student is looking, with the words the accordion holds now (flat-mount keeps them in step).
  const words = {
    'reduced-motion-following-note': {
      text: 'Your computer is asking for less motion too, so movement stays reduced even with this off.',
      live: true,
    },
    'ocr-upscale-label': { text: '1.5× (medium)', live: false },
  };
  const statusOf = id => words[id] || { text: '', live: false };

  it('draws a line on its tool’s row, even while the tool is off, announced as the original is', () => {
    const { container } = mount(settingsWith([]), { statusOf });
    const line = container.querySelector(
      '[data-tool="reduced-motion"] #flat-reduced-motion-following-note'
    );
    expect(line.textContent).toBe(words['reduced-motion-following-note'].text);
    expect(line.getAttribute('role')).toBe('status');
    expect(line.hidden).toBe(false);
  });

  it('keeps an empty live line in place, so its first words are heard', () => {
    // A live region that is display:none when the words arrive is not reliably announced.
    const { container } = mount(settingsWith([]), { statusOf: () => ({ text: '', live: true }) });
    const line = container.querySelector('#flat-learning-profile-delete-status');
    expect(line.getAttribute('role')).toBe('status');
    expect(line.hidden).toBe(false);
  });

  it('draws a line declared under a control directly after it, describing it', () => {
    const { container } = mount(settingsWith(['ocr']), { statusOf });
    const slider = container.querySelector('#flat-ocr-upscale-factor');
    const line = container.querySelector('#flat-ocr-upscale-label');
    expect(line.textContent).toBe('1.5× (medium)');
    expect(slider.closest('.assist-reg-control').nextElementSibling).toBe(line);
    expect(slider.getAttribute('aria-describedby')).toBe('flat-ocr-upscale-label');
    expect(line.getAttribute('role')).toBeNull();
  });

  it('hides an empty line that is not live', () => {
    const { container } = mount(settingsWith(['ocr']), { statusOf: () => ({ text: '', live: false }) });
    expect(container.querySelector('#flat-ocr-upscale-label').hidden).toBe(true);
  });

  it('follows new words in place, without redrawing the row', () => {
    const current = { ...words };
    const { view, container } = mount(settingsWith(['ocr']), {
      statusOf: id => current[id] || { text: '', live: false },
    });
    const line = container.querySelector('#flat-ocr-upscale-label');
    current['ocr-upscale-label'] = { text: '2.0× (high)', live: false };
    view.syncStatus('ocr-upscale-label');
    expect(container.querySelector('#flat-ocr-upscale-label')).toBe(line);
    expect(line.textContent).toBe('2.0× (high)');
  });
});

describe('slider presets', () => {
  it('draws Read Aloud’s speed presets under the speed slider', () => {
    const { container } = mount(settingsWith(['tts']), { presetsFor: control => control.presets });
    const wrap = container.querySelector('#flat-rate-slider').closest('.assist-reg-control');
    expect([...wrap.querySelectorAll('.assist-reg-preset')].map(b => b.textContent)).toEqual([
      '0.5x',
      '1x',
      '1.5x',
      '2x',
    ]);
  });

  it('draws none when the student has hidden them', () => {
    const { container } = mount(settingsWith(['tts']), { presetsFor: () => [] });
    expect(container.querySelectorAll('.assist-reg-preset')).toHaveLength(0);
  });
});
