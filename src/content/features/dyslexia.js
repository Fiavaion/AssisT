/**
 * Dyslexia Mode Feature
 * Three modes: Bionic Reading, Syllable Highlighting, Grammar Color-Coding
 */

import { getSettings, onSettingsChange } from '../utils/storage-utils.js';
import { showToast } from '../utils/dom-utils.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import nlp from 'compromise';

// Dyslexia Mode State (Feature Isolated)
let dyslexiaMode_enabled = false;
const dyslexiaMode_settings = {
  bionicReading: true,
  syllableHighlighting: false,
  grammarColors: false,
  colorIntensity: 0.7, // 0.5-1.0, affects saturation
};
const dyslexiaMode_originalContent = new Map(); // Store original HTML
const dyslexiaMode_processedElements = new Set(); // Track processed elements

/**
 * Bionic Reading: Bold first letters of words
 */
function dyslexiaMode_applyBionicReading(element) {
  if (!element || element.dataset.assistDyslexiaProcessed) {
    return;
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      // Skip if parent is a script, style, or already processed
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }
      const tag = parent.tagName?.toLowerCase();
      if (['script', 'style', 'code', 'pre'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (parent.classList.contains('assist-bionic')) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    const parent = textNode.parentElement;
    if (!text.trim() || !parent) {
      return;
    }

    // Split into words and process
    const words = text.split(/(\s+|[,.!?;:])/);
    const fragment = document.createDocumentFragment();

    words.forEach(word => {
      if (!word.trim()) {
        // Keep whitespace/punctuation as-is
        fragment.appendChild(document.createTextNode(word));
      } else {
        // Determine how many letters to bold based on word length
        const len = word.length;
        let boldCount;
        if (len <= 3) {
          boldCount = 1;
        } else if (len <= 7) {
          boldCount = 2;
        } else {
          boldCount = 3;
        }

        // Create span with bolded first part
        const span = document.createElement('span');
        span.classList.add('assist-bionic');

        const strongPart = document.createElement('strong');
        strongPart.textContent = word.substring(0, boldCount);
        strongPart.style.fontWeight = '700';

        const normalPart = document.createTextNode(word.substring(boldCount));

        span.appendChild(strongPart);
        span.appendChild(normalPart);
        fragment.appendChild(span);
      }
    });

    parent.replaceChild(fragment, textNode);
  });

  element.dataset.assistDyslexiaProcessed = 'bionic';
}

/**
 * Syllable Highlighting: Alternate colors between syllables
 */
function dyslexiaMode_applySyllableHighlighting(element) {
  if (!element || element.dataset.assistDyslexiaProcessed) {
    return;
  }

  // Simple syllable split algorithm (basic English rules)
  function splitIntoSyllables(word) {
    // Very basic syllabification - split on vowel clusters
    // This is simplified; production would use Hypher.js library
    if (word.length <= 3) {
      return [word];
    }

    const vowels = 'aeiouAEIOU';
    const syllables = [];
    let current = '';

    for (let i = 0; i < word.length; i++) {
      current += word[i];

      // Split when we hit a consonant after a vowel
      if (i < word.length - 1) {
        const isVowel = vowels.includes(word[i]);
        const nextIsConsonant = !vowels.includes(word[i + 1]);

        if (isVowel && nextIsConsonant && current.length >= 2) {
          syllables.push(current);
          current = '';
        }
      }
    }

    if (current) {
      syllables.push(current);
    }
    return syllables.length > 0 ? syllables : [word];
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }
      const tag = parent.tagName?.toLowerCase();
      if (['script', 'style', 'code', 'pre'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  // More vibrant, visible colors for syllable highlighting
  // Using higher opacity and more saturated colors for better visibility
  const intensity = dyslexiaMode_settings.colorIntensity;
  const color1 = `rgba(100, 181, 246, ${0.3 + intensity * 0.4})`; // Vibrant blue (0.3-0.7 opacity)
  const color2 = `rgba(255, 213, 79, ${0.3 + intensity * 0.4})`; // Vibrant yellow/gold (0.3-0.7 opacity)

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    const parent = textNode.parentElement;
    if (!text.trim() || !parent) {
      return;
    }

    const words = text.split(/(\s+)/);
    const fragment = document.createDocumentFragment();

    words.forEach(word => {
      if (!word.trim()) {
        fragment.appendChild(document.createTextNode(word));
      } else {
        const syllables = splitIntoSyllables(word);
        syllables.forEach((syllable, idx) => {
          const span = document.createElement('span');
          span.classList.add('assist-syllable');
          span.textContent = syllable;
          span.style.backgroundColor = idx % 2 === 0 ? color1 : color2;
          span.style.padding = '0 1px';
          fragment.appendChild(span);
        });
      }
    });

    parent.replaceChild(fragment, textNode);
  });

  element.dataset.assistDyslexiaProcessed = 'syllable';
}

/**
 * Grammar Color-Coding: Color words by part of speech
 * Uses compromise.js NLP library for part-of-speech tagging
 */
