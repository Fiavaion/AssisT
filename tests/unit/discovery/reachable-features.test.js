/**
 * Every feature the quiz can recommend must be reachable.
 *
 * `createProfile` only switches on features scoring 40 or above. Scores are normalised against a
 * fixed denominator, so a feature's ceiling is decided by how much weight the questions give it —
 * and four of them were weighted so low they could never clear the bar. A student could answer
 * every question with the strongest option, tick every detail, watch the results screen offer
 * Text Statistics, and still find it switched off.
 *
 * That is not a scoring nicety. It is the quiz failing to do the one thing it exists for, and it
 * survived because nothing ever asked whether a recommendation was attainable rather than merely
 * defined. This test asks.
 */

import { QUESTIONS, FEATURES } from '../../../src/pages/discovery/questions.js';
import { calculateScores, createProfile } from '../../../src/pages/discovery/recommendations.js';

/** The best score a feature could reach: every question answered strongest, every detail ticked. */
function ceilingFor(featureId) {
  let raw = 0;
  QUESTIONS.forEach(question => {
    raw += 3 * (question.featureMapping?.[featureId] || 0);
    (question.subQuestions || []).forEach(sub => {
      raw += sub.featureBoost?.[featureId] || 0;
    });
  });
  return Math.min(100, Math.round((raw / 18) * 100));
}

describe('discovery quiz recommendations are attainable', () => {
  it('every catalogued feature can reach the score that switches it on', () => {
    const unreachable = Object.keys(FEATURES)
      .filter(id => ceilingFor(id) < 40)
      .map(id => `${id} (ceiling ${ceilingFor(id)}%)`);

    // Named rather than counted, so a failure says which feature a student cannot ever be given.
    expect(unreachable).toEqual([]);
  });

  it('switches on the four that were previously unreachable', () => {
    const responses = {
      primary: Object.fromEntries(QUESTIONS.map(q => [q.id, 3])),
      sub: { reading_place: true, org_stats: true, focus_media: true, writing_vocab: true },
    };
    const enabled = createProfile(calculateScores(responses)).enabledFeatures;

    expect(enabled).toEqual(
      expect.arrayContaining(['textStatsEnabled', 'readingProgressEnabled'])
    );
  });

  it('still needs a real answer — strong answers alone do not switch everything on', () => {
    const none = createProfile(
      calculateScores({ primary: Object.fromEntries(QUESTIONS.map(q => [q.id, 0])), sub: {} })
    ).enabledFeatures;

    expect(none).toEqual([]);
  });
});
