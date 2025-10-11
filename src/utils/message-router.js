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

        case 'UPDATE_SETTINGS':
          return await this.handleUpdateSettings(data);

        case 'RESET_SETTINGS':
          return await this.handleResetSettings();

        case 'EXPORT_SETTINGS':
          return await this.handleExportSettings();

        case 'IMPORT_SETTINGS':
          return await this.handleImportSettings(data);

        case 'GET_TAB_CONTEXT':
          return await this.handleGetTabContext(sender.tab);

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

  static async handleUpdateSettings(settings) {
    const updated = await StorageManager.saveSettings(settings);

    // Broadcast to all Canvas tabs
    await this.broadcastToCanvasTabs({
      type: 'UPDATE_SETTINGS',
      settings: updated
    });

    return updated;
  }

  static async handleResetSettings() {
    const defaults = await StorageManager.resetToDefaults();

    // Broadcast to all Canvas tabs
    await this.broadcastToCanvasTabs({
      type: 'UPDATE_SETTINGS',
      settings: defaults
    });

    return defaults;
  }

  static async handleExportSettings() {
    return await StorageManager.exportSettings();
  }

  static async handleImportSettings(jsonString) {
    const settings = await StorageManager.importSettings(jsonString);

    // Broadcast to all Canvas tabs
    await this.broadcastToCanvasTabs({
      type: 'UPDATE_SETTINGS',
      settings: settings
    });

    return settings;
  }

  static async handleGetTabContext(tab) {
    if (!tab?.id) {
      throw new Error('No active tab');
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'GET_PAGE_CONTEXT'
    });

    return response;
  }

  static async handleTTSCommand(tabId, command) {
    if (!tabId) {
      throw new Error('No active tab');
    }

    return await chrome.tabs.sendMessage(tabId, {
      type: 'TTS_COMMAND',
      command: command
    });
  }

  static async handleSTTCommand(tabId, command) {
    if (!tabId) {
      throw new Error('No active tab');
    }

    return await chrome.tabs.sendMessage(tabId, {
      type: 'STT_COMMAND',
      command: command
    });
  }

  /**
   * Broadcast message to all Canvas VLE tabs
   */
  static async broadcastToCanvasTabs(message) {
    try {
      const tabs = await chrome.tabs.query({
        url: '*://*.instructure.com/*'
      });

      const promises = tabs.map(tab =>
        chrome.tabs.sendMessage(tab.id, message).catch(err => {
          console.warn(`[MessageRouter] Failed to send to tab ${tab.id}:`, err.message);
        })
      );

      await Promise.allSettled(promises);
      console.log(`[MessageRouter] Broadcasted to ${tabs.length} Canvas tabs`);
    } catch (error) {
      console.error('[MessageRouter] Broadcast failed:', error);
    }
  }
}