function dyslexiaMode_applyGrammarColors(element) {
  if (!element || element.dataset.assistDyslexiaProcessed) {
    return;
  }

  // Get text content
  const text = element.textContent;
  if (!text.trim()) {
    return;
  }

  // Parse with compromise NLP library
  const doc = nlp(text);

  // Color mapping - using vibrant, visible colors with good contrast
  const intensity = dyslexiaMode_settings.colorIntensity;
  const baseOpacity = 0.25 + intensity * 0.35; // 0.25-0.6 opacity range
  const colors = {
    noun: `rgba(33, 150, 243, ${baseOpacity})`, // Blue - nouns
    verb: `rgba(76, 175, 80, ${baseOpacity})`, // Green - verbs
    adjective: `rgba(156, 39, 176, ${baseOpacity})`, // Purple - adjectives
    adverb: `rgba(255, 152, 0, ${baseOpacity})`, // Orange - adverbs
    other: 'transparent', // No background for other words
  };

  // Extract parts of speech
  const nouns = new Set(doc.nouns().out('array'));
  const verbs = new Set(doc.verbs().out('array'));
  const adjectives = new Set(doc.adjectives().out('array'));
  const adverbs = new Set(doc.adverbs().out('array'));

  // Process text nodes
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }
      const tag = parent.tagName?.toLowerCase();
      if (['script', 'style', 'code', 'pre'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent.trim().length > 0
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    const parent = textNode.parentElement;
    if (!text.trim() || !parent) {
      return;
    }

    const words = text.split(/(\s+|[,.!?;:])/);
    const fragment = document.createDocumentFragment();

    words.forEach(word => {
      if (!word.trim()) {
        fragment.appendChild(document.createTextNode(word));
      } else {
        const lowerWord = word.toLowerCase();
        let color = colors.other;

        if (nouns.has(lowerWord)) {
          color = colors.noun;
        } else if (verbs.has(lowerWord)) {
          color = colors.verb;
        } else if (adjectives.has(lowerWord)) {
          color = colors.adjective;
        } else if (adverbs.has(lowerWord)) {
          color = colors.adverb;
        }

        const span = document.createElement('span');
        span.classList.add('assist-grammar');
        span.textContent = word;
        span.style.backgroundColor = color;
        span.style.padding = '0 2px';
        span.style.borderRadius = '2px';
        fragment.appendChild(span);
      }
    });

    parent.replaceChild(fragment, textNode);
  });

  element.dataset.assistDyslexiaProcessed = 'grammar';
}

/**
 * Apply dyslexia mode to main content
 */
async function dyslexiaMode_apply() {
  if (!dyslexiaMode_enabled) {
    dyslexiaMode_remove();
    return;
  }

  const startTime = performance.now();

  // Find main content areas - ONLY leaf elements, not containers
  const contentSelectors = [
    'p',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'li',
    'blockquote',
    'td',
    'th',
    'figcaption',
    'label',
    'span.user_content', // Canvas-specific content spans
  ];

  const elements = new Set();
  contentSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      // Skip already processed elements
      if (!dyslexiaMode_processedElements.has(el)) {
        // Skip if element has no text content
        if (!el.textContent.trim()) {
          return;
        }
        // Skip if this element is inside another element we're already processing
        let hasParentInSet = false;
        for (const otherEl of elements) {
          if (otherEl.contains(el)) {
            hasParentInSet = true;
            break;
          }
        }
        if (!hasParentInSet) {
          elements.add(el);
        }
      }
    });
  });

  if (elements.size === 0) {
    console.log('[DyslexiaMode] No content elements found');
    return;
  }

  console.log('[DyslexiaMode] Processing', elements.size, 'elements');

  // Store original content for reset
  let storedCount = 0;
  let skippedCount = 0;
  elements.forEach(el => {
    if (!dyslexiaMode_originalContent.has(el)) {
      const html = el.innerHTML;
      dyslexiaMode_originalContent.set(el, html);
      storedCount++;

      // Debug first stored element
      if (storedCount === 1) {
        console.log('[DyslexiaMode] FIRST ELEMENT STORE:');
        console.log('  - Current HTML:', html.substring(0, 200));
        console.log('  - Has processed attr?', el.dataset.assistDyslexiaProcessed);
      }
    } else {
      skippedCount++;
      // This is suspicious - we should have cleared the Map!
      if (skippedCount === 1) {
        console.warn('[DyslexiaMode] WARNING: Element already in originalContent Map!');
        console.warn('  - This should not happen after remove() was called');
        console.warn('  - Current HTML:', el.innerHTML.substring(0, 200));
      }
    }
  });

  console.log('[DyslexiaMode] Stored', storedCount, 'new, skipped', skippedCount, 'existing');

  // Apply selected features
  for (const element of elements) {
    if (dyslexiaMode_settings.bionicReading) {
      dyslexiaMode_applyBionicReading(element);
    } else if (dyslexiaMode_settings.syllableHighlighting) {
      dyslexiaMode_applySyllableHighlighting(element);
    } else if (dyslexiaMode_settings.grammarColors) {
      dyslexiaMode_applyGrammarColors(element);
    }

    dyslexiaMode_processedElements.add(element);
  }

  const duration = performance.now() - startTime;
  console.log(`[DyslexiaMode] Applied in ${duration.toFixed(1)}ms`);
  showToast(`✨ Dyslexia Mode enabled`);
}

