/**
 * @jest-environment jsdom
 *
 * The loading spinner in each of the eight AI feature panels.
 *
 * Every one of them spun a border-top ring forever with no regard for the student's own
 * setting, so a student who has asked the operating system for less motion got a perpetual
 * rotation in the middle of the panel they were waiting on (WCAG 2.2 SC 2.3.3, and for
 * vestibular and attention reasons the point of the whole extension).
 *
 * The spinners keep their shape; only the rotation stops.
 */

const SPINNERS = [
  {
    name: 'Summarization',
    module: '../../../src/features/summarization/summarization.js',
    show: 'summarization_show',
    hide: 'summarization_hide',
    styleId: 'assist-summarization-styles',
    spinner: '.assist-summary-spinner',
  },
  {
    name: 'Text Simplification',
    module: '../../../src/features/textSimplification/textSimplification.js',
    show: 'simplification_show',
    hide: 'simplification_hide',
    styleId: 'assist-simplification-styles',
    spinner: '.assist-simplify-spinner',
  },
  {
    name: 'Assignment Breakdown',
    module: '../../../src/features/assignmentBreakdown/assignmentBreakdown.js',
    show: 'breakdown_show',
    hide: 'breakdown_hide',
    styleId: 'assist-breakdown-styles',
    spinner: '.assist-breakdown-spinner',
  },
  {
    name: 'Citation Analyzer',
    module: '../../../src/features/citationAnalyzer/citationAnalyzer.js',
    show: 'citation_show',
    hide: 'citation_hide',
    styleId: 'assist-citation-styles',
    spinner: '.assist-citation-spinner',
  },
  {
    name: 'Multi-Document Compare',
    module: '../../../src/features/multiDocCompare/multiDocCompare.js',
    show: 'mdc_show',
    hide: 'mdc_hide',
    styleId: 'assist-mdc-styles',
    spinner: '.mdc-spinner',
  },
  {
    name: 'Study Path Generator',
    module: '../../../src/features/studyPathGenerator/studyPathGenerator.js',
    show: 'spg_show',
    hide: 'spg_hide',
    styleId: 'assist-spg-styles',
    spinner: '.spg-spinner',
  },
  {
    name: 'Socratic Tutor',
    module: '../../../src/features/socraticTutor/socraticTutor.js',
    show: 'tutor_show',
    hide: 'tutor_hide',
    styleId: 'assist-tutor-styles',
    spinner: '.assist-tutor-spinner',
  },
  {
    name: 'Knowledge Graph',
    module: '../../../src/features/knowledgeGraph/knowledgeGraph.js',
    show: 'graph_show',
    hide: 'graph_hide',
    styleId: 'assist-kg-styles',
    spinner: '.kg-spinner',
  },
];

describe.each(SPINNERS)('$name spinner', spec => {
  let mod;

  beforeAll(async () => {
    chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mod = await import(spec.module);
  });

  beforeEach(() => {
    chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  test('stops rotating when the student has asked for reduced motion', async () => {
    await mod[spec.show]();

    const styles = document.getElementById(spec.styleId);
    expect(styles).not.toBeNull();

    const css = styles.textContent.replace(/\s+/g, ' ');
    const rule = new RegExp(
      `@media \\(prefers-reduced-motion: reduce\\) \\{[^}]*\\${spec.spinner}[^}]*animation: none`
    );
    expect(css).toMatch(rule);

    mod[spec.hide]();
  });
});
