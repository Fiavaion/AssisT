#!/usr/bin/env node
/**
 * Post-build script to inject bundled script/CSS tags into popup.html
 * Vite/CRXJS strips the script tag but doesn't auto-inject it for popups
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Find the built popup HTML
const popupHtmlPath = path.join(projectRoot, '.vite', 'src', 'popup', 'popup.html');
const assetsDir = path.join(projectRoot, '.vite', 'assets');

console.log('[Inject Scripts] Starting...');

// Read popup HTML
let html = fs.readFileSync(popupHtmlPath, 'utf-8');

// Find popup assets (script and CSS with hashed names)
const assets = fs.readdirSync(assetsDir);
const popupJs = assets.find(f => f.startsWith('popup.html-') && f.endsWith('.js'));
const popupCss = assets.find(f => f.startsWith('popup-') && f.endsWith('.css'));

if (!popupJs || !popupCss) {
  console.error('[Inject Scripts] ERROR: Could not find popup assets!');
  console.error('  Looking for: popup.html-*.js and popup-*.css');
  console.error('  Found:', assets.filter(f => f.includes('popup')));
  process.exit(1);
}

console.log('[Inject Scripts] Found assets:');
console.log('  JS:', popupJs);
console.log('  CSS:', popupCss);

// Remove any existing script/link tags for popup assets (cleanup)
html = html.replace(/<script[^>]*popup\.html-[^>]*><\/script>/g, '');
html = html.replace(/<link[^>]*popup-[^>]*>/g, '');

// Inject before </body>
const scriptTags = `  <script type="module" crossorigin src="../../assets/${popupJs}"></script>
  <link rel="stylesheet" crossorigin href="../../assets/${popupCss}">`;

html = html.replace('</body>', `${scriptTags}\n</body>`);

// Write back
fs.writeFileSync(popupHtmlPath, html, 'utf-8');

console.log('[Inject Scripts] ✓ Successfully injected script tags');
console.log('[Inject Scripts] Done!');
