/**
 * @jest-environment jsdom
 *
 * How a feature asks the worker for something from an outside service. The client is where the
 * first-use question happens: an unanswered destination opens the panel, a yes completes the
 * request the student made, a no sends nothing, and a recorded no is never asked about again.
 */

jest.mock('../../../src/utils/consent-panel.js', () => ({
  askForConsent: jest.fn(),
}));

import { requestThirdParty } from '../../../src/utils/third-party-client.js';
import { askForConsent } from '../../../src/utils/consent-panel.js';

const OK = { success: true, data: { translatedText: 'Hola' } };
const UNASKED = { success: false, code: 'consent-unasked', destination: 'translation' };
const DECLINED = { success: false, code: 'consent-declined', destination: 'translation' };
const PARAMS = { text: 'Hello', source: 'en', target: 'es' };

beforeEach(() => {
  chrome.runtime.sendMessage = jest.fn();
  askForConsent.mockReset();
});

test('sends the destination and parameters to the worker, and nothing else', async () => {
  chrome.runtime.sendMessage.mockResolvedValue(OK);
  const reply = await requestThirdParty('translation', PARAMS);
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
    type: 'THIRD_PARTY_REQUEST',
    destination: 'translation',
    params: PARAMS,
  });
  expect(reply).toEqual(OK);
  expect(askForConsent).not.toHaveBeenCalled();
});

test('an unanswered destination asks, and a yes completes the request the student made', async () => {
  chrome.runtime.sendMessage.mockResolvedValueOnce(UNASKED).mockResolvedValueOnce(OK);
  askForConsent.mockResolvedValue('granted');
  const opener = document.createElement('button');

  const reply = await requestThirdParty('translation', PARAMS, {
    detail: 'Hello',
    returnFocus: opener,
  });

  expect(askForConsent).toHaveBeenCalledWith('translation', {
    detail: 'Hello',
    returnFocus: opener,
  });
  expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  expect(reply).toEqual(OK);
});

test('"not now" sends nothing more and reports the refusal', async () => {
  chrome.runtime.sendMessage.mockResolvedValueOnce(UNASKED);
  askForConsent.mockResolvedValue('declined');

  const reply = await requestThirdParty('translation', PARAMS);

  expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  expect(reply).toMatchObject({ success: false, code: 'consent-declined' });
});

test('a missing host is asked about like no answer at all, and a yes completes the request', async () => {
  // ADR 0009: the host comes with the yes. A yes recorded before the host was optional, or a host
  // given back, means the student is asked again, never a silent failure.
  const MISSING = { success: false, code: 'permission-missing', destination: 'translation' };
  chrome.runtime.sendMessage.mockResolvedValueOnce(MISSING).mockResolvedValueOnce(OK);
  askForConsent.mockResolvedValue('granted');

  const reply = await requestThirdParty('translation', PARAMS, { detail: 'Hello' });

  expect(askForConsent).toHaveBeenCalledWith('translation', { detail: 'Hello' });
  expect(reply).toEqual(OK);
});

test('a missing host that is then refused comes back as declined', async () => {
  const MISSING = { success: false, code: 'permission-missing', destination: 'translation' };
  chrome.runtime.sendMessage.mockResolvedValueOnce(MISSING);
  askForConsent.mockResolvedValue('declined');

  const reply = await requestThirdParty('translation', PARAMS);

  expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  expect(reply).toMatchObject({ success: false, code: 'consent-declined' });
});

test('a recorded no is not asked about again', async () => {
  chrome.runtime.sendMessage.mockResolvedValue(DECLINED);
  const reply = await requestThirdParty('translation', PARAMS);
  expect(askForConsent).not.toHaveBeenCalled();
  expect(reply).toEqual(DECLINED);
});

test('a lookup nobody asked for does not open the panel', async () => {
  chrome.runtime.sendMessage.mockResolvedValue(UNASKED);
  const reply = await requestThirdParty('translation', PARAMS, { ask: false });
  expect(askForConsent).not.toHaveBeenCalled();
  expect(reply).toEqual(UNASKED);
});

test('a worker that cannot be reached is a failure, not an exception', async () => {
  chrome.runtime.sendMessage.mockRejectedValue(new Error('Extension context invalidated.'));
  const reply = await requestThirdParty('translation', PARAMS);
  expect(reply).toMatchObject({ success: false, code: 'unavailable' });
});

test('a worker that says nothing is a failure, not an exception', async () => {
  chrome.runtime.sendMessage.mockResolvedValue(undefined);
  const reply = await requestThirdParty('translation', PARAMS);
  expect(reply).toMatchObject({ success: false, code: 'unavailable' });
});
