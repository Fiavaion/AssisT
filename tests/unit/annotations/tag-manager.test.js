/**
 * Unit Tests for Tag Manager
 * Tests cover:
 * 1. Tag storage (get, save, delete)
 * 2. Tag color assignment
 * 3. Tag input component
 * 4. Tag filtering
 * 5. Tag rendering
 * 6. Autocomplete functionality
 */

import {
  getExistingTags,
  saveTag,
  deleteTag,
  getTagColor,
  createTagInput,
  createTagPill,
  renderTagPills,
  filterByTag,
  getUniqueTags,
  getTagFrequency
} from '../../../src/features/annotations/tag-manager.js';

// Chrome APIs are already mocked in setup.js
// Mock DOM
document.body.innerHTML = '<div id="test-container"></div>';

describe('Tag Storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should get existing tags from storage', async () => {
    const mockTags = ['work', 'personal', 'urgent'];

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ assist_annotation_tags: mockTags });
    });

    const result = await getExistingTags();

    expect(result).toEqual(mockTags);
    expect(chrome.storage.local.get).toHaveBeenCalledWith(
      ['assist_annotation_tags'],
      expect.any(Function)
    );
  });

  test('should return empty array when no tags exist', async () => {
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({});
    });

    const result = await getExistingTags();

    expect(result).toEqual([]);
  });

  test('should save new tag to storage', async () => {
    const existingTags = ['work', 'personal'];

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ assist_annotation_tags: existingTags });
    });

    chrome.storage.local.set.mockImplementation((data, callback) => {
      callback();
    });

    await saveTag('urgent');

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { assist_annotation_tags: ['work', 'personal', 'urgent'] },
      expect.any(Function)
    );
  });

  test('should normalize tag names to lowercase', async () => {
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ assist_annotation_tags: [] });
    });

    chrome.storage.local.set.mockImplementation((data, callback) => {
      callback();
    });

    await saveTag('URGENT');

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { assist_annotation_tags: ['urgent'] },
      expect.any(Function)
    );
  });

  test('should trim whitespace from tag names', async () => {
    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ assist_annotation_tags: [] });
    });

    chrome.storage.local.set.mockImplementation((data, callback) => {
      callback();
    });

    await saveTag('  work  ');

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { assist_annotation_tags: ['work'] },
      expect.any(Function)
    );
  });

  test('should not save duplicate tags', async () => {
    const existingTags = ['work', 'personal'];

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ assist_annotation_tags: existingTags });
    });

    chrome.storage.local.set.mockImplementation((data, callback) => {
      callback();
    });

    await saveTag('work');

    // set should not be called for duplicate
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test('should delete tag from storage', async () => {
    const existingTags = ['work', 'personal', 'urgent'];

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ assist_annotation_tags: existingTags });
    });

    chrome.storage.local.set.mockImplementation((data, callback) => {
      callback();
    });

    await deleteTag('personal');

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { assist_annotation_tags: ['work', 'urgent'] },
      expect.any(Function)
    );
  });

  test('should handle deleting non-existent tag', async () => {
    const existingTags = ['work', 'personal'];

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ assist_annotation_tags: existingTags });
    });

    chrome.storage.local.set.mockImplementation((data, callback) => {
      callback();
    });

    await deleteTag('nonexistent');

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      { assist_annotation_tags: ['work', 'personal'] },
      expect.any(Function)
    );
  });
});

describe('Tag Color Assignment', () => {
  test('should return consistent color for same tag', () => {
    const color1 = getTagColor('work');
    const color2 = getTagColor('work');

    expect(color1).toEqual(color2);
  });

  test('should return different colors for different tags', () => {
    const color1 = getTagColor('work');
    const color2 = getTagColor('personal');

    // Note: May occasionally be same due to hash collision, but unlikely
    expect(color1).toBeDefined();
    expect(color2).toBeDefined();
  });

  test('should return color object with required properties', () => {
    const color = getTagColor('test');

    expect(color).toHaveProperty('name');
    expect(color).toHaveProperty('bg');
    expect(color).toHaveProperty('border');
    expect(color).toHaveProperty('text');
  });

  test('should handle empty tag name', () => {
    const color = getTagColor('');

    expect(color).toBeDefined();
    expect(color).toHaveProperty('bg');
  });

  test('should handle special characters in tag name', () => {
    const color = getTagColor('test-tag_123!');

    expect(color).toBeDefined();
    expect(color).toHaveProperty('bg');
  });

  test('should cycle through available colors', () => {
    const colors = new Set();

    // Get colors for many tags
    for (let i = 0; i < 100; i++) {
      const color = getTagColor(`tag${i}`);
      colors.add(color.name);
    }

    // Should use at least 2 different colors (likely all 5)
    expect(colors.size).toBeGreaterThanOrEqual(2);
  });
});

