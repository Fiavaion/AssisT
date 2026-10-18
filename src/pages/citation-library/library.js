/**
 * Full-page citation library.
 *
 * A standalone extension-origin page (opened in its own tab) that hosts the whole citation library:
 * the tested M6 library view (search, style switcher, cards, AI affordances) plus a collections/tags
 * sidebar and a header with import / export / dedupe. It reads and writes through the same store +
 * RPC client as the content script, so every context shares the one canonical offscreen-owned DB.
 *
 * This is the only citation library surface — the in-page overlay it replaced has been removed, so
 * every route (popup 📚 Library, capture tray, voice) lands here (see citation-integration.openLibrary).
 */

import { createCitationStore } from '../../features/citations/citation-store.js';
import { createLibraryView } from '../../features/citations/ui/library-view.js';
import { showCitationWizard } from '../../features/citations/ui/citation-wizard-modal.js';
import { showSuccessToast, showErrorToast } from '../../features/citations/citation-toast.js';
import {
  formatReference,
  formatInText,
  formatBibliography,
  referenceSetFor,
} from '../../features/citations/citation-styles/index.js';
import {
  referenceBlockHtml,
  bibliographyDocumentHtml,
  inlineHtml,
  escapeText,
  copyRich,
} from '../../features/citations/citation-clipboard.js';
import { lookUpDOI } from '../../features/citations/crossref-api.js';
import { createDeclinedNotice } from '../../utils/consent-panel.js';
import { injectCitationStyles } from '../../features/citations/ui/citation-styles.js';
import {
  EXPORT_FORMATS,
  exportCitations,
  importCitations,
} from '../../features/citations/citation-export.js';
import { findDuplicateGroups, dedupeCitations } from '../../features/citations/citation-dedupe.js';
import { getAIMode } from '../../features/shared/ai-feature-client.js';
import { createCitationSentinel } from '../../features/citations/sentinel/claim-sentinel.js';
import { analyseCitation } from '../../features/citations/citation-ai-analyser.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import {
  resolveInstitutionBranding,
  onInstitutionKeyChanged,
} from '../../features/institution/institution-resolver.js';
import { deriveInstitutionPalette } from '../../features/institution/institution-theme.js';
import { openOverlay } from '../../features/citations/ui/citation-overlay.js';
import { createReferenceCheckPanel } from '../../features/citations/ui/reference-check-panel.js';
import { importReport } from './import-report.js';
import { createLibrarySidebar } from './library-sidebar.js';
import { showCollectionDialog } from './collection-dialog.js';
import { showInfoTray } from '../../utils/action-tray.js';

/**
 * Pull a DOI out of whatever the student pasted — a bare DOI, a doi.org link, or a sentence
 * containing one. Trailing punctuation from copy-paste is stripped. Null when nothing DOI-shaped.
 * @param {string} input
 * @returns {string|null}
 */
function extractDoi(input) {
  const m = String(input || '').match(/10\.\d{4,9}\/\S+/);
  return m ? m[0].replace(/[).,;\]'"]+$/, '') : null;
}

const NOT_A_DOI = 'That doesn’t look like a DOI — it starts with 10., e.g. 10.1000/xyz123';
const DOI_NOT_FOUND = 'Couldn’t find that DOI — check it, or add the source manually';

/** Whether AI is switched on (gates the sentinel + analyser, exactly like the overlay). */
async function aiIsOn() {
  try {
    const mode = await getAIMode('citationAnalyzer');
    // On only when a mode is configured AND not off — an absent/unconfigured mode is OFF
    // (matches citation-integration.js so the two surfaces agree).
    return !!(mode && !mode.isOff);
  } catch {
    return false;
  }
}

/**
 * Render (or clear) the institution subtitle inside the brand block. Idempotent — safe to call again
 * when the key changes, so applying/clearing a key updates an open library live.
 * @param {HTMLElement} brandText
 * @param {{ name: string|null }|null} branding
 */
