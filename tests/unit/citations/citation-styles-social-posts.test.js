/**
 * @jest-environment jsdom
 *
 * A social-media post (X, Instagram, Facebook, TikTok) prints as each style's own rule asks
 * (STYLE-RULES.md, "Social media posts"):
 *
 * - Harvard (Cite Them Right 13th): Author [@handle] (Year) 'Text of post' [Platform] Day Month.
 *   Available at: URL (Accessed: date). The post text is quoted whole.
 * - MLA 9: Author. "Text of post." Platform, Day Mon. Year, URL. The handle follows the name in
 *   square brackets only when it differs from the name, or when there is no URL.
 * - Chicago 17 author-date: Author (@handle). Year. "Up to the first 160 characters." Platform,
 *   Month Day, Year. URL.
 *
 * Every style takes the platform from the recorded site name, and guesses it from the address
 * only when no site name was recorded.
 */

jest.mock('../../../src/utils/consent-panel.js', () => ({ askForConsent: jest.fn() }));

import {
  formatReference,
  formatInText,
} from '../../../src/features/citations/citation-styles/index.js';

const TEXT =
  "Today, it's difficult for researchers to diagnose #Alzheimers patients early enough to intervene. A reliable, easy and accurate diagnostic would be a huge step forward.";
const URL = 'https://x.com/BillGates/status/1170305718425137152';

const GATES = {
  type: 'social_media',
  title: TEXT,
  authors: ['Gates, Bill'],
  publicationDate: '2019-09-07',
  accessDate: '2026-09-20',
  siteName: 'X',
  url: URL,
  extra: { handle: 'BillGates' },
};

describe('an X post by Bill Gates', () => {
  test('Harvard quotes the whole post, gives the handle, the platform and the day posted', () => {
    expect(formatReference(GATES, 'harvard')).toBe(
      `Gates, B. [@BillGates] (2019) '${TEXT}' [X] 7 September. Available at: ${URL} (Accessed: 20 September 2026).`
    );
    expect(formatInText(GATES, 'harvard')).toBe('(Gates, 2019)');
  });

  test('MLA gives the whole post as the title and X as the container', () => {
    expect(formatReference(GATES, 'mla9')).toBe(
      `Gates, Bill. "${TEXT}" X, 7 Sept. 2019, ${URL}.`
    );
    expect(formatReference(GATES, 'mla9', { html: true })).toContain('<em>X</em>, 7 Sept. 2019');
    expect(formatInText(GATES, 'mla9')).toBe('(Gates)');
  });

  test('Chicago takes up to the first 160 characters, the handle in parentheses', () => {
    const first160 =
      "Today, it's difficult for researchers to diagnose #Alzheimers patients early enough to intervene. A reliable, easy and accurate diagnostic would be a huge step…";
    expect(formatReference(GATES, 'chicago17')).toBe(
      `Gates, Bill (@BillGates). 2019. "${first160}." X, September 7, 2019. ${URL}.`
    );
    expect(formatInText(GATES, 'chicago17')).toBe('(Gates 2019)');
  });
});

describe('the rest of each rule', () => {
  const SHORT = { ...GATES, title: 'Is the world ready for singular they?' };

  test('a short post is printed whole, its own question mark closing the title', () => {
    expect(formatReference(SHORT, 'mla9')).toBe(
      `Gates, Bill. "Is the world ready for singular they?" X, 7 Sept. 2019, ${URL}.`
    );
    expect(formatReference(SHORT, 'chicago17')).toBe(
      `Gates, Bill (@BillGates). 2019. "Is the world ready for singular they?" X, September 7, 2019. ${URL}.`
    );
    expect(formatReference(SHORT, 'harvard')).toContain(
      "(2019) 'Is the world ready for singular they?' [X] 7 September."
    );
  });

  test('a Chicago cut never splits a word', () => {
    const long = { ...GATES, title: `${'word '.repeat(31)}extraordinarily long ending` };
    const ref = formatReference(long, 'chicago17');
    const title = ref.match(/"(.*)\."/)[1];
    expect(title.endsWith('word…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(161);
  });

  test('MLA names a handle that differs from the account name', () => {
    const ng = { ...GATES, authors: ['Ng, Celeste'], extra: { handle: '@pronounced_ing' } };
    expect(formatReference(ng, 'mla9')).toMatch(/^Ng, Celeste \[@pronounced_ing\]\. "/);
    expect(formatInText(ng, 'mla9')).toBe('(Ng)');
  });

  test('MLA names even a matching handle when there is no URL to find the post by', () => {
    const offline = { ...GATES, url: '' };
    expect(formatReference(offline, 'mla9')).toMatch(/^Gates, Bill \[@BillGates\]\. "/);
  });

  test('the recorded site name is the platform, whatever the address says', () => {
    const post = { ...GATES, siteName: 'Threads', url: 'https://x.com/BillGates/status/1' };
    expect(formatReference(post, 'harvard')).toContain('[Threads]');
    expect(formatReference(post, 'mla9')).toContain('" Threads, 7 Sept. 2019');
    expect(formatReference(post, 'chicago17')).toContain('." Threads, September 7, 2019.');
  });

  test('with no site name, the platform is read from the address', () => {
    const post = { ...GATES, siteName: '', url: 'https://www.instagram.com/p/CB-E9gngVwo/' };
    expect(formatReference(post, 'harvard')).toContain('[Instagram]');
    expect(formatReference(post, 'mla9')).toContain('" Instagram, 7 Sept. 2019');
    expect(formatReference(post, 'chicago17')).toContain('." Instagram, September 7, 2019.');
  });

  test('an address that merely ends in "x.com" is not X', () => {
    const post = { ...GATES, siteName: '', url: 'https://www.netflix.com/watch/1' };
    expect(formatReference(post, 'harvard')).toContain(' [Social media] 7 September.');
    expect(formatReference(post, 'mla9')).not.toMatch(/" X,/);
    expect(formatReference(post, 'chicago17')).not.toMatch(/" X,/);
  });
});
