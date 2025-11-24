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

  // Create context menu for citation capture
  chrome.contextMenus.create({
    id: 'save-citation',
    title: 'Save Citation',
    contexts: ['page', 'link'],
  });
});

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-citation') {
    console.log('[AssisT] Context menu "Save Citation" clicked');

    // Send message to content script to save citation
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'SAVE_CITATION',
      });

      if (response && response.success) {
        console.log('[AssisT] Citation saved via context menu');
      } else {
        console.error('[AssisT] Citation save failed via context menu');
      }
    } catch (error) {
      console.error('[AssisT] Context menu citation error:', error);
    }
  }
});

// Message handling from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle screenshot capture requests
  if (message.action === 'CAPTURE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(null, { format: message.options?.format || 'png' }, dataUrl => {
      if (chrome.runtime.lastError) {
        sendResponse({
          success: false,
          error: chrome.runtime.lastError.message,
        });
      } else {
        sendResponse({ success: true, dataUrl });
      }
    });
    return true; // Keep channel open for async response
  }

  // Handle PDF fetch requests (for local file:// URLs that content scripts can't access)
  if (message.action === 'FETCH_PDF') {
    console.log('[AssisT] Fetching PDF:', message.url);

    fetch(message.url)
      .then(response => {
        if (!response.ok && !message.url.startsWith('file://')) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.arrayBuffer();
      })
      .then(arrayBuffer => {
        console.log(`[AssisT] Fetched PDF: ${arrayBuffer.byteLength} bytes`);
        // Convert ArrayBuffer to Array for Chrome message passing
        // ArrayBuffer cannot be directly sent via chrome.runtime.sendMessage
        const uint8Array = new Uint8Array(arrayBuffer);
        const dataArray = Array.from(uint8Array);
        sendResponse({ success: true, data: dataArray, byteLength: arrayBuffer.byteLength });
      })
      .catch(error => {
        console.error('[AssisT] PDF fetch failed:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep channel open for async response
  }

  // Handle PDF scroll requests (for Chrome PDF viewer where content scripts don't run)
  if (message.action === 'SCROLL_PDF') {
    const tabId = sender.tab?.id || message.tabId;

    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID provided' });
      return false;
    }

    // Handle special PAGE_DOWN command for multi-page PDF capture
    if (message.scrollY === 'PAGE_DOWN') {
      chrome.scripting
        .executeScript({
          target: { tabId: tabId },
          func: () => {
            console.log('[PDF Page Down] Simulating Page Down keypress');

            // Try multiple methods to trigger page navigation

            // Method 1: Dispatch actual keyboard event (Page Down key)
            const pageDownEvent = new KeyboardEvent('keydown', {
              key: 'PageDown',
              code: 'PageDown',
              keyCode: 34,
              which: 34,
              bubbles: true,
              cancelable: true,
            });
            document.dispatchEvent(pageDownEvent);

            // Method 2: Try arrow down multiple times (one page worth)
            for (let i = 0; i < 10; i++) {
              const arrowDownEvent = new KeyboardEvent('keydown', {
                key: 'ArrowDown',
                code: 'ArrowDown',
                keyCode: 40,
                which: 40,
                bubbles: true,
                cancelable: true,
              });
              document.dispatchEvent(arrowDownEvent);
            }

            // Method 3: Try scrollBy as fallback
            window.scrollBy(0, window.innerHeight);

            const newY = window.scrollY;
            console.log('[PDF Page Down] Result scroll position:', newY);
            return newY;
          },
        })
        .then(results => {
          const actualScrollY =
            results && results[0] && results[0].result !== undefined ? results[0].result : -1;
          console.log('[AssisT] PDF Page Down result:', actualScrollY);
          sendResponse({ success: true, actualScrollY });
        })
        .catch(error => {
          console.error('[AssisT] PDF Page Down failed:', error);
          sendResponse({ success: false, error: error.message });
        });

      return true; // Keep channel open for async response
    }

    // Handle numeric scroll position (legacy support)
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        func: scrollY => {
          console.log('[PDF Scroll Injection] Attempting to scroll to', scrollY);
          console.log(
            '[PDF Scroll Injection] Initial state - window.scrollY:',
            window.scrollY,
            'docElement.scrollTop:',
            document.documentElement.scrollTop
          );

          // Try window.scrollTo first
          window.scrollTo(0, scrollY);
          console.log('[PDF Scroll Injection] After window.scrollTo:', window.scrollY);

          // Try scrollingElement (best practice for cross-browser compatibility)
          if (window.scrollY === 0 && scrollY > 0 && document.scrollingElement) {
            console.log('[PDF Scroll Injection] Trying document.scrollingElement');
            document.scrollingElement.scrollTop = scrollY;
            console.log(
              '[PDF Scroll Injection] After scrollingElement:',
              document.scrollingElement.scrollTop
            );
          }

          // Try documentElement
          if (window.scrollY === 0 && scrollY > 0) {
            console.log('[PDF Scroll Injection] Trying document.documentElement');
            document.documentElement.scrollTop = scrollY;
            console.log(
              '[PDF Scroll Injection] After documentElement:',
              document.documentElement.scrollTop
            );
          }

          // Try body
          if (window.scrollY === 0 && scrollY > 0 && document.body) {
            console.log('[PDF Scroll Injection] Trying document.body');
            document.body.scrollTop = scrollY;
            console.log('[PDF Scroll Injection] After body:', document.body?.scrollTop);
          }

          // Try scrollBy as last resort
          if (window.scrollY === 0 && scrollY > 0) {
            console.log('[PDF Scroll Injection] Trying window.scrollBy');
            window.scrollBy(0, scrollY);
            console.log('[PDF Scroll Injection] After scrollBy:', window.scrollY);
          }

          const actualScroll =
            window.scrollY ||
            document.documentElement.scrollTop ||
            document.scrollingElement?.scrollTop ||
            document.body?.scrollTop ||
            0;
          console.log('[PDF Scroll Injection] Final scroll position:', actualScroll);
          console.log(
            '[PDF Scroll Injection] ScrollHeight:',
            document.documentElement.scrollHeight,
            'ClientHeight:',
            document.documentElement.clientHeight
          );
          return actualScroll;
        },
        args: [message.scrollY],
      })
      .then(results => {
        const actualScrollY =
          results && results[0] && results[0].result !== undefined ? results[0].result : -1;
        console.log('[AssisT] PDF scroll injection result:', actualScrollY);
        sendResponse({ success: true, actualScrollY });
      })
      .catch(error => {
        console.error('[AssisT] PDF scroll failed:', error);
        sendResponse({ success: false, error: error.message });
      });

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
