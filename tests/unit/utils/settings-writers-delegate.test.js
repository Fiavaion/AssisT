/**
 * The merge that keeps one realm's settings write from discarding another's lives in exactly one
 * place. A module that hand-rolls it instead — read `assist_settings`, change a branch, set the whole
 * object back — is the bug the shared writer exists to prevent, so these tests assert delegation
 * rather than outcome: no settings writer may call `chrome.storage.local.set` itself.
 *
 * @see src/utils/setting-writes.js
 */

jest.mock('../../../src/utils/setting-writes.js', () => ({
  applySettingWrites: jest.fn().mockResolvedValue(undefined),
  applyNestedPath: jest.requireActual('../../../src/utils/setting-writes.js').applyNestedPath,
  localRoots: jest.fn(() => []),
  planWrites: jest.fn(() => ({})),
}));

import { applySettingWrites } from '../../../src/utils/setting-writes.js';
import { saveSetting } from '../../../src/content/utils/storage-utils.js';
import { saveShortcuts } from '../../../src/utils/keyboard-shortcuts.js';
import { StorageManager } from '../../../src/utils/storage-manager.js';

beforeEach(() => {
  applySettingWrites.mockResolvedValue(undefined);
  chrome.storage.local.get.mockResolvedValue({ assist_settings: {} });
  chrome.storage.local.set.mockResolvedValue(undefined);
});

describe('settings writers delegate to the shared writer', () => {
  it('storage-utils saveSetting()', async () => {
    await saveSetting('magnifyingLens', { enabled: true });

    expect(applySettingWrites).toHaveBeenCalledWith([
      { path: 'magnifyingLens', value: { enabled: true } },
    ]);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('keyboard-shortcuts saveShortcuts()', async () => {
    await saveShortcuts({ ocr_activate: 'Alt+O' });

    expect(applySettingWrites).toHaveBeenCalledWith([
      { path: 'keyboardShortcuts', value: { ocr_activate: 'Alt+O' } },
    ]);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('StorageManager updateSetting()', async () => {
    await StorageManager.updateSetting('tts.rate', 1.4);

    expect(applySettingWrites).toHaveBeenCalledWith([{ path: 'tts.rate', value: 1.4 }]);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
});
