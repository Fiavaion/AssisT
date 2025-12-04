/**
 * NCAD Demo Page Script
 * Handles demo page interactions and AssisT feature integration
 */

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', init);

function init() {
  bindCloseButton();
  logDemoLoaded();
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Close demo button - returns to previous page or closes tab
 */
function bindCloseButton() {
  const btnClose = document.getElementById('btn-close-demo');
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      // Try to go back in history, or close the tab
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.close();
      }
    });
  }
}

/**
 * Log that demo page loaded for debugging
 */
function logDemoLoaded() {
  console.log('[AssisT Demo] NCAD demo page loaded');
  console.log('[AssisT Demo] Try using your recommended AssisT features on this page:');
  console.log('  - TTS: Select text and press Alt+R to read aloud');
  console.log('  - Focus Mode: Press Alt+F to reduce distractions');
  console.log('  - Annotations: Highlight text to add notes');
  console.log('  - Citations: Right-click to save this page as a source');
}

// ============================================================================
// AssisT Integration Helpers
// ============================================================================

/**
 * Check if AssisT content script is available
 * @returns {boolean}
 */
function isAssistAvailable() {
  return typeof window.assistTools !== 'undefined';
}

/**
 * Get user's discovery profile if available
 * @returns {Promise<Object|null>}
 */
async function getDiscoveryProfile() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    const result = await chrome.storage.local.get('discoveryProfile');
    return result.discoveryProfile || null;
  }
  return null;
}

/**
 * Display recommended features based on profile
 * (Future enhancement - show inline tips for recommended features)
 */
async function showRecommendedFeatures() {
  const profile = await getDiscoveryProfile();
  if (profile && profile.recommendations) {
    console.log('[AssisT Demo] Your recommended features:', profile.enabledFeatures);
  }
}

// Check for profile on load
showRecommendedFeatures();
