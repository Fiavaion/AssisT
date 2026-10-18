/**
 * Putting the Flat view on top of the popup that is already there.
 *
 * Flat does NOT write settings. Every switch, slider, select and button it draws proxies to the
 * element the accordion popup already owns: it sets that element's value and dispatches the event
 * the existing handler listens for, and the existing handler does the rest — storing the setting,
 * telling the content script, showing or hiding its own options.
 *
 * That is the whole design, and it is deliberate. Read Aloud's own handler does three things when
 * it is switched on, only one of which is a storage write; there are thirty-two `sendCommandToTab`
 * calls in popup.js. A Flat view that wrote settings directly would reimplement all of that, and
 * every one it missed would be a capability that quietly stopped working. So Flat is the only face
 * the student sees, and the accordion beneath it, hidden, is its backing store: every control
 * Flat draws drives the accordion element of the same id, and a control the registry does not
 * declare is one the student cannot reach at all.
 *
 * It also means the drift test is load-bearing at runtime: it is what guarantees the element ids
 * Flat reaches for are the ones that exist.
 *
 * HOW A CONTROL IS FOUND. Flat is handed a `find` resolver rather than an element to search,
 * because some supports sit outside the accordion entirely — Show Text Stats lives in
 * `.text-stats-bar`, a sibling of `<main>` — so the search has to cover the whole popup rather
 * than one subtree. `createControlFinder` is the one place that does it.
 */

import { createFlatModel } from './flat-model.js';
import { createFlatView } from './flat-view.js';
import { TOOLS } from '../registry/tool-registry.js';
import { isToolVisible } from '../registry/tool-state.js';

/**
 * Resolve real controls: search the popup's markup, never Flat's own.
 *
 * The ids Flat draws are namespaced (`renderedId` in control-renderer.js), so a search for an
 * accordion id cannot match Flat's copy of it. `exclude` is kept anyway: it makes the guarantee
 * structural rather than a property of a naming convention two files away, and it holds for any
 * selector — not only ones matching on id. Matching is by document order with Flat's subtree
 * skipped. `exclude` is resolved on every call, so a finder built before Flat has a root works.
 *
 * @param {Object} options
 * @param {Document|Element} [options.root] - the popup markup to search
 * @param {string} [options.exclude] - selector for the subtree Flat draws into
 * @returns {(selector:string) => Element|null}
 */
export function createControlFinder({ root, exclude } = {}) {
  const scope = root || document;
  return selector => {
    const flat = exclude ? scope.querySelector(exclude) : null;
    const matches = scope.querySelectorAll(selector);
    for (const element of matches) {
      if (!flat || !flat.contains(element)) {
        return element;
      }
    }
    return null;
  };
}

/** Tell a control's own handler that the student changed it. */
function fire(element, type) {
  element.dispatchEvent(new Event(type, { bubbles: true }));
}

