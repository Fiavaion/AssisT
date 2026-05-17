#!/usr/bin/env node
/**
 * CWS Publish Script
 *
 * Zips .vite/ and uploads to the Chrome Web Store via the Publish API.
 * Optionally submits for review with --publish.
 *
 * Usage:
 *   node scripts/cws-publish.js               # upload only (draft)
 *   node scripts/cws-publish.js --publish      # upload + submit for review
 *   npm run cws:upload
 *   npm run cws:publish
 *   npm run release    # build + upload + publish in one step
 *
 * One-time setup: copy .env.example → .env and fill in your credentials.
 * See docs/CWS_PUBLISH_SETUP.md for how to obtain them.
 */

import 'dotenv/config';
import chromeWebstoreUpload from 'chrome-webstore-upload';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const archiver = require('archiver');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const shouldPublish = args.includes('--publish');
const target = args.includes('--trusted-testers') ? 'trustedTesters' : 'default';

// ── Credentials ───────────────────────────────────────────────────────────────
const { CWS_EXTENSION_ID, CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN } = process.env;

const missing = ['CWS_EXTENSION_ID', 'CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN'].filter(
  k => !process.env[k]
);
if (missing.length) {
  console.error(`\nMissing environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example → .env and fill in your credentials.');
  console.error('See docs/CWS_PUBLISH_SETUP.md for setup instructions.\n');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getVersion() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  return manifest.version;
}

function createZip(version) {
  const zipPath = path.join(ROOT, `assist-v${version}.zip`);
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const kb = Math.round(archive.pointer() / 1024);
      console.log(`  Created: ${path.basename(zipPath)} (${kb} KB)`);
      resolve(zipPath);
    });
    archive.on('error', reject);

    archive.pipe(output);
    // Bundle entire .vite/ directory (Vite build output)
    archive.directory(path.join(ROOT, '.vite'), false);
    archive.finalize();
  });
}

function cleanup(zipPath) {
  try {
    fs.unlinkSync(zipPath);
  } catch {
    // ignore
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const version = getVersion();

  console.log(`\n=== CWS Publish — AssisT v${version} ===\n`);

  // 1. Verify .vite/ exists
  const vitePath = path.join(ROOT, '.vite');
  if (!fs.existsSync(vitePath)) {
    console.error('.vite/ not found. Run `npm run build` first.');
    process.exit(1);
  }

  // 2. Zip .vite/
  process.stdout.write('1. Zipping build output... ');
  const zipPath = await createZip(version);

  // 3. Upload
  console.log('2. Uploading to Chrome Web Store...');
  const store = chromeWebstoreUpload({
    extensionId: CWS_EXTENSION_ID,
    clientId: CWS_CLIENT_ID,
    clientSecret: CWS_CLIENT_SECRET,
    refreshToken: CWS_REFRESH_TOKEN,
  });

  let uploadResult;
  try {
    uploadResult = await store.uploadExisting(fs.createReadStream(zipPath));
  } catch (err) {
    cleanup(zipPath);
    console.error('\nUpload error:', err.message);
    process.exit(1);
  }

  cleanup(zipPath);

  if (uploadResult.uploadState !== 'SUCCESS') {
    console.error(`\nUpload failed (${uploadResult.uploadState}):`);
    (uploadResult.itemError || []).forEach(e => console.error(' -', e.error_detail));
    process.exit(1);
  }
  console.log(`  Upload: ${uploadResult.uploadState} ✓`);

  // 4. Publish (optional)
  if (!shouldPublish) {
    console.log('\n3. Skipped — run with --publish to submit for review.');
    console.log('   Or go to: https://chrome.google.com/webstore/devconsole\n');
    return;
  }

  const targetLabel = target === 'trustedTesters' ? 'trusted testers' : 'all users';
  console.log(`3. Submitting for review (target: ${targetLabel})...`);

  let publishResult;
  try {
    publishResult = await store.publish(target);
  } catch (err) {
    console.error('\nPublish error:', err.message);
    process.exit(1);
  }

  const status = publishResult.status || [];
  if (status.includes('OK')) {
    console.log('  Published ✓ — Google review usually takes a few hours for code-only updates.\n');
  } else {
    console.error('\nPublish response:', JSON.stringify(publishResult, null, 2));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
