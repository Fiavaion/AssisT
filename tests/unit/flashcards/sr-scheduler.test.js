/**
 * SM-2-lite scheduler tests.
 */

import { review, dueCards, forecastCounts, DAY_MS, GRADES } from '../../../src/features/flashcards/sr-scheduler.js';

const NOW = 1700000000000;

function freshSrs(now = NOW) {
  return { interval: 0, ease: 2.5, due: now, reps: 0, lapses: 0 };
}

function makeCard(due, overrides = {}) {
  return { srs: { interval: 1, ease: 2.5, due, reps: 1, lapses: 0, ...overrides } };
}

describe('review — immutability', () => {
  test('does not mutate the input srs object', () => {
    const srs = freshSrs();
    const snapshot = { ...srs };
    review(srs, GRADES.GOOD, NOW + 1000);
    expect(srs).toEqual(snapshot);
  });

  test('returns a new object reference', () => {
    const srs = freshSrs();
    const next = review(srs, GRADES.GOOD, NOW);
    expect(next).not.toBe(srs);
  });
});

describe('review — again', () => {
  test('resets reps to 0, increments lapses, and sets due 10 minutes out', () => {
    const srs = { interval: 30, ease: 2.5, due: NOW, reps: 5, lapses: 1 };
    const next = review(srs, GRADES.AGAIN, NOW);
    expect(next.interval).toBe(0);
    expect(next.reps).toBe(0);
    expect(next.lapses).toBe(2);
    expect(next.due).toBe(NOW + 10 * 60 * 1000);
    expect(next.ease).toBe(2.5); // ease untouched by a lapse
  });
});

describe('review — hard', () => {
  test('grows the interval by 1.2x, floored at 1 day, and reduces ease by 0.15', () => {
    const srs = { interval: 10, ease: 2.0, due: NOW, reps: 3, lapses: 0 };
    const next = review(srs, GRADES.HARD, NOW);
    expect(next.interval).toBeCloseTo(12);
    expect(next.ease).toBeCloseTo(1.85);
    expect(next.reps).toBe(4);
    expect(next.due).toBe(NOW + 12 * DAY_MS);
  });

  test('floors a brand-new card at 1 day (0 * 1.2 = 0)', () => {
    const next = review(freshSrs(), GRADES.HARD, NOW);
    expect(next.interval).toBe(1);
    expect(next.due).toBe(NOW + DAY_MS);
  });

  test('floors ease at 1.3 after repeated hard reviews', () => {
    let srs = freshSrs();
    for (let i = 0; i < 9; i += 1) {
      srs = review(srs, GRADES.HARD, NOW);
    }
    expect(srs.ease).toBeCloseTo(1.3);

    // One more hard review must not push ease below the floor.
    srs = review(srs, GRADES.HARD, NOW);
    expect(srs.ease).toBeCloseTo(1.3);
  });
});

describe('review — good', () => {
  test('first review sets a 1-day interval', () => {
    const next = review(freshSrs(), GRADES.GOOD, NOW);
    expect(next.interval).toBe(1);
    expect(next.reps).toBe(1);
    expect(next.due).toBe(NOW + DAY_MS);
  });

  test('second review sets a 3-day interval', () => {
    const srs = { interval: 1, ease: 2.5, due: NOW, reps: 1, lapses: 0 };
    const next = review(srs, GRADES.GOOD, NOW);
    expect(next.interval).toBe(3);
    expect(next.reps).toBe(2);
  });

  test('third+ review multiplies interval by ease', () => {
    const srs = { interval: 3, ease: 2.5, due: NOW, reps: 2, lapses: 0 };
    const next = review(srs, GRADES.GOOD, NOW);
    expect(next.interval).toBeCloseTo(7.5);
    expect(next.reps).toBe(3);
  });

  test('good-good-good progression grows interval each step (1 -> 3 -> 7.5)', () => {
    let srs = freshSrs();
    let t = NOW;

    srs = review(srs, GRADES.GOOD, t);
    expect(srs.interval).toBe(1);
    t += 1 * DAY_MS;

    srs = review(srs, GRADES.GOOD, t);
    expect(srs.interval).toBe(3);
    t += 3 * DAY_MS;

    srs = review(srs, GRADES.GOOD, t);
    expect(srs.interval).toBeCloseTo(7.5);
    expect(srs.reps).toBe(3);
  });

  test('good does not change ease', () => {
    const srs = { interval: 5, ease: 2.1, due: NOW, reps: 2, lapses: 0 };
    const next = review(srs, GRADES.GOOD, NOW);
    expect(next.ease).toBe(2.1);
  });

  test('a lapse (again) followed by good restarts the 1/3-day bootstrap', () => {
    let srs = { interval: 20, ease: 2.0, due: NOW, reps: 6, lapses: 0 };
    srs = review(srs, GRADES.AGAIN, NOW);
    expect(srs.reps).toBe(0);

    srs = review(srs, GRADES.GOOD, NOW);
    expect(srs.interval).toBe(1);
    expect(srs.reps).toBe(1);
  });
});

