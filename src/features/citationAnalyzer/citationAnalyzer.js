/**
 * Citation Analyzer Feature
 *
 * Uses AI to analyze sources and citations for quality, bias, and credibility.
 * Integrates with the highlight menu for quick analysis of selected text/links.
 *
 * Features:
 * - AI-powered source credibility assessment
 * - Bias detection and indicators
 * - Key claims extraction
 * - Source type classification
 * - A quick-look band worked out from the signs found, never a numeric score
 * - Graceful fallback when LLM unavailable
 *
 * Architecture:
 * - Self-contained module following Feature Isolation Pattern
 * - Uses service worker bridge for LLM communication
 * - Registers to window.assistFeatures for integration
 *
 * @module features/citationAnalyzer
 */

import { showToast } from '../../core/ui/toast.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { getAIBadgeInfo, renderAIBadge, injectAIBadgeStyles } from '../../utils/ai-badge.js';
import {
  getAIMode,
  checkAIAvailable,
  generateWithAI,
  getSuccessStatusMessage,
  getFailureMessage,
  setAIStatusBar,
  missingKeyMessage,
} from '../shared/ai-feature-client.js';
import { debugLog } from '../../utils/debug-log.js';
import { trapFocus } from '../../utils/focus-trap.js';
import { returnFocusAfterDialog, selectionContainer } from '../../utils/dialog-return-focus.js';
import { Z } from '../../utils/z-index.js';
import { requestThirdParty } from '../../utils/third-party-client.js';
import { createDeclinedNotice } from '../../utils/consent-panel.js';
import { createSavedUtterance } from '../../utils/speech-voice.js';

let citation_panel = null;
let citation_releaseFocus = null;
let citation_returnFocus = null;
let citation_requestId = 0;
let citation_isLoading = false;
let citation_currentText = '';
let citation_currentAnalysis = null;

const citation_settings = {
  enabled: true,
  showInHighlightMenu: true,
  includeRecommendations: true,
  autoDetectLinks: true,
  verifyOnline: false,
};

/**
 * Analyze citation/source using AI
 * @param {string} text - Text or URL to analyze
 * @param {Object} context - Additional context (url, title, etc.)
 * @param {import('../shared/ai-feature-client.js').AIMode} modeInfo - AI mode from getAIMode()
 * @returns {Promise<{analysis: Object}>} Analysis results
 */
async function citation_analyze(text, context = {}, modeInfo) {
  // Truncate input to avoid token overflow — tighter limit for local to leave room for JSON output
  const inputLimit = modeInfo.isLocal ? 800 : 1500;
  const truncatedText = text.length > inputLimit ? text.substring(0, inputLimit) + '...' : text;

  // Local mode: smaller token budget, JSON format hint, larger context window
  const maxTokens = modeInfo.isLocal ? 500 : 700;

  // Concise prompt — keep the JSON schema template brief to stay within token budget. No score is
  // asked for: the band is worked out from the signs listed, so the student can see why.
  const prompt = `Help a student judge whether this source is worth citing. Return ONLY valid JSON, no markdown, no explanation.

SOURCE: ${truncatedText}
${context.url ? `URL: ${context.url}` : ''}

JSON schema (fill in values):
{"sourceType":"academic|news|blog|social|government|organization|unknown","goodSigns":["s1"],"warningSigns":["w1"],"couldNotTell":["c1"],"biasIndicators":{"detected":false,"type":"none","severity":"none","explanation":"brief"},"keyClaims":["claim1"],"recommendations":"brief","summary":"brief"}

Rules: list only signs you can see in the source itself. Write each sign as a short, plain sentence a student can read. Do not give a score or a rating.
Output ONLY the JSON object, starting with { and ending with }.`;

  try {
    const aiResult = await generateWithAI(prompt, modeInfo, {
      maxTokens,
      temperature: 0.2,
      feature: 'citationAnalyzer',
      taskType: 'citationAnalyzer',
      ...(modeInfo.isLocal ? { format: 'json', num_ctx: 2048 } : {}),
    });

    if (aiResult && aiResult.text) {
      console.log('[CitationAnalyzer] LLM response received,', aiResult.text.length, 'characters');
      debugLog('[CitationAnalyzer] Raw LLM response:', aiResult.text);

      // Parse JSON response
      try {
        // Prefer the client-parsed object (populated when format:'json' is requested); otherwise
        // clean Markdown fences off the string and extract the JSON object.
        let parsed = aiResult.json || null;
        if (!parsed) {
          const cleanedResponse = aiResult.text
            .replace(/<think>[\s\S]*?<\/think>/g, '')
            .replace(/```json\s*/gi, '')
            .replace(/```\s*/g, '')
            .replace(/^\s*json\b\s*/i, '')
            .trim();

          const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const jsonStr = jsonMatch[0].replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
            parsed = JSON.parse(jsonStr);
          }
        }

        if (parsed) {
          console.log('[CitationAnalyzer] Parsed JSON:', parsed);

          if (
            parsed.sourceType ||
            Array.isArray(parsed.goodSigns) ||
            Array.isArray(parsed.warningSigns)
          ) {
            return { analysis: citation_fromAI(parsed) };
          }
        }
      } catch (parseError) {
        console.warn('[CitationAnalyzer] JSON parse error:', parseError.message);
        debugLog('[CitationAnalyzer] Failed to parse:', aiResult.text);
      }

      // If JSON parsing failed, use the heuristic fallback with the original text
      console.log('[CitationAnalyzer] Using heuristic fallback due to parse failure');
      const fallbackResult = citation_fallback(text, context, true);
      fallbackResult.aiAttempted = true;
      fallbackResult.rawResponse = aiResult.text;
      return { analysis: fallbackResult };
    }

    throw new Error('Analysis failed');
  } catch (error) {
    console.error('[CitationAnalyzer] Analysis failed:', error);
    throw error;
  }
}