function renderBrandSub(brandText, branding) {
  if (!brandText) {
    return;
  }
  const existing = brandText.querySelector('.assist-lib-header__brandsub');
  const name = branding && branding.name;
  if (!name) {
    if (existing) {
      existing.remove();
    }
    return;
  }
  const sub = existing || document.createElement('p');
  sub.className = 'assist-lib-header__brandsub';
  sub.textContent = name;
  if (!existing) {
    brandText.appendChild(sub);
  }
}

/**
 * Render (or reset) the institution logo inside the brand mark. A verified https/raster logo
 * replaces the quotation-mark glyph; anything else (or a failed load) restores it. Idempotent.
 * The mark stays decorative (`aria-hidden` on the container) — the institution is named in the
 * adjacent subtitle text, so the image carries no information of its own.
 * @param {HTMLElement} logoEl - the `.assist-lib-header__logo` span
 * @param {{ logo: string|null }|null} branding
 */
function renderBrandLogo(logoEl, branding) {
  if (!logoEl) {
    return;
  }
  const url = branding && branding.logo;
  const existing = logoEl.querySelector('img');
  if (!url) {
    if (existing) {
      existing.remove();
      logoEl.textContent = '“';
    }
    return;
  }
  if (existing && existing.getAttribute('src') === url) {
    return;
  }
  logoEl.textContent = '';
  const img = document.createElement('img');
  img.className = 'assist-lib-header__brandlogo';
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => renderBrandLogo(logoEl, null), { once: true });
  img.src = url;
  logoEl.appendChild(img);
}

/**
 * Paint (or reset) the institution accent onto the page's `:root` design tokens. The palette comes
 * from `deriveInstitutionPalette`, which guarantees WCAG AA on every surface the tokens are used
 * against — so a key can restyle the page but never make it unreadable. No accent → the inline
 * overrides are removed and the stylesheet defaults win again. Idempotent.
 * @param {{ accent: string|null, accentSecondary: string|null }|null} branding
 */
function applyInstitutionTheme(branding) {
  const rootStyle = document.documentElement.style;
  const palette = deriveInstitutionPalette(branding);
  if (!palette) {
    ['--accent', '--accent-2', '--accent-soft', '--on-accent'].forEach(v =>
      rootStyle.removeProperty(v)
    );
    return;
  }
  rootStyle.setProperty('--accent', palette.accent);
  rootStyle.setProperty('--accent-2', palette.accentSecondary);
  rootStyle.setProperty('--accent-soft', palette.accentSoft);
  // The ink goes with the accent, not with the colour scheme: an inline accent outranks both
  // palettes, so leaving --on-accent to the stylesheet put the dark palette's near-black text on a
  // key's dark accent.
  rootStyle.setProperty('--on-accent', palette.onAccent);
}

/** Re-render every branded surface (subtitle, logo, accent tokens) for a resolved branding. */
function applyBranding(branding) {
  renderBrandSub(document.querySelector('.assist-lib-header__brandtext'), branding);
  renderBrandLogo(document.querySelector('.assist-lib-header__logo'), branding);
  applyInstitutionTheme(branding);
}

/**
 * What every wizard the page opens needs besides the draft: the collections to file into, the
 * student's style for the CHECK preview, and the whole library, so the preview carries the year
 * letter the source will be copied with.
 * @param {object} store
 * @returns {{projects: Array, style: string, referencePool: Array}}
 */
function wizardContext(store) {
  const { projects, style, citations } = store.getState();
  return { projects, style, referencePool: citations };
}

/**
 * A collection name no other collection holds, ignoring case as the collection dialog does:
 * the name itself when free, else "Name (restored)", "Name (restored 2)", ….
 * @param {string} name
 * @param {Array<{name: string}>} projects
 * @returns {string}
 */
function freeCollectionName(name, projects) {
  const taken = new Set(projects.map(p => String(p.name).trim().toLowerCase()));
  let candidate = name;
  for (let n = 1; taken.has(candidate.trim().toLowerCase()); n++) {
    candidate = n === 1 ? `${name} (restored)` : `${name} (restored ${n})`;
  }
  return candidate;
}

