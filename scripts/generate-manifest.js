#!/usr/bin/env node

/**
 * Generate manifest.json from manifest.config.json
 *
 * Usage:
 *   node scripts/generate-manifest.js [variant]
 *
 * Variants: assist (default), ncad, llm
 *
 * This script merges the base manifest with variant-specific settings
 * to create a single manifest.json file. This approach ensures:
 * - Single source of truth for common settings
 * - Easy switching between branding variants
 * - No duplicate maintenance of manifest files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get variant from command line args (default: assist)
const variant = process.argv[2] || 'assist';

// Read config file
const configPath = path.join(__dirname, '../manifest.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Validate variant exists
if (!config.variants[variant]) {
  console.error(`❌ Error: Variant "${variant}" not found in manifest.config.json`);
  console.error(`Available variants: ${Object.keys(config.variants).join(', ')}`);
  process.exit(1);
}

// Merge base with variant
const variantConfig = config.variants[variant];
const manifest = {
  ...config.base,
  name: variantConfig.name,
  description: variantConfig.description,
  permissions: variantConfig.permissions,
  host_permissions: variantConfig.host_permissions,
  action: {
    ...config.base.action,
    default_title: variantConfig.default_title
  }
};

// Add declarative_net_request if it exists in variant (for LLM version)
if (variantConfig.declarative_net_request) {
  manifest.declarative_net_request = variantConfig.declarative_net_request;
}

// Write manifest.json
const manifestPath = path.join(__dirname, '../manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`✅ Generated manifest.json for variant: ${variant}`);
console.log(`   Name: ${manifest.name}`);
console.log(`   Title: ${manifest.action.default_title}`);
