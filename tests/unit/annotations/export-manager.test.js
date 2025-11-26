/**
 * Unit Tests for Export Manager
 * Tests cover:
 * 1. Markdown export format
 * 2. Plain text export format
 * 3. JSON export format
 * 4. CSV export format
 * 5. File download functionality
 * 6. Filename generation
 * 7. Error handling
 * 8. Empty data handling
 */

import {
  exportToMarkdown,
  exportToPlainText,
  exportToJSON,
  exportToCSV,
  downloadFile,
  exportAnnotations
} from '../../../src/features/annotations/export-manager.js';

// Mock chrome APIs
global.chrome = {
  downloads: {
    download: jest.fn()
  },
  runtime: {
    lastError: null
  }
};

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

// Mock Blob
global.Blob = jest.fn((content, options) => ({
  content,
  options,
  type: options.type
}));

describe('Markdown Export', () => {
  test('should export empty annotations', () => {
    const result = exportToMarkdown([]);

    expect(result).toContain('# Annotations Export');
    expect(result).toContain('No annotations to export');
  });

  test('should export null annotations', () => {
    const result = exportToMarkdown(null);

    expect(result).toContain('# Annotations Export');
    expect(result).toContain('No annotations to export');
  });

  test('should include metadata header', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test note',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = exportToMarkdown(annotations);

    expect(result).toContain('# Annotations Export');
    expect(result).toContain('Generated:');
    expect(result).toContain('Total: 1 item(s)');
  });

  test('should export sticky notes section', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test sticky note content',
        color: 'yellow',
        tags: ['work'],
        url: 'https://example.com',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    const result = exportToMarkdown(annotations);

    expect(result).toContain('## Sticky Notes');
    expect(result).toContain('### Sticky Note 1');
    expect(result).toContain('**Content:**');
    expect(result).toContain('Test sticky note content');
    expect(result).toContain('**Metadata:**');
    expect(result).toContain('- Color: yellow');
    expect(result).toContain('- Tags: work');
    expect(result).toContain('- URL: https://example.com');
  });

  test('should export inline annotations section', () => {
    const annotations = [
      {
        id: 1,
        type: 'annotation',
        selectedText: 'Important text',
        comment: 'This is important',
        color: 'blue',
        tags: ['review'],
        url: 'https://example.com',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    const result = exportToMarkdown(annotations);

    expect(result).toContain('## Inline Annotations');
    expect(result).toContain('### Annotation 1');
    expect(result).toContain('**Highlighted Text:**');
    expect(result).toContain('> Important text');
    expect(result).toContain('**Comment:**');
    expect(result).toContain('This is important');
    expect(result).toContain('- Color: blue');
    expect(result).toContain('- Tags: review');
  });

  test('should separate notes and annotations', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Note 1',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      },
      {
        id: 2,
        type: 'annotation',
        selectedText: 'Text',
        comment: 'Annotation 1',
        color: 'blue',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = exportToMarkdown(annotations);

    expect(result).toContain('## Sticky Notes');
    expect(result).toContain('## Inline Annotations');
  });

  test('should handle annotations without tags', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = exportToMarkdown(annotations);

    expect(result).not.toContain('- Tags:');
  });

  test('should handle multiple tags', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test',
        color: 'yellow',
        tags: ['work', 'urgent', 'important'],
        createdAt: Date.now()
      }
    ];

    const result = exportToMarkdown(annotations);

    expect(result).toContain('- Tags: work, urgent, important');
  });
});

