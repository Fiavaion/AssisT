# ADR 0008: The text-recognition engine ships in the package

Date: 2026-10-04. Status: accepted (language data decided by the owner the same day).

Applies ADR 0006 to Read from Images (OCR).

## Context

Read from Images runs Tesseract in a web worker started by the content script. The call was
`Tesseract.createWorker(lang, 1, { logger })` with no paths, so tesseract.js 5.1.1 used its built-in
defaults, all on `cdn.jsdelivr.net`:

- the worker script, `tesseract.js@v5.1.1/dist/worker.min.js`, pulled in with `importScripts`;
- the WebAssembly core, `tesseract.js-core@v5.1.1/tesseract-core-*.wasm.js`, also `importScripts`;
- the language model, `@tesseract.js-data/<lang>/4.0.0_best_int/<lang>.traineddata.gz`, fetched and
  then cached in IndexedDB.

The first two are executable code fetched at run time. Manifest V3 and the Chrome Web Store policy
forbid remotely hosted code, JavaScript or WebAssembly, so this is a likely rejection of the 1.0.0
submission on its own.

The third is data, which the policy allows, but it breaks ADR 0006 in three ways. The host is not
declared anywhere. The request leaves from a worker running in the visited page's origin, not from
the service worker, so no consent is asked and no host permission applies. And the model is cached in
the host site's IndexedDB, so a Canvas or Moodle origin ends up holding a record that the student used
the extension's OCR.

The content script cannot start a worker from an extension URL directly: a worker must be
same-origin with the document, and the document is the visited page. tesseract.js already handles
this by default (`workerBlobURL: true`): it starts a blob worker whose only line is
`importScripts(workerPath)`. Chrome lets a page load a `chrome-extension://` file when it is listed in
`web_accessible_resources`, which is how `pdf.worker.min.mjs` already ships.

The emitted core loads its `.wasm` beside itself by resolving against its own script location. Inside
a blob worker that location is the `blob:` URL, so the split `.js` + `.wasm` builds cannot find their
binary. Only the `.wasm.js` builds, which carry the binary inline, work from a blob worker.

### What tesseract.js actually loads

`src/worker-script/browser/getCore.js` picks one of four cores. The extension creates every worker
with OEM 1 (LSTM only), which makes `lstmOnly` true, so only two can ever load:

| Core file (tesseract.js-core 5.1.1) | Loaded when                | Size        |
| ----------------------------------- | -------------------------- | ----------- |
| `tesseract-core-simd-lstm.wasm.js`  | WebAssembly SIMD available | 3,938,657 B |
| `tesseract-core-lstm.wasm.js`       | no SIMD                    | 3,938,277 B |
| `tesseract-core-simd.wasm.js`       | legacy engine requested    | not shipped |
| `tesseract-core.wasm.js`            | legacy engine, no SIMD     | not shipped |

SIMD is on by default in every Chrome the extension can run in (it needs the offscreen API, Chrome
109+), but V8 still disables it on x86 processors without SSE4.1, which some very old school machines
are. tesseract.js detects this itself when given a directory rather than a file.

The worker script, `tesseract.js/dist/worker.min.js`, is 123,724 B.

### Language data, measured

The popup offered 14 languages. The `4.0.0_best_int` models tesseract.js requests for LSTM-only
workers, gzipped as fetched:

| Code | Bytes     | Code    | Bytes     |
| ---- | --------- | ------- | --------- |
| eng  | 2,952,873 | nld     | 3,005,696 |
| spa  | 2,100,190 | pol     | 2,642,356 |
| fra  | 707,406   | rus     | 2,679,598 |
| deu  | 1,333,102 | chi_sim | 1,718,768 |
| ita  | 1,660,998 | chi_tra | 1,656,239 |
| por  | 1,392,239 | jpn     | 2,030,256 |
| kor  | 1,572,336 | ara     | 1,661,906 |

All 14 come to 27,113,963 B (27.1 MB). They are already gzipped, so the store zip does not shrink
them. The unpacked build before this change was 13,506,707 B.

## Options for language data

