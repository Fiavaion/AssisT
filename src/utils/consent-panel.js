/**
 * The first-use consent panel (ADR 0006).
 *
 * A student who skipped the first-run wizard is asked here, the first time they use a feature that
 * sends something to an outside service: which service, what exactly is sent, allow or not now.
 * Allow records a yes and the caller completes the request; not now (or Escape) records a no, and
 * the feature then shows `createDeclinedNotice`, which says nothing was sent and offers Allow in
 * place, so the student is never asked again unprompted.
 *
 * The panel is drawn over a page whose own scripts are not ours, so the yes is guarded:
 *   - Everything is inside a CLOSED shadow root. The page cannot read, restyle, focus or click the
 *     buttons, and cannot pre-empt the panel's styles, because they live in that root too.
 *   - Allow counts only for a primary-button press the browser produced from real input
 *     (`event.isTrusted`), or a real Enter or Space, not held down, while focus is on Allow inside
 *     the root. A right-click, a synthetic click or a key pressed elsewhere is not a yes.
 *   - Where Chrome can say whether Allow is actually visible and unobscured (IntersectionObserver
 *     with trackVisibility), a press on an Allow the page has covered or faded is not a yes either,
 *     and until Chrome's first report Allow is unavailable and the panel says it is getting ready.
 *     If Chrome goes on reporting Allow covered (a colour filter fading the whole page does this),
 *     the panel says so and where else the service can be allowed.
 *   - What the page does to the panel's host element (its style, its attributes) is put back before
 *     the next frame. If the page removes it, the panel closes and nothing is recorded or sent.
 * The notice's Allow does not record a yes itself, because the notice sits in a feature surface in
 * the page's DOM: it opens this panel, and the yes is given here.
 *
 * A service that also needs a Chrome host (ADR 0009: all of them except dictation) is asked for in
 * the same press as the consent. In an extension page the panel's Allow asks Chrome before anything
 * is awaited. A content script has no `chrome.permissions`, so there the question is asked instead
 * in a small extension window the service worker opens (`background/consent-window.js`), which the
 * page cannot reach at all; the worker records the answer and this module only waits for it.
 *
 * Built with createElement and textContent throughout: the only page-derived text shown (the
 * word or passage being sent) never passes through markup.
 *
 * @module utils/consent-panel
 */

import { DESTINATIONS, describeConsentQuestion, recordConsent } from './consent.js';
import { originsFor, requestHostPermissions } from './host-permissions.js';
import { attachAccessibleHandler } from './event-handlers.js';
import { trapFocus } from './focus-trap.js';
import { returnFocusAfterDialog } from './dialog-return-focus.js';
import { Z } from './z-index.js';

const NOTICE_STYLE_ID = 'assist-consent-notice-styles';

/**
 * The host's own box, set inline and !important: a page stylesheet cannot outrank an inline
 * !important declaration, and a page script that edits the attribute closes the panel.
 */
const HOST_STYLE = [
  'position: fixed !important',
  'inset: 0 !important',
  'display: block !important',
  'visibility: visible !important',
  'opacity: 1 !important',
  'transform: none !important',
  'filter: none !important',
  'clip-path: none !important',
  'mask: none !important',
  'mix-blend-mode: normal !important',
  'pointer-events: auto !important',
  'margin: 0 !important',
  'padding: 0 !important',
  'border: 0 !important',
  `z-index: ${Z.POINTER} !important`,
].join('; ');

/**
 * The panel has its own surface, so it follows the system's light or dark scheme and holds AA in
 * both. The notice sits inside another feature's surface, whose scheme it cannot know, so its text
 * inherits that surface's colour and its one button carries its own AA pair with a two-tone focus
 * ring that shows against light and dark alike. No fixed heights anywhere, so text spacing
 * (SC 1.4.12) can grow freely.
 */
