/**
 * The popup's "See what is recorded" button.
 *
 * A record a student cannot inspect is not one they can meaningfully consent to. The popup could
 * switch the learning profile on and delete what it had gathered, but nothing anywhere could open
 * the panel that shows it — so this is the missing half of that control.
 *
 * It lives in its own module, loaded by popup.html beside popup.js, rather than in popup.js: the
 * panel is drawn by the content script in the page, so all the popup does is ask the page to open
 * it and then get out of the way. Answering 'COGNITIVE_PROFILE_SHOW' is
 * cognitiveProfile.js's job, in the page.
 *
 * @module features/cognitiveProfile/profile-record-button
 */

import { attachAccessibleHandler } from '../../utils/event-handlers.js';

const BUTTON_ID = 'btn-see-learning-record';
/** Shared with the delete control: one role="status" line for this whole section. */
const STATUS_ID = 'learning-profile-delete-status';

/**
 * Ask the page in the active tab to open the panel.
 *
 * On success the popup closes itself, because the dialog it just opened is behind it and a student
 * cannot Tab into a page while a popup has the focus.
 *
 * @param {(message: string) => void} say - writes a sentence into the section's status line
 * @returns {Promise<boolean>} whether the panel was opened
 */
export async function openRecordedProfile(say) {
  let tabId;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
  } catch {
    tabId = undefined;
  }

  if (typeof tabId !== 'number') {
    say('Open a web page first, then try again.');
    return false;
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'COGNITIVE_PROFILE_SHOW' });
    if (response?.success) {
      window.close();
      return true;
    }
    say(response?.reason || 'Could not open your record. Reload the page and try again.');
    return false;
  } catch {
    // No content script answered — a settings page, the Web Store, or a PDF viewer.
    say('Open a web page first, then try again.');
    return false;
  }
}

/**
 * Wire the button, if this document has one.
 * @returns {void}
 */
export function initSeeRecordButton() {
  const button = document.getElementById(BUTTON_ID);
  if (!button) {
    return;
  }

  const status = document.getElementById(STATUS_ID);
  const say = message => {
    if (status) {
      status.textContent = message;
    }
  };

  attachAccessibleHandler(button, 'See learning record', () => {
    openRecordedProfile(say);
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSeeRecordButton, { once: true });
  } else {
    initSeeRecordButton();
  }
}
