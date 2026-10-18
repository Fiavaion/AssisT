/**
 * @jest-environment jsdom
 *
 * The citation guide's markup, read from the real file.
 *
 * A guide is a page a student lands on cold, often with a screen reader, often zoomed in, and its
 * accessibility claims are the ones nobody notices breaking. So the structure is asserted rather
 * than assumed: one <h1>, headings that do not skip a level, a skip link that lands somewhere,
 * disclosures that are real <details>, and no contents entry pointing at a section that has been
 * renamed out from under it.
 */

import fs from 'fs';
import path from 'path';

const GUIDE_HTML = path.join(__dirname, '../../../../src/pages/citation-guide/guide.html');
const html = fs.readFileSync(GUIDE_HTML, 'utf8');

/** The parsed page, built once — every assertion here is about the file as authored. */
function parse() {
  const doc = document.implementation.createHTMLDocument('guide');
  doc.documentElement.innerHTML = html.replace(/<!doctype html>/i, '');
  return doc;
}

const doc = parse();

describe('citation guide — document structure', () => {
  it('has exactly one h1', () => {
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('names the page in its title', () => {
    expect(html).toContain('<title>AssisT — How to use citations</title>');
  });

  it('declares the page language', () => {
    expect(html).toMatch(/<html lang="en">/);
  });

  it('never skips a heading level', () => {
    const levels = [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(h =>
      Number(h.tagName[1])
    );
    expect(levels[0]).toBe(1);
    levels.slice(1).forEach((level, i) => {
      expect(level - levels[i]).toBeLessThanOrEqual(1);
    });
  });

  it('gives every section a heading that names it', () => {
    const sections = [...doc.querySelectorAll('section.guide-section')];
    expect(sections.length).toBeGreaterThan(0);
    sections.forEach(section => {
      const labelledBy = section.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      const heading = doc.getElementById(labelledBy);
      expect(heading).not.toBeNull();
      expect(heading.textContent.trim().length).toBeGreaterThan(0);
    });
  });

  it('provides the landmarks a screen-reader user navigates by', () => {
    expect(doc.querySelectorAll('main')).toHaveLength(1);
    expect(doc.querySelector('header')).not.toBeNull();
    expect(doc.querySelector('footer')).not.toBeNull();
    expect(doc.querySelector('nav')).not.toBeNull();
  });

  it('labels the contents navigation', () => {
    const nav = doc.querySelector('nav');
    const labelledBy = nav.getAttribute('aria-labelledby');
    expect(doc.getElementById(labelledBy)).not.toBeNull();
  });
});

describe('citation guide — links land somewhere', () => {
  it('has a skip link whose target exists', () => {
    const skip = doc.querySelector('a.guide-skip');
    expect(skip).not.toBeNull();
    expect(doc.getElementById(skip.getAttribute('href').slice(1))).not.toBeNull();
  });

  it('resolves every in-page link to a real element', () => {
    const anchors = [...doc.querySelectorAll('a[href^="#"]')];
    expect(anchors.length).toBeGreaterThan(0);
    const broken = anchors
      .map(a => a.getAttribute('href').slice(1))
      .filter(id => doc.getElementById(id) === null);
    expect(broken).toEqual([]);
  });

  it('lists every section in the contents, and nothing that is not one', () => {
    const listed = [...doc.querySelectorAll('.guide-contents__list a')].map(a =>
      a.getAttribute('href').slice(1)
    );
    const sections = [...doc.querySelectorAll('section.guide-section')].map(s => s.id);
    expect(listed.sort()).toEqual(sections.sort());
  });
});

describe('citation guide — progressive disclosure', () => {
  it('uses real <details>, never a div pretending to be one', () => {
    const details = [...doc.querySelectorAll('details')];
    expect(details.length).toBeGreaterThan(0);
    details.forEach(d => {
      expect(d.querySelector('summary')).not.toBeNull();
      expect(d.querySelector('summary').textContent.trim().length).toBeGreaterThan(0);
    });
    // Nothing hand-rolls the pattern with aria-expanded, which would need script to work at all.
    expect(doc.querySelectorAll('[aria-expanded]')).toHaveLength(0);
  });
});

describe('citation guide — the deep link', () => {
  it('offers the library as a real button with a name', () => {
    const buttons = [...doc.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach(button => {
      expect(button.getAttribute('type')).toBe('button');
      expect(button.textContent.trim().length).toBeGreaterThan(0);
    });
    expect(doc.getElementById('btn-guide-open-library')).not.toBeNull();
    expect(doc.getElementById('btn-guide-open-library-footer')).not.toBeNull();
  });

  it('announces the outcome through a live region', () => {
    const status = doc.getElementById('guide-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });
});

/**
 * The files section promised more than the library does: Remove duplicates merges copies holding
 * different work (it does not simply keep the first), and the AssisT JSON backup carries neither
 * collections nor the original save dates.
 */
describe('citation guide — the files section says what the library really does', () => {
  const files = doc.getElementById('files').textContent.replace(/\s+/g, ' ');

  it('no longer claims the backup restores exactly, or that dedupe keeps the first copy', () => {
    expect(files).not.toMatch(/restores exactly/);
    expect(files).not.toMatch(/keeps the first copy/);
  });

  it('says duplicates are merged and disagreeing copies left alone', () => {
    expect(files).toMatch(/one copy with all of it/);
    expect(files).toMatch(/left as they are/);
  });

  it('says what the backup does not carry', () => {
    expect(files).toMatch(/does not carry your collections/);
  });
});
