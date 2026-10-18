/**
 * @jest-environment jsdom
 *
 * Unit tests for wizard/breadcrumb.js — the non-interactive step rail.
 */

import { createBreadcrumb } from '../../../../../src/features/citations/ui/wizard/breadcrumb.js';

const STEPS = [
  { id: 'what', label: 'What' },
  { id: 'who', label: 'Who' },
  { id: 'when', label: 'When' },
  { id: 'where', label: 'Where' },
  { id: 'check', label: 'Check' },
];

describe('createBreadcrumb()', () => {
  test('renders one item per step with its label, in order', () => {
    const bc = createBreadcrumb({ steps: STEPS });
    const items = bc.el.querySelectorAll('.assist-cite-breadcrumb__step');
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toContain('What');
    expect(items[4].textContent).toContain('Check');
  });

  test('the current step has the current class and aria-current="step"', () => {
    const bc = createBreadcrumb({ steps: STEPS, current: 'when' });
    const current = bc.el.querySelector('[aria-current="step"]');
    expect(current.textContent).toContain('When');
    expect(current.classList.contains('assist-cite-breadcrumb__step--current')).toBe(true);
  });

  test('defaults the current step to the first when not given', () => {
    const bc = createBreadcrumb({ steps: STEPS });
    expect(bc.el.querySelector('[aria-current="step"]').textContent).toContain('What');
  });

  test('setCurrent moves aria-current and is exclusive', () => {
    const bc = createBreadcrumb({ steps: STEPS });
    bc.setCurrent('where');
    const currents = bc.el.querySelectorAll('[aria-current="step"]');
    expect(currents).toHaveLength(1);
    expect(currents[0].textContent).toContain('Where');
  });

  test('setCurrent ignores an unknown id', () => {
    const bc = createBreadcrumb({ steps: STEPS, current: 'what' });
    bc.setCurrent('nope');
    expect(bc.el.querySelector('[aria-current="step"]').textContent).toContain('What');
  });

  test('setCompleted marks done steps but never the current one', () => {
    const bc = createBreadcrumb({ steps: STEPS, current: 'when' });
    bc.setCompleted(['what', 'who', 'when']);
    const items = bc.el.querySelectorAll('.assist-cite-breadcrumb__step');
    expect(items[0].classList.contains('assist-cite-breadcrumb__step--done')).toBe(true); // what
    expect(items[1].classList.contains('assist-cite-breadcrumb__step--done')).toBe(true); // who
    // 'when' is current, so it shows as current, not done.
    expect(items[2].classList.contains('assist-cite-breadcrumb__step--done')).toBe(false);
    expect(items[2].classList.contains('assist-cite-breadcrumb__step--current')).toBe(true);
  });

  test('the rail is wrapped in a labelled nav and is not a set of buttons', () => {
    const bc = createBreadcrumb({ steps: STEPS });
    expect(bc.el.tagName).toBe('NAV');
    expect(bc.el.getAttribute('aria-label')).toBeTruthy();
    expect(bc.el.querySelectorAll('button')).toHaveLength(0);
  });
});