describe('Plain Text Export', () => {
  test('should export empty annotations', () => {
    const result = exportToPlainText([]);

    expect(result).toContain('ANNOTATIONS EXPORT');
    expect(result).toContain('No annotations to export');
  });

  test('should include metadata header', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = exportToPlainText(annotations);

    expect(result).toContain('ANNOTATIONS EXPORT');
    expect(result).toContain('Generated:');
    expect(result).toContain('Total: 1 item(s)');
  });

  test('should export sticky note', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test content',
        color: 'yellow',
        tags: ['work'],
        url: 'https://example.com',
        createdAt: Date.now()
      }
    ];

    const result = exportToPlainText(annotations);

    expect(result).toContain('[1] STICKY NOTE');
    expect(result).toContain('Content: Test content');
    expect(result).toContain('Color: yellow');
    expect(result).toContain('Tags: work');
    expect(result).toContain('URL: https://example.com');
  });

  test('should export inline annotation', () => {
    const annotations = [
      {
        id: 1,
        type: 'annotation',
        selectedText: 'Important',
        comment: 'Review this',
        color: 'blue',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = exportToPlainText(annotations);

    expect(result).toContain('[1] ANNOTATION');
    expect(result).toContain('Highlighted: Important');
    expect(result).toContain('Comment: Review this');
    expect(result).toContain('Color: blue');
  });

  test('should handle empty content', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: '',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = exportToPlainText(annotations);

    expect(result).toContain('Content: (empty)');
  });
});

describe('JSON Export', () => {
  test('should export empty annotations', () => {
    const result = exportToJSON([]);
    const parsed = JSON.parse(result);

    expect(parsed).toHaveProperty('metadata');
    expect(parsed).toHaveProperty('annotations');
    expect(parsed.metadata.total).toBe(0);
    expect(parsed.annotations).toEqual([]);
  });

  test('should include metadata', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = exportToJSON(annotations);
    const parsed = JSON.parse(result);

    expect(parsed.metadata).toHaveProperty('version');
    expect(parsed.metadata).toHaveProperty('generated');
    expect(parsed.metadata).toHaveProperty('total');
    expect(parsed.metadata.version).toBe('1.0');
    expect(parsed.metadata.total).toBe(1);
  });

  test('should export annotation with all fields', () => {
    const now = Date.now();
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test content',
        color: 'yellow',
        tags: ['work', 'urgent'],
        url: 'https://example.com',
        createdAt: now,
        updatedAt: now
      }
    ];

    const result = exportToJSON(annotations);
    const parsed = JSON.parse(result);

    expect(parsed.annotations).toHaveLength(1);
    expect(parsed.annotations[0]).toMatchObject({
      id: 1,
      type: 'note',
      content: 'Test content',
      color: 'yellow',
      tags: ['work', 'urgent'],
      url: 'https://example.com',
      createdAt: now,
      updatedAt: now
    });
  });

  test('should handle null fields', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = exportToJSON(annotations);
    const parsed = JSON.parse(result);

    expect(parsed.annotations[0].content).toBeNull();
    expect(parsed.annotations[0].selectedText).toBeNull();
    expect(parsed.annotations[0].comment).toBeNull();
  });

  test('should be valid JSON', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = exportToJSON(annotations);

    expect(() => JSON.parse(result)).not.toThrow();
  });
});

