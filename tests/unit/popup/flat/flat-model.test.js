/**
 * Tests for the Flat view's logic.
 *
 * The behaviours that came out of using the prototype are the ones most easily lost in a rewrite, so
 * each has a test that fails if it is: the filter is a snapshot, the count is always available, a
 * group with nothing in it offers no jump, and the search — unlike the filter — is live.
 */

import { createFlatModel } from '../../../../src/popup/flat/flat-model.js';
import { toolById } from '../../../../src/popup/registry/tool-registry.js';
import { COMPANION_FEATURES } from '../../../../src/features/companion/companion-settings.js';

/**
 * Eight supports are on out of the box — highlighting, OCR, Look Up Words, Citations, Mind Map and
 * the three LMS integrations — so a test that wants a known set has to switch the rest off rather
 * than start from an empty settings object.
 */
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

/** Settings in which exactly these supports are on. */
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

/** Settings and local keys in which exactly these supports are on. */
const stateWith = ids => ({ settings: settingsWith(ids), local: COMPANION_OFF });

describe('createFlatModel — what it shows', () => {
  it('shows every visible support when not filtering', () => {
    const model = createFlatModel({ settings: {} });
    expect(model.isFiltering()).toBe(false);
    expect(model.visibleRows()).toHaveLength(model.allRows().length);
  });

  it('leaves out a support the student has hidden in settings', () => {
    const all = createFlatModel({ settings: {} }).allRows().length;
    const model = createFlatModel({ settings: {}, visibility: { show_ocr: false } });
    expect(model.allRows()).toHaveLength(all - 1);
    expect(model.allRows().some(row => row.tool.id === 'ocr')).toBe(false);
  });

  it('marks a support unavailable while the one it depends on is off', () => {
    const model = createFlatModel({
      settings: { tts: { enabled: false, highlightEnabled: true } },
    });
    const highlight = model.allRows().find(row => row.tool.id === 'highlight');
    expect(highlight.available).toBe(false);
  });
});

describe('createFlatModel — the filter', () => {
  it('collapses to what is switched on', () => {
    const model = createFlatModel(stateWith(['tts', 'pomodoro']));
    model.toggleFilter();
    const ids = model.visibleRows().map(row => row.tool.id);
    expect(ids).toContain('tts');
    expect(ids).toContain('pomodoro');
    expect(ids).not.toContain('word-by-word');
  });

  it('keeps a row in place when its support is switched off while filtering', () => {
    // The behaviour this protects: the student's finger is on that row. Recomputing would make it
    // vanish from under the pointer.
    const settings = settingsWith(['tts', 'pomodoro']);
    const model = createFlatModel({ settings });
    model.toggleFilter();

    settings.tts.enabled = false;
    model.update({ settings });

    const row = model.visibleRows().find(entry => entry.tool.id === 'tts');
    expect(row).toBeDefined();
    expect(row.on).toBe(false);
  });

  it('refreshes the captured set on the next press', () => {
    const settings = settingsWith(['tts', 'pomodoro']);
    const model = createFlatModel({ settings });
    model.toggleFilter();

    settings.tts.enabled = false;
    model.update({ settings });

    model.toggleFilter(); // off
    model.toggleFilter(); // on again, recapturing
    expect(model.visibleRows().map(row => row.tool.id)).not.toContain('tts');
  });

  it('restores everything in one press', () => {
    const model = createFlatModel(stateWith(['tts']));
    const total = model.allRows().length;
    model.toggleFilter();
    expect(model.visibleRows().length).toBeLessThan(total);
    model.toggleFilter();
    expect(model.visibleRows()).toHaveLength(total);
  });
});