/**
 * The reference list a single card is copied within: its collection, or every unfiled citation.
 * @param {object} store
 * @param {object} citation
 * @returns {Array}
 */
function cardSet(store, citation) {
  return referenceSetFor(citation, store.getState().citations);
}

/**
 * Copy a bibliography of exactly these citations — alphabetised, with italics and a hanging indent
 * for rich editors and plain text for bare textareas. The header copies everything on screen and
 * the selection bar copies the ticked records; both come through here, so a bibliography of a
 * selection is formatted and announced identically to a bibliography of the whole library. Each
 * entry keeps the year letter of its own collection, the one its card copies: a search or a
 * selection changes which entries are copied, never their letters.
 * @param {object} store
 * @param {Array} citations
 */
async function copyBibliographyOf(store, citations) {
  if (citations.length === 0) {
    showErrorToast('Nothing to copy yet — save a source first', 3000);
    return;
  }
  const { style, citations: pool } = store.getState();
  const text = formatBibliography(citations, style, { pool });
  const html = bibliographyDocumentHtml(
    formatBibliography(citations, style, { html: true, pool }).split('\n\n')
  );
  const { ok, rich } = await copyRich({ html, text });
  if (ok) {
    showSuccessToast(
      rich
        ? `Bibliography copied (${citations.length}) — paste it into your essay, formatting included`
        : `Bibliography copied (${citations.length}) — paste it into your essay`,
      3000
    );
  } else {
    showErrorToast('Could not copy the bibliography', 3000);
  }
}

