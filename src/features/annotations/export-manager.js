/**
 * @fileoverview Export Manager for Annotations
 *
 * ARCHITECTURAL PATTERN: Utility Module
 *
 * Provides export functionality for annotations and sticky notes in multiple
 * formats (Markdown, Plain Text, JSON, CSV) with support for chrome.downloads API.
 *
 * FEATURES:
 * - Export to Markdown with hierarchical structure and metadata
 * - Export to Plain Text (no formatting)
 * - Export to JSON (array of objects)
 * - Export to CSV with standard columns
 * - Automatic filename with timestamp (annotations-export-YYYY-MM-DD-HHmm.ext)
 * - Success toast notifications with export count
 * - WCAG 2.2 Level AA compliant
 *
 * DEPENDENCIES:
 * - None (uses standard Chrome APIs)
 *
 * @module features/annotations/export-manager
 */

/**
 * Export annotations to Markdown format with hierarchical structure
 * @param {Array<Object>} annotations - Array of annotation objects
 * @returns {string} Markdown content
 */
export function exportToMarkdown(annotations) {
  if (!annotations || annotations.length === 0) {
    return '# Annotations Export\n\nNo annotations to export.\n';
  }

  let markdown = '# Annotations Export\n\n';
  markdown += `Generated: ${new Date().toLocaleString()}\n`;
  markdown += `Total: ${annotations.length} item(s)\n\n`;
  markdown += '---\n\n';

  // Group by type
  const notesByType = {
    note: [],
    annotation: [],
  };

  annotations.forEach(ann => {
    if (ann.type === 'note') {
      notesByType.note.push(ann);
    } else {
      notesByType.annotation.push(ann);
    }
  });

  // Export sticky notes
  if (notesByType.note.length > 0) {
    markdown += '## Sticky Notes\n\n';
    notesByType.note.forEach((note, index) => {
      markdown += exportMarkdownNote(note, index + 1);
    });
    markdown += '\n---\n\n';
  }

  // Export inline annotations
  if (notesByType.annotation.length > 0) {
    markdown += '## Inline Annotations\n\n';
    notesByType.annotation.forEach((ann, index) => {
      markdown += exportMarkdownAnnotation(ann, index + 1);
    });
  }

  return markdown;
}

/**
 * Format a sticky note as Markdown
 * @param {Object} note - Sticky note object
 * @param {number} index - Sequential index
 * @returns {string} Markdown formatted note
 */
function exportMarkdownNote(note, index) {
  let md = `### Sticky Note ${index}\n\n`;
  md += `**Content:**\n${note.content}\n\n`;
  md += `**Metadata:**\n`;
  md += `- Color: ${note.color || 'yellow'}\n`;
  md += `- Created: ${formatDate(note.createdAt)}\n`;
  md += `- Modified: ${formatDate(note.updatedAt || note.createdAt)}\n`;

  if (note.tags && note.tags.length > 0) {
    md += `- Tags: ${note.tags.join(', ')}\n`;
  }

  if (note.url) {
    md += `- URL: ${note.url}\n`;
  }

  md += '\n';
  return md;
}

/**
 * Format an inline annotation as Markdown
 * @param {Object} annotation - Inline annotation object
 * @param {number} index - Sequential index
 * @returns {string} Markdown formatted annotation
 */
function exportMarkdownAnnotation(annotation, index) {
  let md = `### Annotation ${index}\n\n`;

  if (annotation.selectedText) {
    md += `**Highlighted Text:**\n> ${annotation.selectedText}\n\n`;
  }

  if (annotation.comment) {
    md += `**Comment:**\n${annotation.comment}\n\n`;
  }

  md += `**Metadata:**\n`;
  md += `- Color: ${annotation.color || 'yellow'}\n`;
  md += `- Created: ${formatDate(annotation.createdAt)}\n`;
  md += `- Modified: ${formatDate(annotation.updatedAt || annotation.createdAt)}\n`;

  if (annotation.tags && annotation.tags.length > 0) {
    md += `- Tags: ${annotation.tags.join(', ')}\n`;
  }

  if (annotation.url) {
    md += `- URL: ${annotation.url}\n`;
  }

  md += '\n';
  return md;
}

