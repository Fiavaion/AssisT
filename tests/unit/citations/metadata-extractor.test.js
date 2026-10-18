/**
 * @jest-environment jsdom
 *
 * Tests for citation metadata extraction — focused on the Highwire Press (citation_*) academic
 * tags (the standard the old extractor ignored) and the title fallback that guarantees a save
 * never fails validation with "Title is required".
 */

import {
  extractMetadata,
  mergeMetadata,
  extractPDFMetadata,
} from '../../../src/features/citations/metadata-extractor.js';

function setHead(html) {
  document.head.innerHTML = html;
}

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('Highwire citation_* extraction', () => {
  test('auto-fills title, authors, journal, doi, volume/issue/pages and infers journal type', () => {
    setHead(`
      <meta name="citation_title" content="Attention Is All You Need">
      <meta name="citation_author" content="Vaswani, Ashish">
      <meta name="citation_author" content="Shazeer, Noam">
      <meta name="citation_journal_title" content="Advances in Neural Information Processing Systems">
      <meta name="citation_publication_date" content="2017/06/12">
      <meta name="citation_doi" content="10.5555/3295222.3295349">
      <meta name="citation_volume" content="30">
      <meta name="citation_issue" content="2">
      <meta name="citation_firstpage" content="5998">
      <meta name="citation_lastpage" content="6008">
    `);

    const merged = mergeMetadata(extractMetadata(document), 'https://example.org/paper');

    expect(merged.title).toBe('Attention Is All You Need');
    expect(merged.authors).toEqual(['Vaswani, Ashish', 'Shazeer, Noam']);
    expect(merged.siteName).toBe('Advances in Neural Information Processing Systems');
    expect(merged.doi).toBe('10.5555/3295222.3295349');
    expect(merged.publicationDate).toBe('2017-06-12'); // separators normalised
    // Volume, issue and pages live on `extra` because that is where the four styles read them.
    // They used to be written flat, which `createCitation` silently dropped.
    expect(merged.extra.volume).toBe('30');
    expect(merged.extra.issue).toBe('2');
    expect(merged.extra.pages).toBe('5998-6008');
    expect(merged.type).toBe('journal');
  });

  test('strips a doi.org prefix from citation_doi', () => {
    setHead(`
      <meta name="citation_title" content="X">
      <meta name="citation_doi" content="https://doi.org/10.1/abc">
    `);
    const merged = mergeMetadata(extractMetadata(document), 'https://e.org/x');
    expect(merged.doi).toBe('10.1/abc');
  });
});

describe('title fallback (never empty)', () => {
  test('uses an <h1> when there is no <title> or citation_title', () => {
    document.body.innerHTML = '<h1>  Heading As Title  </h1>';
    const merged = mergeMetadata(extractMetadata(document), 'https://host.test/a');
    expect(merged.title).toBe('Heading As Title');
  });

  test('falls back to the hostname when no title is available anywhere', () => {
    // No <title>, no <h1>, no meta — title must still be non-empty for validation.
    const merged = mergeMetadata(extractMetadata(document), 'https://news.example.com/story');
    expect(merged.title).toBe('news.example.com');
  });

  test('falls back to "Untitled page" when the URL cannot be parsed', () => {
    const merged = mergeMetadata(extractMetadata(document), 'not a url');
    expect(merged.title).toBe('Untitled page');
  });
});

