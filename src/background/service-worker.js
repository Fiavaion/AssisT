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

  // Create context menu for Read Selection feature
  chrome.contextMenus.create({
    id: 'assist-read-selection',
    title: '🎯 AssisT: Read Selection',
    contexts: ['selection']
  });

  console.log('[AssisT] Context menu created');
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

  // Skip browser system pages
  if (tab.url && (
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('edge://') ||
    tab.url.startsWith('about:')
  )) {
    return;
  }

  console.log('[AssisT] Tab activated:', tab.id);
});

// Handle extension icon click (if popup is disabled)
chrome.action.onClicked.addListener(async tab => {
  console.log('[AssisT] Extension icon clicked on tab:', tab.id);

  // Send message to content script to toggle AssisT panel
  chrome.tabs.sendMessage(tab.id, {
    type: 'TOGGLE_ASSIST_PANEL'
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'assist-read-selection') {
    console.log('[AssisT] Read Selection context menu clicked');

    // Check if TTS is enabled
    const settings = await StorageManager.get('assist_settings');
    if (!settings?.tts?.enabled) {
      console.warn('[AssisT] TTS is disabled, cannot read selection');
      // Could show a notification here
      return;
    }

    // Get the selected text
    const selectedText = info.selectionText;
    if (!selectedText || selectedText.trim().length === 0) {
      console.warn('[AssisT] No text selected');
      return;
    }

    // Send message to content script to read the selected text
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'TTS_READ_SELECTION',
        data: { text: selectedText }
      });
      console.log('[AssisT] Read selection command sent:', selectedText.substring(0, 50) + '...');
    } catch (error) {
      console.error('[AssisT] Error sending read selection command:', error);
    }
  }
});

console.log('[AssisT] Background service worker initialized');
