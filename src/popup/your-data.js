/**
 * "Your data", a tab of Advanced Options (ADR 0006).
 *
 * Two things a student has a right to see and change, in one place:
 *
 *   - every online service AssisT can send something to, with the answer the student gave (allowed,
 *     not allowed, not asked yet), changeable here with effect from the very next request;
 *   - every AI key stored on this computer, each removable, with a confirmation that says what
 *     will stop working. Until this existed a key could not be removed at all: saving an empty key
 *     is refused and there was no remove control, which on a shared computer is a real risk.
 *
 * Where an answer needs an optional host permission (Semantic Scholar), allowing it records the
 * yes first and then asks Chrome, in the same tick as the change: Chrome's prompt can close the
 * popup, and the answer must already be written when it does. A refusal while the popup is still
 * open records a no. Withdrawing gives the permission back, and turns "Verify citations online"
 * off, so the switch never says on for a check that cannot run.
 *
 * Removing an AI key is also a no to that provider: it is recorded, and shown straight away.
 *
 * Why here: Advanced Options is reached by the gear on both the classic and the Flat layout, and it
 * already holds the Preferences and AI tabs this sits beside. The Flat view's registry describes
 * tools a student switches on and off, and a list of answers and keys is not a tool.
 *
 * Built with createElement and textContent throughout. Radios bind `change` (the project's
 * exception for native form controls); buttons use attachAccessibleHandler.
 *
 * @module popup/your-data
 */

import { DESTINATIONS, listConsents, recordConsent, withdrawConsent } from '../utils/consent.js';
import { applySettingWrites } from '../utils/setting-writes.js';
import {
  originsFor,
  requestHostPermissions,
  releaseHostPermissions,
} from '../utils/host-permissions.js';
import {
  listSecureAPIKeys,
  deleteSecureAPIKey,
  hasSecureAPIKey,
} from '../core/storage/secure-key-storage.js';
import { attachAccessibleHandler } from '../utils/event-handlers.js';
import { trapFocus } from '../utils/focus-trap.js';
import { returnFocusAfterDialog } from '../utils/dialog-return-focus.js';
import { Z } from '../utils/z-index.js';

const STATE_WORDS = {
  granted: 'Allowed',
  declined: 'Not allowed',
  unasked: 'Not asked yet',
};

/** The provider the cloud router uses when none was ever chosen (ai/cloud-router.js). */
const ROUTER_DEFAULT_PROVIDER = 'anthropic';

let idCounter = 0;

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

function button(label, className) {
  const node = element('button', className, label);
  node.type = 'button';
  return node;
}

/** The name a student knows a stored key by, and what stops working without it. */
function keyDescription(provider) {
  if (Object.hasOwn(DESTINATIONS, provider)) {
    const name = DESTINATIONS[provider].service;
    return { name, stops: `Cloud AI with ${name}` };
  }
  return { name: provider, stops: `Anything that uses ${provider}` };
}

function formatDate(timestamp) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return '';
  }
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Say something through the tab's live region.
 * @param {HTMLElement} region
 * @param {string} message
 */
function announce(region, message) {
  region.textContent = '';
  // A fresh write, so a message identical to the last one is still read out.
  setTimeout(() => {
    region.textContent = message;
  }, 20);
}

// ---------------------------------------------------------------------------
// Online services
// ---------------------------------------------------------------------------

function radio(destination, value, labelText, checked) {
  const wrapper = element('div', 'your-data__option');
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = `your-data-${destination}`;
  input.id = `your-data-${destination}-${value}`;
  input.value = value;
  input.checked = checked;
  const label = element('label', 'your-data__option-label', labelText);
  label.setAttribute('for', input.id);
  wrapper.append(input, label);
  return { wrapper, input };
}

/**
 * Turn "Verify citations online" off where the popup and the citation analyser read it.
 * @returns {Promise<void>}
 */
async function switchVerifyOnlineOff() {
  const stored = await chrome.storage.local.get('citationAnalyzerSettings');
  await applySettingWrites([{ path: 'citation.verifyOnline', value: false }], {
    citationAnalyzerSettings: { ...(stored.citationAnalyzerSettings || {}), verifyOnline: false },
  });
}

/**
 * One service: what it is, what is sent, the current answer, and Allow / Don't allow.
 * @param {Object} entry - from listConsents
 * @param {HTMLElement} status - the live region
 * @param {Object} options - see renderYourData
 * @returns {{fieldset: HTMLFieldSetElement, show: (state: string) => void}} the group, and a way
 *   to show an answer changed elsewhere in the tab
 */
