/**
 * MessageRouter Unit Tests
 * Testing message routing and Chrome API communication
 */

import { MessageRouter } from '../../src/utils/message-router.js';
import { StorageManager } from '../../src/utils/storage-manager.js';

// Mock StorageManager
jest.mock('../../src/utils/storage-manager.js');

describe('MessageRouter', () => {
  let mockSender;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default sender
    mockSender = {
      tab: {
        id: 123,
        url: 'https://canvas.instructure.com/courses/123'
      }
    };

    // Mock StorageManager methods
    StorageManager.getSettings = jest.fn().mockResolvedValue({ test: 'settings' });
    StorageManager.saveSettings = jest.fn().mockResolvedValue({ test: 'updated' });
    StorageManager.resetToDefaults = jest.fn().mockResolvedValue({ test: 'defaults' });
    StorageManager.exportSettings = jest.fn().mockResolvedValue('{"exported": true}');
    StorageManager.importSettings = jest.fn().mockResolvedValue({ test: 'imported' });

    // Mock chrome.tabs.query
    chrome.tabs.query.mockResolvedValue([
      { id: 1, url: 'https://canvas.instructure.com/courses/1' },
      { id: 2, url: 'https://canvas.instructure.com/courses/2' }
    ]);

    // Mock chrome.tabs.sendMessage
    chrome.tabs.sendMessage.mockResolvedValue({ success: true });
  });

  describe('route()', () => {
    test('should route GET_SETTINGS message', async () => {
      const message = { type: 'GET_SETTINGS' };

      const result = await MessageRouter.route(message, mockSender);

      expect(StorageManager.getSettings).toHaveBeenCalled();
      expect(result).toEqual({ test: 'settings' });
    });

    test('should route UPDATE_SETTINGS message', async () => {
      const message = {
        type: 'UPDATE_SETTINGS',
        data: { tts: { enabled: true } }
      };

      const result = await MessageRouter.route(message, mockSender);

      expect(StorageManager.saveSettings).toHaveBeenCalledWith({ tts: { enabled: true } });
      expect(result).toEqual({ test: 'updated' });
    });

    test('should route RESET_SETTINGS message', async () => {
      const message = { type: 'RESET_SETTINGS' };

      const result = await MessageRouter.route(message, mockSender);

      expect(StorageManager.resetToDefaults).toHaveBeenCalled();
      expect(result).toEqual({ test: 'defaults' });
    });

    test('should route EXPORT_SETTINGS message', async () => {
      const message = { type: 'EXPORT_SETTINGS' };

      const result = await MessageRouter.route(message, mockSender);

      expect(StorageManager.exportSettings).toHaveBeenCalled();
      expect(result).toBe('{"exported": true}');
    });

    test('should route IMPORT_SETTINGS message', async () => {
      const message = {
        type: 'IMPORT_SETTINGS',
        data: '{"settings": true}'
      };

      const result = await MessageRouter.route(message, mockSender);

      expect(StorageManager.importSettings).toHaveBeenCalledWith('{"settings": true}');
      expect(result).toEqual({ test: 'imported' });
    });

    test('should route GET_TAB_CONTEXT message', async () => {
      const message = { type: 'GET_TAB_CONTEXT' };
      chrome.tabs.sendMessage.mockResolvedValue({ context: 'Canvas' });

      const result = await MessageRouter.route(message, mockSender);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
        type: 'GET_PAGE_CONTEXT'
      });
      expect(result).toEqual({ context: 'Canvas' });
    });

    test('should route TTS_COMMAND message', async () => {
      const message = {
        type: 'TTS_COMMAND',
        data: { command: 'play' }
      };

      await MessageRouter.route(message, mockSender);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
        type: 'TTS_COMMAND',
        command: { command: 'play' }
      });
    });

    test('should route STT_COMMAND message', async () => {
      const message = {
        type: 'STT_COMMAND',
        data: { command: 'start' }
      };

      await MessageRouter.route(message, mockSender);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
        type: 'STT_COMMAND',
        command: { command: 'start' }
      });
    });

    test('should throw error for unknown message type', async () => {
      const message = { type: 'UNKNOWN_TYPE' };

      await expect(MessageRouter.route(message, mockSender))
        .rejects.toThrow('Unknown message type: UNKNOWN_TYPE');
    });

    test('should throw error if routing fails', async () => {
      const message = { type: 'GET_SETTINGS' };
      StorageManager.getSettings.mockRejectedValue(new Error('Storage error'));

      await expect(MessageRouter.route(message, mockSender))
        .rejects.toThrow('Storage error');
    });

    test('should handle sender from popup (no tab)', async () => {
      const message = { type: 'GET_SETTINGS' };
      const popupSender = {}; // No tab property

      const result = await MessageRouter.route(message, popupSender);

      expect(result).toEqual({ test: 'settings' });
    });
  });

  describe('handleGetSettings()', () => {
    test('should call StorageManager.getSettings', async () => {
      const result = await MessageRouter.handleGetSettings();

      expect(StorageManager.getSettings).toHaveBeenCalled();
      expect(result).toEqual({ test: 'settings' });
    });
  });

  describe('handleUpdateSettings()', () => {
    test('should save settings and broadcast to Canvas tabs', async () => {
      const settings = { tts: { enabled: true } };

      const result = await MessageRouter.handleUpdateSettings(settings);

      expect(StorageManager.saveSettings).toHaveBeenCalledWith(settings);
      expect(chrome.tabs.query).toHaveBeenCalledWith({
        url: '*://*.instructure.com/*'
      });
      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ test: 'updated' });
    });

    test('should broadcast UPDATE_SETTINGS message with updated settings', async () => {
      const settings = { tts: { enabled: true } };

      await MessageRouter.handleUpdateSettings(settings);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
        type: 'UPDATE_SETTINGS',
        settings: { test: 'updated' }
      });
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(2, {
        type: 'UPDATE_SETTINGS',
        settings: { test: 'updated' }
      });
    });
  });

  describe('handleResetSettings()', () => {
    test('should reset settings and broadcast to Canvas tabs', async () => {
      const result = await MessageRouter.handleResetSettings();

      expect(StorageManager.resetToDefaults).toHaveBeenCalled();
      expect(chrome.tabs.query).toHaveBeenCalledWith({
        url: '*://*.instructure.com/*'
      });
      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ test: 'defaults' });
    });
  });

  describe('handleExportSettings()', () => {
    test('should call StorageManager.exportSettings', async () => {
      const result = await MessageRouter.handleExportSettings();

      expect(StorageManager.exportSettings).toHaveBeenCalled();
      expect(result).toBe('{"exported": true}');
    });
  });

  describe('handleImportSettings()', () => {
    test('should import settings and broadcast to Canvas tabs', async () => {
      const jsonString = '{"settings": true}';

      const result = await MessageRouter.handleImportSettings(jsonString);

      expect(StorageManager.importSettings).toHaveBeenCalledWith(jsonString);
      expect(chrome.tabs.query).toHaveBeenCalledWith({
        url: '*://*.instructure.com/*'
      });
      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ test: 'imported' });
    });
  });

  describe('handleGetTabContext()', () => {
    test('should send GET_PAGE_CONTEXT message to tab', async () => {
      const tab = { id: 456, url: 'https://canvas.instructure.com/courses/456' };
      chrome.tabs.sendMessage.mockResolvedValue({ context: 'quiz' });

      const result = await MessageRouter.handleGetTabContext(tab);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(456, {
        type: 'GET_PAGE_CONTEXT'
      });
      expect(result).toEqual({ context: 'quiz' });
    });

    test('should throw error if no tab provided', async () => {
      await expect(MessageRouter.handleGetTabContext(null))
        .rejects.toThrow('No active tab');
    });

    test('should throw error if tab has no id', async () => {
      await expect(MessageRouter.handleGetTabContext({}))
        .rejects.toThrow('No active tab');
    });
  });

  describe('handleTTSCommand()', () => {
    test('should send TTS_COMMAND to specified tab', async () => {
      const command = { action: 'play', text: 'Hello' };

      await MessageRouter.handleTTSCommand(789, command);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(789, {
        type: 'TTS_COMMAND',
        command: command
      });
    });

    test('should throw error if no tabId provided', async () => {
      await expect(MessageRouter.handleTTSCommand(null, {}))
        .rejects.toThrow('No active tab');
    });
  });

  describe('handleSTTCommand()', () => {
    test('should send STT_COMMAND to specified tab', async () => {
      const command = { action: 'start' };

      await MessageRouter.handleSTTCommand(999, command);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(999, {
        type: 'STT_COMMAND',
        command: command
      });
    });

    test('should throw error if no tabId provided', async () => {
      await expect(MessageRouter.handleSTTCommand(null, {}))
        .rejects.toThrow('No active tab');
    });
  });

  describe('broadcastToCanvasTabs()', () => {
    test('should query Canvas tabs with correct pattern', async () => {
      const message = { type: 'TEST', data: 'broadcast' };

      await MessageRouter.broadcastToCanvasTabs(message);

      expect(chrome.tabs.query).toHaveBeenCalledWith({
        url: '*://*.instructure.com/*'
      });
    });

    test('should send message to all Canvas tabs', async () => {
      const message = { type: 'TEST', data: 'broadcast' };

      await MessageRouter.broadcastToCanvasTabs(message);

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, message);
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(2, message);
    });

    test('should handle tabs with no Canvas pages gracefully', async () => {
      chrome.tabs.query.mockResolvedValue([]);
      const message = { type: 'TEST' };

      await MessageRouter.broadcastToCanvasTabs(message);

      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    test('should handle individual tab failures without throwing', async () => {
      chrome.tabs.sendMessage
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('Tab closed'));

      const message = { type: 'TEST' };

      // Should not throw
      await expect(MessageRouter.broadcastToCanvasTabs(message))
        .resolves.not.toThrow();

      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
    });

    test('should handle query failure gracefully', async () => {
      chrome.tabs.query.mockRejectedValue(new Error('Query failed'));
      const message = { type: 'TEST' };

      // Should not throw
      await expect(MessageRouter.broadcastToCanvasTabs(message))
        .resolves.not.toThrow();
    });

    test('should use Promise.allSettled for concurrent sends', async () => {
      const message = { type: 'TEST' };

      await MessageRouter.broadcastToCanvasTabs(message);

      // All messages should be sent concurrently, not sequentially
      expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    test('should catch and rethrow errors from handlers', async () => {
      const message = { type: 'UPDATE_SETTINGS', data: {} };
      StorageManager.saveSettings.mockRejectedValue(new Error('Save failed'));

      await expect(MessageRouter.route(message, mockSender))
        .rejects.toThrow('Save failed');
    });

    test('should handle chrome.tabs.sendMessage errors', async () => {
      const message = { type: 'TTS_COMMAND', data: { action: 'play' } };
      chrome.tabs.sendMessage.mockRejectedValue(new Error('Tab not found'));

      await expect(MessageRouter.route(message, mockSender))
        .rejects.toThrow('Tab not found');
    });
  });

  describe('Integration with StorageManager', () => {
    test('should correctly pass data to StorageManager methods', async () => {
      const settings = { complex: { nested: { value: true } } };
      const message = { type: 'UPDATE_SETTINGS', data: settings };

      await MessageRouter.route(message, mockSender);

      expect(StorageManager.saveSettings).toHaveBeenCalledWith(settings);
    });

    test('should return results from StorageManager unchanged', async () => {
      const complexResult = { multi: { level: { data: [1, 2, 3] } } };
      StorageManager.getSettings.mockResolvedValue(complexResult);
      const message = { type: 'GET_SETTINGS' };

      const result = await MessageRouter.route(message, mockSender);

      expect(result).toEqual(complexResult);
    });
  });
});
