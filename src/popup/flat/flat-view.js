/**
 * The Flat view: every support on one screen.
 *
 * Nine accordion sections asked a student to know which drawer a support lives in before they
 * could reach it. Flat asks nothing: the supports are all here, tightly set, grouped under
 * headings, with a jump strip for the long scroll and one filter that collapses the list to what
 * is switched on.
 *
 * The view draws; `flat-model.js` decides what to draw and `control-renderer.js` draws the
 * controls. Nothing here reads or writes storage — the caller supplies the values and receives the
 * changes, so this file stays testable and the popup keeps owning persistence.
 *
 * THE BAR IS BUILT ONCE. Everything below it is redrawn as often as it needs to be, but the bar is
 * amended in place, because it holds the search field: a student typing into a field that is torn
 * out and rebuilt between keystrokes loses focus, loses the caret and loses the next letter. Making
 * that structural beats remembering it — `syncBar` brings the bar's wording into line, `renderList`
 * redraws the list, and nothing redraws both.
 *
 * Accessibility rules held here rather than left to CSS:
 *   - the count lives in a live region, so a filter press is announced, not just seen — and the
 *     search field points at that same line, so a keystroke's result is announced through the one
 *     region that already exists rather than a second one competing with it;
 *   - the filter is a toggle button carrying `aria-pressed`, and its name says what pressing it
 *     will do rather than what state it is in;
 *   - group headings are real headings, and the jump strip is a labelled group of buttons;
 *   - a support that lives inside another — Highlight While Reading inside Read Aloud — is drawn
 *     inside it, in a `role="group"` named after the parent, so the nesting is announced and not
 *     merely indented;
 *   - and a support that is off says in words what it holds, so nothing disappears silently.
 */

import { attachAccessibleHandler } from '../../utils/event-handlers.js';

// Bundled into the popup stylesheet by Vite; jest maps it to a stub.
import './flat-view.css';

import { renderControls, renderAction, renderedId } from '../registry/control-renderer.js';

/** Class prefix for everything this view builds. */
const CSS = 'assist-flat';

/**
 * How long the field waits, in milliseconds, before it searches what has been typed.
 *
 * A query is only a query once the student has stopped typing. Searching every keystroke looked
 * free and was not: a match needs EVERY word of the query, so a half-typed last word matches
 * nothing, and "i lose my place" passed through "nothing matches" three times on its way to an
 * answer. The list flickered, and the count line is a live region, so a screen reader was read
 * fifteen counts for fifteen letters, most of them wrong and the true one last. Waiting for a
 * pause in the typing says each thing once.
 */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Both wordings the filter button ever shows. It carries both at once — see `buildBar` — so the
 * button cannot change size at the moment it is pressed.
 */
const FILTER_WORDINGS = ['In use only', 'Show all'];

/** Arrow keys, and which way each one moves along a radiogroup. */
const ARROW_STEPS = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/**
 * @param {string} tag
 * @param {string|null} className
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/**
 * Build the view.
 *
 * @param {Object} options
 * @param {Object} options.model - from `createFlatModel`
 * @param {(tool:Object, on:boolean) => void} [options.onToggleTool]
 * @param {(tool:Object) => void} [options.onOpenTool] - a tool whose state is not a switch
 * @param {(tool:Object, control:Object, value:*) => void} [options.onControlChange]
 * @param {(tool:Object, action:Object) => void} [options.onAction]
 * @param {(control:Object) => *} [options.valueOf] - the current value of a control
 * @param {(control:Object) => Array|undefined} [options.optionsFor] - runtime option lists
 * @param {(control:Object) => number[]} [options.presetsFor] - a slider's presets, or none when the
 *   student has hidden them; omitted, every declared preset is drawn
 * @param {(id:string) => {text:string, live:boolean}} [options.statusOf] - what a status line in the
 *   accordion says now, and whether it is announced there
 * @returns {{mount:(root:Element)=>void, refresh:()=>void, destroy:()=>void,
 *   syncTool:(toolId:string)=>void, syncStatus:(id:string)=>void}}
 */
