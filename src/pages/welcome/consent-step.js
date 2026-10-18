/**
 * The welcome page's consent step (ADR 0006): what AssisT may send to online services.
 *
 * It is the last step of every onboarding queue, because the guides before it (clean setup,
 * import, AI setup, discover) are what decide what is switched on, and the step asks only about
 * the services those choices would actually reach. A default install has the dictionary,
 * translation of a selection, Translate Page and Crossref on, so it is asked about those four; a
 * clean setup leaves only Translate Page, which is still a button in the popup; a chosen cloud AI
 * provider is added, dictation (Chrome's speech recognition, a Google service) when it is on,
 * lecture capture (the same service, hearing the whole room) while the lecture companion is on, and
 * Semantic Scholar only when online citation checking is on.
 *
 * Each service is its own question, with Allow and Don't allow and neither chosen until the
 * student chooses. Where there are two or more, "Allow all" and "Don't allow any" fill in every
 * answer at once; they only set the radios, so the student still sees each one, can change any of
 * them, and nothing is recorded until the save. A question left alone stays "not asked", and the
 * first-use question takes over when that tool is next used. Skipping the step (the hub's own
 * Skip) records nothing at all.
 *
 * Where an allowed service needs an optional host permission, all of them are requested in ONE
 * `chrome.permissions.request`, made synchronously from the click that saves the step: Chrome
 * shows its prompt only inside a user gesture. A refused prompt records that service as a no.
 *
 * @module pages/welcome/consent-step
 */

import { toolById } from '../../popup/registry/tool-registry.js';
import { isToolOn, isToolVisible, resolveValue } from '../../popup/registry/tool-state.js';
import {
  CLOUD_AI_DESTINATIONS,
  DESTINATIONS,
  listConsents,
  recordConsent,
} from '../../utils/consent.js';
import { originsFor, requestHostPermissions } from '../../utils/host-permissions.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { COMPANION_STORAGE_KEY } from '../../features/companion/companion-settings.js';
import { BUNDLED_OCR_LANGUAGES } from '../../features/ocr/ocr-engine-files.js';

export const CONSENT_STEP_ID = 'consent';

/** The provider the cloud router uses when none was ever chosen (ai/cloud-router.js). */
const ROUTER_DEFAULT_PROVIDER = 'anthropic';

/**
 * The queue with the consent step at the end, exactly once.
 * @param {Array} queue
 * @returns {Array}
 */
export function withConsentStep(queue) {
  const steps = Array.isArray(queue) ? queue : [];
  if (steps.some(step => step.trackId === CONSENT_STEP_ID)) {
    return steps;
  }
  return [
    ...steps,
    {
      trackId: CONSENT_STEP_ID,
      kind: 'inline',
      label: 'Choose what AssisT may send online',
      requiresAI: false,
      status: 'pending',
    },
  ];
}

function control(tool, id) {
  return (tool?.controls || []).find(item => item.id === id);
}

/**
 * The destinations the student's current settings would send something to, in a fixed order.
 * Read from the popup's tool registry, so it follows the same defaults the popup applies.
 *
 * @param {{settings?: Object, local?: Object}} sources - `assist_settings`, and the top-level
 *   local keys `aiMode`, `cloudProvider` and `companionFeatures`
 * @returns {string[]}
 */
export function destinationsForChoices({ settings = {}, local = {} } = {}) {
  const sources = { settings: settings || {}, local: local || {} };
  const list = [];

  const menu = toolById('highlight-menu');
  const menuOn = isToolOn(menu, sources);
  const menuButton = id => menuOn && resolveValue(control(menu, id), sources) === true;

  if (menuButton('highlight-menu-show-dictionary')) {
    list.push('dictionary');
  }

  // Translating a selection (the menu's Translate button) and translating a whole page are asked
  // about separately: a page sends far more, names on it included. Translate Page is something a
  // student does from the popup, not something switched on, so it is reachable for as long as it
  // is not hidden.
  if (menuButton('highlight-menu-show-translate')) {
    list.push('translation');
  }
  if (isToolVisible(toolById('translation'), sources.settings.ui_visibility)) {
    list.push('pageTranslation');
  }

  const citation = toolById('citation');
  if (isToolOn(citation, sources)) {
    list.push('citations');
    if (resolveValue(control(citation, 'citation-verify-online'), sources) === true) {
      list.push('citationVerification');
    }
  }

  // Reading images in a language other than English downloads that language's file (ADR 0008).
  const ocr = toolById('ocr');
  if (isToolOn(ocr, sources)) {
    const language = resolveValue(control(ocr, 'ocr-language'), sources);
    if (typeof language === 'string' && !BUNDLED_OCR_LANGUAGES.includes(language)) {
      list.push('ocrLanguages');
    }
  }

  if (isToolOn(toolById('stt'), sources)) {
    list.push('dictation');
  }

  // The lecture companion is a companion toggle, not a popup tool, and is on unless switched off.
  if (sources.local.companionFeatures?.lecture !== false) {
    list.push('lectureCapture');
  }

  if (resolveValue(toolById('ai').state, sources) === 'cloud') {
    const provider = sources.local.cloudProvider || ROUTER_DEFAULT_PROVIDER;
    if (CLOUD_AI_DESTINATIONS.includes(provider)) {
      list.push(provider);
    }
  }

  return list;
}

