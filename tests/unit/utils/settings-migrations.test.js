/**
 * @jest-environment jsdom
 *
 * OCR auto-play defaulted to on, and older popup code wrote `ocr.autoTTS: true` into installs
 * whenever it created the OCR branch. The switch did nothing until 1.0.0, so a stored true is the
 * old default, never a student's choice. On the update to 1.0.0 it is set to the new default, off,
 * once: a student who switches it on afterwards has chosen it and is not overruled again.
 *
 * Two withdrawals clean up after themselves the same way: the Text Customization "Apply to all
 * windows" switch, and the Azure Speech engine, whose stored key is deleted.
 */

import {
  resetUnchosenOcrAutoPlay,
  forgetTextCustomizationSyncSwitch,
  withdrawAzureSpeech,
  withdrawTranslationKeyField,
  resetUnchosenOnlineVoice,
  forgetNewExperienceSwitch,
  forgetClassicPopupLayout,
  forgetStuckReaderSwitch,
  markSettingsMigrationsDone,
} from '../../../src/utils/settings-migrations.js';

let disk;

beforeEach(() => {
  disk = {};
  chrome.storage.local.get.mockImplementation(async keys => {
    const wanted = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(wanted.filter(key => key in disk).map(key => [key, disk[key]]));
  });
  chrome.storage.local.set.mockImplementation(async items => {
    Object.assign(disk, structuredClone(items));
  });
  chrome.storage.local.remove.mockImplementation(async keys => {
    [].concat(keys).forEach(key => delete disk[key]);
  });
});

test('a stored auto-play from the old default is switched off', async () => {
  disk.assist_settings = {
    ocr: { enabled: true, autoTTS: true, language: 'eng' },
    tts: { rate: 1.2 },
  };

  await resetUnchosenOcrAutoPlay();

  expect(disk.assist_settings.ocr.autoTTS).toBe(false);
  expect(disk.assist_settings.ocr.language).toBe('eng');
  expect(disk.assist_settings.tts.rate).toBe(1.2);
});

test('it runs once, so a student who switches auto-play on afterwards keeps it', async () => {
  disk.assist_settings = { ocr: { autoTTS: true } };
  await resetUnchosenOcrAutoPlay();

  disk.assist_settings.ocr.autoTTS = true;
  await resetUnchosenOcrAutoPlay();

  expect(disk.assist_settings.ocr.autoTTS).toBe(true);
});

test('an install with auto-play already off, or no OCR settings, is left as it was', async () => {
  disk.assist_settings = { tts: { rate: 1 } };

  await resetUnchosenOcrAutoPlay();

  expect(disk.assist_settings).toEqual({ tts: { rate: 1 } });
});

describe('a fresh install, which has nothing to migrate', () => {
  test('marks every migration done, so a later update overrules nothing', async () => {
    await markSettingsMigrationsDone();
    disk.assist_settings = { ocr: { autoTTS: true } };
    disk.textCustomSync = true;
    disk.azure_api_key = 'written later';

    disk.assist_settings.tts = { voice: 'Google UK English Female' };
    disk.assist_settings.translationSettings = { preferredEngine: 'google' };
    disk.assist_settings.newExperience = { enabled: true };
    disk.assist_settings.ui_layout = { sectionOrder: ['school'] };
    disk.layout_mode = 'user-need';
    disk.companionFeatures = { stuckReader: false };

    await resetUnchosenOcrAutoPlay();
    await forgetTextCustomizationSyncSwitch();
    await withdrawAzureSpeech();
    await withdrawTranslationKeyField();
    await resetUnchosenOnlineVoice();
    await forgetNewExperienceSwitch();
    await forgetClassicPopupLayout();
    await forgetStuckReaderSwitch();

    expect(disk.assist_settings.ocr.autoTTS).toBe(true);
    expect(disk.textCustomSync).toBe(true);
    expect(disk.azure_api_key).toBe('written later');
    expect(disk.assist_settings.tts.voice).toBe('Google UK English Female');
    expect(disk.assist_settings.translationSettings).toEqual({ preferredEngine: 'google' });
    expect(disk.assist_settings.newExperience).toEqual({ enabled: true });
    expect(disk.assist_settings.ui_layout).toEqual({ sectionOrder: ['school'] });
    expect(disk.layout_mode).toBe('user-need');
    expect(disk.companionFeatures).toEqual({ stuckReader: false });
  });

  test('changes no setting itself', async () => {
    disk.assist_settings = { ocr: { autoTTS: true } };

    await markSettingsMigrationsDone();

    expect(disk.assist_settings).toEqual({ ocr: { autoTTS: true } });
  });
});

