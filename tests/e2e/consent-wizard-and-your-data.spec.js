/**
 * The wizard's consent step and the popup's "Your data" tab (ADR 0006), in real Chrome.
 *
 * The wizard asks only about services the student's choices reach, one question each; allowed
 * services that need an optional host permission are requested in ONE chrome.permissions.request
 * from the Save click. "Your data" shows every answer, changes it at once, and removes stored AI
 * keys from storage.
 *
 * WHAT IS STUBBED, AND WHY. Playwright cannot press the buttons of Chrome's own permission bubble,
 * so `chrome.permissions.request` is replaced in the page with a recorder that answers yes or no.
 * The recorder also reads `navigator.userActivation.isActive` at the moment it is called, which is
 * the condition Chrome itself applies: a request made after the click's activation had lapsed would
 * be refused by the real browser, and shows here as `active: false`. What stays untested is Chrome's
 * own bubble: its wording, and that the real API grants the origin when a person presses Allow.
 */

import { test, expect } from './extension-fixture.js';

const SEMANTIC_SCHOLAR = 'https://api.semanticscholar.org/*';
// Every outside service's host is an optional permission, requested with its consent (ADR 0009).
const DICTIONARY = 'https://api.dictionaryapi.dev/*';

function url(extensionId, page) {
  return `chrome-extension://${extensionId}/src/${page}`;
}

async function setStorage(page, values) {
  await page.evaluate(v => chrome.storage.local.set(v), values);
}

async function getStorage(page, key) {
  return page.evaluate(k => chrome.storage.local.get(k).then(r => r[k]), key);
}

/** The recorded answers by service: each is stored under its own key (utils/consent.js). */
async function consentAnswers(page) {
  const all = await page.evaluate(() => chrome.storage.local.get(null));
  const answers = {};
  Object.entries(all).forEach(([key, value]) => {
    if (key.startsWith('assist_consent_')) {
      answers[key.slice('assist_consent_'.length)] = value;
    }
  });
  return answers;
}

/** Replace chrome.permissions.request in this page with a recorder answering `answer`. */
async function stubPermissionRequest(page, answer) {
  await page.evaluate(granted => {
    window.__permissionRequests = [];
    const recorder = request => {
      window.__permissionRequests.push({
        origins: request && request.origins,
        active: navigator.userActivation ? navigator.userActivation.isActive : null,
      });
      return Promise.resolve(granted);
    };
    Object.defineProperty(chrome.permissions, 'request', {
      value: recorder,
      configurable: true,
      writable: true,
    });
  }, answer);
}

async function permissionRequests(page) {
  return page.evaluate(() => window.__permissionRequests || []);
}

/** Open the welcome page fresh, pick no guides, and arrive at the consent step. */
async function reachConsentStep(context, extensionId, seed = {}) {
  const page = await context.newPage();
  await page.goto(url(extensionId, 'pages/welcome/welcome.html'));
  // The fixture has waited for the install to open and close its own welcome page, which comes
  // after the default settings are written, so this seed cannot be overwritten by them.
  await setStorage(page, { onboardingQueue: [], ...seed });
  await page.reload();
  // The step reads what is stored, so check the seed is there before relying on it.
  if (seed.assist_settings) {
    expect(await getStorage(page, 'assist_settings')).toEqual(seed.assist_settings);
  }
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.locator('li[data-track-id="consent"] fieldset').first()).toBeVisible();
  return page;
}

function services(page) {
  return page
    .locator('li[data-track-id="consent"] fieldset')
    .evaluateAll(sets => sets.map(set => set.dataset.destination));
}

function answer(page, destination, label) {
  return page
    .locator(`li[data-track-id="consent"] fieldset[data-destination="${destination}"]`)
    .getByLabel(label, { exact: true })
    .check();
}

