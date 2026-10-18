#!/usr/bin/env node
/**
 * Cross-check AssisT's citation formatters against the Citation Style Language styles that Zotero
 * and Mendeley use, rendered with citeproc-js.
 *
 * A developer tool, not a test gate: it never fails on a difference. It prints each fixture set
 * (scripts/csl-crosscheck-fixtures.mjs) in all four styles through both processors and writes a
 * side-by-side report for a person to judge.
 *
 *   npm run csl:crosscheck
 *
 * - Style and locale files are downloaded from the official CSL repositories at a pinned commit
 *   into .cache/csl/ (gitignored: the styles are CC BY-SA and are never committed). Override the
 *   commits with CSL_STYLES_REF / CSL_LOCALES_REF to compare against another revision.
 * - Every AssisT record reaches citeproc through the project's own exporter (csl-adapter.js
 *   `toCSL`), so the run also shows what that exporter hands to a CSL processor. Its private
 *   overflow key is removed first: a CSL processor never reads it.
 * - Judgements live in docs/planning/citations/csl-verdicts.json (optional, gitignored), keyed as
 *   the report prints them; anything without one is reported as "unreviewed".
 * - The report goes to docs/planning/citations/CSL-CROSSCHECK.md (gitignored).
 *
 * citeproc is a devDependency and is only loaded here; nothing in src/ imports it.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FIXTURE_SETS, OPEN_RULES } from './csl-crosscheck-fixtures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache', 'csl');
const REPORT = join(ROOT, 'docs', 'planning', 'citations', 'CSL-CROSSCHECK.md');
const VERDICTS = join(ROOT, 'docs', 'planning', 'citations', 'csl-verdicts.json');

/** Pinned so a re-run compares against the same files; checked 2026-09-27. */
const STYLES_REF = process.env.CSL_STYLES_REF || '2e9355847feffe53d0e9f82cd8ee119c4a0ff2db';
const LOCALES_REF = process.env.CSL_LOCALES_REF || 'a89adece41013402236e2c9020972d7e931fbab8';
const RAW = 'https://raw.githubusercontent.com/citation-style-language';

/** AssisT style id → the CSL style it is compared with, and the locale it is rendered in. */
const STYLES = [
  { id: 'harvard', file: 'harvard-cite-them-right.csl', lang: 'en-GB' },
  { id: 'apa7', file: 'apa.csl', lang: 'en-US' },
  { id: 'mla9', file: 'modern-language-association.csl', lang: 'en-US' },
  // chicago-author-date.csl is the 18th edition since 2025; AssisT follows the 17th.
  { id: 'chicago17', file: 'chicago-author-date-17th-edition.csl', lang: 'en-US' },
];
const LOCALES = ['en-GB', 'en-US'];

const require = createRequire(import.meta.url);
const CSL = require('citeproc');
const citeprocVersion = require('citeproc/package.json').version;

const srcUrl = rel => pathToFileURL(join(ROOT, 'src', 'features', 'citations', rel)).href;
const { formatBibliography, formatInText } = await import(srcUrl('citation-styles/index.js'));
const { toCSL } = await import(srcUrl('csl-adapter.js'));

/**
 * A file from the cache, downloading it on first use.
 * @param {string} name - file name in the cache
 * @param {string} url
 * @returns {Promise<string>}
 */
