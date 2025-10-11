/**
 * AssisT Background Service Worker
 * Manages extension lifecycle, message passing, and persistent state
 * Operates in Isolated World to prevent conflicts with Canvas VLE
 */

import { StorageManager } from '../utils/storage-manager.js';
import { MessageRouter } from '../utils/message-router.js';

// Service worker lifecycle
chrome.runtime.onInstalled.addListener(async details => {
  console.log('[AssisT] Extension installed:', details.reason);

  if (details.reason === 'install') {
    // Initialize default settings on first install
    await StorageManager.initializeDefaults();

    // Open welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/popup/welcome.html')
    });
  }

  if (details.reason === 'update') {
    console.log('[AssisT] Extension updated from', details.previousVersion);
    // Handle migration if needed
  }
});

// Message handling from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  MessageRouter.route(message, sender)
    .then(response => sendResponse({ success: true, data: response }))
    .catch(error => sendResponse({ success: false, error: error.message }));

  return true; // Keep message channel open for async response
});

// Tab activation listener for context-aware features
chrome.tabs.onActivated.addListener(async activeInfo => {
  const tab = await chrome.tabs.get(activeInfo.tabId);

  // Check if tab is Canvas VLE
  if (tab.url && tab.url.includes('.instructure.com')) {
    console.log('[AssisT] Canvas VLE tab activated:', tab.id);

    // Inject content script if needed (fallback)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content/content.js']
      });
    } catch (error) {
      // Content script may already be injected
      console.warn('[AssisT] Content script injection skipped:', error.message);
    }
  }
});

// Handle extension icon click (if popup is disabled)
chrome.action.onClicked.addListener(async tab => {
  console.log('[AssisT] Extension icon clicked on tab:', tab.id);

  // Send message to content script to toggle AssisT panel
  chrome.tabs.sendMessage(tab.id, {
    type: 'TOGGLE_ASSIST_PANEL'
  });
});

console.log('[AssisT] Background service worker initialized');
