# ADR 0006: Every third-party call goes through the service worker, behind a consent asked once

Date: 2026-09-25. Status: accepted. Amended by ADR 0009 and ADR 0010.

Supersedes the network-access half of ADR 0002, which covered local AI and Crossref only.

## Context

A full sweep of the extension mapped every outbound call the code can make. Three findings, in
descending order of seriousness.

**The published claim was false.** `README.md` said, and had said for months: "It is free,
non-commercial, and runs locally by default. No data leaves the browser unless the user opts into a
cloud AI provider." Fourteen lines below it, the same file advertised "Translation - 35+ languages, no
API key required". Translation with no key is MyMemory, `api.mymemory.translated.net`, which is the
default provider with nothing configured. Dictionary lookup ships enabled and posts the selected word
to `api.dictionaryapi.dev`. Citation handling reaches `api.crossref.org` whenever a DOI is present,
with no toggle anywhere. So three separate paths sent text a student had selected on a course page to
a third party, with no cloud AI provider involved and nothing to opt into. `public/privacy-policy.html`
carried the same claim in softer wording.

Nothing student-identifying was ever sent. No name, no account, no email, no usage telemetry. What
left the device was selected page content, which is enough to matter when the page is a student's own
coursework and the student was told nothing left at all.

**Hosts were undeclared, one call had never worked, and two providers had never existed.**
`api.dictionaryapi.dev` and `api.semanticscholar.org` appeared in no permission list and in no
content-security-policy entry. The Semantic Scholar call runs in the service worker, which is governed
by that policy, so it was blocked and had never succeeded; it sits behind a setting that defaults to
off, which is why nobody noticed.

DeepL and Microsoft Translator were offered in the popup, which collected a key for each, encrypted it
and stored it. The module that would have called them was unreachable: the live translation path
calls MyMemory only. So a student could paste a paid key into the extension and nothing would ever
use it. The sweep also measured DeepL's API directly: its preflight returns no
`Access-Control-Allow-Origin`, so even a connected module would have failed from the browser.

**Crossref had two implementations.** One in `src/features/citations/crossref-api.js` for the content
scripts and the library page, and a second inline `fetch` in the service worker. That is the parallel
path the project's zero-debt rule forbids, and it is the direct cause of the inconsistency above: one
of the two got its host declared and the other did not.

Manifest permissions are a change boundary in this project because they are where FERPA
least-privilege is meant to be _visible_, not merely true in the code.

## Decision

**One route.** Every third-party network call is made by the service worker. Content scripts and
extension pages ask it and get an answer; they do not fetch across origins themselves. The service
worker is the realm Chrome actually grants host permissions to in MV3, so this is also the only
arrangement in which a declared host means what a reader thinks it means. A content-script fetch needs
no declaration to work, which is precisely why a manifest that permits content scripts to fetch is an
approximation rather than a statement.

The duplicate Crossref implementation goes. The service worker keeps one.

**One consent per destination, asked in the first-run wizard.** The welcome wizard that opens on
install is where a student chooses what to switch on, so it is where they are asked. For each service
their choices would reach, a short panel in plain language names the service and says what will be
sent. Where a Chrome host permission is also needed, the wizard requests the permissions for exactly
those choices in a single call, which Chrome shows as one prompt. A student who picks nothing that
leaves the device is asked nothing.

The wizard asks only about what the student chose. Asking up front for every service the extension
could ever reach would be bundled consent for services nobody picked, and a host permission for a
keyed AI provider does nothing for a student who never pastes a key.

A student who skips the wizard is asked the same question the first time they use a feature that
needs it, and asked once. The answer is remembered per feature and revocable in the popup. Until it is
given, nothing is sent. This restores the README sentence to the truth rather than rewriting it
downward: on a fresh install, nothing leaves the browser.

Three rules the sweep's own findings dictate:

- An unreadable or missing stored answer is not consent. It means ask again, never assume yes.
- Withdrawing consent takes effect immediately, not at the next page load.
- A student who declines keeps a working feature wherever one is possible. Dictionary and translation
  degrade to an explanation, not a dead button, and never to silence.

**Every destination declared, split by when it is needed.** The Free Dictionary API, MyMemory and
Crossref are required host permissions, because they serve in-page features that need no key and
cannot wait for a visit to the popup; they are still gated by consent. Anthropic, OpenAI, Perplexity
and Semantic Scholar become optional host permissions, requested when the student chooses them, in
the same way loopback for Ollama already is. Google stays where it is unless it can be shown that
moving it to optional keeps the permission for a student already using it, because an update that
silently breaks a working provider is worse than one more line in the install prompt. The Hugging Face
and GitHub hosts that model downloads need are unchanged. That list is the complete answer to "where
can this extension send anything", which is the question a store reviewer and a data protection
officer both ask.

**DeepL and Microsoft Translator are withdrawn.** The provider choice, both key fields, the region
field and the test buttons leave the popup, keys already stored for them are deleted, and the DeepL
hosts leave the content-security policy, so the manifest narrows. MyMemory delivers the languages the
README advertises, so no advertised capability is lost.

**The documents are rewritten to what is true**, and they are made to agree with each other. The
README and the privacy policy name every service, say what is sent, and say what triggers it.

## Consequences

Adding a network destination now requires a manifest change and a consent string. That friction is
the point.

The privacy claim becomes defensible on consent that is specific, informed and recorded, rather than
on a sentence that was not accurate. It is worth saying plainly that this ADR exists because the
sweep found the extension transmitting by default while promising it did not. The fix is not a
rewording.

Semantic Scholar's title fallback works for the first time. It was not a regression being repaired;
it had never run.

Bringing DeepL back is a feature, not a fix: it would be built through the service worker with its
host declared, and it would join the wizard's list like any other destination.

Content scripts gain a round trip through the service worker for these calls, which costs a few
milliseconds on a lookup that already waits on a network request.

A student who declines everything has an extension that does strictly less. That is the correct
outcome of asking, and it is the reason the question has to be worth answering yes to: the panel
names the service and what is sent, so the answer is informed rather than reflexive.
