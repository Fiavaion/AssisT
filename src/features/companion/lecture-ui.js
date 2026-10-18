/**
 * Lecture companion UI — mic-based live captions + notes for in-person lectures.
 *
 * Capture via the Web Speech API (SpeechRecognition). In Chrome that is Google's speech
 * recognition: the sound of the lecture is sent to Google to be turned into text, so Start asks
 * the student first (ADR 0006, the dictation question) and starts nothing without a yes. This
 * requests NO new manifest permission — the microphone prompt is the browser's native dialog,
 * triggered only when the student presses Start. Tab-audio capture is deliberately out of
 * scope here (it would need a manifest permission change).
 *
 * @module features/companion/lecture-ui
 */

import { isCompanionEnabled } from './companion-settings.js';
import {
  createCompanionCard,
  companionButton,
  companionStatusRegion,
  isLmsHost,
} from './companion-ui.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { Z } from '../../utils/z-index.js';
import { dockChip, undockChip } from './chip-dock.js';
import { getAIMode, generateWithAI } from '../shared/ai-feature-client.js';
import { allowDictation, onDictationWithdrawn } from '../../utils/dictation-consent.js';

const TOGGLE_ID = 'assist-companion-lecture-toggle';
const CARD_ID = 'assist-companion-lecture';
const STORAGE_KEY = 'companionLectureNotes';
const MAX_SESSIONS = 20;
const MAX_TRANSCRIPT_CHARS = 8000;
const RESTART_DELAY_MS = 300;
const MAX_RESTARTS_WITHOUT_START = 3;

// What to tell the student when the recogniser stops for a reason a restart cannot fix.
const TERMINAL_ERROR_MESSAGES = {
  'not-allowed':
    'The microphone is blocked for this site. Allow the microphone using the icon in the address bar, then press Start.',
  'service-not-allowed':
    'The microphone is blocked for this site. Allow the microphone using the icon in the address bar, then press Start.',
  'audio-capture': 'No microphone was found. Connect one, then press Start.',
  network:
    'Speech recognition could not reach its service. Check your connection, then press Start.',
};

// Module-level session state — a content script runs one instance per page.
let recognition = null;
let recording = false;
let sessionStartedAt = null;
let transcriptLines = [];
let statusRegion = null;
let transcriptEl = null;
let closeCardFn = null;
let releaseWithdrawal = () => {};
let partialEl = null;
let restartTimer = null;
let restartsWithoutStart = 0;

function getSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function formatElapsed(startedAt) {
  const totalSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function appendTranscriptLine(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return;
  }
  const elapsed = sessionStartedAt ? formatElapsed(sessionStartedAt) : '00:00';
  transcriptLines.push(`(${elapsed}) ${trimmed}`);
  if (transcriptEl) {
    const line = document.createElement('p');
    line.className = 'assist-companion-lecture__line';
    line.style.margin = '2px 0';
    line.textContent = transcriptLines[transcriptLines.length - 1];
    transcriptEl.insertBefore(line, partialEl);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }
}

/** Show (or clear, with empty text) the words still being recognised. Hidden from screen readers. */
function showPartial(text) {
  if (!transcriptEl) {
    return;
  }
  if (!text) {
    partialEl?.remove();
    partialEl = null;
    return;
  }
  if (!partialEl) {
    partialEl = document.createElement('p');
    partialEl.className = 'assist-companion-lecture__partial';
    partialEl.setAttribute('aria-hidden', 'true');
    partialEl.style.margin = '2px 0';
    partialEl.style.opacity = '0.7';
    partialEl.style.fontStyle = 'italic';
    transcriptEl.appendChild(partialEl);
  }
  partialEl.textContent = text;
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function stopRecognition(statusMessage) {
  recording = false;
  clearTimeout(restartTimer);
  restartTimer = null;
  showPartial('');
  releaseWithdrawal();
  releaseWithdrawal = () => {};
  if (recognition) {
    // Detach onend first so an intentional stop never triggers the auto-restart branch.
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      // A stop() on an already-stopped recognizer is harmless — ignore.
    }
  }
  if (statusRegion && statusMessage) {
    statusRegion.textContent = statusMessage;
  }
}

