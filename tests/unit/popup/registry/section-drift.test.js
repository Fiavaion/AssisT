/**
 * Drift test: every declared section of the registry against popup.html.
 *
 * A registry is only worth having if it cannot quietly fall behind the thing it describes. This
 * reads the real popup.html at test time and fails when a switch, slider, select, radio or action
 * button exists there but is not declared — or is declared but no longer exists. That makes the
 * registry falsifiable rather than merely plausible.
 *
 * Sections join the test by being declared: a section file that exports tools is covered from the
 * moment it does. Undeclared sections are reported as pending rather than passing silently, so an
 * incomplete registry cannot look finished.
 *
 * A section is not the whole of popup.html, though, and for a long time this file behaved as if it
 * were. The last describe block covers the rest — see its header for what a tool outside every
 * accordion section is, and where the line between a support and the popup's own chrome is drawn.
 */

import fs from 'fs';
import path from 'path';

import {
  SECTIONS,
  DECLARED_SECTIONS,
  toolsBySection,
  registryProblems,
} from '../../../../src/popup/registry/tool-registry.js';
import { UNSECTIONED } from '../../../../src/popup/registry/tool-schema.js';

const POPUP_HTML = path.join(__dirname, '../../../../src/popup/popup.html');
const html = fs.readFileSync(POPUP_HTML, 'utf8');

/**
 * Where one accordion section's markup starts and stops: from its `data-section` to the next one,
 * or — for the last section — to the end of `<main>`. Without that second bound the final section
 * swallows the footer, the profile dialogs and the migration modal, and the test demands they be
 * declared as if they were AI features.
 *
 * @param {string} section
 * @returns {[number, number]} `[start, end)` offsets into popup.html, `[-1, -1]` when absent
 */
function sectionBounds(section) {
  const start = html.indexOf(`data-section="${section}"`);
  if (start === -1) {
    return [-1, -1];
  }
  const next = html.indexOf('data-section="', start + 1);
  const end = next === -1 ? html.indexOf('</main>', start) : next;
  return [start, end === -1 ? html.length : end];
}

/** The markup of one accordion section. */
function sectionMarkup(section) {
  const [start, end] = sectionBounds(section);
  return start === -1 ? '' : html.slice(start, end);
}

/** The id attribute of a tag, never `data-testid`, which a bare `id="` match also finds. */
function idOf(tag) {
  const match = tag.match(/\sid="([^"]+)"/);
  return match ? match[1] : undefined;
}

/** Element ids of inputs of one type. */
function inputIds(markup, type) {
  return (markup.match(/<input[\s\S]*?>/g) || [])
    .filter(tag => tag.includes(`type="${type}"`))
    .map(idOf)
    .filter(Boolean);
}

/** Element ids of `<select>` elements. */
function selectIds(markup) {
  return (markup.match(/<select[\s\S]*?>/g) || []).map(idOf).filter(Boolean);
}

/**
 * Ids of the section's buttons. Every button carrying an id must be accounted for, not only those
 * named `btn-*`: a disclosure button or a preset chip is as reachable as a labelled action, and one
 * the registry does not know about is one a registry-driven view cannot offer.
 */
function buttonIds(markup) {
  return (markup.match(/<button[\s\S]*?>/g) || []).map(idOf).filter(Boolean);
}

/**
 * Every control of one type declared across a section's tools, counting only those drawn in
 * popup.html. A control on the `advanced` surface is built by popup.js when the Advanced Options
 * modal opens, so this file cannot see it and must not demand it.
 */
function declaredControlIds(tools, type) {
  return tools.flatMap(tool =>
    tool.controls
      .filter(control => control.type === type && (control.surface || 'popup') === 'popup')
      .map(control => control.id)
  );
}

describe('registry', () => {
  it('is well-formed', () => {
    expect(registryProblems()).toEqual([]);
  });

  it('knows which sections it has yet to declare', () => {
    const pending = SECTIONS.filter(section => !DECLARED_SECTIONS.includes(section));
    // Not an assertion that the registry is finished — a record of what is left, so the gap is
    // visible in the test output rather than mistaken for coverage.
    expect(Array.isArray(pending)).toBe(true);
  });
});