describe('the withdrawn "Apply to all windows" switch', () => {
  test("its stored state is removed and the student's text choices are kept", async () => {
    disk.textCustomSync = false;
    disk.assist_settings = { textCustomization: { enabled: true, fontFamily: 'lexend' } };

    await forgetTextCustomizationSyncSwitch();

    expect(disk).not.toHaveProperty('textCustomSync');
    expect(disk.assist_settings.textCustomization).toEqual({ enabled: true, fontFamily: 'lexend' });
  });

  test('it runs once', async () => {
    disk.textCustomSync = true;
    await forgetTextCustomizationSyncSwitch();
    disk.textCustomSync = true;

    await forgetTextCustomizationSyncSwitch();

    expect(disk.textCustomSync).toBe(true);
  });
});

describe('the withdrawn Azure Speech engine', () => {
  const AZURE_KEYS = ['secure_apikey_azure', 'azure_api_key', 'apiKey_azure_encrypted'];

  test('every stored Azure Speech key is deleted, and nothing else', async () => {
    disk.secure_apikey_azure = { encrypted: 'opaque', version: 2 };
    disk.azure_api_key = 'plain';
    disk.apiKey_azure_encrypted = 'old';
    disk.secure_apikey_anthropic = { encrypted: 'keep', version: 2 };
    disk.assist_settings = { stt: { engine: 'web-speech', language: 'en-IE' } };

    await withdrawAzureSpeech();

    for (const key of AZURE_KEYS) {
      expect(disk).not.toHaveProperty(key);
    }
    expect(disk.secure_apikey_anthropic).toEqual({ encrypted: 'keep', version: 2 });
    expect(disk.assist_settings.stt).toEqual({ engine: 'web-speech', language: 'en-IE' });
  });

  test('a stored choice of the Azure engine goes back to the browser engine', async () => {
    disk.assist_settings = { stt: { engine: 'azure', language: 'en-IE' }, tts: { rate: 1.1 } };

    await withdrawAzureSpeech();

    expect(disk.assist_settings.stt).toEqual({ engine: 'auto', language: 'en-IE' });
    expect(disk.assist_settings.tts.rate).toBe(1.1);
  });

  test('it runs once', async () => {
    await withdrawAzureSpeech();
    disk.azure_api_key = 'written later';

    await withdrawAzureSpeech();

    expect(disk.azure_api_key).toBe('written later');
  });
});

describe('the withdrawn Google Translate key field', () => {
  // The popup offered a Google Translate engine and a key field that wrote the key, in plain text,
  // into the settings. Nothing ever read either: translation only ever used MyMemory.
  test('the stored key and engine choice are deleted, and the other translation choices kept', async () => {
    disk.assist_settings = {
      tts: { rate: 1 },
      translationSettings: {
        preferredEngine: 'google',
        googleApiKey: 'AIzaSyExampleExampleExampleExample0000',
        defaultTargetLanguage: 'fr',
        cacheEnabled: true,
      },
    };
    disk.translationSettings = { googleApiKey: 'AIza-old', preferredEngine: 'libre', cacheDuration: 7 };

    await withdrawTranslationKeyField();

    expect(disk.assist_settings.translationSettings).toEqual({
      defaultTargetLanguage: 'fr',
      cacheEnabled: true,
    });
    expect(disk.assist_settings.tts).toEqual({ rate: 1 });
    expect(disk.translationSettings).toEqual({ cacheDuration: 7 });
    expect(JSON.stringify(disk)).not.toMatch(/AIza/);
  });

  test('it runs once', async () => {
    await withdrawTranslationKeyField();
    disk.assist_settings = { translationSettings: { googleApiKey: 'written later' } };

    await withdrawTranslationKeyField();

    expect(disk.assist_settings.translationSettings.googleApiKey).toBe('written later');
  });
});

describe('the withdrawn "Try the new AssisT" switch', () => {
  // The new popup is the only popup now, so the switch that chose between the two is gone and its
  // stored state means nothing.
  test('its stored state is deleted, and every other setting kept', async () => {
    disk.assist_settings = { tts: { rate: 1 }, newExperience: { enabled: true, seen: true } };

    await forgetNewExperienceSwitch();

    expect(disk.assist_settings).toEqual({ tts: { rate: 1 } });
  });

  test('an install that never stored it is left as it was', async () => {
    disk.assist_settings = { tts: { rate: 1 } };

    await forgetNewExperienceSwitch();

    expect(disk.assist_settings).toEqual({ tts: { rate: 1 } });
  });

  test('it runs once', async () => {
    await forgetNewExperienceSwitch();
    disk.assist_settings = { newExperience: { enabled: true } };

    await forgetNewExperienceSwitch();

    expect(disk.assist_settings.newExperience).toEqual({ enabled: true });
  });
});

