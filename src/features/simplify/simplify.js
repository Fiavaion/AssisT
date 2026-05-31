/**
 * Simplified Interface Mode Feature Module
 *
 * Reduces visual clutter by hiding non-essential elements on web pages.
 * This feature is critical for users with ADHD, autism spectrum conditions,
 * anxiety disorders, or cognitive processing differences who may become
 * overwhelmed by busy, cluttered interfaces.
 *
 * Features:
 * - Hides advertisements and promotional content
 * - Removes sidebars and non-essential navigation
 * - Hides comment sections and social sharing buttons
 * - Removes pop-ups and overlays
 * - Disables decorative animations
 * - Optionally highlights main content area
 * - Three intensity levels: light, moderate, aggressive
 *
 * WCAG Compliance: WCAG 2.2 SC 2.4.1 (Bypass Blocks)
 * WAI-Adapt: Supports content adaptation and personalization
 *
 * @module simplify
 * @version 1.0.0
 */

import { showToast } from '../../core/ui/toast.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';

/** @type {boolean} Tracks whether simplified interface is currently enabled */
let simplify_enabled = false;

/** @type {HTMLStyleElement|null} Reference to the injected style element */
let simplify_styleElement = null;

/** @type {Object} Current settings for simplified interface */
let simplify_settings = {
  enabled: false,
  hideAds: true,
  hideSidebars: true,
  hideComments: true,
  hideRelated: true, // related content sections
  hideFooters: true,
  hideSocialButtons: true,
  hidePopups: true,
  hideAnimations: true,
  focusMainContent: true, // highlight main content area
  intensity: 'moderate', // 'light' | 'moderate' | 'aggressive'
};

/** @type {Object} Default settings (frozen copy) */
const DEFAULT_SETTINGS = Object.freeze({ ...simplify_settings });

/**
 * Generates CSS rules to hide elements based on current settings.
 *
 * The CSS uses high specificity and !important to override site styles.
 * Selectors are carefully chosen to target common patterns across websites
 * while avoiding breaking essential functionality.
 *
 * @function simplify_generateCSS
 * @returns {string} CSS rules to simplify the interface
 */
