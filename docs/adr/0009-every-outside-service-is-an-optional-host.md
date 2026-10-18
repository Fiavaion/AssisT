# ADR 0009: Every outside service is an optional host, asked for with its consent

Date: 2026-10-04. Status: accepted (owner decision).

Amends ADR 0006, which kept the Free Dictionary API, MyMemory and Crossref as required host
permissions.

## Context

ADR 0006 made those three hosts required because they serve in-page features with no key, and only
an extension page can ask Chrome for a permission: a content script has no `chrome.permissions`. So
every install granted access to three services up front, and consent alone decided whether anything
was sent. ADR 0007 moved Gemini to optional for the same least-privilege reason, leaving these three
as the only third-party hosts asked for at install.

Two things made that worth changing now. The 0.9.3 store release did not hold these permissions, so
1.0.0 as built would show every existing user a new-permission prompt on update, and Chrome disables
the extension until it is accepted. And ADR 0008 adds a fourth host, jsDelivr, for OCR language
files, which is plainly optional and is first needed from a content script too.

The obstacle is the gesture. Chrome shows a permission prompt only from a user gesture in an
extension page, and the first-use question for these services is asked inside the visited page.

## Decision

**All four hosts are optional host permissions:** `api.dictionaryapi.dev`,
`api.mymemory.translated.net`, `api.crossref.org` and `cdn.jsdelivr.net`. The worker's request module
lists each against its destination in `OPTIONAL_HOST_ORIGINS`, and refuses a request with
`permission-missing` when Chrome does not hold the host, as it already did for Semantic Scholar.

**The permission is asked for in the same press as the consent.**

- The first-run wizard and the popup's Your data already request `originsFor` the destinations being
  allowed from the click that saves them; they now cover these services too.
- In an extension page (the citation library, the popup), the consent panel's Allow asks Chrome
  before anything is awaited, and a refused prompt is a no.
- In a content script, a destination that needs a host is asked in a small extension window that
  the service worker opens, instead of the in-page panel. It shows the same words, and its Allow asks
  Chrome and records the answer in one press. Closing the window is no answer: nothing is recorded or
  sent. The window is extension-owned, so the page cannot cover, restyle or click it, which the
  in-page panel has to defend against.

**A missing permission is treated as no consent.** The client asks again on `permission-missing`
exactly as on `consent-unasked`; a recorded yes without the host is not a yes. Nothing fails
silently: the feature either gets its answer or shows the declined notice, whose Allow reopens the
question.

**Withdrawal gives the host back,** from Your data, unless another destination the student still
allows uses the same host (selection and page translation share MyMemory).

## Consequences

An update from 0.9.3 asks for no new host. A student who had already allowed one of these services
under 1.0.0 builds before this change is asked once more, by the window, because the yes no longer
comes with the host.

The first use of the dictionary, translation, Crossref or another OCR language from a page opens a
small window rather than an in-page panel. It is one more step the first time, and it is the only way
a page feature can obtain a permission without sending the student to the popup.

`connect-src` gains `https://cdn.jsdelivr.net`, used only by the service worker's request module.
