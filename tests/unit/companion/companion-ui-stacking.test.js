/**
 * Floating-card stacking — simultaneously-open companion cards must never cover each other.
 */
import {
  createCompanionCard,
  fitFloatingCard,
  restackFloatingCards,
} from '../../../src/features/companion/companion-ui.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

test('two floating cards get distinct bottom offsets', () => {
  const a = createCompanionCard({ id: 'card-a', title: 'A', floating: true });
  document.body.appendChild(a.root);
  const b = createCompanionCard({ id: 'card-b', title: 'B', floating: true });
  document.body.appendChild(b.root);

  restackFloatingCards();

  expect(a.root.style.bottom).not.toBe('');
  expect(b.root.style.bottom).not.toBe('');
  expect(a.root.style.bottom).not.toBe(b.root.style.bottom);
});

test('closing a card restacks the remainder back toward the base offset', () => {
  const a = createCompanionCard({ id: 'card-a', title: 'A', floating: true });
  document.body.appendChild(a.root);
  const b = createCompanionCard({ id: 'card-b', title: 'B', floating: true });
  document.body.appendChild(b.root);
  restackFloatingCards();

  a.close();

  expect(document.getElementById('card-a')).toBeNull();
  expect(b.root.style.bottom).toBe('16px');
});

test('in-flow cards are untouched by restacking', () => {
  const inflow = createCompanionCard({ id: 'card-inflow', title: 'In flow' });
  document.body.appendChild(inflow.root);
  restackFloatingCards();
  expect(inflow.root.style.bottom).toBe('');
});

/**
 * A fixed card cannot be scrolled back into view, so a card that does not fit has to be capped and
 * brought down the screen. The sizes here are the ones measured on the overnight run: the first-run
 * study tip was 280px tall above a 207px rail in a 400px-high window, and 448px tall at 320x640.
 */
describe('fitting a floating card to a small window', () => {
  test('caps a card to the room above the controls below it', () => {
    const fit = fitFloatingCard(207, 280, 400);
    expect(fit.maxHeight).toBe(177);
    expect(fit.height).toBe(177);
    expect(400 - fit.bottom - fit.height).toBeGreaterThanOrEqual(0);
  });

  test('never places a card off the top of the screen', () => {
    for (const [base, height, viewport] of [
      [207, 280, 400],
      [85, 448, 640],
      [500, 280, 400],
      [16, 900, 640],
    ]) {
      const fit = fitFloatingCard(base, height, viewport);
      expect(viewport - fit.bottom - fit.height).toBeGreaterThanOrEqual(0);
      expect(fit.bottom).toBeGreaterThanOrEqual(16);
    }
  });

  test('brings a card down the screen when the room left is below the readable minimum', () => {
    const fit = fitFloatingCard(500, 280, 400);
    expect(fit.height).toBe(120);
    expect(fit.bottom).toBeLessThan(500);
  });

  test('leaves the stylesheet to size a card that already fits', () => {
    const fit = fitFloatingCard(16, 280, 800);
    expect(fit.maxHeight).toBeNull();
    expect(fit.bottom).toBe(16);
  });

  test('changes nothing when the window cannot be measured', () => {
    expect(fitFloatingCard(16, 280, 0)).toEqual({ bottom: 16, height: 280, maxHeight: null });
  });

  test('the close button sits outside the part of a floating card that scrolls', () => {
    const card = createCompanionCard({ id: 'card-scroll', title: 'Tall', floating: true });
    document.body.appendChild(card.root);

    const header = card.root.querySelector('.assist-companion-card__header');
    expect(header.contains(card.root.querySelector('.assist-companion-card__close'))).toBe(true);
    expect(card.body.classList.contains('assist-companion-card__body')).toBe(true);
    expect(header.parentElement).toBe(card.root);
    expect(card.body.contains(header)).toBe(false);
  });
});