const CITATION_DOI_REGEX = /\b(10\.\d{4,}\/[^\s"'<>&,;()\[\]{}]+)/i;

function citation_extractDOI(text) {
  const match = text.match(CITATION_DOI_REGEX);
  return match ? match[1] : null;
}

/**
 * Heuristically extract the article title from a citation string.
 * Handles APA, Harvard, MLA, Chicago, Vancouver, and IEEE styles.
 */
function citation_extractSearchTitle(text) {
  // Strip numbered list prefix: “1. “ or “[1] “ at start — require whitespace after dot
  // so bare DOIs starting with “10.” are not affected
  const stripped = text.replace(/^\s*(?:\[\d+\]|\d+\.\s+)/, '').trim();

  // Strategy 1 — quoted title (MLA “Title.”, IEEE “Title,”, Chicago “Title.”)
  // Matches straight and curly double quotes
  const quotedTitle = stripped.match(/[“”]((?:[^””]{10,}))[“”]/);
  if (quotedTitle) {
    return quotedTitle[1].trim().substring(0, 150);
  }

  // Strategy 2 — APA / Harvard / Chicago author-date: year in (YYYY) → title follows
  const apaMatch = stripped.match(/\(\d{4}[a-z]?\)[.,]?\s+/);
  if (apaMatch) {
    const afterYear = stripped.slice(apaMatch.index + apaMatch[0].length).trim();
    // Harvard uses single-quoted titles: (2006) 'Title here', Journal...
    const harvardQuoted = afterYear.match(/^['''](.{10,}?)[''']/);
    if (harvardQuoted) {
      return harvardQuoted[1].trim().substring(0, 150);
    }
    // APA/Chicago: title is first period-delimited segment, must start uppercase
    const title = afterYear.split(/\.\s+/)[0].trim();
    if (title.length > 10 && /^[A-ZÀ-ɏ]/.test(title)) {
      return title.substring(0, 150);
    }
  }

  // Strategy 3 — Chicago notes / Vancouver / Newspaper APA:
  // Scan up to 4 period-segments; skip author, date, journal abbreviation, and URL chunks
  const segments = stripped.split(/\.\s+/);
  for (let i = 1; i < Math.min(segments.length, 4); i++) {
    const candidate = segments[i].trim();
    // Accept as title if: long enough, starts with uppercase or quote, and doesn't look like
    // a date `(YYYY...)`, journal abbreviation, volume notation, or URL
    if (
      candidate.length > 10 &&
      /^[A-ZÀ-ɏ"'']/.test(candidate) &&
      !/^vol\b|^no\.\s|^pp\.\s|\d+\(\d+\)|^\d{4}$|^\(|^https?:/i.test(candidate)
    ) {
      return candidate.substring(0, 150);
    }
  }

  // Fallback — raw text, best Semantic Scholar can do
  return stripped.substring(0, 120);
}

/** True when the worker refused because the student has not allowed the service. */
function citation_isConsentRefusal(reply) {
  return reply.code === 'consent-declined' || reply.code === 'consent-unasked';
}

/**
 * Look a reference up on CrossRef by its DOI, then on Semantic Scholar by its title when CrossRef
 * has nothing. Both requests are made by the service worker, behind the student's answer for each
 * service (ADR 0006); only the DOI or a short title is sent, never the surrounding text.
 *
 * @param {string|null} doi
 * @param {string|null} searchText
 * @returns {Promise<{result: Object|null, declined: string|null}>} what was found; when nothing
 *   was, the first destination the student has not allowed (a host Chrome does not hold is asked
 *   about with the consent, ADR 0009, so it ends as an allow or a refusal too)
 */
async function citation_lookUpOnline(doi, searchText) {
  let declined = null;

  if (doi) {
    const reply = await requestThirdParty('citations', { doi }, { detail: doi });
    if (reply.success) {
      const work = reply.data.work;
      return {
        declined: null,
        result: {
          source: 'crossref',
          doi: work.DOI,
          title: work.title[0] || '',
          authors: work.author.map(a => `${a.given || ''} ${a.family || ''}`.trim()).join(', '),
          year: work.published?.['date-parts']?.[0]?.[0] ?? null,
          journal: work['container-title'][0] || '',
        },
      };
    }
    if (citation_isConsentRefusal(reply)) {
      declined = 'citations';
    }
  }

  if (searchText) {
    const reply = await requestThirdParty(
      'citationVerification',
      { title: searchText },
      { detail: searchText }
    );
    if (reply.success) {
      const paper = reply.data.paper;
      return {
        declined: null,
        result: {
          source: 'semanticscholar',
          doi: paper.doi,
          title: paper.title,
          authors: paper.authors.join(', '),
          year: paper.year,
          journal: paper.venue,
        },
      };
    }
    if (citation_isConsentRefusal(reply)) {
      declined = declined || 'citationVerification';
    }
  }

  return { result: null, declined };
}

/**
 * Verify the citation online via CrossRef (DOI) or Semantic Scholar (title search).
 * Fires after the panel is already rendered — appends a verification section.
 * Non-blocking: a failed lookup reads as "not found", and a refused one says so.
 */
async function citation_startVerification(text) {
  const contentArea = citation_panel?.querySelector('.assist-citation-content');
  if (!contentArea) {
    return;
  }

  // Insert loading slot at the bottom of the panel
  const slot = document.createElement('div');
  slot.id = 'citation-verify-slot';
  slot.className = 'assist-citation-section';
  slot.innerHTML =
    '<div class="assist-citation-section-title">' +
    '<span class="assist-citation-section-icon">🌐</span> Online Verification</div>' +
    '<div class="assist-citation-verify-body assist-citation-muted" style="font-size:12px;padding:4px 0;">' +
    'Checking CrossRef &amp; Semantic Scholar…</div>';
  contentArea.appendChild(slot);

  const doi = citation_extractDOI(text);
  const searchText = citation_extractSearchTitle(text);
  const { result, declined } = await citation_lookUpOnline(doi, searchText);

  const body = slot.querySelector('.assist-citation-verify-body');
  if (!body) {
    return;
  }

  if (!result && declined) {
    // Nothing was looked up because the student said "not now"; "not found" would be untrue.
    body.textContent = '';
    body.appendChild(
      createDeclinedNotice(declined, {
        onAllowed: () => {
          slot.remove();
          citation_startVerification(text);
        },
      })
    );
    return;
  }

  if (result) {
    const sourceName = result.source === 'crossref' ? 'CrossRef' : 'Semantic Scholar';
    const yearStr = result.year ? ` (${escapeHtml(String(result.year))})` : '';
    const journalStr = result.journal ? ` — ${escapeHtml(result.journal)}` : '';
    const doiLink = result.doi
      ? `<div class="assist-citation-muted" style="margin-top:4px;font-size:11px;">` +
        `DOI: <a href="https://doi.org/${escapeHtml(result.doi)}" target="_blank" ` +
        `rel="noopener noreferrer" class="assist-citation-verify-link">${escapeHtml(result.doi)}</a></div>`
      : '';
    const authorsStr = result.authors
      ? `<div class="assist-citation-muted" style="font-size:11px;margin-top:2px;">${escapeHtml(result.authors)}</div>`
      : '';
    body.innerHTML =
      `<div style="display:flex;align-items:flex-start;gap:6px;">` +
      `<span class="assist-citation-verify-found" style="font-size:14px;flex-shrink:0;">&#10003;</span>` +
      `<div><div class="assist-citation-verify-found" style="font-size:12px;font-weight:600;">Found on ${escapeHtml(sourceName)}</div>` +
      `<div style="font-size:11px;margin-top:2px;">${escapeHtml(result.title)}${yearStr}${journalStr}</div>` +
      `${authorsStr}${doiLink}</div></div>`;
  } else {
    body.innerHTML =
      `<div class="assist-citation-muted" style="display:flex;align-items:center;gap:6px;font-size:12px;">` +
      `<span>—</span><span>Not found in CrossRef or Semantic Scholar</span></div>`;
  }
}

/**
 * The quick-look bands. Each says what it is: a first look at clues in the text, not a verdict.
 * There is deliberately no number: a score counted from keywords looks far more precise than it is.
 */
const CITATION_BANDS = {
  reliable: {
    label: 'Looks reliable',
    reason: 'We found good signs and no warning signs.',
    icon: '✓',
  },
  check: {
    label: 'Check before you use it',
    reason: 'We found at least one warning sign.',
    icon: '!',
  },
  unclear: {
    label: 'Hard to tell',
    reason: 'We did not find enough clues to say either way.',
    icon: '?',
  },
};

const CITATION_CAVEAT =
  'This is a quick look at clues in the text, not a verdict. Read the source yourself before you rely on it.';

const CITATION_SOURCE_TYPE_NAMES = {
  academic: 'Academic',
  government: 'Government',
  organization: 'Organisation',
  news: 'News',
  blog: 'Blog',
  social: 'Social media',
};

/**
 * Work out the band from the evidence. Any warning sign means "check"; a strong sign backed by at
 * least one other good sign means "looks reliable"; anything less is "hard to tell".
 */
function citation_bandFor(goodCount, strongCount, warningCount) {
  if (warningCount > 0) {
    return 'check';
  }
  if (strongCount >= 1 && goodCount >= 2) {
    return 'reliable';
  }
  return 'unclear';
}

/** What this panel never checks, whichever path produced the result. */
function citation_alwaysNotChecked() {
  const items = [
    'Did not check whether it is peer reviewed',
    'Did not check whether what it says is true',
  ];
  if (!citation_settings.verifyOnline) {
    items.push('Did not look it up online to see that it exists');
  }
  return items;
}

/**
 * Shape the AI's answer into the same evidence the on-device check gives. The AI's signs are not
 * weighted, so each counts as strong and two with no warning sign read as "looks reliable". Any
 * score the model sends anyway is dropped.
 */
function citation_fromAI(parsed) {
  const list = value =>
    Array.isArray(value)
      ? value
          .filter(item => typeof item === 'string' && item.trim())
          .map(item => item.trim())
          .slice(0, 6)
      : [];
  const good = list(parsed.goodSigns);
  const warnings = list(parsed.warningSigns);
  const notChecked = [...new Set([...list(parsed.couldNotTell), ...citation_alwaysNotChecked()])];

  return {
    sourceType: typeof parsed.sourceType === 'string' ? parsed.sourceType : 'unknown',
    band: citation_bandFor(good.length, good.length, warnings.length),
    evidence: { good, warnings, notChecked },
    biasIndicators: parsed.biasIndicators || null,
    keyClaims: list(parsed.keyClaims),
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    recommendations: typeof parsed.recommendations === 'string' ? parsed.recommendations : '',
    isFallback: false,
  };
}

/**
 * Look at a source on this device, without AI, and list what was found and what was not checked.
 * @param {string} text - Text to analyze
 * @param {Object} context - Additional context
 * @param {boolean} aiAttempted - The AI was asked first and failed
 * @returns {Object} The band, the evidence behind it, and a recommendation
 */
function citation_fallback(text, context = {}, aiAttempted = false) {
  const lowerText = text.toLowerCase();
  const lowerUrl = (context.url || '').toLowerCase();

  // "press" and bare "journal" excluded — too ambiguous; reputable publishers list handles them
  const academicKeywords = [
    'university',
    'doi:',
    'vol.',
    'pp.',
    'et al',
    'proceedings',
    'peer-reviewed',
    'peer reviewed',
    'preprint',
    'arxiv',
    'pubmed',
    'pmid',
  ];
  const institutionalKeywords = [
    'museum',
    'gallery',
    'institute',
    'library',
    'archive',
    'foundation',
    'society',
    'association',
    'publications',
  ];
  // Whole words only: as substrings "times" matched "sometimes" and "post" matched "posture".
  const newsKeywords = [
    'newspaper',
    'times',
    'post',
    'herald',
    'tribune',
    'reuters',
    'associated press',
    'bbc news',
    'the guardian',
    'the independent',
  ];
  // "Retrieved from" and "accessed" mark any web reference, not a blog, so they are not here.
  const blogKeywords = ['blog', 'wordpress', 'medium.com', 'top 10', 'best of'];

  const hasDOI =
    CITATION_DOI_REGEX.test(text) || lowerText.includes('doi:') || lowerText.includes('doi.org');

  // Require 2+ academic indicators to avoid single-word false positives
  const academicHits = academicKeywords.filter(k => lowerText.includes(k));
  const hasAcademicIndicators =
    academicHits.length >= 2 || (academicHits.length === 1 && CITATION_DOI_REGEX.test(text));
  const hasInstitutionalIndicators = institutionalKeywords.some(k => lowerText.includes(k));
  const hasNewsIndicators = newsKeywords.some(k => new RegExp(`\\b${k}\\b`).test(lowerText));
  const hasBlogIndicators = blogKeywords.some(k => lowerText.includes(k));

  let sourceType = 'unknown';
  if (hasAcademicIndicators && !hasBlogIndicators) {
    sourceType = 'academic';
  } else if (hasInstitutionalIndicators && !hasBlogIndicators) {
    sourceType = 'organization';
  } else if (hasBlogIndicators) {
    sourceType = 'blog';
  } else if (hasNewsIndicators) {
    sourceType = 'news';
  } else if (lowerUrl.includes('.edu') || lowerUrl.includes('.ac.')) {
    sourceType = 'academic';
  } else if (lowerUrl.includes('.gov')) {
    sourceType = 'government';
  } else if (lowerUrl.includes('.org')) {
    sourceType = 'organization';
  } else if (
    lowerUrl.includes('blog') ||
    lowerUrl.includes('medium.com') ||
    lowerUrl.includes('wordpress')
  ) {
    sourceType = 'blog';
  } else if (
    lowerUrl.includes('twitter') ||
    lowerUrl.includes('facebook') ||
    lowerUrl.includes('instagram')
  ) {
    sourceType = 'social';
  }

  const good = [];
  const warnings = [];
  const notChecked = citation_alwaysNotChecked();
  let strong = 0;
  const addStrong = item => {
    good.push(item);
    strong += 1;
  };

  if (hasDOI) {
    addStrong('Has a DOI (a permanent ID for published research)');
  }
  if (sourceType === 'academic') {
    addStrong('Looks like academic writing, such as a journal or university');
  } else if (sourceType === 'government') {
    addStrong('Comes from a government website');
  } else if (sourceType === 'organization' && !hasInstitutionalIndicators) {
    good.push("Comes from an organisation's website");
  } else if (sourceType === 'news') {
    good.push('Looks like a news publication');
  } else if (sourceType === 'blog') {
    warnings.push("Looks like a blog, which may be one person's opinion");
  } else if (sourceType === 'social') {
    warnings.push('Looks like social media');
  } else if (sourceType === 'unknown') {
    notChecked.push('Could not tell what kind of source this is');
  }

  if (hasInstitutionalIndicators) {
    addStrong('Published by a museum, library, institute or society');
  }

  const reputablePublishers = [
    'mit press',
    'oxford',
    'cambridge',
    'springer',
    'wiley',
    'elsevier',
    'sage',
    'taylor & francis',
    'routledge',
    'penguin',
    'harper',
  ];
  if (reputablePublishers.some(p => lowerText.includes(p))) {
    addStrong('Names a well-known publisher');
  }

  if (lowerText.includes('peer-reviewed') || lowerText.includes('peer reviewed')) {
    addStrong('Says it is peer reviewed');
  }

  // Formal citation format across styles:
  // APA/Harvard: (YYYY) — Vancouver: YYYY; — MLA/Chicago: , YYYY, or . YYYY.
  const hasCitationFormat =
    text.length > 25 &&
    (/\(\d{4}[a-z]?\)/.test(text) || // APA/Harvard parenthetical year
      /\b(?:19|20)\d{2}[;,]/.test(text) || // Vancouver / MLA year + punctuation
      /\b(?:19|20)\d{2}\.(\s|$)/.test(text)); // Chicago / IEEE year + period
  if (hasCitationFormat) {
    good.push('Written as a formal reference');
  }

  if (lowerText.includes('references') || lowerText.includes('bibliography')) {
    good.push('Lists its references');
  }

  // "Surname, A." as in a reference list, "et al", or "by Name"
  if (/\b[A-Z][A-Za-z'’-]+,\s*[A-Z]\.|\bet al\b|\bby\s+[A-Z][a-z]+/.test(text)) {
    good.push('Names an author');
  } else {
    notChecked.push('Could not see an author');
  }

  if (
    lowerText.includes('expert') ||
    lowerText.includes('professor') ||
    lowerText.includes('dr.') ||
    lowerText.includes('ph.d')
  ) {
    good.push('Mentions an expert, such as a professor or doctor');
  }

  // Date — prefer parenthetical citation year over any year in prose. An old source is not a
  // warning sign (a classic study is still a good source), so its age is left for the student.
  const parenYearMatch = text.match(/\((\d{4})[a-z]?\)/);
  const anyYearMatch = text.match(/\b((?:19|20)\d{2})\b/);
  const yearStr = parenYearMatch ? parenYearMatch[1] : anyYearMatch ? anyYearMatch[1] : null;
  if (yearStr) {
    const age = new Date().getFullYear() - parseInt(yearStr, 10);
    if (age > 10) {
      notChecked.push(`Could not tell if a source from ${yearStr} is still up to date`);
    } else if (age <= 2) {
      good.push(`Published recently (${yearStr})`);
    } else {
      good.push(`Shows when it was published (${yearStr})`);
    }
  } else {
    notChecked.push('Could not see a publication date');
  }

  const biasWords = [
    'obviously',
    'clearly wrong',
    'everyone knows',
    'the truth is',
    'fake news',
    'mainstream media',
  ];
  if (biasWords.some(word => lowerText.includes(word))) {
    warnings.push('Uses loaded words, such as "obviously" or "everyone knows"');
  }
  const commercialWords = ['buy now', 'click here', 'limited time', 'special offer', 'subscribe'];
  if (commercialWords.some(word => lowerText.includes(word))) {
    warnings.push('Uses selling words, such as "buy now" or "special offer"');
  }

  return {
    sourceType,
    band: citation_bandFor(good.length, strong, warnings.length),
    evidence: { good, warnings, notChecked },
    keyClaims: [],
    summary: '',
    recommendations: aiAttempted
      ? 'AI returned an unexpected response — try again or switch to a different model in settings.'
      : 'For a closer look, turn on an AI model in AssisT settings.',
    isFallback: true,
  };
}

/**
 * Create the analysis panel UI
 * @returns {HTMLElement} Panel element
 */
async function citation_createPanel() {
  citation_injectStyles();

  const panel = document.createElement('div');
  panel.id = 'assist-citation-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'assist-citation-title');
  panel.setAttribute('tabindex', '-1');

  panel.innerHTML = sanitizeHTML(`
    <div class="assist-citation-header">
      <div class="assist-citation-title" id="assist-citation-title">
        <span class="assist-citation-icon">🔍</span>
        <span>Citation Analyzer</span>
      </div>
      <div class="assist-citation-controls">
        <button class="assist-citation-close" aria-label="Close" title="Close (Esc)">×</button>
      </div>
    </div>
    <div class="assist-citation-status" role="status"></div>
    <div class="assist-citation-announce" role="status"></div>
    <div class="assist-citation-content">
      <div class="assist-citation-placeholder">
        Select text or paste a URL to analyze...
      </div>
    </div>
    <div class="assist-citation-actions">
      <button class="assist-citation-btn" data-command="copy" data-action="copy" disabled>
        <span class="assist-citation-btn-icon">📋</span>
        Copy Report
      </button>
      <button class="assist-citation-btn" data-command="speak" disabled>
        <span class="assist-citation-btn-icon">🔊</span>
        Read Aloud
      </button>
      <button class="assist-citation-btn" data-command="reanalyze" disabled>
        <span class="assist-citation-btn-icon">🔄</span>
        Reanalyze
      </button>
    </div>
  `);

  // Event handlers
  attachAccessibleHandler(
    panel.querySelector('.assist-citation-close'),
    'Citation Analyzer Close Button',
    citation_hide
  );

  attachAccessibleHandler(
    panel.querySelector('[data-command="copy"]'),
    'Citation Analyzer Copy Button',
    citation_copy
  );
  attachAccessibleHandler(
    panel.querySelector('[data-command="speak"]'),
    'Citation Analyzer Speak Button',
    citation_speak
  );
  attachAccessibleHandler(
    panel.querySelector('[data-command="reanalyze"]'),
    'Citation Analyzer Reanalyze Button',
    async () => {
      if (citation_currentText) {
        citation_runAnalysis(citation_currentText, {});
      }
    }
  );

  // Make draggable
  citation_makeDraggable(panel);

  return panel;
}

/**
 * Inject CSS styles
 */
function citation_injectStyles() {
  if (document.getElementById('assist-citation-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'assist-citation-styles';
  style.textContent = `
    #assist-citation-panel {
      position: fixed;
      top: 100px;
      right: 20px;
      width: 420px;
      /* A 320px screen must not need sideways scrolling to read the panel (SC 1.4.10). 100% of a
         fixed box is the viewport without its scrollbar, which 100vw would include, and border-box
         keeps the panel's own padding and border inside the cap: 20px clear on each side. */
      box-sizing: border-box;
      max-width: calc(100% - 40px);
      max-height: 80vh;
      background: white;
      color: #333;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      z-index: ${Z.MODAL};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #e0e0e0;
    }

    .assist-citation-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%);
      color: white;
      cursor: move;
      user-select: none;
    }

    .assist-citation-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 15px;
    }

    .assist-citation-icon {
      font-size: 18px;
    }

    .assist-citation-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .assist-citation-close {
      width: 28px;
      height: 28px;
      border: none;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 50%;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .assist-citation-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .assist-citation-status {
      padding: 8px 16px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
      font-size: 12px;
      color: #666;
      display: none;
    }

    .assist-citation-status.visible {
      display: block;
    }

    .assist-citation-status.error {
      background: #fff3e0;
      color: #e65100;
    }

    .assist-citation-status.success {
      background: #e8f5e9;
      color: #2e7d32;
    }

    .assist-citation-status [data-assist-clickable]:hover {
      text-decoration: underline;
    }

    .assist-citation-status [data-assist-clickable]:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
      text-decoration: underline;
    }

    .assist-citation-content {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      line-height: 1.6;
      color: #333;
    }

    .assist-citation-placeholder {
      color: #999;
      font-style: italic;
      text-align: center;
      margin: 20px 0;
    }

    .assist-citation-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 20px;
      color: #666;
    }

    .assist-citation-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #e0e0e0;
      border-top-color: #2e7d32;
      border-radius: 50%;
      animation: assist-citation-spin 0.8s linear infinite;
    }

    @media (prefers-reduced-motion: reduce) {
      .assist-citation-spinner { animation: none; }
    }

    @keyframes assist-citation-spin {
      to { transform: rotate(360deg); }
    }

    /* The quick-look band. Its colour always comes with an icon and words (SC 1.4.1); each
       text colour reaches 4.5:1 on its theme's panel background. */
    .assist-citation-band {
      padding: 12px 14px;
      border: 1px solid currentColor;
      border-left-width: 6px;
      border-radius: 8px;
      margin-bottom: 8px;
    }

    .assist-citation-band-reliable {
      color: #1b5e20;
    }

    .assist-citation-band-check {
      color: #8a4b00;
    }

    .assist-citation-band-unclear {
      color: #37474f;
    }

    .assist-citation-band-title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font-size: 17px;
      font-weight: 700;
    }

    .assist-citation-band-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.6em;
      height: 1.6em;
      border: 2px solid currentColor;
      border-radius: 50%;
      font-size: 14px;
      flex-shrink: 0;
    }

    .assist-citation-band-reason,
    .assist-citation-band-type {
      margin: 4px 0 0 0;
      font-size: 13px;
    }

    .assist-citation-caveat {
      margin: 0 0 16px 0;
      font-size: 13px;
    }

    .assist-citation-evidence {
      list-style: none;
      padding-left: 0;
    }

    .assist-citation-evidence li {
      display: flex;
      gap: 8px;
    }

    .assist-citation-evidence-glyph {
      flex-shrink: 0;
      width: 1em;
      font-weight: 700;
      text-align: center;
    }

    /* Screen readers only: the whole result, announced once as one sentence. */
    .assist-citation-announce {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /* Sections */
    .assist-citation-section {
      margin-bottom: 16px;
    }

    .assist-citation-section-title {
      font-weight: 600;
      font-size: 13px;
      color: #333;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .assist-citation-section-icon {
      font-size: 14px;
    }

    /* Lists */
    .assist-citation-list {
      margin: 0;
      padding-left: 20px;
      font-size: 13px;
    }

    .assist-citation-list li {
      margin-bottom: 4px;
      color: #555;
    }

    /* Bias indicator */
    .assist-citation-bias {
      padding: 12px;
      border-radius: 6px;
      font-size: 13px;
      color: #333;
    }

    .assist-citation-bias.none {
      background: #e8f5e9;
      border: 1px solid #c8e6c9;
      color: #1b5e20;
    }

    .assist-citation-bias.mild {
      background: #fff3e0;
      border: 1px solid #ffe0b2;
      color: #e65100;
    }

    .assist-citation-bias.moderate {
      background: #ffebee;
      border: 1px solid #ffcdd2;
      color: #c62828;
    }

    .assist-citation-bias.strong {
      background: #f44336;
      color: white;
    }

    /* Summary box */
    .assist-citation-summary {
      padding: 12px;
      background: #e3f2fd;
      border-radius: 6px;
      font-size: 13px;
      color: #1565c0;
      border-left: 3px solid #2196f3;
    }

    /* Recommendations */
    .assist-citation-recommendations {
      padding: 12px;
      background: #f3e5f5;
      border-radius: 6px;
      font-size: 13px;
      color: #7b1fa2;
      border-left: 3px solid #9c27b0;
    }

    /* Model selector in actions bar */
    .assist-citation-model-selector {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: rgba(0, 0, 0, 0.05);
      border-radius: 4px;
      margin-right: auto;
    }

    .assist-citation-model-selector.hidden {
      display: none !important;
    }

    .assist-model-icon {
      font-size: 14px;
    }

    .assist-citation-model {
      padding: 4px 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 12px;
      font-family: inherit;
      background: white;
      cursor: pointer;
      min-width: 100px;
    }

    .assist-citation-model:focus {
      outline: none;
      border-color: #2e7d32;
      box-shadow: 0 0 0 2px rgba(46, 125, 50, 0.2);
    }

    /* Badges */
    .assist-citation-ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: linear-gradient(135deg, #2e7d32 0%, #1b5e20 100%);
      color: white;
      font-size: 10px;
      font-weight: 600;
      border-radius: 10px;
      margin-left: 8px;
    }

    .assist-citation-cloud-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
      color: white;
      font-size: 10px;
      font-weight: 600;
      border-radius: 10px;
      margin-left: 8px;
    }

    /* How this result was worked out: on this device without AI, or by AI. */
    .assist-citation-disclosure {
      margin: 0 0 8px 0;
      padding: 8px 10px;
      color: #333;
      border-left: 3px solid #ff9800;
      border-radius: 4px;
      font-size: 13px;
      line-height: 1.5;
    }

    /* Actions */
    .assist-citation-actions {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: #f8f9fa;
      border-top: 1px solid #e0e0e0;
    }

    .assist-citation-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      background: white;
      color: #333;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .assist-citation-btn:hover {
      background: #f0f0f0;
      border-color: #ccc;
    }

    .assist-citation-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .assist-citation-btn-icon {
      font-size: 14px;
    }

    /* Message colours live here, not inline, so the dark rules below can reach them. Each
       reaches 4.5:1 on its theme's panel background (white / #1e1e1e). */
    .assist-citation-message-title {
      color: #333;
    }

    .assist-citation-muted {
      color: #666;
    }

    .assist-citation-verify-found {
      color: #15803d;
    }

    .assist-citation-verify-link {
      color: #4f46e5;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      #assist-citation-panel {
        background: #1e1e1e;
        border-color: #333;
        color: #e0e0e0;
      }

      .assist-citation-content {
        color: #e0e0e0;
      }

      .assist-citation-status {
        background: #2d2d2d;
        border-color: #333;
        color: #aaa;
      }

      .assist-citation-band-reliable {
        color: #81c784;
      }

      .assist-citation-band-check {
        color: #ffb74d;
      }

      .assist-citation-band-unclear {
        color: #b0bec5;
      }

      .assist-citation-disclosure {
        color: #e0e0e0;
      }

      .assist-citation-section-title {
        color: #e0e0e0;
      }

      .assist-citation-message-title {
        color: #e0e0e0;
      }

      .assist-citation-muted {
        color: #b0b0b0;
      }

      .assist-citation-verify-found {
        color: #4ade80;
      }

      .assist-citation-verify-link {
        color: #a5b4fc;
      }

      .assist-citation-list li {
        color: #bbb;
      }

      .assist-citation-actions {
        background: #252525;
        border-color: #333;
      }

      .assist-citation-btn {
        background: #2d2d2d;
        border-color: #444;
        color: #e0e0e0;
      }

      .assist-citation-btn:hover {
        background: #3d3d3d;
      }

      .assist-citation-model-selector {
        background: rgba(255, 255, 255, 0.1);
      }

      .assist-citation-model {
        background: #2a2a2a;
        color: #e0e0e0;
        border-color: #444;
      }

      .assist-citation-model:focus {
        border-color: #4caf50;
        box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.3);
      }
    }
  `;

  document.head.appendChild(style);
}

/**
 * Make the panel draggable
 * @param {HTMLElement} panel - Panel element
 */
function citation_makeDraggable(panel) {
  const header = panel.querySelector('.assist-citation-header');
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  header.addEventListener('mousedown', e => {
    if (e.target.closest('.assist-citation-controls')) {
      return;
    }

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = panel.offsetLeft;
    startTop = panel.offsetTop;

    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) {
      return;
    }

    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    const newLeft = Math.max(
      0,
      Math.min(window.innerWidth - panel.offsetWidth, startLeft + deltaX)
    );
    const newTop = Math.max(
      0,
      Math.min(window.innerHeight - panel.offsetHeight, startTop + deltaY)
    );

    panel.style.left = `${newLeft}px`;
    panel.style.top = `${newTop}px`;
    panel.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

/**
 * The three evidence lists, in the order a student reads them. The glyph repeats the heading's
 * meaning for sighted readers and is hidden from screen readers, which hear the heading.
 */
const CITATION_EVIDENCE_LISTS = [
  { key: 'good', kind: 'good', title: 'Good signs found', glyph: '✓' },
  { key: 'warnings', kind: 'warning', title: 'Warning signs found', glyph: '!' },
  { key: 'notChecked', kind: 'notchecked', title: 'Not checked, or could not tell', glyph: '?' },
];

/** The band and evidence as one plain sentence, for the announcer and for reading aloud. */
function citation_describe(analysis) {
  const band = CITATION_BANDS[analysis.band] || CITATION_BANDS.unclear;
  const { good, warnings, notChecked } = analysis.evidence;
  const count = (n, one, many) => `${n === 0 ? 'no' : n} ${n === 1 ? one : many}`;
  return (
    `Quick look: ${band.label}. ${band.reason} ` +
    `${count(good.length, 'good sign', 'good signs')}, ` +
    `${count(warnings.length, 'warning sign', 'warning signs')}, ` +
    `${count(notChecked.length, 'thing', 'things')} not checked.`
  );
}

/**
 * Render analysis results in the panel
 * @param {Object} analysis - Analysis results, from citation_fallback or citation_fromAI
 * @param {boolean} isAI - Whether AI was used
 */
async function citation_renderResults(analysis, isAI) {
  const contentArea = citation_panel?.querySelector('.assist-citation-content');
  if (!contentArea) {
    return;
  }

  const bandKey = CITATION_BANDS[analysis.band] ? analysis.band : 'unclear';
  const band = CITATION_BANDS[bandKey];
  const typeName = CITATION_SOURCE_TYPE_NAMES[analysis.sourceType] || 'Could not tell';

  const badgeInfo = await getAIBadgeInfo();
  const badge = isAI
    ? renderAIBadge(badgeInfo.mode, badgeInfo.label)
    : renderAIBadge('fallback', 'Basic');

  const disclosure = isAI
    ? 'This quick look was written by AI from the text you selected. AI can be wrong, so check the source yourself.'
    : 'This quick look was worked out on this device from the text itself, without AI.';

  const evidenceSections = CITATION_EVIDENCE_LISTS.map(list => {
    const entries = analysis.evidence[list.key];
    const rows =
      entries.length > 0
        ? entries
            .map(
              item =>
                `<li><span class="assist-citation-evidence-glyph" aria-hidden="true">${list.glyph}</span>` +
                `<span>${escapeHtml(item)}</span></li>`
            )
            .join('')
        : '<li class="assist-citation-evidence-none">None found</li>';
    return `
      <div class="assist-citation-section">
        <div class="assist-citation-section-title">${list.title}</div>
        <ul class="assist-citation-list assist-citation-evidence assist-citation-evidence-${list.kind}">${rows}</ul>
      </div>`;
  }).join('');

  const bias = analysis.biasIndicators;
  const biasClass = ['none', 'mild', 'moderate', 'strong'].includes(bias?.severity)
    ? bias.severity
    : 'none';
  const biasSection = bias
    ? `
      <div class="assist-citation-section">
        <div class="assist-citation-section-title">
          <span class="assist-citation-section-icon">⚠️</span>
          Bias Assessment
        </div>
        <div class="assist-citation-bias ${biasClass}">
          ${escapeHtml(bias.explanation || 'No bias information available')}
          ${bias.type && bias.type !== 'none' ? ` (Type: ${escapeHtml(String(bias.type))})` : ''}
        </div>
      </div>`
    : '';

  const claimsSection =
    analysis.keyClaims.length > 0
      ? `
      <div class="assist-citation-section">
        <div class="assist-citation-section-title">
          <span class="assist-citation-section-icon">📌</span>
          Key Claims
        </div>
        <ul class="assist-citation-list">${analysis.keyClaims.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
      </div>`
      : '';

  contentArea.innerHTML = sanitizeHTML(`
    <p class="assist-citation-disclosure">${disclosure}</p>
    <div class="assist-citation-band assist-citation-band-${bandKey}">
      <div class="assist-citation-band-title">
        <span class="assist-citation-band-icon" aria-hidden="true">${band.icon}</span>
        <span class="assist-citation-band-label">${band.label}</span>
        ${badge}
      </div>
      <p class="assist-citation-band-reason">${band.reason}</p>
      <p class="assist-citation-band-type">Source type: ${escapeHtml(typeName)}</p>
    </div>
    <p class="assist-citation-caveat assist-citation-muted">${CITATION_CAVEAT}</p>

    ${evidenceSections}
    ${biasSection}
    ${claimsSection}

    ${
      analysis.summary
        ? `
      <div class="assist-citation-section">
        <div class="assist-citation-section-title">
          <span class="assist-citation-section-icon">📝</span>
          Summary
        </div>
        <div class="assist-citation-summary">${escapeHtml(analysis.summary)}</div>
      </div>
    `
        : ''
    }

    ${
      analysis.recommendations
        ? `
      <div class="assist-citation-section">
        <div class="assist-citation-section-title">
          <span class="assist-citation-section-icon">💡</span>
          Recommendations
        </div>
        <div class="assist-citation-recommendations">${escapeHtml(analysis.recommendations)}</div>
      </div>
    `
        : ''
    }
  `);

  const announcer = citation_panel?.querySelector('.assist-citation-announce');
  if (announcer) {
    announcer.textContent = citation_describe(analysis);
  }
}

/**
 * Show the citation analysis panel
 * @param {DOMRect} [selectionRect] - Optional selection rectangle for positioning
 */
async function citation_show(selectionRect = null) {
  if (citation_panel) {
    citation_panel.remove();
  }

  // The highlight menu is gone by the time the panel opens and its buttons activate on
  // mousedown, so there may be nothing for the trap to give the keyboard back to. The words
  // the student selected are the fallback.
  const selection = window.getSelection?.();
  citation_returnFocus = selectionContainer(
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  );

  citation_panel = await citation_createPanel();
  document.body.appendChild(citation_panel);

  // Position near selection if available
  if (selectionRect) {
    const panelRect = citation_panel.getBoundingClientRect();
    let left = selectionRect.right + 10;
    let top = selectionRect.top;

    // Horizontal bounds: prefer right of selection, fallback to left
    if (left + panelRect.width > window.innerWidth - 20) {
      left = Math.max(20, selectionRect.left - panelRect.width - 10);
    }

    // Vertical bounds: ensure panel stays within viewport
    // Check bottom edge
    if (top + panelRect.height > window.innerHeight - 20) {
      top = window.innerHeight - panelRect.height - 20;
    }

    // Check top edge (ensure not cut off at top)
    if (top < 20) {
      top = 20;
    }

    citation_panel.style.left = `${left}px`;
    citation_panel.style.top = `${top}px`;
    citation_panel.style.right = 'auto';
  }

  citation_releaseFocus = trapFocus(citation_panel, {
    onEscape: citation_hide,
    initialFocus: citation_panel.querySelector('.assist-citation-close'),
  });
}

/**
 * Hide the citation analysis panel
 */
function citation_hide() {
  // Abandon anything in flight: its result must not paint into a panel the student has closed.
  citation_requestId += 1;
  citation_isLoading = false;

  if (citation_releaseFocus) {
    citation_releaseFocus();
    citation_releaseFocus = null;
  }

  if (citation_panel) {
    citation_panel.remove();
    citation_panel = null;
  }

  returnFocusAfterDialog(citation_returnFocus);
  citation_returnFocus = null;
}

/**
 * Run analysis on text
 * @param {string} text - Text to analyze
 * @param {Object} context - Additional context
 */
async function citation_runAnalysis(text, context = {}) {
  if (citation_isLoading || !text || text.trim().length === 0) {
    return;
  }

  citation_currentText = text;
  citation_isLoading = true;
  const requestId = ++citation_requestId;

  const contentArea = citation_panel?.querySelector('.assist-citation-content');
  const statusBar = citation_panel?.querySelector('.assist-citation-status');
  const actionBtns = citation_panel?.querySelectorAll('.assist-citation-btn');
  const announcer = citation_panel?.querySelector('.assist-citation-announce');

  // Emptied so that a reanalysis announces its result again, even when it comes out the same.
  if (announcer) {
    announcer.textContent = '';
  }

  if (contentArea) {
    contentArea.innerHTML = sanitizeHTML(`
      <div class="assist-citation-loading">
        <div class="assist-citation-spinner"></div>
        <span>Analyzing source...</span>
      </div>
    `);
  }

  actionBtns?.forEach(btn => {
    btn.disabled = true;
  });

  // Get AI mode and check availability
  const modeInfo = await getAIMode('citationAnalyzer');
  const availability = await checkAIAvailable(modeInfo);

  if (requestId !== citation_requestId) {
    return;
  }

  try {
    let analysis;
    let isAI = false;

    if (!availability.available) {
      if (availability.needsApiKey) {
        citation_isLoading = false;
        actionBtns?.forEach(btn => {
          btn.disabled = false;
        });
        citation_showApiKeyWarning(availability.provider);
        return;
      }
      // Fall back to heuristic analysis
      analysis = citation_fallback(text, context);

      if (statusBar) {
        setAIStatusBar(statusBar, availability, 'assist-citation-status');
      }
    } else {
      // Use AI analysis with a 25s timeout race to guard against service-worker hangs
      // (Chrome sendMessage has a ~30s hard limit; we fail gracefully before it fires)
      const ANALYSIS_TIMEOUT_MS = 25000;
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), ANALYSIS_TIMEOUT_MS)
      );

      const response = await Promise.race([
        citation_analyze(text, context, modeInfo),
        timeoutPromise,
      ]);
      if (requestId !== citation_requestId) {
        return;
      }
      analysis = response.analysis;
      isAI = !analysis.isFallback;

      if (statusBar) {
        if (!isAI && analysis.aiAttempted) {
          statusBar.textContent = '⚠️ AI returned an unreadable response — showing basic analysis';
          statusBar.className = 'assist-citation-status visible error';
        } else {
          statusBar.textContent = getSuccessStatusMessage(modeInfo, 'analysis complete');
          statusBar.className = 'assist-citation-status visible success';
        }
      }
    }

    citation_currentAnalysis = analysis;
    await citation_renderResults(analysis, isAI);
    if (citation_settings.verifyOnline) {
      citation_startVerification(text).catch(() => {});
    }
  } catch (error) {
    console.error('[CitationAnalyzer] Error:', error);

    // Show heuristic fallback — never leave the user with an empty panel or raw error
    // Mark aiAttempted=true since we were in the AI branch when the error occurred
    const fallbackAnalysis = citation_fallback(text, context, true);
    citation_currentAnalysis = fallbackAnalysis;
    citation_renderResults(fallbackAnalysis, false);

    // The reason the request failed is the student's only route to fixing it, so it is shown
    // rather than replaced with a generic apology.
    const reason =
      error?.message === 'timeout'
        ? 'The AI request timed out. Try again, or switch AI mode in settings.'
        : getFailureMessage(error);

    if (statusBar) {
      statusBar.textContent = `⚠️ ${reason}`;
      statusBar.className = 'assist-citation-status visible error';
    }
  } finally {
    if (requestId === citation_requestId) {
      citation_isLoading = false;

      actionBtns?.forEach(btn => {
        btn.disabled = false;
      });
    }
  }
}

/**
 * Copy analysis report to clipboard
 */
async function citation_copy() {
  if (!citation_currentAnalysis) {
    showToast('No analysis to copy');
    return;
  }

  const a = citation_currentAnalysis;
  const band = CITATION_BANDS[a.band] || CITATION_BANDS.unclear;
  const lines = items =>
    items.length > 0 ? items.map(item => `- ${item}`).join('\n') : 'None found';
  const report = `CITATION ANALYSIS REPORT
========================
Quick look: ${band.label}
${band.reason}
${CITATION_CAVEAT}
Source Type: ${CITATION_SOURCE_TYPE_NAMES[a.sourceType] || 'Could not tell'}

GOOD SIGNS FOUND
${lines(a.evidence.good)}

WARNING SIGNS FOUND
${lines(a.evidence.warnings)}

NOT CHECKED, OR COULD NOT TELL
${lines(a.evidence.notChecked)}

BIAS ASSESSMENT
${a.biasIndicators?.explanation || 'N/A'}

KEY CLAIMS
${lines(a.keyClaims)}

SUMMARY
${a.summary || 'N/A'}

RECOMMENDATIONS
${a.recommendations || 'N/A'}

---
Generated by AssisT Citation Analyzer`;

  try {
    await navigator.clipboard.writeText(report);
    showToast('Report copied to clipboard');
  } catch (error) {
    console.error('[CitationAnalyzer] Copy failed:', error);
    showToast('Failed to copy report');
  }
}

/**
 * Read analysis using TTS
 */
function citation_speak() {
  if (!citation_currentAnalysis) {
    showToast('No analysis to read');
    return;
  }

  const a = citation_currentAnalysis;
  const sentences = items => (items.length > 0 ? `${items.join('. ')}.` : 'None found.');
  const text = [
    `Citation Analysis. ${citation_describe(a)}`,
    `Good signs: ${sentences(a.evidence.good)}`,
    `Warning signs: ${sentences(a.evidence.warnings)}`,
    `Not checked, or could not tell: ${sentences(a.evidence.notChecked)}`,
    a.summary ? `Summary: ${a.summary}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (typeof window.readText === 'function') {
    const contentArea = citation_panel?.querySelector('.assist-citation-content');
    window.readText(text, contentArea || document.body);
  } else {
    createSavedUtterance(text).then(utterance => window.speechSynthesis.speak(utterance));
  }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show API key warning when cloud mode is enabled but no key is configured
 */
function citation_showApiKeyWarning(provider) {
  const contentArea = citation_panel?.querySelector('.assist-citation-content');
  if (!contentArea) {
    return;
  }

  contentArea.innerHTML = sanitizeHTML(`
    <div style="text-align: center; padding: 40px 20px;">
      <div style="font-size: 48px; margin-bottom: 16px;">🔑</div>
      <h3 class="assist-citation-message-title" style="margin: 0 0 12px 0;">API Key Required</h3>
      <p class="assist-citation-muted" style="margin-bottom: 16px; line-height: 1.5;">
        Cloud AI mode is enabled but no API key is configured.<br>
        ${missingKeyMessage(provider)}
      </p>
      <div style="display: flex; flex-direction: column; gap: 12px; align-items: center;">
        <button class="citation-open-settings" style="
          background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        ">⚙️ Open Advanced Options</button>
        <button class="citation-use-local" style="
          background: #6b7280;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        ">💻 Use Local AI Instead</button>
      </div>
      <p class="assist-citation-muted" style="font-size: 12px; margin-top: 16px;">
        Go to: Extension Popup → Advanced Options → AI tab → Enter API Key
      </p>
    </div>
  `);

  // Attach handlers for buttons
  const openSettingsBtn = contentArea.querySelector('.citation-open-settings');
  if (openSettingsBtn) {
    attachAccessibleHandler(openSettingsBtn, 'Open Settings Button', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_POPUP_ADVANCED_OPTIONS' });
    });
  }

  const useLocalBtn = contentArea.querySelector('.citation-use-local');
  if (useLocalBtn) {
    attachAccessibleHandler(useLocalBtn, 'Use Local AI Button', async () => {
      await chrome.storage.local.set({ aiMode: 'local' });
      console.log('[CitationAnalyzer] Switched to local AI mode');
      citation_showEmptyState();
    });
  }
}

/**
 * Show the empty state
 */
function citation_showEmptyState() {
  const contentArea = citation_panel?.querySelector('.assist-citation-content');
  if (!contentArea) {
    return;
  }

  contentArea.innerHTML = sanitizeHTML(`
    <div class="assist-citation-muted" style="text-align: center; padding: 40px 20px;">
      <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
      <p>Select text containing a citation or source to analyze its credibility.</p>
      <p style="font-size: 13px; margin-top: 12px;">Now using Local AI mode.</p>
    </div>
  `);
}

/**
 * Main entry point for citation analysis
 * @param {string} text - Text to analyze
 * @param {DOMRect} [selectionRect] - Optional selection rectangle for positioning
 */
async function citation_start(text, selectionRect = null) {
  if (!text || text.trim().length === 0) {
    showToast('No text to analyze');
    return;
  }

  // Extract URL if present in the selected text; don't fall back to page URL
  // (the page URL is unrelated to the citation and would mislead the AI)
  const urlMatch = text.match(/https?:\/\/[^\s]+/);
  const context = {
    url: urlMatch ? urlMatch[0] : '',
    title: document.title,
  };

  await citation_show(selectionRect);

  citation_runAnalysis(text, context);
}

/**
 * Initialize the citation analyzer feature
 */
function citation_init() {
  console.log('[CitationAnalyzer] Initializing...');
  injectAIBadgeStyles();

  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.citationAnalyzer = {
    start: citation_start,
    show: citation_show,
    hide: citation_hide,
    analyze: citation_runAnalysis,
    settings: citation_settings,
  };

  // Load settings from storage
  chrome.storage.local.get(['citationAnalyzerSettings'], result => {
    if (result.citationAnalyzerSettings) {
      Object.assign(citation_settings, result.citationAnalyzerSettings);
      console.log('[CitationAnalyzer] Settings loaded:', Object.keys(citation_settings).join(', '));
    }
  });

  // Listen for settings updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.citationAnalyzerSettings) {
      Object.assign(citation_settings, changes.citationAnalyzerSettings.newValue);
      console.log(
        '[CitationAnalyzer] Settings updated:',
        Object.keys(citation_settings).join(', ')
      );
    }
  });

  console.log('[CitationAnalyzer] Feature initialized');
}

// Auto-initialize
if (typeof window !== 'undefined') {
  citation_init();
}

export {
  citation_start,
  citation_show,
  citation_hide,
  citation_runAnalysis,
  citation_settings,
  citation_startVerification,
  citation_fallback,
};