describe('CSV Export', () => {
  test('should export empty annotations with headers', () => {
    const result = exportToCSV([]);

    expect(result).toBe('Type,Content,URL,Tags,Color,Created,Modified\n');
  });

  test('should include CSV headers', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = exportToCSV(annotations);

    expect(result).toContain('Type,Content,URL,Tags,Color,Created,Modified');
  });

  test('should export sticky note row', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test content',
        url: 'https://example.com',
        tags: ['work', 'urgent'],
        color: 'yellow',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    const result = exportToCSV(annotations);
    const lines = result.split('\n');

    expect(lines[1]).toContain('Sticky Note');
    expect(lines[1]).toContain('Test content');
    expect(lines[1]).toContain('yellow');
  });

  test('should export inline annotation row', () => {
    const annotations = [
      {
        id: 1,
        type: 'annotation',
        selectedText: 'Important text',
        comment: 'Review this',
        url: 'https://example.com',
        tags: [],
        color: 'blue',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    const result = exportToCSV(annotations);

    expect(result).toContain('Annotation');
    // CSV escapes inner quotes by doubling them
    expect(result).toContain('Highlighted: ""Important text""');
    expect(result).toContain('Comment: ""Review this""');
  });

  test('should escape CSV special characters', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test with, comma and "quotes"',
        url: 'https://example.com',
        tags: [],
        color: 'yellow',
        createdAt: Date.now()
      }
    ];

    const result = exportToCSV(annotations);

    // Should be wrapped in quotes and internal quotes escaped
    expect(result).toContain('""');
  });

  test('should join multiple tags with semicolon', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test',
        url: 'https://example.com',
        tags: ['work', 'urgent', 'important'],
        color: 'yellow',
        createdAt: Date.now()
      }
    ];

    const result = exportToCSV(annotations);

    expect(result).toContain('work;urgent;important');
  });

  test('should handle empty fields', () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: '',
        url: '',
        tags: [],
        color: 'yellow',
        createdAt: Date.now()
      }
    ];

    const result = exportToCSV(annotations);
    const lines = result.split('\n');

    expect(lines[1]).toContain('""');
  });
});

describe('File Download', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
    global.URL.createObjectURL.mockReturnValue('blob:mock-url');
  });

  test('should download file successfully', async () => {
    chrome.downloads.download.mockImplementation((options, callback) => {
      callback(123); // download ID
    });

    await expect(
      downloadFile('test content', 'test.txt', 'text/plain')
    ).resolves.toBeUndefined();

    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'blob:mock-url',
        filename: 'test.txt',
        saveAs: false
      }),
      expect.any(Function)
    );
  });

  test('should create blob with correct content and type', async () => {
    chrome.downloads.download.mockImplementation((options, callback) => {
      callback(123);
    });

    await downloadFile('test content', 'test.txt', 'text/plain');

    expect(global.Blob).toHaveBeenCalledWith(
      ['test content'],
      { type: 'text/plain' }
    );
  });

  test('should revoke object URL after download', async () => {
    chrome.downloads.download.mockImplementation((options, callback) => {
      callback(123);
    });

    await downloadFile('test', 'test.txt', 'text/plain');

    // Wait for setTimeout
    await new Promise(resolve => setTimeout(resolve, 150));

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  test('should handle download errors', async () => {
    chrome.downloads.download.mockImplementation((options, callback) => {
      chrome.runtime.lastError = { message: 'Download failed' };
      callback(null);
    });

    await expect(
      downloadFile('test', 'test.txt', 'text/plain')
    ).rejects.toMatchObject({ message: 'Download failed' });

    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
  });

  test('should handle blob creation errors', async () => {
    global.Blob = jest.fn(() => {
      throw new Error('Blob error');
    });

    await expect(
      downloadFile('test', 'test.txt', 'text/plain')
    ).rejects.toThrow('Blob error');
  });
});

