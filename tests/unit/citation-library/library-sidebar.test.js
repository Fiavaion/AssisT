/**
 * @jest-environment jsdom
 *
 * The collections + tags rail: a real list of filters, with the active one programmatically
 * indicated, an always-available route to make the first collection, and rename/delete per row.
 */

import { createLibrarySidebar } from '../../../src/pages/citation-library/library-sidebar.js';

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

function snapshot(overrides = {}) {
  return {
    activeProjectId: null,
    filter: '',
    projects: [
      { id: 1, name: 'Essay' },
      { id: 2, name: 'Thesis' },
    ],
    citations: [
      { title: 'A', projectId: '1', tags: ['neuro', 'memory'] },
      { title: 'B', projectId: '1', tags: ['memory'] },
      { title: 'C', projectId: '2', tags: [] },
      { title: 'D', projectId: null, tags: ['ethics'] },
    ],
    ...overrides,
  };
}

function labels(sb, selector) {
  return [...sb.el.querySelectorAll(selector)].map(
    b => b.querySelector('.assist-lib-sidebar__label').textContent
  );
}

function itemFor(sb, name) {
  return [...sb.el.querySelectorAll('.assist-lib-sidebar__item')].find(b =>
    b.querySelector('.assist-lib-sidebar__label').textContent.startsWith(name)
  );
}

function rowButton(sb, name, action) {
  return [...sb.el.querySelectorAll('.assist-lib-sidebar__rowbtn')].find(b => {
    const label = b.getAttribute('aria-label').toLowerCase();
    return label.startsWith(action) && label.includes(name.toLowerCase());
  });
}

function status(sb) {
  return sb.el.querySelector('[role="status"]').textContent;
}

let sb = null;
afterEach(() => {
  if (sb) {
    sb.destroy();
    sb = null;
  }
  document.body.innerHTML = '';
});

describe('structure and semantics', () => {
  it('is a labelled navigation landmark holding a real list', () => {
    sb = createLibrarySidebar({});
    sb.update(snapshot());

    expect(sb.el.tagName).toBe('NAV');
    expect(sb.el.getAttribute('aria-label')).toMatch(/collections/i);
    const list = sb.el.querySelector('ul.assist-lib-sidebar__list');
    expect(list.tagName).toBe('UL');
    expect([...list.children].every(child => child.tagName === 'LI')).toBe(true);
  });

  it('lists collections with live counts', () => {
    sb = createLibrarySidebar({});
    sb.update(snapshot());
    expect(labels(sb, '.assist-lib-sidebar__item')).toEqual(['Essay (2)', 'Thesis (1)']);
  });

  it('renders a sorted, de-duplicated tag list', () => {
    sb = createLibrarySidebar({});
    sb.update(snapshot());
    const tags = [...sb.el.querySelectorAll('.assist-lib-sidebar__tag')].map(b => b.textContent);
    expect(tags).toEqual(['ethics', 'memory', 'neuro']);
  });

  it('always offers a way to make a collection, even before there is one', () => {
    sb = createLibrarySidebar({});
    sb.update(snapshot({ projects: [], citations: [] }));

    expect(sb.el.querySelector('.assist-lib-sidebar__new')).toBeTruthy();
    expect(sb.el.querySelector('.assist-lib-sidebar__item')).toBeNull();
    expect(sb.el.querySelector('.assist-lib-sidebar__empty').hidden).toBe(false);
  });

  it('offers All citations with no collections too, so a tag filter can be cleared from the rail', () => {
    const onAll = jest.fn();
    sb = createLibrarySidebar({ onAll });
    sb.update(
      snapshot({ projects: [], filter: 'ethics', citations: [{ title: 'D', tags: ['ethics'] }] })
    );

    const all = sb.el.querySelector('.assist-lib-sidebar__all');
    expect(all).not.toBeNull();
    expect(all.closest('ul').hidden).toBe(false);
    fireMousedown(all);
    expect(onAll).toHaveBeenCalledTimes(1);
  });

  it('hides the tag section when nothing is tagged', () => {
    sb = createLibrarySidebar({});
    sb.update(snapshot({ citations: [{ title: 'X', tags: [] }] }));
    expect(sb.el.querySelector('.assist-lib-sidebar__tags').hidden).toBe(true);
  });
});

describe('the active collection', () => {
  it('marks exactly one filter as current, and it is All citations by default', () => {
    sb = createLibrarySidebar({});
    sb.update(snapshot());

    const current = [...sb.el.querySelectorAll('[aria-current]')];
    expect(current).toHaveLength(1);
    expect(current[0].classList.contains('assist-lib-sidebar__all')).toBe(true);
  });

  it('moves aria-current onto the filtered collection', () => {
    sb = createLibrarySidebar({});
    sb.update(snapshot({ activeProjectId: '2' }));

    const current = sb.el.querySelectorAll('[aria-current]');
    expect(current).toHaveLength(1);
    expect(current[0].querySelector('.assist-lib-sidebar__label').textContent).toBe('Thesis (1)');
  });

  it('does not rely on colour alone: the active row carries a visible mark (SC 1.4.1)', () => {
    sb = createLibrarySidebar({});
    sb.update(snapshot({ activeProjectId: '1' }));

    expect(itemFor(sb, 'Essay').querySelector('.assist-lib-sidebar__mark').textContent).not.toBe(
      ''
    );
    expect(itemFor(sb, 'Thesis').querySelector('.assist-lib-sidebar__mark').textContent).toBe('');
  });
});