/**
 * Remove dyslexia mode (restore original content)
 */
function dyslexiaMode_remove() {
  console.log(
    '[DyslexiaMode] REMOVE called - restoring',
    dyslexiaMode_originalContent.size,
    'elements'
  );

  // Restore original HTML
  let restoredCount = 0;
  let disconnectedCount = 0;
  dyslexiaMode_originalContent.forEach((originalHTML, element) => {
    if (element && element.isConnected) {
      const beforeHTML = element.innerHTML;
      const sanitized = sanitizeHTML(originalHTML);
      element.innerHTML = sanitized;
      delete element.dataset.assistDyslexiaProcessed;
      restoredCount++;

      // Debug first element in detail
      if (restoredCount === 1) {
        console.log('[DyslexiaMode] FIRST ELEMENT RESTORE:');
        console.log('  - Tag:', element.tagName);
        console.log('  - Text preview:', element.textContent.substring(0, 100));
        console.log('  - Original stored:', originalHTML.substring(0, 200));
        console.log('  - Before restore:', beforeHTML.substring(0, 200));
      }
    } else {
      disconnectedCount++;
      if (disconnectedCount === 1) {
        console.warn('[DyslexiaMode] DISCONNECTED ELEMENT - cannot restore!');
        console.warn('  - Tag:', element?.tagName || 'null');
        console.warn('  - This suggests nested element selection bug');
      }
    }
  });

  console.log(
    '[DyslexiaMode] Restored',
    restoredCount,
    'elements, skipped',
    disconnectedCount,
    'disconnected'
  );

  if (disconnectedCount > 0) {
    console.warn(
      '[DyslexiaMode] WARNING:',
      disconnectedCount,
      'elements were disconnected and could not be restored!'
    );
    console.warn('[DyslexiaMode] This may cause scrambled text on next mode application');
  }
  dyslexiaMode_originalContent.clear();
  dyslexiaMode_processedElements.clear();

  console.log('[DyslexiaMode] Removed');
  showToast('Dyslexia Mode disabled');
}

/**
 * Handle settings changes
 */
function dyslexiaMode_handleSettingsChange(newSettings) {
  if (!newSettings.dyslexiaMode) {
    return;
  }

  const dmSettings = newSettings.dyslexiaMode;
  const wasEnabled = dyslexiaMode_enabled;
  const newEnabled = dmSettings.enabled || false;

  // Update settings
  dyslexiaMode_settings.bionicReading = dmSettings.bionicReading !== false;
  dyslexiaMode_settings.syllableHighlighting = dmSettings.syllableHighlighting || false;
  dyslexiaMode_settings.grammarColors = dmSettings.grammarColors || false;
  dyslexiaMode_settings.colorIntensity = dmSettings.colorIntensity || 0.7;

  // Handle enable/disable
  if (newEnabled && !wasEnabled) {
    dyslexiaMode_enabled = true;
    dyslexiaMode_apply();
  } else if (!newEnabled && wasEnabled) {
    dyslexiaMode_enabled = false;
    dyslexiaMode_remove();
  } else if (newEnabled) {
    // Settings changed, reapply
    dyslexiaMode_remove();
    setTimeout(() => dyslexiaMode_apply(), 100);
  }

  console.log('[DyslexiaMode] Settings updated:', newEnabled, dyslexiaMode_settings);
}

/**
 * Initialize Dyslexia Mode feature
 */
export async function dyslexia_initialize() {
  console.log('[DyslexiaMode] Initializing...');

  // Load settings
  const allSettings = await getSettings();
  if (allSettings.dyslexiaMode) {
    const dmSettings = allSettings.dyslexiaMode;
    dyslexiaMode_enabled = dmSettings.enabled || false;
    dyslexiaMode_settings.bionicReading = dmSettings.bionicReading !== false;
    dyslexiaMode_settings.syllableHighlighting = dmSettings.syllableHighlighting || false;
    dyslexiaMode_settings.grammarColors = dmSettings.grammarColors || false;
    dyslexiaMode_settings.colorIntensity = dmSettings.colorIntensity || 0.7;

    if (dyslexiaMode_enabled) {
      // Apply after page loads
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(() => dyslexiaMode_apply(), 500);
        });
      } else {
        setTimeout(() => dyslexiaMode_apply(), 500);
      }
    }

    console.log('[DyslexiaMode] Settings loaded:', dyslexiaMode_enabled, dyslexiaMode_settings);
  }

  // Listen for settings changes
  onSettingsChange(dyslexiaMode_handleSettingsChange);

  console.log('[DyslexiaMode] Initialized');
}

/**
 * Get Dyslexia Mode state for debugging
 */
export function dyslexia_getState() {
  return {
    enabled: dyslexiaMode_enabled,
    settings: dyslexiaMode_settings,
    processedElements: dyslexiaMode_processedElements.size,
  };
}
