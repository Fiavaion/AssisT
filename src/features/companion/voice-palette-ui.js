/**
 * Voice command palette — binds the voice-command grammar to the live STT controller and
 * dispatches recognised commands to the features that own them.
 *
 * Conservative by design: only whole-utterance matches count as commands (see voice-commands.js),
 * everything else flows through as dictation untouched. Feedback for every executed command comes
 * as a toast, and "what can I say" opens a help card.
 *
 * @module features/companion/voice-palette-ui
 */

import { parseCommand, COMMAND_HELP } from './voice-commands.js';
import { isCompanionEnabled } from './companion-settings.js';
import { createCompanionCard } from './companion-ui.js';
import { showToast } from '../../core/ui/toast.js';
import { createSavedUtterance } from '../../utils/speech-voice.js';
import { extractMainContent } from '../../core/content/readPage.js';

const HELP_CARD_ID = 'assist-companion-voice-help';
const BIND_RETRY_MS = 3000;
const BIND_MAX_TRIES = 20;

let bindTimer = null;

function getController() {
  return window.assistFeatures && window.assistFeatures.stt && window.assistFeatures.stt.controller;
}

/** Try a list of method names on a window.assistFeatures entry; true if one ran. */
function callFeature(key, methods, args = []) {
  const feature = window.assistFeatures && window.assistFeatures[key];
  if (!feature) {
    return false;
  }
  for (const name of methods) {
    if (typeof feature[name] === 'function') {
      try {
        feature[name](...args);
        return true;
      } catch {
        return false;
      }
    }
  }
  return false;
}

function selectedText() {
  return (window.getSelection?.()?.toString() || '').trim();
}

function readPageAloud() {
  const target =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.getElementById('content') ||
    document.body;
  const text = (target?.innerText || '').trim().slice(0, 8000);
  if (!text) {
    showToast('Nothing readable found on this page');
    return;
  }
  window.speechSynthesis.cancel();
  createSavedUtterance(text).then(utterance => window.speechSynthesis.speak(utterance));
  showToast('Reading this page. Say "stop reading" to stop.');
}

function showHelpCard() {
  const { root, body } = createCompanionCard({
    id: HELP_CARD_ID,
    title: '🎤 Things you can say',
    floating: true,
  });
  const list = document.createElement('ul');
  for (const { example, description } of COMMAND_HELP) {
    const item = document.createElement('li');
    item.textContent = `“${example}” - ${description}`;
    list.appendChild(item);
  }
  body.appendChild(list);
  document.body.appendChild(root);
}

async function execute(command) {
  switch (command.action) {
    case 'read-page':
      readPageAloud();
      return;
    case 'stop-reading':
      window.speechSynthesis.cancel();
      showToast('Stopped reading');
      return;
    case 'save-citation':
      if (callFeature('citation', ['captureFromSelection', 'saveCitationFromCurrentPage'])) {
        showToast('Capturing this source');
      } else {
        showToast('The citation tool is not available on this page');
      }
      return;
    case 'open-library':
      if (callFeature('citation', ['openLibrary'])) {
        showToast('Opening your library');
      } else {
        showToast('The citation library is not available on this page');
      }
      return;
    case 'summarize': {
      const text = selectedText() || extractMainContent().text.trim();
      if (!text || !callFeature('summarization', ['start'], [text])) {
        showToast('Select some text first, then use the ✨ toolbar to summarize');
      }
      return;
    }
    case 'simplify': {
      const text = selectedText();
      if (!text || !callFeature('textSimplification', ['start'], [text])) {
        showToast('Select some text first, then use the ✨ toolbar to simplify');
      }
      return;
    }
    case 'open-calculator':
      if (callFeature('maths', ['openCalculator'])) {
        return;
      }
      // Maths Support publishes an entry while it is on; without openCalculator its
      // "Calculator & scratchpad" switch is the one that is off.
      showToast(
        window.assistFeatures?.maths
          ? 'Turn on Calculator & scratchpad under Maths Support in the AssisT popup'
          : 'Turn on Maths Support in the AssisT popup to use the calculator'
      );
      return;
    case 'help':
      showHelpCard();
      return;
    default:
      showToast('Heard a command I do not know yet');
  }
}

/**
 * The STT hook: consume the transcript when it parses as a command.
 * @param {string} transcript
 * @returns {boolean}
 */
export function handleTranscript(transcript) {
  const command = parseCommand(transcript);
  if (!command) {
    return false;
  }
  execute(command);
  return true;
}

function bindController() {
  const controller = getController();
  if (!controller) {
    return false;
  }
  controller.onAssistCommand = handleTranscript;
  return true;
}

export async function init() {
  if (!(await isCompanionEnabled('voiceCommands'))) {
    return;
  }
  if (bindController()) {
    return;
  }
  // The STT controller only exists once dictation has been initialised — retry until it appears.
  let tries = 0;
  clearInterval(bindTimer);
  bindTimer = setInterval(() => {
    if (bindController() || ++tries >= BIND_MAX_TRIES) {
      clearInterval(bindTimer);
      bindTimer = null;
    }
  }, BIND_RETRY_MS);
}

export function cleanup() {
  clearInterval(bindTimer);
  bindTimer = null;
  const controller = getController();
  if (controller) {
    controller.onAssistCommand = () => false;
  }
  document.getElementById(HELP_CARD_ID)?.remove();
}
