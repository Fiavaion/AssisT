/**
 * @jest-environment jsdom
 *
 * An author that is an organisation — "World Health Organization", "Harvard University", "BBC
 * News", a YouTube channel — is printed whole, never inverted or reduced to initials, in every
 * style, and is alphabetised by its first significant word (STYLE-RULES.md, "Organisations as
 * authors").
 *
 * A record says which of its authors are organisations in `extra.organisationAuthors`: the names,
 * exactly as they stand in `authors`. A record without that list prints exactly as it always did.
 * Every importer that can say "this is an organisation" sets it, and every exporter writes it back
 * in its own format's way: BibTeX double braces, a CSL `literal`, an RIS name without a comma.
 */

jest.mock('../../../src/utils/consent-panel.js', () => ({ askForConsent: jest.fn() }));

import {
  formatReference,
  formatInText,
  formatBibliography,
} from '../../../src/features/citations/citation-styles/index.js';
import { normalizeCitation } from '../../../src/features/citations/citation-types.js';
import { parseBibTeX, parseRIS } from '../../../src/features/citations/citation-interchange.js';
import { exportAsBibTeX, exportAsRIS } from '../../../src/features/citations/citation-export.js';
import { exportAsCSL, importFromCSL } from '../../../src/features/citations/citation-csl-io.js';
import { fromCSL } from '../../../src/features/citations/csl-adapter.js';
import {
  fetchDOIMetadata,
  enrichMetadataWithDOI,
} from '../../../src/features/citations/crossref-api.js';
import { checkReferences } from '../../../src/features/citations/reference-check.js';

const STYLES = ['harvard', 'apa7', 'mla9', 'chicago17'];
const WHO_URL = 'https://www.who.int/publications/i/item/9789240005105';

/** The WHO report as the wizard saves it with the box ticked. */
const WHO = {
  id: 'who',
  type: 'website',
  title: 'World health statistics 2020',
  authors: ['World Health Organization'],
  publicationDate: '2020-05-13',
  siteName: 'World Health Organization',
  publisher: 'World Health Organization',
  url: WHO_URL,
  accessDate: '2026-09-20',
  extra: { organisationAuthors: ['World Health Organization'] },
};

/** The same record saved before anyone could say it was an organisation. */
const WHO_UNMARKED = { ...WHO, id: 'who-old', extra: {} };

const org = (id, name, fields = {}) => ({
  id,
  type: 'book',
  title: `A book by ${name}`,
  authors: [name],
  publisher: 'Pub',
  publicationDate: '2020',
  extra: { organisationAuthors: [name] },
  ...fields,
});

describe('the WHO report prints whole in every style', () => {
  test('Harvard (Cite Them Right)', () => {
    expect(formatReference(WHO, 'harvard')).toBe(
      `World Health Organization (2020) World health statistics 2020. Available at: ${WHO_URL} (Accessed: 20 September 2026).`
    );
    expect(formatInText(WHO, 'harvard')).toBe('(World Health Organization, 2020)');
  });

  test('APA 7: the site name is left out when it is the author', () => {
    expect(formatReference(WHO, 'apa7')).toBe(
      `World Health Organization. (2020, May 13). World health statistics 2020. ${WHO_URL}`
    );
    expect(formatInText(WHO, 'apa7')).toBe('(World Health Organization, 2020)');
  });

  test('MLA 9: an organisation that is also the publisher is not repeated as author', () => {
    expect(formatReference(WHO, 'mla9')).toBe(
      `"World health statistics 2020." World Health Organization, 13 May 2020, ${WHO_URL}. Accessed 20 Sept. 2026.`
    );
    expect(formatInText(WHO, 'mla9')).toBe('("World health statistics 2020")');
  });

  test('Chicago 17 author-date', () => {
    expect(formatReference(WHO, 'chicago17')).toBe(
      `World Health Organization. 2020. "World health statistics 2020." World Health Organization. May 13, 2020. ${WHO_URL}.`
    );
    expect(formatInText(WHO, 'chicago17')).toBe('(World Health Organization 2020)');
  });

  test('a record saved without the mark prints exactly as it always did', () => {
    expect(formatReference(WHO_UNMARKED, 'harvard')).toBe(
      `Organization, W.H. (2020) World health statistics 2020. Available at: ${WHO_URL} (Accessed: 20 September 2026).`
    );
    expect(formatInText(WHO_UNMARKED, 'apa7')).toBe('(Organization, 2020)');
    expect(formatReference(WHO_UNMARKED, 'mla9')).toMatch(/^Organization, World Health\. /);
    expect(formatInText(WHO_UNMARKED, 'chicago17')).toBe('(Organization 2020)');
  });
});

