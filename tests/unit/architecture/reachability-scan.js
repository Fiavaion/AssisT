/**
 * Source scanner behind the reachability gate.
 *
 * Reads `src/` as text at test time and works out, for each message type and each citation RPC
 * operation, whether production code both raises it and answers it. Only `src/` is scanned, so a
 * caller that exists solely in a test is invisible here — which is the whole point. `CIT_PROJECT_CREATE`
 * had passing tests for months while no shipped surface could reach it.
 *
 * This is regex over text, not a parser. Read `LIMITS` before trusting a green run.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../../src');

/** A message-type-shaped identifier: SCREAMING_SNAKE, at least three characters. */
const NAME = '[A-Z][A-Z0-9_]{2,}';

/**
 * `target:` values route a message to a realm; they are not message types and have no handler in
 * the sender/handler sense. Listing the value keeps the scanner from inventing a finding.
 */
const ROUTING_TARGETS = new Set(['offscreen-citations']);

/** Every `.js` file under src/, recursively. */
function productionFiles(dir = SRC, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      productionFiles(full, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const relative = file => path.relative(SRC, file).split(path.sep).join('/');

/**
 * Bodies of every `switch` whose subject reads like a message discriminator.
 *
 * Scoping matters: `citation-export.js` switches on RIS tags and `translation-api.js` on error
 * codes. Both are SCREAMING_SNAKE `case` labels that have nothing to do with messaging, and a naive
 * sweep would report each of them as a handler with no sender.
 */
function messageSwitchBodies(source) {
  const bodies = [];
  const opener = /switch\s*\(([^)]*)\)\s*\{/g;
  let match;
  while ((match = opener.exec(source))) {
    if (!/\b(?:type|action|command)\b/.test(match[1])) {
      continue;
    }
    let depth = 1;
    let i = opener.lastIndex;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') {
        depth += 1;
      } else if (source[i] === '}') {
        depth -= 1;
      }
      i += 1;
    }
    bodies.push(source.slice(opener.lastIndex, i));
  }
  return bodies;
}

/**
 * Patterns that raise a message: `{ type: 'X' }`, `{ action: MESSAGE_TYPES.X }`, `{ type: X }`.
 *
 * Only the first is trusted on its own. A bare identifier is read as a message name only when it IS
 * one (see `constantNames`) — `type: RELATION_TYPES[edge.type]` and `type: CANONICAL_TO_CSL[c.type]`
 * are lookup tables, and treating them as sent messages produced two imaginary findings on the
 * first run.
 */
const SENDER_PATTERNS = [
  new RegExp(`(?:^|[{,(\\s])(?:type|action)\\s*:\\s*['"](${NAME})['"]`, 'g'),
  new RegExp(
    `(?:^|[{,(\\s])(?:type|action)\\s*:\\s*(?:MESSAGE_TYPES\\.)?(${NAME})\\s*[,}\\n]`,
    'g'
  ),
];

/**
 * Patterns that answer a message outside a switch: `message.type === 'X'`, `action !== X`.
 *
 * `!==` counts. The guard-and-return idiom (`if (msg.type !== 'LLM_INSTALL_PROGRESS') return;`) is
 * how the progress listeners are written, and reading only `===` declared every one of them dead.
 */
const HANDLER_PATTERNS = [
  new RegExp(`(?:type|action|command)\\s*[!=]==\\s*['"](${NAME})['"]`, 'g'),
  new RegExp(
    `(?:type|action|command)\\s*[!=]==\\s*(?:MESSAGE_TYPES\\.)?(${NAME})\\s*[)&|,;\\n]`,
    'g'
  ),
  new RegExp(`['"](${NAME})['"]\\s*[!=]==\\s*[\\w.?]*\\b(?:type|action|command)\\b`, 'g'),
];

const CASE_PATTERN = new RegExp(
  `case\\s+(?:['"](${NAME})['"]|(?:MESSAGE_TYPES\\.)?(${NAME}))\\s*:`,
  'g'
);

/**
 * Scan production source for message senders and handlers.
 * @param {Set<string>} ignored - names handled by another check (the CIT.* ops)
 * @param {Set<string>} constantNames - identifiers that genuinely hold a message type, so a bare
 *        `type: SOMETHING` can be told apart from an indexed lookup table
 * @returns {{senders: Map<string, Set<string>>, handlers: Map<string, Set<string>>}}
 */
function scanMessages(ignored = new Set(), constantNames = new Set()) {
  const senders = new Map();
  const handlers = new Map();
  const record = (bucket, name, file, viaIdentifier = false) => {
    if (ignored.has(name) || ROUTING_TARGETS.has(name)) {
      return;
    }
    if (viaIdentifier && !constantNames.has(name)) {
      return;
    }
    if (!bucket.has(name)) {
      bucket.set(name, new Set());
    }
    bucket.get(name).add(file);
  };

  for (const file of productionFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    const where = relative(file);

    SENDER_PATTERNS.forEach((pattern, index) => {
      for (const m of source.matchAll(pattern)) {
        record(senders, m[1], where, index > 0);
      }
    });
    HANDLER_PATTERNS.forEach((pattern, index) => {
      for (const m of source.matchAll(pattern)) {
        record(handlers, m[1], where, index === 1);
      }
    });
    for (const body of messageSwitchBodies(source)) {
      for (const m of body.matchAll(CASE_PATTERN)) {
        record(handlers, m[1] || m[2], where);
      }
    }
  }
  return { senders, handlers };
}

