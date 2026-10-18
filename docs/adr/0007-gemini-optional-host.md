# ADR 0007: Google Gemini becomes an optional host permission

Date: 2026-09-27. Status: accepted.

Amends ADR 0006, which kept Google Gemini as a required host permission.

## Context

ADR 0006 moved Anthropic, OpenAI and Perplexity to optional host permissions, requested when a student
chooses one of them. It left `https://generativelanguage.googleapis.com/*` required, for one reason:
an update that silently breaks a working provider is worse than one more line in the install prompt,
and nobody could show that Chrome keeps a grant for a host that moves from required to optional.

That reasoning left every install asking for access to a cloud AI service that most students never
use. Gemini needs a key the student pastes themselves, so the permission does nothing for anyone who
has not chosen it. Least privilege is meant to be visible in the manifest, and one keyed provider
being required while the other three are optional is exactly the inconsistency a store reviewer or a
data protection officer asks about.

Gemini is already a consent destination (`google` in `utils/consent.js`), and the cloud router already
refuses a provider the student has not allowed. Only the host permission was different.

Note that AI mode `gemini` is Gemini Nano, Chrome's on-device model. It makes no network request and
is not affected by this decision.

## Decision

`https://generativelanguage.googleapis.com/*` moves from `host_permissions` to
`optional_host_permissions`. Gemini joins `OPTIONAL_HOST_ORIGINS` in the worker's request module, so it
takes the same path as the other keyed providers:

- Chrome is asked for the host inside the student's click that saves the key or presses "Allow access
  to Google Gemini", in the popup, on the AI setup page, or in the welcome wizard. The yes is recorded
  before Chrome is asked.
- The cloud router refuses a Gemini request, with nothing sent, when either the consent or the host
  permission is missing, and tells the student where to allow it.

We do not rely on Chrome keeping or dropping the old grant on update. A student who chose Gemini and
lacks the permission sees the "Allow access to Google Gemini" button in the popup's AI Assist panel,
with a status line saying nothing can be sent yet, instead of a failure at first use.

## Consequences

The install prompt no longer mentions Google's AI service. A fresh install asks for no cloud AI host
at all.

An existing Gemini user may need one extra press after the update. That is the cost ADR 0006 wanted to
avoid; it is accepted because the press is offered where the student already looks, says what it is
for, and nothing fails silently in the meantime.

The four keyed providers now share one code path, so a fifth would be one entry in
`OPTIONAL_HOST_ORIGINS`, one in `DESTINATIONS` and one in the manifest.
