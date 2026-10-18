/**
 * @jest-environment jsdom
 *
 * The popup's voice picker.
 *
 * Picking an online voice sends whatever is read aloud to the company that runs it. That is the
 * student's call to make, so the picker has to tell them, in words a screen reader reads out with
 * the option, not in a colour or an icon. Device voices come first, and the picker never saves a
 * voice the student did not pick.
 */

import { renderVoiceOptions, AUTOMATIC_VOICE_LABEL } from '../../../src/popup/voice-picker.js';

const VOICES = [
  { name: 'Google UK English Female', lang: 'en-GB', localService: false, default: false },
  { name: 'Microsoft Hortense - French (France)', lang: 'fr-FR', localService: true },
  { name: 'Microsoft Hazel - English (United Kingdom)', lang: 'en-GB', localService: true },
  { name: 'Google français', lang: 'fr-FR', localService: false },
];

let select;

beforeEach(() => {
  document.body.innerHTML =
    '<label for="voice-select">Voice</label><select id="voice-select"></select>';
  select = document.getElementById('voice-select');
});

function optionTexts() {
  return [...select.options].map(option => option.textContent);
}

test('the first option is the automatic device voice, and it is what an unset choice shows', () => {
  renderVoiceOptions(select, VOICES, undefined);

  expect(select.options[0].value).toBe('default');
  expect(select.options[0].textContent).toBe(AUTOMATIC_VOICE_LABEL);
  expect(select.value).toBe('default');
});

test('device voices are listed before online ones, each in their own labelled group', () => {
  renderVoiceOptions(select, VOICES, 'default');

  const groups = [...select.querySelectorAll('optgroup')].map(group => group.label);
  expect(groups).toEqual(['On this device', 'Online']);
  const deviceNames = [...select.querySelectorAll('optgroup')[0].children].map(o => o.value);
  expect(deviceNames).toEqual([
    'Microsoft Hazel - English (United Kingdom)',
    'Microsoft Hortense - French (France)',
  ]);
});

test('every online option says, in its own text, that it sends the text to Google', () => {
  renderVoiceOptions(select, VOICES, 'default');

  const online = [...select.querySelectorAll('optgroup')[1].children];
  expect(online).toHaveLength(2);
  online.forEach(option => {
    expect(option.textContent).toMatch(/online: sends the text to Google$/);
  });
  expect(optionTexts()).toContain('Microsoft Hazel - English (United Kingdom) (en-GB)');
});

test('a saved online voice stays selected: the student chose it', () => {
  renderVoiceOptions(select, VOICES, 'Google UK English Female');

  expect(select.value).toBe('Google UK English Female');
});

test('rendering twice does not duplicate the list', () => {
  renderVoiceOptions(select, VOICES, 'default');
  renderVoiceOptions(select, VOICES, 'default');

  expect(select.options).toHaveLength(VOICES.length + 1);
});

test('a saved voice that is no longer installed shows the automatic choice', () => {
  renderVoiceOptions(select, VOICES, 'A Voice Nobody Has');

  expect(select.value).toBe('default');
});

test('with no online voices there is no empty Online group', () => {
  renderVoiceOptions(
    select,
    VOICES.filter(voice => voice.localService),
    'default'
  );

  expect([...select.querySelectorAll('optgroup')].map(group => group.label)).toEqual([
    'On this device',
  ]);
});