test.describe('the welcome wizard consent step', () => {
  test('lists only the services a default install reaches', async ({ context, extensionId }) => {
    const page = await reachConsentStep(context, extensionId);
    expect(await services(page)).toEqual([
      'dictionary',
      'translation',
      'pageTranslation',
      'citations',
      // The lecture companion is on unless switched off, so its microphone is asked about too.
      'lectureCapture',
    ]);
    await expect(page.getByText('Semantic Scholar')).toHaveCount(0);
    await expect(page.getByText('Anthropic (Claude)')).toHaveCount(0);
  });

  test('lists Semantic Scholar and the chosen cloud AI once they are switched on', async ({
    context,
    extensionId,
  }) => {
    const page = await reachConsentStep(context, extensionId, {
      assist_settings: { citation: { verifyOnline: true } },
      aiMode: 'cloud',
      cloudProvider: 'openai',
    });
    expect(await services(page)).toEqual([
      'dictionary',
      'translation',
      'pageTranslation',
      'citations',
      'citationVerification',
      'lectureCapture',
      'openai',
    ]);
  });

  test('records the ones allowed and the ones declined, and asks Chrome only for the allowed host', async ({
    context,
    extensionId,
  }) => {
    // ADR 0009: the dictionary's host is optional now, so allowing it asks Chrome for it in the
    // same click. MyMemory was declined, so its host is not asked for; nothing else is.
    const page = await reachConsentStep(context, extensionId);
    await stubPermissionRequest(page, true);
    await answer(page, 'dictionary', 'Allow');
    await answer(page, 'translation', 'Don’t allow');
    await page.getByRole('button', { name: 'Save my choices' }).click();
    await expect(page.locator('li[data-track-id="consent"].hub-step--done')).toBeVisible();

    const consent = await consentAnswers(page);
    expect(consent.dictionary.granted).toBe(true);
    expect(consent.translation.granted).toBe(false);
    expect(consent.citations).toBeUndefined();
    expect(await permissionRequests(page)).toEqual([{ origins: [DICTIONARY], active: true }]);
  });

  test('makes one permission request, inside the click, for exactly the optional hosts allowed', async ({
    context,
    extensionId,
  }) => {
    const page = await reachConsentStep(context, extensionId, {
      assist_settings: { citation: { verifyOnline: true } },
      aiMode: 'cloud',
      cloudProvider: 'anthropic',
    });
    await stubPermissionRequest(page, true);
    await answer(page, 'dictionary', 'Allow');
    await answer(page, 'citationVerification', 'Allow');
    await answer(page, 'anthropic', 'Allow');
    await page.getByRole('button', { name: 'Save my choices' }).click();
    await expect(page.locator('li[data-track-id="consent"].hub-step--done')).toBeVisible();

    const requests = await permissionRequests(page);
    // Every allowed service with a host is in the one prompt: the dictionary (ADR 0009), Semantic
    // Scholar, and the cloud AI provider (ADR 0006/0007), in the order the step lists them.
    expect(requests).toEqual([
      { origins: [DICTIONARY, SEMANTIC_SCHOLAR, 'https://api.anthropic.com/*'], active: true },
    ]);
    const consent = await consentAnswers(page);
    expect(consent.citationVerification.granted).toBe(true);
    expect(consent.anthropic.granted).toBe(true);
  });

  test('a refused Chrome prompt is a no for every service that needed a host', async ({
    context,
    extensionId,
  }) => {
    // One prompt asks for every allowed host together. Refused, Chrome holds none of them, so
    // each service that needed one is recorded as not allowed: Semantic Scholar and, since ADR
    // 0009, the dictionary too. Dictation needs no host from AssisT, so its yes stands.
    const page = await reachConsentStep(context, extensionId, {
      assist_settings: { citation: { verifyOnline: true }, stt: { enabled: true } },
    });
    await stubPermissionRequest(page, false);
    await answer(page, 'citationVerification', 'Allow');
    await answer(page, 'dictionary', 'Allow');
    await answer(page, 'dictation', 'Allow');
    await page.getByRole('button', { name: 'Save my choices' }).click();
    await expect(page.locator('li[data-track-id="consent"].hub-step--done')).toBeVisible();

    const consent = await consentAnswers(page);
    expect(consent.citationVerification.granted).toBe(false);
    expect(consent.dictionary.granted).toBe(false);
    expect(consent.dictation.granted).toBe(true);
    expect(await permissionRequests(page)).toEqual([
      { origins: [DICTIONARY, SEMANTIC_SCHOLAR], active: true },
    ]);
  });

  test('skipping records nothing', async ({ context, extensionId }) => {
    const page = await reachConsentStep(context, extensionId);
    await answer(page, 'dictionary', 'Allow');
    await page.getByRole('button', { name: /Skip Choose what AssisT may send online/ }).click();
    await expect(page.locator('li[data-track-id="consent"].hub-step--skipped')).toBeVisible();
    expect(await consentAnswers(page)).toEqual({});
  });

  test('asks about dictation, naming Google, when dictation is switched on', async ({
    context,
    extensionId,
  }) => {
    const page = await reachConsentStep(context, extensionId, {
      assist_settings: { stt: { enabled: true } },
    });
    expect(await services(page)).toContain('dictation');
    const dictation = page.locator(
      'li[data-track-id="consent"] fieldset[data-destination="dictation"]'
    );
    await expect(dictation).toContainText('Google');
    await expect(dictation).toContainText('your voice');
    await answer(page, 'dictation', 'Allow');
    await page.getByRole('button', { name: 'Save my choices' }).click();
    await expect(page.locator('li[data-track-id="consent"].hub-step--done')).toBeVisible();
    expect((await consentAnswers(page)).dictation.granted).toBe(true);
  });
});