/**
 * What the step lists right now: each destination with its words and its current answer.
 * @returns {Promise<Array<{destination: string, state: string, service: string, sends: string, action: string}>>}
 */
export async function loadConsentChoices() {
  const stored = await chrome.storage.local.get([
    'assist_settings',
    'aiMode',
    'cloudProvider',
    COMPANION_STORAGE_KEY,
  ]);
  const wanted = destinationsForChoices({
    settings: stored.assist_settings || {},
    local: {
      aiMode: stored.aiMode,
      cloudProvider: stored.cloudProvider,
      companionFeatures: stored[COMPANION_STORAGE_KEY],
    },
  });
  const all = await listConsents();
  return wanted.map(destination => all.find(entry => entry.destination === destination));
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

function radio(destination, value, labelText, checked) {
  const wrapper = element('div', 'consent-choice__option');
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = `consent-${destination}`;
  input.id = `consent-${destination}-${value}`;
  input.value = value;
  input.checked = checked;
  const label = element('label', 'consent-choice__label', labelText);
  label.setAttribute('for', input.id);
  wrapper.append(input, label);
  return wrapper;
}

/**
 * One question: the service, what it is used for, what is sent, and Allow / Don't allow.
 * @param {{destination: string, state: string, service: string, sends: string, action: string}} choice
 * @returns {HTMLFieldSetElement}
 */
function createChoice(choice) {
  const fieldset = element('fieldset', 'consent-choice');
  fieldset.dataset.destination = choice.destination;
  const whatId = `consent-${choice.destination}-what`;
  fieldset.setAttribute('aria-describedby', whatId);

  // Service and purpose together: MyMemory and Google speech recognition each answer two questions.
  fieldset.appendChild(
    element('legend', 'consent-choice__name', `${choice.service}: ${choice.action}`)
  );
  const what = element('p', 'consent-choice__what', `AssisT sends ${choice.sends}.`);
  what.id = whatId;
  fieldset.appendChild(what);

  const options = element('div', 'consent-choice__options');
  options.append(
    radio(choice.destination, 'allow', 'Allow', choice.state === 'granted'),
    radio(choice.destination, 'decline', 'Don’t allow', choice.state === 'declined')
  );
  fieldset.appendChild(options);
  return fieldset;
}

/**
 * "Allow all" and "Don't allow any": they set every question's radio in the panel, then say what
 * changed in a polite status, since a screen reader would otherwise hear nothing (SC 4.1.3).
 * @param {HTMLElement} panel
 * @param {number} count - how many questions the panel asks
 * @returns {HTMLElement[]} the button group and its status
 */
function createBulkChoices(panel, count) {
  const group = element('div', 'consent-step__bulk');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Answer every question at once');
  const status = element('p', 'consent-step__bulk-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  [
    ['allow', 'Allow all', 'Allow'],
    ['decline', 'Don’t allow any', 'Don’t allow'],
  ].forEach(([value, text, answer]) => {
    const button = element('button', 'btn btn-secondary consent-step__bulk-button', text);
    button.type = 'button';
    attachAccessibleHandler(button, `Consent: ${text}`, () => {
      panel.querySelectorAll(`.consent-choice input[value="${value}"]`).forEach(input => {
        input.checked = true;
      });
      status.textContent = `All ${count} set to ${answer}. Press Save my choices to keep them.`;
    });
    group.appendChild(button);
  });

  // Setting `checked` from a button fires no change event, so only the student's own change of a
  // single answer lands here, and "All N set to…" is no longer true once one differs.
  panel.addEventListener('change', () => {
    status.textContent = '';
  });
  return [group, status];
}

/**
 * The step's panel.
 *
 * The radios are read when the student saves, not on every change, so they need no handlers of
 * their own: a native radio group already brings its keyboard behaviour and its announcement.
 *
 * @param {Array} choices - from loadConsentChoices
 * @param {{onSave?: (answers: Object<string, boolean>) => void}} handlers
 * @returns {HTMLElement}
 */
export function createConsentPanel(choices, { onSave } = {}) {
  const panel = element('div', 'consent-step');
  const list = Array.isArray(choices) ? choices.filter(Boolean) : [];

  if (list.length === 0) {
    panel.appendChild(
      element(
        'p',
        'consent-step__intro',
        'Nothing you have switched on sends anything off this computer, so there is nothing to ask. If you switch on a tool that uses an online service, AssisT asks you first.'
      )
    );
  } else {
    panel.appendChild(
      element(
        'p',
        'consent-step__intro',
        'Some tools you have switched on use an online service. Choose for each one. Nothing is sent to a service until you allow it, and nothing about you is sent: not your name, not your account.'
      )
    );
    panel.appendChild(
      element(
        'p',
        'consent-step__intro',
        'You can change these at any time in the AssisT popup: Advanced options (the gear button), then Your data. If you leave one unanswered, AssisT asks the first time that tool needs it.'
      )
    );
    if (list.length > 1) {
      panel.append(...createBulkChoices(panel, list.length));
    }
    list.forEach(choice => panel.appendChild(createChoice(choice)));
  }

  const save = element(
    'button',
    'btn btn-primary btn-save-consent',
    list.length === 0 ? 'Continue' : 'Save my choices'
  );
  save.type = 'button';
  attachAccessibleHandler(save, 'Save consent choices', () => {
    const answers = {};
    list.forEach(({ destination }) => {
      const chosen = panel.querySelector(`input[name="consent-${destination}"]:checked`);
      if (chosen) {
        answers[destination] = chosen.value === 'allow';
      }
    });
    if (onSave) {
      onSave(answers);
    }
  });
  panel.appendChild(save);
  return panel;
}

/**
 * Record the answers, asking Chrome first for the optional hosts of the services allowed.
 *
 * The permission request is made before this function returns, so it must be called straight from
 * the save click, before anything is awaited there.
 *
 * @param {Object<string, boolean>} answers - true for allow, false for don't allow
 * @returns {Promise<{allowed: string[], declined: string[], permissionRefused: boolean}>}
 */
export function confirmConsentChoices(answers) {
  const entries = Object.entries(answers || {}).filter(
    ([destination, value]) => Object.hasOwn(DESTINATIONS, destination) && typeof value === 'boolean'
  );
  const needingAccess = entries
    .filter(([destination, value]) => value && originsFor([destination]).length > 0)
    .map(([destination]) => destination);

  return requestHostPermissions(originsFor(needingAccess)).then(async granted => {
    const result = {
      allowed: [],
      declined: [],
      permissionRefused: needingAccess.length > 0 && !granted,
    };
    for (const [destination, value] of entries) {
      const yes = value && (granted || !needingAccess.includes(destination));
      await recordConsent(destination, yes);
      (yes ? result.allowed : result.declined).push(destination);
    }
    return result;
  });
}

/**
 * What to announce once the answers are saved.
 * @param {{allowed: string[], declined: string[], permissionRefused: boolean}} result
 * @returns {string}
 */
export function describeConsentResult(result) {
  const names = ids => ids.map(id => DESTINATIONS[id].service).join(', ');
  if (result.allowed.length === 0 && result.declined.length === 0) {
    return 'Nothing was recorded. AssisT will ask the first time a tool needs an online service.';
  }
  const parts = [];
  if (result.allowed.length) {
    parts.push(`Allowed: ${names(result.allowed)}.`);
  }
  if (result.declined.length) {
    parts.push(`Not allowed: ${names(result.declined)}.`);
  }
  if (result.permissionRefused) {
    parts.push('Chrome did not give AssisT access, so the service that needed it is not allowed.');
  }
  return `Your choices are saved. ${parts.join(' ')}`;
}
