# Version Switching Guide

## Quick Start

To switch between AssisT and @NCAD versions:

### Switch to AssisT (Chrome Store Version)

```bash
npm run switch:assist
npm run build
```

### Switch to @NCAD (College Version)

```bash
npm run switch:ncad
npm run build
```

## What Changes?

**AssisT Version:**

- Name: "AssisT: Adaptive Accessibility Tool"
- Description: Universal accessibility extension for all websites
- Target: Chrome Web Store

**@NCAD Version:**

- Name: "@NCAD"
- Description: NCAD accessibility extension for Canvas VLE
- Target: NCAD college deployment

## Files

- `manifest.json` - Active manifest (copied from templates, gets built to Output/)
- `manifest.assist.json` - AssisT version template
- `manifest.ncad.json` - @NCAD version template

## Workflow

1. Run `npm run switch:assist` or `npm run switch:ncad`
2. Run `npm run build` to copy to Output/ directory
3. Reload extension in Chrome
4. Test the version

**Note:** The switching command only updates the root `manifest.json`. You must run `npm run build` after switching to update the `Output/` directory that Chrome loads.