describe('createFlatModel — the count', () => {
  it('states the total when showing everything', () => {
    const model = createFlatModel({ settings: {} });
    expect(model.summary()).toBe(`All ${model.counts().total} supports`);
  });

  it('states what is shown and what is hidden while filtering', () => {
    const model = createFlatModel(stateWith(['tts', 'pomodoro']));
    model.toggleFilter();
    const { shown, hidden } = model.counts();
    expect(model.summary()).toBe(`Showing ${shown} in use — ${hidden} hidden`);
    expect(shown + hidden).toBe(model.counts().total);
  });

  it('says so plainly when the filter leaves nothing', () => {
    // Silence here would read as a broken popup, and the student would have no way back.
    const model = createFlatModel(stateWith([]));
    model.toggleFilter();
    expect(model.summary()).toMatch(/Nothing in use/);
    expect(model.emptyMessage()).toMatch(/Show all/);
  });

  it('offers every wording it can produce, so the bar can hold space for the widest', () => {
    // The bar draws all of these at once, invisibly, to stop the press changing the line's size.
    const model = createFlatModel(stateWith(['tts']));
    const { total } = model.counts();
    const variants = model.summaryVariants();

    expect(variants).toContain(`All ${total} supports`);
    // Widest digits, not the current ones: the counts move as supports are switched.
    expect(variants).toContain(`Showing ${total} in use — ${total} hidden`);
    expect(variants).toContain(`Nothing in use — all ${total} hidden`);
  });

  it('offers the empty wording and nothing else when there is nothing to show', () => {
    const model = createFlatModel({ tools: [] });
    expect(model.summary()).toBe('No supports to show');
    expect(model.summaryVariants()).toEqual(['No supports to show']);
  });

  it('tells the filter button what pressing it will do', () => {
    const model = createFlatModel(stateWith(['tts']));
    expect(model.filterLabel()).toMatch(/^Show only the \d+ supports in use$/);
    model.toggleFilter();
    expect(model.filterLabel()).toMatch(/^Show all \d+ supports$/);
  });
});

describe('createFlatModel — groups', () => {
  it('lists the five groups in order when showing everything', () => {
    const model = createFlatModel({ settings: {} });
    expect(model.liveGroups()).toEqual(['Reading', 'Writing', 'Seeing', 'Focus', 'Study']);
  });

  it('offers no jump to a group with nothing in it', () => {
    // A jump button to an empty heading is a control that does nothing.
    const model = createFlatModel(stateWith(['pomodoro']));
    model.toggleFilter();
    expect(model.liveGroups()).toEqual(['Focus']);
  });

  it('returns the rows of one group', () => {
    const model = createFlatModel({ settings: {} });
    const reading = model.rowsInGroup('Reading');
    expect(reading.length).toBeGreaterThan(0);
    reading.forEach(row => expect(row.tool.group).toBe('Reading'));
  });
});