describe('Harvard University and BBC News, in list and in text, every style', () => {
  const HARVARD = org('harvard', 'Harvard University');
  const BBC = org('bbc', 'BBC News', {
    type: 'website',
    siteName: 'BBC',
    url: 'https://www.bbc.co.uk/news/x',
  });

  test.each(STYLES)('%s', style => {
    for (const record of [HARVARD, BBC]) {
      const [name] = record.authors;
      expect(formatReference(record, style).startsWith(name)).toBe(true);
      expect(formatInText(record, style)).toContain(name);
      expect(formatInText(record, style, { html: true })).toContain(name);
    }
  });

  test('an organisation beside a person keeps its own form in each style', () => {
    const both = {
      ...org('both', 'BBC News'),
      authors: ['BBC News', 'Smith, Jane'],
    };
    expect(formatReference(both, 'apa7').startsWith('BBC News, & Smith, J. (2020).')).toBe(true);
    expect(formatReference(both, 'mla9').startsWith('BBC News, and Jane Smith.')).toBe(true);
    expect(formatReference(both, 'chicago17').startsWith('BBC News, and Jane Smith. 2020.')).toBe(
      true
    );
    expect(formatInText(both, 'harvard')).toBe('(BBC News and Smith, 2020)');
  });
});

describe('an organisation is alphabetised by its first significant word', () => {
  const people = [
    {
      id: 'wright',
      type: 'book',
      title: 'W',
      authors: ['Wright, Amy'],
      publisher: 'Pub',
      publicationDate: '2018',
    },
    {
      id: 'harris',
      type: 'book',
      title: 'H',
      authors: ['Harris, Jane'],
      publisher: 'Pub',
      publicationDate: '2019',
    },
  ];
  const orgs = [org('who', 'World Health Organization'), org('royal', 'The Royal Society')];

  test.each(STYLES)('%s', style => {
    const list = formatBibliography([...orgs, ...people], style).split('\n\n');
    const leads = list.map(entry => entry.slice(0, 6));
    expect(leads).toEqual(['Harris', 'The Ro', 'World ', 'Wright']);
  });
});

describe('APA 7 video and post entries', () => {
  test('a YouTube video names the platform after the descriptor', () => {
    const video = {
      type: 'video',
      title: 'Soft robotic gripper for jellyfish',
      authors: ['Harvard University'],
      publicationDate: '2019-08-28',
      siteName: 'YouTube',
      url: 'https://www.youtube.com/watch?v=guRoWTYfxMs',
      extra: { organisationAuthors: ['Harvard University'] },
    };
    expect(formatReference(video, 'apa7')).toBe(
      'Harvard University. (2019, August 28). Soft robotic gripper for jellyfish [Video]. YouTube. https://www.youtube.com/watch?v=guRoWTYfxMs'
    );
    expect(formatInText(video, 'apa7')).toBe('(Harvard University, 2019)');
  });

  test('a post gives the handle after the name, the first 20 words, [Post] and the platform', () => {
    const post = {
      type: 'social_media',
      title:
        "Today, it's difficult for researchers to diagnose #Alzheimers patients early enough to intervene. A reliable, easy and accurate diagnostic would be a huge step forward.",
      authors: ['Gates, Bill'],
      publicationDate: '2019-09-07',
      siteName: 'X',
      url: 'https://x.com/BillGates/status/1170305718425137152',
      extra: { handle: 'BillGates' },
    };
    expect(formatReference(post, 'apa7')).toBe(
      "Gates, B. [@BillGates]. (2019, September 7). Today, it's difficult for researchers to diagnose #Alzheimers patients early enough to intervene. A reliable, easy and accurate diagnostic would [Post]. X. https://x.com/BillGates/status/1170305718425137152"
    );
  });
});

