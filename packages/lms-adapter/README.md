# @fiavaion/lms-adapter

> **Status: Initial scaffolding — NLnet NGI0 Commons Fund Phase 1 deliverable**

Browser-extension integration layer for Canvas LMS, Moodle, and Google Classroom. Designed for Manifest V3 content scripts; works entirely client-side with no backend, no LTI registration, and no Canvas admin access.

## Planned module architecture (Phase 1 deliverable)

The full library ships as five independently importable modules with zero runtime coupling between them:

| Module       | Description                                                                                                    | Status     |
| ------------ | -------------------------------------------------------------------------------------------------------------- | ---------- |
| `/core`      | LMS detection, course context, SPA navigation listener                                                         | Scaffolded |
| `/storage`   | `AdapterStorage` — cross-device sync via Canvas Custom Data API / Moodle user preferences / IndexedDB fallback | Planned    |
| `/watcher`   | `ContentWatcher` — IndexedDB snapshot + diff for silent instructor edits                                       | Planned    |
| `/parser`    | `AssignmentParser` — structured rubric extraction (Canvas REST API + Moodle DOM)                               | Planned    |
| `/scheduler` | `SoftDeadlines` — student personal deadlines synced via `/storage`                                             | Planned    |

Current code in `src/adapters/` establishes the adapter pattern, DOM interaction layer, and TypeScript definitions that the modular architecture builds on. The gap between current scaffolding and v1.0 is the funded deliverable.

## Intended usage (v1.0 API)

```typescript
// Each module independently importable — adopt only what you need
import { detectLMS, getCourseContext } from '@fiavaion/lms-adapter/core';
import { createAdapterStorage } from '@fiavaion/lms-adapter/storage';
import { createContentWatcher } from '@fiavaion/lms-adapter/watcher';
import { getAssignmentContext } from '@fiavaion/lms-adapter/parser';
import { createSoftDeadlines } from '@fiavaion/lms-adapter/scheduler';
```

## Licence

EUPL-1.2 — the European Commission's recommended licence for public-sector software reuse.

## Part of

[AssisT](https://github.com/Fiavaion/AssisT) — open-source, privacy-first accessibility AI for higher-education VLEs. Funded in part by NLnet NGI0 Commons Fund.