describe('the online voice an earlier popup chose for the student', () => {
  // The old popup saved "Google UK English Female" the first time it opened, whatever the student
  // did. It is an online voice, so their read-aloud text went to Google without them choosing it.
  test('that exact voice goes back to the automatic choice, which prefers a voice on the device', async () => {
    disk.assist_settings = { tts: { voice: 'Google UK English Female', rate: 1.3, volume: 0.8 } };

    await resetUnchosenOnlineVoice();

    expect(disk.assist_settings.tts).toEqual({ voice: 'default', rate: 1.3, volume: 0.8 });
  });

  test.each(['Google US English', 'Microsoft Sonia Online (Natural)', 'Samantha', 'default'])(
    'any other saved voice (%s) is the student’s choice and is kept',
    async voice => {
      disk.assist_settings = { tts: { voice } };
      await resetUnchosenOnlineVoice();
      expect(disk.assist_settings.tts.voice).toBe(voice);
    }
  );

  // A profile saved under the old popup holds the same voice, and loading it would put it back.
  test('that voice is reset inside every saved profile too, and other profile voices are kept', async () => {
    disk.assist_profiles = {
      Default: { name: 'Default', settings: { tts: { voice: 'Google UK English Female', rate: 1.2 } } },
      'Night.Study': { name: 'Night.Study', settings: { tts: { voice: 'Google US English' } } },
      Plain: { name: 'Plain', settings: { theme: 'dark' } },
    };

    await expect(resetUnchosenOnlineVoice()).resolves.toBe(true);

    expect(disk.assist_profiles).toEqual({
      Default: { name: 'Default', settings: { tts: { voice: 'default', rate: 1.2 } } },
      'Night.Study': { name: 'Night.Study', settings: { tts: { voice: 'Google US English' } } },
      Plain: { name: 'Plain', settings: { theme: 'dark' } },
    });
  });

  test('profiles without that voice are not rewritten', async () => {
    disk.assist_profiles = { Mine: { settings: { tts: { voice: 'Samantha' } } } };
    const before = disk.assist_profiles;
    await expect(resetUnchosenOnlineVoice()).resolves.toBe(false);
    expect(disk.assist_profiles).toBe(before);
  });

  test('it runs once, so a student who picks that voice afterwards keeps it', async () => {
    disk.assist_settings = { tts: { voice: 'Google UK English Female' } };
    await resetUnchosenOnlineVoice();

    disk.assist_settings.tts.voice = 'Google UK English Female';
    await resetUnchosenOnlineVoice();

    expect(disk.assist_settings.tts.voice).toBe('Google UK English Female');
  });
});

describe('the withdrawn layout controls of the classic popup', () => {
  // Organize mode, the hide-unused filter and the Layout mode option arranged the accordion, which
  // no student sees now that Flat is the popup's only face. What they stored means nothing.
  test('their stored state is deleted, and every other setting kept', async () => {
    disk.assist_settings = {
      tts: { rate: 1 },
      ui_visibility: { show_ocr: false },
      ui_layout: { sectionOrder: ['school', 'reading'], sectionVisibility: { school: false } },
    };
    disk.layout_mode = 'disability-profile';
    disk.popup_hide_unused = true;
    disk.popupTheme = 'light';

    await forgetClassicPopupLayout();

    expect(disk.assist_settings).toEqual({ tts: { rate: 1 }, ui_visibility: { show_ocr: false } });
    expect('layout_mode' in disk).toBe(false);
    expect('popup_hide_unused' in disk).toBe(false);
    expect(disk.popupTheme).toBe('light');
  });

  test('an install that never stored them is left as it was', async () => {
    disk.assist_settings = { tts: { rate: 1 } };

    await forgetClassicPopupLayout();

    expect(disk.assist_settings).toEqual({ tts: { rate: 1 } });
  });

  test('it runs once', async () => {
    await forgetClassicPopupLayout();
    disk.layout_mode = 'user-need';
    disk.assist_settings = { ui_layout: { sectionOrder: [] } };

    await forgetClassicPopupLayout();

    expect(disk.layout_mode).toBe('user-need');
    expect(disk.assist_settings.ui_layout).toEqual({ sectionOrder: [] });
  });
});

describe('the withdrawn "Stuck-reader rescue" companion switch', () => {
  // It did nothing on its own: the help it named is offered by "Offer help when reading gets hard"
  // (struggleDetectionSettings), which is now the one switch for it.
  test('its stored state is deleted, and every other companion switch kept', async () => {
    disk.companionFeatures = { stuckReader: false, flashcards: false, lecture: true };

    await forgetStuckReaderSwitch();

    expect(disk.companionFeatures).toEqual({ flashcards: false, lecture: true });
  });

  test('an install that never stored it is left as it was', async () => {
    disk.companionFeatures = { flashcards: false };

    await forgetStuckReaderSwitch();

    expect(disk.companionFeatures).toEqual({ flashcards: false });
  });

  test('it runs once', async () => {
    await forgetStuckReaderSwitch();
    disk.companionFeatures = { stuckReader: true };

    await forgetStuckReaderSwitch();

    expect(disk.companionFeatures).toEqual({ stuckReader: true });
  });
});