describe('HTML entity decoding in merged text fields', () => {
  test("decodes numeric character references in a JSON-LD title (the &#x27; leak)", () => {
    const merged = mergeMetadata(
      { jsonLD: { headline: "Spain crash &#x27;devastating&#x27;" } },
      'https://news.example.com/x'
    );
    expect(merged.title).toBe("Spain crash 'devastating'");
  });

  test('decodes named references in authors and publisher', () => {
    const merged = mergeMetadata(
      {
        jsonLD: {
          headline: 'Tom &amp; Jerry',
          // Not "Smith &amp; Jones": a decoded "&" is an author separator, so this asserts the
          // decoding on a name that carries an entity of its own.
          author: 'Durkheim, &Eacute;mile',
          publisher: { name: 'Faber &amp; Faber' },
        },
      },
      'https://example.org/a'
    );
    expect(merged.title).toBe('Tom & Jerry');
    expect(merged.authors).toContain('Durkheim, Émile');
    expect(merged.publisher).toBe('Faber & Faber');
  });

  test('leaves a literal ampersand (not an entity) untouched', () => {
    const merged = mergeMetadata(
      { jsonLD: { headline: 'Marks & Spencer report' } },
      'https://example.org/b'
    );
    expect(merged.title).toBe('Marks & Spencer report');
  });

  test('leaves plain text with no entities unchanged (fast path)', () => {
    const merged = mergeMetadata(
      { jsonLD: { headline: 'A perfectly ordinary title' } },
      'https://example.org/c'
    );
    expect(merged.title).toBe('A perfectly ordinary title');
  });
});

describe('provenance', () => {
  test('records that a merged citation was read off the page', () => {
    const merged = mergeMetadata({ jsonLD: { headline: 'A paper' } }, 'https://example.org/d');
    expect(merged.extra.source).toBe('page');
  });

  test('records the same for a PDF, whose details come from its filename', () => {
    expect(extractPDFMetadata().extra.source).toBe('page');
  });
});

describe('type detection: video, social media and PDF', () => {
  const merge = (metadata, url) => mergeMetadata(metadata, url);

  test.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://vimeo.com/76979871'],
    ['https://www.tiktok.com/@tate/video/7231'],
  ])('a video host makes a video: %s', url => {
    expect(merge({}, url).type).toBe('video');
  });

  test.each([
    ['https://x.com/nasa/status/1'],
    ['https://twitter.com/nasa/status/1'],
    ['https://www.instagram.com/p/Cabc/'],
    ['https://www.facebook.com/nasa/posts/1'],
    ['https://www.threads.net/@nasa/post/1'],
    ['https://bsky.app/profile/nasa.bsky.social/post/1'],
    ['https://mastodon.social/@nasa/1'],
  ])('a social host makes a social media post: %s', url => {
    expect(merge({}, url).type).toBe('social_media');
  });

  test('og:type video.other on any host is a video', () => {
    expect(merge({ openGraph: { ogType: 'video.other' } }, 'https://films.example/a').type).toBe(
      'video'
    );
  });

  test('a JSON-LD VideoObject is a video', () => {
    expect(merge({ jsonLD: { '@type': 'VideoObject' } }, 'https://films.example/b').type).toBe(
      'video'
    );
  });

  test('a JSON-LD SocialMediaPosting is a social media post on an unknown host', () => {
    // Mastodon is federated: a self-hosted instance is not on any list, but it says what it is.
    expect(
      merge({ jsonLD: { '@type': 'SocialMediaPosting' } }, 'https://toot.example/@a/1').type
    ).toBe('social_media');
  });

  test('a .pdf URL is a PDF, query string and all', () => {
    expect(merge({}, 'https://repo.example/paper.pdf?download=1').type).toBe('pdf');
  });

  test('citation_pdf_url equal to the page URL means the page IS the PDF', () => {
    setHead(`
      <meta name="citation_title" content="A Report">
      <meta name="citation_pdf_url" content="https://repo.example/files/report">
    `);
    const merged = mergeMetadata(extractMetadata(document), 'https://repo.example/files/report');
    expect(merged.type).toBe('pdf');
  });

  test('a landing page whose citation_pdf_url points elsewhere is not a PDF', () => {
    setHead(`
      <meta name="citation_title" content="A Report">
      <meta name="citation_pdf_url" content="https://repo.example/files/report.pdf">
    `);
    const merged = mergeMetadata(extractMetadata(document), 'https://repo.example/record/42');
    expect(merged.type).toBe('website');
  });

  test('a journal article served as a PDF is still a journal article', () => {
    setHead(`
      <meta name="citation_title" content="A Paper">
      <meta name="citation_journal_title" content="Journal of Things">
    `);
    const merged = mergeMetadata(extractMetadata(document), 'https://journals.example/a.pdf');
    expect(merged.type).toBe('journal');
  });

  test('an ordinary page is still a website', () => {
    expect(merge({}, 'https://example.org/about').type).toBe('website');
  });
});