describe('announcing a filter change', () => {
  it('says nothing on first paint, since the student has not changed anything yet', () => {
    sb = createLibrarySidebar({});
    sb.update(snapshot());
    expect(status(sb)).toBe('');
  });

  it('names the collection and how many citations are showing', () => {
    sb = createLibrarySidebar({ onProject: jest.fn() });
    sb.update(snapshot());

    fireMousedown(itemFor(sb, 'Essay'));
    sb.update(snapshot({ activeProjectId: '1' }), { visibleCount: 2 });

    expect(status(sb)).toContain('Essay');
    expect(status(sb)).toContain('2');
    expect(status(sb)).toContain('4');
  });

  it('says the search was cleared when All citations also cleared one', () => {
    sb = createLibrarySidebar({ onAll: jest.fn() });
    sb.update(snapshot({ activeProjectId: '1', filter: 'memory' }));

    fireMousedown(sb.el.querySelector('.assist-lib-sidebar__all'));
    sb.update(snapshot());

    expect(status(sb)).toBe('Search cleared. Showing all 4 citations.');
  });

  it('announces the way back to everything', () => {
    sb = createLibrarySidebar({ onAll: jest.fn() });
    sb.update(snapshot({ activeProjectId: '1' }));

    fireMousedown(sb.el.querySelector('.assist-lib-sidebar__all'));
    sb.update(snapshot(), { visibleCount: 4 });

    expect(status(sb)).toMatch(/all/i);
    expect(status(sb)).toContain('4');
  });

  it('announces a tag filter too, since a tag chip changes the list just as much', () => {
    sb = createLibrarySidebar({ onTag: jest.fn() });
    sb.update(snapshot());

    fireMousedown(sb.el.querySelector('.assist-lib-sidebar__tag'));
    sb.update(snapshot({ filter: 'ethics' }), { visibleCount: 1 });

    expect(status(sb)).toContain('ethics');
    expect(status(sb)).toContain('1');
  });

  it('stays silent while the student types in the search box', () => {
    sb = createLibrarySidebar({});
    sb.update(snapshot());

    // The store emits on every keystroke; the rail must not narrate them.
    sb.update(snapshot({ filter: 'me' }), { visibleCount: 3 });
    sb.update(snapshot({ filter: 'mem' }), { visibleCount: 2 });

    expect(status(sb)).toBe('');
  });

  it('stays quiet when the list merely reloads under an unchanged filter', () => {
    sb = createLibrarySidebar({ onProject: jest.fn() });
    sb.update(snapshot());
    fireMousedown(itemFor(sb, 'Essay'));
    sb.update(snapshot({ activeProjectId: '1' }), { visibleCount: 2 });
    const first = status(sb);

    sb.update(snapshot({ activeProjectId: '1' }), { visibleCount: 2 });
    expect(status(sb)).toBe(first);
  });
});

