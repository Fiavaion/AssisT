/**
 * Metadata Extractor for Citations
 *
 * Reads what a page already declares about itself, so a student does not retype it:
 * - Highwire Press / Google Scholar (citation_*) and PRISM (prism.*) scholarly tags
 * - OpenGraph (og:*, article:*)
 * - Dublin Core (DC.*, DCTERMS.*)
 * - JSON-LD (Schema.org structured data)
 * - COinS (ContextObjects in Spans)
 * - Standard HTML meta tags
 * - DOI detection
 *
 * Designed to run in Chrome extension content script context.
 */

import { splitAuthorList, organisationsAmong } from './author-names.js';

/**
 * Extract all available metadata from current page
 * @param {Document} doc - DOM document object (defaults to window.document)
 * @returns {ExtractedMetadata}
 */
export function extractMetadata(doc = document, url = pageUrlOf(doc)) {
  return {
    scholarly: extractScholarly(doc),
    openGraph: extractOpenGraph(doc),
    dublinCore: extractDublinCore(doc),
    jsonLD: extractJSONLD(doc),
    coins: extractCOinS(doc, url),
    html: extractHTMLMeta(doc),
    doi: extractDOI(doc),
  };
}

/**
 * The address of the document being read. A captured snapshot (highlight capture) carries its own
 * URL, which is why callers may pass one; otherwise the document says where it came from.
 * @param {Document} doc
 * @returns {string}
 */
function pageUrlOf(doc) {
  const fromDoc = doc && doc.defaultView && doc.defaultView.location;
  if (fromDoc && fromDoc.href) {
    return fromDoc.href;
  }
  return typeof window !== 'undefined' && window.location ? window.location.href : '';
}

/**
 * Index every `<meta name=...>` on the page by its lower-cased name.
 * Names are spelled inconsistently in the wild — Nature writes `dc.identifier`, the Stanford
 * Encyclopedia writes `DC.creator` — and CSS attribute selectors match those case-sensitively.
 * @param {Document} doc
 * @returns {Map<string, Array<string>>} name -> every content value, in document order
 */
function indexMetaNames(doc) {
  const index = new Map();
  for (const tag of doc.querySelectorAll('meta[name]')) {
    const name = tag.getAttribute('name').trim().toLowerCase();
    const content = tag.getAttribute('content')?.trim();
    if (!name || !content) {
      continue;
    }
    const values = index.get(name);
    if (values) {
      values.push(content);
    } else {
      index.set(name, [content]);
    }
  }
  return index;
}

/**
 * Extract the scholarly meta tags: Highwire Press / Google Scholar (`citation_*`) with PRISM
 * (`prism.*`) and Dublin Core as fallbacks. This is the dominant metadata standard for academic
 * sources — journals, arXiv, PubMed, institutional repositories — and it is the only place a page
 * states volume, issue and page range.
 * @param {Document} doc
 * @returns {Object|null}
 */