async function startRecognition() {
  if (recording) {
    return;
  }
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    return;
  }
  if (!(await allowDictation({ destination: 'lectureCapture' }))) {
    if (statusRegion) {
      statusRegion.textContent = 'Nothing was recorded or sent. Press Start to be asked again.';
    }
    return;
  }
  if (recording) {
    return;
  }

  recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = document.documentElement.lang || navigator.language || 'en-US';
  restartsWithoutStart = 0;

  recognition.onstart = () => {
    restartsWithoutStart = 0;
    if (statusRegion) {
      statusRegion.textContent = 'Listening';
    }
  };

  recognition.onresult = event => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (!result) {
        continue;
      }
      if (result.isFinal) {
        showPartial('');
        appendTranscriptLine(result[0]?.transcript || '');
      } else {
        interim += result[0]?.transcript || '';
      }
    }
    if (interim) {
      showPartial(interim);
    }
  };

  recognition.onerror = event => {
    const message = TERMINAL_ERROR_MESSAGES[event?.error];
    if (message) {
      stopRecognition(message);
    }
    // no-speech and aborted are the browser pausing: onend restarts while still recording.
  };

  recognition.onend = () => {
    // Browsers end recognition after a period of silence; restart while still recording, after a
    // short pause, and give up if it keeps ending without ever starting.
    if (!recording) {
      return;
    }
    restartsWithoutStart += 1;
    if (restartsWithoutStart > MAX_RESTARTS_WITHOUT_START) {
      stopRecognition('Listening keeps stopping. Press Start to try again.');
      return;
    }
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!recording) {
        return;
      }
      try {
        recognition.start();
      } catch {
        // A start-while-starting race is harmless — the browser will settle on its own.
      }
    }, RESTART_DELAY_MS);
  };

  try {
    recognition.start();
    recording = true;
    // A yes withdrawn in the popup stops listening now.
    releaseWithdrawal();
    releaseWithdrawal = onDictationWithdrawn(() => stopRecognition('Stopped'), 'lectureCapture');
    sessionStartedAt = sessionStartedAt || Date.now();
    if (statusRegion) {
      statusRegion.textContent = 'Waiting for the microphone…';
    }
  } catch {
    if (statusRegion) {
      statusRegion.textContent = "Couldn't start the microphone — try again.";
    }
  }
}

function buildTranscriptRegion() {
  const div = document.createElement('div');
  div.className = 'assist-companion-lecture__transcript';
  div.setAttribute('role', 'log');
  div.setAttribute('aria-label', 'Live transcript');
  div.style.maxHeight = '220px';
  div.style.overflowY = 'auto';
  div.style.border = '1px solid #c9d4d2';
  div.style.borderRadius = '6px';
  div.style.padding = '6px 8px';
  div.style.margin = '8px 0';
  div.style.background = '#ffffff';
  return div;
}

function buildNotSupportedMessage() {
  const p = document.createElement('p');
  p.textContent =
    'Live captions need microphone speech recognition, which is not supported in this browser.';
  return p;
}

function buildMarkdown(title, startedAt, lines) {
  const dateStr = new Date(startedAt || Date.now()).toLocaleString();
  const body = [`# ${title || 'Lecture notes'}`, '', `_${dateStr}_`, ''];
  for (const line of lines) {
    body.push(`- ${line}`);
  }
  return body.join('\n');
}

function downloadMarkdownFile(markdown, filename) {
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function saveSession() {
  if (transcriptLines.length === 0) {
    if (statusRegion) {
      statusRegion.textContent = 'Nothing to save yet — start listening first.';
    }
    return;
  }
  const session = {
    title: document.title || 'Untitled lecture',
    startedAt: sessionStartedAt || Date.now(),
    lines: transcriptLines.slice(),
  };
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const sessions = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY].slice() : [];
    sessions.push(session);
    while (sessions.length > MAX_SESSIONS) {
      sessions.shift();
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: sessions });
    if (statusRegion) {
      statusRegion.textContent = 'Notes saved.';
    }
  } catch {
    if (statusRegion) {
      statusRegion.textContent = "Couldn't save notes — try again.";
    }
  }
}