const PANEL_STYLES = `
.assist-consent-backdrop {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55); padding: 16px; box-sizing: border-box;
}
.assist-consent-backdrop .assist-consent-dialog {
  --assist-consent-bg: #ffffff; --assist-consent-text: #1a1a1a; --assist-consent-muted: #404040;
  --assist-consent-primary: #1a56db; --assist-consent-on-primary: #ffffff;
  --assist-consent-border: #595959; --assist-consent-focus: #1a56db;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 16px; line-height: 1.5; text-align: left;
  color: var(--assist-consent-text); background: var(--assist-consent-bg);
  border-radius: 12px; padding: 1.5em; width: min(30em, 100%); max-height: 100%;
  overflow-y: auto; box-sizing: border-box; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
@media (prefers-color-scheme: dark) {
  .assist-consent-backdrop .assist-consent-dialog {
    --assist-consent-bg: #1f2328; --assist-consent-text: #f3f4f6; --assist-consent-muted: #d1d5db;
    --assist-consent-primary: #93c5fd; --assist-consent-on-primary: #111827;
    --assist-consent-border: #9ca3af; --assist-consent-focus: #93c5fd;
  }
}
.assist-consent-backdrop .assist-consent-title {
  margin: 0 0 0.75em; font-size: 1.25em; font-weight: 600; line-height: 1.4;
  color: var(--assist-consent-text);
}
.assist-consent-backdrop .assist-consent-dialog p { margin: 0 0 0.75em; color: var(--assist-consent-text); }
.assist-consent-backdrop .assist-consent-dialog p.assist-consent-muted { color: var(--assist-consent-muted); }
.assist-consent-backdrop .assist-consent-detail {
  display: block; margin-top: 0.25em; font-style: italic; overflow-wrap: anywhere;
}
.assist-consent-backdrop .assist-consent-actions {
  display: flex; flex-wrap: wrap; gap: 0.75em; margin-top: 1em;
}
.assist-consent-backdrop button.assist-consent-btn {
  min-height: 44px; min-width: 44px; padding: 0.5em 1.25em; border-radius: 6px;
  font: inherit; font-weight: 600; line-height: 1.5; cursor: pointer; text-align: center;
}
.assist-consent-backdrop button.assist-consent-btn {
  border: 2px solid var(--assist-consent-border); background: transparent;
  color: var(--assist-consent-text);
}
.assist-consent-backdrop button.assist-consent-btn--primary {
  background: var(--assist-consent-primary); border-color: var(--assist-consent-primary);
  color: var(--assist-consent-on-primary);
}
.assist-consent-backdrop button.assist-consent-btn:focus-visible {
  outline: 3px solid var(--assist-consent-focus); outline-offset: 2px;
}
.assist-consent-backdrop button.assist-consent-btn[aria-disabled="true"] { cursor: not-allowed; }
.assist-consent-backdrop .assist-consent-dialog p.assist-consent-waiting { margin: 0.75em 0 0; }
.assist-consent-backdrop .assist-consent-dialog p.assist-consent-waiting:empty { margin: 0; }
`;

const NOTICE_STYLES = `
.assist-consent-notice .assist-consent-actions {
  display: flex; flex-wrap: wrap; gap: 0.75em; margin-top: 1em;
}
.assist-consent-notice button.assist-consent-btn {
  min-height: 44px; min-width: 44px; padding: 0.5em 1.25em; border-radius: 6px;
  font: inherit; font-weight: 600; line-height: 1.5; cursor: pointer; text-align: center;
}
.assist-consent-notice { line-height: 1.5; text-align: left; color: inherit; }
.assist-consent-notice p { margin: 0 0 0.5em; color: inherit; }
.assist-consent-notice button.assist-consent-btn {
  border: 2px solid #1a56db; background: #1a56db; color: #ffffff;
}
.assist-consent-notice button.assist-consent-btn:focus-visible {
  outline: none; box-shadow: 0 0 0 2px #ffffff, 0 0 0 5px #1a56db;
}
`;

let idCounter = 0;

/** One open question per destination, so two lookups at once share a panel and an answer. */
const pending = new Map();

/** For a question asked in the consent window: its request id, once the worker has given one. */
const windowRequests = new Map();

/** The note on the page itself: kept clear of the edges, and dismissable (SC 2.4.11). */
const WINDOW_TOAST_STYLE = [
  'position: fixed',
  'bottom: 24px',
  'left: 50%',
  'transform: translateX(-50%)',
  'display: flex',
  'flex-wrap: wrap',
  'align-items: center',
  'gap: 0.75em',
  'max-width: min(32em, calc(100% - 32px))',
  'margin: 0',
  'padding: 0.75em 1em 0.75em 1.25em',
  'border-radius: 8px',
  'background: #1e293b',
  'color: #ffffff',
  'font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3)',
  `z-index: ${Z.TOAST}`,
].join('; ');

