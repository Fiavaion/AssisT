/**
 * WAI-Adapt Manager
 * Implements W3C WAI-Adapt personalization features
 * - Text Spacing (WCAG 2.2 SC 1.4.12)
 * - Focus Mode (hiding extraneous information)
 * - Numeric simplification (for dyscalculia)
 */

export class WAIAdaptManager {
  constructor(domAdapter) {
    this.domAdapter = domAdapter;
    this.focusModeActive = false;
    this.hiddenElements = new Map();
  }

  /**
   * Apply WCAG 2.2 SC 1.4.12 text spacing requirements
   * Must support user customization without content loss
   */
  applyTextSpacing(settings) {
    const { lineHeight, paragraphSpacing, letterSpacing, wordSpacing } = settings;

    const styleId = 'assist-text-spacing';
    let styleElement = document.getElementById(styleId);

    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    styleElement.textContent = `
      .assist-adapted-text {
        line-height: ${lineHeight} !important;
        letter-spacing: ${letterSpacing}em !important;
        word-spacing: ${wordSpacing}em !important;
      }

      .assist-adapted-text p {
        margin-bottom: ${paragraphSpacing}em !important;
      }

      .assist-adapted-text h1,
      .assist-adapted-text h2,
      .assist-adapted-text h3,
      .assist-adapted-text h4,
      .assist-adapted-text h5,
      .assist-adapted-text h6 {
        line-height: ${lineHeight * 1.1} !important;
        margin-bottom: ${paragraphSpacing * 0.75}em !important;
      }
    `;

    // Apply to main content area
    const contentArea = this.domAdapter.getMainContentArea();
    if (contentArea) {
      contentArea.classList.add('assist-adapted-text');
    }

    console.log('[WAI-Adapt] Text spacing applied:', settings);
  }

  /**
   * Remove text spacing adaptations
   */
  removeTextSpacing() {
    const styleElement = document.getElementById('assist-text-spacing');
    if (styleElement) {
      styleElement.remove();
    }

    const contentArea = this.domAdapter.getMainContentArea();
    if (contentArea) {
      contentArea.classList.remove('assist-adapted-text');
    }

    console.log('[WAI-Adapt] Text spacing removed');
  }

  /**
   * Enable focus mode - hide extraneous information
   * Implements WAI-Adapt "hiding extraneous information"
   */
  enableFocusMode() {
    if (this.focusModeActive) {
      return;
    }

    const extraneous = this.domAdapter.getExtraneousElements();

    extraneous.forEach(element => {
      // Store original display value
      const originalDisplay = window.getComputedStyle(element).display;
      this.hiddenElements.set(element, originalDisplay);

      // Hide element
      element.style.display = 'none';
      element.setAttribute('aria-hidden', 'true');
      element.setAttribute('data-assist-hidden', 'true');
    });

    // Add focus mode indicator
    this.addFocusModeIndicator();

    this.focusModeActive = true;
    console.log(`[WAI-Adapt] Focus mode enabled, ${extraneous.length} elements hidden`);
  }

  /**
   * Disable focus mode - restore hidden elements
   */
  disableFocusMode() {
    if (!this.focusModeActive) {
      return;
    }

    this.hiddenElements.forEach((originalDisplay, element) => {
      element.style.display = originalDisplay;
      element.removeAttribute('aria-hidden');
      element.removeAttribute('data-assist-hidden');
    });

    this.hiddenElements.clear();
    this.removeFocusModeIndicator();

    this.focusModeActive = false;
    console.log('[WAI-Adapt] Focus mode disabled');
  }

  /**
   * Toggle focus mode
   */
  toggleFocusMode() {
    if (this.focusModeActive) {
      this.disableFocusMode();
    } else {
      this.enableFocusMode();
    }
  }

  /**
   * Add visual indicator for focus mode
   */
  addFocusModeIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'assist-focus-mode-indicator';
    indicator.className = 'assist-focus-indicator';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    indicator.textContent = 'Focus Mode Active';

    const style = document.createElement('style');
    style.textContent = `
      .assist-focus-indicator {
        position: fixed;
        top: 10px;
        right: 10px;
        background: #4CAF50;
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        z-index: 999999;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(indicator);
  }

  /**
   * Remove focus mode indicator
   */
  removeFocusModeIndicator() {
    const indicator = document.getElementById('assist-focus-mode-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  /**
   * Simplify numeric information for dyscalculia support
   * Converts dates, times, and numbers to more accessible formats
   */
  simplifyNumericInfo() {
    const numericElements = this.domAdapter.getNumericElements();

    numericElements.forEach(({ node, text }) => {
      // Check for date/time patterns
      const dateRegex = /\d{1,2}\/\d{1,2}\/\d{2,4}/;
      const timeRegex = /\d{1,2}:\d{2}/;

      if (dateRegex.test(text) || timeRegex.test(text)) {
        const simplified = this.domAdapter.simplifyDateTime(text);

        // Create accessible replacement
        const span = document.createElement('span');
        span.className = 'assist-simplified-numeric';
        span.setAttribute('data-original', text);
        span.setAttribute('title', `Original: ${text}`);
        span.textContent = simplified;

        // Replace original text node
        const parent = node.parentNode;
        parent.replaceChild(span, node);
      }
    });

    console.log(
      '[WAI-Adapt] Numeric simplification applied to',
      numericElements.length,
      'elements'
    );
  }

  /**
   * Apply typography preferences
   */
  applyTypography(settings) {
    const { font, fontSize, useOpenDyslexic } = settings;

    const styleId = 'assist-typography';
    let styleElement = document.getElementById(styleId);

    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    const fontFamily = useOpenDyslexic
      ? 'OpenDyslexic, sans-serif'
      : font === 'system'
        ? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        : font;

    styleElement.textContent = `
      .assist-adapted-typography {
        font-family: ${fontFamily} !important;
        font-size: ${fontSize}px !important;
      }
    `;

    const contentArea = this.domAdapter.getMainContentArea();
    if (contentArea) {
      contentArea.classList.add('assist-adapted-typography');
    }

    console.log('[WAI-Adapt] Typography applied:', settings);
  }

  /**
   * Apply color scheme
   */
  applyColorScheme(settings) {
    const { mode, backgroundColor, textColor } = settings;

    const styleId = 'assist-color-scheme';
    let styleElement = document.getElementById(styleId);

    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    if (mode === 'custom') {
      styleElement.textContent = `
        .assist-adapted-colors {
          background-color: ${backgroundColor} !important;
          color: ${textColor} !important;
        }
      `;
    } else if (mode === 'high-contrast') {
      styleElement.textContent = `
        .assist-adapted-colors {
          background-color: #000000 !important;
          color: #FFFFFF !important;
        }
      `;
    }

    const contentArea = this.domAdapter.getMainContentArea();
    if (contentArea && mode !== 'default') {
      contentArea.classList.add('assist-adapted-colors');
    }

    console.log('[WAI-Adapt] Color scheme applied:', mode);
  }

  /**
   * Process newly added DOM nodes (for dynamic content)
   */
  processNewNodes(nodes) {
    // Apply current adaptations to new content
    nodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        // Check if text spacing is active
        const spacingStyle = document.getElementById('assist-text-spacing');
        if (spacingStyle) {
          node.classList?.add('assist-adapted-text');
        }

        // Check if typography is active
        const typographyStyle = document.getElementById('assist-typography');
        if (typographyStyle) {
          node.classList?.add('assist-adapted-typography');
        }
      }
    });
  }
}
