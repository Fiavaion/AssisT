/**
 * Wizard Breadcrumb (the "step rail")
 *
 * A non-interactive progress indicator for the citation capture/edit wizard. Shows the five
 * executive-function-labelled steps (What / Who / When / Where / Check) and which one you are on,
 * which are done, and which are still ahead — so a student always knows where they are and how
 * much is left (reduces working-memory load).
 *
 * It is deliberately NOT a set of buttons: navigation is via the wizard's Back/Next and the
 * reassurance panel's deep-links, so a student can never skip required entry by clicking ahead.
 *
 * Public API:
 *   createBreadcrumb({ steps, current }) -> { el, setCurrent(id), setCompleted(ids), destroy() }
 */

// ── Public factory ──────────────────────────────────────────────────────────────

/**
 * @param {Object} [options]
 * @param {Array<{id: string, label: string}>} [options.steps] - ordered steps
 * @param {string} [options.current] - id of the current step (defaults to the first)
 * @returns {{ el: HTMLElement, setCurrent: Function, setCompleted: Function, destroy: Function }}
 */
export function createBreadcrumb(options = {}) {
  const steps = Array.isArray(options.steps) ? options.steps : [];
  let currentId = options.current || (steps[0] && steps[0].id) || '';
  let completed = new Set();

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', 'Citation steps');

  const ol = document.createElement('ol');
  ol.className = 'assist-cite-breadcrumb';

  /** @type {Map<string, HTMLLIElement>} id -> <li> */
  const nodes = new Map();

  steps.forEach((step, index) => {
    const li = document.createElement('li');
    li.className = 'assist-cite-breadcrumb__step';

    // A small ordinal + the EF label, e.g. "1. What". The number is decorative for sighted
    // users; the label is the meaningful text a screen reader announces.
    const ordinal = document.createElement('span');
    ordinal.setAttribute('aria-hidden', 'true');
    ordinal.textContent = `${index + 1}.`;

    const label = document.createElement('span');
    label.textContent = step.label;

    li.appendChild(ordinal);
    li.appendChild(label);
    nodes.set(step.id, li);
    ol.appendChild(li);
  });

  nav.appendChild(ol);

  /** Re-apply current / done / upcoming classes + aria-current from the current state. */
  function applyState() {
    for (const [id, li] of nodes) {
      const isCurrent = id === currentId;
      li.classList.toggle('assist-cite-breadcrumb__step--current', isCurrent);
      li.classList.toggle('assist-cite-breadcrumb__step--done', completed.has(id) && !isCurrent);
      if (isCurrent) {
        li.setAttribute('aria-current', 'step');
      } else {
        li.removeAttribute('aria-current');
      }
    }
  }

  applyState();

  /**
   * Set the current step.
   * @param {string} id
   */
  function setCurrent(id) {
    if (nodes.has(id)) {
      currentId = id;
      applyState();
    }
  }

  /**
   * Mark a set of steps as completed.
   * @param {Iterable<string>} ids
   */
  function setCompleted(ids) {
    completed = new Set(ids);
    applyState();
  }

  function destroy() {
    nodes.clear();
  }

  return { el: nav, setCurrent, setCompleted, destroy };
}

export default { createBreadcrumb };