describe('review — easy', () => {
  test('floors a brand-new card at 1 day and bumps ease by 0.15', () => {
    const next = review(freshSrs(), GRADES.EASY, NOW);
    expect(next.interval).toBe(1);
    expect(next.ease).toBeCloseTo(2.65);
    expect(next.reps).toBe(1);
  });

  test('multiplies interval by ease * 1.3 once past the bootstrap', () => {
    const srs = { interval: 1, ease: 2.65, due: NOW, reps: 1, lapses: 0 };
    const next = review(srs, GRADES.EASY, NOW);
    expect(next.interval).toBeCloseTo(3.445);
    expect(next.ease).toBeCloseTo(2.8);
  });

  test('caps ease at 2.8 after repeated easy reviews', () => {
    let srs = freshSrs();
    for (let i = 0; i < 5; i += 1) {
      srs = review(srs, GRADES.EASY, NOW);
    }
    expect(srs.ease).toBeLessThanOrEqual(2.8);
    expect(srs.ease).toBeCloseTo(2.8);
  });
});

describe('review — invalid grade', () => {
  test('throws for an unrecognised grade', () => {
    expect(() => review(freshSrs(), 99, NOW)).toThrow('Invalid grade: 99');
  });
});

describe('dueCards', () => {
  test('includes only cards due at or before now', () => {
    const cards = [makeCard(NOW - 1000), makeCard(NOW + 1000), makeCard(NOW)];
    const result = dueCards(cards, NOW);
    expect(result).toHaveLength(2);
  });

  test('sorts results by due date ascending', () => {
    const cards = [makeCard(NOW - 1000), makeCard(NOW - 5000), makeCard(NOW - 2000)];
    const result = dueCards(cards, NOW);
    expect(result.map((c) => c.srs.due)).toEqual([NOW - 5000, NOW - 2000, NOW - 1000]);
  });

  test('respects the default limit of 20', () => {
    const cards = Array.from({ length: 30 }, (_, i) => makeCard(NOW - i));
    const result = dueCards(cards, NOW);
    expect(result).toHaveLength(20);
  });

  test('respects a custom limit', () => {
    const cards = Array.from({ length: 10 }, (_, i) => makeCard(NOW - i));
    const result = dueCards(cards, NOW, 3);
    expect(result).toHaveLength(3);
  });

  test('returns an empty array when nothing is due', () => {
    const cards = [makeCard(NOW + 10000)];
    expect(dueCards(cards, NOW)).toEqual([]);
  });

  test('does not mutate the input array order', () => {
    const cards = [makeCard(NOW - 1000), makeCard(NOW - 5000)];
    const snapshot = [...cards];
    dueCards(cards, NOW);
    expect(cards).toEqual(snapshot);
  });
});

describe('forecastCounts', () => {
  // NOW = 2024-01-15T12:00:00Z (UTC noon) so day boundaries are unambiguous.
  const FORECAST_NOW = Date.UTC(2024, 0, 15, 12, 0, 0, 0);
  const TODAY_END = Date.UTC(2024, 0, 16, 0, 0, 0, 0);
  const TOMORROW_END = Date.UTC(2024, 0, 17, 0, 0, 0, 0);
  const WEEK_END = Date.UTC(2024, 0, 22, 0, 0, 0, 0);

  test('buckets overdue/today, tomorrow, and the rest of the week correctly', () => {
    const cards = [
      makeCard(FORECAST_NOW - DAY_MS), // overdue -> today
      makeCard(FORECAST_NOW), // due now -> today
      makeCard(TODAY_END - 1), // still today
      makeCard(TODAY_END + 1), // tomorrow
      makeCard(TOMORROW_END - 1), // still tomorrow
      makeCard(TOMORROW_END + 1), // later this week
      makeCard(WEEK_END + 1), // outside the week window
    ];

    const forecast = forecastCounts(cards, FORECAST_NOW);
    expect(forecast).toEqual({ today: 3, tomorrow: 2, thisWeek: 6 });
  });

  test('returns all zeros for an empty card list', () => {
    expect(forecastCounts([], FORECAST_NOW)).toEqual({ today: 0, tomorrow: 0, thisWeek: 0 });
  });

  test('a card due exactly at the week boundary counts toward thisWeek', () => {
    const cards = [makeCard(WEEK_END)];
    expect(forecastCounts(cards, FORECAST_NOW).thisWeek).toBe(1);
  });
});