describe('the actions', () => {
  it('filters, clears, and tags through the callbacks', () => {
    const onAll = jest.fn();
    const onProject = jest.fn();
    const onTag = jest.fn();
    sb = createLibrarySidebar({ onAll, onProject, onTag });
    sb.update(snapshot());

    fireMousedown(sb.el.querySelector('.assist-lib-sidebar__all'));
    fireMousedown(itemFor(sb, 'Essay'));
    fireMousedown(sb.el.querySelector('.assist-lib-sidebar__tag'));

    expect(onAll).toHaveBeenCalled();
    expect(onProject).toHaveBeenCalledWith('1');
    expect(onTag).toHaveBeenCalledWith('ethics');
  });

  it('offers create, rename and delete, each naming its own collection', () => {
    const onNewCollection = jest.fn();
    const onRenameCollection = jest.fn();
    const onDeleteCollection = jest.fn();
    sb = createLibrarySidebar({ onNewCollection, onRenameCollection, onDeleteCollection });
    sb.update(snapshot());

    fireMousedown(sb.el.querySelector('.assist-lib-sidebar__new'));
    fireMousedown(rowButton(sb, 'Essay', 'rename'));
    fireMousedown(rowButton(sb, 'Thesis', 'delete'));

    expect(onNewCollection).toHaveBeenCalled();
    expect(onRenameCollection).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, name: 'Essay' })
    );
    expect(onDeleteCollection).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, name: 'Thesis' })
    );
  });

  it('keeps focus on the control that was just used when the rail re-renders', () => {
    sb = createLibrarySidebar({ onProject: jest.fn() });
    document.body.appendChild(sb.el);
    sb.update(snapshot());

    itemFor(sb, 'Essay').focus();
    sb.update(snapshot({ activeProjectId: '1' }), { visibleCount: 2 });

    expect(document.activeElement).toBe(itemFor(sb, 'Essay'));
  });

  describe('when the focused collection is deleted', () => {
    const three = [
      { id: 1, name: 'Essay' },
      { id: 2, name: 'Thesis' },
      { id: 3, name: 'Lab' },
    ];

    function railAfterDeleting(name) {
      sb = createLibrarySidebar({ onDeleteCollection: jest.fn() });
      document.body.appendChild(sb.el);
      sb.update(snapshot({ projects: three }));
      rowButton(sb, name, 'delete').focus();
      sb.update(snapshot({ projects: three.filter(p => p.name !== name) }));
    }

    it('moves focus to the collection that took its place', () => {
      railAfterDeleting('Thesis');
      expect(document.activeElement).toBe(itemFor(sb, 'Lab'));
    });

    it('moves focus to the one before it when it was the last', () => {
      railAfterDeleting('Lab');
      expect(document.activeElement).toBe(itemFor(sb, 'Thesis'));
    });

    it('moves focus to All citations when it was the only one', () => {
      sb = createLibrarySidebar({ onDeleteCollection: jest.fn() });
      document.body.appendChild(sb.el);
      sb.update(snapshot({ projects: [{ id: 1, name: 'Essay' }] }));
      rowButton(sb, 'Essay', 'delete').focus();
      sb.update(snapshot({ projects: [] }));

      expect(document.activeElement).toBe(sb.el.querySelector('.assist-lib-sidebar__all'));
    });
  });

  it('can hand the focus to a named control, such as a row just renamed', () => {
    sb = createLibrarySidebar({});
    document.body.appendChild(sb.el);
    sb.update(snapshot());

    expect(sb.focusControl('rename:2')).toBe(true);
    expect(document.activeElement).toBe(rowButton(sb, 'Thesis', 'rename'));
    expect(sb.focusControl('rename:99')).toBe(false);
  });
});

describe('the Recently removed entry', () => {
  function trashBtn(bar) {
    return bar.el.querySelector('.assist-lib-sidebar__trash');
  }

  it('is always offered, even before the first collection exists', () => {
    sb = createLibrarySidebar({});
    sb.update({ ...snapshot({ projects: [], citations: [] }), trashed: [] });

    expect(trashBtn(sb)).not.toBeNull();
    expect(trashBtn(sb).textContent).toContain('Recently removed');
  });

  it('shows how many citations are waiting in it', () => {
    sb = createLibrarySidebar({});
    sb.update({ ...snapshot(), trashed: [{ id: 1 }, { id: 2 }, { id: 3 }] });

    expect(trashBtn(sb).textContent).toContain('(3)');
  });

  it('opens the trash when pressed', () => {
    const onTrash = jest.fn();
    sb = createLibrarySidebar({ onTrash });
    sb.update({ ...snapshot(), trashed: [{ id: 1 }] });

    fireMousedown(trashBtn(sb));

    expect(onTrash).toHaveBeenCalled();
  });

  it('is the only current filter while the trash is open', () => {
    sb = createLibrarySidebar({});
    sb.update({ ...snapshot(), trashed: [{ id: 1 }], view: 'trash' });

    const current = [...sb.el.querySelectorAll('[aria-current]')];
    expect(current).toHaveLength(1);
    expect(current[0].classList.contains('assist-lib-sidebar__trash')).toBe(true);
  });

  it('announces the removed count when it changes, not on the first render', () => {
    sb = createLibrarySidebar({});
    sb.update({ ...snapshot(), trashed: [{ id: 1 }] });
    expect(status(sb)).toBe('');

    sb.update({ ...snapshot(), trashed: [{ id: 1 }, { id: 2 }] });

    expect(status(sb)).toContain('Recently removed');
    expect(status(sb)).toContain('2');
  });

  it('stays silent when a re-render leaves the removed count unchanged', () => {
    sb = createLibrarySidebar({});
    sb.update({ ...snapshot(), trashed: [{ id: 1 }] });
    sb.update({ ...snapshot(), trashed: [{ id: 1 }] });

    expect(status(sb)).toBe('');
  });

  it('says what the trash is showing when it is opened from the rail', () => {
    sb = createLibrarySidebar({ onTrash: () => {} });
    sb.update({ ...snapshot(), trashed: [{ id: 1 }, { id: 2 }] });

    fireMousedown(trashBtn(sb));
    sb.update({ ...snapshot(), trashed: [{ id: 1 }, { id: 2 }], view: 'trash' });

    expect(status(sb)).toContain('2');
  });
});