/**
 * Message types whose only sender is a file that also answers them.
 *
 * The sender/handler pair is what the rest of this gate checks, and a module that both raises a
 * message and handles it satisfies that pair on its own: the chain reads as wired while nothing
 * outside the module ever joins it. `UPDATE_SETTINGS` lived there for a release — the background
 * router broadcast it and carried the `case` for it, so the gate stayed green after the popup, its
 * only real sender, stopped sending. What was left was a second, whole-object way to write a
 * student's settings, waiting to be found and used.
 *
 * This cannot tell that shape apart from a module deliberately holding both ends across realms —
 * `offscreen-storage.js` is exactly that, its client half running in the offscreen document and its
 * validator half in the service worker. So the pattern is reported, not judged: each hit is either
 * deleted or admitted in the allowlist's SELF_WIRED bucket with a sentence saying which realm holds
 * which end.
 *
 * @param {Map<string, Set<string>>} senders
 * @param {Map<string, Set<string>>} handlers
 * @returns {Array<{name: string, file: string, handlers: string[]}>} sorted by message name
 */
function selfWiredMessages(senders, handlers) {
  const found = [];
  for (const [name, senderFiles] of senders) {
    const handlerFiles = handlers.get(name);
    if (!handlerFiles || senderFiles.size !== 1) {
      continue;
    }
    const [file] = [...senderFiles];
    if (handlerFiles.has(file)) {
      found.push({ name, file, handlers: [...handlerFiles].sort() });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Map each `CIT.*` operation to the RPC client method that raises it.
 * @returns {Array<{op: string, key: string, object: string, method: string}>}
 */
function rpcOperations() {
  const source = fs.readFileSync(path.join(SRC, 'features/citations/citation-rpc.js'), 'utf8');
  const ops = [];
  let current = null;
  for (const line of source.split('\n')) {
    const exported = line.match(/export const (\w+RPC)\s*=/);
    if (exported) {
      current = exported[1];
    }
    // Default arguments (`replace = false`, `options = {}`) put an `=` inside the parameter list,
    // so the arrow has to be matched as `=>` rather than by excluding `=`.
    const entry = line.match(/^\s*(\w+):\s*.*?=>\s*call\(CIT\.(\w+)/);
    if (entry && current) {
      ops.push({ op: `CIT_${entry[2]}`, key: entry[2], object: current, method: entry[1] });
    }
  }
  return ops;
}

/**
 * Files that define or relay the RPC contract rather than consume it. A mention here proves the
 * wire is connected, never that anything shipped travels down it — which is exactly how a tested,
 * dispatched, entirely unreachable operation survives a green suite.
 */
const RPC_PLUMBING = new Set([
  'features/citations/citation-rpc.js',
  'features/citations/citation-ops.js',
  'features/citations/citation-storage.js',
  'features/citations/citation-migration.js',
  'pages/assist-offscreen/citation-handler.js',
]);

/**
 * Names an RPC object is handed to as a collaborator: `showMigrationPrompt({ migration: ... })`.
 * Following one hop of injection is what stops the gate reporting the migration prompt's two
 * operations as unreachable when the prompt plainly calls them.
 * @returns {Map<string, Set<string>>} RPC object name → parameter names it is injected as
 */
function injectionAliases(sources) {
  const aliases = new Map();
  for (const { where, source } of sources) {
    if (RPC_PLUMBING.has(where)) {
      continue;
    }
    for (const m of source.matchAll(/(\w+)\s*:\s*(\w+RPC)\b/g)) {
      if (!aliases.has(m[2])) {
        aliases.set(m[2], new Set());
      }
      aliases.get(m[2]).add(m[1]);
    }
  }
  return aliases;
}

/**
 * Find production call sites for each RPC operation, following the local alias each importer binds
 * (`import { ProjectStorageRPC as ProjectStorage }`) and one hop of dependency injection.
 * @returns {{ops: Array, callers: Map<string, Set<string>>}} op code → files that call it
 */
function scanRpcCallers() {
  const ops = rpcOperations();
  const callers = new Map(ops.map(op => [op.op, new Set()]));
  const sources = productionFiles().map(file => ({
    where: relative(file),
    source: fs.readFileSync(file, 'utf8'),
  }));
  const injected = injectionAliases(sources);

  for (const { where, source } of sources) {
    if (RPC_PLUMBING.has(where)) {
      continue;
    }

    // Resolve what this file calls each RPC object, honouring `as` aliases.
    const local = new Map();
    if (source.includes('citation-rpc')) {
      for (const m of source.matchAll(/(\w+RPC)(?:\s+as\s+(\w+))?/g)) {
        local.set(m[1], m[2] || m[1]);
      }
    }
    for (const op of ops) {
      const names = new Set(injected.get(op.object) || []);
      if (local.has(op.object)) {
        names.add(local.get(op.object));
      }
      for (const name of names) {
        if (new RegExp(`\\b${name}\\.${op.method}\\s*\\(`).test(source)) {
          callers.get(op.op).add(where);
        }
      }
    }
  }
  return { ops, callers };
}

/**
 * What this scanner cannot see. Quoted in the failure message so a pass is never mistaken for proof.
 */
const LIMITS = [
  'Message names built at runtime (concatenation, template literals, computed keys).',
  'Dispatch through a lookup table or a variable handler name.',
  "A relay helper taking the name positionally — sendToOffscreen('WEBLLM_UNLOAD') is not read as a sender.",
  'One name used at two hops (popup→worker, worker→offscreen) is collapsed into a single pair.',
  'Messages raised or answered outside src/*.js — HTML inline script, injected page code.',
  'Transitive death: a caller that is itself unreachable still counts as a caller here.',
  'Anything reached only from an E2E spec or an external tool.',
  'Which realm a sender aims at, so a module holding both ends of a message needs a human reason.',
];

module.exports = {
  scanMessages,
  scanRpcCallers,
  rpcOperations,
  productionFiles,
  selfWiredMessages,
  LIMITS,
};
