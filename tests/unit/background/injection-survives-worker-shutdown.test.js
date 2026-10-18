/**
 * Putting AssisT into an ordinary page must not depend on a timer.
 *
 * On sites the manifest does not match, the service worker injects the content script itself when a
 * tab finishes loading. It used to arm a 100ms `setTimeout` first, to debounce bulk tab restores.
 * A service worker is not a page: the browser keeps it alive while it is still awaiting an event it
 * was handed, and stops it once it goes quiet. A pending timer is not something it waits for, so a
 * timer due in 100ms dies with the worker — and a page finishing loading is usually the last thing
 * the worker is asked to do, so the shutdown very often wins.
 *
 * A real-web tester saw exactly that: on the same article, the script was injected three times and
 * never appeared at all twice, once after 69 seconds of polling, with nothing logged and nothing
 * said to the student. The fix is to do the work inside the listener and await it.
 *
 * The service worker registers its listeners at import time and exports nothing, so this suite reads
 * it as source, which is how the other gates in this directory work.
 */

const fs = require('fs');
const path = require('path');

const WORKER = path.join(__dirname, '..', '..', '..', 'src', 'background', 'service-worker.js');
const source = fs.readFileSync(WORKER, 'utf8');

/** The body of the `chrome.tabs.onUpdated` listener, brace-matched from its opening. */
function tabUpdatedListener(text) {
  const start = text.indexOf('chrome.tabs.onUpdated.addListener(');
  if (start === -1) {
    return null;
  }
  let depth = 0;
  for (let i = text.indexOf('(', start); i < text.length; i++) {
    if (text[i] === '(') {
      depth++;
    } else if (text[i] === ')') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

describe('injecting into an ordinary page', () => {
  const listener = tabUpdatedListener(source);

  it('has a tab-update listener to read', () => {
    expect(listener).not.toBeNull();
  });

  it('never defers the injection to a timer, which a worker shutdown would discard', () => {
    expect(listener).not.toMatch(/setTimeout|setInterval/);
  });

  it('awaits the injection inside the listener, so the browser keeps the worker alive for it', () => {
    expect(listener).toMatch(/await\s+maybeInjectContentScript\(/);
  });

  it('still only runs once a page has finished loading', () => {
    expect(listener).toMatch(/changeInfo\.status\s*!==\s*'complete'/);
  });

  // One attempt at a time per tab; a caller arriving meanwhile is queued, not dropped (that
  // behaviour is driven for real in injection-race.test.js).
  it('still guards against two attempts at once for one tab', () => {
    expect(listener).toMatch(/withTabInjectionGuard\(tabId,/);
    expect(source).toMatch(/injecting\.get\(tabId\)/);
    expect(source).toMatch(/injecting\.set\(tabId,/);
    expect(source).toMatch(/injecting\.delete\(tabId\)/);
  });

  it('releases that guard even when the injection throws', () => {
    expect(source).toMatch(/finally\s*\{[\s\S]{0,80}injecting\.delete\(tabId\)/);
  });

  it('keeps that guard as the one gate every caller passes through', () => {
    // The catch-up sweep must share it, or a sweep and a tab load can inject the same page twice.
    expect(source.match(/injecting\.set\(/g)).toHaveLength(1);
    expect(source.match(/withTabInjectionGuard\(/g).length).toBeGreaterThanOrEqual(3);
  });

  it('re-reads the tab, because a redirect can make the event url stale', () => {
    expect(listener).toMatch(/chrome\.tabs\.get\(tabId\)/);
  });

  it('leaves no trace of the timer machinery it replaced', () => {
    expect(source).not.toMatch(/injectionTimers|DEBOUNCE_MS|injectionQueue/);
  });
});
