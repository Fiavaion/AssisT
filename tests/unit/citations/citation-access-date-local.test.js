/**
 * @jest-environment jsdom
 *
 * The access date is the day the student read the source, on their own calendar. It was stamped
 * as the UTC day, so a student in Dublin reading at half past midnight on 16 July was told they
 * read it on the 15th. The clock is fixed half an hour past a local midnight (east of Greenwich)
 * or half an hour before one (west of it), so the UTC day and the local day differ wherever the
 * suite runs, except on a machine set to UTC itself, where they cannot.
 */

jest.mock('../../../src/utils/consent-panel.js', () => ({ askForConsent: jest.fn() }));

import { createCitation } from '../../../src/features/citations/citation-model.js';
import { parseBibTeX } from '../../../src/features/citations/citation-interchange.js';
import { lookUpDOI } from '../../../src/features/citations/crossref-api.js';

const EAST = new Date(2026, 6, 16, 0, 30).getTimezoneOffset() <= 0;
const NOW = EAST ? new Date(2026, 6, 16, 0, 30) : new Date(2026, 6, 15, 23, 30);
const LOCAL_DAY = EAST ? '2026-07-16' : '2026-07-15';
const ON_UTC = NOW.getTimezoneOffset() === 0;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
});

afterEach(() => {
  jest.useRealTimers();
});

(ON_UTC ? test.skip : test)('the clock really is on different days in UTC and here', () => {
  expect(new Date().toISOString().slice(0, 10)).not.toBe(LOCAL_DAY);
});

test('a new citation is stamped with the student’s local day', () => {
  expect(createCitation({ title: 'Page' }).accessDate).toBe(LOCAL_DAY);
});

test('an imported record with no access date is stamped with the local day', () => {
  const [record] = parseBibTeX('@book{a, title={A book}, author={Smith, John}}');
  expect(record.accessDate).toBe(LOCAL_DAY);
});

test('a DOI lookup with no publication date is stamped with the local day', async () => {
  chrome.runtime.sendMessage = jest.fn().mockResolvedValue({
    success: true,
    data: { work: { title: ['A Paper'], DOI: '10.1000/xyz123' } },
  });
  const { metadata } = await lookUpDOI('10.1000/xyz123');
  expect(metadata.accessDate).toBe(LOCAL_DAY);
});
