/**
 * Citation capture buttons.
 *
 * The in-page entry points to the capture flow: a "Cite this source" button (snapshots the current
 * page / selection and opens the wizard) and a "Voice capture" toggle (listens for a spoken
 * trigger phrase that captures a source hands-free). Both are keyboard-operable and layered
 * with the shared z-index scale.
 *
 * This component is presentational + wiring only — it holds no capture logic itself; it calls the
 * callbacks it is given. The voice toggle reflects an external "armed" state via aria-pressed, and
 * a polite status line under the buttons says what voice capture is doing (shown and announced).
 *
 * Public API:
 *   createCaptureButtons({ onCiteSource, onToggleVoice, voiceActive })
 *     -> { el, setVoiceActive(bool), setVoiceStatus(text), destroy() }
 */

/** Gives each bar's status line its own id for the voice button's aria-describedby. */
let statusIds = 0;

import { injectCitationStyles } from '../ui/citation-styles.js';
import { attachAccessibleHandler } from '../../../utils/event-handlers.js';
import { dockChip, undockChip } from '../../companion/chip-dock.js';

/**
 * @param {Object} [options]
 * @param {Function} [options.onCiteSource] - called when "Cite this source" is activated
 * @param {Function} [options.onToggleVoice] - called when the voice-capture toggle is activated
 * @param {boolean} [options.voiceActive=false] - initial armed state of the voice toggle
 * @returns {{ el: HTMLElement, setVoiceActive: Function, destroy: Function }}
 */
export function createCaptureButtons(options = {}) {
  const { onCiteSource, onToggleVoice } = options;
  let voiceActive = Boolean(options.voiceActive);

  injectCitationStyles();

  const el = document.createElement('div');
  el.className = 'assist-cite-root assist-cite-capture-bar';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Capture a citation');

  const citeBtn = document.createElement('button');
  citeBtn.type = 'button';
  citeBtn.className = 'assist-cite-btn assist-cite-btn--primary';
  citeBtn.textContent = 'Cite this source';

  const voiceBtn = document.createElement('button');
  voiceBtn.type = 'button';
  voiceBtn.className = 'assist-cite-btn';
  voiceBtn.textContent = 'Voice capture';

  function applyVoiceState() {
    voiceBtn.setAttribute('aria-pressed', voiceActive ? 'true' : 'false');
    voiceBtn.classList.toggle('assist-cite-btn--primary', voiceActive);
    voiceBtn.setAttribute(
      'aria-label',
      voiceActive
        ? 'Voice capture on — activate to turn off'
        : 'Voice capture off — activate to turn on'
    );
  }
  applyVoiceState();

  // In the document from the start and never hidden: a live region that appears already holding
  // its text is often not announced.
  const status = document.createElement('p');
  status.className = 'assist-cite-capture-status';
  status.id = `assist-cite-capture-status-${++statusIds}`;
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  voiceBtn.setAttribute('aria-describedby', status.id);

  el.appendChild(citeBtn);
  el.appendChild(voiceBtn);
  el.appendChild(status);

  // The chip dock decides where the bar sits: one cluster for all the small chips,
  // lifted clear of the page's own controls (see src/features/companion/chip-dock.js).
  dockChip('citation-capture-bar', el);

  const citeCleanup = attachAccessibleHandler(citeBtn, 'Cite this source', () => {
    if (typeof onCiteSource === 'function') {
      onCiteSource();
    }
  });
  const voiceCleanup = attachAccessibleHandler(voiceBtn, 'Voice capture', () => {
    if (typeof onToggleVoice === 'function') {
      onToggleVoice();
    }
  });

  /**
   * Reflect the externally-owned voice-armed state on the toggle.
   * @param {boolean} active
   */
  function setVoiceActive(active) {
    voiceActive = Boolean(active);
    applyVoiceState();
  }

  /**
   * Say what voice capture is doing; an empty string clears the line.
   * @param {string} text
   */
  function setVoiceStatus(text) {
    status.textContent = text || '';
  }

  function destroy() {
    citeCleanup();
    voiceCleanup();
    undockChip('citation-capture-bar');
    el.remove();
  }

  return { el, setVoiceActive, setVoiceStatus, destroy };
}

export default { createCaptureButtons };