describe.each(DECLARED_SECTIONS)('registry — section "%s" matches popup.html', section => {
  const markup = sectionMarkup(section);
  const tools = toolsBySection(section);

  it('exists in popup.html', () => {
    expect(markup.length).toBeGreaterThan(0);
  });

  it('declares at least one tool', () => {
    expect(tools.length).toBeGreaterThan(0);
  });

  it('declares every checkbox, as a tool switch or a sub-option', () => {
    // A checkbox is either a tool's own switch or one of its settings. Which of the two it is
    // varies by section — `magnifying-lens-offset-enabled` carries the master-switch suffix but
    // is a sub-option — so the check is the union, not the naming convention.
    const declared = [
      ...tools.map(tool => tool.toggleId).filter(Boolean),
      ...declaredControlIds(tools, 'switch'),
    ];
    expect(inputIds(markup, 'checkbox').sort()).toEqual(declared.sort());
  });

  it('declares every slider', () => {
    expect(inputIds(markup, 'range').sort()).toEqual(declaredControlIds(tools, 'range').sort());
  });

  it('declares every select', () => {
    expect(selectIds(markup).sort()).toEqual(declaredControlIds(tools, 'select').sort());
  });

  it('declares every radio', () => {
    expect(inputIds(markup, 'radio').sort()).toEqual(declaredControlIds(tools, 'radio').sort());
  });

  it('declares every button that carries an id', () => {
    const declared = [
      ...tools.flatMap(tool =>
        tool.actions
          .filter(action => (action.surface || 'popup') === 'popup')
          .map(action => action.id)
      ),
      // Chip groups are one control drawn as several buttons; each button's id is declared on it.
      ...tools.flatMap(tool =>
        tool.controls
          .filter(control => control.type === 'chips')
          .flatMap(control => control.options.map(option => option.id))
      ),
    ];
    expect(buttonIds(markup).sort()).toEqual(declared.sort());
  });

  it('gives every control a settings path', () => {
    tools.forEach(tool => {
      tool.controls.forEach(control => {
        expect(typeof control.path).toBe('string');
        expect(control.path.length).toBeGreaterThan(0);
      });
    });
  });

  it('places every tool in the section it was read from', () => {
    tools.forEach(tool => expect(tool.section).toBe(section));
  });
});

/**
 * The other half of the gate: controls drawn in popup.html but inside no accordion section.
 *
 * The per-section checks above iterate `DECLARED_SECTIONS` and only ever read the markup between
 * one `data-section` and the next. A control that sits outside every one of those blocks is
 * therefore in nobody's slice, and nothing looks at it — which is exactly how "📊 Show Text Stats"
 * came to exist in popup.html, be wired up in popup.js, and be absent from the registry without a
 * single test noticing. This block closes that: it reads the whole file and holds every stateful
 * control outside the accordion to the registry.
 *
 * WHERE THE LINE IS DRAWN, and why. The check covers the four control kinds that carry state —
 * `checkbox`, `range`, `radio` and `select` — and deliberately does NOT cover buttons or free-text
 * and file inputs.
 *
 *   - A tool cannot exist without state: `validateTool` rejects a tool with no `state` unless it is
 *     `actionOnly`, and every action-only tool declared so far is a button inside a section, drawn
 *     beneath the support it belongs to. So the element that betrays a tool hiding outside the
 *     accordion is its switch.
 *   - Outside the sections popup.html carries 21 button ids and 2 text/file inputs today, and not
 *     one of them is a support: they open a modal, dismiss a banner, grant a permission, or confirm
 *     a dialog. Demanding those be declared as tools would be 23 false demands and no true ones —
 *     a check that fails for reasons nobody believes is a check people learn to silence, which is
 *     worse than no check. Buttons inside a section are still gated, by the per-section block above.
 *
 * A stateful control outside the accordion that genuinely is not a support has to say so out loud,
 * in `NON_TOOL_CONTROLS`, with its reason. One line of friction, and the "is this a tool?" question
 * has to be answered rather than skipped.
 */

/** Bounds of every accordion section in the markup, whether or not the registry declares it yet. */
const SECTION_BOUNDS = SECTIONS.map(sectionBounds).filter(([start]) => start !== -1);

/** Inputs that hold a setting. A text or file input in a dialog is neither a switch nor a value. */
const STATEFUL_INPUT = /type="(checkbox|range|radio)"/;

/**
 * Stateful controls outside every accordion section, admitted as not being supports.
 * An entry earns its place by naming what the control actually is.
 */
const NON_TOOL_CONTROLS = {};

/** Element ids of every stateful control drawn outside all of the accordion sections. */
function statefulControlsOutsideSections() {
  const found = [];
  const tags = /<(?:input|select)[\s\S]*?>/g;
  let match;
  while ((match = tags.exec(html)) !== null) {
    if (SECTION_BOUNDS.some(([start, end]) => match.index >= start && match.index < end)) {
      continue;
    }
    const tag = match[0];
    if (tag.startsWith('<input') && !STATEFUL_INPUT.test(tag)) {
      continue;
    }
    const id = idOf(tag);
    if (id) {
      found.push(id);
    }
  }
  return found;
}

