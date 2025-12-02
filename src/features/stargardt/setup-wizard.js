/**
 * Stargardt Module - Setup Wizard
 *
 * First-run wizard for choosing between Lite Mode (manual settings)
 * and Advanced Mode (eye tracking with calibration).
 *
 * @module stargardt/setup-wizard
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const WIZARD_STYLES = `
  .stargardt-wizard-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .stargardt-wizard-container {
    background: #1a1a2e;
    border-radius: 16px;
    max-width: 700px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    padding: 40px;
    color: #ffffff;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .stargardt-wizard-header {
    text-align: center;
    margin-bottom: 32px;
  }

  .stargardt-wizard-header h1 {
    font-size: 28px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: #ffffff;
  }

  .stargardt-wizard-header p {
    font-size: 16px;
    color: #a0a0b0;
    margin: 0;
    line-height: 1.5;
  }

  .stargardt-wizard-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 32px;
  }

  @media (max-width: 600px) {
    .stargardt-wizard-options {
      grid-template-columns: 1fr;
    }
  }

  .stargardt-wizard-option {
    background: #252540;
    border: 3px solid transparent;
    border-radius: 12px;
    padding: 24px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .stargardt-wizard-option:hover {
    background: #2a2a4a;
    border-color: #4a4a6a;
  }

  .stargardt-wizard-option.selected {
    border-color: #6366f1;
    background: #2a2a5a;
  }

  .stargardt-wizard-option:focus {
    outline: 3px solid #6366f1;
    outline-offset: 2px;
  }

  .stargardt-option-icon {
    font-size: 48px;
    margin-bottom: 16px;
    display: block;
  }

  .stargardt-option-title {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 8px;
    color: #ffffff;
  }

  .stargardt-option-desc {
    font-size: 14px;
    color: #a0a0b0;
    line-height: 1.5;
    margin-bottom: 16px;
  }

  .stargardt-option-features {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .stargardt-option-features li {
    font-size: 13px;
    color: #80809a;
    padding: 4px 0;
    padding-left: 20px;
    position: relative;
  }

  .stargardt-option-features li::before {
    content: '✓';
    position: absolute;
    left: 0;
    color: #4ade80;
  }

  .stargardt-wizard-note {
    background: #252540;
    border-left: 4px solid #f59e0b;
    padding: 16px;
    border-radius: 0 8px 8px 0;
    margin-bottom: 24px;
  }

  .stargardt-wizard-note p {
    margin: 0;
    font-size: 14px;
    color: #d0d0e0;
    line-height: 1.5;
  }

  .stargardt-wizard-note strong {
    color: #f59e0b;
  }

  .stargardt-wizard-actions {
    display: flex;
    gap: 16px;
    justify-content: flex-end;
  }

  .stargardt-wizard-btn {
    padding: 14px 28px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
    min-width: 120px;
  }

  .stargardt-wizard-btn:focus {
    outline: 3px solid #6366f1;
    outline-offset: 2px;
  }

  .stargardt-wizard-btn-secondary {
    background: #3a3a5a;
    color: #ffffff;
  }

  .stargardt-wizard-btn-secondary:hover {
    background: #4a4a6a;
  }

  .stargardt-wizard-btn-primary {
    background: #6366f1;
    color: #ffffff;
  }

  .stargardt-wizard-btn-primary:hover {
    background: #5558e3;
  }

  .stargardt-wizard-btn-primary:disabled {
    background: #4a4a6a;
    cursor: not-allowed;
    opacity: 0.6;
  }

  /* Accessibility: Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .stargardt-wizard-option,
    .stargardt-wizard-btn {
      transition: none;
    }
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .stargardt-wizard-container {
      border: 2px solid #ffffff;
    }
    .stargardt-wizard-option {
      border: 2px solid #808080;
    }
    .stargardt-wizard-option.selected {
      border-color: #ffffff;
    }
  }
`;

// ============================================================================
// WIZARD HTML
// ============================================================================

const WIZARD_HTML = `
  <div class="stargardt-wizard-overlay" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
    <div class="stargardt-wizard-container">
      <div class="stargardt-wizard-header">
        <h1 id="wizard-title">Central Vision Support Setup</h1>
        <p>Choose how you'd like to configure your vision support settings. You can change this later in the extension settings.</p>
      </div>

      <div class="stargardt-wizard-options" role="radiogroup" aria-label="Mode selection">
        <button class="stargardt-wizard-option" data-mode="lite" role="radio" aria-checked="false" tabindex="0">
          <span class="stargardt-option-icon" aria-hidden="true">⚙️</span>
          <div class="stargardt-option-title">Lite Mode</div>
          <div class="stargardt-option-desc">
            Manual configuration without camera access. Best for users who know their scotoma position.
          </div>
          <ul class="stargardt-option-features">
            <li>No camera required</li>
            <li>Manual scotoma positioning</li>
            <li>Text optimization</li>
            <li>Light adaptation</li>
            <li>Quick setup</li>
          </ul>
        </button>

        <button class="stargardt-wizard-option" data-mode="advanced" role="radio" aria-checked="false" tabindex="0">
          <span class="stargardt-option-icon" aria-hidden="true">👁️</span>
          <div class="stargardt-option-title">Advanced Mode</div>
          <div class="stargardt-option-desc">
            Eye tracking with calibration for automatic scotoma detection and real-time content remapping.
          </div>
          <ul class="stargardt-option-features">
            <li>Webcam eye tracking</li>
            <li>Automatic scotoma mapping</li>
            <li>Real-time content remapping</li>
            <li>Gaze-aware UI</li>
            <li>PRL training exercises</li>
          </ul>
        </button>
      </div>

      <div class="stargardt-wizard-note">
        <p>
          <strong>Note:</strong> Advanced Mode requires webcam access and a brief calibration process.
          All processing happens locally on your device – no data is sent to external servers.
        </p>
      </div>

      <div class="stargardt-wizard-actions">
        <button class="stargardt-wizard-btn stargardt-wizard-btn-secondary" data-action="skip">
          Skip for Now
        </button>
        <button class="stargardt-wizard-btn stargardt-wizard-btn-primary" data-action="continue" disabled>
          Continue
        </button>
      </div>
    </div>
  </div>
`;

// ============================================================================
// WIZARD LOGIC
// ============================================================================

let wizardOverlay = null;
let selectedMode = null;
let resolveWizard = null;

/**
 * Run the setup wizard
 * @returns {Promise<{completed: boolean, mode: string|null}>}
 */
