# ADR 0002: Local AI is an optional loopback permission, CrossRef is CSP only

Date: 2026-09-06. Status: partly superseded by ADR 0006 and ADR 0009.

## Context

Version 0.9.3 reached neither of these hosts. Two features added since then do.

**CrossRef.** Add-by-DOI takes a DOI a student types or pastes and returns a full reference, and
citation verification checks a reference the student already has against the record of the work.
Both call `https://api.crossref.org` from an extension page, never from a page the student is
reading. A `fetch` from an extension page is governed by the page's content security policy, not by
host permissions, so the host has to appear in `connect-src` and nowhere else.

**Local AI.** Local AI runs inference in Ollama on the student's own machine, reached at
`http://localhost:11434` (institutions may point every seat at one server on their LAN instead).
That call is made by the service worker, so it needs a host permission as well as the CSP entry.
It was shipped in required `host_permissions`, which means every install of AssisT asks for
permission to talk to a loopback server, including the great majority of students who never turn
local AI on. That is more than the feature needs and more than the FERPA least-privilege rule in
this project allows.

The obvious correction — drop the entry — has a trap. Chrome disables an extension and waits for
the user to re-approve it when an update _adds_ a required permission, so the loopback host cannot
simply move to `host_permissions` later. Whatever is decided now has to be the shape that holds.

## Decision

1. **CrossRef is a CSP entry only.** `https://api.crossref.org` stays in `connect-src`. It is not a
   host permission, because nothing outside an extension page calls it, and a CSP entry is not a
   permission prompt — it grants no access to any page the student visits.
2. **The loopback Ollama origin is an optional host permission.** `http://localhost:11434/*` and
   `http://127.0.0.1:11434/*` move from `host_permissions` to `optional_host_permissions`, and stay
   in `connect-src` so the popup's own status check still resolves. A student who never uses local
   AI is never asked for them.
3. **It is requested at the moment local AI is turned on**, from inside the press that turns it on,
   which is the only moment Chrome will show the prompt. `ensureOllamaPermission()` in
   `src/utils/ollama-url.js` holds that logic for both the mode switch and the Apply button on a
   custom server address; the default address now goes through the same request as a custom one.
4. **A missing grant is reported in words.** `ollamaFetch()` in the service worker — the single
   place every Ollama call passes through — checks the grant before the request and throws a
   sentence naming what to do. Without that check the failure is an ordinary network error, which
   reads exactly like Ollama not running and sends a student to restart a server that was fine.
5. **`managed_schema` stays.** An institution that deploys AssisT by policy keeps its existing key,
   including a pre-granted Ollama server, so nothing about this change reaches a managed rollout.

## Consequences

- Existing users keep working across the update: moving a permission from required to optional
  never disables an extension, and a grant already held satisfies `permissions.contains`, so the
  prompt does not appear for someone who already had local AI on.
- Local AI now has one more step the first time it is switched on. The prompt says "localhost",
  which is the honest description of what it does.
- Content scripts cannot request permissions, so the "Use Local AI" buttons inside the feature
  panels switch the mode and let the first generate report the missing grant in words. The prompt
  itself is only reachable from the popup.
- The store listing loses a loopback host from its install-time permission list, which is the
  point: what AssisT asks for at install now matches what it does at install.