/**
 * Export annotations to Plain Text format (no formatting)
 * @param {Array<Object>} annotations - Array of annotation objects
 * @returns {string} Plain text content
 */
export function exportToPlainText(annotations) {
  if (!annotations || annotations.length === 0) {
    return 'ANNOTATIONS EXPORT\n\nNo annotations to export.\n';
  }

  let text = 'ANNOTATIONS EXPORT\n';
  text += `Generated: ${new Date().toLocaleString()}\n`;
  text += `Total: ${annotations.length} item(s)\n`;
  text += '---\n\n';

  annotations.forEach((ann, index) => {
    text += `[${index + 1}] ${ann.type === 'note' ? 'STICKY NOTE' : 'ANNOTATION'}\n`;

    if (ann.type === 'note') {
      text += `Content: ${ann.content || '(empty)'}\n`;
    } else {
      if (ann.selectedText) {
        text += `Highlighted: ${ann.selectedText}\n`;
      }
      if (ann.comment) {
        text += `Comment: ${ann.comment}\n`;
      }
    }

    text += `Color: ${ann.color || 'yellow'}\n`;
    text += `Created: ${formatDate(ann.createdAt)}\n`;
    text += `Modified: ${formatDate(ann.updatedAt || ann.createdAt)}\n`;

    if (ann.tags && ann.tags.length > 0) {
      text += `Tags: ${ann.tags.join(', ')}\n`;
    }

    if (ann.url) {
      text += `URL: ${ann.url}\n`;
    }

    text += '\n';
  });

  return text;
}

/**
 * Export annotations to JSON format (array of objects)
 * @param {Array<Object>} annotations - Array of annotation objects
 * @returns {string} JSON content (pretty-printed)
 */
export function exportToJSON(annotations) {
  if (!annotations || annotations.length === 0) {
    return JSON.stringify(
      {
        metadata: {
          version: '1.0',
          generated: new Date().toISOString(),
          total: 0,
        },
        annotations: [],
      },
      null,
      2
    );
  }

  const exportData = {
    metadata: {
      version: '1.0',
      generated: new Date().toISOString(),
      total: annotations.length,
    },
    annotations: annotations.map(ann => ({
      id: ann.id,
      type: ann.type,
      content: ann.content || null,
      selectedText: ann.selectedText || null,
      comment: ann.comment || null,
      color: ann.color || 'yellow',
      tags: ann.tags || [],
      url: ann.url || null,
      position: ann.position || null,
      createdAt: ann.createdAt,
      updatedAt: ann.updatedAt || ann.createdAt,
    })),
  };

  return JSON.stringify(exportData, null, 2);
}

/**
 * Export annotations to CSV format
 * @param {Array<Object>} annotations - Array of annotation objects
 * @returns {string} CSV content
 */
export function exportToCSV(annotations) {
  if (!annotations || annotations.length === 0) {
    return 'Type,Content,URL,Tags,Color,Created,Modified\n';
  }

  // CSV headers
  const headers = ['Type', 'Content', 'URL', 'Tags', 'Color', 'Created', 'Modified'];
  let csv = headers.join(',') + '\n';

  // CSV rows
  annotations.forEach(ann => {
    const type = ann.type === 'note' ? 'Sticky Note' : 'Annotation';

    // Combine content sources
    let content = '';
    if (ann.type === 'note') {
      content = ann.content || '';
    } else {
      if (ann.selectedText) {
        content = `Highlighted: "${ann.selectedText}"`;
      }
      if (ann.comment) {
        content += (content ? ' | ' : '') + `Comment: "${ann.comment}"`;
      }
    }

    const url = ann.url || '';
    const tags = (ann.tags || []).join(';');
    const color = ann.color || 'yellow';
    const created = formatDate(ann.createdAt);
    const modified = formatDate(ann.updatedAt || ann.createdAt);

    // Escape CSV values (wrap in quotes if contain comma or quotes)
    const row = [
      escapeCSV(type),
      escapeCSV(content),
      escapeCSV(url),
      escapeCSV(tags),
      escapeCSV(color),
      escapeCSV(created),
      escapeCSV(modified),
    ];

    csv += row.join(',') + '\n';
  });

  return csv;
}