describe('normalizeCitation keeps the list honest', () => {
  test('names no longer among the authors are dropped, and an empty list is removed', () => {
    const c = normalizeCitation({
      title: 'T',
      authors: ['BBC News', 'Smith, Jane'],
      extra: { organisationAuthors: ['BBC News', 'Gone Org', 42] },
    });
    expect(c.extra.organisationAuthors).toEqual(['BBC News']);
    const none = normalizeCitation({
      title: 'T',
      authors: ['Smith, Jane'],
      extra: { organisationAuthors: ['Gone'] },
    });
    expect(none.extra.organisationAuthors).toBeUndefined();
  });
});

describe('importers say which authors are organisations', () => {
  test('BibTeX: a name in double braces is a literal organisation', () => {
    const [rec] = parseBibTeX(
      '@misc{k, author = {{BBC News} and Smith, Jane and {{Harvard University}}}, title = {T}, year = {2020}}'
    );
    expect(rec.authors).toEqual(['BBC News', 'Smith, Jane', 'Harvard University']);
    expect(rec.extra.organisationAuthors).toEqual(['BBC News', 'Harvard University']);
  });

  test('RIS: an author written without a comma is an organisation (as Zotero reads it)', () => {
    const [rec] = parseRIS('TY  - ELEC\nTI  - T\nAU  - BBC News\nAU  - Smith, Jane\nER  -\n');
    expect(rec.authors).toEqual(['BBC News', 'Smith, Jane']);
    expect(rec.extra.organisationAuthors).toEqual(['BBC News']);
  });

  test('CSL-JSON from another manager: a literal name is an organisation', () => {
    const rec = fromCSL({
      type: 'report',
      title: 'T',
      author: [{ literal: 'World Health Organization' }, { family: 'Smith', given: 'Jane' }],
    });
    expect(rec.authors).toEqual(['World Health Organization', 'Smith, Jane']);
    expect(rec.extra.organisationAuthors).toEqual(['World Health Organization']);
  });

  test('CrossRef: an author given by `name` alone is an organisation', async () => {
    chrome.runtime.sendMessage = jest.fn().mockResolvedValue({
      success: true,
      data: {
        work: {
          type: 'report',
          title: ['World health statistics 2020'],
          author: [{ name: 'World Health Organization' }, { family: 'Smith', given: 'Jane' }],
          DOI: '10.1000/who',
        },
      },
    });
    const metadata = await fetchDOIMetadata('10.1000/who', { ask: false });
    expect(metadata.authors).toEqual(['World Health Organization', 'Smith, Jane']);
    expect(metadata.extra.organisationAuthors).toEqual(['World Health Organization']);

    // Enriching a page capture: CrossRef's authors win, and so does its say on who is an organisation.
    const enriched = await enrichMetadataWithDOI(
      {
        title: 'x',
        authors: ['Someone Else'],
        extra: { source: 'page', organisationAuthors: ['Someone Else'] },
      },
      '10.1000/who'
    );
    expect(enriched.extra.organisationAuthors).toEqual(['World Health Organization']);
    expect(formatInText(enriched, 'apa7')).toBe('(World Health Organization & Smith, n.d.)');
  });
});

