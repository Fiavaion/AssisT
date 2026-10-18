/**
 * A stand-in for src/adapters/canvas-adapter.js: the test registers it in place of the real adapter,
 * so the quiz helper can run against questions the test built with no Canvas page behind them.
 *
 * The questions come from `globalThis.__assistStubQuizQuestions` because canvas.js imports the
 * adapter itself — there is no handle to configure it through.
 *
 * It has no isCanvasPage(): canvas.js answers that from src/adapters/lms-detect.js before it imports
 * any adapter, which is why the test gives the page a Canvas marker instead.
 */

export const CanvasPageType = {
  ASSIGNMENT: 'assignment',
  QUIZ: 'quiz',
  OTHER: 'other',
};

// Deliberately not QUIZ: the test drives the quiz helper through the settings path, and a second
// entry through canvas_initialize() would inject over the same questions twice.
export function detectCanvasPageType() {
  return CanvasPageType.OTHER;
}

export async function waitForCanvasContent() {}

export function extractQuizQuestions() {
  return globalThis.__assistStubQuizQuestions || [];
}
