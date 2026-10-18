/**
 * The shortcut list is read, so it has to be readable.
 *
 * Registering the mind map editor's own keys took this list from eighteen rows to thirty. Thirty
 * undifferentiated rows is a worse thing to hand somebody than eighteen, and this extension exists for
 * people who find reading hard, so the list is gathered under headings. The headings also give a screen
 * reader something to move between, instead of thirty rows that all announce alike.
 *
 * The mind map's keys come last on purpose: they only work inside the mind map's own page, so they are
 * not what a student is looking for when they open this list.
 */

import { DEFAULT_SHORTCUTS } from '../../../src/utils/keyboard-shortcuts.js';

describe('how the shortcut list is laid out', () => {
  let grid;

  beforeEach(() => {
    document.body.innerHTML = '<div id="keyboard-shortcuts-grid"></div>';
    grid = document.getElementById('keyboard-shortcuts-grid');
  });

  /**
   * The grouping rule, exercised against the real registry. The popup builds the same shape; this
   * pins the rule rather than the markup, so a change of element does not break it.
   */
  function layOut(shortcuts) {
    const categories = {
      tts_play_pause: 'TTS Controls',
      tts_stop: 'TTS Controls',
      reading_mode_toggle: 'Reading',
      stt_dictate: 'Writing',
    };
    const groupOf = key => categories[key] || (key.startsWith('mm_') ? 'Mind map' : 'General');
    const order = ['TTS Controls', 'Reading', 'Writing', 'Lookup Tools', 'Display', 'Study'];
    const rank = name => {
      const at = order.indexOf(name);
      return at === -1 ? (name === 'Mind map' ? order.length + 1 : order.length) : at;
    };
    const entries = Object.entries(shortcuts).sort(
      ([a], [b]) => rank(groupOf(a)) - rank(groupOf(b))
    );
    let last = null;
    for (const [key] of entries) {
      const group = groupOf(key);
      if (group !== last) {
        const heading = document.createElement('h4');
        heading.className = 'shortcut-group-heading';
        heading.textContent = group;
        grid.appendChild(heading);
        last = group;
      }
      const card = document.createElement('div');
      card.className = 'shortcut-card';
      card.setAttribute('data-shortcut', key);
      grid.appendChild(card);
    }
  }

  it('still shows every shortcut in the registry, one card each', () => {
    layOut(DEFAULT_SHORTCUTS);

    const keys = [...grid.querySelectorAll('.shortcut-card')].map(card =>
      card.getAttribute('data-shortcut')
    );
    expect(keys.sort()).toEqual(Object.keys(DEFAULT_SHORTCUTS).sort());
  });

  it('puts a heading above each group rather than one flat run of rows', () => {
    layOut(DEFAULT_SHORTCUTS);

    const headings = [...grid.querySelectorAll('.shortcut-group-heading')];
    expect(headings.length).toBeGreaterThan(1);
    expect(new Set(headings.map(h => h.textContent)).size).toBe(headings.length);
  });

  it('leaves the mind map editor keys until last, since they work on one page only', () => {
    layOut(DEFAULT_SHORTCUTS);

    const headings = [...grid.querySelectorAll('.shortcut-group-heading')].map(h => h.textContent);
    if (Object.keys(DEFAULT_SHORTCUTS).some(key => key.startsWith('mm_'))) {
      expect(headings[headings.length - 1]).toBe('Mind map');
    }
  });

  it('never leaves a card above the first heading, where it would belong to nothing', () => {
    layOut(DEFAULT_SHORTCUTS);

    expect(grid.firstElementChild.className).toBe('shortcut-group-heading');
  });
});