describe('author values that are not one person’s name', () => {
  const authorsFor = content => {
    setHead(`<meta name="author" content="${content}">`);
    return mergeMetadata(extractMetadata(document), 'https://example.org/a').authors;
  };

  test('a comma list of whole names becomes several authors', () => {
    expect(authorsFor('Jane Doe, John Smith')).toEqual(['Doe, Jane', 'Smith, John']);
  });

  test('a single name written family-first keeps its comma', () => {
    expect(authorsFor('Doe, Jane')).toEqual(['Doe, Jane']);
  });

  test('a family name with a particle and initials is one author, not two', () => {
    expect(authorsFor('van der Walt, Stéfan J.')).toEqual(['van der Walt, Stéfan J.']);
  });

  test('a scheme-less profile URL is not an author', () => {
    // No author found is stored as no author; "Anon." is never a name (STYLE-RULES.md).
    expect(authorsFor('www.theguardian.com/profile/jonathan-jones')).toEqual([]);
  });

  test('a bare hostname is not an author', () => {
    expect(authorsFor('theguardian.com')).toEqual([]);
  });

  test('a path is not an author', () => {
    expect(authorsFor('/profile/jonathan-jones')).toEqual([]);
  });

  test('an organisation whose name contains a comma list of whole names still splits', () => {
    expect(authorsFor('Jane Doe, Women and Equalities Unit')).toEqual([
      'Doe, Jane',
      'Women and Equalities Unit',
    ]);
  });
});

// ---------------------------------------------------------------------------
// COinS (span.Z3988) — only when it describes THIS page
// ---------------------------------------------------------------------------

/**
 * W5 finding: the Wikipedia "Dyslexia" article saved with the publisher and date of its FIRST
 * CITED REFERENCE, because every citation in a Wikipedia reference list carries its own
 * span.Z3988 and the extractor took the first one on the page. A page's own COinS is used only
 * when it says so (rft_id/rft.identifier pointing at this page) or when there is exactly one and
 * it sits outside the references.
 */