function createService(entry, status, options) {
  const { destination } = entry;
  const fieldset = element('fieldset', 'your-data__service');
  fieldset.dataset.destination = destination;
  const describedBy = `your-data-${destination}-what your-data-${destination}-state`;
  fieldset.setAttribute('aria-describedby', describedBy);

  // Service and purpose together: MyMemory and Google speech recognition each answer two questions.
  fieldset.appendChild(
    element('legend', 'your-data__service-name', `${entry.service}: ${entry.action}`)
  );
  const what = element('p', 'your-data__what', `AssisT sends ${entry.sends}.`);
  what.id = `your-data-${destination}-what`;
  const state = element('p', 'your-data__state');
  state.id = `your-data-${destination}-state`;
  fieldset.append(what, state);

  const choices = element('div', 'your-data__options');
  const allow = radio(destination, 'allow', 'Allow', entry.state === 'granted');
  const decline = radio(destination, 'decline', 'Don’t allow', entry.state === 'declined');
  choices.append(allow.wrapper, decline.wrapper);
  fieldset.appendChild(choices);

  const show = answer => {
    state.textContent = `Now: ${STATE_WORDS[answer]}`;
    allow.input.checked = answer === 'granted';
    decline.input.checked = answer === 'declined';
  };
  show(entry.state);

  const onChange = event => {
    const input = event.target;
    if (!input.checked) {
      return;
    }
    const wantsYes = input.value === 'allow';
    // The answer is written first and Chrome asked second, both before anything is awaited:
    // Chrome prompts only inside the gesture that made this change, and its prompt can close the
    // popup, by which time the answer has been sent.
    const recorded = recordConsent(destination, wantsYes);
    const permission = wantsYes
      ? requestHostPermissions(originsFor([destination]))
      : Promise.resolve(false);

    recorded
      .then(() => permission)
      .then(async granted => {
        if (wantsYes && !granted) {
          // Chrome was refused while the popup is still open: that is a no.
          await recordConsent(destination, false);
          show('declined');
          announce(
            status,
            `Chrome did not give AssisT access to ${entry.service}, so it is not allowed.`
          );
          return;
        }
        if (!wantsYes) {
          await releaseHostPermissions([destination]);
          if (destination === 'citationVerification') {
            await switchVerifyOnlineOff();
            options.onVerifyOnlineOff?.();
          }
        }
        show(wantsYes ? 'granted' : 'declined');
        announce(
          status,
          wantsYes
            ? `${entry.service}: allowed.`
            : `${entry.service}: not allowed. Nothing more is sent to it.`
        );
      })
      .catch(error => {
        console.error('[AssisT] Could not record the answer:', error);
        announce(status, `Your answer for ${entry.service} could not be saved. Try again.`);
      });
  };
  allow.input.addEventListener('change', onChange);
  decline.input.addEventListener('change', onChange);

  return { fieldset, show };
}

// ---------------------------------------------------------------------------
// Saved AI keys
// ---------------------------------------------------------------------------

/**
 * Ask before removing a key, saying what will stop working.
 *
 * @param {{provider: string, name: string, stops: string, inUse: boolean}} key
 * @param {HTMLElement} opener
 * @param {() => Promise<void>} onRemove
 */
function confirmRemoval(key, opener, onRemove) {
  const id = `your-data-confirm-${++idCounter}`;
  const backdrop = element('div', 'your-data-confirm');
  backdrop.style.zIndex = String(Z.MODAL);

  const dialog = element('div', 'your-data-confirm__dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  dialog.setAttribute('aria-describedby', `${id}-body`);

  const title = element('h2', 'your-data-confirm__title', `Remove your ${key.name} key?`);
  title.id = `${id}-title`;
  const body = element('div');
  body.id = `${id}-body`;
  body.appendChild(
    element(
      'p',
      '',
      `AssisT will delete the key from this computer. ${key.stops} will stop working until you add a key again.`
    )
  );
  if (key.inUse) {
    body.appendChild(
      element(
        'p',
        '',
        'It is the AI AssisT uses now, so AI help will stop until you add a key or choose another kind of AI.'
      )
    );
  }

  const actions = element('div', 'your-data-confirm__actions');
  const keep = button('Keep key', 'your-data__btn');
  const remove = button('Remove key', 'your-data__btn your-data__btn--danger');
  actions.append(keep, remove);

  dialog.append(title, body, actions);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  let closed = false;
  const cleanups = [];
  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    cleanups.forEach(cleanup => cleanup());
    release();
    backdrop.remove();
    returnFocusAfterDialog(opener);
  };

  cleanups.push(
    attachAccessibleHandler(keep, `Keep ${key.name} key`, close),
    attachAccessibleHandler(remove, `Remove ${key.name} key`, async () => {
      if (closed) {
        return;
      }
      close();
      await onRemove();
    })
  );
  // Keep is the safe answer, so it is where the keyboard starts.
  const release = trapFocus(dialog, { onEscape: close, initialFocus: keep });
}