test.describe('Your data in Advanced Options', () => {
  async function openYourData(popupPage) {
    await popupPage.locator('[data-action="settings"]:visible').first().click();
    await popupPage.getByRole('tab', { name: 'Your data' }).click();
    const panel = popupPage.locator('#tab-your-data');
    await expect(panel.getByRole('heading', { name: 'Online services' })).toBeVisible();
    return panel;
  }

  test('changes an answer at once', async ({ popupPage }) => {
    await setStorage(popupPage, {
      assist_consent_dictionary: { granted: true, at: '2026-09-25T10:00:00.000Z' },
    });
    const panel = await openYourData(popupPage);
    const dictionary = panel.locator('fieldset[data-destination="dictionary"]');
    await expect(dictionary).toContainText('Now: Allowed');

    await dictionary.getByLabel('Don’t allow', { exact: true }).check();
    await expect(dictionary).toContainText('Now: Not allowed');
    await expect
      .poll(async () => (await getStorage(popupPage, 'assist_consent_dictionary')).granted)
      .toBe(false);
  });

  test('removes a stored AI key from storage after asking', async ({ popupPage }) => {
    const saved = await popupPage.evaluate(() =>
      chrome.runtime.sendMessage({
        action: 'SAVE_API_KEY',
        provider: 'openai',
        apiKey: 'sk-e2e-not-a-real-key',
      })
    );
    expect(saved.success).toBe(true);
    expect(await getStorage(popupPage, 'secure_apikey_openai')).toBeTruthy();

    const panel = await openYourData(popupPage);
    await panel.getByRole('button', { name: 'Remove OpenAI (ChatGPT) key' }).click();
    const dialog = popupPage.getByRole('dialog', { name: 'Remove your OpenAI (ChatGPT) key?' });
    await expect(dialog).toContainText('will stop working');
    await dialog.getByRole('button', { name: 'Remove key' }).click();

    await expect(dialog).toHaveCount(0);
    await expect.poll(() => getStorage(popupPage, 'secure_apikey_openai')).toBeUndefined();
    await expect(panel.getByText('No AI keys are saved on this computer.')).toBeVisible();
    // Removing the key is a no to the provider, shown at once.
    await expect(panel.locator('fieldset[data-destination="openai"]')).toContainText(
      'Now: Not allowed'
    );
    expect((await getStorage(popupPage, 'assist_consent_openai')).granted).toBe(false);
  });
});
