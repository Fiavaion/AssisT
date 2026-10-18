#!/usr/bin/env node
/**
 * CWS Publish Script
 *
 * Zips .vite/ and uploads to the Chrome Web Store via the Publish API.
 * Optionally submits for review with --publish.
 *
 * Usage:
 *   node scripts/cws-publish.js               # upload only (draft)
 *   node scripts/cws-publish.js --publish      # upload + submit for review (all users)
 *   npm run cws:upload
 *   npm run cws:publish
 *   npm run release    # build + upload + publish in one step
 *
 * One-time setup: copy .env.example → .env and fill in your credentials.
 * .env.example says where each value comes from.
 */

import 'dotenv/config';
import chromeWebstoreUpload from 'chrome-webstore-upload';
import { ZipArchive } from 'archiver';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const shouldPublish = args.includes('--publish');

// ── Credentials ───────────────────────────────────────────────────────────────
const { CWS_EXTENSION_ID, CWS_PUBLISHER_ID, CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN } =
  process.env;

const missing = [
  'CWS_EXTENSION_ID',
  'CWS_PUBLISHER_ID',
  'CWS_CLIENT_ID',
  'CWS_CLIENT_SECRET',
  'CWS_REFRESH_TOKEN',
].filter(k => !process.env[k]);
if (missing.length) {
  console.error(`\nMissing environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example → .env and fill in your credentials.');
  console.error('.env.example says where each value comes from.\n');
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
    const archive = new ZipArchive({ zlib: { level: 9 } });

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
    publisherId: CWS_PUBLISHER_ID,
    clientId: CWS_CLIENT_ID,
    clientSecret: CWS_CLIENT_SECRET,
    refreshToken: CWS_REFRESH_TOKEN,
  });

  let uploadResult;
  try {
    // The v2 API can answer IN_PROGRESS while it unpacks a large package; wait up to two minutes.
    uploadResult = await store.uploadExisting(fs.createReadStream(zipPath), undefined, 120);
  } catch (err) {
    cleanup(zipPath);
    console.error('\nUpload error:', err.message);
    process.exit(1);
  }

  cleanup(zipPath);

  if (uploadResult.uploadState !== 'SUCCEEDED') {
    console.error(`\nUpload not accepted (${uploadResult.uploadState}):`);
    console.error(JSON.stringify(uploadResult, null, 2));
    console.error('Check the item in the developer dashboard for the reason.');
    process.exit(1);
  }
  console.log(`  Upload: ${uploadResult.uploadState} ✓`);

  // 4. Publish (optional)
  if (!shouldPublish) {
    console.log('\n3. Skipped — run with --publish to submit for review.');
    console.log('   Or go to: https://chrome.google.com/webstore/devconsole\n');
    return;
  }

  console.log('3. Submitting for review...');

  let publishResult;
  try {
    publishResult = await store.publish('DEFAULT_PUBLISH');
  } catch (err) {
    console.error('\nPublish error:', err.message);
    process.exit(1);
  }

  if (publishResult.warningInfo) {
    console.warn('  Warnings:', JSON.stringify(publishResult.warningInfo, null, 2));
  }
  if (['PENDING_REVIEW', 'STAGED', 'PUBLISHED'].includes(publishResult.state)) {
    console.log(
      `  Submitted ✓ (${publishResult.state}). Follow the review in the developer dashboard.\n`
    );
  } else {
    console.error('\nPublish response:', JSON.stringify(publishResult, null, 2));
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
