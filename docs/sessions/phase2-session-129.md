# Phase 2 Session 129 - YouTube MCP Server & Channel Management

**Date**: 2026-05-28
**Duration**: ~2 hours
**Phase**: Phase 2 - Launch & Content
**Progress**: N/A (tooling/infrastructure, no extension code changes)

---

## Session Overview

**Goal**: Set up a YouTube MCP server connected to the FiavaionTuts channel so that video titles, descriptions, thumbnails, and uploads can be managed directly from Claude Code without opening YouTube Studio.

**Status**: ✅ Complete

---

## Accomplishments

### Features Completed
- [x] Custom 3-tool YouTube MCP server built from scratch (`yt_list`, `yt_get`, `yt_update`)
- [x] `yt_upload` tool added with automatic thumbnail, playlist, and not-for-kids defaults
- [x] OAuth2 authentication flow completed against FiavaionTuts Google Cloud project
- [x] MCP server registered at user scope in Claude Code (`claude mcp add --scope user youtube`)
- [x] Global `~/.claude/CLAUDE.md` created with "never ask user to run commands you can run yourself" rule
- [x] Bulk title standardisation — all 16 how-to videos now prefixed `AssisT - How To - `
- [x] `017_Magnification.mp4` uploaded and scheduled for 2026-05-29 09:00 IST

### Files Created / Modified
- `C:\Users\jones\AIprojects\youtube-mcp\server.js` — MCP server (4 tools, ~260 lines)
- `C:\Users\jones\AIprojects\youtube-mcp\auth.js` — OAuth2 browser flow
- `C:\Users\jones\AIprojects\youtube-mcp\package.json` — deps: `@modelcontextprotocol/sdk`, `googleapis`
- `C:\Users\jones\AIprojects\youtube-mcp\.gitignore` — excludes credentials.json, tokens.json
- `C:\Users\jones\AIprojects\youtube-mcp\upload-once.js` — one-off upload script (reusable template)
- `C:\Users\jones\AIprojects\youtube-mcp\credentials.json` — gitignored OAuth client (FiavaionTuts Desktop)
- `C:\Users\jones\AIprojects\youtube-mcp\tokens.json` — gitignored OAuth token (auto-refreshes)
- `C:\Users\jones\.claude\CLAUDE.md` — global Claude Code rule: run commands directly

### YouTube Channel Changes Made
- 9 video titles updated to use consistent `AssisT - How To - ` prefix
- `017_Magnification.mp4` uploaded (video ID: `cCPe5j4pLwc`, scheduled 2026-05-29T08:00:00Z)
- `selfDeclaredMadeForKids: false` applied to Magnification video

---

## Decisions Made

**Decision**: Build a custom minimal 3-tool MCP server rather than use a pre-built package (hakanoz203/youtube-channel-mcp, pauling-ai/youtube-mcp-server).
- **Reason**: Pre-built servers load 10–40 tools into context on every session; user explicitly wanted token efficiency. Custom server exposes only what's needed.
- **Impact**: Lower context overhead per conversation; full control over tool shapes and defaults.
- **Alternatives**: `youtube-studio-mcp` (npm, 10 tools) and `pauling-ai/youtube-mcp-server` (Python, 40 tools) both rejected on token grounds.

