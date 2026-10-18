/**
 * Fixture sets for scripts/csl-crosscheck.mjs.
 *
 * Each set is one reference list: every citation in it is formatted against the others, so the
 * sets that interact (same author and year, namesakes, undated works) are lists of two or three.
 * Records are in the flat AssisT shape the citation store keeps; the cross-check turns them into
 * CSL-JSON with the project's own exporter.
 *
 * `rules` names what a set exercises, so the report can find the evidence for each rule.
 * `locator` on a citation is passed to both processors as a page locator for its in-text form.
 * Titles are in sentence case, as a student using APA or Harvard would type them.
 */

/** "Family, Given" names for author-count sets: Author01, Alex; Author02, Blair; … */
const GIVEN = [
  'Alex', 'Blair', 'Casey', 'Dana', 'Eden', 'Finley', 'Gray', 'Harper', 'Indy', 'Jordan', 'Kai',
  'Logan', 'Morgan', 'Noel', 'Oakley', 'Parker', 'Quinn', 'Riley', 'Sage', 'Taylor', 'Uma', 'Vale',
];
const SURNAMES = [
  'Adams', 'Brown', 'Clarke', 'Davies', 'Evans', 'Foster', 'Green', 'Hughes', 'Irving', 'Jones',
  'King', 'Lewis', 'Moore', 'Nolan', 'Owen', 'Price', 'Quinn', 'Reid', 'Shaw', 'Turner', 'Upton',
  'Vaughan',
];
const authorsN = n => Array.from({ length: n }, (_, i) => `${SURNAMES[i]}, ${GIVEN[i]}`);

const journal = (id, authors, title, extra = {}) => ({
  id,
  type: 'journal',
  title,
  authors,
  publicationDate: '2021',
  siteName: 'Journal of Learning Sciences',
  doi: '10.5555/jls.2021.' + id,
  extra: { volume: '12', issue: '3', pages: '101-120' },
  ...extra,
});

const authorCountSet = n => ({
  id: `authors-${n}`,
  label: `Journal article, ${n} author${n === 1 ? '' : 's'}`,
  rules: n > 10 ? ['chicago-11-plus', 'harvard-over-10'] : [],
  citations: [journal(`a${n}`, authorsN(n), `Reading support in higher education, study ${n}`)],
});

const web = (id, fields) => ({
  id,
  type: 'website',
  url: `https://example.org/${id}`,
  accessDate: '2026-03-14',
  ...fields,
});