const WINDOW_TOAST_BUTTON_STYLE = [
  'min-height: 44px',
  'min-width: 44px',
  'padding: 0.25em 1em',
  'border: 2px solid #ffffff',
  'border-radius: 6px',
  'background: transparent',
  'color: #ffffff',
  'font: inherit',
  'font-weight: 600',
  'cursor: pointer',
].join('; ');

/** The note inside a feature dialog: part of its flow, in the dialog's own colours. */
const WINDOW_NOTE_STYLE =
  'margin: 0.75em 0; padding: 0.5em 0.75em; border-left: 4px solid currentColor;';

/** Everything the window note added for a destination, so it can all be taken away. */
const windowNotes = new Map();

function clearWindowQuestion(destination) {
  windowNotes.get(destination)?.();
  windowNotes.delete(destination);
}

/**
 * Say, politely, where the question is while the consent window asks it (SC 4.1.3): a window can
 * fall behind Chrome, and without this the tool that asked looks dead. Calling it again says it
 * again.
 *
 * Inside an open feature dialog the note goes in the dialog, because aria-modal hides everything
 * outside it from a screen reader; there it is part of the dialog's flow. Otherwise it sits at the
 * foot of the page with a Dismiss button, so it never has to stay over a control that has focus
 * (SC 2.4.11). Either way the region is in place, empty, before its words arrive on the next
 * frame, so a screen reader announces them.
 * @param {string} destination
 */
function announceWindowQuestion(destination) {
  clearWindowQuestion(destination);

  const status = element('p');
  status.setAttribute('data-assist-consent-window-status', destination);
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const dialog = openDialogBeneath();
  if (dialog) {
    status.setAttribute('style', WINDOW_NOTE_STYLE);
    dialog.appendChild(status);
    windowNotes.set(destination, () => status.remove());
  } else {
    status.setAttribute('style', 'margin: 0; flex: 1 1 16em;');
    const toast = element('div');
    toast.setAttribute('data-assist-consent-window-note', destination);
    toast.setAttribute('style', WINDOW_TOAST_STYLE);
    const dismiss = element('button', '', 'Dismiss');
    dismiss.type = 'button';
    dismiss.setAttribute('style', WINDOW_TOAST_BUTTON_STYLE);
    const detach = attachAccessibleHandler(
      dismiss,
      `Dismiss consent window note (${destination})`,
      () => clearWindowQuestion(destination)
    );
    toast.append(status, dismiss);
    document.body.appendChild(toast);
    windowNotes.set(destination, () => {
      detach();
      toast.remove();
    });
  }

  const { service } = DESTINATIONS[destination];
  afterNextFrame(() => {
    if (status.isConnected) {
      status.textContent = `AssisT is asking about ${service} in a separate window. If you cannot see it, it may be behind this one.`;
    }
  });
}

/** Whether this realm can ask Chrome for a host: an extension page can, a content script cannot. */
function canAskChrome() {
  return typeof chrome !== 'undefined' && !!chrome.permissions;
}

/**
 * Ask in the consent window the service worker opens (ADR 0009), and wait for its answer. The
 * worker records the answer the window gives; here a closed window, or one that could not be
 * opened, is a no with nothing recorded.
 *
 * @param {string} destination
 * @param {{detail?: string, detailLabel?: string, declinedBefore?: boolean}} question
 * @returns {Promise<'granted'|'declined'>}
 */
function askInWindow(destination, { detail, detailLabel, declinedBefore }) {
  return new Promise(resolve => {
    let request = null;
    windowRequests.set(destination, () => request);
    const listener = message => {
      if (message?.type !== 'CONSENT_WINDOW_ANSWER' || request === null) {
        return;
      }
      if (message.request === request) {
        done(message.answer === 'granted' ? 'granted' : 'declined');
      }
    };
    function done(result) {
      chrome.runtime.onMessage.removeListener(listener);
      resolve(result);
    }
    chrome.runtime.onMessage.addListener(listener);
    Promise.resolve()
      .then(() =>
        chrome.runtime.sendMessage({
          type: 'CONSENT_WINDOW_OPEN',
          destination,
          detail,
          detailLabel,
          declinedBefore,
        })
      )
      .then(reply => {
        if (reply?.success === true && typeof reply.request === 'string') {
          request = reply.request;
        } else {
          done('declined');
        }
      })
      .catch(() => done('declined'));
  });
}