function renderStructuredResult(body, text) {
  body.querySelector('.assist-companion-lecture__structured')?.remove();

  const wrap = document.createElement('div');
  wrap.className = 'assist-companion-lecture__structured';

  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.fontFamily = 'inherit';
  pre.style.fontSize = '13px';
  pre.textContent = text;
  wrap.appendChild(pre);

  const downloadBtn = companionButton(
    '⬇ Download',
    () => downloadMarkdownFile(text, 'lecture-notes-structured.md'),
    { secondary: true }
  );
  wrap.appendChild(downloadBtn);

  body.appendChild(wrap);
}

/**
 * Add the optional "Structure notes" AI button when an AI mode is configured and not off.
 * A failure never blocks the deterministic transcript/save/download above it.
 * @param {HTMLElement} buttonsRow
 * @param {HTMLElement} body
 */
async function maybeAddStructureButton(buttonsRow, body) {
  let modeInfo;
  try {
    modeInfo = await getAIMode('lecture');
  } catch {
    return;
  }
  if (!modeInfo || modeInfo.isOff) {
    return;
  }

  const structureBtn = companionButton(
    '✨ Structure notes',
    async () => {
      if (transcriptLines.length === 0) {
        if (statusRegion) {
          statusRegion.textContent = 'Nothing to structure yet — start listening first.';
        }
        return;
      }
      if (statusRegion) {
        statusRegion.textContent = 'Asking AI to structure the notes…';
      }
      try {
        const transcriptText = transcriptLines.join('\n').slice(0, MAX_TRANSCRIPT_CHARS);
        const prompt =
          'Turn this lecture transcript into a Markdown outline: headings for each topic, a bullet ' +
          'summary under each, and a final "Assignments & dates mentioned" section (or "None mentioned" ' +
          `if there are none). Transcript:\n\n${transcriptText}`;
        const { text } = await generateWithAI(prompt, modeInfo, {
          feature: 'lecture',
          maxTokens: 800,
        });
        renderStructuredResult(body, text);
        if (statusRegion) {
          statusRegion.textContent = 'Structured notes ready.';
        }
      } catch {
        if (statusRegion) {
          statusRegion.textContent =
            "Couldn't reach AI right now — the transcript above is unaffected.";
        }
      }
    },
    { secondary: true }
  );
  buttonsRow.appendChild(structureBtn);
}

/**
 * Put focus in the open card: on Start listening, or on its close button when this browser has no
 * speech recognition. Whether the popup or the chip opened it, the card is where the student goes
 * next.
 */
function focusCard() {
  const card = document.getElementById(CARD_ID);
  if (!card) {
    return;
  }
  const start = card.querySelector('[data-lecture-start]');
  (start || card.querySelector('button'))?.focus();
}

/**
 * Build (or replace) the floating lecture-notes card.
 */
