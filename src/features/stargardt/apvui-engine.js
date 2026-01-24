/**
 * Stargardt Module - Adaptive Peripheral Vision UI Engine
 *
 * UI patterns optimized for peripheral perception, including:
 * - Radial menu system at scotoma boundary
 * - Edge-anchored UI elements
 * - Motion cues for peripheral attention
 * - Ultra-high contrast modes
 *
 * @module stargardt/apvui-engine
 */

import { sanitizeHTML } from '../../utils/sanitize.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let apvui_enabled = false;
let apvui_settings = {};
let apvui_profile = null;
// let _apvui_styleElement = null; // Reserved for future use
let apvui_radialMenu = null;
let apvui_motionCueInterval = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the APVUI engine
 *
 * @param {Object} settings - APVUI settings
 * @param {Object} profile - Scotoma profile
 */
export function initialize(settings, profile) {
  console.log('[APVUI] Initializing...');

  apvui_settings = settings || {};
  apvui_profile = profile;

  // Inject styles
  injectStyles();

  // Enable components based on settings
  if (apvui_settings.enabled !== false) {
    enable();
  }

  console.log('[APVUI] Initialized');
}

/**
 * Enable APVUI
 */
export function enable() {
  if (apvui_enabled) {
    return;
  }

  console.log('[APVUI] Enabling...');
  apvui_enabled = true;

  // Apply high contrast if enabled
  if (apvui_settings.ultraHighContrast) {
    enableHighContrast();
  }

  // Set up radial menus if enabled
  if (apvui_settings.radialMenus) {
    setupRadialMenus();
  }

  // Set up edge anchoring
  if (apvui_settings.edgeAnchoring) {
    enableEdgeAnchoring();
  }

  // Start motion cues
  if (apvui_settings.motionCues) {
    startMotionCues();
  }

  // Apply minimum touch targets
  applyMinimumTouchTargets();

  console.log('[APVUI] Enabled');
}

/**
 * Disable APVUI
 */
export function disable() {
  if (!apvui_enabled) {
    return;
  }

  console.log('[APVUI] Disabling...');
  apvui_enabled = false;

  // Clean up components
  disableHighContrast();
  removeRadialMenus();
  disableEdgeAnchoring();
  stopMotionCues();
  resetTouchTargets();

  console.log('[APVUI] Disabled');
}

/**
 * Update settings
 */
export function updateSettings(settings) {
  const wasEnabled = apvui_enabled;
  apvui_settings = { ...apvui_settings, ...settings };

  if (wasEnabled) {
    disable();
    enable();
  }
}

// ============================================================================
// STYLE INJECTION
// ============================================================================

/**
 * Inject APVUI styles
 */
