/**
 * Message Router
 * Handles secure message passing between isolated worlds
 * Background <-> Content Script <-> Popup communication
 */

import { StorageManager } from './storage-manager.js';

export class MessageRouter {
  static async route(message, sender) {
    const { type, data } = message;

    console.log('[MessageRouter] Routing message:', type, 'from:', sender.tab?.id || 'popup');

    try {
      switch (type) {
        case 'GET_SETTINGS':
          return await this.handleGetSettings();

        case 'RESET_SETTINGS':
          return await this.handleResetSettings();

        case 'TTS_COMMAND':
          return await this.handleTTSCommand(sender.tab?.id, data);

        case 'STT_COMMAND':
          return await this.handleSTTCommand(sender.tab?.id, data);

        default:
          throw new Error(`Unknown message type: ${type}`);
      }
    } catch (error) {
      console.error('[MessageRouter] Error routing message:', error);
      throw error;
    }
  }

  static async handleGetSettings() {
    return await StorageManager.getSettings();
  }

  /**
   * Reset every setting to its default.
   *
   * Nothing is broadcast afterwards. Writing the defaults fires `chrome.storage.onChanged`, which is
   * how an open page learns about a settings change — the only way, since the popup stopped sending
   * whole settings objects through this router.
   */
  static async handleResetSettings() {
    return await StorageManager.resetToDefaults();
  }

  static async handleTTSCommand(tabId, command) {
    if (!tabId) {
      throw new Error('No active tab');
    }

    return await chrome.tabs.sendMessage(tabId, {
      type: 'TTS_COMMAND',
      command: command,
    });
  }

  static async handleSTTCommand(tabId, command) {
    if (!tabId) {
      throw new Error('No active tab');
    }

    return await chrome.tabs.sendMessage(tabId, {
      type: 'STT_COMMAND',
      command: command,
    });
  }
}
