/**
 * Citation store migration.
 *
 * Runs once, in the offscreen document, the first time the canonical extension-origin store comes
 * online. Two user-chosen paths:
 *
 *  - **Start fresh (default):** touch no data; just record that migration is done. The canonical DB
 *    simply contains whatever already lived in the extension origin (e.g. records the popup created —
 *    same origin, same `AssistCitations` DB, so they are already present; nothing to copy).
 *
 *  - **Best-effort import:** the offscreen document can only open IndexedDB in its OWN (extension)
 *    origin. Citations the content script saved while browsing other sites live in those pages'
 *    origins and are unreachable by browser origin isolation — they cannot be copied. The one
 *    cross-origin breadcrumb is the `citationIndex` projection (chrome.storage.local), which holds a
 *    SKELETON of each (title / first author / year / type / project) but no URL or full metadata.
 *    So best-effort reconstructs review-flagged STUBS from that projection, deduped against what the
 *    canonical DB already has. Each stub is clearly marked `needsReview` with a placeholder URL so it
 *    routes through the normal reassurance/fix path; any projection row too thin to form a valid
 *    citation is skipped and counted, never guessed at. This never corrupts and never deletes.
 *
 * Pure + dependency-injected (storage, projection reader, flag get/set) so it is fully unit-testable
 * without a live offscreen document or chrome APIs.
 */

/** chrome.storage.local key holding the migration flag `{ done, mode, at, imported?, skipped? }`. */
export const MIGRATION_FLAG_KEY = 'citationMigration';

/** Reserved non-resolvable host (RFC 2606 `.invalid`) for recovered stubs that have no real URL. */
const RECOVERED_URL_BASE = 'https://recovered.invalid/citation';

/** Normalise a title for dedupe — lowercased, collapsed whitespace. */
function titleKey(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Build a review-flagged stub citation from one `citationIndex` projection row, or null when the row
 * is too thin to recover (no usable title). Shaped to pass `validateCitation` (title + url + authors
 * + accessDate); `createCitation` supplies the access date.
 * @param {Object} row - projection row: { id, title, firstAuthor, year, assistType, projectId }
 * @returns {Object|null}
 */
export function buildRecoveredStub(row) {
  const title = String(row?.title || '').trim();
  if (!title) {
    return null;
  }
  const firstAuthor = String(row?.firstAuthor || '').trim();
  return {
    type: row?.assistType || 'website',
    title,
    authors: firstAuthor ? [firstAuthor] : [],
    // Placeholder, non-resolvable URL — the real source can't be recovered from the projection.
    url: `${RECOVERED_URL_BASE}/${encodeURIComponent(String(row?.id ?? titleKey(title)))}`,
    // The projection says 'n.d.' for an undated source; that is not a date to store.
    publicationDate: row?.year && row.year !== 'n.d.' ? String(row.year) : '',
    projectId: row?.projectId || null,
    extra: { recovered: true, needsReview: true },
    notes: 'Recovered from a previous version of AssisT — please review and add the source URL.',
    tags: ['needs-review'],
  };
}

/**
 * Create a migration runner bound to its collaborators.
 * @param {Object} deps
 * @param {Object} deps.storage - CitationStorage (add / export)
 * @param {() => Promise<Array>} deps.readIndex - reads the citationIndex projection (skeleton rows)
 * @param {() => Promise<{done:boolean, mode:?string}>} deps.getFlag
 * @param {(flag: Object) => Promise<void>} deps.setFlag
 * @param {() => number} [deps.now] - timestamp source (injectable for tests)
 * @returns {{ getStatus, startFresh, bestEffortImport, run }}
 */
export function createMigrationRunner({
  storage,
  readIndex,
  getFlag,
  setFlag,
  now = () => Date.now(),
}) {
  /** @returns {Promise<{done:boolean, mode:?string}>} */
  async function getStatus() {
    const flag = await getFlag();
    return { done: !!flag?.done, mode: flag?.mode || null };
  }

  /** Record completion without touching any citation data. */
  async function startFresh() {
    const result = { mode: 'fresh', imported: 0, skipped: 0 };
    await setFlag({ done: true, mode: 'fresh', at: now() });
    return result;
  }

  /**
   * Reconstruct review-flagged stubs from the projection, deduped against the canonical DB.
   * Idempotent: re-running imports nothing new (existing titles are skipped).
   * @returns {Promise<{mode:string, imported:number, skipped:number, total:number}>}
   */
  async function bestEffortImport() {
    const rows = (await readIndex()) || [];

    // Dedupe against what the canonical DB already holds, and within the projection itself. The
    // trash counts as held: a citation the student removed must not reappear as a recovered stub.
    const existing = await storage.export({ includeTrashed: true });
    const seen = new Set((existing || []).map(c => titleKey(c.title)));

    let imported = 0;
    let skipped = 0;
    for (const row of rows) {
      const stub = buildRecoveredStub(row);
      if (!stub) {
        skipped += 1; // unrecoverable (no title)
        continue;
      }
      const key = titleKey(stub.title);
      if (seen.has(key)) {
        skipped += 1; // already present (or a duplicate projection row)
        continue;
      }
      try {
        await storage.add(stub);
        seen.add(key);
        imported += 1;
      } catch {
        skipped += 1; // failed validation despite our best effort — never guess
      }
    }

    const result = { mode: 'import', imported, skipped, total: rows.length };
    await setFlag({ done: true, mode: 'import', at: now(), imported, skipped });
    return result;
  }

  /**
   * Dispatch by the user's chosen mode. Unknown/absent mode is a no-op that leaves migration NOT done
   * (so the first-run prompt can still be shown). 'fresh' and 'import' are terminal.
   * @param {'fresh'|'import'} mode
   */
  async function run(mode) {
    if (mode === 'import') {
      return bestEffortImport();
    }
    if (mode === 'fresh') {
      return startFresh();
    }
    throw new Error(`Unknown migration mode: ${mode}`);
  }

  return { getStatus, startFresh, bestEffortImport, run };
}
