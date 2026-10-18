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
    StorageManager.resetToDefaults = jest.fn().mockResolvedValue({ test: 'defaults' });

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

    test('should route RESET_SETTINGS message', async () => {
      const message = { type: 'RESET_SETTINGS' };

      const result = await MessageRouter.route(message, mockSender);

      expect(StorageManager.resetToDefaults).toHaveBeenCalled();
      expect(result).toEqual({ test: 'defaults' });
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

  describe('handleResetSettings()', () => {
    test('should reset settings and return the defaults', async () => {
      const result = await MessageRouter.handleResetSettings();

      expect(StorageManager.resetToDefaults).toHaveBeenCalled();
      expect(result).toEqual({ test: 'defaults' });
    });

    test('should tell open pages nothing — storing the defaults fires storage.onChanged', async () => {
      await MessageRouter.handleResetSettings();

      expect(chrome.tabs.query).not.toHaveBeenCalled();
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
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

  describe('Error Handling', () => {
    test('should catch and rethrow errors from handlers', async () => {
      const message = { type: 'RESET_SETTINGS' };
      StorageManager.resetToDefaults.mockRejectedValue(new Error('Reset failed'));

      await expect(MessageRouter.route(message, mockSender))
        .rejects.toThrow('Reset failed');
    });

    test('should handle chrome.tabs.sendMessage errors', async () => {
      const message = { type: 'TTS_COMMAND', data: { action: 'play' } };
      chrome.tabs.sendMessage.mockRejectedValue(new Error('Tab not found'));

      await expect(MessageRouter.route(message, mockSender))
        .rejects.toThrow('Tab not found');
    });
  });

  describe('Integration with StorageManager', () => {
    test('should return results from StorageManager unchanged', async () => {
      const complexResult = { multi: { level: { data: [1, 2, 3] } } };
      StorageManager.getSettings.mockResolvedValue(complexResult);
      const message = { type: 'GET_SETTINGS' };

      const result = await MessageRouter.route(message, mockSender);

      expect(result).toEqual(complexResult);
    });
  });
});
