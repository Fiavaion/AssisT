/**
 * Stargardt's Disease & Central Vision Loss Support Module
 *
 * Provides scotoma-aware content remapping, PRL training, and adaptive UI
 * for users with central vision loss conditions like Stargardt's disease,
 * age-related macular degeneration (AMD), and similar conditions.
 *
 * @module stargardt
 */

import { showToast } from '../../core/ui/toast.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';

// Static imports of sub-modules (bundled by Vite)
import * as scotomaProfileModule from './scotoma-profile.js';
import * as contentRemapperModule from './content-remapper.js';
import * as apvuiEngineModule from './apvui-engine.js';
import * as lightAdaptModule from './light-adapt.js';
import * as calibrationUiModule from './calibration-ui.js';
import * as setupWizardModule from './setup-wizard.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let stargardt_enabled = false;
let stargardt_settings = null;
let stargardt_mode = 'lite'; // 'lite' or 'advanced'
let stargardt_initialized = false;
let stargardt_setupComplete = false;

// Sub-module references (assigned from static imports)
const scotomaProfile = scotomaProfileModule;
const contentRemapper = contentRemapperModule;
const apvuiEngine = apvuiEngineModule;
const lightAdapt = lightAdaptModule;
const calibrationUi = calibrationUiModule;
const setupWizard = setupWizardModule;

// Runtime state for optional features
let prlTrainer = null;
let gazeTracker = null; // For advanced mode eye tracking (not yet implemented)
let apvuiInitialized = false;
let lightAdaptInitialized = false;

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

