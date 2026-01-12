# Switching Extension Variants - New System

## Overview

The extension now uses a **variable-based manifest system** with a single source of truth. All branding variants are defined in [manifest.config.json](manifest.config.json), and manifest.json is generated automatically.

## Quick Commands

```bash
# Switch to AssisT branding
npm run switch:assist

# Switch to @NCAD branding
npm run switch:ncad

# Switch to LLM version (AssisT with AI features)
npm run switch:llm

# After switching, rebuild the extension
npm run build
```

## How It Works

### 1. Configuration File: `manifest.config.json`

This is the **single source of truth** for all extension variants. It contains:

- **`variants`**: Branding-specific settings (name, description, title, permissions)
  - `assist`: AssisT branding (universal accessibility)
  - `ncad`: @NCAD branding (Canvas VLE focused)
  - `llm`: AssisT with AI features (Ollama/Claude API support)

- **`base`**: Common settings shared by all variants (icons, scripts, resources, etc.)

### 2. Generation Script: `scripts/generate-manifest.js`

This script:

- Reads `manifest.config.json`
- Merges the `base` configuration with the selected `variant`
- Writes the final `manifest.json`

### 3. npm Scripts

Package.json includes convenient scripts:

```json
{
  "switch:assist": "node scripts/generate-manifest.js assist",
  "switch:ncad": "node scripts/generate-manifest.js ncad",
  "switch:llm": "node scripts/generate-manifest.js llm"
}
```

## Editing Extension Settings

### To change branding-specific settings:

Edit [manifest.config.json](manifest.config.json) under `variants`:

```json
{
  "variants": {
    "ncad": {
      "name": "@NCAD", // ← Change extension name here
      "description": "...", // ← Change description here
      "default_title": "@NCAD - Adaptive Accessibility" // ← Change popup title here
    }
  }
}
```

### To change settings common to all variants:

Edit [manifest.config.json](manifest.config.json) under `base`:

```json
{
  "base": {
    "version": "0.1.0",  // ← Change version here
    "web_accessible_resources": [...]  // ← Add resources here
  }
}
```

### After editing manifest.config.json:

```bash
# Regenerate manifest for current variant
npm run switch:assist  # (or switch:ncad, switch:llm)

# Rebuild extension
npm run build
```

## Benefits of New System

✅ **Single source of truth** - No duplicate manifest files to maintain
✅ **No sync issues** - Base settings automatically apply to all variants
✅ **Easy to extend** - Add new variants by editing one config file
✅ **Version control friendly** - See exactly what changed in git diffs
✅ **Error prevention** - Can't have mismatched resource paths between variants

## Migration Notes

The old system used separate files:

- ~~`manifest.assist.json`~~ (deprecated)
- ~~`manifest.ncad.json`~~ (deprecated)
- ~~`manifest.llm.json`~~ (deprecated)

These files can be safely deleted. All their settings are now in [manifest.config.json](manifest.config.json).

## Troubleshooting

**Q: I changed manifest.config.json but nothing changed?**
A: Run `npm run switch:[variant]` to regenerate manifest.json

**Q: Which file should I edit?**
A: **Never edit** `manifest.json` directly. Always edit `manifest.config.json` and regenerate.

**Q: How do I add a new variant?**
A: Add a new entry under `variants` in manifest.config.json, then add a corresponding npm script.

**Q: Build fails with "Could not load manifest asset"?**
A: Check that paths in `manifest.config.json` → `base` → `web_accessible_resources` are correct.