function extractScholarly(doc) {
  const meta = indexMetaNames(doc);
  const one = (...names) => {
    for (const name of names) {
      const value = meta.get(name)?.[0];
      if (value) {
        return value;
      }
    }
    return '';
  };

  const title = one('citation_title');
  const authors = meta.get('citation_author') || [];
  const journal = one(
    'citation_journal_title',
    'citation_conference_title',
    'prism.publicationname'
  );
  // Pages state the same date at different precisions — Nature gives citation_publication_date
  // "2020/09" and prism.publicationDate "2020-09-16" — and a bibliography wants the precise one.
  // Sources that AGREE with the preferred tag as far as it goes may sharpen it; a source that
  // disagrees is a different date (an online-first date, say) and is left alone.
  const date = mostPrecise(
    [
      'citation_publication_date',
      'dcterms.issued',
      'citation_date',
      'prism.publicationdate',
      'citation_online_date',
    ].map(name => toIsoDate(meta.get(name)?.[0] || ''))
  );
  const doi = cleanDOI(one('citation_doi', 'prism.doi', 'dc.identifier', 'dcterms.identifier'));
  const arxivId = one('citation_arxiv_id');
  const volume = one('citation_volume', 'prism.volume');
  const issue = one('citation_issue', 'prism.number');
  const firstpage = one('citation_firstpage', 'prism.startingpage');
  const lastpage = one('citation_lastpage', 'prism.endingpage');
  // A page that names its own address here IS the PDF; a landing page names the file beside it.
  const pdfUrl = one('citation_pdf_url');

  // Only return an object if at least one meaningful field was found.
  if (
    !title &&
    authors.length === 0 &&
    !journal &&
    !doi &&
    !date &&
    !arxivId &&
    !volume &&
    !pdfUrl
  ) {
    return null;
  }

  let pages = '';
  if (firstpage) {
    pages = lastpage ? `${firstpage}-${lastpage}` : firstpage;
  }

  return {
    title,
    authors,
    journal,
    date,
    doi,
    arxivId,
    publisher: one('citation_publisher', 'dc.publisher', 'dcterms.publisher'),
    volume,
    issue,
    pages,
    isbn: one('citation_isbn', 'prism.isbn'),
    issn: one('citation_issn', 'prism.issn'),
    pdfUrl,
  };
}

/**
 * Reduce a stated identifier to a bare DOI, or '' when it is not one. `dc.identifier` carries
 * anything from `doi:10.1038/...` to a URN, so the 10.x shape is the gate.
 * @param {string} value
 * @returns {string}
 */
function cleanDOI(value) {
  if (!value) {
    return '';
  }
  const doi = value
    .trim()
    .replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '')
    .replace(/^(info:)?doi[:/]/i, '');
  return /^10\.\d+\//.test(doi) ? doi : '';
}

/**
 * Extract OpenGraph metadata
 * @param {Document} doc
 * @returns {Object|null}
 */
function extractOpenGraph(doc) {
  const ogTags = doc.querySelectorAll('meta[property^="og:"], meta[property^="article:"]');
  if (ogTags.length === 0) {
    return null;
  }

  const og = {};
  ogTags.forEach(tag => {
    const property = tag.getAttribute('property');
    const content = tag.getAttribute('content');
    if (property && content) {
      // Convert property to camelCase: og:title -> ogTitle
      const key = property
        .replace(/:/g, '_')
        .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      og[key] = content;
    }
  });

  return Object.keys(og).length > 0 ? og : null;
}

/**
 * Extract Dublin Core metadata
 * @param {Document} doc
 * @returns {Object|null}
 */
function extractDublinCore(doc) {
  const dcTags = doc.querySelectorAll('meta[name^="DC."], meta[name^="dc."]');
  if (dcTags.length === 0) {
    return null;
  }

  const dc = {};
  dcTags.forEach(tag => {
    const name = tag.getAttribute('name');
    const content = tag.getAttribute('content');
    if (name && content) {
      // Convert name to camelCase: DC.title -> dcTitle
      const key = name
        .replace(/^DC\./i, 'dc')
        .replace(/\.([a-z])/g, (_, letter) => letter.toUpperCase());
      dc[key] = content;
    }
  });

  return Object.keys(dc).length > 0 ? dc : null;
}

/**
 * Schema.org types worth citing, scored by how likely the node is to BE the record rather than
 * the page around it. A page routinely ships several nodes — Nature wraps a ScholarlyArticle in a
 * WebPage, the Guardian lists a NewsArticle beside a WebPage — and picking the wrong one loses the
 * author list.
 */
const JSONLD_TYPE_SCORES = {
  scholarlyarticle: 5,
  newsarticle: 5,
  report: 5,
  article: 4,
  blogposting: 4,
  book: 4,
  techarticle: 4,
  videoobject: 5,
  socialmediaposting: 5,
  webpage: 2,
  faqpage: 2,
};

/**
 * Extract the best JSON-LD node on the page.
 * @param {Document} doc
 * @returns {Object|null}
 */