function simplify_generateCSS() {
  const { intensity } = simplify_settings;
  let css = `
    /* Simplified Interface Mode - WCAG 2.2 SC 2.4.1 Compliant */
    /* Reduces visual clutter for cognitive accessibility */
  `;

  if (simplify_settings.hideAds) {
    css += `
    /* Advertisement Removal */
    [class*="ad-"]:not([class*="add"]):not([class*="head"]):not([class*="read"]):not([class*="lead"]),
    [class*="advertisement"],
    [class*="sponsored"],
    [id*="ad-"]:not([id*="add"]):not([id*="head"]):not([id*="read"]),
    [id*="ads"]:not([id*="heads"]):not([id*="reads"]),
    [id*="adsense"],
    [data-ad],
    [data-ad-slot],
    .ad:not(.add):not(.addition),
    .ads:not(.heads),
    .advert,
    .advertisement,
    .sponsored,
    .sponsor-content,
    .promo,
    .promotion,
    iframe[src*="doubleclick"],
    iframe[src*="googlesyndication"],
    iframe[src*="/ads/"],
    iframe[src*="advertising"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      height: 0 !important;
      width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    `;
  }

  if (simplify_settings.hidePopups) {
    css += `
    /* Pop-up and Overlay Removal */
    [class*="popup"]:not([role="dialog"]):not([aria-modal="true"]),
    [class*="pop-up"],
    [class*="overlay"]:not(.assist-):not([data-assist]),
    [class*="modal"]:not([role="dialog"]):not([aria-modal="true"]),
    [class*="lightbox"],
    [id*="popup"],
    [id*="modal"]:not([role="dialog"]),
    .popup:not([role="dialog"]),
    .modal-backdrop,
    .overlay-background,
    .interstitial,
    [class*="newsletter-popup"],
    [class*="subscribe-popup"],
    [class*="cookie-banner"]:not([role="dialog"]) {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
    }

    /* Remove modal-open class side effects */
    body.modal-open {
      overflow: auto !important;
    }
    `;
  }

  if (simplify_settings.hideSocialButtons) {
    css += `
    /* Social Media Button Removal */
    [class*="share"]:not([class*="shareholder"]),
    [class*="social"]:not([class*="associate"]):not([class*="dissociate"]),
    [id*="share"]:not([id*="shareholder"]),
    [id*="social"],
    .social-buttons,
    .social-share,
    .share-buttons,
    .sharing,
    .social-media,
    [aria-label*="share" i],
    [aria-label*="social" i],
    .fb-like,
    .twitter-share,
    .linkedin-share,
    iframe[src*="facebook.com/plugins"],
    iframe[src*="twitter.com/widgets"],
    iframe[src*="linkedin.com/share"] {
      display: none !important;
      visibility: hidden !important;
    }
    `;
  }

  if (simplify_settings.hideAnimations) {
    css += `
    /* Decorative Animation Removal */
    [class*="animate"]:not(video):not(audio),
    [class*="animation"],
    .animated,
    .animating {
      animation: none !important;
      transition: none !important;
    }

    /* Disable infinite scrolling loaders */
    [class*="loading"],
    [class*="spinner"]:not(input[type="number"]),
    .loader {
      animation: none !important;
    }
    `;
  }

  if (simplify_settings.hideSidebars && (intensity === 'moderate' || intensity === 'aggressive')) {
    css += `
    /* Sidebar Removal */
    aside:not([role="search"]):not([role="navigation"]),
    [class*="sidebar"]:not([role="navigation"]):not([role="search"]),
    [id*="sidebar"]:not([role="navigation"]),
    [role="complementary"],
    .side-panel,
    .side-column,
    .widget-area,
    [class*="rail"] {
      display: none !important;
      visibility: hidden !important;
    }
    `;
  }

  if (simplify_settings.hideComments && (intensity === 'moderate' || intensity === 'aggressive')) {
    css += `
    /* Comment Section Removal */
    [class*="comment"]:not([role="form"]),
    [id*="comment"],
    #comments,
    .comments-section,
    .comment-section,
    .comment-list,
    .discussion,
    [aria-label*="comment" i],
    iframe[src*="disqus"],
    iframe[src*="facebook.com/plugins/comments"] {
      display: none !important;
      visibility: hidden !important;
    }
    `;
  }

  if (simplify_settings.hideRelated && (intensity === 'moderate' || intensity === 'aggressive')) {
    css += `
    /* Related Content Removal */
    [class*="related"]:not([aria-label*="navigation"]),
    [class*="recommended"],
    [class*="suggestion"],
    [id*="related"],
    [id*="recommended"],
    .you-might-like,
    .more-stories,
    .related-articles,
    .recommended-reading,
    .suggestions,
    [aria-label*="related" i],
    [aria-label*="recommended" i] {
      display: none !important;
      visibility: hidden !important;
    }
    `;
  }

  if (simplify_settings.hideFooters && intensity === 'aggressive') {
    css += `
    /* Footer Removal (aggressive mode only) */
    footer:not([role="contentinfo"]):not([role="navigation"]),
    [class*="footer"]:not([role="contentinfo"]):not([role="navigation"]),
    #footer:not([role="contentinfo"]) {
      display: none !important;
      visibility: hidden !important;
    }
    `;
  }

  // Note: focusMainContent is intentionally minimal to avoid breaking page layouts.
  // The previous implementation with box-shadow and opacity dimming caused issues
  // on many websites by affecting navigation and other essential elements.
  if (simplify_settings.focusMainContent) {
    css += `
    /* Main Content Focus Enhancement - Minimal approach */
    /* Only applies subtle visual cues without breaking layouts */
    main,
    [role="main"],
    .main-content,
    #main-content {
      position: relative;
      z-index: 1;
    }
    `;
  }

  return css;
}