describe('createFlatModel — supports that live inside another', () => {
  /**
   * Read Aloud and the support drawn inside it, and nothing else, for the tests about what a
   * group and a count contain. With the whole registry, another Reading support being on out of
   * the box would answer the question instead of the pair under test.
   */
  const READING_PAIR = [toolById('tts'), toolById('highlight')];

  /** Out of the box: Highlight While Reading is stored on and Read Aloud is not. */
  const HIGHLIGHT_ON_TTS_OFF = { tts: { enabled: false, highlightEnabled: true } };

  it('keeps a dependent out of its group, whatever its parent is doing', () => {
    const on = createFlatModel(stateWith(['tts', 'highlight']));
    const off = createFlatModel(stateWith([]));
    [on, off].forEach(model => {
      const ids = model.rowsInGroup('Reading').map(row => row.tool.id);
      expect(ids).toContain('tts');
      expect(ids).not.toContain('highlight');
      expect(ids).not.toContain('word-by-word');
    });
  });

  it('hands them over as the children of the support they depend on', () => {
    const model = createFlatModel(stateWith(['tts', 'highlight']));
    const children = model.childRowsOf('tts');
    expect(children.map(row => row.tool.id)).toEqual(['highlight', 'word-by-word']);
    expect(children[0].on).toBe(true);
    expect(children[1].on).toBe(false);
    expect(model.childRowsOf('pomodoro')).toEqual([]);
  });

  it('names them for a parent that is off and therefore hiding them', () => {
    const model = createFlatModel(stateWith([]));
    expect(model.childNamesOf('tts')).toEqual(['Highlight While Reading', 'Word by Word']);
  });

  it('leaves out one the student has hidden in settings', () => {
    const model = createFlatModel({
      settings: settingsWith(['tts']),
      visibility: { show_highlighting: false },
    });
    expect(model.childNamesOf('tts')).toEqual(['Word by Word']);
    expect(model.childRowsOf('tts').map(row => row.tool.id)).toEqual(['word-by-word']);
  });

  it('still counts them among the supports there are', () => {
    // Nesting changes where they are drawn, not whether they exist. "All 29 supports" has to stay
    // the truth about what the student has.
    const model = createFlatModel(stateWith([]));
    const ids = model.allRows().map(row => row.tool.id);
    expect(ids).toContain('highlight');
    expect(ids).toContain('word-by-word');
    expect(model.summary()).toBe(`All ${ids.length} supports`);
  });

  it('does not call one in use while the support holding it is off', () => {
    // Highlight While Reading is stored on out of the box. With Read Aloud off it does nothing,
    // and the filter must not capture a row whose only way onto the screen is hidden.
    const model = createFlatModel({ tools: READING_PAIR, settings: HIGHLIGHT_ON_TTS_OFF });
    expect(model.counts().inUse).toBe(0);
    expect(model.filterLabel()).toBe('Show only the 0 supports in use');

    model.toggleFilter();
    expect(model.visibleRows()).toEqual([]);
  });

  it('never leaves a dependent captured without the support that draws it', () => {
    const settings = settingsWith(['tts', 'highlight']);
    const model = createFlatModel({ settings });
    model.toggleFilter();
    expect(model.visibleRows().map(row => row.tool.id)).toContain('highlight');

    // Read Aloud goes off while the filter is holding its snapshot. Its own row stays — rule 1 —
    // but what was drawn inside it cannot stay behind on its own.
    settings.tts.enabled = false;
    model.update({ settings });
    const ids = model.visibleRows().map(row => row.tool.id);
    expect(ids).toContain('tts');
    expect(ids).not.toContain('highlight');
  });

  it('shows the support that HOLDS one the query matched', () => {
    // "karaoke" is Highlight While Reading's word, and that support is drawn inside Read Aloud.
    // Returning the child alone would leave the view with nowhere to put it.
    const model = createFlatModel(stateWith(['tts', 'highlight']));
    model.setQuery('karaoke');
    const ids = model.visibleRows().map(row => row.tool.id);
    expect(ids).toContain('highlight');
    expect(ids).toContain('tts');
    expect(model.rowsInGroup('Reading').map(row => row.tool.id)).toEqual(['tts']);
    expect(model.childRowsOf('tts').map(row => row.tool.id)).toEqual(['highlight']);
  });

  it('keeps what a matched support holds, so its nested group is still drawn', () => {
    // The narrowing has to run both ways. A query that named the PARENT — "read aloud", "narrate" —
    // and dropped its children would take two supports out of the popup with nothing saying where
    // they went: the nested group is only built from `childRowsOf`, so an empty answer erases it.
    const model = createFlatModel(stateWith(['tts', 'highlight']));
    model.setQuery('read aloud');
    expect(model.rowsInGroup('Reading').map(row => row.tool.id)).toContain('tts');
    expect(model.childRowsOf('tts').map(row => row.tool.id)).toEqual(['highlight', 'word-by-word']);
  });

  it('does not pull in a sibling the query never mentioned', () => {
    // The other direction of the same rule: "karaoke" is about one of the two supports inside Read
    // Aloud, and widening it to both would answer a question the student did not ask.
    const model = createFlatModel(stateWith(['tts', 'highlight']));
    model.setQuery('karaoke');
    expect(model.childRowsOf('tts').map(row => row.tool.id)).toEqual(['highlight']);
  });

  it('counts only the rows a view can actually draw while searching', () => {
    // With Read Aloud off there is no room inside it, so the only thing that can tell the student
    // where the support they searched for lives is the parent row's own wording — and the count must
    // agree with the one row on screen, not with the two the search touched.
    const model = createFlatModel(stateWith([]));
    model.setQuery('karaoke');
    expect(model.visibleRows().map(row => row.tool.id)).toEqual(['tts']);
    expect(model.counts().shown).toBe(1);
    expect(model.summary()).toBe('1 support matches');
    expect(model.childNamesOf('tts')).toContain('Highlight While Reading');
  });

  it('lights a group heading for a top-level support alone', () => {
    // A dependent reaches the screen through its parent, so it can never be the reason a heading
    // and its jump button exist. Only these two tools, so nothing else can light Reading.
    const model = createFlatModel({ tools: READING_PAIR, settings: HIGHLIGHT_ON_TTS_OFF });
    expect(model.liveGroups()).toEqual(['Reading']);
    model.toggleFilter();
    expect(model.liveGroups()).toEqual([]);
  });
});