describe('round trips keep an organisation an organisation', () => {
  const record = {
    id: 'rt',
    type: 'website',
    title: 'Round trip',
    authors: ['BBC News', 'Smith, Jane'],
    publicationDate: '2021',
    url: 'https://example.org/rt',
    extra: { organisationAuthors: ['BBC News'] },
  };

  test('BibTeX writes the organisation in double braces and reads it back', () => {
    const bib = exportAsBibTeX([record]);
    expect(bib).toContain('author = {{BBC News} and Smith, Jane}');
    const [back] = parseBibTeX(bib);
    expect(back.authors).toEqual(['BBC News', 'Smith, Jane']);
    expect(back.extra.organisationAuthors).toEqual(['BBC News']);
  });

  test('RIS writes the organisation as one name and reads it back', () => {
    const ris = exportAsRIS([record]);
    expect(ris).toContain('AU  - BBC News');
    const [back] = parseRIS(ris);
    expect(back.authors).toEqual(['BBC News', 'Smith, Jane']);
    expect(back.extra.organisationAuthors).toEqual(['BBC News']);
  });

  test('CSL-JSON writes a literal and reads it back, with or without our own overflow', () => {
    const json = exportAsCSL([record]);
    const items = JSON.parse(json);
    expect(items[0].author[0]).toEqual({ literal: 'BBC News' });
    expect(importFromCSL(json)[0].extra.organisationAuthors).toEqual(['BBC News']);
    delete items[0]['assist:extras'];
    const [foreign] = importFromCSL(JSON.stringify(items));
    expect(foreign.authors).toEqual(['BBC News', 'Smith, Jane']);
    expect(foreign.extra.organisationAuthors).toEqual(['BBC News']);
  });
});

describe('the reference check finds an organisation cited in the text', () => {
  test('(World Health Organization, 2020) matches the WHO report', () => {
    const result = checkReferences(
      'Life expectancy rose (World Health Organization, 2020).',
      [WHO],
      'apa7'
    );
    expect(result.counts.matched).toBe(1);
    expect(result.citedNotListed).toEqual([]);
  });
});

// Found in review: the private organisation mark is a control character (U+0003). A record whose
// author began with one marked itself an organisation on every path that read names without the
// styles' marking step (CSL export, the reference check), and the character itself leaked into
// BibTeX and RIS files. normalizeCitation now removes control characters from names and titles,
// and every path reads normalised records.
describe('a control character in a record never reaches a name or an export', () => {
  const MARK = String.fromCharCode(3);
  const ITALIC_OPEN = String.fromCharCode(1);
  const ITALIC_CLOSE = String.fromCharCode(2);
  const CONTROL = new RegExp('[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]');
  const spoofed = {
    id: 'spoof',
    type: 'book',
    title: `A ${ITALIC_OPEN}bold${ITALIC_CLOSE} claim`,
    authors: [`${MARK}Smith, John`, `Jones,${String.fromCharCode(10)}Ann${String.fromCharCode(127)}`],
    publisher: 'Pub',
    publicationDate: '2020',
    extra: { editors: [`${MARK}Brown, Kim`] },
  };

  test('normalizeCitation removes them from authors, editors and the title', () => {
    const c = normalizeCitation(spoofed);
    expect(c.authors).toEqual(['Smith, John', 'Jones, Ann']);
    expect(c.extra.editors).toEqual(['Brown, Kim']);
    expect(c.title).toBe('A bold claim');
  });

  test('a record cannot mark its own author as an organisation in any style', () => {
    expect(formatReference(spoofed, 'harvard')).toMatch(/^Smith, J\. and Jones, A\. \(2020\)/);
    expect(formatInText(spoofed, 'harvard')).toBe('(Smith and Jones, 2020)');
  });

  test('CSL export splits the name like any person', () => {
    const [item] = JSON.parse(exportAsCSL([spoofed]));
    expect(item.author[0]).toEqual({ family: 'Smith', given: 'John' });
    expect(JSON.stringify(item)).not.toMatch(CONTROL);
  });

  test('BibTeX and RIS carry no control character', () => {
    const bib = exportAsBibTeX([spoofed]);
    expect(bib).toContain('author = {Smith, John and Jones, Ann}');
    expect(bib).not.toMatch(CONTROL);
    const ris = exportAsRIS([spoofed]);
    expect(ris).toContain('AU  - Smith, John');
    expect(ris).not.toMatch(CONTROL);
  });

  test('the reference check reads the family name, not the whole marked name', () => {
    const result = checkReferences('As shown (Smith and Jones, 2020).', [spoofed], 'harvard');
    expect(result.citedNotListed).toEqual([]);
    expect(result.listedNotCited).toEqual([]);
  });
});