/** Press a button the way `attachInteractiveHandler` listens for. */
function press(element) {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

/**
 * Drive one checkbox, as if the student had clicked it in the accordion.
 * @param {(selector:string) => Element|null} find
 * @param {string} id
 * @param {boolean} on
 * @returns {boolean} whether the element was found
 */
export function proxySwitch(find, id, on) {
  const element = find(`[id="${id}"]`);
  if (!element) {
    return false;
  }
  if (element.checked !== on) {
    element.checked = on;
    fire(element, 'change');
  }
  return true;
}

/**
 * Drive one value control. Ranges are written on `input` and selects on `change`, which is what
 * each handler in popup.js listens for.
 *
 * @param {(selector:string) => Element|null} find
 * @param {Object} control
 * @param {*} value
 * @returns {boolean} whether the change was delivered
 */
export function proxyControl(find, control, value) {
  if (control.type === 'chips') {
    // Each chip is its own button that toggles itself, so press only the ones whose state differs
    // from what the student has just asked for.
    const wanted = Array.isArray(value) ? value : [];
    let delivered = false;
    (control.options || []).forEach(option => {
      const chip = find(`[id="${option.id}"]`);
      if (!chip) {
        return;
      }
      if ((chip.getAttribute('aria-pressed') === 'true') !== wanted.includes(option.value)) {
        press(chip);
        delivered = true;
      }
    });
    return delivered;
  }

  if (control.type === 'switch') {
    return proxySwitch(find, control.id, value === true);
  }

  const element = find(`[id="${control.id}"]`);
  if (!element) {
    return false;
  }

  if (control.type === 'radio') {
    // `control` is the option the student chose — the view passes it back rather than the group's
    // first member — so clicking it is all that is needed, whether the group stores one value or
    // three parallel booleans.
    element.checked = true;
    fire(element, 'change');
    return true;
  }

  const scale = typeof control.scale === 'number' && control.scale > 0 ? control.scale : 1;
  element.value = control.type === 'range' ? String(Number(value) * scale) : String(value);
  fire(element, control.type === 'range' ? 'input' : 'change');
  return true;
}

/**
 * Press the button an action names.
 * @param {(selector:string) => Element|null} find
 * @param {{id:string}} action
 * @returns {boolean}
 */
export function proxyAction(find, action) {
  const element = find(`[id="${action.id}"]`);
  if (!element) {
    return false;
  }
  press(element);
  return true;
}

/**
 * Open the place a tool's state is actually chosen, for a tool that has no switch.
 *
 * AI Assist's mode is picked in two places, and which one is right depends on how far the student
 * has got: "Set up AI →" runs the wizard and is on screen only while the wizard has never been
 * run, and "Advanced settings →" opens the mode chooser for everyone else. The popup already
 * decides between them — it shows and hides the CTA itself — so this presses the first of the
 * tool's declared actions that the popup is currently showing rather than keeping a second copy
 * of that rule.
 *
 * @param {(selector:string) => Element|null} find
 * @param {Object} tool
 * @returns {boolean} whether something was pressed
 */
export function proxyOpen(find, tool) {
  for (const action of (tool && tool.actions) || []) {
    const element = find(`[id="${action.id}"]`);
    if (element && element.style.display !== 'none') {
      press(element);
      return true;
    }
  }
  return false;
}

/**
 * Mount Flat over the accordion popup.
 *
 * @param {Object} options
 * @param {Element} options.container - where Flat draws
 * @param {(selector:string) => Element|null} options.find - resolves the real controls Flat proxies
 *   to; they are hidden while Flat is up, but present, because their handlers do the actual work.
 *   Build it with `createControlFinder` so it can never resolve into Flat's own markup.
 * @param {() => Object} options.getSettings - the popup's live `assist_settings`
 * @param {() => string} [options.getAiMode]
 * @param {(control:Object) => Array} [options.optionsFor]
 * @param {{choices:Array, current:()=>string, set:(value:string)=>void}} [options.theme] - the
 *   popup theme control shown in Flat's bar; omitted, no control is drawn
 * @returns {{refresh:()=>void, destroy:()=>void, model:Object}}
 */
export function mountFlat({ container, find, getSettings, getAiMode, optionsFor, theme } = {}) {
  const read = () => {
    const settings = (getSettings && getSettings()) || {};
    return {
      settings,
      visibility: settings.ui_visibility || {},
      local: { aiMode: getAiMode ? getAiMode() : undefined },
      // The accordion's own checkbox is the state Flat mirrors. Reading it directly means a row
      // can never disagree with the control it stands for — including in the moment just after a
      // handler has run but before it has written storage.
      isOn: tool => {
        if (!tool.toggleId) {
          return undefined;
        }
        const element = find(`[id="${tool.toggleId}"]`);
        return element ? element.checked : undefined;
      },
    };
  };

  const model = createFlatModel(read());

  /** Re-read settings and redraw. The filter's snapshot survives, by design. */
  const refresh = () => {
    model.update(read());
    view.refresh();
  };

  const view = createFlatView({
    model,
    theme,
    valueOf: control => {
      // The live element is the truest answer while the popup is open: its handler has already
      // applied whatever the student last changed through Flat.
      const element = find(`[id="${control.id}"]`);
      if (!element) {
        return control.default;
      }
      if (control.type === 'switch') {
        return element.checked;
      }
      if (control.type === 'range') {
        const scale = typeof control.scale === 'number' && control.scale > 0 ? control.scale : 1;
        return Number(element.value) / scale;
      }
      if (control.type === 'chips') {
        return (control.options || [])
          .filter(option => {
            const chip = find(`[id="${option.id}"]`);
            return chip && chip.getAttribute('aria-pressed') === 'true';
          })
          .map(option => option.value);
      }
      if (control.type === 'radio') {
        const chosen = (control.group && find(`input[name="${control.group}"]:checked`)) || null;
        return chosen ? chosen.value : control.default;
      }
      return element.value;
    },
    optionsFor,
    // A student can hide the speed presets in Advanced Options (ui_visibility), as they can a tool.
    presetsFor: control =>
      isToolVisible({ visibilityKey: control.presetsVisibilityKey }, read().visibility)
        ? control.presets
        : [],
    statusOf: id => {
      const source = find(`[id="${id}"]`);
      return {
        text: source ? source.textContent.trim() : '',
        live: source ? source.getAttribute('role') === 'status' : false,
      };
    },
    onOpenTool: tool => {
      proxyOpen(find, tool);
    },
    onToggleTool: (tool, on) => {
      if (tool.toggleId) {
        proxySwitch(find, tool.toggleId, on);
      }
      // Patch, never redraw: a full render would replace the switch the student is still touching
      // and drop their focus to the top of the popup.
      model.update(read());
      view.syncTool(tool.id);
    },
    onControlChange: (tool, control, value) => {
      proxyControl(find, control, value);
    },
    onAction: (tool, action) => {
      proxyAction(find, action);
    },
  });

  view.mount(container);

  // The accordion writes its status lines as the student works, through handlers Flat never sees.
  // Watching each one is how Flat's copy says the same words at the same moment.
  const watchers = TOOLS.flatMap(tool => tool.statusLines || [])
    .map(line => {
      const source = find(`[id="${line.id}"]`);
      if (!source) {
        return null;
      }
      const watcher = new MutationObserver(() => view.syncStatus(line.id));
      watcher.observe(source, { childList: true, characterData: true, subtree: true });
      return watcher;
    })
    .filter(Boolean);

  return {
    model,
    refresh,
    destroy: () => {
      watchers.forEach(watcher => watcher.disconnect());
      view.destroy();
    },
  };
}