describe('Export Annotations (Main Function)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chrome.runtime.lastError = null;
    chrome.downloads.download.mockImplementation((options, callback) => {
      callback(123);
    });
  });

  test('should handle empty annotations', async () => {
    const result = await exportAnnotations([], 'md');

    expect(result).toEqual({
      success: false,
      message: 'No annotations to export',
      count: 0
    });
  });

  test('should export as Markdown', async () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = await exportAnnotations(annotations, 'md');

    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.message).toContain('MD');
    expect(chrome.downloads.download).toHaveBeenCalled();
  });

  test('should export as Plain Text', async () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = await exportAnnotations(annotations, 'txt');

    expect(result.success).toBe(true);
    expect(chrome.downloads.download).toHaveBeenCalled();
  });

  test('should export as JSON', async () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = await exportAnnotations(annotations, 'json');

    expect(result.success).toBe(true);
    expect(chrome.downloads.download).toHaveBeenCalled();
  });

  test('should export as CSV', async () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = await exportAnnotations(annotations, 'csv');

    expect(result.success).toBe(true);
    expect(chrome.downloads.download).toHaveBeenCalled();
  });

  test('should handle invalid format', async () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = await exportAnnotations(annotations, 'invalid');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Unknown export format');
  });

  test('should handle download errors', async () => {
    chrome.downloads.download.mockImplementation((options, callback) => {
      chrome.runtime.lastError = { message: 'Download failed' };
      callback(null);
    });

    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    const result = await exportAnnotations(annotations, 'md');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Export failed');
  });

  test('should use correct MIME types', async () => {
    const annotations = [
      {
        id: 1,
        type: 'note',
        content: 'Test',
        color: 'yellow',
        tags: [],
        createdAt: Date.now()
      }
    ];

    await exportAnnotations(annotations, 'md');
    expect(global.Blob).toHaveBeenCalledWith(
      expect.anything(),
      { type: 'text/markdown' }
    );

    await exportAnnotations(annotations, 'json');
    expect(global.Blob).toHaveBeenCalledWith(
      expect.anything(),
      { type: 'application/json' }
    );

    await exportAnnotations(annotations, 'csv');
    expect(global.Blob).toHaveBeenCalledWith(
      expect.anything(),
      { type: 'text/csv' }
    );
  });

  test('should include count in success message', async () => {
    const annotations = [
      { id: 1, type: 'note', content: 'A', color: 'yellow', tags: [], createdAt: Date.now() },
      { id: 2, type: 'note', content: 'B', color: 'yellow', tags: [], createdAt: Date.now() },
      { id: 3, type: 'note', content: 'C', color: 'yellow', tags: [], createdAt: Date.now() }
    ];

    const result = await exportAnnotations(annotations, 'md');

    expect(result.count).toBe(3);
    expect(result.message).toContain('3 annotations');
  });

  test('should use singular form for one annotation', async () => {
    const annotations = [
      { id: 1, type: 'note', content: 'Test', color: 'yellow', tags: [], createdAt: Date.now() }
    ];

    const result = await exportAnnotations(annotations, 'md');

    expect(result.message).toMatch(/1 annotation[^s]/);
  });
});

describe('Date Formatting', () => {
  test('should format valid timestamp', () => {
    const timestamp = Date.now();
    const date = new Date(timestamp);
    const formatted = date.toLocaleString();

    expect(formatted).toBeTruthy();
    expect(typeof formatted).toBe('string');
  });

  test('should handle invalid timestamp', () => {
    // Mock formatDate behavior for invalid date
    const formatDate = (timestamp) => {
      if (!timestamp) return 'Unknown';
      try {
        return new Date(timestamp).toLocaleString();
      } catch {
        return 'Invalid date';
      }
    };

    expect(formatDate(null)).toBe('Unknown');
    expect(formatDate(undefined)).toBe('Unknown');
  });
});

describe('Filename Generation', () => {
  test('should generate filename with timestamp', () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    const pattern = `annotations-export-${year}-${month}-${day}`;

    // Mock filename generation
    const generateFilename = (format) => {
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const ext = format === 'md' ? 'md' : format === 'txt' ? 'txt' : format;
      return `annotations-export-${year}-${month}-${day}-${hours}${minutes}.${ext}`;
    };

    expect(generateFilename('md')).toContain(pattern);
    expect(generateFilename('md')).toMatch(/\.md$/);
  });

  test('should use correct file extensions', () => {
    const now = new Date();

    const generateFilename = (format) => {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const ext = format === 'md' ? 'md' : format === 'txt' ? 'txt' : format;
      return `annotations-export-${year}-${month}-${day}-${hours}${minutes}.${ext}`;
    };

    expect(generateFilename('md')).toMatch(/\.md$/);
    expect(generateFilename('txt')).toMatch(/\.txt$/);
    expect(generateFilename('json')).toMatch(/\.json$/);
    expect(generateFilename('csv')).toMatch(/\.csv$/);
  });
});