function injectStyles() {
  if (document.getElementById('stargardt-apvui-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'stargardt-apvui-styles';
  style.textContent = `
    /* Ultra High Contrast Mode */
    .stargardt-uhc body,
    .stargardt-uhc main,
    .stargardt-uhc article {
      background: #000000 !important;
      color: #ffffff !important;
    }

    .stargardt-uhc a {
      color: #00ffff !important;
      text-decoration: underline !important;
    }

    .stargardt-uhc button,
    .stargardt-uhc input,
    .stargardt-uhc select {
      background: #000000 !important;
      color: #ffffff !important;
      border: 3px solid #ffffff !important;
    }

    .stargardt-uhc img {
      filter: contrast(1.5) brightness(1.2) !important;
    }

    /* Edge Anchoring */
    .stargardt-edge-anchor {
      position: fixed !important;
      z-index: 2147483630 !important;
    }

    .stargardt-edge-anchor-left {
      left: 0 !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
    }

    .stargardt-edge-anchor-right {
      right: 0 !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
    }

    .stargardt-edge-anchor-top {
      top: 0 !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
    }

    .stargardt-edge-anchor-bottom {
      bottom: 0 !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
    }

    /* Radial Menu */
    .stargardt-radial-menu {
      position: fixed;
      z-index: 2147483645;
      pointer-events: none;
    }

    .stargardt-radial-item {
      position: absolute;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: rgba(99, 102, 241, 0.9);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      cursor: pointer;
      pointer-events: auto;
      transition: transform 0.2s ease, background 0.2s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }

    .stargardt-radial-item:hover {
      transform: scale(1.15);
      background: rgba(99, 102, 241, 1);
    }

    .stargardt-radial-item:focus {
      outline: 3px solid #ffffff;
      outline-offset: 2px;
    }

    /* Motion Cue */
    .stargardt-motion-cue {
      position: fixed;
      width: 12px;
      height: 12px;
      background: rgba(74, 222, 128, 0.8);
      border-radius: 50%;
      pointer-events: none;
      z-index: 2147483635;
      animation: stargardt-pulse 1s ease-in-out;
    }

    @keyframes stargardt-pulse {
      0% { transform: scale(1); opacity: 1; }
      50% { transform: scale(2); opacity: 0.5; }
      100% { transform: scale(3); opacity: 0; }
    }

    /* Minimum Touch Targets */
    .stargardt-min-touch a,
    .stargardt-min-touch button,
    .stargardt-min-touch input[type="button"],
    .stargardt-min-touch input[type="submit"],
    .stargardt-min-touch [role="button"],
    .stargardt-min-touch [role="link"] {
      min-width: 48px !important;
      min-height: 48px !important;
      padding: 12px !important;
    }

    /* Size Scaling Based on Distance from Scotoma */
    .stargardt-scaled-near {
      font-size: 1.3em !important;
    }

    .stargardt-scaled-far {
      font-size: 1.1em !important;
    }

    /* Accessibility Improvements */
    @media (prefers-reduced-motion: reduce) {
      .stargardt-motion-cue {
        animation: none !important;
        display: none !important;
      }
    }
  `;

  document.head.appendChild(style);
  apvui_styleElement = style;
}

// ============================================================================
// HIGH CONTRAST MODE
// ============================================================================

/**
 * Enable ultra-high contrast mode
 */
function enableHighContrast() {
  console.log('[APVUI] Enabling ultra-high contrast');
  document.documentElement.classList.add('stargardt-uhc');

  // Force repaint
  document.body.style.display = 'none';
  document.body.offsetHeight; // Trigger reflow
  document.body.style.display = '';
}

/**
 * Disable ultra-high contrast mode
 */
function disableHighContrast() {
  document.documentElement.classList.remove('stargardt-uhc');
}

// ============================================================================
// RADIAL MENUS
// ============================================================================

/**
 * Set up radial menu system
 */
function setupRadialMenus() {
  console.log('[APVUI] Setting up radial menus');

  // Create container for radial menus
  const container = document.createElement('div');
  container.id = 'stargardt-radial-container';
  container.className = 'stargardt-radial-menu';
  document.body.appendChild(container);
  apvui_radialMenu = container;

  // Listen for right-click to show radial menu
  document.addEventListener('contextmenu', handleContextMenu);
}

/**
 * Remove radial menus
 */
function removeRadialMenus() {
  if (apvui_radialMenu) {
    apvui_radialMenu.remove();
    apvui_radialMenu = null;
  }
  document.removeEventListener('contextmenu', handleContextMenu);
}

/**
 * Handle context menu to show radial menu
 */
function handleContextMenu(e) {
  if (!apvui_enabled || !apvui_settings.radialMenus) {
    return;
  }

  e.preventDefault();

  // Calculate position at scotoma boundary
  let menuX = e.clientX;
  let menuY = e.clientY;

  if (apvui_profile) {
    const scotomaX = (apvui_profile.boundary.centerX / 100) * window.innerWidth;
    const scotomaY = (apvui_profile.boundary.centerY / 100) * window.innerHeight;
    const scotomaR = (apvui_profile.boundary.radiusX / 100) * window.innerWidth;

    // If click is in scotoma, move menu to boundary
    const dx = menuX - scotomaX;
    const dy = menuY - scotomaY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < scotomaR) {
      const angle = Math.atan2(dy, dx);
      menuX = scotomaX + Math.cos(angle) * (scotomaR + 30);
      menuY = scotomaY + Math.sin(angle) * (scotomaR + 30);
    }
  }

  showRadialMenu(menuX, menuY);
}

/**
 * Show radial menu at position
 */
function showRadialMenu(x, y) {
  if (!apvui_radialMenu) {
    return;
  }

  // Clear existing items
  apvui_radialMenu.innerHTML = sanitizeHTML('');

  // Menu items
  const items = [
    { icon: '🔊', action: 'read', label: 'Read aloud' },
    { icon: '🔍', action: 'zoom', label: 'Zoom' },
    { icon: '📋', action: 'copy', label: 'Copy' },
    { icon: '🎨', action: 'contrast', label: 'Toggle contrast' },
    { icon: '⚙️', action: 'settings', label: 'Settings' },
    { icon: '✕', action: 'close', label: 'Close' },
  ];

  // Position items in a circle
  const radius = 80;
  items.forEach((item, index) => {
    const angle = (index / items.length) * Math.PI * 2 - Math.PI / 2;
    const itemX = radius * Math.cos(angle);
    const itemY = radius * Math.sin(angle);

    const btn = document.createElement('button');
    btn.className = 'stargardt-radial-item';
    btn.style.left = `${itemX + x - 24}px`;
    btn.style.top = `${itemY + y - 24}px`;
    btn.innerHTML = sanitizeHTML(item.icon);
    btn.setAttribute('aria-label', item.label);
    btn.setAttribute('title', item.label);
    btn.onclick = () => {
      handleRadialAction(item.action);
      hideRadialMenu();
    };

    apvui_radialMenu.appendChild(btn);
  });

  // Click outside to close
  setTimeout(() => {
    document.addEventListener('click', hideRadialMenuOnClick);
  }, 100);
}

/**
 * Hide radial menu
 */
function hideRadialMenu() {
  if (apvui_radialMenu) {
    apvui_radialMenu.innerHTML = sanitizeHTML('');
  }
  document.removeEventListener('click', hideRadialMenuOnClick);
}

function hideRadialMenuOnClick(e) {
  if (!e.target.classList.contains('stargardt-radial-item')) {
    hideRadialMenu();
  }
}

/**
 * Handle radial menu action
 */
function handleRadialAction(action) {
  console.log('[APVUI] Radial action:', action);

  switch (action) {
    case 'read':
      // Trigger TTS on selection
      const selection = window.getSelection().toString();
      if (selection) {
        const utterance = new SpeechSynthesisUtterance(selection);
        window.speechSynthesis.speak(utterance);
      }
      break;
    case 'zoom':
      // Toggle zoom
      const currentZoom = document.body.style.zoom || '100%';
      document.body.style.zoom = currentZoom === '100%' ? '150%' : '100%';
      break;
    case 'copy':
      // Copy selection
      document.execCommand('copy');
      break;
    case 'contrast':
      // Toggle high contrast
      document.documentElement.classList.toggle('stargardt-uhc');
      break;
    case 'settings':
      // Open extension popup
      chrome.runtime.sendMessage({ action: 'openPopup' });
      break;
    case 'close':
      hideRadialMenu();
      break;
  }
}

// ============================================================================
// EDGE ANCHORING
// ============================================================================

/**
 * Enable edge anchoring for important UI elements
 */
function enableEdgeAnchoring() {
  console.log('[APVUI] Enabling edge anchoring');

  // Find navigation and important UI elements
  const navElements = document.querySelectorAll('nav, [role="navigation"], .nav, .menu');

  navElements.forEach(el => {
    if (el.getBoundingClientRect().height < 200) {
      el.classList.add('stargardt-edge-anchor', 'stargardt-edge-anchor-top');
    }
  });
}

/**
 * Disable edge anchoring
 */
function disableEdgeAnchoring() {
  const anchored = document.querySelectorAll('.stargardt-edge-anchor');
  anchored.forEach(el => {
    el.classList.remove(
      'stargardt-edge-anchor',
      'stargardt-edge-anchor-top',
      'stargardt-edge-anchor-bottom',
      'stargardt-edge-anchor-left',
      'stargardt-edge-anchor-right'
    );
  });
}

// ============================================================================
// MOTION CUES
// ============================================================================

/**
 * Start peripheral motion cues
 */
function startMotionCues() {
  console.log('[APVUI] Starting motion cues');

  // Periodically show motion cues in peripheral vision
  apvui_motionCueInterval = setInterval(() => {
    if (!apvui_enabled) {
      return;
    }

    // Only show cues occasionally
    if (Math.random() > 0.3) {
      return;
    }

    showMotionCue();
  }, 5000);
}

/**
 * Stop motion cues
 */
function stopMotionCues() {
  if (apvui_motionCueInterval) {
    clearInterval(apvui_motionCueInterval);
    apvui_motionCueInterval = null;
  }
}

/**
 * Show a motion cue in peripheral vision
 */
function showMotionCue() {
  // Calculate position in peripheral vision
  let cueX, cueY;

  if (apvui_profile) {
    // Place cue at scotoma boundary
    const scotomaX = (apvui_profile.boundary.centerX / 100) * window.innerWidth;
    const scotomaY = (apvui_profile.boundary.centerY / 100) * window.innerHeight;
    const scotomaR = (apvui_profile.boundary.radiusX / 100) * window.innerWidth;

    const angle = Math.random() * Math.PI * 2;
    cueX = scotomaX + Math.cos(angle) * (scotomaR + 50);
    cueY = scotomaY + Math.sin(angle) * (scotomaR + 50);
  } else {
    // Random edge position
    const edge = Math.floor(Math.random() * 4);
    switch (edge) {
      case 0: // Top
        cueX = Math.random() * window.innerWidth;
        cueY = 50;
        break;
      case 1: // Right
        cueX = window.innerWidth - 50;
        cueY = Math.random() * window.innerHeight;
        break;
      case 2: // Bottom
        cueX = Math.random() * window.innerWidth;
        cueY = window.innerHeight - 50;
        break;
      case 3: // Left
        cueX = 50;
        cueY = Math.random() * window.innerHeight;
        break;
    }
  }

  const cue = document.createElement('div');
  cue.className = 'stargardt-motion-cue';
  cue.style.left = `${cueX}px`;
  cue.style.top = `${cueY}px`;

  document.body.appendChild(cue);

  // Remove after animation
  setTimeout(() => cue.remove(), 1000);
}

// ============================================================================
// TOUCH TARGETS
// ============================================================================

/**
 * Apply minimum touch target sizes
 */
function applyMinimumTouchTargets() {
  const minSize = apvui_settings.minTouchTarget || 48;
  console.log(`[APVUI] Applying minimum touch target: ${minSize}px`);

  document.documentElement.classList.add('stargardt-min-touch');

  // Also apply to existing elements that might not match CSS selectors
  const interactives = document.querySelectorAll('a, button, input, select, [onclick]');
  interactives.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width < minSize || rect.height < minSize) {
      el.style.minWidth = `${minSize}px`;
      el.style.minHeight = `${minSize}px`;
    }
  });
}