export function createFlatView({
  model,
  onToggleTool,
  onOpenTool,
  onControlChange,
  onAction,
  valueOf,
  optionsFor,
  presetsFor,
  statusOf,
  theme,
} = {}) {
  let root = null;
  let scroll = null;
  /** The bar and the pieces of it that change wording. Built once — see the file header. */
  let bar = null;
  let countNode = null;
  /** What the count line last announced, as sentence and drawn ids — see `syncBar`. */
  let announced = null;
  let filterNode = null;
  let themeGroup = null;
  let searchInput = null;
  let clearButton = null;
  /** The pending debounced search, if the student is still typing. */
  let searchTimer = null;
  let jump = null;
  /** toolId -> the row element currently on screen, so one change can be patched in place. */
  const rows = new Map();

  /**
   * The bar: the search field, then the theme choice and the filter, then the count.
   *
   * Pressing the filter rewrites two pieces of text at once — the count ("All 29 supports" becomes
   * "Showing 4 in use — 25 hidden") and the button's own label. Sized to whatever they currently
   * say, both boxes changed width on the press, the row re-laid itself out sideways, and the
   * longer count wrapped onto a second line and pushed the list down. The student sees the bar
   * jump under the finger that just pressed it.
   *
   * So each of the two carries EVERY wording it can ever show, stacked in one place with only the
   * current one visible. The box is then always the size of its longest wording — measured in real
   * text, in whatever font, at whatever letter and word spacing the student has set (SC 1.4.12),
   * rather than reserved with a pixel guess that would clip the moment the text grew.
   *
   * The count also takes a line of its own beneath the controls rather than sharing one with them:
   * at 340px a sentence that long has to compete with two controls for room, and the room it wins
   * changes with its wording. Given the full width it fits on one line, and if it ever does wrap
   * the bar grows downward instead of squeezing anything.
   */
  function buildBar() {
    const box = el('div', `${CSS}__bar`);

    // First, because it is the first thing a student reaches by tab and the one control in the bar
    // that answers "what do I need?" rather than "what am I already using?".
    box.appendChild(buildSearch());

    const controls = el('div', `${CSS}__bar-controls`);
    if (theme) {
      themeGroup = buildThemeControl();
      controls.appendChild(themeGroup);
    }
    filterNode = buildFilter();
    controls.appendChild(filterNode);
    box.appendChild(controls);

    const countBox = el('div', `${CSS}__countbox`);
    countNode = el('p', `${CSS}__count`);
    countNode.id = renderedId('count');
    // Announced, not merely visible: pressing the filter or typing in the search changes what is on
    // screen, and a student using a screen reader has to hear how much just disappeared. Only this
    // node is announced — the space-holders below sit outside it and are hidden from the tree.
    countNode.setAttribute('role', 'status');
    countNode.setAttribute('aria-live', 'polite');
    countBox.appendChild(countNode);
    box.appendChild(countBox);

    return box;
  }

  /**
   * Hold space for every wording the count can take, so changing which one shows cannot resize the
   * bar — and keep holding the right set: the total changes if the student hides a support in
   * Advanced Options while the popup is open.
   *
   * Rewritten only when the wordings actually differ, so a keystroke does not churn the bar's
   * children for nothing.
   */
  function syncSizers() {
    const box = countNode.parentNode;
    const variants = model.summaryVariants();
    const sizers = [...box.querySelectorAll(`.${CSS}__count-sizer`)];
    if (
      sizers.length === variants.length &&
      sizers.every((node, at) => node.textContent === variants[at])
    ) {
      return;
    }

    sizers.forEach(node => node.remove());
    variants.forEach(wording => {
      const sizer = el('span', `${CSS}__count-sizer`, wording);
      sizer.setAttribute('aria-hidden', 'true');
      box.appendChild(sizer);
    });
  }

  /**
   * The search field: finding a support by the problem rather than by its name.
   *
   * A student who needs help rarely knows what the help is called. "Read Aloud", "Dyslexia Mode" and
   * "Reading Guide" are answers to questions phrased as "read this to me", "the words move" and "I
   * keep losing my place", and `flat-search.js` is what bridges the two, on the device, with no model
   * and no request.
   *
   * The field binds `input` directly rather than going through the shared handler: that helper
   * listens for mousedown and calls preventDefault, which on a text field would stop it taking focus
   * at all. The clear button beside it IS a button, and goes through the handler as every other does.
   */
  function buildSearch() {
    const wrap = el('div', `${CSS}__search`);
    wrap.setAttribute('role', 'search');

    const id = renderedId('search');
    // A real label, hidden from the eye only. The placeholder says the same words, but a placeholder
    // is not a name: it disappears the moment the student types, and it is not reliably announced.
    const label = el('label', 'sr-only', 'Search supports');
    label.setAttribute('for', id);
    wrap.appendChild(label);

    searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.id = id;
    searchInput.className = `${CSS}__search-input`;
    // The example is the instruction. "Search supports" alone invites a product name, which is the
    // one thing the student does not have.
    searchInput.placeholder = 'Search supports — try “read to me”';
    // Nothing typed here is worth remembering, and an autofill list would cover the very list the
    // field is narrowing in a 340px popup.
    searchInput.setAttribute('autocomplete', 'off');
    searchInput.setAttribute('aria-describedby', renderedId('count'));
    searchInput.value = model.query();

    searchInput.addEventListener('input', () => {
      // The clear button belongs to the field, not to the results: it has to appear with the first
      // letter. Nothing else here is cheap or quiet enough to run per keystroke.
      clearButton.hidden = searchInput.value === '';
      cancelPendingSearch();
      searchTimer = setTimeout(applyQuery, SEARCH_DEBOUNCE_MS);
    });

    searchInput.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || searchInput.value === '') {
        // Escape closes the Chrome popup. With nothing to clear, the press belongs to the popup, and
        // swallowing it would leave the student in a window they cannot dismiss.
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      clearSearch();
    });

    wrap.appendChild(searchInput);

    clearButton = el('button', `${CSS}__search-clear`, '×');
    clearButton.type = 'button';
    // The glyph is decoration; this is the whole accessible name. A screen reader reading "×" says
    // "times", which tells a student nothing.
    clearButton.setAttribute('aria-label', 'Clear search');
    attachAccessibleHandler(clearButton, 'Flat search clear', clearSearch, {
      enableVisualFeedback: false,
    });
    wrap.appendChild(clearButton);

    return wrap;
  }

  /** Drop a search the student has typed past, so it cannot land after a later one. */
  function cancelPendingSearch() {
    if (searchTimer !== null) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
  }

  /** Search what is in the field now. The one place a typed query reaches the model. */
  function applyQuery() {
    searchTimer = null;
    if (!root) {
      return;
    }
    model.setQuery(searchInput.value);
    syncBar();
    renderList();
  }

  /** Empty the field, put the list back, and leave the student in the field ready to try again. */
  function clearSearch() {
    // Clearing is not typing: it is a deliberate press, and a search still waiting to run would
    // otherwise fire a moment later and narrow the list the student just asked to see in full.
    cancelPendingSearch();
    searchInput.value = '';
    model.setQuery('');
    syncBar();
    renderList();
    searchInput.focus();
  }

  /** The filter button, carrying both of its wordings so that pressing it cannot resize it. */
  function buildFilter() {
    const filter = el('button', `${CSS}__filter`);
    filter.type = 'button';

    const stack = el('span', `${CSS}__filter-stack`);
    // Both wordings, always; which of them shows is `syncBar`'s business, so the state lives in one
    // place rather than being decided once here and again on every press.
    FILTER_WORDINGS.forEach(wording =>
      stack.appendChild(el('span', `${CSS}__filter-text`, wording))
    );
    filter.appendChild(stack);

    // No hover scaling: an 11px pill that grows under the pointer nudges the row it sits in, which
    // is the thing this whole arrangement exists to stop.
    attachAccessibleHandler(
      filter,
      'Flat filter',
      () => {
        model.toggleFilter();
        syncBar();
        renderList();
        // Keep the student where they were: the filter is where they just pressed.
        filter.focus();
      },
      { enableVisualFeedback: false }
    );

    return filter;
  }

  /**
   * Bring the bar's wording into line with the model, in place.
   *
   * In place because the bar holds the search field. Every sentence here has its space already
   * reserved by the space-holders beside it, so none of this can change the bar's size.
   */
  function syncBar() {
    // Announce when the RESULT changed, not when the sentence did. Two things are true at once here.
    // Assigning textContent replaces the text node even when the string is identical, and a live
    // region speaks a mutation rather than a difference, so writing unconditionally re-read a count
    // that had not moved on every switch press. But the sentence under a query is only a number:
    // "too bright" and "karaoke" both answer "1 support matches" while showing different supports,
    // and guarding on the sentence alone left that student in silence. So the guard remembers what
    // was drawn beside what was said.
    const summary = model.summary();
    const drawn = model
      .visibleRows()
      .map(row => row.tool.id)
      .join(',');
    if (announced !== `${summary}|${drawn}`) {
      announced = `${summary}|${drawn}`;
      countNode.textContent = summary;
    }
    syncSizers();
    clearButton.hidden = searchInput.value === '';

    // The name says what pressing it will do, not what state it is in — and it is the button's whole
    // accessible name, so the wording inside is presentation.
    filterNode.setAttribute('aria-pressed', String(model.isFiltering()));
    filterNode.setAttribute('aria-label', model.filterLabel());
    const shown = model.isFiltering() ? 'Show all' : 'In use only';
    filterNode.querySelectorAll(`.${CSS}__filter-text`).forEach(text => {
      const visible = text.textContent === shown;
      text.classList.toggle(`${CSS}__filter-text--sizer`, !visible);
      if (visible) {
        text.removeAttribute('aria-hidden');
      } else {
        text.setAttribute('aria-hidden', 'true');
      }
    });

    if (themeGroup) {
      markTheme();
    }
  }

  /**
   * Mark the chosen theme option and move the radiogroup's single tab stop to it.
   *
   * Takes the value rather than always asking `theme.current()`, so a press marks what the student
   * just chose without depending on `theme.set` having finished storing it.
   *
   * @param {string} [chosen]
   */
  function markTheme(chosen = theme.current()) {
    themeGroup.querySelectorAll('[data-theme-choice]').forEach(button => {
      const on = button.dataset.themeChoice === chosen;
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on ? 0 : -1;
    });
  }

  /**
   * Light or Dark, in the popup itself rather than three levels down in Advanced Options.
   *
   * Two states, both of them explicit: `theme.js` has no "follow the system" state to offer, so
   * what is chosen is exactly what is shown. Still a radiogroup rather than a single switch —
   * a switch would have to be named for one of the two and would read as "Dark, off" where a
   * radiogroup reads as "Light, selected, one of two".
   *
   * That shape carries an obligation: a radiogroup is ONE tab stop, so the option not currently
   * chosen is deliberately not tabbable, and without the arrow keys there would be no way to reach
   * it from the keyboard at all. Arrows move and choose, as they do in every other radiogroup.
   */
  function buildThemeControl() {
    const group = el('div', `${CSS}__theme`);
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Popup theme');

    /** Adopt one option: tell the popup, move the marking, and move the single tab stop with it. */
    function choose(value) {
      theme.set(value);
      markTheme(value);
      const chosen = group.querySelector(`[data-theme-choice="${value}"]`);
      if (chosen) {
        chosen.focus();
      }
    }

    theme.choices.forEach(choice => {
      const button = el('button', `${CSS}__theme-btn`, choice.label);
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.dataset.themeChoice = choice.value;
      // Which one is checked, and which one carries the tab stop, is `markTheme`'s business — one
      // function for it, so a freshly drawn group and a pressed one cannot disagree.

      // Accessible, not merely interactive: the shared handler listens for mousedown alone, which
      // would leave this reachable by pointer only. No hover scaling — these are 11px pills sitting
      // against the filter, and growing one of them nudges the row.
      attachAccessibleHandler(button, `Theme: ${choice.label}`, () => choose(choice.value), {
        enableVisualFeedback: false,
      });

      group.appendChild(button);
    });

    group.addEventListener('keydown', event => {
      const step = ARROW_STEPS[event.key];
      if (!step) {
        return;
      }
      event.preventDefault();
      const values = theme.choices.map(choice => choice.value);
      const at = values.indexOf(theme.current());
      choose(values[(Math.max(at, 0) + step + values.length) % values.length]);
    });

    return group;
  }

  /** The horizontal strip of group jumps. Only groups with something in them appear. */
  function buildJumpStrip(groups) {
    const strip = el('div', `${CSS}__jump`);
    strip.setAttribute('role', 'group');
    strip.setAttribute('aria-label', 'Jump to a group');

    groups.forEach(group => {
      const button = el('button', `${CSS}__jump-btn`, group);
      button.type = 'button';
      attachAccessibleHandler(button, `Jump to ${group}`, () => {
        const heading = scroll.querySelector(`[data-group="${group}"]`);
        if (!heading) {
          return;
        }
        heading.scrollIntoView({
          block: 'start',
          // Honour a student who has asked the system for less movement.
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        });
        // Scrolling alone moves the eye but not the keyboard. Make the heading the next tab stop.
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      });
      strip.appendChild(button);
    });

    return strip;
  }

  /**
   * What a switched-off support is holding out of sight, in words, or null when it holds nothing.
   *
   * Nesting Highlight While Reading and Word by Word inside Read Aloud takes them off the screen
   * whenever Read Aloud is off, and a support a student cannot see is a support they will not
   * know exists. This line is what that costs — one sentence, on the row that holds them, said in
   * text rather than by an indent or a colour nobody can hear.
   *
   * @param {{tool:Object, on:boolean}} row
   * @returns {string|null}
   */
  function heldNote({ tool, on }) {
    const held = on ? [] : model.childNamesOf(tool.id);
    return held.length ? `Switch on for ${held.join(' and ')}` : null;
  }

  /**
   * Bring a row's "Switch on for …" line into step with its state, in place.
   *
   * In place because the row carries the switch the student has their finger on. Rebuilding the
   * row to change one sentence would take that switch out of the document underneath them.
   *
   * The switch points at the line while there is one, so a student tabbing from switch to switch
   * hears it. Left to the row's text alone it would only reach someone reading the popup rather
   * than working through its controls — which is exactly the student who would never find out
   * that two supports exist.
   *
   * @param {{tool:Object, on:boolean}} row
   * @param {Element} node
   */
  function syncHolds(row, node) {
    const naming = node.querySelector(`.${CSS}__naming`);
    if (!naming) {
      return;
    }
    // Built by the same helper as every other id Flat draws: a hand-written `flat-` here would be
    // a second copy of the convention, free to drift from the one the renderer holds.
    const id = renderedId(`${row.tool.id}-holds`);
    const existing = naming.querySelector(`.${CSS}__holds`);
    const input = node.querySelector('input[role="switch"]');
    const note = heldNote(row);

    if (!note) {
      if (existing) {
        existing.remove();
      }
      // Never leave the switch pointing at an id that is no longer in the document.
      if (input) {
        input.removeAttribute('aria-describedby');
      }
      return;
    }

    if (existing) {
      existing.textContent = note;
    } else {
      const line = el('span', `${CSS}__holds`, note);
      line.id = id;
      naming.appendChild(line);
    }
    if (input) {
      input.setAttribute('aria-describedby', id);
    }
  }

  /**
   * A tool's current state said in words, from the values it declares.
   *
   * @param {Object} tool
   * @param {*} value
   * @returns {string}
   */
  function stateInWords(tool, value) {
    const mode = (tool.modes || []).find(choice => String(choice.value) === String(value));
    return mode ? mode.label : String(value === undefined || value === null ? '' : value);
  }

  /**
   * The control for a support that is not a yes-or-no.
   *
   * AI Assist has four states, not two, and no checkbox anywhere in the popup — its state is the
   * `aiMode` key. Drawn as a switch it slid across under the finger and changed nothing at all, a
   * control that lies about both what it is and what it did. So it is a button: it says which mode
   * is in use, in the same words the popup uses for it, and pressing it opens the place that mode
   * is chosen — the setup wizard while nothing has been set up, the AI settings once it has.
   *
   * @param {FlatRow} row
   * @returns {HTMLElement}
   */
  function buildStateButton(row) {
    const { tool, value } = row;
    const words = stateInWords(tool, value);
    const button = el('button', `${CSS}__state`, words);
    button.type = 'button';
    // The name says what pressing it does AND where the student is now; the visible text alone
    // would read as a label rather than a control.
    button.setAttribute('aria-label', `${tool.name}: ${words}. Choose how ${tool.name} works`);
    attachAccessibleHandler(button, `Open ${tool.name}`, () => {
      if (onOpenTool) {
        onOpenTool(tool);
      }
    });
    return button;
  }

  /**
   * Bring a drawn status line into line with the words the accordion holds for it.
   *
   * A live line is never hidden, only emptied: a live region that is out of the tree when its words
   * arrive is not reliably announced, and an empty one in a column takes no room. A line that is
   * not live is hidden while it has nothing to say.
   *
   * @param {HTMLElement} node
   * @param {string} id - the accordion element the line mirrors
   */
  function paintStatus(node, id) {
    const { text = '', live = false } = (statusOf && statusOf(id)) || {};
    node.textContent = text;
    node.hidden = !live && text === '';
  }

  /**
   * A copy of a status line the accordion writes, announced the way the original is.
   *
   * @param {{id:string}} line
   * @returns {HTMLElement}
   */
  function buildStatusLine(line) {
    const node = el('p', `${CSS}__status`);
    node.id = renderedId(line.id);
    node.dataset.mirrors = line.id;
    if (statusOf && statusOf(line.id)?.live) {
      node.setAttribute('role', 'status');
    }
    paintStatus(node, line.id);
    return node;
  }

  /**
   * Redraw the words of every copy of one status line, in place.
   * @param {string} id - the accordion element the line mirrors
   */
  function syncStatus(id) {
    if (!root) {
      return;
    }
    root.querySelectorAll(`[data-mirrors="${id}"]`).forEach(node => paintStatus(node, id));
  }

  /** One support's row: what it is, and its switch. The same row nested or at the top level. */
  function buildRow(row) {
    const { tool, on } = row;
    const line = el('div', `${CSS}__row`);
    line.dataset.tool = tool.id;

    line.appendChild(el('span', `${CSS}__icon`, tool.icon));

    const naming = el('span', `${CSS}__naming`);
    const nameLine = el('span', `${CSS}__nameline`);
    nameLine.appendChild(el('span', `${CSS}__name`, tool.name));
    if (tool.beta) {
      // The word itself, beside the name — never a colour or an icon on its own, which a student
      // who cannot see it, or cannot tell the colours apart, would never receive (SC 1.4.1). It
      // marks the support; it does not gate it, and the switch below behaves as any other.
      nameLine.appendChild(el('span', `${CSS}__beta`, 'Beta'));
    }
    naming.appendChild(nameLine);
    naming.appendChild(el('span', `${CSS}__desc`, tool.description));
    // On the row rather than under the settings, so it is there whether the support is on or off:
    // "movement stays reduced even with this off" is said precisely when it is off.
    (tool.statusLines || [])
      .filter(status => !status.after)
      .forEach(status => naming.appendChild(buildStatusLine(status)));
    line.appendChild(naming);

    if (tool.actionOnly) {
      // Nothing to switch: the tool IS its action.
      const action = tool.actions[0];
      line.appendChild(
        renderAction(tool, action, () => {
          if (onAction) {
            onAction(tool, action);
          }
        })
      );
    } else if (!tool.toggleId) {
      // State, but no checkbox to carry it. Never a switch — see buildStateButton.
      line.appendChild(buildStateButton(row));
    } else {
      const box = el('div', `${CSS}__switch`);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = renderedId(tool.id);
      input.setAttribute('role', 'switch');
      input.checked = on;
      input.setAttribute('aria-checked', String(on));
      input.setAttribute('aria-label', tool.name);
      // Checkboxes take `change`; the shared mousedown handler calls preventDefault and would stop
      // the switch flipping at all.
      input.addEventListener('change', event => {
        input.setAttribute('aria-checked', String(event.target.checked));
        if (onToggleTool) {
          onToggleTool(tool, event.target.checked);
        }
      });
      box.appendChild(input);
      box.appendChild(el('span', `${CSS}__slider`));
      line.appendChild(box);
    }

    // Last, once there is a switch for it to point at. One function draws this line and one keeps
    // it in step, so a freshly drawn row and a patched one cannot say different things.
    syncHolds(row, line);

    return line;
  }

  /**
   * Draw one support's row into a container, and its settings under it while it is on.
   *
   * Top-level rows and nested rows go through this same function, which is the point: a support
   * inside Read Aloud gets its own switch, its own settings directly beneath it and its own entry
   * in `rows` exactly as a support at the top level does.
   *
   * @param {Object} row - a row from the model
   * @param {Element} into
   */
  function placeRow(row, into) {
    const node = buildRow(row);
    rows.set(row.tool.id, node);
    into.appendChild(node);

    // A support drawn with a state button has already got its way in, on the row itself. Drawing
    // its actions again underneath would be a second route to the same screen, differing only in
    // which of them the popup is currently showing.
    if (!row.on || (!row.tool.actionOnly && !row.tool.toggleId)) {
      return;
    }
    const settings = buildSettings(row.tool);
    if (settings) {
      settings.dataset.settingsFor = row.tool.id;
      into.appendChild(settings);
    }
  }

  /**
   * A switched-on support's settings, indented under its own row — and, after them, the supports
   * that live inside it.
   *
   * Putting the dependents in here rather than beside the parent is what makes them appear and
   * disappear with it: the parent going off removes this one block, and everything it holds goes
   * with it in one step, with no second rule to keep in sync.
   */
  function buildSettings(tool) {
    const nodes = renderControls(
      tool,
      control => ({
        value: valueOf ? valueOf(control) : control.default,
        options: optionsFor ? optionsFor(control) : undefined,
        presets: control.presets && (presetsFor ? presetsFor(control) : control.presets),
        // A radio group reports through the handler of its first member, so it also passes back
        // the option the student actually chose. Everything else reports as itself.
        onChange: (value, chosen) => {
          if (onControlChange) {
            onControlChange(tool, chosen || control, value);
          }
        },
      }),
      { surface: 'popup' }
    );

    const actions = (tool.actions || []).filter(action => (action.surface || 'popup') === 'popup');
    const children = model.childRowsOf(tool.id);
    if (nodes.length === 0 && actions.length === 0 && children.length === 0) {
      return null;
    }

    const wrap = el('div', `${CSS}__settings`);
    wrap.setAttribute('aria-label', `${tool.name} settings`);
    nodes.forEach(node => wrap.appendChild(node));

    // A line that explains one control sits straight after it, and the control points at it, so
    // "2.0× (high)" is heard with the zoom slider rather than somewhere below.
    (tool.statusLines || [])
      .filter(status => status.after)
      .forEach(status => {
        const control = wrap.querySelector(`[id="${renderedId(status.after)}"]`);
        if (!control) {
          return;
        }
        const line = buildStatusLine(status);
        (control.closest('.assist-reg-control') || control).after(line);
        control.setAttribute('aria-describedby', line.id);
      });

    if (actions.length) {
      const strip = el('div', `${CSS}__actions`);
      actions.forEach(action =>
        strip.appendChild(
          renderAction(tool, action, () => {
            if (onAction) {
              onAction(tool, action);
            }
          })
        )
      );
      wrap.appendChild(strip);
    }

    if (children.length) {
      // Last, so the tab order reads: the parent's switch, the parent's own settings, then the
      // supports inside it, then whatever comes next at the top level.
      const nested = el('div', `${CSS}__nested`);
      // Announced as a group named after the support that holds it, so a screen reader hears
      // "Read Aloud options" on the way in rather than meeting two unexplained switches. The
      // indent alone says this to the eye and to nothing else.
      nested.setAttribute('role', 'group');
      nested.setAttribute('aria-label', `${tool.name} options`);
      nested.dataset.nestedUnder = tool.id;
      children.forEach(child => placeRow(child, nested));
      wrap.appendChild(nested);
    }

    return wrap;
  }

  /**
   * Bring one support's row into line after it has been switched, without redrawing the view.
   *
   * Redrawing would replace the very control the student just touched: their finger is on it,
   * their focus is in it, and the scroll position moves under them. So the switch stays exactly
   * where it is, and only what follows from the change is patched: the block beneath it appears
   * or disappears, carrying the support's settings and the supports nested inside it together.
   *
   * The row is never rebuilt, only amended: it carries the switch the student is still touching,
   * and replacing it would drop their focus to the top of the popup.
   *
   * @param {string} toolId
   */
  function syncTool(toolId) {
    if (!scroll) {
      return;
    }
    const row = model.allRows().find(entry => entry.tool.id === toolId);
    const node = rows.get(toolId);
    if (!row || !node) {
      return;
    }

    const existing = scroll.querySelector(`[data-settings-for="${toolId}"]`);
    if (row.on && !existing && (row.tool.actionOnly || row.tool.toggleId)) {
      const settings = buildSettings(row.tool);
      if (settings) {
        settings.dataset.settingsFor = toolId;
        node.after(settings);
      }
    } else if (!row.on && existing) {
      // Everything nested inside goes with the block. Forget those rows first: they are about to
      // leave the document, and a stale entry here would have a later change patch a detached node.
      model
        .allRows()
        .filter(entry => entry.tool.dependsOn === toolId)
        .forEach(entry => rows.delete(entry.tool.id));
      existing.remove();
    }

    // Switched off, the row is now holding supports out of sight and has to say which.
    syncHolds(row, node);

    // The count can have changed: under a query, the rows a support holds inside it only become
    // drawable once it is switched on, and the count line is the field's own description as well as
    // the only live region. Leaving it behind would announce a number the list contradicts.
    syncBar();
  }

  /**
   * Draw the jump strip and the list, leaving the bar exactly as it is.
   *
   * This is what a keystroke in the search field runs. Rebuilding the bar instead would take the
   * input the student is typing into out of the document, dropping focus to the body and the caret
   * with it — so the two halves of the view are drawn by two functions, and this one never touches
   * the other's.
   */
  function renderList() {
    if (!root) {
      return;
    }
    rows.clear();
    if (jump) {
      jump.remove();
      jump = null;
    }
    if (scroll) {
      scroll.remove();
      scroll = null;
    }

    const groups = model.liveGroups();
    if (groups.length) {
      jump = buildJumpStrip(groups);
      root.appendChild(jump);
    }

    scroll = el('div', `${CSS}__scroll`);

    if (!groups.length) {
      scroll.appendChild(el('p', `${CSS}__empty`, model.emptyMessage()));
    }

    groups.forEach(group => {
      const heading = el('h2', `${CSS}__group`, group);
      heading.dataset.group = group;
      scroll.appendChild(heading);

      // Top-level rows only. A support that lives inside another arrives through `placeRow` when
      // that one's settings block is built, so it is never drawn twice and never drawn alone.
      model.rowsInGroup(group).forEach(row => placeRow(row, scroll));
    });

    root.appendChild(scroll);
  }

  /** Draw everything: the bar if it is not there yet, its wording, then the list. */
  function render() {
    if (!root) {
      return;
    }
    if (!bar) {
      bar = buildBar();
      root.appendChild(bar);
    }
    syncBar();
    renderList();
  }

  return {
    /** Patch one support's row after it has been switched, leaving the rest of the view alone. */
    syncTool,

    /** Redraw one status line's words wherever Flat shows it. */
    syncStatus,

    /**
     * Draw into a container. The container is emptied first — Flat owns it.
     * @param {Element} container
     */
    mount(container) {
      root = container;
      root.textContent = '';
      root.classList.add(`${CSS}`);
      // A fresh bar means a fresh, empty count line: nothing has been announced into it yet.
      announced = null;
      bar = null;
      jump = null;
      scroll = null;
      render();
    },

    /**
     * Redraw from the model's current state, after a setting changed somewhere else.
     *
     * The bar survives it, so a student part-way through typing keeps their field, their text and
     * their caret while the list beneath updates.
     */
    refresh: render,

    /** Give the container back. */
    destroy() {
      if (root) {
        cancelPendingSearch();
        root.textContent = '';
        root.classList.remove(`${CSS}`);
        root = null;
        bar = null;
        countNode = null;
        announced = null;
        filterNode = null;
        themeGroup = null;
        searchInput = null;
        clearButton = null;
        jump = null;
        scroll = null;
      }
    },
  };
}
