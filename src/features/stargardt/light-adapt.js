/**
 * Stargardt Module - Light Adaptation
 *
 * Manages brightness transitions and glare reduction for users with
 * dark adaptation challenges common in Stargardt's disease.
 *
 * Features:
 * - Brightness normalization across pages
 * - Gradual transitions (5-10 second animations)
 * - AmbientLightSensor API integration (where available)
 * - Glare detection and localized dimming
 * - Time-of-day profiles
 *
 * @module stargardt/light-adapt
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let lightAdapt_enabled = false;
let lightAdapt_settings = {};
// let _lightAdapt_styleElement = null; // Reserved for future use
let lightAdapt_overlayElement = null;
let lightAdapt_ambientSensor = null;
let lightAdapt_currentBrightness = 100;
let lightAdapt_targetBrightness = 70;
let lightAdapt_transitionTimeout = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the light adaptation module
 *
 * @param {Object} settings - Light adaptation settings
 */
export function initialize(settings) {
  console.log('[LightAdapt] Initializing...');

  lightAdapt_settings = settings || {};
  lightAdapt_targetBrightness = settings.targetBrightness ?? 70;

  // Inject styles
  injectStyles();

  // Set up ambient light sensor if available and enabled
  if (lightAdapt_settings.autoAdjust) {
    setupAmbientSensor();
  }

  // Enable if settings say so
  if (lightAdapt_settings.enabled !== false) {
    enable();
  }

  console.log('[LightAdapt] Initialized');
}

/**
 * Enable light adaptation
 */
export function enable() {
  if (lightAdapt_enabled) {
    return;
  }

  console.log('[LightAdapt] Enabling...');
  lightAdapt_enabled = true;

  // Create brightness overlay
  createBrightnessOverlay();

  // Apply initial brightness
  applyBrightness(lightAdapt_targetBrightness);

  // Detect bright areas for glare reduction
  if (lightAdapt_settings.glareReduction > 0) {
    detectAndReduceGlare();
  }

  // Apply time-of-day adjustment
  applyTimeOfDayProfile();

  // Watch for page navigation
  observePageChanges();

  console.log('[LightAdapt] Enabled');
}

/**
 * Disable light adaptation
 */
export function disable() {
  if (!lightAdapt_enabled) {
    return;
  }

  console.log('[LightAdapt] Disabling...');
  lightAdapt_enabled = false;

  // Remove overlay
  if (lightAdapt_overlayElement) {
    lightAdapt_overlayElement.remove();
    lightAdapt_overlayElement = null;
  }

  // Stop ambient sensor
  if (lightAdapt_ambientSensor) {
    lightAdapt_ambientSensor.stop();
    lightAdapt_ambientSensor = null;
  }

  // Clear transitions
  if (lightAdapt_transitionTimeout) {
    clearTimeout(lightAdapt_transitionTimeout);
    lightAdapt_transitionTimeout = null;
  }

  // Remove filters
  document.documentElement.style.filter = '';

  console.log('[LightAdapt] Disabled');
}

/**
 * Update settings
 */
export function updateSettings(settings) {
  lightAdapt_settings = { ...lightAdapt_settings, ...settings };

  // Only transition if brightness target actually changed
  if (
    settings.targetBrightness !== undefined &&
    settings.targetBrightness !== lightAdapt_targetBrightness
  ) {
    transitionToBrightness(settings.targetBrightness);
  }

  if (settings.autoAdjust !== undefined) {
    if (settings.autoAdjust) {
      setupAmbientSensor();
    } else if (lightAdapt_ambientSensor) {
      lightAdapt_ambientSensor.stop();
      lightAdapt_ambientSensor = null;
    }
  }
}

// ============================================================================
// STYLE INJECTION
// ============================================================================

/**
 * Inject light adaptation styles
 */