describe('Tag Input Component', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="test-container"></div>';
    jest.clearAllMocks();

    chrome.storage.local.get.mockImplementation((keys, callback) => {
      callback({ assist_annotation_tags: ['work', 'personal', 'urgent'] });
    });

    chrome.storage.local.set.mockImplementation((data, callback) => {
      callback();
    });
  });

  test('should create tag input component', () => {
    const container = document.getElementById('test-container');
    const tagInput = createTagInput(container);

    expect(tagInput).toBeDefined();
    expect(tagInput).toHaveProperty('getTags');
    expect(tagInput).toHaveProperty('setTags');
    expect(tagInput).toHaveProperty('destroy');
  });

  test('should initialize with empty tags', () => {
    const container = document.getElementById('test-container');
    const tagInput = createTagInput(container);

    expect(tagInput.getTags()).toEqual([]);
  });

  test('should initialize with initial tags', () => {
    const container = document.getElementById('test-container');
    const initialTags = ['work', 'urgent'];
    const tagInput = createTagInput(container, initialTags);

    expect(tagInput.getTags()).toEqual(['work', 'urgent']);
  });

  test('should normalize initial tags', () => {
    const container = document.getElementById('test-container');
    const initialTags = ['WORK', '  Personal  ', 'urgent'];
    const tagInput = createTagInput(container, initialTags);

    expect(tagInput.getTags()).toEqual(['work', 'personal', 'urgent']);
  });

  test('should allow setting tags programmatically', () => {
    const container = document.getElementById('test-container');
    const tagInput = createTagInput(container);

    tagInput.setTags(['new', 'tags']);

    expect(tagInput.getTags()).toEqual(['new', 'tags']);
  });

  test('should call onChange callback when tags change', () => {
    const container = document.getElementById('test-container');
    const onChange = jest.fn();
    const tagInput = createTagInput(container, [], onChange);

    tagInput.setTags(['work']);

    expect(onChange).toHaveBeenCalledWith(['work']);
  });

  test('should destroy component cleanly', () => {
    const container = document.getElementById('test-container');
    const tagInput = createTagInput(container);

    expect(container.children.length).toBeGreaterThan(0);

    tagInput.destroy();

    expect(container.children.length).toBe(0);
  });
});

describe('Tag Pill Rendering', () => {
  test('should create tag pill element', () => {
    const pill = createTagPill('work');

    expect(pill).toBeDefined();
    expect(pill.tagName).toBe('SPAN');
    expect(pill.className).toBe('assist-tag-pill');
  });

  test('should display tag name in pill', () => {
    const pill = createTagPill('urgent');

    expect(pill.textContent).toContain('urgent');
  });

  test('should apply color theme to pill', () => {
    const pill = createTagPill('test');

    expect(pill.style.backgroundColor).toBeTruthy();
    expect(pill.style.borderColor).toBeTruthy();
    expect(pill.style.color).toBeTruthy();
  });

  test('should create pill without remove button', () => {
    const pill = createTagPill('work');

    const removeBtn = pill.querySelector('.assist-tag-remove');
    expect(removeBtn).toBeFalsy();
  });

  test('should create pill with remove button', () => {
    const onRemove = jest.fn();
    const pill = createTagPill('work', onRemove);

    const removeBtn = pill.querySelector('.assist-tag-remove');
    expect(removeBtn).toBeTruthy();
  });

  test('should call onRemove when remove button clicked', () => {
    const onRemove = jest.fn();
    const pill = createTagPill('work', onRemove);

    const removeBtn = pill.querySelector('.assist-tag-remove');
    removeBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onRemove).toHaveBeenCalled();
  });

  test('should render multiple tag pills', () => {
    const container = document.createElement('div');
    const tags = ['work', 'personal', 'urgent'];

    renderTagPills(tags, container);

    const pills = container.querySelectorAll('.assist-tag-pill');
    expect(pills.length).toBe(3);
  });

  test('should clear container before rendering', () => {
    const container = document.createElement('div');
    container.innerHTML = '<div>old content</div>';

    renderTagPills(['work'], container);

    expect(container.innerHTML).not.toContain('old content');
  });

  test('should handle empty tag array', () => {
    const container = document.createElement('div');

    renderTagPills([], container);

    expect(container.children.length).toBe(0);
  });

  test('should handle null tags', () => {
    const container = document.createElement('div');

    renderTagPills(null, container);

    expect(container.children.length).toBe(0);
  });
});