/** What a disagreement between two copies is, in the student's words. */
const CONFLICT_WORDS = {
  quote: 'different quotes',
  locator: 'different page numbers',
  projectId: 'different collections',
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "a", "a and b", "a, b and c". */
function joinWords(words) {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

/**
 * Name the sources whose copies disagree, so the student knows which to sort out by hand.
 * @param {{ members: object[], fields: string[] }[]} conflicts
 */
function describeConflicts(conflicts) {
  const named = conflicts.map(
    ({ members, fields }) =>
      `“${members[0].title}” (${joinWords(fields.map(f => CONFLICT_WORDS[f]))})`
  );
  return conflicts.length === 1
    ? `Left ${named[0]} as it is, because its copies disagree. Open them and keep the one you want.`
    : `Left ${conflicts.length} sources as they are, because their copies disagree: ` +
        `${named.join('; ')}. Open each one and keep the copy you want.`;
}

/**
 * Remove duplicate citations without losing anything the student wrote.
 *
 * A copy that adds nothing goes to the trash. A copy holding a quote, page, note or tag the kept
 * copy lacks is merged: the kept record is written with the union FIRST, and only once that write
 * has landed are the absorbed copies trashed, so a failure part-way leaves the work where it was.
 * Copies that disagree (two different quotes, say) are left alone and named.
 * @param {object} store
 */
async function removeDuplicates(store) {
  const all = store.getState().citations;
  const groups = findDuplicateGroups(all);
  if (groups.length === 0) {
    showSuccessToast('No duplicates found', 2500);
    return;
  }
  const { removed, merges, conflicts } = dedupeCitations(all);
  const extra = removed.length + merges.reduce((n, m) => n + m.absorbed.length, 0);
  if (extra === 0) {
    showInfoTray({ message: describeConflicts(conflicts), duration: 12000 });
    return;
  }

  const sources = groups.length - conflicts.length;
  const ok = window.confirm(
    `Found ${plural(extra, 'extra copy', 'extra copies')} of ${plural(sources, 'source', 'sources')}. ` +
      'Each source will be kept once' +
      (merges.length ? ', with every quote, page, note and tag from its copies' : '') +
      ', and the extra copies will go to Recently removed.' +
      (conflicts.length
        ? ` ${plural(conflicts.length, 'source has', 'sources have')} copies that disagree and ` +
          `will be left as ${conflicts.length === 1 ? 'it is' : 'they are'}.`
        : '') +
      ' Go ahead?'
  );
  if (!ok) {
    return;
  }

  // The question may have been on screen for a while, and the library can have changed under it
  // (a note added in another tab): the writes come from the library as it stands now, never from
  // the snapshot the question was worked out from.
  await store.refresh();
  const current = dedupeCitations(store.getState().citations);
  let done = 0;
  const unsaved = [];
  for (const { citation, absorbed } of current.merges) {
    const { quote, locator, projectId, notes, tags } = citation;
    try {
      await store.update(citation.id, { quote, locator, projectId, notes, tags });
    } catch (err) {
      console.error('[citation-library] could not save a merged citation:', err);
      unsaved.push(citation.title);
      continue;
    }
    for (const copy of absorbed) {
      await store.remove(copy.id);
      done += 1;
    }
  }
  for (const copy of current.removed) {
    await store.remove(copy.id);
    done += 1;
  }

  if (unsaved.length) {
    showErrorToast(
      `AssisT could not save the merged copy of ${unsaved.map(t => `“${t}”`).join(', ')}, so ` +
        `${unsaved.length === 1 ? 'its duplicates were' : 'their duplicates were'} left in your ` +
        'library. Nothing you wrote was lost.',
      8000
    );
  }
  const result = `Removed ${plural(done, 'duplicate', 'duplicates')}.`;
  if (current.conflicts.length) {
    showInfoTray({
      message: `${result} ${describeConflicts(current.conflicts)}`,
      duration: 12000,
    });
  } else if (done > 0) {
    showSuccessToast(result, 3000);
  }
}

/** Build the header (brand + import / export / dedupe), wiring each action to the store.
 * @param {object} store
 * @param {{ name: string|null }} [branding] - resolved institution branding; a `name` renders the
 *   institution subtitle. Generic (unbranded) when absent, so the public build shows no institution.
 */
function buildHeader(store, branding) {
  const header = document.getElementById('assist-lib-header');
  header.classList.add('assist-cite-root');
  // The page's Help link is static markup and stays last (SC 3.2.6); everything built here goes in
  // front of it, so the tab order matches what the student sees.
  const help = header.querySelector('[data-destination="help"]');

  // Brand block (left): a quotation-mark logo mark, the product name, and the institution.
  // Not an <h1> — the page's single <h1> is the hero title, so this is a <p> pair.
  const brand = document.createElement('div');
  brand.className = 'assist-lib-header__brand';

  const logo = document.createElement('span');
  logo.className = 'assist-lib-header__logo';
  logo.setAttribute('aria-hidden', 'true');
  logo.textContent = '“';
  renderBrandLogo(logo, branding);
  brand.appendChild(logo);

  const brandText = document.createElement('div');
  brandText.className = 'assist-lib-header__brandtext';
  const brandTitle = document.createElement('p');
  brandTitle.className = 'assist-lib-header__brandtitle';
  brandTitle.textContent = 'Citation Library';
  brandText.appendChild(brandTitle);
  renderBrandSub(brandText, branding);
  brand.appendChild(brandText);
  header.insertBefore(brand, help);

  const actions = document.createElement('div');
  actions.className = 'assist-lib-header__actions';
  header.insertBefore(actions, help);

  // Import (hidden file input + a labelled button).
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.ris,.bib,.bibtex,.json,.csl';
  fileInput.className = 'assist-cite-sr-only';
  fileInput.id = 'assist-lib-import-input';
  fileInput.setAttribute('aria-label', 'Import citations from a .ris, .bib, .csl or .json file');
  // One Tab stop for one action: the button opens the picker, so the input it drives must not be a
  // second stop of its own. It stays programmatically focusable and keeps its name for anything that
  // reaches it directly.
  fileInput.tabIndex = -1;
  // A file input is bound with the native 'change' event — the mousedown-first interactive handler
  // calls preventDefault(), which would cancel the native picker.
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      return;
    }
    try {
      // importCitations reports facts and says nothing; the words are this page's, said once.
      const outcome = await importCitations(file);
      if (outcome.added > 0) {
        await store.refresh();
      }
      const { ok, message } = importReport(outcome);
      if (ok) {
        showSuccessToast(message, 5000);
      } else {
        showErrorToast(message, 6000);
      }
    } catch (err) {
      console.error('[citation-library] import failed:', err);
      showErrorToast(
        `AssisT could not import ${file.name}. Nothing in your library has changed.`,
        6000
      );
    } finally {
      fileInput.value = '';
    }
  });
  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'assist-cite-btn';
  importBtn.textContent = 'Import…';
  attachAccessibleHandler(importBtn, 'Import citations', () => fileInput.click());
  actions.appendChild(importBtn);
  actions.appendChild(fileInput);

  // Export — a labelled format menu.
  const exportLabel = document.createElement('label');
  exportLabel.className = 'assist-lib-header__export';
  const exportText = document.createElement('span');
  exportText.textContent = 'Export as ';
  const exportSelect = document.createElement('select');
  exportSelect.className = 'assist-cite-btn';
  exportSelect.setAttribute('aria-label', 'Export all citations as');
  for (const [value, label] of EXPORT_FORMATS) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    exportSelect.appendChild(opt);
  }
  exportSelect.addEventListener('change', async () => {
    const format = exportSelect.value;
    if (!format) {
      return;
    }
    const { citations, style } = store.getState();
    await exportCitations(format, citations, style, { pool: citations });
    exportSelect.value = '';
  });
  exportLabel.appendChild(exportText);
  exportLabel.appendChild(exportSelect);
  actions.appendChild(exportLabel);

  // Copy bibliography — the essay payoff: the whole visible list (respecting the active
  // collection/search), alphabetised, copied with italics + hanging indent for rich editors and
  // as plain text for bare textareas.
  const copyBibBtn = document.createElement('button');
  copyBibBtn.type = 'button';
  copyBibBtn.className = 'assist-cite-btn';
  copyBibBtn.textContent = 'Copy bibliography';
  attachAccessibleHandler(copyBibBtn, 'Copy bibliography', () =>
    copyBibliographyOf(store, store.getVisibleCitations())
  );
  actions.appendChild(copyBibBtn);

  // Add by DOI or link — the rescue path when a page can't be scraped (paywalled article, a DOI
  // from a reading list). Deterministic CrossRef lookup, reviewed in the wizard before saving.
  const doiForm = document.createElement('form');
  doiForm.className = 'assist-lib-header__doiform';
  const doiInput = document.createElement('input');
  doiInput.type = 'text';
  doiInput.className = 'assist-cite-toolbar__search';
  doiInput.setAttribute('aria-label', 'Add a source by DOI or DOI link');
  doiInput.placeholder = 'Add by DOI, e.g. 10.1000/xyz…';
  const doiBtn = document.createElement('button');
  doiBtn.type = 'submit';
  doiBtn.className = 'assist-cite-btn';
  doiBtn.textContent = 'Add';
  doiForm.appendChild(doiInput);
  doiForm.appendChild(doiBtn);
  /** The "nothing was looked up" message after a "not now" to CrossRef, while it is showing. */
  let doiDeclinedNotice = null;
  doiForm.addEventListener('submit', async e => {
    e.preventDefault();
    doiDeclinedNotice?.remove();
    doiDeclinedNotice = null;
    const doi = extractDoi(doiInput.value);
    if (!doi) {
      showErrorToast(NOT_A_DOI, 4000);
      return;
    }
    // Add is disabled while the lookup runs, and Chrome drops a disabled button's focus to <body>;
    // the keyboard place moves to the DOI box first, so whatever the lookup says lands where the
    // student is.
    if (document.activeElement === doiBtn) {
      doiInput.focus();
    }
    doiBtn.disabled = true;
    doiBtn.textContent = 'Looking up…';
    try {
      const { status, metadata } = await lookUpDOI(doi);
      if (status === 'declined') {
        // The student said "not now" to CrossRef: nothing was looked up, and an empty wizard
        // would read as "CrossRef had nothing". Say so, and offer Allow here.
        doiDeclinedNotice = createDeclinedNotice('citations', {
          onAllowed: () => doiForm.requestSubmit(),
        });
        doiDeclinedNotice.setAttribute('role', 'alert');
        doiForm.after(doiDeclinedNotice);
        return;
      }
      // Anything but a record means there is nothing to review, and a wizard holding only the DOI
      // would read as "Crossref found this, with no details". Say what happened instead.
      if (status === 'invalid') {
        showErrorToast(NOT_A_DOI, 4000);
        return;
      }
      if (status === 'not-found') {
        showErrorToast(DOI_NOT_FOUND, 5000);
        return;
      }
      if (status !== 'found') {
        showErrorToast(
          'AssisT could not reach Crossref just now. Try again in a moment, or add the source manually.',
          5000
        );
        return;
      }
      const created = await showCitationWizard(
        { ...metadata, doi },
        {
          ...wizardContext(store),
          onSave: citation => store.add(citation),
        }
      );
      if (created) {
        showSuccessToast('Citation added from its DOI', 2500);
        doiInput.value = '';
      }
    } catch {
      showErrorToast(DOI_NOT_FOUND, 5000);
    } finally {
      doiBtn.disabled = false;
      doiBtn.textContent = 'Add';
    }
  });
  actions.appendChild(doiForm);

  // Check your essay — the in-text ↔ reference-list mismatch checker (deterministic, on-device).
  const checkEssayBtn = document.createElement('button');
  checkEssayBtn.type = 'button';
  checkEssayBtn.className = 'assist-cite-btn';
  checkEssayBtn.textContent = 'Check your essay';
  attachAccessibleHandler(checkEssayBtn, 'Check your essay', () => {
    const panel = createReferenceCheckPanel({
      getCitations: () => store.getState().citations,
      getStyle: () => store.getState().style,
    });
    openOverlay({
      content: panel.el,
      label: 'Check your essay against your reference list',
      onClose: () => panel.destroy(),
    });
  });
  actions.appendChild(checkEssayBtn);

  // Dedupe.
  const dedupeBtn = document.createElement('button');
  dedupeBtn.type = 'button';
  dedupeBtn.className = 'assist-cite-btn';
  dedupeBtn.textContent = 'Remove duplicates';
  attachAccessibleHandler(dedupeBtn, 'Remove duplicate citations', () => removeDuplicates(store));
  actions.appendChild(dedupeBtn);
}

