/**
 * Autosave for the mind map editor.
 *
 * A student planning an essay should never have to think about saving, and should never lose a
 * branch to a closed tab. That means writing without being asked — but a write per keystroke would
 * put a Dexie transaction behind every letter, so changes are collected and written once the
 * typing stops.
 *
 * The status it reports is the other half: an autosave a student cannot see is one they cannot
 * trust, so every state change is handed to the page, which puts it in the status line.
 */

/** How long after the last change the write goes out. */
const DEFAULT_DELAY_MS = 600;

/**
 * Create an autosave.
 *
 * @param {Object} options
 * @param {() => Promise<Object>} options.save - writes the map as it stands; resolves with the
 *   stored map (or anything truthy). Called with no arguments, so it always reads the current
 *   snapshot rather than one captured when the change happened.
 * @param {number} [options.delay=600] - quiet time before a write.
 * @param {(state: {status: string, at: number|null, message: string|null}) => void} [options.onStateChange]
 *   - called on every state change: 'dirty', 'saving', 'saved', 'error'.
 * @returns {{
 *   markDirty: () => void,
 *   saveNow: () => Promise<void>,
 *   isDirty: () => boolean,
 *   destroy: () => void
 * }}
 */
export function createAutosave({ save, delay = DEFAULT_DELAY_MS, onStateChange } = {}) {
  let timer = null;
  let dirty = false;
  let inFlight = null;
  let destroyed = false;

  const report = (status, { at = null, message = null } = {}) => {
    if (onStateChange) {
      onStateChange({ status, at, message });
    }
  };

  const cancelTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  /**
   * Write, once, and pick up any change that landed while the write was out.
   * @returns {Promise<void>}
   */
  function run() {
    cancelTimer();
    if (inFlight) {
      // A save is already out. Whatever changed since is covered by the follow-up it schedules.
      return inFlight;
    }

    dirty = false;
    report('saving');
    // `save` is called here and not in a `then`, so the write captures the map as it stands at the
    // moment the save was asked for rather than one microtask later.
    let started;
    try {
      started = Promise.resolve(save());
    } catch (error) {
      started = Promise.reject(error);
    }
    inFlight = started
      .then(() => {
        inFlight = null;
        if (destroyed) {
          return;
        }
        if (dirty) {
          // Changes arrived mid-write, so what is on disk is already behind: go again.
          report('dirty');
          schedule();
          return;
        }
        report('saved', { at: Date.now() });
      })
      .catch(error => {
        inFlight = null;
        // The work is still only in memory, so the map stays dirty and the page says so.
        dirty = true;
        if (!destroyed) {
          report('error', { message: error?.message || 'The map could not be saved.' });
        }
      });

    return inFlight;
  }

  function schedule() {
    cancelTimer();
    timer = setTimeout(() => {
      timer = null;
      run();
    }, delay);
  }

  return {
    /** Note a change and start (or restart) the quiet period before the write. */
    markDirty() {
      if (destroyed) {
        return;
      }
      dirty = true;
      report('dirty');
      schedule();
    },

    /**
     * Write now — Ctrl+S, and the last thing the page does before it goes away.
     * @returns {Promise<void>}
     */
    saveNow() {
      if (destroyed) {
        return Promise.resolve();
      }
      return run();
    },

    /** @returns {boolean} true when there is work only in memory. */
    isDirty() {
      return dirty || inFlight !== null;
    },

    /** Drop any pending write. The page is going away; a save it started still finishes. */
    destroy() {
      destroyed = true;
      cancelTimer();
    },
  };
}