/**
 * Reset touch target modifications
 */
function resetTouchTargets() {
  document.documentElement.classList.remove('stargardt-min-touch');
}

// ============================================================================
// SIZE SCALING
// ============================================================================

/**
 * Apply size scaling based on distance from scotoma
 *
 * @param {HTMLElement} element - Element to scale
 */
export function applyDistanceScaling(element) {
  if (!apvui_profile) {
    return;
  }

  const rect = element.getBoundingClientRect();
  const elCenterX = rect.left + rect.width / 2;
  const elCenterY = rect.top + rect.height / 2;

  const scotomaX = (apvui_profile.boundary.centerX / 100) * window.innerWidth;
  const scotomaY = (apvui_profile.boundary.centerY / 100) * window.innerHeight;
  const scotomaR = (apvui_profile.boundary.radiusX / 100) * window.innerWidth;

  const distance = Math.sqrt(Math.pow(elCenterX - scotomaX, 2) + Math.pow(elCenterY - scotomaY, 2));

  // Scale elements near the scotoma boundary larger
  if (distance < scotomaR * 1.5) {
    element.classList.add('stargardt-scaled-near');
    element.classList.remove('stargardt-scaled-far');
  } else if (distance < scotomaR * 3) {
    element.classList.add('stargardt-scaled-far');
    element.classList.remove('stargardt-scaled-near');
  } else {
    element.classList.remove('stargardt-scaled-near', 'stargardt-scaled-far');
  }
}

// ============================================================================
// STATUS
// ============================================================================

/**
 * Get APVUI status
 */
export function getStatus() {
  return {
    enabled: apvui_enabled,
    settings: apvui_settings,
    hasProfile: apvui_profile !== null,
    highContrastActive: document.documentElement.classList.contains('stargardt-uhc'),
  };
}

/**
 * Check if enabled
 */
export function isEnabled() {
  return apvui_enabled;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initialize,
  enable,
  disable,
  updateSettings,
  applyDistanceScaling,
  showRadialMenu,
  hideRadialMenu,
  getStatus,
  isEnabled,
};
