/**
 * @jest-environment jsdom
 *
 * A DOI lookup sends the DOI to Crossref, so it asks first (ADR 0006), through the service worker.
 * The student's own action (saving a source, adding one by DOI) may ask; a badge that checks
 * itself when the library draws a card never does.
 */

jest.mock('../../../src/utils/consent-panel.js', () => ({ askForConsent: jest.fn() }));

import { fetchDOIMetadata, lookUpDOI } from '../../../src/features/citations/crossref-api.js';
import { askForConsent } from '../../../src/utils/consent-panel.js';

const UNASKED = { success: false, code: 'consent-unasked', destination: 'citations' };
const WORK = { success: true, data: { work: { title: ['A Paper'], DOI: '10.1000/xyz123' } } };

beforeEach(() => {
  global.fetch = jest.fn();
  chrome.runtime.sendMessage = jest.fn();
  askForConsent.mockReset();
});

test('asks the worker for the cleaned DOI and never fetches here', async () => {
  chrome.runtime.sendMessage.mockResolvedValue(WORK);
  const result = await lookUpDOI('https://doi.org/10.1000/xyz123');
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
    type: 'THIRD_PARTY_REQUEST',
    destination: 'citations',
    params: { doi: '10.1000/xyz123' },
  });
  expect(result.status).toBe('found');
  expect(result.metadata.title).toBe('A Paper');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('something that is not a DOI is not sent anywhere', async () => {
  const result = await lookUpDOI('not a doi');
  expect(result.status).toBe('invalid');
  expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
});

test('first use asks, showing the DOI, and a yes completes the lookup', async () => {
  chrome.runtime.sendMessage.mockResolvedValueOnce(UNASKED).mockResolvedValueOnce(WORK);
  askForConsent.mockResolvedValue('granted');
  const metadata = await fetchDOIMetadata('10.1000/xyz123');
  expect(askForConsent).toHaveBeenCalledWith(
    'citations',
    expect.objectContaining({ detail: '10.1000/xyz123' })
  );
  expect(metadata.title).toBe('A Paper');
});

test('"not now" is reported as declined, with nothing sent', async () => {
  chrome.runtime.sendMessage.mockResolvedValueOnce(UNASKED);
  askForConsent.mockResolvedValue('declined');
  const result = await lookUpDOI('10.1000/xyz123');
  expect(result).toEqual({ status: 'declined', metadata: null });
  expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a lookup the student did not start never opens the panel', async () => {
  chrome.runtime.sendMessage.mockResolvedValue(UNASKED);
  const metadata = await fetchDOIMetadata('10.1000/xyz123', { ask: false });
  expect(askForConsent).not.toHaveBeenCalled();
  expect(metadata).toBeNull();
});

test('a lookup nobody started, with no Crossref host, reads as not allowed, not a failure', async () => {
  // ADR 0009: a host Chrome does not hold is no consent. A badge checking itself must say "not
  // allowed", the same as an unasked lookup, and never log it as a failed request.
  chrome.runtime.sendMessage.mockResolvedValue({
    success: false,
    code: 'permission-missing',
    destination: 'citations',
  });
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  const result = await lookUpDOI('10.1000/xyz123', { ask: false });
  expect(askForConsent).not.toHaveBeenCalled();
  expect(result).toEqual({ status: 'declined', metadata: null });
  expect(errors).not.toHaveBeenCalled();
});

test('a DOI Crossref does not know is not found; a failure is a failure', async () => {
  chrome.runtime.sendMessage.mockResolvedValueOnce({ success: false, code: 'not-found' });
  await expect(lookUpDOI('10.1000/nope')).resolves.toEqual({ status: 'not-found', metadata: null });

  jest.spyOn(console, 'error').mockImplementation(() => {});
  chrome.runtime.sendMessage.mockResolvedValueOnce({ success: false, code: 'network' });
  await expect(lookUpDOI('10.1000/nope')).resolves.toEqual({ status: 'failed', metadata: null });
});