describe('COinS scoping', () => {
  const REFERENCE_COINS =
    'ctx_ver=Z39.88-2004&rft.title=Dyslexia+Information+Page&rft.pub=National+Institute+of+Neurological+Disorders+and+Stroke&rft.date=2018-11-02';

  test('COinS inside a reference list is ignored, even when it is the only one', () => {
    setHead('<link rel="canonical" href="https://en.wikipedia.org/wiki/Dyslexia">');
    document.body.innerHTML = `
      <h1>Dyslexia</h1>
      <ol class="references">
        <li><cite class="citation web">NINDS. <span title="${REFERENCE_COINS}" class="Z3988"></span></cite></li>
      </ol>
    `;
    const merged = mergeMetadata(
      extractMetadata(document, 'https://en.wikipedia.org/wiki/Dyslexia'),
      'https://en.wikipedia.org/wiki/Dyslexia'
    );
    expect(merged.publisher).toBe('');
    expect(merged.publicationDate).toBe('');
    expect(merged.title).not.toBe('Dyslexia Information Page');
  });

  test('the FIRST of many reference COinS spans is not treated as the article', () => {
    document.body.innerHTML = `
      <div class="reflist">
        <span title="${REFERENCE_COINS}" class="Z3988"></span>
        <span title="ctx_ver=Z39.88-2004&rft.title=Another+cited+work&rft.date=1999" class="Z3988"></span>
      </div>
    `;
    const merged = mergeMetadata(
      extractMetadata(document, 'https://en.wikipedia.org/wiki/Dyslexia'),
      'https://en.wikipedia.org/wiki/Dyslexia'
    );
    expect(merged.publisher).toBe('');
    expect(merged.publicationDate).toBe('');
  });

  test('a single record COinS outside any reference list still fills the record', () => {
    document.body.innerHTML = `
      <div class="record">
        <span title="ctx_ver=Z39.88-2004&rft.title=Teaching+reading+to+dyslexic+learners&rft.au=Nolan%2C+Fiona&rft.pub=NCAD+Press&rft.date=2019-04-01" class="Z3988"></span>
      </div>
    `;
    const merged = mergeMetadata(
      extractMetadata(document, 'https://repository.example/record/42'),
      'https://repository.example/record/42'
    );
    expect(merged.title).toBe('Teaching reading to dyslexic learners');
    expect(merged.publisher).toBe('NCAD Press');
    expect(merged.publicationDate).toBe('2019-04-01');
  });

  test('a COinS naming this page by rft_id wins even among reference COinS spans', () => {
    document.body.innerHTML = `
      <span title="ctx_ver=Z39.88-2004&rft_id=https%3A%2F%2Frepository.example%2Frecord%2F42&rft.title=The+record+itself&rft.pub=NCAD+Press" class="Z3988"></span>
      <ol class="references">
        <li><span title="${REFERENCE_COINS}" class="Z3988"></span></li>
      </ol>
    `;
    const merged = mergeMetadata(
      extractMetadata(document, 'https://repository.example/record/42'),
      'https://repository.example/record/42'
    );
    expect(merged.title).toBe('The record itself');
    expect(merged.publisher).toBe('NCAD Press');
  });

  test('a COinS whose DOI is this page is used', () => {
    document.body.innerHTML = `
      <span title="ctx_ver=Z39.88-2004&rft_id=info%3Adoi%2F10.1038%2Fs41586-020-2649-2&rft.title=Array+programming+with+NumPy&rft.date=2020-09-16" class="Z3988"></span>
      <ol class="references"><li><span title="${REFERENCE_COINS}" class="Z3988"></span></li></ol>
    `;
    const merged = mergeMetadata(
      extractMetadata(document, 'https://doi.org/10.1038/s41586-020-2649-2'),
      'https://doi.org/10.1038/s41586-020-2649-2'
    );
    expect(merged.title).toBe('Array programming with NumPy');
    expect(merged.publicationDate).toBe('2020-09-16');
  });

  test('a page with no COinS is unaffected', () => {
    document.body.innerHTML = '<p>Nothing to see</p>';
    expect(extractMetadata(document, 'https://x.example/p').coins).toBeNull();
  });
});

describe('organisation authors a page states', () => {
  test('a JSON-LD author typed as an Organization is marked, whatever its name', () => {
    setHead(`
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"NewsArticle","headline":"Rates rise",
         "author":{"@type":"Organization","name":"BBC News"},"datePublished":"2024-02-01"}
      </script>
    `);
    const merged = mergeMetadata(extractMetadata(document), 'https://www.bbc.co.uk/news/x');
    expect(merged.authors).toEqual(['BBC News']);
    expect(merged.extra.organisationAuthors).toEqual(['BBC News']);
  });

  test('a name the extractor already reads as an organisation is marked; a person is not', () => {
    setHead(`
      <meta name="author" content="World Health Organization; Jane Doe">
      <meta property="og:title" content="Report">
    `);
    const merged = mergeMetadata(extractMetadata(document), 'https://example.org/r');
    expect(merged.authors).toEqual(['World Health Organization', 'Doe, Jane']);
    expect(merged.extra.organisationAuthors).toEqual(['World Health Organization']);
  });

  test('a page naming only people carries no list', () => {
    setHead(`<meta name="author" content="Jane Doe">`);
    const merged = mergeMetadata(extractMetadata(document), 'https://example.org/p');
    expect(merged.extra.organisationAuthors).toBeUndefined();
  });
});
