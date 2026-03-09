# Phase 2 Session 095 - Knowledge Graph Local AI Fix

**Date**: 2026-03-09
**Duration**: ~2 hours
**Phase**: Phase 2 Extension - AI Systems Overhaul
**Progress**: 100% → 100% (bug fix session)
**Session Number**: 095

---

## Session Overview

**Goal**: Fix knowledge graph feature producing generic "A concept mentioned in the text." descriptions for all nodes when using Local AI (Ollama)
**Status**: ✅ Complete

---

## Accomplishments

### Features Fixed
- [x] Knowledge Graph Local AI — fully working with real AI-generated descriptions, node types, and edge relationships

### Root Causes Resolved (in order of discovery)

1. **JSON pre-parse mismatch** — `service-worker.js` `format:'json'` path returned a parsed JS object, but `knowledgeGraph.js` called `.match()` on it as a string → TypeError → silent fallback to `graph_simpleExtract`
2. **qwen3 thinking tokens** — qwen3 emits `<think>...</think>` blocks before JSON even with `format:'json'`; added stripping regex in service-worker JSON handler
3. **Chrome MV3 service worker suspension** — SW killed after 30s mid-request; added `chrome.storage.local.set` keepalive every 10s during `LOCAL_LLM_GENERATE`
4. **AbortSignal timeout too short** — default 30s insufficient for cold model load; bumped default to 60s in `ollamaGenerate`
5. **Token truncation** — 1200 tokens caused timeout; reduced to 600-900 with truncation repair logic
6. **Model routing** — qwen3:8b and mistral:7b both timeout on 8GB cold start; gemma3:4b is the only viable model within 60s
7. **`num_ctx` not plumbed** — added `num_ctx` passthrough in `generateWithAI` options; set 2048 for knowledge graph to halve processing time
8. **Node count too high** — 12 nodes consumed all token budget leaving nothing for edges; capped at 6-8 for local

### Files Modified
- `src/features/knowledgeGraph/knowledgeGraph.js` — object shortcut, parseError guard, unclosed code block handling, truncation repair, node cap, token budget, num_ctx, 1-sentence definitions
- `src/background/service-worker.js` — think-tag stripping, `\{[\s\S]*\}` JSON finder, keepalive interval, 60s default timeout, gemma3:4b routing for knowledgeGraph
- `src/features/shared/ai-feature-client.js` — `timeout` and `num_ctx` destructured and forwarded in LOCAL path, debug log added

---

## Decisions Made

**Decision**: Use gemma3:4b as the only knowledgeGraph model on 8GB hardware
- **Reason**: qwen3:8b, mistral:7b both exceed 60s cold start on 8GB; gemma3:4b completes within budget
- **Impact**: Lower output quality than 8B but fully functional; quality can improve on better hardware
- **Alternatives rejected**: mistral:7b (timeout), qwen3:8b (timeout + thinking tokens), format:'json' (grammar-constrained sampling too slow)

**Decision**: Cap local nodes at 6-8 with 1-sentence definitions
- **Reason**: 600-900 token budget must cover both nodes AND edges; long definitions consume budget leaving no room for edges
- **Impact**: Sparser graphs locally vs cloud; acceptable tradeoff
- **Alternatives rejected**: 12 nodes (works but edges always truncated)

**Decision**: Truncation repair rather than retry
- **Reason**: A retry doubles latency; partial graph with real AI content is more useful than fallback regex graph
- **Impact**: Some graphs missing the last 1-2 nodes; acceptable
- **Alternatives rejected**: Retry on parse fail (too slow)

**Decision**: Storage keepalive over `getPlatformInfo` keepalive
- **Reason**: `chrome.storage.local.set` more reliably prevents SW suspension than `getPlatformInfo` callback pattern
- **Impact**: Writes `_sw_keepalive` timestamp to storage every 10s during generation; negligible storage overhead

---

## Challenges and Solutions

**Challenge**: "A concept mentioned in the text." on every node despite AI generating valid JSON
- **Solution**: Traced pipeline — service-worker pre-parses JSON to object, shared client wraps as `text: object`, knowledgeGraph calls `.match()` on object → TypeError → fallback. Added `typeof aiResult.text === 'object'` shortcut.
- **Time**: ~30 min
- **Lesson**: Always log intermediate data types when debugging silent fallbacks

**Challenge**: qwen3 `<think>` blocks breaking JSON parse even with `format:'json'`
- **Solution**: Strip `/<think>[\s\S]*?<\/think>/g` in service-worker before JSON.parse
- **Time**: ~15 min
- **Lesson**: Reasoning models emit thinking tokens regardless of format constraints in some Ollama versions

**Challenge**: Chrome MV3 service worker killed mid-request
- **Solution**: `setInterval(() => chrome.storage.local.set({ _sw_keepalive: Date.now() }), 10000)` in keepAlive, cleared in `finally`
- **Time**: ~30 min
- **Lesson**: MV3 SW has hard ~30s idle kill; any long-running fetch MUST have a keepalive

**Challenge**: Edges missing from graph (all nodes, no connections)
- **Solution**: Reduced node count from 12→6-8 and definitions from 2 sentences→1 sentence, freeing token budget for edges array
- **Time**: ~20 min
- **Lesson**: With tight token budgets, every character in the prompt structure matters; put the most important data first

---

## Technical Insights

- Chrome MV3 service workers are killed after ~30s of inactivity — not just when idle, but apparently during long awaits too. The keepalive must be an actual API call, not a no-op.
- `AbortSignal.timeout()` in the service worker and Chrome's own `sendMessage` timeout are separate — the error message `signal timed out` comes from our AbortSignal being caught and forwarded as `response.error`, not from Chrome's message layer.
- gemma3:4b cold load + 600-token inference on 8GB takes ~40-55s. Warm load takes ~10-15s.
- The `format:'json'` Ollama option causes grammar-constrained sampling which is significantly slower than free-text generation. For structured output tasks, rely on prompt instructions + regex extraction instead.
- Truncation repair strategy: find `lastIndexOf('},')` in partial JSON and close the structure. Works reliably for array-of-objects truncation.

---

## Next Session

**Status**: ✅ Complete — Knowledge Graph Local AI fully working
**Next Task**: Continue CWS preparation or next feature work
**Build**: `npm run build` — clean ✅

**Handoff State**:
- Knowledge graph works on first run with gemma3:4b (cold ~40-55s, warm ~10-15s)
- 6-8 nodes, real descriptions, edges with relationship labels
- Truncation repair handles partial output gracefully
- Debug log `[AI Client] LOCAL response.data type:` still in `ai-feature-client.js` — remove before CWS submission

**WIP Notes**:
- Remove debug `console.log` in `src/features/shared/ai-feature-client.js` line ~432 before release
- Consider showing a "building graph..." loading indicator with estimated time for cold starts
- Consider pre-warming gemma3:4b on extension load if AI mode is local

---

**Session Complete**: 2026-03-09
