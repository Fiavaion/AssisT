# @fiavaion/local-ai-router

> **Status: Initial scaffolding — NLnet NGI0 Commons Fund Phase 1 deliverable**

Four-mode local-AI routing for Manifest V3 browser extensions. Routes across Ollama, WebLLM (WebGPU in-browser), Chrome Prompt API (Gemini Nano), and cloud providers — with automatic degradation and MV3 service-worker lifecycle awareness.

## What makes this different

Every existing routing library (Langchain.js, Vercel AI SDK, `ollama-js`) targets Node.js or server environments. None handle the constraints specific to MV3 extensions:

- 30-second service-worker execution window
- Service-worker suspension interrupting in-flight inference
- `chrome-extension://` origin rejection by Ollama's default CORS policy
- Chrome Prompt API availability gating (Gemini Nano on capable devices only)

This library is built for these constraints, not retrofitted to them.

## Current state

Initial provider implementations (`src/providers/`) and router logic (`src/router.js`) are scaffolded. The gap between current code and v1.0 includes:

- MV3 service-worker keep-alive and inference chunking for WebLLM
- Typed error surface for OOM / VRAM-insufficient / model-not-found conditions
- Full TypeScript definitions and per-provider API stability guarantees
- npm publication under EUPL-1.2

## Intended usage (v1.0 API)

```typescript
import { createRouter } from '@fiavaion/local-ai-router';

const router = createRouter({ preferredMode: 'auto' });
// 'auto' | 'ollama' | 'webllm' | 'promptapi' | 'cloud'

const { text, mode } = await router.generate(prompt, { maxTokens: 500 });
// auto-degrades: Ollama → WebLLM → Chrome Prompt API → cloud (if key configured)
// mode reports which path was used; typed errors surface unavailability reasons
```

## Licence

EUPL-1.2 — the European Commission's recommended licence for public-sector software reuse.

## Part of

[AssisT](https://github.com/Fiavaion/AssisT) — open-source, privacy-first accessibility AI for higher-education VLEs. Funded in part by NLnet NGI0 Commons Fund.