**Decision**: `yt_upload` defaults — `selfDeclaredMadeForKids: false`, AssisT How-To Guides playlist, most-recently-modified file in `D:\AssisT_HowTo\Output\Thumbs\` as thumbnail.
- **Reason**: These settings are the same for every how-to video; baking them in removes manual steps.
- **Impact**: Future uploads require only path + title + description from the caller.
- **Workflow**: User saves the thumbnail in Photoshop immediately before triggering the upload; `mostRecentFile()` picks it up automatically.

**Decision**: OAuth credentials reused from existing `FiavaionTuts` Desktop client (Google Cloud project `fiavaiontuts`), rather than creating a new credential.
- **Reason**: YouTube Data API v3 already enabled on this project; avoids project sprawl.
- **Impact**: Client secret stored locally in gitignored `credentials.json`.

**Decision**: Global `~/.claude/CLAUDE.md` created to enforce "run commands directly" rule.
- **Reason**: User called out that asking them to run `node auth.js` was unnecessary when Bash tool with `run_in_background: true` can do it.
- **Impact**: Rule applies across all projects in all future sessions.

---

## Challenges

**Challenge**: Google Cloud Console new UI removed the "Download JSON" button for existing OAuth credentials — client secret was masked.
- **Solution**: User clicked "+ Add secret" and shared the new secret; credentials.json built manually.
- **Lesson**: Always check UI state before assuming a standard flow; have a fallback (manual JSON construction).

**Challenge**: `auth.js` used `exec('start "" url')` which doesn't work in Bash shell on Windows.
- **Solution**: Changed to `exec('cmd.exe /c start "" url')` with PowerShell fallback; printed URL prominently between `===` banners so user can copy-paste if needed.

**Challenge**: `mostRecentFile()` picked `thumb023.jpg` (Pomodoro Timer) for the Magnification upload instead of `thumb018.jpg` (Magnifying Lens) because all thumbnails were batch-created on the same day.
- **Solution**: Corrected by reading the thumbnail files visually; user clarified the workflow (they edit the specific thumb right before uploading, making it the freshest file at upload time). `thumb018.jpg` applied manually.
- **Lesson**: Read thumbnail files before applying to confirm content. The `mostRecentFile()` approach is correct for the intended workflow but requires the user to save the thumb immediately before triggering the upload.

---

## Technical Insights

- YouTube Data API `videos.insert` with `status.publishAt` requires `privacyStatus: "private"` — YouTube auto-publishes at the scheduled time.
- Thumbnail upload uses `thumbnails.set` separately from `videos.insert` (two API calls).
- Playlist membership uses `playlistItems.insert` — also a separate call.
- `selfDeclaredMadeForKids` goes in the `status` part, not `snippet`. Updating it requires fetching existing status first and spreading to preserve `publishAt`.
- `googleapis` library handles resumable upload chunking automatically when given a `ReadStream` as `media.body`.
- MCP servers registered with `claude mcp add --scope user` are stored in `~/.claude.json` (not `~/.claude/settings.json`).
- MCP tool schemas are lazy-loaded (deferred) after server reconnects — always run `ToolSearch` before calling a tool if there's been a disconnect.

---

## Thumbnail Mapping (for reference)

Thumbnails in `D:\AssisT_HowTo\Output\Thumbs\` map sequentially to videos:

| Thumb | Content |
|-------|---------|
| thumb000 | AssisT (promo) |
| thumb001 | Install |
| thumb002 | First Setup |
| thumb003 | Browser AI |
| thumb004 | Local AI (Ollama) |
| thumb005 | Cloud AI |
| thumb006 | Read Aloud |
| thumb007 | Reading Mode |
| thumb008 | Dyslexia Mode |
| thumb009 | OCR |
| thumb010 | Speech to Text |
| thumb011 | Quick Actions Menu |
| thumb012 | Text Customisation |
| thumb013 | Reading Guide |
| thumb014 | Reading Progress |
| thumb015 | Speed Read (RSVP) |
| thumb016 | Sticky Notes |
| thumb017 | Custom Cursor |
| thumb018 | Magnifying Lens ← last used |
| thumb019 | Focus Mode |
| thumb020 | Screen Colour Overlay |
| thumb021 | Reduced Motion |
| thumb022–023 | Pomodoro Timer |

---

## Next Session

**Status**: ✅ Complete
**Next Task**: Footer block standardisation (6 videos still need the standard footer — videos 4, 12–16). Description drafted and ready to apply.

**Pending — footer videos:**
| Video ID | Title |
|----------|-------|
| pZ4LfKveLUA | Reading Guide — has links, missing closing divider + tagline |
| 415vp_DxlQ4 | Cloud AI Setup — different structure |
| JIRmFULuDvQ | Local AI / Ollama — different structure |
| jM84JYz0bEQ | Browser AI — partial |
| HyJBQhS7aDE | Popup Controls — minimal |
| wuYpKnFbIfY | Install & First-Time Setup — minimal |

**Standard footer block** (confirmed pattern from videos 1–3, 5–11):
```
─────────────────────────────────────────
🔗 Get AssisT free on the Chrome Web Store:
https://chromewebstore.google.com/detail/assist-adaptive-augmentat/dkekfjomoacmhbkekjkngmpbdlljjfhi

📖 Docs & source code: https://github.com/Fiavaion/AssisT
─────────────────────────────────────────

AssisT is a free, open-source Chrome extension built for neurodivergent students and anyone who benefits from reading and writing support - no account, no paywall.
```

**Note**: For videos 12–16, confirm whether to replace existing footer or append standard block. User did not confirm before session ended.

**MCP server**: restart Claude Code to get `yt_upload` tool available (server.js updated mid-session, changes load on next start).

---

**Session Complete**: 2026-05-28