export const FIXTURE_SETS = [
  {
    id: 'journal-doi',
    label: 'Journal article with DOI, two authors',
    rules: [],
    citations: [
      journal('jd1', ['Okafor, Chidi', 'Walsh, Niamh'], 'Text-to-speech and reading comprehension', {
        locator: '104',
      }),
    ],
  },
  {
    id: 'journal-doi-accessed',
    label: 'Journal article with DOI, URL and an access date',
    rules: ['harvard-doi-no-accessed'],
    citations: [
      journal('jda1', ['Byrne, Aoife'], 'Dictation tools in secondary schools', {
        url: 'https://journals.example.org/jls/dictation',
        accessDate: '2026-02-01',
      }),
    ],
  },
  {
    id: 'book',
    label: 'Book, second edition, place and publisher',
    rules: [],
    citations: [
      {
        id: 'bk1',
        type: 'book',
        title: 'Inclusive teaching: a practical guide',
        authors: ['Murphy, Ciara'],
        publicationDate: '2019',
        publisher: 'Routledge',
        extra: { place: 'London', edition: '2' },
      },
    ],
  },
  {
    id: 'chapter',
    label: 'Chapter in an edited book',
    rules: [],
    citations: [
      {
        id: 'ch1',
        type: 'chapter',
        title: 'Assistive technology and dyslexia',
        authors: ['Kelly, Sean'],
        publicationDate: '2018',
        siteName: 'Handbook of learning differences',
        publisher: 'Palgrave Macmillan',
        extra: { editors: ['Doyle, Maeve', 'Hart, Tom'], pages: '45-67', place: 'Basingstoke' },
      },
    ],
  },
  {
    id: 'web-full',
    label: 'Web page with author and date',
    rules: [],
    citations: [
      web('wf1', {
        title: 'How screen readers handle maths',
        authors: ['Quinlan, Ruth'],
        publicationDate: '2024-05-02',
        siteName: 'Accessibility Weekly',
      }),
    ],
  },
  {
    id: 'web-no-author',
    label: 'Web page without author',
    rules: ['short-title'],
    citations: [
      web('wna1', {
        title: 'Guidance on reasonable adjustments',
        publicationDate: '2023',
        siteName: 'Student Support Online',
      }),
    ],
  },
  {
    id: 'web-no-date',
    label: 'Web page without date',
    rules: [],
    citations: [
      web('wnd1', {
        title: 'Using dictation in essays',
        authors: ['Fitzgerald, Orla'],
        siteName: 'Study Skills Hub',
      }),
    ],
  },
  {
    id: 'web-no-author-no-date',
    label: 'Web page without author or date',
    rules: ['short-title'],
    citations: [
      web('wnand1', { title: 'Accessible fonts explained', siteName: 'Design Notes' }),
    ],
  },
  {
    id: 'short-title-long',
    label: 'No-author works whose titles must be shortened in text',
    rules: ['short-title'],
    citations: [
      web('stl1', {
        title: 'Climate change and public health: a review of the evidence',
        publicationDate: '2022',
        siteName: 'Health Evidence Portal',
      }),
      web('stl2', {
        title: 'The long and winding history of assistive reading technologies in schools',
        publicationDate: '2020',
        siteName: 'Ed Tech History',
      }),
    ],
  },
  {
    id: 'org-author',
    label: 'Organisation as author, different site',
    rules: [],
    citations: [
      web('org1', {
        title: 'Global report on assistive technology',
        authors: ['World Health Organization'],
        publicationDate: '2022',
        siteName: 'Reliefweb',
        extra: { organisationAuthors: ['World Health Organization'] },
      }),
    ],
  },
  {
    id: 'org-is-publisher',
    label: 'Organisation that is also site and publisher',
    rules: ['mla-org-publisher'],
    citations: [
      web('orgp1', {
        title: 'Dyslexia and reading',
        authors: ['National Literacy Trust'],
        publicationDate: '2023',
        siteName: 'National Literacy Trust',
        publisher: 'National Literacy Trust',
        extra: { organisationAuthors: ['National Literacy Trust'] },
      }),
      {
        id: 'orgp2',
        type: 'book',
        title: 'Annual review of disability services',
        authors: ['Association for Higher Education Access and Disability'],
        publicationDate: '2021',
        publisher: 'Association for Higher Education Access and Disability',
        extra: {
          place: 'Dublin',
          organisationAuthors: ['Association for Higher Education Access and Disability'],
        },
      },
    ],
  },
  ...[1, 2, 3, 6, 8, 11, 21, 22].map(authorCountSet),
  {
    id: 'same-author-year-2',
    label: 'Same author, same year, two works',
    rules: ['year-letters'],
    citations: [
      journal('say2a', ['Nolan, Grace'], 'Working memory and note taking', { locator: '5' }),
      journal('say2b', ['Nolan, Grace'], 'An audit of lecture capture'),
    ],
  },
  {
    id: 'same-author-year-3',
    label: 'Same author, same year, three works',
    rules: ['year-letters'],
    citations: [
      journal('say3a', ['Nolan, Grace'], 'Working memory and note taking'),
      journal('say3b', ['Nolan, Grace'], 'The reading load of first-year courses'),
      journal('say3c', ['Nolan, Grace'], 'Background music while studying'),
    ],
  },
  {
    id: 'undated-same-author',
    label: 'Two undated works by one author',
    rules: ['harvard-no-date-a', 'chicago-nda'],
    citations: [
      web('uda1', {
        title: 'Planning an essay',
        authors: ['Walsh, Peter'],
        siteName: 'Writing Centre',
        locator: '2',
      }),
      web('uda2', { title: 'Editing your draft', authors: ['Walsh, Peter'], siteName: 'Writing Centre' }),
    ],
  },
  {
    id: 'dated-and-undated',
    label: 'One author: two years and an undated work',
    rules: [],
    citations: [
      web('dau1', {
        title: 'Referencing basics',
        authors: ['Ryan, Clare'],
        publicationDate: '2019',
        siteName: 'Library Guides',
      }),
      web('dau2', {
        title: 'Avoiding plagiarism',
        authors: ['Ryan, Clare'],
        publicationDate: '2017',
        siteName: 'Library Guides',
      }),
      web('dau3', { title: 'Citing images', authors: ['Ryan, Clare'], siteName: 'Library Guides' }),
    ],
  },
  {
    id: 'namesakes-same-initial',
    label: 'John Smith and Jane Smith, same year',
    rules: ['harvard-same-initials'],
    citations: [
      journal('nsi1', ['Smith, John'], 'Captioning lectures'),
      journal('nsi2', ['Smith, Jane'], 'Reading rulers in practice'),
    ],
  },
  {
    id: 'namesakes-diff-initial',
    label: 'John Smith and Mary Smith, same year',
    rules: [],
    citations: [
      journal('ndi1', ['Smith, John'], 'Captioning lectures'),
      journal('ndi2', ['Smith, Mary'], 'Reading rulers in practice'),
    ],
  },
  {
    id: 'namesakes-diff-year',
    label: 'John Smith 2019 and Mary Smith 2021',
    rules: [],
    citations: [
      journal('ndy1', ['Smith, John'], 'Captioning lectures', { publicationDate: '2019' }),
      journal('ndy2', ['Smith, Mary'], 'Reading rulers in practice'),
    ],
  },
  {
    id: 'social-post',
    label: 'Social media post with handle',
    rules: [],
    citations: [
      {
        id: 'sp1',
        type: 'social_media',
        title: 'Our new guide to accessible slides is out today, with templates for every subject',
        authors: ['Gates, Bill'],
        publicationDate: '2024-09-07',
        siteName: 'X',
        url: 'https://x.com/BillGates/status/1',
        accessDate: '2026-03-14',
        extra: { handle: '@BillGates' },
      },
    ],
  },
  {
    id: 'video',
    label: 'YouTube video by an organisation',
    rules: [],
    citations: [
      {
        id: 'v1',
        type: 'video',
        title: 'Soft robotic gripper for jellyfish',
        authors: ['Harvard University'],
        publicationDate: '2019-08-28',
        siteName: 'YouTube',
        url: 'https://www.youtube.com/watch?v=guRoWTYfxMs',
        accessDate: '2026-03-14',
        extra: { organisationAuthors: ['Harvard University'] },
      },
    ],
  },
];