function injectStyles() {
  if (document.getElementById('stargardt-lightadapt-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'stargardt-lightadapt-styles';
  style.textContent = `
    /* Brightness overlay */
    .stargardt-brightness-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483600;
      transition: background-color var(--stargardt-transition-speed, 5s) ease;
    }

    /* Glare reduction overlay for bright elements */
    .stargardt-glare-mask {
      position: absolute;
      pointer-events: none;
      background: rgba(0, 0, 0, var(--stargardt-glare-opacity, 0.3));
      transition: opacity 0.5s ease;
      border-radius: 4px;
    }

    /* Smooth page filter transitions */
    html.stargardt-light-adapt {
      transition: filter var(--stargardt-transition-speed, 5s) ease !important;
    }

    /* Prevent flash on page load */
    html.stargardt-light-adapt-loading {
      filter: brightness(0.7);
      transition: none !important;
    }
  `;

  document.head.appendChild(style);
  lightAdapt_styleElement = style;
}

// ============================================================================
// BRIGHTNESS CONTROL
// ============================================================================

/**
 * Create brightness control overlay
 */
function createBrightnessOverlay() {
  if (lightAdapt_overlayElement) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'stargardt-brightness-overlay';
  overlay.className = 'stargardt-brightness-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  document.body.appendChild(overlay);
  lightAdapt_overlayElement = overlay;
}

/**
 * Apply brightness level immediately
 *
 * @param {number} brightness - Brightness percentage (0-100)
 * @param {boolean} silent - If true, don't log
 */
function applyBrightness(brightness, silent = false) {
  const prevBrightness = lightAdapt_currentBrightness;
  lightAdapt_currentBrightness = brightness;

  // Use CSS filter for smooth control
  const filterValue = brightness / 100;
  document.documentElement.style.filter = `brightness(${filterValue})`;
  document.documentElement.classList.add('stargardt-light-adapt');

  // Update overlay for additional dimming if needed
  if (lightAdapt_overlayElement && brightness < 50) {
    const overlayOpacity = (50 - brightness) / 100;
    lightAdapt_overlayElement.style.backgroundColor = `rgba(0, 0, 0, ${overlayOpacity})`;
  } else if (lightAdapt_overlayElement) {
    lightAdapt_overlayElement.style.backgroundColor = 'transparent';
  }

  // Only log when brightness actually changes significantly
  if (!silent && Math.abs(brightness - prevBrightness) >= 1) {
    console.log(`[LightAdapt] Brightness set to ${brightness}%`);
  }
}

/**
 * Transition to target brightness gradually
 *
 * @param {number} targetBrightness - Target brightness percentage
 */
export function transitionToBrightness(targetBrightness) {
  lightAdapt_targetBrightness = targetBrightness;

  if (!lightAdapt_enabled) {
    applyBrightness(targetBrightness);
    return;
  }

  const transitionSpeed = lightAdapt_settings.transitionSpeed || 5000;
  const steps = 50;
  const stepTime = transitionSpeed / steps;
  const stepSize = (targetBrightness - lightAdapt_currentBrightness) / steps;

  // Set CSS transition duration
  document.documentElement.style.setProperty(
    '--stargardt-transition-speed',
    `${transitionSpeed}ms`
  );

  let currentStep = 0;

  const doStep = () => {
    if (currentStep >= steps || !lightAdapt_enabled) {
      applyBrightness(targetBrightness);
      return;
    }

    const newBrightness = lightAdapt_currentBrightness + stepSize;
    applyBrightness(newBrightness);
    currentStep++;

    lightAdapt_transitionTimeout = setTimeout(doStep, stepTime);
  };

  doStep();
}

// ============================================================================
// AMBIENT LIGHT SENSOR
// ============================================================================

/**
 * Set up ambient light sensor for automatic adjustment
 */
function setupAmbientSensor() {
  // Check if AmbientLightSensor is available
  if (!('AmbientLightSensor' in window)) {
    console.log('[LightAdapt] AmbientLightSensor not available');
    return;
  }

  try {
    lightAdapt_ambientSensor = new AmbientLightSensor();

    lightAdapt_ambientSensor.addEventListener('reading', () => {
      handleAmbientLightReading(lightAdapt_ambientSensor.illuminance);
    });

    lightAdapt_ambientSensor.addEventListener('error', event => {
      console.warn('[LightAdapt] Ambient sensor error:', event.error);
    });

    lightAdapt_ambientSensor.start();
    console.log('[LightAdapt] Ambient light sensor started');
  } catch (error) {
    console.warn('[LightAdapt] Failed to start ambient sensor:', error);
  }
}

/**
 * Handle ambient light sensor reading
 *
 * @param {number} illuminance - Light level in lux
 */
function handleAmbientLightReading(illuminance) {
  if (!lightAdapt_enabled || !lightAdapt_settings.autoAdjust) {
    return;
  }

  // Map illuminance to brightness
  // Typical values: <50 lux = dark room, 300-500 = office, >1000 = daylight
  let targetBrightness;

  if (illuminance < 50) {
    // Dark room - reduce screen brightness significantly
    targetBrightness = 40;
  } else if (illuminance < 200) {
    // Dim room
    targetBrightness = 60;
  } else if (illuminance < 500) {
    // Normal indoor
    targetBrightness = 75;
  } else if (illuminance < 1000) {
    // Bright indoor
    targetBrightness = 85;
  } else {
    // Bright daylight
    targetBrightness = 95;
  }

  // Only adjust if significantly different
  if (Math.abs(targetBrightness - lightAdapt_currentBrightness) > 10) {
    console.log(`[LightAdapt] Auto-adjusting for ${illuminance} lux -> ${targetBrightness}%`);
    transitionToBrightness(targetBrightness);
  }
}

// ============================================================================
// GLARE REDUCTION
// ============================================================================

/**
 * Detect and reduce bright glaring elements
 */
function detectAndReduceGlare() {
  if (!lightAdapt_settings.glareReduction) {
    return;
  }

  console.log('[LightAdapt] Detecting bright elements for glare reduction');

  // Find potentially bright elements
  const images = document.querySelectorAll('img');
  const videos = document.querySelectorAll('video');
  // const _brightBgs = document.querySelectorAll('[style*="background"]'); // Reserved for future use

  // Check each image
  images.forEach(img => {
    if (img.complete) {
      checkImageBrightness(img);
    } else {
      img.addEventListener('load', () => checkImageBrightness(img));
    }
  });

  // Apply filter to videos
  videos.forEach(video => {
    const glareIntensity = lightAdapt_settings.glareReduction / 100;
    video.style.filter = `brightness(${1 - glareIntensity * 0.3})`;
  });
}

/**
 * Check if an image is too bright and apply dimming
 *
 * @param {HTMLImageElement} img - Image element to check
 */
function checkImageBrightness(img) {
  // Skip small images
  if (img.width < 100 || img.height < 100) {
    return;
  }

  try {
    // Sample image brightness using canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 50;
    canvas.height = 50;

    ctx.drawImage(img, 0, 0, 50, 50);
    const imageData = ctx.getImageData(0, 0, 50, 50).data;

    // Calculate average brightness
    let totalBrightness = 0;
    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      // Perceived brightness formula
      totalBrightness += (r * 299 + g * 587 + b * 114) / 1000;
    }
    const avgBrightness = totalBrightness / (imageData.length / 4);

    // If image is too bright (>200 average), apply glare reduction
    if (avgBrightness > 200) {
      const glareIntensity = lightAdapt_settings.glareReduction / 100;
      const dimAmount = ((avgBrightness - 200) / 55) * glareIntensity * 0.3;
      img.style.filter = `brightness(${1 - dimAmount})`;
      console.log(`[LightAdapt] Dimmed bright image (brightness: ${Math.round(avgBrightness)})`);
    }
  } catch {
    // Cross-origin images will fail - that's OK
  }
}

// ============================================================================
// TIME OF DAY PROFILES
// ============================================================================

/**
 * Apply time-of-day brightness profile
 */
function applyTimeOfDayProfile() {
  const hour = new Date().getHours();
  let suggestedBrightness;

  if (hour >= 22 || hour < 6) {
    // Night: 10pm - 6am
    suggestedBrightness = 50;
  } else if (hour >= 6 && hour < 9) {
    // Morning: 6am - 9am
    suggestedBrightness = 70;
  } else if (hour >= 9 && hour < 17) {
    // Day: 9am - 5pm
    suggestedBrightness = 85;
  } else if (hour >= 17 && hour < 20) {
    // Evening: 5pm - 8pm
    suggestedBrightness = 75;
  } else {
    // Late evening: 8pm - 10pm
    suggestedBrightness = 60;
  }

  // Only apply if user hasn't set a custom brightness
  if (!lightAdapt_settings.targetBrightness) {
    console.log(
      `[LightAdapt] Applying time-of-day profile: ${suggestedBrightness}% (hour: ${hour})`
    );
    lightAdapt_targetBrightness = suggestedBrightness;
    if (lightAdapt_enabled) {
      transitionToBrightness(suggestedBrightness);
    }
  }
}

// ============================================================================
// PAGE CHANGE OBSERVER
// ============================================================================

/**
 * Observe page changes to reapply brightness
 */
function observePageChanges() {
  // Prevent flash on navigation
  document.documentElement.classList.add('stargardt-light-adapt-loading');

  // Use MutationObserver to detect significant DOM changes
  const observer = new MutationObserver(mutations => {
    let significantChange = false;

    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 5) {
        significantChange = true;
      }
    });

    if (significantChange && lightAdapt_settings.glareReduction > 0) {
      // Debounce glare detection
      clearTimeout(lightAdapt_transitionTimeout);
      lightAdapt_transitionTimeout = setTimeout(detectAndReduceGlare, 1000);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Remove loading class after initial setup
  setTimeout(() => {
    document.documentElement.classList.remove('stargardt-light-adapt-loading');
  }, 100);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get current brightness level
 *
 * @returns {number} Current brightness percentage
 */
export function getCurrentBrightness() {
  return lightAdapt_currentBrightness;
}

/**
 * Get target brightness level
 *
 * @returns {number} Target brightness percentage
 */
export function getTargetBrightness() {
  return lightAdapt_targetBrightness;
}

/**
 * Check if ambient sensor is available
 *
 * @returns {boolean} Whether ambient light sensor is available
 */
export function isAmbientSensorAvailable() {
  return 'AmbientLightSensor' in window;
}

/**
 * Check if enabled
 */
export function isEnabled() {
  return lightAdapt_enabled;
}

/**
 * Get status
 */
export function getStatus() {
  return {
    enabled: lightAdapt_enabled,
    currentBrightness: lightAdapt_currentBrightness,
    targetBrightness: lightAdapt_targetBrightness,
    ambientSensorActive: lightAdapt_ambientSensor !== null,
    settings: lightAdapt_settings,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initialize,
  enable,
  disable,
  updateSettings,
  transitionToBrightness,
  getCurrentBrightness,
  getTargetBrightness,
  isAmbientSensorAvailable,
  isEnabled,
  getStatus,
};
