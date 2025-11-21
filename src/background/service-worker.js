/**
 * AssisT Background Service Worker
 * Manages extension lifecycle, message passing, and persistent state
 * Universal accessibility extension for all websites
 */

import { StorageManager } from '../utils/storage-manager.js';
import { MessageRouter } from '../utils/message-router.js';

// Service worker lifecycle
chrome.runtime.onInstalled.addListener(async details => {
  console.log('[AssisT] Extension installed:', details.reason);

  if (details.reason === 'install') {
    // Initialize default settings on first install
    await StorageManager.initializeDefaults();

    console.log('[AssisT] Installation complete! Click the extension icon to get started.');

    // Open welcome page (disabled for now - welcome.html not created yet)
    // chrome.tabs.create({
    //   url: chrome.runtime.getURL('src/popup/welcome.html')
    // });
  }

  if (details.reason === 'update') {
    console.log('[AssisT] Extension updated from', details.previousVersion);
    // Handle migration if needed
  }
});

// Message handling from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle screenshot capture requests
  if (message.action === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(
      null,
      { format: message.options?.format || 'png' },
      dataUrl => {
        if (chrome.runtime.lastError) {
          sendResponse({
            success: false,
            error: chrome.runtime.lastError.message,
          });
        } else {
          sendResponse({ success: true, dataUrl });
        }
      }
    );
    return true; // Keep channel open for async response
  }

  // Route other messages through MessageRouter
  MessageRouter.route(message, sender)
    .then(response => sendResponse({ success: true, data: response }))
    .catch(error => sendResponse({ success: false, error: error.message }));

  return true; // Keep message channel open for async response
});

// Tab activation listener for context-aware features
chrome.tabs.onActivated.addListener(async activeInfo => {
  const tab = await chrome.tabs.get(activeInfo.tabId);

  // Skip browser system pages
  if (
    tab.url &&
    (tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('about:'))
  ) {
    return;
  }

  console.log('[AssisT] Tab activated:', tab.id);
});

// Handle extension icon click (if popup is disabled)
chrome.action.onClicked.addListener(async tab => {
  console.log('[AssisT] Extension icon clicked on tab:', tab.id);

  // Send message to content script to toggle AssisT panel
  chrome.tabs.sendMessage(tab.id, {
    type: 'TOGGLE_ASSIST_PANEL',
  });
});

console.log('[AssisT] Background service worker initialized');
