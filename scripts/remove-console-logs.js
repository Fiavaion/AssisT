/**
 * Console.log Removal Script for CWS Production Build
 *
 * Removes console.log statements from source files while preserving:
 * - console.warn (legitimate warnings)
 * - console.error (error reporting)
 * - JSDoc examples (documentation)
 * - Test files
 *
 * Run: node scripts/remove-console-logs.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

// Files/patterns to skip
const SKIP_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /test\.html$/,
  /_TEMPLATE_/,
];

// Track statistics
let totalRemoved = 0;
let filesModified = 0;
const fileStats = [];

/**
 * Check if file should be skipped
 */
function shouldSkip(filePath) {
  const relativePath = path.relative(rootDir, filePath);
  return SKIP_PATTERNS.some(pattern => pattern.test(relativePath));
}

/**
 * Check if a console.log is inside a JSDoc comment
 */
function isInJSDoc(content, index) {
  // Look backwards for /** and check if we're still inside it
  const before = content.substring(Math.max(0, index - 500), index);
  const lastDocStart = before.lastIndexOf('/**');
  const lastDocEnd = before.lastIndexOf('*/');

  // If we found a doc start after the last doc end, we're in a JSDoc
  if (lastDocStart > lastDocEnd) {
    return true;
  }

  // Also check for @example tag nearby
  const lineStart = content.lastIndexOf('\n', index);
  const prevLines = content.substring(Math.max(0, lineStart - 200), lineStart);
  if (prevLines.includes('@example') || prevLines.includes('* Example:')) {
    return true;
  }

  return false;
}

/**
 * Remove console.log statements from content
 * Handles single-line and multi-line cases
 */
function removeConsoleLogs(content, filePath) {
  let removedCount = 0;
  const relativePath = path.relative(rootDir, filePath);

  // Pattern to match console.log statements
  // Handles: console.log('...'), console.log(`...`), console.log(...) with nested parens
  const patterns = [
    // Single line console.log with semicolon
    /^\s*console\.log\([^)]*\);\s*\n?/gm,
    // Multi-line console.log (handles template literals and nested calls)
    /^\s*console\.log\([\s\S]*?\);\s*\n?/gm,
  ];

  let newContent = content;

  // First pass: mark JSDoc examples to preserve them
  const preserveMarkers = [];
  let match;
  const logRegex = /console\.log\(/g;

  while ((match = logRegex.exec(content)) !== null) {
    if (isInJSDoc(content, match.index)) {
      preserveMarkers.push(match.index);
    }
  }

  // Remove console.log statements line by line for better control
  const lines = newContent.split('\n');
  const newLines = [];
  let inMultiLineLog = false;
  let parenDepth = 0;
  let multiLineStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check if this line starts a console.log
    if (!inMultiLineLog && trimmed.match(/^\s*console\.log\(/)) {
      // Check if it's in a JSDoc by looking at previous lines
      const prevLines = lines.slice(Math.max(0, i - 10), i).join('\n');
      const inDoc = prevLines.includes('/**') && !prevLines.includes('*/') ||
                    prevLines.includes('@example') ||
                    prevLines.includes('* Example');

      if (inDoc) {
        newLines.push(line);
        continue;
      }

      // Count parentheses to handle multi-line
      parenDepth = 0;
      for (const char of line) {
        if (char === '(') parenDepth++;
        if (char === ')') parenDepth--;
      }

      if (parenDepth === 0 && line.includes(');')) {
        // Single line - remove it
        removedCount++;
        continue;
      } else {
        // Multi-line console.log
        inMultiLineLog = true;
        multiLineStart = i;
        continue;
      }
    }

    // Continue multi-line console.log
    if (inMultiLineLog) {
      for (const char of line) {
        if (char === '(') parenDepth++;
        if (char === ')') parenDepth--;
      }

      if (parenDepth <= 0 && line.includes(');')) {
        // End of multi-line console.log
        inMultiLineLog = false;
        removedCount++;
        continue;
      }
      // Skip this line (part of multi-line log)
      continue;
    }

    newLines.push(line);
  }

  newContent = newLines.join('\n');

  // Clean up any double blank lines created by removal
  newContent = newContent.replace(/\n\n\n+/g, '\n\n');

  return { content: newContent, removed: removedCount };
}

/**
 * Process a single file
 */
function processFile(filePath) {
  if (shouldSkip(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Skip if no console.log
  if (!content.includes('console.log')) {
    return;
  }

  const { content: newContent, removed } = removeConsoleLogs(content, filePath);

  if (removed > 0) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    totalRemoved += removed;
    filesModified++;
    fileStats.push({ file: path.relative(rootDir, filePath), removed });
  }
}

/**
 * Recursively process directory
 */
function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and hidden directories
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      processDirectory(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      processFile(fullPath);
    }
  }
}

// Main execution
console.log('=== Console.log Removal Script ===\n');
console.log(`Processing: ${srcDir}\n`);

processDirectory(srcDir);

console.log('\n=== Results ===');
console.log(`Files modified: ${filesModified}`);
console.log(`Total console.log removed: ${totalRemoved}`);
console.log('\nModified files:');
fileStats.forEach(({ file, removed }) => {
  console.log(`  ${file}: ${removed} removed`);
});

console.log('\n✓ Done! Run "npm run build" to verify.');