function extractJSONLD(doc) {
  const nodes = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      collectJSONLDNodes(JSON.parse(script.textContent), nodes);
    } catch (error) {
      console.warn('[Citation] JSON-LD parsing error:', error);
    }
  }

  if (nodes.length === 0) {
    return null;
  }
  return nodes.reduce((best, node) =>
    scoreJSONLDNode(node) > scoreJSONLDNode(best) ? node : best
  );
}

/**
 * Flatten a parsed JSON-LD value into every typed node it contains.
 * @param {*} data
 * @param {Array<Object>} out - collected nodes (mutated)
 */
function collectJSONLDNodes(data, out) {
  if (Array.isArray(data)) {
    data.forEach(item => collectJSONLDNodes(item, out));
    return;
  }
  if (!data || typeof data !== 'object') {
    return;
  }
  if (data['@type']) {
    out.push(data);
  }
  if (Array.isArray(data['@graph'])) {
    data['@graph'].forEach(item => collectJSONLDNodes(item, out));
  }
  // A wrapper page often carries the real record in mainEntity (Nature). When mainEntity is a list
  // it is page furniture — GOV.UK's FAQ questions — and the wrapper itself is the record.
  if (data.mainEntity && !Array.isArray(data.mainEntity)) {
    collectJSONLDNodes(data.mainEntity, out);
  }
}

/**
 * @param {Object} node
 * @returns {number}
 */
function scoreJSONLDNode(node) {
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  let score = Math.max(...types.map(type => JSONLD_TYPE_SCORES[String(type).toLowerCase()] || 0));
  for (const key of ['headline', 'name', 'author', 'datePublished', 'publisher']) {
    if (node[key]) {
      score += 1;
    }
  }
  return score;
}

/**
 * Containers whose COinS describes a work the page CITES, not the page itself. Wikipedia wraps
 * every reference in <cite class="citation"> inside <ol class="references">, and each one carries
 * its own span.Z3988 — which is how the Dyslexia article came to be saved with the publisher and
 * date of the first source in its reference list.
 */
const COINS_REFERENCE_CONTAINERS = [
  'cite',
  '.references',
  'ol.references',
  '.reflist',
  '#references',
  '.mw-references-wrap',
  '.bibliography',
  '.citation',
  '[role="doc-bibliography"]',
  '[role="doc-endnotes"]',
  '[role="doc-biblioentry"]',
].join(', ');

/**
 * Does this COinS span say it describes the page being read? A record page states its own address
 * or DOI in rft_id (or rft.identifier); a cited reference states someone else's.
 * @param {URLSearchParams} params - the span's parsed title
 * @param {Array<string>} pageAddresses - this page's URL and canonical URL
 * @returns {boolean}
 */
