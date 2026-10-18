/**
 * Reachability gate — code that exists, passes its tests, and cannot be reached.
 *
 * `no-undef` catches a call with no definition. This is the mirror image: a definition with no call.
 * The extension has shipped that bug three times — a citation project API that only its own tests
 * ever called, message listeners whose sender was deleted in a refactor, feature chunks announced
 * and never fetched. Each layer worked alone, so the suite stayed green while the feature was gone.
 *
 * Scope is deliberately narrow. A general unused-export sweep over a codebase this size returns
 * hundreds of hits, gets suppressed within a week, and protects nothing. Two categories where being
 * unreachable is a defect rather than a style opinion:
 *
 *   1. Message types — a handler with no sender is dead; a sender with no handler fails in silence.
 *   2. Citation RPC operations — reachable from a shipped surface, not only from the dispatcher.
 *
 * Storage and CRUD exports are deliberately NOT checked. `citation-storage.js` runs in the offscreen
 * realm and is legitimately reached only through the dispatcher, so a generic export sweep would
 * condemn the entire storage surface. The RPC check already covers that ground at the honest
 * granularity: it names the storage method behind each unreachable operation.
 *
 * Tests are not callers. Only `src/` is scanned.
 */

const { MESSAGE_TYPES } = require('../../../src/config/constants.js');
const citationMessages = require('../../../src/config/citation-messages.js');

const { CIT } = citationMessages;
const {
  scanMessages,
  scanRpcCallers,
  selfWiredMessages,
  LIMITS,
} = require('./reachability-scan.js');
const allowlist = require('./reachability-allowlist.js');

/** The CIT.* ops travel by a different mechanism; the RPC check owns them. */
const RPC_OPS = new Set(Object.values(CIT));

/**
 * Identifiers that really do hold a message type, so `type: SOMETHING` can be separated from an
 * indexed lookup. Every one of these is a constant whose value is its own name.
 */
const CONSTANT_NAMES = new Set([
  ...Object.keys(MESSAGE_TYPES),
  ...Object.keys(citationMessages).filter(key => citationMessages[key] === key),
]);

const { senders, handlers } = scanMessages(RPC_OPS, CONSTANT_NAMES);
const { ops, callers } = scanRpcCallers();
const selfWired = selfWiredMessages(senders, handlers);

const list = files => [...files].sort().join(', ');

/** Failure text that says what is wrong, where, and what the gate could not see. */
function report(heading, findings) {
  return [
    '',
    heading,
    ...findings,
    '',
    'Fix it, or admit it in tests/unit/architecture/reachability-allowlist.js with a reason.',
    'This gate cannot see:',
    ...LIMITS.map(limit => `  - ${limit}`),
    '',
  ].join('\n');
}

describe('reachability — the allowlist itself', () => {
  it.each(Object.entries(allowlist))('%s entries all carry a real reason', (_bucket, entries) => {
    const unjustified = Object.entries(entries)
      .filter(([, reason]) => typeof reason !== 'string' || reason.trim().length < 20)
      .map(([name]) => name);
    expect(unjustified).toEqual([]);
  });

  it.each(Object.entries(allowlist))(
    '%s admits nothing the gate no longer finds',
    (bucket, entries) => {
      const stale = Object.keys(entries).filter(name => {
        if (bucket === 'NO_SENDER') {
          return senders.has(name);
        }
        if (bucket === 'NO_HANDLER') {
          return handlers.has(name);
        }
        if (bucket === 'SELF_WIRED') {
          return !selfWired.some(finding => finding.name === name);
        }
        return (callers.get(name) || new Set()).size > 0;
      });
      expect(stale).toEqual([]);
    }
  );
});

describe('reachability — message types', () => {
  it('assumes each declared message constant is its own name', () => {
    // The scanner resolves `MESSAGE_TYPES.X` and bare `X` to the string "X". Pin that so a constant
    // whose value drifts from its key cannot quietly slip past every check below.
    const drifted = Object.entries(MESSAGE_TYPES).filter(([key, value]) => key !== value);
    expect(drifted).toEqual([]);
  });

  it('finds a sender and a handler for every declared message type', () => {
    const missing = Object.values(MESSAGE_TYPES)
      .filter(name => !senders.has(name) || !handlers.has(name))
      .filter(name => !(name in allowlist.NO_SENDER) && !(name in allowlist.NO_HANDLER))
      .map(
        name =>
          `  ${name} — declared in constants.js, ${senders.has(name) ? 'no handler' : 'no sender'}`
      );
    expect(
      missing.length ? report('Declared message types that are half-wired:', missing) : ''
    ).toBe('');
  });

  it('gives every message handler a sender', () => {
    const dead = [...handlers.keys()]
      .filter(name => !senders.has(name) && !(name in allowlist.NO_SENDER))
      .sort()
      .map(name => `  ${name} — handled in ${list(handlers.get(name))}, sent by nothing`);
    expect(dead.length ? report('Message handlers no code can wake:', dead) : '').toBe('');
  });

  it('will not let a module be the only thing sending a message it handles', () => {
    // The sender/handler pair is satisfiable by one module on its own, which is how UPDATE_SETTINGS
    // survived here after the popup stopped sending it: the background router broadcast it and
    // carried the `case` for it, so both halves were present and nothing outside reached either.
    // The gate cannot see which realm a sender aims at, so a legitimate two-realm module has to be
    // admitted by name with the reason — that is a human judgement, recorded, not a silent pass.
    const unjudged = selfWired
      .filter(finding => !(finding.name in allowlist.SELF_WIRED))
      .map(
        finding =>
          `  ${finding.name} — sent only from ${finding.file}, which also handles it` +
          ` (handled in ${finding.handlers.join(', ')})`
      );
    expect(
      unjudged.length
        ? report('Messages whose only sender is the module that answers them:', unjudged)
        : ''
    ).toBe('');
  });

  it('gives every message sender a handler', () => {
    const silent = [...senders.keys()]
      .filter(name => !handlers.has(name) && !(name in allowlist.NO_HANDLER))
      .sort()
      .map(name => `  ${name} — sent from ${list(senders.get(name))}, handled by nothing`);
    expect(silent.length ? report('Messages sent into the void:', silent) : '').toBe('');
  });
});

describe('reachability — citation RPC operations', () => {
  it('reads the whole operation table off citation-rpc.js', () => {
    // If the parse silently returns nothing, every op below passes for the wrong reason.
    expect(ops.length).toBe(Object.keys(CIT).length);
  });

  it('gives every operation a caller outside the plumbing', () => {
    const unreachable = ops
      .filter(op => (callers.get(op.op) || new Set()).size === 0)
      .filter(op => !(op.op in allowlist.NO_CALLER))
      .map(op => `  ${op.op} — ${op.object}.${op.method}() in citation-rpc.js, called by nothing`);
    expect(
      unreachable.length ? report('Citation operations no surface can reach:', unreachable) : ''
    ).toBe('');
  });
});