describe('createFlatModel — the search', () => {
  it('shows everything until something is typed', () => {
    const model = createFlatModel({ settings: {} });
    expect(model.query()).toBe('');
    expect(model.visibleRows()).toHaveLength(model.allRows().length);
    expect(model.summary()).toBe(`All ${model.counts().total} supports`);
  });

  it('narrows to what the student described, not to what it is called', () => {
    const model = createFlatModel({ settings: {} });
    model.setQuery('read to me');
    const ids = model.visibleRows().map(row => row.tool.id);
    expect(ids).toContain('tts');
    expect(ids.length).toBeLessThan(model.allRows().length);
  });

  it('recomputes on every change rather than snapshotting — rule 4', () => {
    // The filter deliberately holds its capture. The search must not: the student is typing, and a
    // list that lagged a keystroke behind the field would be unusable.
    const model = createFlatModel({ settings: {} });
    model.setQuery('too bright');
    expect(model.visibleRows().map(row => row.tool.id)).toEqual(['screen-overlay']);
    model.setQuery('cant focus');
    expect(model.visibleRows().map(row => row.tool.id)).toContain('focus-mode');
  });

  it('restores the whole list when the field is emptied', () => {
    const model = createFlatModel({ settings: {} });
    const total = model.allRows().length;
    model.setQuery('pomodoro');
    expect(model.visibleRows().length).toBeLessThan(total);
    model.setQuery('');
    expect(model.visibleRows()).toHaveLength(total);
    expect(model.summary()).toBe(`All ${total} supports`);
  });

  it('narrows what the filter is showing rather than replacing it', () => {
    // Search composes with the filter: a support that is not in use stays out of the list even
    // when the query describes it perfectly.
    const model = createFlatModel(stateWith(['pomodoro']));
    model.toggleFilter();
    model.setQuery('read to me');
    expect(model.visibleRows()).toEqual([]);

    model.setQuery('i procrastinate');
    expect(model.visibleRows().map(row => row.tool.id)).toEqual(['pomodoro']);
  });

  it('drops a group that has nothing left in it, so the jump strip shrinks', () => {
    const model = createFlatModel({ settings: {} });
    model.setQuery('plan my essay');
    expect(model.liveGroups()).toEqual(['Study']);
  });

  it('counts the matches in the line the field points at', () => {
    const model = createFlatModel({ settings: {} });
    model.setQuery('too bright');
    expect(model.counts().shown).toBe(1);
    expect(model.summary()).toBe('1 support matches');

    model.setQuery('read');
    expect(model.summary()).toBe(`${model.counts().shown} supports match`);
    expect(model.counts().shown).toBeGreaterThan(1);
  });

  it('says plainly when nothing matches, and suggests describing the problem', () => {
    const model = createFlatModel({ settings: {} });
    model.setQuery('xylophone');
    expect(model.visibleRows()).toEqual([]);
    expect(model.summary()).toBe('Nothing matches');
    expect(model.emptyMessage()).toMatch(/Nothing matches/);
    expect(model.emptyMessage()).toMatch(/read to me/);
  });

  it('matches nothing for a query of nothing but stop words', () => {
    // Searching and finding nothing, not "not searching": the wording of the line is what tells the
    // two apart, and "All 29 supports" over an empty list would read as a broken popup.
    const model = createFlatModel({ settings: {} });
    model.setQuery('i want to');
    expect(model.visibleRows()).toEqual([]);
    expect(model.summary()).toBe('Nothing matches');
  });

  it('holds space for every wording the search can put in the line', () => {
    const model = createFlatModel({ settings: {} });
    const { total } = model.counts();
    const variants = model.summaryVariants();
    expect(variants).toContain(`${total} supports match`);
    expect(variants).toContain('1 support matches');
    expect(variants).toContain('Nothing matches');
  });

  it('ignores anything that is not a string', () => {
    const model = createFlatModel({ settings: {} });
    model.setQuery(undefined);
    expect(model.visibleRows()).toHaveLength(model.allRows().length);
    expect(model.summary()).toBe(`All ${model.counts().total} supports`);
  });
});

describe('createFlatModel — the order the search hands back', () => {
  /** @param {string} query @param {Object} [settings] @returns {string[]} */
  function searchedIds(query, settings = {}) {
    const model = createFlatModel({ settings });
    model.setQuery(query);
    return model.visibleRows().map(row => row.tool.id);
  }

  it('puts the support the query is about first', () => {
    // searchTools already scores a hit in a support's NAME far above one in the group it sits in,
    // and the model threw that away by filtering in registry order: "read to me" came back as
    // fifteen supports with Show Text Stats at the top and Read Aloud second.
    expect(searchedIds('read to me')[0]).toBe('tts');
  });

  it('keeps the ranking for the group the view draws', () => {
    const model = createFlatModel({ settings: {} });
    model.setQuery('read to me');
    expect(model.rowsInGroup('Reading')[0].tool.id).toBe('tts');
  });

  it('leaves a row pulled in by a relation behind the rows the query found', () => {
    // "karaoke" names Highlight While Reading alone; Read Aloud comes with it only because the
    // view has nowhere else to draw its child. The hit stays ahead of the row that carries it.
    const found = searchedIds('karaoke', settingsWith(['tts', 'highlight']));
    expect(found).toContain('highlight');
    expect(found).toContain('tts');
    expect(found.indexOf('highlight')).toBeLessThan(found.indexOf('tts'));
  });

  it('is the same list every time, so a query never reorders itself', () => {
    expect(searchedIds('too bright')).toEqual(searchedIds('too bright'));
  });
});