/**
 * Applies simplified interface CSS to the page.
 *
 * Creates a style element with CSS rules that hide non-essential elements
 * based on current settings and intensity level.
 *
 * @function simplify_apply
 * @returns {void}
 */
function simplify_apply() {
  if (simplify_styleElement) {
    // Update existing styles if settings changed
    simplify_styleElement.textContent = simplify_generateCSS();
    return;
  }

  simplify_styleElement = document.createElement('style');
  simplify_styleElement.id = 'assist-simplify-styles';
  simplify_styleElement.textContent = simplify_generateCSS();
  document.head.appendChild(simplify_styleElement);

  console.log('[Simplify] CSS applied with intensity:', simplify_settings.intensity);
}

/**
 * Removes simplified interface CSS from the page.
 *
 * Cleanly removes the style element, restoring original interface complexity.
 *
 * @function simplify_remove
 * @returns {void}
 */
function simplify_remove() {
  if (simplify_styleElement) {
    simplify_styleElement.remove();
    simplify_styleElement = null;
    console.log('[Simplify] CSS removed');
  }
}

/**
 * Enables the simplified interface feature.
 *
 * Sets the enabled flag and applies the CSS rules.
 * Displays a toast notification to confirm the action.
 *
 * @function simplify_enable
 * @returns {void}
 */
function simplify_enable() {
  simplify_enabled = true;
  simplify_apply();
  showToast(`Simplified Interface enabled (${simplify_settings.intensity} mode)`);
  console.log('[Simplify] Enabled');
}

/**
 * Disables the simplified interface feature.
 *
 * Clears the enabled flag and removes the CSS rules.
 * Displays a toast notification to confirm the action.
 *
 * @function simplify_disable
 * @returns {void}
 */
function simplify_disable() {
  simplify_enabled = false;
  simplify_remove();
  showToast('Simplified Interface disabled - full interface restored');
  console.log('[Simplify] Disabled');
}

/**
 * Sets the intensity level of simplification.
 *
 * @function simplify_setIntensity
 * @param {string} level - Intensity level: 'light' | 'moderate' | 'aggressive'
 * @returns {void}
 */
function simplify_setIntensity(level) {
  if (!['light', 'moderate', 'aggressive'].includes(level)) {
    console.error('[Simplify] Invalid intensity level:', level);
    return;
  }

  const oldLevel = simplify_settings.intensity;
  simplify_settings.intensity = level;

  // If enabled, reapply with new intensity
  if (simplify_enabled) {
    simplify_apply();
    showToast(`Simplification intensity: ${level}`);
    console.log(`[Simplify] Intensity changed: ${oldLevel} → ${level}`);
  }
}

/**
 * Gets current settings for external access.
 *
 * @function simplify_getSettings
 * @returns {Object} Current settings (frozen copy)
 */
function simplify_getSettings() {
  return Object.freeze({ ...simplify_settings });
}

/**
 * Applies settings from storage to the module state.
 *
 * Merges stored settings with defaults and updates the interface accordingly.
 *
 * @function applySettings
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 * @returns {void}
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = simplify_enabled;

  // Merge settings with defaults
  simplify_settings = {
    ...DEFAULT_SETTINGS,
    ...settings,
  };

  const shouldEnable = simplify_settings.enabled || false;

  // Handle enable/disable
  if (shouldEnable && !wasEnabled) {
    simplify_enable();
  } else if (!shouldEnable && wasEnabled) {
    simplify_disable();
  } else if (shouldEnable && wasEnabled) {
    // Already enabled, but settings may have changed - reapply
    simplify_apply();
  }

  console.log(
    `[Simplify] Settings ${isInit ? 'loaded' : 'updated'}:`,
    'enabled=',
    shouldEnable,
    'intensity=',
    simplify_settings.intensity
  );
}

/**
 * Initialize simplified interface using centralized storage utility.
 * Uses initFeatureSettings for consistent storage access pattern.
 */
initFeatureSettings(
  'simplify',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

export { simplify_enable, simplify_disable, simplify_setIntensity, simplify_getSettings };