/**
 * Draw the list of stored keys.
 * @param {HTMLElement} section
 * @param {HTMLElement} status
 * @param {Object} options
 * @returns {Promise<void>}
 */
async function renderKeys(section, status, options) {
  section.replaceChildren();
  const heading = element('h4', 'your-data__heading', 'Saved AI keys');
  heading.id = 'your-data-keys-heading';
  heading.tabIndex = -1;
  section.appendChild(heading);

  const [keys, active] = await Promise.all([
    listSecureAPIKeys(),
    chrome.storage.local.get(['aiMode', 'cloudProvider']),
  ]);
  const provider = active.cloudProvider || ROUTER_DEFAULT_PROVIDER;

  if (keys.length === 0) {
    section.appendChild(element('p', 'your-data__empty', 'No AI keys are saved on this computer.'));
    return;
  }

  section.appendChild(
    element(
      'p',
      'your-data__intro',
      'These keys are kept, encrypted, in this browser only. They are never in a settings file.'
    )
  );
  const list = element('ul', 'your-data__keys');
  keys.forEach(entry => {
    const { name, stops } = keyDescription(entry.provider);
    const item = element('li', 'your-data__key');
    const text = element('div', 'your-data__key-text');
    text.appendChild(element('span', 'your-data__key-name', `${name} key`));
    const saved = formatDate(entry.createdAt);
    if (saved) {
      text.appendChild(element('span', 'your-data__key-date', `Saved ${saved}`));
    }
    const remove = button('Remove', 'your-data__btn your-data__btn--danger');
    remove.dataset.removeKey = entry.provider;
    remove.setAttribute('aria-label', `Remove ${name} key`);
    attachAccessibleHandler(remove, `Remove ${name} key`, () => {
      confirmRemoval(
        {
          provider: entry.provider,
          name,
          stops,
          inUse: active.aiMode === 'cloud' && entry.provider === provider,
        },
        remove,
        async () => {
          await deleteSecureAPIKey(entry.provider);
          const gone = !(await hasSecureAPIKey(entry.provider));
          if (gone && Object.hasOwn(DESTINATIONS, entry.provider)) {
            // Removing the key is a no to the provider, recorded like any other, and shown at once.
            await withdrawConsent(entry.provider);
            options.onConsentChanged?.(entry.provider, 'declined');
          }
          await renderKeys(section, status, options);
          section.querySelector('#your-data-keys-heading')?.focus();
          if (gone) {
            await releaseHostPermissions([entry.provider]);
            announce(status, `${name} key removed from this computer.`);
            options.onKeyRemoved?.(entry.provider);
          } else {
            announce(status, `The ${name} key could not be removed. Try again.`);
          }
        }
      );
    });
    item.append(text, remove);
    list.appendChild(item);
  });
  section.appendChild(list);
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

/**
 * Draw the whole tab into `container`, replacing what was there.
 *
 * @param {HTMLElement} container
 * @param {Object} [options]
 * @param {(provider: string) => void} [options.onKeyRemoved] - a key was removed
 * @param {() => void} [options.onVerifyOnlineOff] - "Verify citations online" was turned off
 *   because Semantic Scholar was not allowed
 * @returns {Promise<void>}
 */
export async function renderYourData(container, options = {}) {
  container.replaceChildren();
  container.classList.add('your-data');

  container.appendChild(element('h3', '', 'Your data'));
  container.appendChild(
    element(
      'p',
      'tab-description',
      'What AssisT may send to online services, and the AI keys kept on this computer. Changes here work straight away: you do not need to press Save.'
    )
  );

  const status = element('p', 'your-data__status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  container.appendChild(status);

  const services = element('section', 'your-data__section');
  services.dataset.yourData = 'services';
  services.appendChild(element('h4', 'your-data__heading', 'Online services'));
  services.appendChild(
    element(
      'p',
      'your-data__intro',
      'Nothing is sent to a service until you allow it, and nothing about you is sent: not your name, not your account.'
    )
  );
  const shown = new Map();
  (await listConsents()).forEach(entry => {
    const { fieldset, show } = createService(entry, status, options);
    shown.set(entry.destination, show);
    services.appendChild(fieldset);
  });
  container.appendChild(services);

  const keys = element('section', 'your-data__section');
  keys.dataset.yourData = 'keys';
  container.appendChild(keys);
  await renderKeys(keys, status, {
    ...options,
    onConsentChanged: (destination, state) => shown.get(destination)?.(state),
  });
}