/**
 * Escape CSV field values
 * @param {string} field - Field value
 * @returns {string} Escaped field
 */
function escapeCSV(field) {
  if (!field) {
    return '""';
  }

  field = String(field);

  // If field contains comma, quotes, or newlines, wrap in quotes and escape quotes
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }

  return field;
}

/**
 * Format timestamp to readable date string
 * @param {number} timestamp - Unix timestamp (milliseconds)
 * @returns {string} Formatted date string
 */
function formatDate(timestamp) {
  if (!timestamp) {
    return 'Unknown';
  }

  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return 'Invalid date';
  }
}

/**
 * Generate filename with timestamp
 * @param {string} format - Export format ('md', 'txt', 'json', 'csv')
 * @returns {string} Filename
 */
function generateFilename(format) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  const extension =
    format === 'md' ? 'md' : format === 'txt' ? 'txt' : format === 'json' ? 'json' : 'csv';

  return `annotations-export-${year}-${month}-${day}-${hours}${minutes}.${extension}`;
}

/**
 * Download file using Chrome downloads API
 * @param {string} content - File content
 * @param {string} filename - Filename
 * @param {string} mimeType - MIME type
 * @returns {Promise<void>}
 */
export function downloadFile(content, filename, mimeType) {
  return new Promise((resolve, reject) => {
    try {
      // Create blob
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);

      // Use chrome.downloads API
      chrome.downloads.download(
        {
          url: url,
          filename: filename,
          saveAs: false,
        },
        downloadId => {
          if (chrome.runtime.lastError) {
            console.error('[ExportManager] Download failed:', chrome.runtime.lastError);
            URL.revokeObjectURL(url);
            reject(chrome.runtime.lastError);
          } else {
            console.log(`[ExportManager] File downloaded: ${filename} (ID: ${downloadId})`);

            // Revoke blob URL after download
            setTimeout(() => {
              URL.revokeObjectURL(url);
            }, 100);

            resolve();
          }
        }
      );
    } catch (error) {
      console.error('[ExportManager] Error creating download:', error);
      reject(error);
    }
  });
}

/**
 * Export annotations in specified format and download
 * @param {Array<Object>} annotations - Annotations to export
 * @param {string} format - Export format: 'md', 'txt', 'json', or 'csv'
 * @returns {Promise<{success: boolean, message: string, count: number}>}
 */
export async function exportAnnotations(annotations, format) {
  if (!annotations || annotations.length === 0) {
    return {
      success: false,
      message: 'No annotations to export',
      count: 0,
    };
  }

  try {
    let content = '';
    let mimeType = 'text/plain';

    // Generate content based on format
    switch (format.toLowerCase()) {
      case 'md':
      case 'markdown':
        content = exportToMarkdown(annotations);
        mimeType = 'text/markdown';
        break;

      case 'txt':
      case 'text':
        content = exportToPlainText(annotations);
        mimeType = 'text/plain';
        break;

      case 'json':
        content = exportToJSON(annotations);
        mimeType = 'application/json';
        break;

      case 'csv':
        content = exportToCSV(annotations);
        mimeType = 'text/csv';
        break;

      default:
        return {
          success: false,
          message: `Unknown export format: ${format}`,
          count: 0,
        };
    }

    // Generate filename
    const extension = format === 'markdown' ? 'md' : format === 'text' ? 'txt' : format;
    const filename = generateFilename(extension);

    // Download file
    await downloadFile(content, filename, mimeType);

    return {
      success: true,
      message: `Exported ${annotations.length} annotation${annotations.length !== 1 ? 's' : ''} as ${format.toUpperCase()}`,
      count: annotations.length,
    };
  } catch (error) {
    console.error('[ExportManager] Export failed:', error);
    return {
      success: false,
      message: `Export failed: ${error.message}`,
      count: 0,
    };
  }
}