/**
 * The owner's open ("?") rules, each tied to the set that shows it and the style it concerns.
 * `style: null` means the rule is compared in every style.
 */
export const OPEN_RULES = [
  { id: 'harvard-no-date-a', style: 'harvard', set: 'undated-same-author', rule: 'Harvard: "no date a" for two undated works by one author' },
  { id: 'chicago-nda', style: 'chicago17', set: 'undated-same-author', rule: 'Chicago: "n.d.a" for two undated works by one author' },
  { id: 'chicago-11-plus', style: 'chicago17', set: 'authors-11', rule: 'Chicago: 11+ authors, first 7 then et al.' },
  { id: 'harvard-doi-no-accessed', style: 'harvard', set: 'journal-doi-accessed', rule: 'Harvard: no accessed date when a DOI is given' },
  { id: 'harvard-over-10', style: 'harvard', set: 'authors-11', rule: 'Harvard: more than 10 authors, "First, A. et al."' },
  { id: 'short-title', style: null, set: 'short-title-long', rule: 'Short titles in text: main title whole up to 6 words, else cut at a natural break' },
  { id: 'mla-org-publisher', style: 'mla9', set: 'org-is-publisher', rule: 'MLA: organisation that is also site/publisher, entry starts with the title' },
  { id: 'harvard-same-initials', style: 'harvard', set: 'namesakes-same-initial', rule: 'Harvard: same surname, same initials, same year printed identically' },
  { id: 'capitals', style: null, set: 'journal-doi', rule: 'Capitals hint: APA/Harvard sentence case, MLA/Chicago title case, no automatic conversion' },
];
