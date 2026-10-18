/**
 * The popup's voice picker.
 *
 * It lists the automatic choice first, then the voices on this device, then the online voices. An
 * online voice sends what it reads to the company that runs it, so each online option says so in
 * its own text: that is what a screen reader announces, and it survives the Flat view, which copies
 * only the options' text. Rendering never saves anything; only the student's own change does.
 *
 * @module popup/voice-picker
 */

import { AUTOMATIC_VOICE, isOnlineVoice, voiceOptionLabel } from '../utils/speech-voice.js';

/** The option for "no voice chosen": read-aloud then picks a device voice for the page. */
export const AUTOMATIC_VOICE_LABEL = 'Automatic (a voice on this device)';

const byLanguageThenName = (a, b) =>
  String(a.lang).localeCompare(String(b.lang)) || String(a.name).localeCompare(String(b.name));

function optionFor(voice) {
  const option = document.createElement('option');
  option.value = voice.name;
  option.textContent = voiceOptionLabel(voice);
  return option;
}

function groupOf(label, voices) {
  const group = document.createElement('optgroup');
  group.label = label;
  voices.forEach(voice => group.appendChild(optionFor(voice)));
  return group;
}

/**
 * Fill the voice select, replacing whatever it held.
 *
 * @param {HTMLSelectElement} select
 * @param {SpeechSynthesisVoice[]} voices
 * @param {string|undefined} savedName - `assist_settings.tts.voice`
 * @returns {void}
 */
export function renderVoiceOptions(select, voices, savedName) {
  select.replaceChildren();

  const automatic = document.createElement('option');
  automatic.value = AUTOMATIC_VOICE;
  automatic.textContent = AUTOMATIC_VOICE_LABEL;
  select.appendChild(automatic);

  const sorted = [...voices].sort(byLanguageThenName);
  const device = sorted.filter(voice => !isOnlineVoice(voice));
  const online = sorted.filter(isOnlineVoice);
  if (device.length > 0) {
    select.appendChild(groupOf('On this device', device));
  }
  if (online.length > 0) {
    select.appendChild(groupOf('Online', online));
  }

  const installed = voices.some(voice => voice.name === savedName);
  select.value = installed ? savedName : AUTOMATIC_VOICE;
}