function openCard() {
  transcriptLines = [];
  sessionStartedAt = null;
  recording = false;
  transcriptEl = null;
  partialEl = null;
  statusRegion = null;

  const { root, body, close } = createCompanionCard({
    id: CARD_ID,
    title: '🎙️ Lecture notes',
    floating: true,
    onClose: () => {
      stopRecognition();
      closeCardFn = null;
    },
  });
  closeCardFn = close;

  if (!getSpeechRecognitionCtor()) {
    body.appendChild(buildNotSupportedMessage());
    document.body.appendChild(root);
    focusCard();
    return;
  }

  transcriptEl = buildTranscriptRegion();
  body.appendChild(transcriptEl);

  const buttonsRow = document.createElement('div');
  body.appendChild(buttonsRow);

  const startBtn = companionButton('⏺ Start listening', () => startRecognition());
  startBtn.dataset.lectureStart = '';
  buttonsRow.appendChild(startBtn);
  buttonsRow.appendChild(
    companionButton('⏹ Stop', () => stopRecognition('Paused'), { secondary: true })
  );
  buttonsRow.appendChild(
    companionButton('💾 Save notes', () => saveSession(), { secondary: true })
  );
  buttonsRow.appendChild(
    companionButton(
      '⬇ Download .md',
      () =>
        downloadMarkdownFile(
          buildMarkdown(document.title, sessionStartedAt, transcriptLines),
          'lecture-notes.md'
        ),
      { secondary: true }
    )
  );

  statusRegion = companionStatusRegion(body);
  statusRegion.textContent = 'Paused';

  document.body.appendChild(root);
  focusCard();

  // Additive AI action — fire-and-forget; internally guarded against every failure mode.
  maybeAddStructureButton(buttonsRow, body);
}

/**
 * Toggle the lecture-notes card: opens it when closed, closes it (stopping any active
 * recognition) when already open.
 */
function toggleCard() {
  if (document.getElementById(CARD_ID)) {
    if (closeCardFn) {
      closeCardFn();
    } else {
      document.getElementById(CARD_ID)?.remove();
    }
    return;
  }
  openCard();
}

function mountToggleButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = TOGGLE_ID;
  btn.textContent = '🎙️ lecture';
  btn.setAttribute('aria-label', 'Lecture companion — live captions from your microphone');
  btn.style.zIndex = String(Z.CONTROLS);
  btn.style.border = '1px solid #4e6f78';
  btn.style.background = '#4e6f78';
  btn.style.color = '#ffffff';
  btn.style.borderRadius = '999px';
  btn.style.padding = '8px 14px';
  btn.style.fontSize = '13px';
  btn.style.fontWeight = '600';
  btn.style.cursor = 'pointer';

  attachAccessibleHandler(btn, 'Lecture companion toggle', toggleCard);

  // The chip dock owns where the small chips sit: one cluster that lifts clear of
  // the page's own controls (see src/features/companion/chip-dock.js).
  dockChip('lecture-toggle', btn);
}

/**
 * Mount the floating "🎙️ lecture" toggle button when the 'lecture' companion feature is
 * enabled on an LMS page. Idempotent — a repeat call is a no-op once mounted.
 *
 * The chip stays on LMS hosts: on a video player or a meeting page a pill of ours over someone
 * else's controls gets in the way more often than it helps. The popup's "Start lecture captions"
 * button opens the card on any page instead (openLectureNotes).
 * @returns {Promise<void>}
 */
export async function init() {
  let enabled = false;
  try {
    enabled = await isCompanionEnabled('lecture');
  } catch {
    return;
  }
  if (!enabled || !isLmsHost()) {
    return;
  }
  if (document.getElementById(TOGGLE_ID)) {
    return;
  }
  mountToggleButton();
}

/**
 * Open the lecture-notes card for the popup's "Start lecture captions" button, on any page the
 * content script runs on, chip or no chip. A card already open stays open with what it has heard
 * so far, and takes focus again.
 * @returns {Promise<boolean>} whether the card is open; false while the feature is switched off
 */
export async function openLectureNotes() {
  let enabled = false;
  try {
    enabled = await isCompanionEnabled('lecture');
  } catch {
    return false;
  }
  if (!enabled) {
    return false;
  }
  if (document.getElementById(CARD_ID)) {
    focusCard();
  } else {
    openCard();
  }
  return true;
}

/**
 * Stop any active recognition and remove all lecture-companion UI. Idempotent.
 */
export function cleanup() {
  stopRecognition();
  undockChip('lecture-toggle');
  document.getElementById(TOGGLE_ID)?.remove();
  document.getElementById(CARD_ID)?.remove();
  closeCardFn = null;
  transcriptLines = [];
  sessionStartedAt = null;
  statusRegion = null;
  transcriptEl = null;
  partialEl = null;
}