async function cached(name, url) {
  const path = join(CACHE, name);
  if (existsSync(path)) {
    return readFile(path, 'utf8');
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  const text = await response.text();
  await writeFile(path, text, 'utf8');
  return text;
}

/** @returns {Promise<{styles: Object<string,string>, locales: Object<string,string>}>} */
async function loadCslFiles() {
  await mkdir(CACHE, { recursive: true });
  const styles = {};
  for (const s of STYLES) {
    styles[s.id] = await cached(`${STYLES_REF.slice(0, 12)}-${s.file}`, `${RAW}/styles/${STYLES_REF}/${s.file}`);
  }
  const locales = {};
  for (const lang of LOCALES) {
    const file = `locales-${lang}.xml`;
    locales[lang] = await cached(`${LOCALES_REF.slice(0, 12)}-${file}`, `${RAW}/locales/${LOCALES_REF}/${file}`);
  }
  return { styles, locales };
}

/** The metadata header of a style file, for the report. */
function styleInfo(xml) {
  const pick = tag => (xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1] || '';
  return { title: pick('title'), updated: pick('updated') };
}

/**
 * A record as a CSL processor receives it from the project's exporter, and what the exporter kept
 * only in its private overflow key (which no CSL processor reads).
 */
function exported(citation) {
  const { 'assist:extras': overflow, ...item } = toCSL(citation);
  const carriedInCsl = ['editors', 'place', 'edition', 'thesisType', 'institution', 'organisationAuthors'];
  const overflowOnly = Object.entries(overflow.extra || {})
    .filter(([key, value]) => !carriedInCsl.includes(key) && value !== '' && value !== undefined)
    .map(([key]) => `extra.${key}`);
  return { item: { ...item, id: String(citation.id) }, overflowOnly };
}

/**
 * One citeproc engine per style, reused for every set: building one parses the style, which takes
 * seconds for the Chicago file. Every fixture id is unique, and `updateItems` replaces the
 * engine's registry with each set, so no set sees another's items.
 * @returns {{engine: Object, items: Object<string, Object>}}
 */
function cslEngine(style, files) {
  const items = {};
  const sys = {
    retrieveLocale: lang => files.locales[lang] || files.locales['en-US'],
    retrieveItem: id => items[id],
  };
  const engine = new CSL.Engine(sys, files.styles[style.id], style.lang);
  engine.setOutputFormat('text');
  return { engine, items };
}

/**
 * Render one set in one style with citeproc.
 * @returns {{order: string[], refs: Object<string,string>, inText: Object<string,string>, errors: string[]}}
 */
function renderCsl(set, { engine, items }) {
  for (const c of set.citations) {
    items[String(c.id)] = exported(c).item;
  }
  engine.updateItems(set.citations.map(c => String(c.id)));
  const [meta, entries] = engine.makeBibliography();
  const order = meta.entry_ids.map(entry => String(entry[0]));
  const refs = Object.fromEntries(order.map((id, i) => [id, entries[i]]));
  const inText = {};
  for (const c of set.citations) {
    const cite = { id: String(c.id), ...(c.locator ? { locator: c.locator, label: 'page' } : {}) };
    inText[cite.id] = engine.makeCitationCluster([cite]);
  }
  return { order, refs, inText, errors: meta.bibliography_errors.map(e => JSON.stringify(e)) };
}

/** Render one set in one style with AssisT, the list through formatBibliography as it is copied. */
function renderAssist(set, style) {
  const entries = formatBibliography(set.citations, style.id).split('\n\n');
  const key = text => norm(text).toLowerCase();
  const order = [];
  const refs = {};
  for (const entry of entries) {
    const owner = set.citations.find(
      c => !order.includes(String(c.id)) && key(entry).includes(key(c.title).slice(0, 18))
    );
    const id = owner ? String(owner.id) : `unmatched-${order.length}`;
    order.push(id);
    refs[id] = entry;
  }
  const inText = {};
  for (const c of set.citations) {
    inText[String(c.id)] = formatInText(c, style.id, { set: set.citations, locator: c.locator });
  }
  return { order, refs, inText };
}

/** Whitespace, quotation marks and ellipses to one form; italics are already absent (plain text). */
function norm(text) {
  return String(text ?? '')
    .replace(/[   ]/g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * How close two renderings are, after normalisation: 'same'; 'dash' (only en/em dash against
 * hyphen); 'case' (only capitals); 'dash+case'; or 'differs'.
 */
function compare(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (x === y) {
    return 'same';
  }
  const undash = s => s.replace(/[–—]/g, '-');
  if (undash(x) === undash(y)) {
    return 'dash';
  }
  if (x.toLowerCase() === y.toLowerCase()) {
    return 'case';
  }
  if (undash(x).toLowerCase() === undash(y).toLowerCase()) {
    return 'dash+case';
  }
  return 'differs';
}

/** Markdown table cell. */
const cell = text => norm(text).replace(/\|/g, '\\|') || '—';

async function loadVerdicts() {
  if (!existsSync(VERDICTS)) {
    return { rules: {}, diffs: {} };
  }
  const parsed = JSON.parse(await readFile(VERDICTS, 'utf8'));
  return { rules: parsed.rules || {}, diffs: parsed.diffs || {}, exporter: parsed.exporter || '' };
}

function run(files) {
  const rows = [];
  const exporterLosses = new Map();
  const engines = Object.fromEntries(STYLES.map(s => [s.id, cslEngine(s, files)]));
  for (const set of FIXTURE_SETS) {
    for (const c of set.citations) {
      for (const field of exported(c).overflowOnly) {
        exporterLosses.set(`${set.id}/${c.id}`, [...(exporterLosses.get(`${set.id}/${c.id}`) || []), field]);
      }
    }
    for (const style of STYLES) {
      const csl = renderCsl(set, engines[style.id]);
      const assist = renderAssist(set, style);
      if (set.citations.length > 1) {
        const a = assist.order.join(' < ');
        const b = csl.order.join(' < ');
        rows.push({ style: style.id, set, item: 'list', kind: 'order', assist: a, csl: b, level: a === b ? 'same' : 'differs' });
      }
      for (const c of set.citations) {
        const id = String(c.id);
        for (const kind of ['reference', 'in-text']) {
          const a = kind === 'reference' ? assist.refs[id] : assist.inText[id];
          const b = kind === 'reference' ? csl.refs[id] : csl.inText[id];
          rows.push({ style: style.id, set, item: id, kind, assist: a, csl: b, level: compare(a, b) });
        }
      }
      for (const error of csl.errors) {
        rows.push({ style: style.id, set, item: 'list', kind: 'citeproc error', assist: '', csl: error, level: 'differs' });
      }
    }
  }
  return { rows, exporterLosses };
}

const AUTO_VERDICT = {
  same: 'same',
  dash: 'typography: dashes only',
  case: 'capitals only',
  'dash+case': 'capitals and dashes only',
};

const keyOf = row => `${row.style}/${row.set.id}/${row.item}/${row.kind}`;

/** A verdict key may use `*` for any run of characters within one segment; the first match wins. */
const keyPattern = key =>
  new RegExp(`^${key.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);

/**
 * A row's verdict. A row that matches outright never takes one from the file; an exact key judges
 * any other row, while a wildcard key judges only rows that differ beyond dashes and capitals,
 * which keep their automatic verdict.
 */
function verdictFor(row, verdicts) {
  if (row.level !== 'same') {
    const key = keyOf(row);
    const judged = Object.entries(verdicts.diffs).find(
      ([pattern]) =>
        pattern === key || (row.level === 'differs' && pattern.includes('*') && keyPattern(pattern).test(key))
    );
    if (judged) {
      return judged[1];
    }
  }
  return { verdict: AUTO_VERDICT[row.level] || 'unreviewed', ref: '' };
}

function report({ rows, exporterLosses }, files, verdicts) {
  const out = [];
  const today = new Date().toISOString().slice(0, 10);
  out.push('# CSL cross-check of the AssisT citation formatters');
  out.push('');
  out.push(`Generated ${today} by \`npm run csl:crosscheck\` (scripts/csl-crosscheck.mjs). Internal, never committed.`);
  out.push('');
  out.push(`citeproc-js ${citeprocVersion}. Styles from citation-style-language/styles @ \`${STYLES_REF}\`, locales from citation-style-language/locales @ \`${LOCALES_REF}\`.`);
  out.push('');
  out.push('| AssisT style | CSL file | CSL title | updated | locale |');
  out.push('|---|---|---|---|---|');
  for (const s of STYLES) {
    const info = styleInfo(files.styles[s.id]);
    out.push(`| ${s.id} | ${s.file} | ${info.title} | ${info.updated} | ${s.lang} |`);
  }
  out.push('');
  out.push('Comparison is on plain text after normalising whitespace, curly quotes and ellipses; italics are not compared. Verdicts marked "capitals only" or "typography" are assigned automatically; every other verdict comes from csl-verdicts.json or reads "unreviewed". "Typography: dashes" means the only difference is a hyphen against an en or em dash, such as MLA\'s repeated author, which AssisT writes as three hyphens where the MLA CSL uses em dashes. "Capitals" means the only difference is letter case: the MLA and Chicago CSL styles convert titles to title case, which AssisT leaves to the student (the capitals hint).');
  out.push('');

  out.push('## Open rules (owner list)');
  out.push('');
  out.push('| Rule | Style | AssisT | CSL | CSL does | Confirms / contradicts / silent |');
  out.push('|---|---|---|---|---|---|');
  for (const rule of OPEN_RULES) {
    const styles = rule.style ? [rule.style] : STYLES.map(s => s.id);
    const judged = verdicts.rules[rule.id] || {};
    for (const style of styles) {
      const shown = rows.filter(r => r.style === style && r.set.id === rule.set && r.kind !== 'order');
      const kinds = rule.id === 'short-title' ? ['in-text'] : ['reference', 'in-text'];
      const pick = side =>
        shown
          .filter(r => kinds.includes(r.kind))
          .map(r => cell(r[side]))
          .join('<br>');
      const perStyle = (judged.styles && judged.styles[style]) || judged;
      out.push(`| ${rule.rule} | ${style} | ${pick('assist')} | ${pick('csl')} | ${perStyle.csl || '—'} | ${perStyle.verdict || 'unreviewed'} |`);
    }
  }
  out.push('');

  out.push('## Summary of differences');
  out.push('');
  const counts = new Map();
  for (const row of rows) {
    const { verdict } = verdictFor(row, verdicts);
    counts.set(verdict, (counts.get(verdict) || 0) + 1);
  }
  out.push('| Verdict | Count |');
  out.push('|---|---|');
  for (const [verdict, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    out.push(`| ${verdict} | ${count} |`);
  }
  out.push('');

  const wrong = rows.filter(r => verdictFor(r, verdicts).verdict === 'AssisT wrong');
  out.push('## AssisT wrong');
  out.push('');
  if (wrong.length === 0) {
    out.push('None judged so.');
  } else {
    out.push('| Style | Case | Part | AssisT | CSL | Why | Reference |');
    out.push('|---|---|---|---|---|---|---|');
    for (const r of wrong) {
      const v = verdictFor(r, verdicts);
      out.push(`| ${r.style} | ${r.set.id} | ${r.item} ${r.kind} | ${cell(r.assist)} | ${cell(r.csl)} | ${cell(v.note)} | ${cell(v.ref)} |`);
    }
  }
  out.push('');

  for (const style of STYLES) {
    out.push(`## ${style.id} (${style.file})`);
    out.push('');
    out.push('| Case | Part | AssisT | CSL | Match | Verdict | Reference / note |');
    out.push('|---|---|---|---|---|---|---|');
    for (const r of rows.filter(row => row.style === style.id)) {
      const v = verdictFor(r, verdicts);
      const refNote = [v.ref, v.note].filter(Boolean).join(' — ');
      out.push(`| ${r.set.id} | ${r.item} ${r.kind} | ${cell(r.assist)} | ${cell(r.csl)} | ${r.level} | ${v.verdict} | ${cell(refNote)} |`);
    }
    out.push('');
  }

  out.push('## What the CSL exporter hands on');
  out.push('');
  out.push('Fields the fixtures record that `toCSL` keeps only in its private `assist:extras` key, which no CSL processor reads:');
  out.push('');
  if (exporterLosses.size === 0) {
    out.push('None.');
  } else {
    for (const [where, fields] of exporterLosses) {
      out.push(`- ${where}: ${fields.join(', ')}`);
    }
  }
  if (verdicts.exporter) {
    out.push('');
    out.push(verdicts.exporter);
  }
  out.push('');
  return out.join('\n');
}

const files = await loadCslFiles();
const verdicts = await loadVerdicts();
const result = run(files);
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, report(result, files, verdicts), 'utf8');

const tally = result.rows.reduce((acc, r) => ({ ...acc, [r.level]: (acc[r.level] || 0) + 1 }), {});
console.log(`CSL cross-check: ${result.rows.length} comparisons`, tally);
console.log(`Report: ${REPORT}`);