const DEFAULT_SETTINGS = {
  enabled: false,
  mode: 'lite', // 'lite' = manual settings only, 'advanced' = eye tracking
  setupComplete: false,

  // Scotoma profile settings (Lite mode - manual configuration)
  scotoma: {
    shape: 'ellipse', // 'ellipse', 'circle', 'irregular'
    centerX: 50, // percentage from left
    centerY: 50, // percentage from top
    radiusX: 10, // percentage of viewport width
    radiusY: 10, // percentage of viewport height
    position: 'center', // 'center', 'left', 'right', 'above', 'below'
  },

  // Content remapping settings
  remapping: {
    enabled: true,
    mode: 'peripheral-push', // 'text-donut', 'peripheral-push', 'rsvp', 'magnify-remap'
    preferredSide: 'right', // 'left', 'right', 'above', 'below'
    intensity: 50, // 0-100, how aggressively to remap
  },

  // Text optimization settings
  textOptimization: {
    enabled: true,
    letterSpacing: 150, // percentage (100 = normal, 150-200 recommended)
    lineHeight: 200, // percentage (100 = normal, 200-250 recommended)
    fontSize: 100, // percentage multiplier
    singleColumn: true,
    removeBackgroundPatterns: true,
  },

  // APVUI (Adaptive Peripheral Vision UI) settings
  apvui: {
    enabled: true,
    radialMenus: true,
    edgeAnchoring: true,
    motionCues: true,
    ultraHighContrast: false,
    minTouchTarget: 48, // pixels
  },

  // Light adaptation settings
  lightAdaptation: {
    enabled: true,
    targetBrightness: 70, // 0-100
    transitionSpeed: 5000, // milliseconds for gradual transitions
    autoAdjust: true,
    glareReduction: 50, // 0-100
  },

  // PRL Training settings
  prlTraining: {
    lastSessionDate: null,
    totalSessions: 0,
    currentLevel: 1,
    preferredExercises: [],
  },

  // Progressive calibration settings
  calibration: {
    lastCalibrationDate: null,
    recalibrationReminder: true,
    reminderIntervalDays: 30,
    profiles: [], // Historical scotoma profiles for progression tracking
  },
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Initialize the Stargardt module
 * Called once when the feature is first loaded
 */
function stargardt_initialize() {
  if (stargardt_initialized) {
    return;
  }

  console.log('[Stargardt] Initializing module...');
  stargardt_initialized = true;

  // Check if first-run setup is needed
  if (!stargardt_setupComplete && stargardt_enabled) {
    stargardt_showSetupWizard();
  }

  // Apply initial settings based on mode
  if (stargardt_enabled) {
    stargardt_activate();
  }
}

/**
 * Clean up the Stargardt module
 * Called when the feature is disabled or page unloads
 */
function stargardt_cleanup() {
  console.log('[Stargardt] Cleaning up module...');

  // Disable all sub-modules
  if (contentRemapper && typeof contentRemapper.disable === 'function') {
    contentRemapper.disable();
  }
  if (apvuiInitialized && typeof apvuiEngine.disable === 'function') {
    apvuiEngine.disable();
    apvuiInitialized = false;
  }
  if (lightAdaptInitialized && typeof lightAdapt.disable === 'function') {
    lightAdapt.disable();
    lightAdaptInitialized = false;
  }

  stargardt_enabled = false;
}

/**
 * Apply settings changes
 * @param {Object} settings - New settings object
 * @param {boolean} isInit - Whether this is the initial settings load
 */
function stargardt_applySettings(settings, isInit = false) {
  const wasEnabled = stargardt_enabled;
  const previousMode = stargardt_mode;

  console.log('[Stargardt] applySettings called with:', {
    settings,
    isInit,
    wasEnabled,
    previousMode,
  });

  // Update local state
  stargardt_settings = settings;
  stargardt_enabled = settings?.enabled || false;
  stargardt_mode = settings?.mode || 'lite';
  stargardt_setupComplete = settings?.setupComplete || false;

  console.log('[Stargardt] After state update:', {
    enabled: stargardt_enabled,
    mode: stargardt_mode,
    setupComplete: stargardt_setupComplete,
    textOptimization: settings?.textOptimization,
    lightAdaptation: settings?.lightAdaptation,
  });

  // Handle enable/disable transitions
  if (stargardt_enabled && !wasEnabled) {
    stargardt_activate();
    if (!isInit) {
      showToast('Central Vision Support enabled', 'success');
    }
  } else if (!stargardt_enabled && wasEnabled) {
    stargardt_deactivate();
    if (!isInit) {
      showToast('Central Vision Support disabled', 'info');
    }
  } else if (stargardt_enabled) {
    // Settings changed while enabled
    if (previousMode !== stargardt_mode) {
      // Mode changed - need to reconfigure
      stargardt_switchMode(stargardt_mode);
    } else {
      // Just update sub-module settings
      stargardt_updateSubModules();
    }
  }
}

// ============================================================================
// ACTIVATION / DEACTIVATION
// ============================================================================

/**
 * Activate the Stargardt module
 */
async function stargardt_activate() {
  console.log('[Stargardt] Activating in', stargardt_mode, 'mode...');

  try {
    // Initialize sub-modules based on mode
    if (stargardt_mode === 'advanced') {
      await stargardt_initAdvancedMode();
    } else {
      await stargardt_initLiteMode();
    }

    // Apply text optimization
    if (stargardt_settings?.textOptimization?.enabled) {
      stargardt_applyTextOptimization();
    }

    // Initialize APVUI if enabled
    if (stargardt_settings?.apvui?.enabled) {
      await stargardt_initAPVUI();
    }

    // Initialize light adaptation if enabled
    if (stargardt_settings?.lightAdaptation?.enabled) {
      await stargardt_initLightAdaptation();
    }

    console.log('[Stargardt] Module activated successfully');
  } catch (error) {
    console.error('[Stargardt] Activation error:', error);
    showToast('Error activating Central Vision Support', 'error');
  }
}

/**
 * Deactivate the Stargardt module
 */
function stargardt_deactivate() {
  console.log('[Stargardt] Deactivating...');

  stargardt_cleanup();
  stargardt_removeTextOptimization();

  console.log('[Stargardt] Module deactivated');
}

// ============================================================================
// MODE INITIALIZATION
// ============================================================================

/**
 * Initialize Lite Mode (manual settings, no eye tracking)
 */
async function stargardt_initLiteMode() {
  console.log('[Stargardt] Initializing Lite Mode...');

  // Modules are already available via static imports

  // Initialize with manual scotoma settings (use defaults if not set)
  const scotomaSettings = stargardt_settings?.scotoma || DEFAULT_SETTINGS.scotoma;
  console.log('[Stargardt] Creating profile from scotoma settings:', scotomaSettings);
  const profile = scotomaProfile.createFromSettings(scotomaSettings);

  // Initialize remapper with settings (use defaults if not set)
  const remappingSettings = stargardt_settings?.remapping || DEFAULT_SETTINGS.remapping;
  contentRemapper.initialize(profile, remappingSettings);

  // Enable remapping if settings say so
  if (remappingSettings.enabled !== false) {
    contentRemapper.enable();
  }
}

/**
 * Initialize Advanced Mode (eye tracking with calibration)
 * Note: Advanced mode requires eye tracking which is not yet implemented in Lite version
 */
async function stargardt_initAdvancedMode() {
  console.log('[Stargardt] Initializing Advanced Mode...');
  console.log('[Stargardt] Note: Advanced mode with eye tracking is experimental');

  // For now, fall back to Lite mode behavior since gaze tracking isn't fully implemented
  // TODO: Implement full gaze tracking when WebGazer integration is complete

  // Check if calibration is needed
  const needsCalibration = await stargardt_checkCalibrationNeeded();
  if (needsCalibration) {
    await stargardt_runCalibration();
  }

  // Initialize remapper with saved or default profile
  let profile = await scotomaProfile.loadSaved();
  // If no saved profile, create from defaults
  if (!profile) {
    const scotomaSettings = stargardt_settings?.scotoma || DEFAULT_SETTINGS.scotoma;
    profile = scotomaProfile.createFromSettings(scotomaSettings);
  }
  const remappingSettings = stargardt_settings?.remapping || DEFAULT_SETTINGS.remapping;
  contentRemapper.initialize(profile, remappingSettings);

  // Enable remapping if settings say so
  if (remappingSettings.enabled !== false) {
    contentRemapper.enable();
  }
}

/**
 * Switch between Lite and Advanced modes
 * @param {string} newMode - 'lite' or 'advanced'
 */
async function stargardt_switchMode(newMode) {
  console.log('[Stargardt] Switching to', newMode, 'mode...');

  // Clean up current mode
  if (contentRemapper) {
    contentRemapper.disable();
  }
  if (gazeTracker && stargardt_mode === 'advanced') {
    gazeTracker.stop();
  }

  // Initialize new mode
  stargardt_mode = newMode;
  if (newMode === 'advanced') {
    await stargardt_initAdvancedMode();
  } else {
    await stargardt_initLiteMode();
  }

  showToast(
    `Switched to ${newMode === 'advanced' ? 'Advanced' : 'Lite'} Mode`,
    'info'
  );
}

// ============================================================================
// SUB-MODULE INITIALIZATION
// ============================================================================

/**
 * Initialize APVUI (Adaptive Peripheral Vision UI)
 */
async function stargardt_initAPVUI() {
  const apvuiSettings = stargardt_settings?.apvui || DEFAULT_SETTINGS.apvui;
  apvuiEngine.initialize(apvuiSettings, scotomaProfile);
  apvuiInitialized = true;
}

/**
 * Initialize Light Adaptation module
 */
async function stargardt_initLightAdaptation() {
  const lightSettings = stargardt_settings?.lightAdaptation || DEFAULT_SETTINGS.lightAdaptation;
  lightAdapt.initialize(lightSettings);
  lightAdaptInitialized = true;
}

/**
 * Update all active sub-modules with new settings
 */
function stargardt_updateSubModules() {
  // Update content remapper
  if (stargardt_settings?.remapping && typeof contentRemapper.updateSettings === 'function') {
    contentRemapper.updateSettings(stargardt_settings.remapping);
  }

  // Update APVUI engine
  if (apvuiInitialized && stargardt_settings?.apvui && typeof apvuiEngine.updateSettings === 'function') {
    apvuiEngine.updateSettings(stargardt_settings.apvui);
  }

  // Update light adaptation
  if (stargardt_settings?.lightAdaptation) {
    if (stargardt_settings.lightAdaptation.enabled) {
      if (lightAdaptInitialized && typeof lightAdapt.updateSettings === 'function') {
        lightAdapt.updateSettings(stargardt_settings.lightAdaptation);
      } else {
        // Initialize if not yet initialized
        stargardt_initLightAdaptation();
      }
    } else if (lightAdaptInitialized && typeof lightAdapt.disable === 'function') {
      lightAdapt.disable();
      lightAdaptInitialized = false;
    }
  }

  // Update text optimization (re-apply CSS with new values)
  if (stargardt_settings?.textOptimization) {
    if (stargardt_settings.textOptimization.enabled) {
      stargardt_applyTextOptimization();
    } else {
      stargardt_removeTextOptimization();
    }
  }
}

// ============================================================================
// TEXT OPTIMIZATION
// ============================================================================

/**
 * Apply text optimization CSS to the page
 */
function stargardt_applyTextOptimization() {
  console.log('[Stargardt] applyTextOptimization called, settings:', stargardt_settings);

  const opts = stargardt_settings?.textOptimization;
  if (!opts) {
    console.log('[Stargardt] No textOptimization settings found');
    return;
  }

  console.log('[Stargardt] textOptimization opts:', opts);

  // Remove existing style if present
  stargardt_removeTextOptimization();

  const styleId = 'stargardt-text-optimization';
  const style = document.createElement('style');
  style.id = styleId;

  const rules = [];

  // Letter spacing
  if (opts.letterSpacing !== 100) {
    const spacing = (opts.letterSpacing - 100) / 100;
    rules.push(`letter-spacing: ${spacing}em !important;`);
  }

  // Line height
  if (opts.lineHeight !== 100) {
    const height = opts.lineHeight / 100;
    rules.push(`line-height: ${height} !important;`);
  }

  // Font size multiplier
  if (opts.fontSize !== 100) {
    rules.push(`font-size: ${opts.fontSize}% !important;`);
  }

  // Single column layout
  if (opts.singleColumn) {
    rules.push(`column-count: 1 !important;`);
    rules.push(`columns: unset !important;`);
  }

  console.log('[Stargardt] CSS rules generated:', rules);

  if (rules.length > 0) {
    style.textContent = `
      body, p, span, div, article, section, main, li, td, th, label, a {
        ${rules.join('\n        ')}
      }
    `;
    document.head.appendChild(style);
    console.log('[Stargardt] Text optimization CSS injected:', style.textContent);
  } else {
    console.log('[Stargardt] No CSS rules to inject (all values at 100%)');
  }

  // Remove background patterns if enabled
  if (opts.removeBackgroundPatterns) {
    const bgStyle = document.createElement('style');
    bgStyle.id = 'stargardt-bg-cleanup';
    bgStyle.textContent = `
      body *, main *, article * {
        background-image: none !important;
        background-pattern: none !important;
      }
    `;
    document.head.appendChild(bgStyle);
  }

  console.log('[Stargardt] Text optimization applied');
}

/**
 * Remove text optimization CSS
 */
function stargardt_removeTextOptimization() {
  const textStyle = document.getElementById('stargardt-text-optimization');
  if (textStyle) {
    textStyle.remove();
  }
  const bgStyle = document.getElementById('stargardt-bg-cleanup');
  if (bgStyle) {
    bgStyle.remove();
  }
}

// ============================================================================
// CALIBRATION
// ============================================================================

/**
 * Check if calibration is needed
 * @returns {boolean}
 */
async function stargardt_checkCalibrationNeeded() {
  const calibration = stargardt_settings?.calibration || DEFAULT_SETTINGS.calibration;

  if (!calibration.lastCalibrationDate) {
    return true;
  }

  const lastCal = new Date(calibration.lastCalibrationDate);
  const daysSince = (Date.now() - lastCal.getTime()) / (1000 * 60 * 60 * 24);
  const reminderDays = calibration.reminderIntervalDays || 30;

  return daysSince >= reminderDays;
}

/**
 * Run the calibration wizard
 */
async function stargardt_runCalibration() {
  console.log('[Stargardt] Starting calibration...');

  const result = await calibrationUi.runCalibrationWizard();

  if (result.success) {
    // Save new scotoma profile
    await scotomaProfile.save(result.profile);

    // Update calibration timestamp
    await chrome.storage.local.set({
      stargardt: {
        ...stargardt_settings,
        calibration: {
          ...stargardt_settings.calibration,
          lastCalibrationDate: new Date().toISOString(),
        },
      },
    });

    showToast('Calibration complete', 'success');
  } else if (result.skipped) {
    showToast('Using default settings', 'info');
  }
}

// ============================================================================
// SETUP WIZARD
// ============================================================================

/**
 * Show the first-run setup wizard
 */
async function stargardt_showSetupWizard() {
  console.log('[Stargardt] Showing setup wizard...');

  const result = await setupWizard.runSetupWizard();

  if (result.completed) {
    // Save setup choices
    await chrome.storage.local.set({
      stargardt: {
        ...stargardt_settings,
        mode: result.mode,
        setupComplete: true,
      },
    });

    stargardt_mode = result.mode;
    stargardt_setupComplete = true;

    showToast(
      `Setup complete - ${result.mode === 'advanced' ? 'Advanced' : 'Lite'} Mode selected`,
      'success'
    );

    // If advanced mode, run calibration
    if (result.mode === 'advanced') {
      await stargardt_runCalibration();
    }
  }
}

// ============================================================================
// PRL TRAINING
// ============================================================================

/**
 * Open the PRL Training page
 */
function stargardt_openPRLTraining() {
  chrome.runtime.sendMessage({
    action: 'openTab',
    url: chrome.runtime.getURL('pages/prl-training/training.html'),
  });
}

// ============================================================================
// MESSAGE LISTENER FOR POPUP COMMANDS
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle stargardt-specific messages
  if (message.action && message.action.startsWith('stargardt_')) {
    console.log('[Stargardt] Received message:', message.action);

    switch (message.action) {
      case 'stargardt_showSetupWizard':
        stargardt_showSetupWizard();
        sendResponse({ success: true });
        break;

      case 'stargardt_runCalibration':
        stargardt_runCalibration();
        sendResponse({ success: true });
        break;

      case 'stargardt_switchMode':
        stargardt_switchMode(message.mode);
        sendResponse({ success: true });
        break;

      case 'stargardt_openPRLTraining':
        stargardt_openPRLTraining();
        sendResponse({ success: true });
        break;

      default:
        console.warn('[Stargardt] Unknown action:', message.action);
        sendResponse({ success: false, error: 'Unknown action' });
    }

    return true; // Keep message channel open
  }
});

// ============================================================================
// PUBLIC API
// ============================================================================

export {
  stargardt_initialize as initialize,
  stargardt_cleanup as cleanup,
  stargardt_applySettings as applySettings,
  stargardt_showSetupWizard as showSetupWizard,
  stargardt_runCalibration as runCalibration,
  stargardt_openPRLTraining as openPRLTraining,
  stargardt_switchMode as switchMode,
  DEFAULT_SETTINGS,
};

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize feature settings with storage utility
initFeatureSettings(
  'stargardt',
  DEFAULT_SETTINGS,
  settings => stargardt_applySettings(settings, true),
  settings => stargardt_applySettings(settings, false)
);

console.log('[Stargardt] Module loaded');