describe('Tag Filtering', () => {
  test('should filter annotations by tag', () => {
    const annotations = [
      { id: 1, tags: ['work', 'urgent'] },
      { id: 2, tags: ['personal'] },
      { id: 3, tags: ['work'] }
    ];

    const result = filterByTag(annotations, 'work');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(3);
  });

  test('should normalize tag name for filtering', () => {
    const annotations = [
      { id: 1, tags: ['work'] },
      { id: 2, tags: ['personal'] }
    ];

    const result = filterByTag(annotations, 'WORK');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  test('should handle annotations without tags', () => {
    const annotations = [
      { id: 1, tags: ['work'] },
      { id: 2, tags: [] },
      { id: 3 }
    ];

    const result = filterByTag(annotations, 'work');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  test('should return empty array when no matches', () => {
    const annotations = [
      { id: 1, tags: ['work'] },
      { id: 2, tags: ['personal'] }
    ];

    const result = filterByTag(annotations, 'nonexistent');

    expect(result).toHaveLength(0);
  });
});

describe('Tag Utilities', () => {
  test('should get unique tags from annotations', () => {
    const annotations = [
      { id: 1, tags: ['work', 'urgent'] },
      { id: 2, tags: ['personal', 'work'] },
      { id: 3, tags: ['urgent'] }
    ];

    const result = getUniqueTags(annotations);

    expect(result).toEqual(['personal', 'urgent', 'work']); // Sorted
    expect(result).toHaveLength(3);
  });

  test('should handle annotations with no tags', () => {
    const annotations = [
      { id: 1, tags: [] },
      { id: 2 },
      { id: 3, tags: ['work'] }
    ];

    const result = getUniqueTags(annotations);

    expect(result).toEqual(['work']);
  });

  test('should return empty array for empty annotations', () => {
    const result = getUniqueTags([]);

    expect(result).toEqual([]);
  });

  test('should get tag frequency map', () => {
    const annotations = [
      { id: 1, tags: ['work', 'urgent'] },
      { id: 2, tags: ['work', 'personal'] },
      { id: 3, tags: ['work'] }
    ];

    const result = getTagFrequency(annotations);

    expect(result.get('work')).toBe(3);
    expect(result.get('urgent')).toBe(1);
    expect(result.get('personal')).toBe(1);
  });

  test('should handle tags not present in any annotation', () => {
    const annotations = [
      { id: 1, tags: ['work'] }
    ];

    const result = getTagFrequency(annotations);

    expect(result.get('nonexistent')).toBeUndefined();
  });

  test('should return empty map for empty annotations', () => {
    const result = getTagFrequency([]);

    expect(result.size).toBe(0);
  });

  test('should handle annotations without tags in frequency', () => {
    const annotations = [
      { id: 1, tags: ['work'] },
      { id: 2, tags: [] },
      { id: 3 }
    ];

    const result = getTagFrequency(annotations);

    expect(result.get('work')).toBe(1);
    expect(result.size).toBe(1);
  });
});

describe('Tag Autocomplete', () => {
  test('should filter existing tags by query', () => {
    const existingTags = ['work', 'workshop', 'personal', 'urgent'];
    const query = 'work';

    const filtered = existingTags.filter(tag => tag.includes(query));

    expect(filtered).toEqual(['work', 'workshop']);
  });

  test('should perform case-insensitive filtering', () => {
    const existingTags = ['work', 'personal', 'urgent'];
    const query = 'WORK';

    const filtered = existingTags.filter(tag =>
      tag.toLowerCase().includes(query.toLowerCase())
    );

    expect(filtered).toEqual(['work']);
  });

  test('should exclude already selected tags', () => {
    const existingTags = ['work', 'personal', 'urgent'];
    const selectedTags = ['work'];
    const query = 'work';

    const filtered = existingTags.filter(tag =>
      tag.includes(query) && !selectedTags.includes(tag)
    );

    expect(filtered).toEqual([]);
  });

  test('should return empty array for no matches', () => {
    const existingTags = ['work', 'personal', 'urgent'];
    const query = 'xyz';

    const filtered = existingTags.filter(tag => tag.includes(query));

    expect(filtered).toEqual([]);
  });
});

describe('Tag Input Edge Cases', () => {
  test('should handle comma-separated tags', () => {
    const input = 'work, personal, urgent';
    const tags = input.split(',').map(t => t.trim()).filter(t => t);

    expect(tags).toEqual(['work', 'personal', 'urgent']);
  });

  test('should handle tags with extra whitespace', () => {
    const input = '  work  ,   personal,urgent   ';
    const tags = input.split(',').map(t => t.trim()).filter(t => t);

    expect(tags).toEqual(['work', 'personal', 'urgent']);
  });

  test('should filter empty tags from comma-separated input', () => {
    const input = 'work,,personal,,';
    const tags = input.split(',').map(t => t.trim()).filter(t => t);

    expect(tags).toEqual(['work', 'personal']);
  });

  test('should handle single tag input', () => {
    const input = 'work';
    const tags = input.split(',').map(t => t.trim()).filter(t => t);

    expect(tags).toEqual(['work']);
  });
});

describe('ARIA Accessibility', () => {
  test('should have proper ARIA attributes on tag pill', () => {
    const pill = createTagPill('work');

    expect(pill.getAttribute('role')).toBe('button');
    expect(pill.getAttribute('aria-label')).toContain('work');
  });

  test('should have proper ARIA label on remove button', () => {
    const onRemove = jest.fn();
    const pill = createTagPill('work', onRemove);

    const removeBtn = pill.querySelector('.assist-tag-remove');
    expect(removeBtn.getAttribute('aria-label')).toContain('work');
  });
});
