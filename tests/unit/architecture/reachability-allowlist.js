/**
 * Admissions to the reachability gate.
 *
 * Every entry is a confession that something in the extension is half-wired and we have decided to
 * live with it for now. Write the reason as a sentence someone else can check — an entry whose
 * reason is missing, or too short to say anything, fails the gate on its own.
 *
 * Do not add an entry to make a red run green. The finding is either a defect worth fixing or a gap
 * worth explaining in a sentence; there is no third case. Entries opening with DEFECT are known
 * bugs, recorded here rather than hidden: they are the backlog this gate exists to stop growing.
 * Everything else is dead wiring awaiting deletion under the zero-debt rule.
 *
 * These began as the findings of the gate's first run, on 2026-09-01. The dead wiring was deleted on
 * 2026-09-04 and the last three defects were fixed on 2026-09-06, which is why every bucket below
 * is empty. Shrink this file; never grow it.
 */

/** Message types with a handler and no sender — a listener nothing can ever wake. */
const NO_SENDER = {
};

/** Message types with a sender and no handler — a call that silently goes nowhere. */
const NO_HANDLER = {
};

/** Citation RPC operations no shipped surface calls. */
const NO_CALLER = {};

/**
 * Message types whose only sender is a file that also handles them.
 *
 * The gate cannot tell a module that deliberately holds both ends of a message across two realms
 * from one that has become the last thing still talking to itself. Every entry here must name which
 * realm holds which end, because that is the fact the gate cannot read for itself.
 */
const SELF_WIRED = {
  LLM_INSTALL_PROGRESS:
    'The service worker broadcasts it to the popup and the AI setup page, which handle it; the ' +
    'match in the worker is the guard that swallows its own echo, not a handler.',
  OFFSCREEN_STORAGE_GET:
    'offscreen-storage.js is one module spanning two realms on purpose: the client half runs in ' +
    'the offscreen document and sends, the validator half runs in the service worker, which ' +
    'handles it. Keeping both in one file stops the wire format drifting from its rules.',
  OFFSCREEN_STORAGE_SET:
    'Same module and same reason as OFFSCREEN_STORAGE_GET: offscreen document sends, service ' +
    'worker handles, one file so the wire format and its validation cannot drift apart.',
};

module.exports = { NO_SENDER, NO_HANDLER, NO_CALLER, SELF_WIRED };