export function runSetupWizard() {
  return new Promise(resolve => {
    resolveWizard = resolve;

    // Inject styles
    injectStyles();

    // Create wizard overlay
    const container = document.createElement('div');
    container.innerHTML = WIZARD_HTML;
    wizardOverlay = container.firstElementChild;
    document.body.appendChild(wizardOverlay);

    // Bind events
    bindWizardEvents();

    // Focus management - trap focus in modal
    setupFocusTrap();

    // Announce to screen readers
    announceToScreenReader('Central Vision Support setup wizard opened');
  });
}

/**
 * Inject wizard styles into the page
 */
function injectStyles() {
  if (document.getElementById('stargardt-wizard-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'stargardt-wizard-styles';
  style.textContent = WIZARD_STYLES;
  document.head.appendChild(style);
}

/**
 * Bind event listeners to wizard elements
 */
function bindWizardEvents() {
  const options = wizardOverlay.querySelectorAll('.stargardt-wizard-option');
  const continueBtn = wizardOverlay.querySelector('[data-action="continue"]');
  const skipBtn = wizardOverlay.querySelector('[data-action="skip"]');

  // Option selection
  options.forEach(option => {
    option.addEventListener('click', () => selectOption(option));
    option.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectOption(option);
      }
      // Arrow key navigation
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const allOptions = Array.from(options);
        const currentIndex = allOptions.indexOf(option);
        const nextIndex =
          e.key === 'ArrowRight'
            ? (currentIndex + 1) % allOptions.length
            : (currentIndex - 1 + allOptions.length) % allOptions.length;
        allOptions[nextIndex].focus();
      }
    });
  });

  // Continue button
  continueBtn.addEventListener('click', () => {
    if (selectedMode) {
      closeWizard({ completed: true, mode: selectedMode });
    }
  });

  // Skip button
  skipBtn.addEventListener('click', () => {
    closeWizard({ completed: false, mode: null });
  });

  // Escape key to close
  document.addEventListener('keydown', handleEscapeKey);
}

/**
 * Handle option selection
 * @param {HTMLElement} option
 */
function selectOption(option) {
  const options = wizardOverlay.querySelectorAll('.stargardt-wizard-option');
  const continueBtn = wizardOverlay.querySelector('[data-action="continue"]');

  // Update selection state
  options.forEach(opt => {
    opt.classList.remove('selected');
    opt.setAttribute('aria-checked', 'false');
  });

  option.classList.add('selected');
  option.setAttribute('aria-checked', 'true');

  // Store selected mode
  selectedMode = option.dataset.mode;

  // Enable continue button
  continueBtn.disabled = false;

  // Announce selection
  const modeName = selectedMode === 'advanced' ? 'Advanced' : 'Lite';
  announceToScreenReader(`${modeName} Mode selected`);
}

/**
 * Close the wizard and resolve the promise
 * @param {{completed: boolean, mode: string|null}} result
 */
function closeWizard(result) {
  // Clean up
  document.removeEventListener('keydown', handleEscapeKey);

  if (wizardOverlay) {
    wizardOverlay.remove();
    wizardOverlay = null;
  }

  // Resolve the promise
  if (resolveWizard) {
    resolveWizard(result);
    resolveWizard = null;
  }
}

/**
 * Handle escape key press
 * @param {KeyboardEvent} e
 */
function handleEscapeKey(e) {
  if (e.key === 'Escape') {
    closeWizard({ completed: false, mode: null });
  }
}

/**
 * Set up focus trap within the wizard
 */
function setupFocusTrap() {
  const focusableElements = wizardOverlay.querySelectorAll(
    'button, [tabindex]:not([tabindex="-1"])'
  );

  if (focusableElements.length === 0) return;

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  // Focus the first option
  firstElement.focus();

  // Trap focus
  wizardOverlay.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  });
}

/**
 * Announce message to screen readers
 * @param {string} message
 */
function announceToScreenReader(message) {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');
  announcement.style.cssText =
    'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
  announcement.textContent = message;

  document.body.appendChild(announcement);

  // Remove after announcement
  setTimeout(() => announcement.remove(), 1000);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default { runSetupWizard };
