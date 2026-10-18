/**
 * @jest-environment jsdom
 *
 * Unit tests for wizard/wizard-step.js — a single EF-labelled capture step.
 */

import { createWizardStep } from '../../../../../src/features/citations/ui/wizard/wizard-step.js';

function makeWhatStep(overrides = {}) {
  return createWizardStep({
    id: 'what',
    legend: 'What is the source?',
    help: 'Start with its title.',
    fields: [
      {
        key: 'title',
        label: 'Title',
        type: 'text',
        placeholder: 'e.g. The Origin of Species',
        hint: 'The name of the page, article, or book.',
        required: true,
      },
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'website', label: 'Website' },
          { value: 'book', label: 'Book' },
        ],
      },
    ],
    ...overrides,
  });
}

describe('createWizardStep()', () => {
  test('renders a labelled section, legend, help and fields with real labels + placeholders', () => {
    const step = makeWhatStep();
    expect(step.el.tagName).toBe('SECTION');
    expect(step.el.querySelector('.assist-cite-step__legend').textContent).toContain('What is the source?');
    expect(step.el.querySelector('.assist-cite-step__help').textContent).toContain('title');

    const titleInput = step.el.querySelector('#' + step.el.querySelector('label').getAttribute('for'));
    expect(titleInput.placeholder).toContain('Origin of Species');
    // Placeholder is an example, the label is real and marks required.
    expect(step.el.querySelector('label').textContent).toMatch(/Title.*required/i);
    // Field is described by its hint.
    expect(titleInput.getAttribute('aria-describedby')).toBeTruthy();
  });

  test('pre-fills field values from the draft (redundant-entry avoidance)', () => {
    const step = makeWhatStep({ draft: { title: 'Captured Title', type: 'book' } });
    const inputs = step.el.querySelectorAll('input, select');
    expect(inputs[0].value).toBe('Captured Title');
    expect(inputs[1].value).toBe('book');
  });

  test('fires onChange live as the user types (text input)', () => {
    const onChange = jest.fn();
    const step = makeWhatStep({ onChange });
    const input = step.el.querySelector('input');
    input.value = 'Hello';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('title', 'Hello');
  });

  test('select fires onChange on change with the chosen value', () => {
    const onChange = jest.fn();
    const step = makeWhatStep({ onChange });
    const select = step.el.querySelector('select');
    select.value = 'book';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('type', 'book');
  });

  test('authors field reads/writes draft.authors as an array (one per line)', () => {
    const onChange = jest.fn();
    const step = createWizardStep({
      id: 'who',
      legend: 'Who made it?',
      fields: [{ key: 'authors', label: 'Authors', type: 'authors' }],
      draft: { authors: ['Darwin, Charles', 'Wallace, Alfred'] },
      onChange,
    });
    const ta = step.el.querySelector('textarea');
    expect(ta.value).toBe('Darwin, Charles\nWallace, Alfred');

    ta.value = 'Smith, J.\n\n  Jones, M.  ';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('authors', ['Smith, J.', 'Jones, M.']);
  });

  test('validate() flags an empty required field with a role=alert error and aria-invalid', () => {
    const step = makeWhatStep();
    const result = step.validate();
    expect(result.valid).toBe(false);
    expect(result.firstInvalidKey).toBe('title');
    const input = step.el.querySelector('input');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const err = step.el.querySelector('[role="alert"]');
    expect(err.hidden).toBe(false);
    expect(err.textContent).toMatch(/title/i);
  });

  test('validate() passes once the required field is filled', () => {
    const step = makeWhatStep({ draft: { title: 'A Title' } });
    expect(step.validate().valid).toBe(true);
    expect(step.el.querySelector('input').getAttribute('aria-invalid')).toBeNull();
  });

  test('typing clears a previously shown error', () => {
    const step = makeWhatStep();
    step.validate(); // shows the error
    const input = step.el.querySelector('input');
    input.value = 'Now filled';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(step.el.querySelector('[role="alert"]').hidden).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  test('refresh() re-populates controls from a new draft', () => {
    const step = makeWhatStep();
    step.refresh({ title: 'Refreshed', type: 'book' });
    expect(step.el.querySelector('input').value).toBe('Refreshed');
    expect(step.el.querySelector('select').value).toBe('book');
  });

  test('destroy() removes listeners (no further onChange)', () => {
    const onChange = jest.fn();
    const step = makeWhatStep({ onChange });
    step.destroy();
    const input = step.el.querySelector('input');
    input.value = 'x';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("the 'tags' field type", () => {
  function makeTagStep(draft = {}) {
    const changes = [];
    const step = createWizardStep({
      id: 'notes',
      legend: 'Notes',
      draft,
      onChange: (key, value) => changes.push([key, value]),
      fields: [
        { key: 'tags', label: 'Tags', type: 'tags', placeholder: 'e.g. memory, ADHD' },
      ],
    });
    return { step, changes };
  }

  test('shows existing tags as a comma-separated list', () => {
    const { step } = makeTagStep({ tags: ['memory', 'ADHD'] });
    expect(step.el.querySelector('input').value).toBe('memory, ADHD');
  });

  test('reads a typed list back as a trimmed, de-duplicated array', () => {
    const { step, changes } = makeTagStep({});
    const input = step.el.querySelector('input');
    input.value = ' memory ,ADHD,  memory ,, ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(changes[changes.length - 1]).toEqual(['tags', ['memory', 'ADHD']]);
  });

  test('an empty box means no tags, not a tag with no name', () => {
    const { step, changes } = makeTagStep({ tags: ['memory'] });
    const input = step.el.querySelector('input');
    input.value = '   ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(changes[changes.length - 1]).toEqual(['tags', []]);
  });
});