1. **English in the package, the other languages withdrawn until a consented route exists.** Adds
   2.95 MB. Nothing leaves the device. A student who had picked another language reads in English.
2. **All 14 in the package.** Adds 27.1 MB, roughly tripling the extension for a choice most students
   never make. Nothing leaves the device and nothing is lost.
3. **English in the package, the others downloaded on request.** The ADR 0006 route: the first time
   a student reads in another language they are asked, the service worker downloads that one file,
   and it is kept in the extension's own storage. Needs `cdn.jsdelivr.net` as an optional host
   permission and in `connect-src`.
4. **Leave non-English languages on jsDelivr, fetched by tesseract.js.** Rejected: it keeps exactly
   the undeclared, unconsented contact this ADR exists to remove, and ADR 0006's gate cannot see it
   because the host name lives inside the library.

## Decision

**The code ships in the package.** The worker script and the two LSTM cores are listed in
`web_accessible_resources` under their `node_modules/` paths, which the build copies verbatim, as it
already does for the PDF worker. `createWorker` is always given `workerPath`, `corePath` (the
directory, so tesseract.js still chooses SIMD or not) and `langPath`, and `cacheMethod: 'none'`, so
nothing is ever written to the visited site's IndexedDB. The legacy cores are not shipped, since
OEM 1 never loads them.

**English ships in the package; the other 13 languages are downloaded on request (option 3, owner
decision 2026-10-04).** English comes from the `@tesseract.js-data/eng` package, pinned at 1.0.0, and
is read from `chrome-extension://`. The picker offers all 14 languages again.

For any other language:

- **Consent.** A new destination, `ocrLanguages`, named jsDelivr, asked once for all 13 languages in
  the ADR 0006 way: the first-run wizard when OCR is on in another language, otherwise the first OCR
  run that needs a file. The question says that only the language file is downloaded and that no
  image and no text from the page is sent. Allowing it asks Chrome for
  `https://cdn.jsdelivr.net/*` in the same press (ADR 0009 says how, from a content script).
- **Download.** The service worker's request module, the one route off the device, builds the URL
  itself from an allowlisted language code: `@tesseract.js-data/<lang>@1.0.0/4.0.0_best_int/`. The
  version is pinned and each file's SHA-256 is pinned beside it, so a changed file is refused, not
  run through the engine. Only these 13 files can be fetched; the request names a language, never a
  URL.
- **Storage.** The file is kept in the extension origin's IndexedDB, written by the service worker,
  so it is downloaded once per language. The visited site never holds it.
- **Into the engine.** The content script receives the bytes from the worker, makes a `blob:` URL of
  them and hands it to tesseract.js as `langPath`, followed by `#`. tesseract.js appends
  `/<lang>.traineddata.gz` to `langPath`; after `#` that is a fragment, which a fetch ignores, so the
  engine reads the blob. tesseract.js 5.1.1's own `{ code, data }` form cannot be used: its
  `initialize` joins `data` instead of `code`, so initialisation fails and `createWorker` never
  settles. The bytes are data the engine reads, never code, and the blob URL is revoked once the
  worker has them.
- **No answer, a no, or no network.** Nothing is downloaded. OCR says that the language file is not
  on this device and why, and reads nothing rather than reading in the wrong language; the notice
  offers Allow where the student declined.

## Consequences

The unpacked extension grows by 10.95 MB: 7.88 MB of cores, 0.12 MB of worker, 2.95 MB of English.
Dropping the non-SIMD core would save 3.94 MB at the cost of OCR failing outright on processors
without SSE4.1; that trade is left to the owner.

English OCR works offline and on a fresh install, with no network request at all. Another language
makes one request, once, after a yes, and jsDelivr sees an extension request for a public file and
nothing else.

The worker is still a blob worker in the page's origin, so a page whose content-security policy blocks
`blob:` workers, `blob:` fetches or WebAssembly compilation still stops OCR. That was true before and
is not changed here; moving recognition into the offscreen document would remove it.

The blob-and-fragment hand-over depends on how tesseract.js 5 builds the language URL. A unit test
reads that line from the installed package, so an upgrade that changes it fails the suite rather than
OCR.
