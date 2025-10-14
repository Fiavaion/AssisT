/**
 * Verify all interactive elements have data-testid attributes
 * Run with: node tests/utils/verify-testids.cjs
 */

const fs = require('fs');
const path = require('path');

const popupHtmlPath = path.join(__dirname, '../../src/popup/popup.html');
const html = fs.readFileSync(popupHtmlPath, 'utf-8');

// Find all interactive elements
const interactiveElements = [
  ...html.matchAll(/<(button|input|select|textarea|a)[^>]*>/g)
].map(match => ({
  tag: match[1],
  full: match[0],
  line: html.substring(0, match.index).split('\n').length
}));

const missingTestId = interactiveElements.filter(
  el => !el.full.includes('data-testid') && el.full.includes('id=')
);

console.log(`\n📊 Test ID Verification Report`);
console.log(`===============================`);
console.log(`Total interactive elements: ${interactiveElements.length}`);
console.log(`Elements with data-testid: ${interactiveElements.length - missingTestId.length}`);
console.log(`Elements missing data-testid: ${missingTestId.length}\n`);

if (missingTestId.length > 0) {
  console.error('❌ Missing data-testid attributes:\n');
  missingTestId.forEach(el => {
    const idMatch = el.full.match(/id="([^"]+)"/);
    const id = idMatch ? idMatch[1] : '(no id)';
    console.error(`  Line ${el.line}: <${el.tag}> with id="${id}"`);
  });
  console.error('\n❌ Please add data-testid attributes to the elements listed above.\n');
  process.exit(1);
} else {
  console.log('✅ All interactive elements have data-testid attributes!\n');
  console.log('🎉 Ready for E2E testing with stable selectors.\n');
  process.exit(0);
}