/**
 * Each panel's closed root, by host. Only this module holds it; page scripts run in another world
 * and cannot import a content script's modules, so the hook below opens nothing to them.
 * @type {WeakMap<HTMLElement, ShadowRoot>}
 */
const roots = new WeakMap();

/**
 * The closed shadow root behind a panel's host element. For tests only: jsdom cannot produce the
 * trusted input the panel acts on, and a closed root is otherwise unreachable from outside.
 * @param {Element|null} host
 * @returns {ShadowRoot|null}
 */
export function shadowRootForTests(host) {
  return (host && roots.get(host)) || null;
}

/**
 * Whether an event comes from real input.
 * @param {Event} event
 * @returns {boolean}
 */
function isGenuineEvent(event) {
  return !!event && event.isTrusted === true;
}

/**
 * How long Allow waits for Chrome's first visibility report before the other guards decide alone.
 * Chrome has been measured taking over half a second to send it.
 */
const FIRST_REPORT_WAIT_MS = 2000;

/**
 * Whether Chrome can report that an element is visible and unobscured, and what it last said.
 * Where it cannot, the other guards stand on their own and there is nothing to wait for.
 *
 * A press is judged on what Chrome has already said, never on a report still to come: between a
 * press and a later report a page can fade Allow's ancestors, take the press and put them back.
 * So until Chrome first says Allow can be seen, `ready()` is false and a press is ignored.
 * `onReady` runs once, when that first visible report arrives, or when FIRST_REPORT_WAIT_MS pass
 * with no report at all (Chrome not sending one is not something a page can cause by covering
 * Allow, because a covered Allow is still reported, as not visible). When FIRST_REPORT_WAIT_MS pass
 * and every report so far said not visible, `onCovered` runs instead, and Allow stays unavailable
 * until a visible report brings `onReady`.
 * @param {Element} target
 * @param {{onReady: () => void, onCovered: () => void}} handlers
 * @returns {{ready: () => boolean, visibleNow: () => boolean, stop: () => void}}
 */
function watchVisibility(target, { onReady, onCovered }) {
  const supported =
    typeof IntersectionObserver === 'function' &&
    typeof IntersectionObserverEntry === 'function' &&
    'isVisible' in IntersectionObserverEntry.prototype;
  if (!supported) {
    return { ready: () => true, visibleNow: () => true, stop: () => {} };
  }
  let visible = null;
  let isReady = false;
  let timer = null;
  const becomeReady = () => {
    if (!isReady) {
      isReady = true;
      clearTimeout(timer);
      onReady();
    }
  };
  let observer;
  try {
    observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          visible = entry.isVisible === true;
        });
        if (visible) {
          becomeReady();
        }
      },
      { trackVisibility: true, delay: 100 }
    );
    observer.observe(target);
  } catch {
    // Chrome refused the observer: it cannot report, so the other guards stand alone, as where
    // it is unsupported. (A page cannot cause this; it runs in the content script's own world.)
    return { ready: () => true, visibleNow: () => true, stop: () => {} };
  }
  timer = setTimeout(() => {
    if (visible === null) {
      becomeReady();
    } else if (!isReady) {
      onCovered();
    }
  }, FIRST_REPORT_WAIT_MS);
  return {
    ready: () => isReady,
    visibleNow: () => visible !== false,
    stop: () => {
      clearTimeout(timer);
      observer.disconnect();
    },
  };
}

/** Runs `callback` if the next frame never comes (a page that has stopped painting). */
const NEXT_FRAME_FALLBACK_MS = 100;

/**
 * Runs `callback` once, after the next frame has been drawn, so a change it makes to a live
 * region reaches the accessibility tree separately from the region's own arrival.
 * @param {() => void} callback
 */
function afterNextFrame(callback) {
  let done = false;
  const once = () => {
    if (!done) {
      done = true;
      callback();
    }
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => setTimeout(once, 0));
  }
  setTimeout(once, NEXT_FRAME_FALLBACK_MS);
}