function coinsNamesPage(params, pageAddresses) {
  const ids = [...params.getAll('rft_id'), ...params.getAll('rft.identifier')].filter(Boolean);
  for (const raw of ids) {
    const id = String(raw).trim();
    const doi = id.replace(/^info:doi\//i, '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    for (const address of pageAddresses) {
      if (sameResource(id, address)) {
        return true;
      }
      if (/^10\.\d{4,9}\//.test(doi) && address.toLowerCase().includes(doi.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Extract COinS (ContextObjects in Spans) metadata — the page's OWN, never a source it cites.
 *
 * A span is read only when it names this page (rft_id / rft.identifier matching the URL or the
 * canonical URL), or when the page carries exactly one span and that span sits outside any
 * reference list. Anything else is another work's metadata and is ignored: a reference's publisher
 * and date filed against the article a student is reading is a wrong citation they cannot see.
 *
 * @param {Document} doc
 * @param {string} [pageUrl] - the address of this page
 * @returns {Object|null}
 */
function extractCOinS(doc, pageUrl = '') {
  const spans = Array.from(doc.querySelectorAll('span.Z3988')).filter(span =>
    span.getAttribute('title')
  );
  if (spans.length === 0) {
    return null;
  }

  const canonical = doc.querySelector('link[rel="canonical"]');
  const ogUrl = doc.querySelector('meta[property="og:url"]');
  const pageAddresses = [
    pageUrl,
    canonical ? canonical.href : '',
    ogUrl ? ogUrl.getAttribute('content') : '',
  ].filter(Boolean);

  const parsed = spans.map(span => ({
    span,
    params: new URLSearchParams(span.getAttribute('title')),
  }));
  const named = parsed.find(entry => coinsNamesPage(entry.params, pageAddresses));
  const lone =
    parsed.length === 1 && !parsed[0].span.closest(COINS_REFERENCE_CONTAINERS) ? parsed[0] : null;
  const chosen = named || lone;
  if (!chosen) {
    return null;
  }

  const coins = {};
  const params = chosen.params;

  // Map COinS fields to our format
  coins.title = params.get('rft.title') || params.get('rft.atitle');
  coins.author = params.get('rft.au') || params.get('rft.aulast');
  coins.date = params.get('rft.date');
  coins.publisher = params.get('rft.pub');
  coins.isbn = params.get('rft.isbn');
  coins.issn = params.get('rft.issn');
  coins.doi = params.get('rft_id')?.replace('info:doi/', '');

  return Object.values(coins).some(v => v) ? coins : null;
}

/**
 * Extract standard HTML meta tags
 * @param {Document} doc
 * @returns {Object}
 */
function extractHTMLMeta(doc) {
  const html = {
    title:
      doc.title ||
      doc.querySelector('title')?.textContent?.trim() ||
      doc.querySelector('h1')?.textContent?.trim() ||
      '',
    description: doc.querySelector('meta[name="description"]')?.content || '',
    author: doc.querySelector('meta[name="author"]')?.content || microdataAuthor(doc),
    keywords: doc.querySelector('meta[name="keywords"]')?.content || '',
    canonical: doc.querySelector('link[rel="canonical"]')?.href || window.location.href,
  };

  return html;
}

/**
 * The author a page states as Schema.org microdata instead of a meta tag. YouTube names the
 * channel only there, and as a `<link itemprop="name" content="...">` rather than as text.
 * @param {Document} doc
 * @returns {string}
 */
function microdataAuthor(doc) {
  const name = doc.querySelector('[itemprop="author"] [itemprop="name"]');
  if (!name) {
    return '';
  }
  return (name.getAttribute('content') || name.textContent || '').trim();
}

/**
 * Find a DOI printed in the page itself, for pages that declare none in their meta tags.
 * (The meta tags are read by `extractScholarly`.)
 * @param {Document} doc
 * @returns {string|null}
 */
function extractDOI(doc) {
  // Scan only the first slice of the body — a canonical DOI appears near the top, and scanning a
  // whole long article risks matching a false DOI mid-text before the real one.
  const doiRegex = /10\.\d{4,9}\/[-._;()\/:A-Z0-9]+/gi;
  const bodyText = (doc.body?.textContent || '').slice(0, 10000);
  const doiMatch = bodyText.match(doiRegex);
  if (doiMatch) {
    return doiMatch[0];
  }

  const urlMatch = window.location.href.match(doiRegex);
  if (urlMatch) {
    return urlMatch[0];
  }

  return null;
}

/**
 * Merge all extracted metadata into a unified citation object.
 * @param {ExtractedMetadata} metadata
 * @param {string} url - Current page URL
 * @returns {Partial<CitationMetadata>}
 */
export function mergeMetadata(metadata, url = window.location.href) {
  const sc = metadata.scholarly || {};
  const og = metadata.openGraph || {};
  const dc = metadata.dublinCore || {};
  const ld = metadata.jsonLD || {};
  const coins = metadata.coins || {};
  const html = metadata.html || {};

  const citation = {
    url,
    title: '',
    authors: [],
    publicationDate: '',
    publisher: '',
    siteName: '',
    // arXiv mints a DOI for every preprint but only prints the bare identifier.
    doi: sc.doi || metadata.doi || (sc.arxivId ? `10.48550/arXiv.${sc.arxivId}` : ''),
    // Provenance: read off the page, so it is a good guess and no more. The wizard says as much,
    // and a later CrossRef lookup adds `extra.verified` alongside this.
    extra: { source: 'page' },
  };

  // Title. A JSON-LD `name` is the thing's own name and beats og:title, whose site suffix would
  // have to be deleted by hand ("Bauhaus - Wikipedia"); a `headline` is only a last resort,
  // because Wikipedia puts a one-line description there.
  citation.title =
    sc.title ||
    text(ld.name) ||
    og.ogTitle ||
    text(ld.headline) ||
    dc.dcTitle ||
    coins.title ||
    html.title ||
    '';

  // Guarantee a non-empty title so a save never fails validation. Fall back to the page
  // hostname, then a generic placeholder the user can edit.
  if (!citation.title) {
    citation.title = safeHostname(url) || 'Untitled page';
  }

  citation.authors = pickAuthors([
    sc.authors,
    ld.author,
    ld.creator,
    og.articleAuthor || og.ogArticleAuthor,
    dc.dcCreator,
    coins.author,
    html.author,
  ]);
  // Which of those names are organisations: the ones the page itself types as one in JSON-LD, and
  // the ones the author parser already kept in reading order because they read as one. The styles
  // print these whole; the wizard shows them ticked, for the student to untick.
  const declared = new Set(
    [ld.author, ld.creator].flatMap(organisationNodes).flatMap(organisationName)
  );
  const organisations = citation.authors.filter(
    name => declared.has(name) || organisationsAmong([name]).length > 0
  );
  if (organisations.length > 0) {
    citation.extra.organisationAuthors = organisations;
  }

  // Publication, never modification: a page that was edited this morning was not published today.
  citation.publicationDate = toIsoDate(
    sc.date ||
      og.articlePublishedTime ||
      og.ogArticlePublishedTime ||
      text(ld.datePublished) ||
      text(ld.uploadDate) ||
      dc.dcDate ||
      coins.date ||
      ''
  );

  citation.publisher = decodeEntities(
    sc.publisher || text(ld.publisher?.name) || dc.dcPublisher || coins.publisher || ''
  );

  // Container name: the journal for an article, the site otherwise. A hostname is the last resort,
  // because "plato.stanford.edu" is not what a bibliography prints.
  citation.siteName = capitaliseLeadingThe(
    decodeEntities(
      sc.journal ||
        (sc.arxivId ? 'arXiv' : '') ||
        og.ogSiteName ||
        sc.publisher ||
        dc.dcPublisher ||
        siteNameFromTitle(html.title, citation.title) ||
        text(ld.publisher?.name) ||
        safeHostname(url)
    )
  );

  // Journal article fields. These live on `extra` because that is where the four styles read them.
  if (sc.volume) {
    citation.extra.volume = sc.volume;
  }
  if (sc.issue) {
    citation.extra.issue = sc.issue;
  }
  if (sc.pages) {
    citation.extra.pages = sc.pages;
  }
  if (sc.isbn) {
    citation.isbn = sc.isbn;
  }
  if (sc.issn) {
    citation.issn = sc.issn;
  }

  citation.type = detectType(sc, ld, og, url);

  // Decode HTML character references in the human-readable text fields. Some sources — notably
  // JSON-LD, whose <script> text is NOT HTML-decoded by the parser — deliver entity-encoded values,
  // so without this a raw "&#x27;" leaks into a title. URL and date are left untouched.
  citation.title = decodeEntities(citation.title);
  // authors are decoded at parse time below (entity ';' must not be read as a separator).

  return citation;
}

/** Hosts that serve video, matched on the host itself or any subdomain of it. */
const VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'tiktok.com'];

/**
 * Hosts that serve social media posts. Mastodon is federated, so only its largest instances can be
 * named here; every other instance is caught by the `SocialMediaPosting` it declares in JSON-LD.
 */
const SOCIAL_HOSTS = [
  'twitter.com',
  'x.com',
  'instagram.com',
  'facebook.com',
  'threads.net',
  'threads.com',
  'bsky.app',
  'mastodon.social',
  'mastodon.online',
];

/**
 * Which of the citation types this page declares itself to be. Art and design students cite videos
 * and social posts constantly, and neither declares itself in scholarly meta tags — the host, the
 * `og:type` and the Schema.org type are all such a page gives.
 * @param {Object} sc - scholarly tags
 * @param {Object} ld - JSON-LD node
 * @param {Object} og - OpenGraph tags
 * @param {string} url - the page's own address
 * @returns {string} a CitationType value
 */
function detectType(sc, ld, og, url) {
  // A journal article is a journal article wherever it is hosted, PDF or not.
  if (sc.journal) {
    return 'journal';
  }
  const types = (Array.isArray(ld['@type']) ? ld['@type'] : [ld['@type']]).map(type =>
    String(type).toLowerCase()
  );
  if (isPDFPage(sc, url)) {
    return 'pdf';
  }
  if (
    types.includes('videoobject') ||
    String(og.ogType || '').startsWith('video.') ||
    matchesHost(url, VIDEO_HOSTS)
  ) {
    return 'video';
  }
  if (types.includes('socialmediaposting') || matchesHost(url, SOCIAL_HOSTS)) {
    return 'social_media';
  }
  if (types.includes('newsarticle')) {
    return 'newspaper';
  }
  // Sites that mark every page `og:type=article` still say who they are in JSON-LD.
  if (og.ogType === 'article' && ld.publisher?.['@type'] === 'NewsMediaOrganization') {
    return 'newspaper';
  }
  return 'website';
}

/**
 * Is the page itself a PDF? Either its address points at one — read from the path, so a
 * `?download=1` does not hide it — or the page declares its own address as `citation_pdf_url`.
 * @param {Object} sc - scholarly tags
 * @param {string} url
 * @returns {boolean}
 */
function isPDFPage(sc, url) {
  try {
    if (/\.pdf$/i.test(new URL(url).pathname)) {
      return true;
    }
  } catch {
    return false;
  }
  return Boolean(sc.pdfUrl) && sameResource(sc.pdfUrl, url);
}

/**
 * Do two addresses name the same resource? Compared without the fragment, which never changes
 * which document was fetched.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function sameResource(a, b) {
  try {
    const one = new URL(a);
    const two = new URL(b);
    return one.origin === two.origin && one.pathname === two.pathname && one.search === two.search;
  } catch {
    return false;
  }
}

/**
 * Is this URL on one of these hosts, or on a subdomain of one? (`m.youtube.com` is YouTube.)
 * @param {string} url
 * @param {Array<string>} hosts
 * @returns {boolean}
 */
function matchesHost(url, hosts) {
  const host = safeHostname(url).toLowerCase();
  return hosts.some(known => host === known || host.endsWith(`.${known}`));
}

/**
 * First author list that yields a real name, canonicalised to "Family, Given".
 * @param {Array<*>} sources - candidate values, best first
 * @returns {Array<string>}
 */
function pickAuthors(sources) {
  for (const source of sources) {
    const names = toAuthorNames(source);
    if (names.length > 0) {
      return names;
    }
  }
  return [];
}

/**
 * The Schema.org author nodes that are organisations (Organization, NewsMediaOrganization,
 * EducationalOrganization, Corporation, …) rather than people.
 * @param {*} value - a JSON-LD author or creator: a node, a list, or a plain name
 * @returns {Array<Object>}
 */
function organisationNodes(value) {
  if (Array.isArray(value)) {
    return value.flatMap(organisationNodes);
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  const types = Array.isArray(value['@type']) ? value['@type'] : [value['@type']];
  return types.some(type => /organi[sz]ation$|corporation$/i.test(String(type || '')))
    ? [value]
    : [];
}

/**
 * An organisation node's name, whole, or nothing when it has none.
 * @param {Object} node
 * @returns {Array<string>}
 */
function organisationName(node) {
  const name = typeof node.name === 'string' ? decodeEntities(node.name).trim() : '';
  return name ? [name] : [];
}

/**
 * Turn whatever a page offers as an author — a string, a list, a Schema.org Person, a profile
 * URL — into canonical names, discarding what is not a name at all.
 * @param {*} value
 * @returns {Array<string>}
 */
function toAuthorNames(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(toAuthorNames);
  }
  if (typeof value === 'object') {
    // An organisation's name is one name in reading order: "BBC News", never "News, BBC".
    if (organisationNodes(value).length > 0) {
      return organisationName(value);
    }
    return toAuthorNames(value.name);
  }
  if (typeof value !== 'string') {
    return [];
  }
  // Decode BEFORE splitting — an entity like &amp; contains a ';' that would otherwise be
  // mistaken for an author separator.
  const name = decodeEntities(value).trim();
  // `article:author` is routinely a link to the writer's profile page, not their name — written
  // with a scheme, without one ("www.theguardian.com/profile/..."), or as a bare path.
  if (!name || ADDRESS_LIKE.test(name)) {
    return [];
  }
  return splitNameList(name).flatMap(splitAuthorList);
}

/**
 * An address rather than a name: anything containing a slash, or a dot-delimited hostname. Names
 * survive it — initials leave no segment of two or more letters after a dot ("Smith, J.R.").
 */
const ADDRESS_LIKE = /\/|(^|\s)[\w-]+(\.[\w-]+)*\.[a-z]{2,}(\s|$)/i;

/**
 * A comma-separated list of whole names — `<meta name="author" content="Jane Doe, John Smith">` —
 * split into its parts. That same comma also separates ONE name written family-first
 * ("van der Walt, Stéfan J."), so a list is recognised only when every part is a whole name: two
 * or more words, none of them an initial. Splitting on ";" and "&" is `splitAuthorList`'s job.
 * @param {string} name
 * @returns {Array<string>} the parts of a list, or the name unchanged
 */
function splitNameList(name) {
  if (!name.includes(',')) {
    return [name];
  }
  const parts = name
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  return parts.length > 1 && parts.every(isWholeName) ? parts : [name];
}

/**
 * Two or more words, none of them an initial: "Jane Doe" and "Women and Equalities Unit", but
 * neither half of a family-first name — "Doe" or "Stéfan J.".
 * @param {string} part
 * @returns {boolean}
 */
function isWholeName(part) {
  const words = part.split(/\s+/);
  return words.length > 1 && !words.some(word => /^\p{L}\.?$/u.test(word));
}

/**
 * The site's own name as printed in the `<title>` suffix — "Bauhaus - Wikipedia",
 * "18th Century German Aesthetics (Stanford Encyclopedia of Philosophy)".
 * @param {string} pageTitle - the document title
 * @param {string} title - the citation title, so a suffix that merely repeats it is rejected
 * @returns {string}
 */
function siteNameFromTitle(pageTitle, title) {
  if (typeof pageTitle !== 'string') {
    return '';
  }
  const differs = candidate =>
    candidate &&
    candidate.toLowerCase() !==
      String(title || '')
        .trim()
        .toLowerCase();

  const parenthesised = pageTitle.match(/\(([^()]+)\)\s*$/);
  if (parenthesised) {
    const suffix = parenthesised[1].trim();
    if (differs(suffix)) {
      return suffix;
    }
  }

  const segments = pageTitle.split(/\s+[-|–—]\s+/);
  if (segments.length > 1) {
    const suffix = segments[segments.length - 1].trim();
    if (differs(suffix)) {
      return suffix;
    }
  }

  return '';
}

/**
 * "the Guardian" is how the Guardian writes its own og:site_name; a bibliography writes
 * "The Guardian".
 * @param {string} name
 * @returns {string}
 */
function capitaliseLeadingThe(name) {
  return typeof name === 'string' ? name.replace(/^the\s/, 'The ') : name;
}

/** Month names as they appear in PubMed-style dates. */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Normalise a stated date to an ISO date string, keeping only the precision the page gave:
 * "2020 Sep 16" and "2020/09/16" both become "2020-09-16", "2020/09" becomes "2020-09", and an ISO
 * datetime keeps its date part. Anything unrecognised is returned as written rather than guessed at.
 * @param {string} value
 * @returns {string}
 */
function toIsoDate(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const raw = value.trim();
  if (!raw) {
    return '';
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
  if (iso) {
    return joinDate(iso[1], iso[2], iso[3]);
  }

  const slashed = raw.match(/^(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?$/);
  if (slashed) {
    return joinDate(slashed[1], slashed[2], slashed[3]);
  }

  // A month name pins the format regardless of field order: "2020 Sep 16", "16 September 2020",
  // "Sep 16, 2020".
  const named = raw.match(/[A-Za-z]{3,}/);
  const month = named ? MONTHS.indexOf(named[0].slice(0, 3).toLowerCase()) : -1;
  if (month >= 0) {
    const year = raw.match(/\b(\d{4})\b/);
    const day = raw.replace(/\b\d{4}\b/, '').match(/\b(\d{1,2})\b/);
    if (year) {
      return joinDate(year[1], String(month + 1), day?.[1]);
    }
  }

  const year = raw.match(/^(\d{4})$/);
  return year ? year[1] : raw;
}

/**
 * The most precise of several ISO dates that state the same date: the first (most trusted) value,
 * sharpened by any later one that extends it exactly — "2020-09" by "2020-09-16".
 * @param {Array<string>} dates - ISO dates, most trusted first
 * @returns {string}
 */
function mostPrecise(dates) {
  const stated = dates.filter(Boolean);
  return stated.reduce(
    (best, date) => (date.length > best.length && date.startsWith(best) ? date : best),
    stated[0] || ''
  );
}

/**
 * @param {string} year
 * @param {string} month
 * @param {string} [day]
 * @returns {string}
 */
function joinDate(year, month, day) {
  const parts = [year, month.padStart(2, '0')];
  if (day) {
    parts.push(day.padStart(2, '0'));
  }
  return parts.join('-');
}

/**
 * A value only if it is a plain string — JSON-LD fields are routinely objects or arrays.
 * @param {*} value
 * @returns {string}
 */
function text(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * Decode HTML character references (e.g. `&#x27;` `&amp;` `&quot;`) in a text value.
 *
 * Safe by construction: a <textarea>'s content model is RCDATA, so setting its innerHTML parses only
 * character references (and `</textarea>`) — no markup or script is created or executed — and we read
 * back the decoded text via `.value`. The element is never inserted into the document. A fast path
 * skips values with no `&`, and it degrades to a no-op where there is no document (e.g. tests/SW).
 * @param {string} value
 * @returns {string}
 */
function decodeEntities(value) {
  if (typeof value !== 'string' || value.indexOf('&') === -1) {
    return value;
  }
  if (typeof document === 'undefined') {
    return value;
  }
  const el = document.createElement('textarea');
  el.innerHTML = value;
  return el.value;
}

/**
 * Hostname for a URL, or '' if it cannot be parsed.
 * @param {string} url
 * @returns {string}
 */
function safeHostname(url) {
  try {
    return new URL(url).hostname || '';
  } catch {
    return '';
  }
}

/**
 * Check if current page is a PDF
 * @returns {boolean}
 */
export function isPDF() {
  return (
    window.location.href.endsWith('.pdf') ||
    document.contentType === 'application/pdf' ||
    document.querySelector('embed[type="application/pdf"]') !== null
  );
}

/**
 * Extract metadata from PDF page
 * For PDF.js viewer or Chrome's built-in PDF viewer
 * @returns {Partial<CitationMetadata>}
 */
export function extractPDFMetadata() {
  const url = window.location.href;
  const filename = url.split('/').pop().split('#')[0];
  const title = filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');

  return {
    url,
    title,
    authors: [],
    publicationDate: '',
    publisher: '',
    siteName: 'PDF Document',
    extra: { source: 'page' },
  };
}

export default {
  extractMetadata,
  mergeMetadata,
  isPDF,
  extractPDFMetadata,
};
