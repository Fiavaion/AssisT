/**
 * SM-2-lite spaced-repetition scheduler.
 *
 * Pure — no chrome.*, no Date.now(). `review()` takes the current `srs` state, a grade, and
 * `now` (ms epoch) and returns a brand-new `srs` object (never mutates its input).
 *
 * Grades: 0 = again, 1 = hard, 2 = good, 3 = easy.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
const AGAIN_DELAY_MS = 10 * 60 * 1000; // 10 minutes

export const GRADES = Object.freeze({ AGAIN: 0, HARD: 1, GOOD: 2, EASY: 3 });

const MIN_EASE = 1.3;
const MAX_EASE = 2.8;
const MIN_INTERVAL_DAYS = 1;

/**
 * Apply one review outcome to an srs state, returning a new state.
 * @param {{interval:number, ease:number, due:number, reps:number, lapses:number}} srs
 * @param {number} grade - 0 (again) | 1 (hard) | 2 (good) | 3 (easy)
 * @param {number} now - ms epoch
 * @returns {object} new srs state
 */
export function review(srs, grade, now) {
  switch (grade) {
    case GRADES.AGAIN:
      return {
        ...srs,
        interval: 0,
        reps: 0,
        lapses: srs.lapses + 1,
        due: now + AGAIN_DELAY_MS,
      };

    case GRADES.HARD: {
      const interval = Math.max(MIN_INTERVAL_DAYS, srs.interval * 1.2);
      const ease = Math.max(MIN_EASE, srs.ease - 0.15);
      return { ...srs, interval, ease, reps: srs.reps + 1, due: now + interval * DAY_MS };
    }

    case GRADES.GOOD: {
      let interval;
      if (srs.reps === 0) {
        interval = 1;
      } else if (srs.reps === 1) {
        interval = 3;
      } else {
        interval = srs.interval * srs.ease;
      }
      return { ...srs, interval, reps: srs.reps + 1, due: now + interval * DAY_MS };
    }

    case GRADES.EASY: {
      const interval = Math.max(MIN_INTERVAL_DAYS, srs.interval * srs.ease * 1.3);
      const ease = Math.min(MAX_EASE, srs.ease + 0.15);
      return { ...srs, interval, ease, reps: srs.reps + 1, due: now + interval * DAY_MS };
    }

    default:
      throw new Error(`Invalid grade: ${grade}`);
  }
}

/**
 * Cards that are due for review, soonest first.
 * @param {object[]} cards - each with a `srs.due` field
 * @param {number} now - ms epoch
 * @param {number} [limit=20]
 * @returns {object[]}
 */
export function dueCards(cards, now, limit = 20) {
  return cards
    .filter(card => card.srs.due <= now)
    .slice()
    .sort((a, b) => a.srs.due - b.srs.due)
    .slice(0, limit);
}

function endOfUTCDay(now, daysAhead) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysAhead + 1, 0, 0, 0, 0);
}

/**
 * Forecast how many cards come due today, tomorrow, and within the next 7 days.
 * `today` includes anything already overdue. `tomorrow` counts only cards newly due on the
 * following calendar day (UTC). `thisWeek` is cumulative through 7 days from `now`.
 * @param {object[]} cards
 * @param {number} now - ms epoch
 * @returns {{today:number, tomorrow:number, thisWeek:number}}
 */
export function forecastCounts(cards, now) {
  const todayEnd = endOfUTCDay(now, 0);
  const tomorrowEnd = endOfUTCDay(now, 1);
  const weekEnd = endOfUTCDay(now, 6);

  let today = 0;
  let tomorrow = 0;
  let thisWeek = 0;

  for (const card of cards) {
    const due = card.srs.due;
    if (due <= todayEnd) {
      today += 1;
    } else if (due <= tomorrowEnd) {
      tomorrow += 1;
    }
    if (due <= weekEnd) {
      thisWeek += 1;
    }
  }

  return { today, tomorrow, thisWeek };
}