async function main() {
  injectCitationStyles();

  const store = createCitationStore();
  await store.init();

  // Opening the library is when the trash is swept: citations removed longer ago than the retention
  // window are destroyed now, so the promise the trash view makes is kept. Awaited, so nothing
  // expired can flash up in the list first; a failure must not stop the library loading, and the
  // sweep runs again on the next open.
  await store.purgeExpiredTrash().catch(err => {
    console.error('[citation-library] could not sweep the trash:', err);
  });

  // Cosmetic institution branding (name/subtitle) from a verified key; generic when none.
  const branding = await resolveInstitutionBranding().catch(() => null);
  buildHeader(store, branding);
  applyInstitutionTheme(branding);

  // Re-resolve + re-render every branded surface live when a key is applied or cleared in another
  // context (popup paste/clear, or a managed policy change), so the UI resets without reopening.
  onInstitutionKeyChanged(async () => {
    const next = await resolveInstitutionBranding().catch(() => null);
    applyBranding(next);
  });

  // Hero subline — reflects the real library size, kept live as citations are added/removed.
  const subline = document.getElementById('assist-lib-hero-subline');
  const updateSubline = snap => {
    if (!subline) {
      return;
    }
    const n = (snap && snap.citations ? snap.citations : []).length;
    subline.textContent =
      n === 0
        ? 'Save a source to start building your library.'
        : `${n} reference${n === 1 ? '' : 's'}, formatted and ready to cite.`;
  };
  updateSubline(store.getState());
  store.subscribe(updateSubline);

  const aiAvailable = await aiIsOn();
  const view = createLibraryView({
    store,
    sentinel: aiAvailable ? createCitationSentinel() : undefined,
    analyser: aiAvailable ? { analyse: analyseCitation } : undefined,
    onNewCitation: async () => {
      // The wizard is given the collections so a source can be filed as it is saved, rather than
      // saved now and hunted down later. It also does the storing (`onSave`), so the dialog stays
      // open — with everything the student typed still in it — if the write fails.
      let newId = null;
      const created = await showCitationWizard(
        {},
        {
          ...wizardContext(store),
          onSave: async citation => {
            newId = await store.add(citation);
          },
        }
      );
      // The card was drawn while the dialog still had the focus, so the list could not hand it over
      // then. Now that the dialog has gone, the student lands on the source they just saved.
      if (created && newId !== null) {
        view.focusCitation(newId);
      }
    },
    onEditCitation: async citation => {
      await showCitationWizard(
        { ...citation, _isEdit: true },
        {
          ...wizardContext(store),
          onSave: edited => store.update(citation.id, edited),
        }
      );
    },
    // The selection bar's two clipboard/file actions run the page's own paths: the same
    // dual-flavour bibliography the header copies, and the same exporter the header's menu uses.
    onCopyBibliography: chosen => copyBibliographyOf(store, chosen),
    onExportCitations: (format, chosen) => {
      const { style, citations: pool } = store.getState();
      return exportCitations(format, chosen, style, { pool });
    },
    onAssignProject: async (citation, projectId) => {
      // Filing from the card: a source is usually saved while reading, before the student knows
      // which essay it belongs to, so this has to work long after capture and in one step.
      await store.assignToProject(citation.id, projectId);
      const project = store.getState().projects.find(p => String(p.id) === String(projectId));
      showInfoTray({
        message: project ? `Filed in “${project.name}”` : 'Moved back to your library.',
        duration: 3000,
      });
    },
    onInsertCitation: async citation => {
      // Copy the reference dual-flavour: rich (italics + hanging indent) for Docs/Word, plain for
      // bare textareas — the clipboard IS the word-processor integration.
      // Within the card's collection, so the year letter is the one its reference list carries.
      const style = store.getState().style;
      const set = cardSet(store, citation);
      const { ok, rich } = await copyRich({
        html: referenceBlockHtml(formatReference(citation, style, { html: true, set })),
        text: formatReference(citation, style, { set }),
      });
      if (ok) {
        showSuccessToast(
          rich
            ? 'Reference copied — paste it into your work, formatting included'
            : 'Reference copied — paste it into your work',
          2500
        );
      } else {
        showErrorToast('Could not copy the citation', 3000);
      }
    },
    onCopyInText: async citation => {
      // The in-text citation for the sentence being written, with the captured page when there is
      // a quote on record: (Smith, 2023, p. 24).
      // The rich flavour keeps the italics of a title named in the citation: (Morrison, Beloved 27).
      const style = store.getState().style;
      const locator = String(citation.quote || '').trim() ? citation.locator : '';
      const options = { locator, set: cardSet(store, citation) };
      const text = formatInText(citation, style, options);
      const html = inlineHtml(formatInText(citation, style, { ...options, html: true }));
      const { ok } = await copyRich({ html, text });
      if (ok) {
        showSuccessToast(`${text} copied — paste it after your sentence`, 2500);
      } else {
        showErrorToast('Could not copy the in-text citation', 3000);
      }
    },
    onCopyQuote: async citation => {
      // The attribution firewall payoff: quote marks + in-text citation + page arrive TOGETHER,
      // so quoted words can never land in an essay unmarked.
      const style = store.getState().style;
      const quote = String(citation.quote || '').trim();
      const options = { locator: citation.locator, set: cardSet(store, citation) };
      const text = `“${quote}” ${formatInText(citation, style, options)}`;
      const inTextHtml = formatInText(citation, style, { ...options, html: true });
      const html = inlineHtml(`“${escapeText(quote)}” ${inTextHtml}`);
      const { ok } = await copyRich({ html, text });
      if (ok) {
        showSuccessToast('Quote + citation copied — quote marks included', 2500);
      } else {
        showErrorToast('Could not copy the quote', 3000);
      }
    },
  });

  const sidebar = createLibrarySidebar({
    // The filter is applied BEFORE the view switches back, so the rail's announcement lands on an
    // emit where the count it reads is the count the student is about to see.
    onAll: () => {
      store.setActiveProject(null);
      store.setFilter('');
      store.setView('library');
    },
    onTrash: () => store.setView('trash'),
    onProject: pid => {
      store.setActiveProject(pid);
      store.setView('library');
    },
    onTag: tag => {
      store.setFilter(tag);
      store.setView('library');
    },

    onNewCollection: async () => {
      const details = await showCollectionDialog({
        heading: 'New collection',
        takenNames: store.getState().projects.map(p => p.name),
      });
      if (!details) {
        return;
      }
      await store.createProject(details.name, details.description);
      // Deliberately NOT filtered to the new collection: it is empty, and an empty library with
      // no explanation is the most disorienting thing a new collection could do.
      showInfoTray({ message: `Created “${details.name}”`, duration: 3000 });
    },

    onRenameCollection: async project => {
      const details = await showCollectionDialog({
        heading: 'Rename collection',
        name: project.name,
        description: project.description || '',
        submitLabel: 'Save',
        // The collection's own name is left out, so changing only its case is not a clash.
        takenNames: store
          .getState()
          .projects.filter(p => String(p.id) !== String(project.id))
          .map(p => p.name),
      });
      if (!details) {
        return;
      }
      await store.updateProject(project.id, details);
      // The rail has rebuilt the row, so the button the dialog handed the focus back to may be gone.
      sidebar.focusControl(`rename:${project.id}`);
      showInfoTray({ message: `Renamed to “${details.name}”`, duration: 3000 });
    },

    onDeleteCollection: async project => {
      // Undo, not a confirm: the safety net comes after the action, so tidying up never costs a
      // dialog. Nothing is destroyed either way - storage unfiles the citations rather than
      // deleting them - and the tray says exactly how many came back to the library.
      const { unfiled, citationIds } = await store.deleteProject(project.id);
      const moved =
        unfiled === 0
          ? ''
          : ` ${unfiled} citation${unfiled === 1 ? '' : 's'} moved back to your library.`;
      showInfoTray({
        message: `Deleted “${project.name}”.${moved}`,
        actionLabel: 'Undo',
        duration: 8000,
        onAction: async () => {
          // The same name check every other route to a collection makes: one made with this name
          // since (here or in another tab) keeps it, and this one comes back as "(restored)".
          await store.refresh();
          const name = freeCollectionName(project.name, store.getState().projects);
          const restoredId = await store.createProject(name, project.description || '');
          await store.refileCitations(citationIds, restoredId);
          showInfoTray({
            message:
              name === project.name
                ? `“${name}” is back, with everything that was in it.`
                : `“${project.name}” is back as “${name}”, because another collection now has ` +
                  'that name. Everything that was in it is there.',
            duration: name === project.name ? 3000 : 8000,
          });
        },
      });
    },
  });

  /** The rail reports what the library is actually showing, so the count it announces is true. */
  const refreshSidebar = snap =>
    sidebar.update(snap, { visibleCount: store.getVisibleCitations().length });
  store.subscribe(refreshSidebar);
  refreshSidebar(store.getState());

  document.getElementById('assist-lib-sidebar-host').appendChild(sidebar.el);
  const mainEl = document.getElementById('assist-lib-main');
  const loading = document.getElementById('assist-lib-loading');
  if (loading) {
    loading.remove();
  }
  mainEl.appendChild(view.el);
}

main().catch(err => {
  console.error('[citation-library] failed to start:', err);
  const mainEl = document.getElementById('assist-lib-main');
  if (mainEl) {
    mainEl.textContent = 'Sorry — the citation library could not load. Please reopen it.';
  }
});