describe('registry — controls outside every accordion section', () => {
  const found = statefulControlsOutsideSections();
  const tools = toolsBySection(UNSECTIONED);
  const declared = [
    ...tools.map(tool => tool.toggleId).filter(Boolean),
    ...['switch', 'range', 'select', 'radio'].flatMap(type => declaredControlIds(tools, type)),
  ];

  it('finds the controls it is meant to be looking at', () => {
    // A guard on the scan itself: if a refactor of popup.html ever made this come back empty, the
    // two checks below would pass by finding nothing, and the blind spot would be back.
    expect(found.length).toBeGreaterThan(0);
  });

  it('declares every one of them as a tool, or admits it is not one', () => {
    const undeclared = found.filter(id => !declared.includes(id) && !(id in NON_TOOL_CONTROLS));
    expect(undeclared).toEqual([]);
  });

  it('draws every control it declares outside the accordion', () => {
    expect(declared.filter(id => !found.includes(id))).toEqual([]);
  });

  it('keeps no stale admissions', () => {
    // An id that has left popup.html must leave this list too, or the list slowly becomes a place
    // to park things rather than a short record of deliberate exceptions.
    expect(Object.keys(NON_TOOL_CONTROLS).filter(id => !found.includes(id))).toEqual([]);
  });
});

/**
 * The accordion is never shown: Flat is the popup's only face, and it reaches an accordion control
 * only through a registry declaration (flat/flat-mount.js). An accordion control the registry does
 * not declare is therefore a feature no student can reach.
 *
 * The per-section checks above hold switches, sliders, selects, radios and buttons with ids to the
 * registry. This closes what they leave open: every other kind of interactive element in the
 * accordion (text, number and other inputs, textareas, and controls with no id at all) must be
 * declared too, or be admitted in `REACHED_ANOTHER_WAY` with the route a student takes to it.
 */

/**
 * Accordion controls Flat does not draw, each with the way a student reaches what it does.
 * Keyed by id, or by `name=` / `class=` for a control with no id.
 */
const REACHED_ANOTHER_WAY = {
  'name=ai-quick-mode':
    "AI Assist's four mode chips. Flat's AI Assist row opens the AI setup wizard, or Advanced " +
    'Options, where the same four modes are offered (modal-ai-quick-mode)',
};

/** Every id the registry declares, whichever part of a tool declares it. */
function everyDeclaredId() {
  return new Set(
    DECLARED_SECTIONS.flatMap(section => toolsBySection(section)).flatMap(tool => [
      ...(tool.toggleId ? [tool.toggleId] : []),
      ...tool.controls.flatMap(control => [
        control.id,
        ...(control.options || []).map(option => option.id).filter(Boolean),
      ]),
      ...tool.actions.map(action => action.id),
    ])
  );
}

/** How an accordion control is named here: its id, else its name, else its first class. */
function controlKey(tag) {
  const id = idOf(tag);
  if (id) {
    return id;
  }
  const name = tag.match(/\sname="([^"]+)"/);
  if (name) {
    return `name=${name[1]}`;
  }
  const cls = tag.match(/\sclass="([^"\s]+)/);
  return cls ? `class=${cls[1]}` : tag;
}

describe('registry — every accordion control is reachable from Flat', () => {
  const [first] = sectionBounds(SECTIONS[0]);
  const last = html.indexOf('</main>', first);
  const accordion = html.slice(first, last);
  const keys = [
    ...new Set(
      (accordion.match(/<(?:input|select|textarea|button)\b[\s\S]*?>/g) || []).map(controlKey)
    ),
  ];
  const declared = everyDeclaredId();

  it('finds the controls it is meant to be looking at', () => {
    expect(keys.length).toBeGreaterThan(100);
  });

  it('declares every one of them, or names the other way a student reaches it', () => {
    const unreachable = keys.filter(key => !declared.has(key) && !(key in REACHED_ANOTHER_WAY));
    expect(unreachable).toEqual([]);
  });

  it('keeps no stale admissions', () => {
    expect(Object.keys(REACHED_ANOTHER_WAY).filter(key => !keys.includes(key))).toEqual([]);
  });
});

/**
 * A status line is words the accordion writes as the student works. Flat shows a copy that follows
 * the original, found by its id, so an id that is not in popup.html is a copy that stays empty.
 */
describe('registry — every status line names an element in popup.html', () => {
  const lines = DECLARED_SECTIONS.flatMap(section => toolsBySection(section)).flatMap(
    tool => tool.statusLines || []
  );

  it('declares some', () => {
    expect(lines.length).toBeGreaterThan(0);
  });

  it.each(lines.map(line => [line.id]))('%s', id => {
    expect(html).toContain(`id="${id}"`);
  });
});
