/**
 * A broadcast the service worker sends comes straight back to the service worker.
 *
 * `chrome.runtime.sendMessage` from the background page is delivered to every extension context
 * including the sender's own listener. A model download ticks progress many times a second, and
 * with no branch for its own message the listener fell through to `MessageRouter.route`, which
 * threw "Unknown message type" on every tick and filled the student's console with errors during a
 * perfectly normal download.
 *
 * The fix has one shape, already used by the WebLLM progress broadcasts: tag the message with its
 * `source`, and return early on it before the router is reached. This gate keeps that shape.
 */

const fs = require('fs');
const path = require('path');

const WORKER = path.join(__dirname, '..', '..', '..', 'src', 'background', 'service-worker.js');
const source = fs.readFileSync(WORKER, 'utf8');

/** Names the service worker broadcasts to all contexts, as `type:` or `action:` literals. */
function broadcastNames(text) {
  const names = new Set();
  const calls = text.matchAll(/sendMessage\(\s*\{([\s\S]{0,400}?)\}\s*\)/g);
  for (const [, body] of calls) {
    const name = body.match(/\b(?:type|action):\s*'([A-Z0-9_]+)'/);
    if (name) {
      names.add(name[1]);
    }
  }
  return [...names];
}

describe('the service worker does not route its own broadcasts', () => {
  const names = broadcastNames(source);

  test('the install-progress broadcast is one of them', () => {
    expect(names).toContain('LLM_INSTALL_PROGRESS');
  });

  test.each(names)('%s is tagged with a source and guarded before the router', name => {
    const call = source.match(
      new RegExp(
        `sendMessage\\(\\s*\\{[\\s\\S]{0,400}?\\b(?:type|action):\\s*'${name}'[\\s\\S]{0,400}?\\}\\s*\\)`
      )
    );
    expect(call).not.toBeNull();
    expect(call[0]).toMatch(/source:/);

    const guard = source.search(new RegExp(`message\\.(?:type|action) === '${name}'`));
    const router = source.indexOf('MessageRouter.route(');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(router);
  });
});