function ensureNoticeStyles() {
  if (document.getElementById(NOTICE_STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = NOTICE_STYLE_ID;
  style.textContent = NOTICE_STYLES;
  (document.head || document.documentElement).appendChild(style);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/**
 * The feature dialog still open under the panel, if any: the last modal dialog in the document
 * that is not hidden and is actually rendered (a stylesheet can hide one without the attribute).
 * `checkVisibility` is Chrome's answer to "is this rendered"; where it is missing (jsdom has no
 * layout) the hidden attribute alone decides. (returnFocusAfterDialog does nothing once focus is
 * somewhere, so the selection after it is only a fallback.)
 * @returns {HTMLElement|null}
 */
function openDialogBeneath() {
  const open = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter(
    dialog =>
      !dialog.closest('[hidden]') &&
      (typeof dialog.checkVisibility !== 'function' || dialog.checkVisibility())
  );
  return open.length ? open[open.length - 1] : null;
}

function makeButton(label, primary) {
  const node = element(
    'button',
    `assist-consent-btn${primary ? ' assist-consent-btn--primary' : ''}`,
    label
  );
  node.type = 'button';
  return node;
}

/**
 * Whether this press on Allow is the student's own input: real, and the primary mouse button or an
 * unrepeated Enter or Space with focus on Allow inside the panel. Whether Allow could be seen is
 * asked separately, of what Chrome has reported so far.
 *
 * @param {Event} event
 * @param {{allow: HTMLElement, root: ShadowRoot, isReal: (event: Event) => boolean}} context
 * @returns {boolean}
 */
function isStudentsYes(event, { allow, root, isReal }) {
  if (!event || !isReal(event)) {
    return false;
  }
  if (event.type === 'mousedown' || event.type === 'click') {
    return event.button === 0;
  }
  if (event.type === 'keydown') {
    return (
      !event.repeat && (event.key === 'Enter' || event.key === ' ') && root.activeElement === allow
    );
  }
  return false;
}

/**
 * Ask the student, once, whether a destination may be used.
 *
 * @param {string} destination - a key of DESTINATIONS
 * @param {Object} [options]
 * @param {string} [options.detail] - the exact thing that would be sent (the word, the passage),
 *   shown as text so the student sees precisely what leaves the device
 * @param {string} [options.detailLabel] - the words before the detail, when "This time that is:"
 *   would not be true (a whole page is more than one passage)
 * @param {boolean} [options.declinedBefore] - the student said no before and has now pressed the
 *   tool again: the panel says so before it asks
 * @param {HTMLElement} [options.returnFocus] - where focus goes if closing leaves it nowhere
 * @param {(event: Event) => boolean} [options.acceptsEvent] - whether an event is real input;
 *   `event.isTrusted` unless a test says otherwise. The button, focus and visibility rules apply
 *   whatever this says.
 * @returns {Promise<'granted'|'declined'>}
 */
export function askForConsent(destination, options = {}) {
  const description = DESTINATIONS[destination];
  if (!Object.hasOwn(DESTINATIONS, destination) || !description) {
    return Promise.resolve('declined');
  }
  if (pending.has(destination)) {
    // Asked again while the consent window is open: it may have fallen behind Chrome, so bring it
    // forward and say where it is, rather than a press that does nothing.
    const openRequest = windowRequests.get(destination)?.();
    if (openRequest) {
      Promise.resolve()
        .then(() =>
          chrome.runtime.sendMessage({ type: 'CONSENT_WINDOW_FOCUS', request: openRequest })
        )
        .catch(() => {});
      announceWindowQuestion(destination);
    }
    return pending.get(destination);
  }

  const {
    detail,
    detailLabel,
    declinedBefore,
    returnFocus,
    acceptsEvent = isGenuineEvent,
  } = options;

  const origins = originsFor([destination]);
  if (origins.length > 0 && !canAskChrome()) {
    announceWindowQuestion(destination);
    const fromWindow = askInWindow(destination, { detail, detailLabel, declinedBefore }).then(
      result => {
        pending.delete(destination);
        windowRequests.delete(destination);
        clearWindowQuestion(destination);
        // As for the panel: back into the feature dialog that asked, if one is open.
        returnFocusAfterDialog(openDialogBeneath());
        returnFocusAfterDialog(returnFocus);
        return result;
      }
    );
    pending.set(destination, fromWindow);
    return fromWindow;
  }

  const answer = new Promise(resolve => {
    const id = `assist-consent-${++idCounter}`;

    const host = document.createElement('div');
    host.setAttribute('data-assist-consent-panel', destination);
    host.setAttribute('style', HOST_STYLE);
    const root = host.attachShadow({ mode: 'closed' });
    roots.set(host, root);

    const style = document.createElement('style');
    style.textContent = PANEL_STYLES;

    const backdrop = element('div', 'assist-consent-backdrop');

    const dialog = element('div', 'assist-consent-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.setAttribute('aria-describedby', `${id}-body`);

    const question = describeConsentQuestion(destination, { detail, detailLabel, declinedBefore });
    const title = element('h2', 'assist-consent-title', question.title);
    title.id = `${id}-title`;

    const body = element('div');
    body.id = `${id}-body`;
    if (question.earlier) {
      body.appendChild(element('p', '', question.earlier));
    }
    body.appendChild(element('p', '', question.purpose));
    if (question.note) {
      body.appendChild(element('p', '', question.note));
    }
    if (question.detail) {
      const what = element('p', '', question.detailLabel);
      const quoted = element('span', 'assist-consent-detail', question.detail);
      quoted.setAttribute('data-assist-consent-detail', '');
      what.appendChild(quoted);
      body.appendChild(what);
    }
    body.appendChild(element('p', 'assist-consent-muted', question.reassurance));

    const actions = element('div', 'assist-consent-actions');
    const allow = makeButton('Allow', true);
    const notNow = makeButton('Not now', false);
    actions.append(allow, notNow);

    // In the panel, empty, from the start: a screen reader announces a change to a status region
    // that is already there, not one created with its text.
    const status = element('p', 'assist-consent-muted assist-consent-waiting');
    status.setAttribute('role', 'status');

    dialog.append(title, body, actions, status);
    backdrop.appendChild(dialog);
    root.append(style, backdrop);
    document.body.appendChild(host);

    // Until Chrome has said Allow can be seen, Allow is unavailable and the panel says so.
    const visibility = watchVisibility(allow, {
      onReady: () => {
        allow.removeAttribute('aria-disabled');
        status.textContent = '';
      },
      onCovered: () => {
        status.textContent = `Allow is not available because something on this page is covering or fading this question. A colour filter or another extension can do this. You can allow ${description.service} in the AssisT popup instead: choose Advanced options (the gear button), then Your data.`;
      },
    });
    if (!visibility.ready()) {
      allow.setAttribute('aria-disabled', 'true');
      afterNextFrame(() => {
        if (!visibility.ready() && !status.textContent) {
          status.textContent = 'Getting ready…';
        }
      });
    }
    let finished = false;
    const cleanups = [];
    let release = () => {};

    /**
     * @param {boolean|Promise<boolean>} decision - the answer, or Chrome's answer still to come:
     *   the panel closes in the press, and the answer is recorded once Chrome has given it
     * @param {{record?: boolean}} [how] - record: false when the student gave no answer (the page
     *   tampered with the panel), so nothing is stored and nothing is sent
     */
    async function finish(decision, { record = true } = {}) {
      if (finished) {
        return;
      }
      finished = true;
      tamper.disconnect();
      visibility.stop();
      cleanups.forEach(cleanup => cleanup());
      release();
      host.remove();
      // The request this panel gated usually belongs to a feature dialog that is still open (the
      // dictionary's "Looking up" box, the translation dialog) and goes on to show its answer
      // there. If going back to what had focus did not work (it was disabled, or gone), focus
      // belongs in that dialog, not out on the page behind it; the selection is only the place
      // to go when nothing is left open.
      returnFocusAfterDialog(openDialogBeneath());
      returnFocusAfterDialog(returnFocus);
      const granted = (await decision) === true;
      pending.delete(destination);
      if (record) {
        try {
          await recordConsent(destination, granted);
        } catch (error) {
          console.error('[AssisT] Could not record the answer:', error);
        }
      }
      resolve(granted ? 'granted' : 'declined');
    }

    // What the page does to the host is undone before the next frame paints: its style and its
    // attributes are put back. Another extension restyling every element (a dark theme) is
    // undone the same way rather than closing the question. Removing the host is not an answer:
    // the panel closes, nothing is recorded and nothing is sent.
    const restoreHost = () => {
      [...host.attributes].forEach(attribute => {
        if (attribute.name !== 'style' && attribute.name !== 'data-assist-consent-panel') {
          host.removeAttribute(attribute.name);
        }
      });
      if (host.getAttribute('style') !== HOST_STYLE) {
        host.setAttribute('style', HOST_STYLE);
      }
      if (host.getAttribute('data-assist-consent-panel') !== destination) {
        host.setAttribute('data-assist-consent-panel', destination);
      }
    };
    const tamper = new MutationObserver(records => {
      // A page being torn down (the tab closing) has no document left to put focus back into.
      if (typeof document === 'undefined' || !host.ownerDocument.defaultView) {
        return;
      }
      if (records.some(record => [...(record.removedNodes || [])].includes(host))) {
        finish(false, { record: false });
        return;
      }
      if (records.some(record => record.type === 'attributes' && record.target === host)) {
        restoreHost();
        // Our own writes are reported too; they change nothing, so they stop here.
        tamper.takeRecords();
      }
    });
    tamper.observe(host, { attributes: true });
    tamper.observe(document.body, { childList: true });

    const context = { allow, root, isReal: acceptsEvent };
    cleanups.push(
      attachAccessibleHandler(allow, `Consent Allow (${destination})`, event => {
        // A covered or faded Allow is not a yes (clickjacking). The press is judged now, on what
        // Chrome has already reported, and answered in this same task.
        if (visibility.ready() && visibility.visibleNow() && isStudentsYes(event, context)) {
          // Where a host is needed, Chrome is asked in this press, before anything is awaited: a
          // gesture does not survive an await. A refused prompt is a no.
          finish(origins.length === 0 ? true : requestHostPermissions(origins));
        }
      }),
      attachAccessibleHandler(notNow, `Consent Not Now (${destination})`, () => finish(false))
    );

    release = trapFocus(dialog, {
      onEscape: () => finish(false),
      initialFocus: notNow,
    });
  });

  pending.set(destination, answer);
  return answer;
}

/**
 * The message a feature shows after a "not now": what did not happen, why, and a way to allow it
 * without going anywhere else.
 *
 * Its Allow asks the question again (the panel, or from a page the consent window), where the yes
 * is given: the notice sits in a feature surface in the page's DOM, which the page can reach.
 *
 * @param {string} destination - a key of DESTINATIONS
 * @param {Object} options
 * @param {Function} options.onAllowed - runs once the student has said yes in the panel; the
 *   feature retries here
 * @param {Object} [options.panelOptions] - passed to askForConsent (detail, acceptsEvent), with
 *   declinedBefore set: the question says the earlier answer was no
 * @returns {HTMLElement}
 */
export function createDeclinedNotice(destination, { onAllowed, panelOptions = {} }) {
  ensureNoticeStyles();
  const description = DESTINATIONS[destination];
  const notice = element('div', 'assist-consent-notice');
  notice.setAttribute('data-assist-consent-notice', destination);
  notice.appendChild(
    element(
      'p',
      '',
      `Nothing was sent. You chose not to use ${description.service} to ${description.action}.`
    )
  );

  const actions = element('div', 'assist-consent-actions');
  const allow = makeButton(`Allow ${description.service}`, true);
  actions.appendChild(allow);
  notice.appendChild(actions);

  // The notice only ever shows after a no, so the question it asks says so, panel or window.
  const askOptions = { declinedBefore: true, ...panelOptions, returnFocus: allow };
  let busy = false;
  attachAccessibleHandler(allow, `Consent Allow From Notice (${destination})`, async () => {
    if (busy) {
      // Asked again while the question is open: the same question, brought forward.
      askForConsent(destination, askOptions);
      return;
    }
    busy = true;
    const answer = await askForConsent(destination, askOptions);
    busy = false;
    if (answer === 'granted') {
      onAllowed();
    }
  });

  return notice;
}
