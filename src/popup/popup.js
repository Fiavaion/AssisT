/**
 * Popup UI Controller
 * Manages user interactions with the TTS controls popup
 */

import DOMPurify from 'dompurify';
import { MESSAGE_TYPES } from '../config/constants.js';
import {
  DEFAULT_SHORTCUTS,
  MIND_MAP_SCOPE,
  PAGE_SCOPE,
  SHORTCUT_LABELS,
  loadShortcuts,
  shortcutKeysInScope,
  saveShortcuts,
  validateShortcut,
  eventToShortcut,
} from '../utils/keyboard-shortcuts.js';
import { migrateAnnotations } from '../features/annotations/migration-manager.js';
import { CitationManagerPanel } from './citation-manager-panel.js';
import { sanitizeHTML, sanitizeText } from '../utils/sanitize.js';
import {
  filterChatModels,
  pickDefaultChatModel,
  DEFAULT_CHAT_MODEL,
  RECOMMENDED_PULL_MODEL,
} from '../utils/ollama-models.js';
import {
  DEFAULT_OLLAMA_BASE_URL,
  getOllamaBaseUrl,
  applyOllamaBaseUrlChange,
  ensureOllamaPermission,
} from '../utils/ollama-url.js';
import {
  getAIMode,
  checkAIAvailable,
  generateWithAI,
} from '../features/shared/ai-feature-client.js';
import { getCompatibleModels, isCatalogModelInstalled } from '../pages/ai-setup/ollama-catalog.js';
import { createControlFinder, mountFlat } from './flat/flat-mount.js';
import { bindCompanionSwitches } from './companion-switches.js';
import { THEMES, THEME_LABELS, loadAndApplyTheme, setThemePreference } from './theme.js';
import { createHeaderMenu } from './header-menu.js';
import { attachAccessibleHandler } from '../utils/event-handlers.js';
import { Z } from '../utils/z-index.js';
import { renderedId } from './registry/control-renderer.js';
import { waitForVoices } from '../utils/speech-voice.js';
import { renderVoiceOptions } from './voice-picker.js';
import { debugLog } from '../utils/debug-log.js';
import { trapFocus } from '../utils/focus-trap.js';
import { INBOX_ID, TARGET_KEY, writeTargetId } from '../features/mindMap/mindmap-keys.js';
import { eraseProfileData } from '../features/cognitiveProfile/profile-storage.js';
import { showInfoTray } from '../utils/action-tray.js';
import { exportSettings, importSettingsFromFile } from '../utils/settings-portability.js';
import { applySettingWrites, changedSettingWrites } from '../utils/setting-writes.js';
import { StorageManager } from '../utils/storage-manager.js';
import { getHardcodedFallbackModels, resolveModel } from '../ai/model-registry.js';
import { takePopupSurfaceRequest, POPUP_SURFACE_AI } from '../utils/popup-open-request.js';
import { renderYourData } from './your-data.js';
import { DESTINATIONS, describeCloudConsent, getConsent, recordConsent } from '../utils/consent.js';
import {
  originsFor,
  requestHostPermissions,
  releaseHostPermissions,
  holdsHostPermissions,
} from '../utils/host-permissions.js';
import {
  clearInstitutionKey,
  getStoredInstitutionKey,
  resolveBrandingFromToken,
} from '../features/institution/institution-resolver.js';

/**
 * The models each cloud provider offers, straight from the model registry. There is
 * deliberately no list of models in this file: two hand-kept copies drifted from the registry
 * and went on offering retired ids.
 * @returns {Record<string, Array<{id: string, name: string, description: string}>>}
 */
function cloudFallbackModels() {
  return Object.fromEntries(
    ['anthropic', 'openai', 'google', 'perplexity'].map(p => [p, getHardcodedFallbackModels(p)])
  );
}

// Make DOMPurify available for sanitize.js (popup runs in separate context from content script)
window.DOMPurify = DOMPurify;

/**
 * Registry `optionsFrom` sources, and the accordion select that already holds each list.
 * A select whose options are enumerated at runtime has exactly one filled copy in the popup;
 * every other view reads it from there rather than fetching the list a second time.
 * @type {Record<string, string>}
 */
const RUNTIME_OPTION_SOURCES = {
  voices: 'voice-select',
  mindMaps: 'mind-map-target',
};

/**
 * The keyboard listener `attachInteractiveHandler` last put on an element.
 *
 * `element.onmousedown = ...` replaces itself; `addEventListener` stacks. Wiring the same control
 * twice — a panel rebuilt, a section re-rendered — would otherwise leave two listeners and fire the
 * handler twice per keypress, so the previous one is taken off first.
 */
const popupKeyListeners = new WeakMap();

/**
 * How long an accordion section takes to shut, in milliseconds.
 *
 * It matches the `max-height` transition on `.accordion-content` in popup.css, because that is
 * what it waits for: the content is only made `inert` once it has finished shrinking, so nothing
 * disappears from under a student mid-animation. A student who has asked the system for less
 * movement has no animation to wait for and the wait is skipped entirely.
 */
const ACCORDION_COLLAPSE_MS = 300;

/**
 * How long the popup waits before trying the settings fetch again, in milliseconds.
 *
 * A popup opened while the service worker is asleep or restarting gets no answer at all, and the
 * worker is usually up a moment later. One quiet retry turns the commonest cause of a dead popup
 * into a pause; a second would only make the banner's own Retry button dishonest.
 */
const SETTINGS_RETRY_MS = 1200;
/**
 * How long the popup waits for its settings before treating the request as failed. A worker that
 * hangs rather than refusing would otherwise leave start-up waiting for ever: the popup busy, its
 * clicks held, and the failure banner never shown. Generous, because a waking worker is slow.
 */
const SETTINGS_TIMEOUT_MS = 5000;

/**
 * The shortcut presets, every one of them covering every key in the registry.
 *
 * They used to be three hand-written lists. `action_tray_focus` was added to the registry and the
 * lists were not, so each of them silently left the tray shortcut on whatever the previous preset
 * had bound — a preset that does not fully replace the previous one is not a preset. Starting from
 * the registry keys and laying the preset's own choices on top means a key added to the registry
 * cannot be missed here again; the test that compares each preset's keys against the registry is
 * what holds that.
 *
 * An empty string means "no shortcut". `action_tray_focus` is never empty: the Undo offered by the
 * confirmation tray has no other keyboard route, and a preset that removed it would take a student
 * on the keyboard out of their own undo (WCAG 2.2 SC 2.1.1).
 *
 * What a preset REARRANGES is the page scope — the tools that act on the page a student is reading.
 * The mind map editor's keys are carried through at their defaults instead, because a preset that
 * blanked them would leave the editor with no keyboard at all: the outline IS its keyboard, and
 * "minimal" meaning "you can no longer save or undo your map" is not a reading preference. They stay
 * changeable one at a time in the Keyboard grid, and the editor's own shortcut list prints whatever
 * the student has.
 */
const UNBOUND_SHORTCUTS = Object.fromEntries(shortcutKeysInScope(PAGE_SCOPE).map(key => [key, '']));

/** The editor's keys at their shipped chords, carried into every preset unchanged. */
const EDITOR_SHORTCUTS = Object.fromEntries(
  shortcutKeysInScope(MIND_MAP_SCOPE).map(key => [key, DEFAULT_SHORTCUTS[key]])
);

export const SHORTCUT_PRESETS = {
  // Balanced modifiers: the registry's own bindings.
  default: { ...UNBOUND_SHORTCUTS, ...DEFAULT_SHORTCUTS },

  // Essential shortcuts only; everything else is left unbound.
  minimal: {
    ...UNBOUND_SHORTCUTS,
    ...EDITOR_SHORTCUTS,
    tts_play_pause: 'Ctrl+Space',
    reading_mode_toggle: 'Alt+R',
    reading_mode_exit: 'Escape',
    // Kept: for a student who cannot type comfortably this is the way in, not an extra.
    stt_dictate: 'Alt+Shift+V',
    action_tray_focus: 'Alt+Shift+U',
    focus_mode_toggle: 'Alt+F',
    reading_guide_toggle: 'Alt+G',
  },

  // Left-hand keys with Alt, so the whole set is reachable one-handed.
  oneHanded: {
    ...UNBOUND_SHORTCUTS,
    ...EDITOR_SHORTCUTS,
    tts_play_pause: 'Alt+Q',
    tts_stop: 'Alt+W',
    ocr_activate: 'Alt+E',
    reading_mode_toggle: 'Alt+A',
    reading_mode_exit: 'Escape',
    dictionary_lookup: 'Alt+S',
    text_stats_toggle: 'Alt+D',
    highlight_menu_toggle: 'Alt+F',
    sticky_note_create: 'Alt+Z',
    translation_toggle: 'Alt+X',
    citation_save: 'Alt+C',
    stt_dictate: 'Alt+Shift+V',
    open_mind_map: 'Alt+T',
    action_tray_focus: 'Alt+Shift+A',
    focus_mode_toggle: 'Alt+V',
    reading_guide_toggle: 'Alt+R',
    screen_overlay_toggle: 'Alt+B',
    dyslexia_mode_toggle: 'Alt+G',
  },
};

export class PopupController {
  constructor() {
    this.settings = null;
    // The settings as they were last read from storage. saveSettings() diffs against it.
    this.pristineSettings = null;
    this.currentTab = null;
    this.isInitialized = false;
    this.citationPanel = null;
    // One pending "now make it inert" per section, so re-opening a section mid-collapse cancels
    // the shutting rather than racing it.
    this.accordionCloseTimers = new Map();
    // The one automatic retry of the settings fetch, and what it disabled while it waited.
    this.settingsRetryTimer = null;
    this.settingsRetryUsed = false;
    this.controlsDisabledByFailure = null;
  }

  /**
   * Attaches the popup's activation handlers: mousedown for the pointer, Enter and Space for the
   * keyboard.
   *
   * Mousedown is what beats the document-level listeners that would otherwise hide the control
   * before a click landed. It is also the one event a keyboard
   * never sends: a native button pressed with Enter fires `click`, and Space fires `click` on the
   * way up, so mousedown alone made every button in this popup mouse-only — a straight SC 2.1.1
   * failure across the whole surface.
   *
   * @param {HTMLElement} element - The element to attach handler to
   * @param {string} label - Debug label for logging
   * @param {Function} handler - The handler function to execute
   */
  attachInteractiveHandler(element, label, handler) {
    if (!element) {
      console.warn(`[Popup] Element not found for: ${label}`);
      return;
    }

    const activate = e => {
      console.log(`[Popup] ${label} triggered`);
      e.preventDefault();
      e.stopPropagation();

      try {
        handler(e);
      } catch (error) {
        console.error(`[Popup] ${label} error:`, error);
        this.updateStatus(`Error: ${error.message}`, 'error');
      }
    };

    element.onmousedown = activate;

    // addEventListener, not `.onkeydown`: the property is a single slot, and the popup's own
    // keyboard wiring (Escape on the menus, arrow keys on the sliders) sets it on some of these
    // elements. `preventDefault()` above also cancels the click the browser would synthesise from
    // the key, so the handler runs once per press, and `repeat` keeps a held key to one run.
    const onKeydown = e => {
      if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat) {
        return;
      }
      activate(e);
    };

    const previous = popupKeyListeners.get(element);
    if (previous) {
      element.removeEventListener('keydown', previous);
    }
    popupKeyListeners.set(element, onKeydown);
    element.addEventListener('keydown', onKeydown);

    // Visual feedback
    element.onmouseenter = () => {
      element.style.transform = 'scale(1.05)';
    };
    element.onmouseleave = () => {
      element.style.transform = 'scale(1)';
    };
  }

  /**
   * Turn a backdrop and the panel inside it into a real modal dialog, and show it.
   *
   * The popup built its overlays by hand: a `div` with a dark background and no `role`, so a
   * screen reader announced nothing, Tab walked straight out into the controls behind the
   * overlay, and Escape worked on one of them and not the other. The trapping and the focus
   * restore come from the shared `trapFocus` helper the citation, OCR and annotation dialogs
   * already use — this adds the naming and the ways out, not a third focus trap.
   *
   * @param {Object} options
   * @param {HTMLElement} options.backdrop - the full-screen layer; a press on it closes.
   * @param {HTMLElement} options.dialog - the panel inside it that becomes the dialog.
   * @param {string} options.labelledBy - id of the heading that names the dialog.
   * @param {HTMLElement} [options.opener] - the control the student opened this from.
   * @param {HTMLElement} [options.initialFocus] - where the keyboard lands.
   * @param {() => void} [options.onClose] - runs once the dialog has gone, however it was closed.
   * @returns {() => void} Closes the dialog, once, whoever calls it.
   */
  openPopupDialog({ backdrop, dialog, labelledBy, opener: pressed, initialFocus, onClose }) {
    // A dialog opened through Flat is opened by the hidden accordion control Flat passed the press
    // on to. Flat's copy is the one on screen, so that is the one to give the keyboard back to.
    const opener = this.visibleCopyOf(pressed);
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', labelledBy);

    document.body.appendChild(backdrop);

    // trapFocus hands the keyboard back to whatever held it when the trap was set, and a pointer
    // press on the opener never focused it — the popup's activation helper cancels the default
    // that would have. Focusing it here is what makes "focus comes back to the button you opened
    // this from" true on the pointer path as well as the keyboard one.
    if (opener?.isConnected && typeof opener.focus === 'function') {
      opener.focus();
    }

    let closed = false;
    let release = () => {};
    const close = () => {
      if (closed) {
        return;
      }
      closed = true;
      release(); // restores focus to the opener
      backdrop.remove();
      if (onClose) {
        onClose();
      }
    };

    // A press on the backdrop dismisses. Deliberately a plain mousedown listener and not
    // attachInteractiveHandler: that helper also binds Enter and Space on the element it is given
    // and calls preventDefault(), and every key pressed inside the dialog bubbles up to here — it
    // was swallowing the space bar in the Add Custom Word field, so a phrase could not be typed.
    backdrop.addEventListener('mousedown', e => {
      if (e.target === backdrop) {
        close();
      }
    });

    release = trapFocus(dialog, { onEscape: close, initialFocus });
    return close;
  }

  /**
   * The control a student actually pressed to reach `element`.
   *
   * Flat draws its own copy of each accordion control and passes every press on to the original,
   * which stays hidden and so can never take the keyboard. A dialog opened from one of those
   * originals hands the keyboard back to Flat's copy, the one on screen (SC 2.4.3).
   *
   * @param {HTMLElement} [element] - the accordion control whose handler is running
   * @returns {HTMLElement|undefined}
   */
  visibleCopyOf(element) {
    const copy = element?.id ? document.getElementById(renderedId(element.id)) : null;
    return copy?.isConnected ? copy : element;
  }

  /**
   * The backdrop and panel of a dialog opened from Flat, before `openPopupDialog` makes it modal.
   *
   * It takes the look of the Your data confirmation, which has its own AA colour tokens in light
   * and dark and no fixed heights, so text spacing can grow (SC 1.4.12), rather than adding another.
   *
   * @param {string} id - the dialog's id; its heading is `${id}-title`
   * @param {string} heading
   * @returns {{backdrop: HTMLElement, dialog: HTMLElement, actions: HTMLElement, titleId: string}}
   */
  buildPopupSheet(id, heading) {
    const backdrop = document.createElement('div');
    backdrop.className = 'your-data-confirm';
    backdrop.style.zIndex = String(Z.MODAL);

    const dialog = document.createElement('div');
    dialog.className = 'your-data-confirm__dialog';
    dialog.id = id;

    const title = document.createElement('h2');
    title.className = 'your-data-confirm__title';
    title.id = `${id}-title`;
    title.textContent = heading;

    const actions = document.createElement('div');
    actions.className = 'your-data-confirm__actions';

    dialog.append(title, actions);
    backdrop.appendChild(dialog);
    return { backdrop, dialog, actions, titleId: title.id };
  }

  /**
   * One button in a popup sheet, wired for pointer and keyboard.
   * @param {string} label
   * @param {() => void} run
   * @param {boolean} [danger]
   * @returns {HTMLButtonElement}
   */
  sheetButton(label, run, danger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = danger ? 'your-data__btn your-data__btn--danger' : 'your-data__btn';
    button.textContent = label;
    attachAccessibleHandler(button, label, run, { enableVisualFeedback: false });
    return button;
  }

  /**
   * Ask before deleting the record of how the student works.
   *
   * A dialog with its own Delete button, never a second press on the button that asked. Flat
   * passes each press on its copy of that button to the hidden original, so the old two-press
   * arming showed its warning nowhere and let a double press delete for good.
   *
   * @param {HTMLElement} opener - the accordion button whose handler asked
   * @param {() => Promise<void>} onDelete
   */
  confirmDeleteLearningRecord(opener, onDelete) {
    const id = 'delete-learning-record-dialog';
    if (document.getElementById(id)) {
      return;
    }
    const { backdrop, dialog, actions, titleId } = this.buildPopupSheet(
      id,
      'Delete the record of how you work?'
    );

    const warning = document.createElement('p');
    warning.id = `${id}-warning`;
    warning.textContent =
      'Deleting removes it from this device straight away. It cannot be undone.';
    dialog.insertBefore(warning, actions);
    dialog.setAttribute('aria-describedby', warning.id);

    let close = () => {};
    const cancel = this.sheetButton('Cancel', () => close());
    const confirm = this.sheetButton(
      'Delete this record',
      async () => {
        close();
        await onDelete();
      },
      true
    );
    actions.append(cancel, confirm);

    close = this.openPopupDialog({
      backdrop,
      dialog,
      labelledBy: titleId,
      opener,
      // Cancel is the safe answer, so it is where the keyboard starts.
      initialFocus: cancel,
    });
  }

  /**
   * Show a panel from the hidden accordion in a dialog, and put it back when the dialog closes.
   *
   * Citation Quick View and the dictation statistics each unfold a panel the accordion holds. The
   * accordion is hidden while Flat is the popup's face, so the panel is lent to a dialog on top of
   * everything instead, then returned, with its own handlers still attached.
   *
   * @param {Object} options
   * @param {string} options.id - the dialog's id
   * @param {string} options.heading - the dialog's name
   * @param {HTMLElement} options.panel - the accordion panel to show
   * @param {HTMLElement} options.opener - the accordion button whose handler is running
   * @returns {boolean} whether a dialog opened; false when this one is already open
   */
  showPanelInSheet({ id, heading, panel, opener }) {
    if (document.getElementById(id)) {
      return false;
    }
    const { backdrop, dialog, actions, titleId } = this.buildPopupSheet(id, heading);
    const home = panel.parentNode;
    const nextSibling = panel.nextSibling;
    dialog.insertBefore(panel, actions);
    panel.style.display = 'block';

    let close = () => {};
    actions.appendChild(this.sheetButton('Close', () => close()));
    // The panel itself takes the keyboard, so the dialog is announced by its heading and the
    // student reads from the top rather than landing part-way down.
    dialog.tabIndex = -1;

    close = this.openPopupDialog({
      backdrop,
      dialog,
      labelledBy: titleId,
      opener,
      initialFocus: dialog,
      onClose: () => {
        panel.style.display = 'none';
        home.insertBefore(panel, nextSibling);
      },
    });
    return true;
  }

  async initialize() {
    console.log('[Popup] Initializing...');

    try {
      // Get current tab
      console.log('[Popup] Step 1: Querying current tab...');
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tabs[0];
      console.log('[Popup] Step 1: ✓ Current tab retrieved:', this.currentTab?.id);

      // Load settings
      console.log('[Popup] Step 2: Loading settings...');
      if (!(await this.loadSettings())) {
        // Without settings there is nothing to fill the popup with, and every handler below would
        // read them. Say so on screen and stop here rather than building a popup that looks alive
        // and answers nothing.
        this.enterSettingsFailure();
        return;
      }
      console.log('[Popup] Step 2: ✓ Settings loaded');

      await this.buildPopup();
    } catch (error) {
      console.error('[Popup] ❌ INITIALIZATION FAILED:', error);
      console.error('[Popup] Error stack:', error.stack);
      this.updateStatus(`Initialization failed: ${error.message}`, 'error');
      // A failure with settings in hand is a bug somewhere further down, and saying "could not
      // load its settings" about it would send the student to a Retry that cannot help. The
      // banner is only for the case it describes.
      if (!this.settings) {
        this.enterSettingsFailure();
      }
    }
  }

  /**
   * Everything the popup does once it has its settings. Split out of `initialize` so the one
   * quiet retry after a failed settings fetch can pick up exactly where that left off, rather
   * than running the tab query and the live region a second time.
   *
   * @returns {Promise<void>}
   */
  async buildPopup() {
    // Setup UI
    console.log('[Popup] Step 3: Setting up event listeners...');
    this.setupEventListeners();
    console.log('[Popup] Step 3: ✓ Event listeners setup complete');

    console.log('[Popup] Step 4: Setting up accordions...');
    this.setupAccordions();
    console.log('[Popup] Step 4: ✓ Accordions setup complete');

    console.log('[Popup] Step 5: Updating UI...');
    this.updateUI();
    console.log('[Popup] Step 5: ✓ UI update complete');

    this.injectShortcutBadges();

    console.log('[Popup] Step 6: Loading voices...');
    this.loadVoices();
    console.log('[Popup] Step 6: ✓ Voices loaded');

    // Flat reads the accordion's switches, so it is drawn only once updateUI() has filled them.
    this.mountFlatView();

    // A student who pressed Open Settings on an AI panel asked for a particular screen, and the
    // worker could only leave a note saying which — this is where that note is honoured.
    await this.honourPendingOpenRequest();

    // Settled before the popup is ready, not after: the banner pushes every control down by about
    // 160px, and inserted once the popup looked usable it moved the switch a student was reaching
    // for, so the click landed on whatever slid into its place.
    try {
      await this.setupPermissionBanner();
    } catch (error) {
      console.error('[Popup] Permission banner setup failed:', error);
    }

    this.isInitialized = true;
    this.updateStatus('Ready');
    console.log('[Popup] ✓✓✓ INITIALIZATION COMPLETE ✓✓✓');
  }

  /**
   * Open the screen the student asked for from somewhere the popup could not be reached.
   *
   * The Open Settings button on an AI panel lives in a content script, which cannot open the popup
   * or talk to one that is not there. The worker opens it and leaves a note; this reads the note,
   * which spends it, so only the opening that was asked for is diverted.
   *
   * @returns {Promise<void>}
   */
  async honourPendingOpenRequest() {
    let surface = null;
    try {
      surface = await takePopupSurfaceRequest();
    } catch (error) {
      // A popup that cannot read the note is still a working popup.
      console.warn('[Popup] Could not read the pending open request:', error?.message);
      return;
    }

    if (surface !== POPUP_SURFACE_AI) {
      return;
    }

    this.showAdvancedOptions('ai');
  }

  /**
   * Show one tab of the Advanced Options modal by name, as pressing that tab would.
   * @param {string} tabId - The tab's `data-tab` value.
   */
  openModalTab(tabId) {
    const modal = document.getElementById('advanced-options-modal');
    const tab = modal?.querySelector(`.modal-tab[data-tab="${tabId}"]`);
    const content = modal?.querySelector(`#tab-${tabId}`);
    if (!tab || !content) {
      console.warn(`[Popup] No Advanced Options tab named ${tabId}`);
      return;
    }

    modal.querySelectorAll('.modal-tab').forEach(other => {
      other.classList.remove('active');
      other.setAttribute('aria-selected', 'false');
      // Roving tabindex: the strip is one stop in the tab order, and the arrow keys move within
      // it. Four separate stops made the student Tab past three panels to reach the fourth.
      other.setAttribute('tabindex', '-1');
    });
    modal.querySelectorAll('.tab-content').forEach(other => other.classList.remove('active'));
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    tab.removeAttribute('tabindex');
    content.classList.add('active');
    // The tab is where the student's attention has just been sent, so send the keyboard there too.
    tab.focus();
  }

  /**
   * Setup permission banner for optional all-sites permission
   * Completely fail-safe - errors here never affect main popup functionality
   */
  async setupPermissionBanner() {
    console.log('[Popup][PermBanner] ========== PERMISSION BANNER SETUP START ==========');
    try {
      const permissionBanner = document.getElementById('permission-banner');
      const enableBtn = document.getElementById('btn-enable-all-sites');

      console.log('[Popup][PermBanner] Elements found:', {
        permissionBanner: !!permissionBanner,
        enableBtn: !!enableBtn,
      });

      if (!permissionBanner || !enableBtn) {
        console.error('[Popup][PermBanner] ❌ CRITICAL: Elements not found!');
        return;
      }

      console.log('[Popup][PermBanner] Button element:', enableBtn);
      console.log('[Popup][PermBanner] Button outerHTML:', enableBtn.outerHTML);

      // Check if user already has all-sites permission
      console.log('[Popup][PermBanner] Checking current permissions...');
      let hasAllUrls = false;
      try {
        hasAllUrls = await chrome.permissions.contains({
          origins: ['<all_urls>'],
        });
        console.log('[Popup][PermBanner] Has <all_urls> permission:', hasAllUrls);
      } catch (err) {
        console.error('[Popup][PermBanner] ❌ Permission check failed:', err);
        return;
      }

      if (hasAllUrls) {
        // Check if permission was just granted (within last 60 seconds)
        const storage = await chrome.storage.local.get('permissionJustGranted');
        const justGranted = storage.permissionJustGranted;
        const isRecent = justGranted && Date.now() - justGranted < 60000;

        if (isRecent) {
          // Show success message
          permissionBanner.classList.remove('hidden');
          this.showPermissionSuccess(permissionBanner);
          // Clear the flag
          await chrome.storage.local.remove(['permissionJustGranted', 'permissionRequestedAt']);
          console.log('[Popup][PermBanner] ✓ Showing success message (just granted)');
        } else {
          permissionBanner.classList.add('hidden');
          console.log('[Popup][PermBanner] ✓ Already has permission, hiding banner');
        }
      } else {
        permissionBanner.classList.remove('hidden');
        console.log('[Popup][PermBanner] ✓ No permission yet, showing banner');
      }

      // Setup button click handler with maximum debugging
      console.log('[Popup][PermBanner] Setting up button click handlers...');

      // Clear any existing handlers
      const newBtn = enableBtn.cloneNode(true);
      enableBtn.parentNode.replaceChild(newBtn, enableBtn);
      console.log('[Popup][PermBanner] Replaced button to clear old handlers');

      // Get fresh reference
      const freshBtn = document.getElementById('btn-enable-all-sites');
      console.log('[Popup][PermBanner] Fresh button reference:', !!freshBtn);

      // BUG-7 fix: use attachInteractiveHandler (mousedown + preventDefault/stopPropagation)
      this.attachInteractiveHandler(freshBtn, 'Enable Everywhere Button', async () => {
        // Visual feedback
        freshBtn.textContent = 'Requesting...';
        freshBtn.disabled = true;

        // Store timestamp before requesting - popup might close during Chrome's dialog
        await chrome.storage.local.set({ permissionRequestedAt: Date.now() });

        try {
          console.log('[Popup][PermBanner] Calling chrome.permissions.request...');
          const granted = await chrome.permissions.request({
            origins: ['<all_urls>'],
          });
          console.log('[Popup][PermBanner] Permission granted:', granted);

          if (granted) {
            // Store that permission was just granted
            await chrome.storage.local.set({ permissionJustGranted: Date.now() });
            this.showPermissionSuccess(permissionBanner);
          } else {
            console.log('[Popup][PermBanner] Permission denied by user');
            freshBtn.textContent = 'Enable Everywhere';
            freshBtn.disabled = false;
            await chrome.storage.local.remove('permissionRequestedAt');
          }
        } catch (err) {
          console.error('[Popup][PermBanner] ❌ Permission error:', err);
          freshBtn.textContent = 'Error - Try Again';
          freshBtn.disabled = false;
          await chrome.storage.local.remove('permissionRequestedAt');
        }
      });

      console.log('[Popup][PermBanner] ========== SETUP COMPLETE ==========');

      // Try to inject content script if needed
      this.ensureContentScriptLoaded();
    } catch (error) {
      console.error('[Popup][PermBanner] ❌ FATAL ERROR:', error);
      console.error('[Popup][PermBanner] Stack:', error.stack);
    }
  }

  /**
   * Show the permission success message in the banner
   */
  showPermissionSuccess(permissionBanner) {
    permissionBanner.innerHTML = `
      <div class="permission-banner-content">
        <span class="permission-icon" aria-hidden="true">✅</span>
        <div class="permission-text">
          <strong>Permission granted!</strong>
          <span class="permission-desc" style="font-weight: 600; color: #065f46;">⟳ Reload this page to activate AssisT</span>
          <span class="permission-note" style="font-style: normal; color: #047857;">Press F5 or click the browser refresh button</span>
        </div>
      </div>
    `;
    permissionBanner.style.background = 'linear-gradient(135deg, #d1fae5, #a7f3d0)';
    permissionBanner.style.borderColor = '#10b981';
    console.log('[Popup][PermBanner] ✓ UI updated for success');
  }

  /**
   * Ensure content script is loaded in the current tab
   * For non-LMS sites, we inject on-demand if user has <all_urls> permission
   */
  async ensureContentScriptLoaded() {
    if (!this.currentTab?.id) {
      console.log('[Popup] No current tab, skipping content script check');
      return;
    }

    // Check if this is an LMS site (content script already loaded via manifest)
    const url = this.currentTab.url || '';
    const isLmsSite =
      url.includes('instructure.com') ||
      url.includes('canvas.com') ||
      url.includes('moodle.org') ||
      url.includes('moodlecloud.com') ||
      url.includes('classroom.google.com') ||
      url.includes('docs.google.com');

    if (isLmsSite) {
      console.log('[Popup] LMS site detected, content script should be loaded via manifest');
      return;
    }

    // Check if content script is already loaded by pinging it
    let contentScriptLoaded = false;
    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, { type: 'PING' });
      if (response?.loaded || response?.success) {
        console.log('[Popup] Content script already loaded');
        contentScriptLoaded = true;
      }
    } catch {
      // Content script not loaded, continue to check permissions
      console.log('[Popup] Content script not responding, will try to inject');
    }

    // Show file:// access guidance if on a local file without content script
    if (url.startsWith('file://') && !contentScriptLoaded) {
      const fileAccessBanner = document.getElementById('file-access-banner');
      if (fileAccessBanner) {
        fileAccessBanner.classList.remove('hidden');
        const openSettingsBtn = document.getElementById('btn-open-extension-settings');
        if (openSettingsBtn) {
          this.attachInteractiveHandler(openSettingsBtn, 'Open Extension Settings', () => {
            chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
          });
        }
      }
      console.log('[Popup] file:// URL detected without content script — showing access guidance');
      return;
    }

    if (contentScriptLoaded) {
      return;
    }

    // Check if user has <all_urls> permission
    let hasAllUrls = false;
    try {
      hasAllUrls = await chrome.permissions.contains({ origins: ['<all_urls>'] });
    } catch (e) {
      console.log('[Popup] Could not check permissions:', e.message);
      return;
    }

    if (!hasAllUrls) {
      console.log('[Popup] No <all_urls> permission, cannot inject content script');
      return;
    }

    // Inject the content script via service worker
    console.log('[Popup] Injecting content script into tab:', this.currentTab.id);
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'INJECT_CONTENT_SCRIPT',
        tabId: this.currentTab.id,
      });
      if (result.success) {
        console.log('[Popup] ✓ Content script injected successfully');
        // Show a toast on the page
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(this.currentTab.id, {
              type: 'SHOW_TOAST',
              message: '✓ AssisT loaded on this page',
            });
          } catch {
            // Toast failed, not critical
          }
        }, 500);
      } else {
        console.log('[Popup] Content script injection failed:', result.error);
      }
    } catch (error) {
      console.error('[Popup] Error injecting content script:', error.message);
    }
  }

  /**
   * Fetch the student's settings from the service worker.
   *
   * Returns whether it worked rather than throwing. A worker that is asleep, restarting or being
   * updated rejects the message, and the popup that used to come back from that looked completely
   * normal and did nothing at all: `this.settings` stayed null, `applyVisibilitySettings` threw
   * reading `ui_visibility`, and the only trace was one line in the status bar at the bottom.
   * The caller now has an answer it can act on.
   *
   * @returns {Promise<boolean>} true when `this.settings` now holds real settings
   */
  async loadSettings() {
    let timer;
    try {
      const response = await Promise.race([
        chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`no answer after ${SETTINGS_TIMEOUT_MS}ms`)),
            SETTINGS_TIMEOUT_MS
          );
        }),
      ]);

      if (response && response.success && response.data) {
        this.settings = response.data;
        // The copy `saveSettings()` diffs against. Taken here and refreshed on every save, so what
        // gets written is only what the student changed in the popup — see saveSettings().
        this.pristineSettings = structuredClone(this.settings);
        // The settings hold the student's chosen voice, their institution and their AI endpoint,
        // so what is logged is that they arrived, never what they contain.
        debugLog('[Popup][loadSettings] settings loaded:', this.settings);
        return true;
      }
      console.error('[Popup][loadSettings] settings fetch failed, success flag not set');
      return false;
    } catch (error) {
      console.error('[Popup][loadSettings] settings fetch failed:', error);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * The popup could not get its settings: say so where it can be seen, and stop pretending.
   *
   * Every control in the popup reads the settings, so with none of them the switches show nothing
   * true and pressing one saves nothing. They are disabled for as long as that is the case, which
   * is the honest state — a live-looking switch that does nothing is worse than a greyed one.
   *
   * The message is a `role="alert"` at the TOP of the popup, not the status line at the bottom
   * where this used to go unseen, and it carries the way out: a Retry button. One retry also runs
   * on its own after a short pause, because the commonest cause is a service worker that was
   * asleep when the popup opened and is awake a moment later.
   */
  enterSettingsFailure() {
    this.updateStatus('Could not load settings', 'error');
    this.showSettingsBanner();
    this.setControlsDisabled(true);

    if (this.settingsRetryTimer || this.settingsRetryUsed) {
      return;
    }
    this.settingsRetryUsed = true;
    this.settingsRetryTimer = setTimeout(() => {
      this.settingsRetryTimer = null;
      this.retrySettings();
    }, SETTINGS_RETRY_MS);
  }

  /**
   * Try the settings fetch again and, if it works this time, build the popup properly.
   * @returns {Promise<boolean>} whether the settings arrived
   */
  async retrySettings() {
    const banner = document.getElementById('settings-failure-banner');
    const retryButton = banner && banner.querySelector('.settings-failure__retry');
    if (retryButton) {
      retryButton.disabled = true;
    }

    const loaded = await this.loadSettings();
    if (!loaded) {
      if (retryButton) {
        retryButton.disabled = false;
      }
      return false;
    }

    if (banner) {
      banner.remove();
    }
    this.setControlsDisabled(false);

    try {
      await this.buildPopup();
    } catch (error) {
      console.error('[Popup] Building the popup after a retry failed:', error);
      this.updateStatus(`Initialization failed: ${error.message}`, 'error');
    }
    return true;
  }

  /** Put the banner at the top of the popup, once. */
  showSettingsBanner() {
    if (document.getElementById('settings-failure-banner')) {
      return;
    }
    const container = document.querySelector('.popup-container');
    if (!container) {
      return;
    }

    const banner = document.createElement('div');
    banner.id = 'settings-failure-banner';
    banner.className = 'settings-failure';
    // Announced the moment it appears: the student has just opened a popup that looks ordinary,
    // and nothing else on screen says why nothing in it works.
    banner.setAttribute('role', 'alert');

    const message = document.createElement('p');
    message.className = 'settings-failure__text';
    message.textContent = 'AssisT could not load its settings, so nothing here can be changed yet.';
    banner.appendChild(message);

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'settings-failure__retry';
    retry.textContent = 'Retry';
    banner.appendChild(retry);
    this.attachInteractiveHandler(retry, 'Retry loading settings', () => this.retrySettings());

    container.insertBefore(banner, container.firstChild);
  }

  /**
   * Disable, or give back, every control in the popup.
   *
   * Only the ones this turned off are turned back on: a control the popup disabled for its own
   * reasons (Save is disabled until a shortcut is recorded) must stay that way.
   *
   * @param {boolean} disabled
   */
  setControlsDisabled(disabled) {
    const container = document.querySelector('.popup-container');
    if (!container) {
      return;
    }

    if (!disabled) {
      (this.controlsDisabledByFailure || []).forEach(control => {
        control.disabled = false;
      });
      this.controlsDisabledByFailure = null;
      return;
    }

    this.controlsDisabledByFailure = [
      ...container.querySelectorAll('input, select, textarea, button'),
    ].filter(control => !control.disabled && !control.closest('.settings-failure'));
    this.controlsDisabledByFailure.forEach(control => {
      control.disabled = true;
    });
  }

  /**
   * Store what the student changed — and nothing else.
   *
   * The popup reads the whole settings object when it opens and roughly 160 handlers mutate that
   * one in-memory copy. Writing the copy back whole, which is what this used to do, discards
   * everything another realm stored while the popup sat open: a feature switched off from the page,
   * Escape dismissing the reading guide, the mind map saving a preference. The student never sees it
   * happen; the setting is simply back to what it was.
   *
   * So the popup keeps `this.pristineSettings`, the settings exactly as they were read at open or at
   * the last save. Saving diffs the live copy against it, and writes only the dotted paths that
   * actually differ, through `applySettingWrites`, which re-reads and merges at write time. Nothing
   * outside those paths is written, so nothing outside them can be lost. Then the pristine copy is
   * refreshed, so the next save starts from what is now on disk.
   *
   * There is no `UPDATE_SETTINGS` message any more, and no handler for one. A page learns about a
   * changed setting from `chrome.storage.onChanged`, which this write fires just the same, and which
   * is the only route now: the broadcast that used to accompany it never carried anything the page
   * acted on, and the handler that wrote the whole object alongside it was the second way to lose a
   * student's settings.
   *
   * Callers must not have to think about any of this: the signature is unchanged, and the many
   * handlers that call it without awaiting still work.
   */
  async saveSettings() {
    try {
      const writes = changedSettingWrites(this.pristineSettings, this.settings);
      if (writes.length === 0) {
        return;
      }
      await applySettingWrites(writes);
      this.pristineSettings = structuredClone(this.settings);
      console.log('[Popup] Settings saved');
    } catch (error) {
      console.error('[Popup] Error saving settings:', error);
    }
  }

  /**
   * Save highlight menu settings to the separate key that the feature reads
   * The highlightMenu.js feature reads from 'highlightMenuSettings' in chrome.storage.local
   */
  async saveHighlightMenuSettings() {
    if (!this.settings.highlightMenu) {
      return;
    }

    try {
      await chrome.storage.local.set({
        highlightMenuSettings: this.settings.highlightMenu,
      });
      debugLog('[Popup] highlight menu settings saved:', this.settings.highlightMenu);
    } catch (error) {
      console.error('[Popup] Error saving highlight menu settings:', error);
    }
  }

  applyVisibilitySettings() {
    // Get visibility settings with defaults
    const visibility = this.settings.ui_visibility || {};

    // Helper function to hide/show section
    const toggleSection = (sectionId, visibilityKey, defaultValue = true) => {
      const section = document.getElementById(sectionId);
      if (section) {
        // Use explicit value if set, otherwise use defaultValue
        const isVisible =
          visibility[visibilityKey] !== undefined ? visibility[visibilityKey] : defaultValue;
        section.style.display = isVisible ? '' : 'none';
      }
    };

    // Apply visibility for all features (most default to true)
    toggleSection('ocr-section', 'show_ocr'); // OCR section
    toggleSection('highlight-menu-section', 'show_highlight_menu'); // Highlight Menu section
    toggleSection('dictionary-section', 'show_dictionary'); // Dictionary section
    toggleSection('highlight-options-container', 'show_highlighting');
    toggleSection('text-customization-section', 'show_text_customization');
    toggleSection('reading-guide-section', 'show_reading_guide');
    toggleSection('focus-mode-section', 'show_focus_mode');
    toggleSection('stt-section', 'show_stt', true);
    toggleSection('annotations-section', 'show_annotations');
    toggleSection('translation-section', 'show_translation');
    toggleSection('screen-overlay-section', 'show_screen_overlay');
    toggleSection('canvas-integration-section', 'show_canvas_integration', true); // visible by default from 1.0
    toggleSection('moodle-integration-section', 'show_moodle_integration', true); // visible by default from 1.0
    toggleSection(
      'google-classroom-integration-section',
      'show_google_classroom_integration',
      true
    ); // visible by default from 1.0
    toggleSection('dyslexia-mode-section', 'show_dyslexia_mode');
    toggleSection('citation-section', 'show_citations', true); // Citation Manager toggle - visible by default from 1.0
    toggleSection('citation-options-container', 'show_citations', true); // Citation Manager buttons
    toggleSection('mind-map-section', 'show_mind_map', true); // Mind Map toggle
    toggleSection('mind-map-options-container', 'show_mind_map', true); // Mind Map layout + buttons
    // Dark Mode feature removed - extension UI dark mode remains in popup header
    toggleSection('simplify-section', 'show_simplify'); // Simplified Interface
    toggleSection('reading-progress-section', 'show_reading_progress'); // Reading Progress Tracker
    toggleSection('pomodoro-section', 'show_pomodoro'); // Pomodoro Timer
    toggleSection('reduced-motion-section', 'show_reduced_motion'); // Reduced Motion
    toggleSection('media-control-section', 'show_media_control'); // Media Control

    // Helper to check if a feature is visible (uses same logic as toggleSection)
    const isFeatureVisible = (visibilityKey, defaultValue = true) => {
      return visibility[visibilityKey] !== undefined ? visibility[visibilityKey] : defaultValue;
    };

    // Helper to hide/show an accordion section
    const toggleAccordion = (accordionDataSection, isVisible) => {
      const accordion = document.querySelector(
        `.accordion-section[data-section="${accordionDataSection}"]`
      );
      if (accordion) {
        accordion.style.display = isVisible ? '' : 'none';
      }
    };

    // Define accordion sections and their visibility-controlled features
    // Accordions with 'alwaysVisible: true' have features without visibility controls
    const accordionConfig = {
      reading: { alwaysVisible: true }, // TTS has no visibility toggle
      writing: {
        features: [{ key: 'show_stt', default: true }],
      },
      lookup: { alwaysVisible: true }, // Translation has no visibility toggle
      display: {
        features: [
          { key: 'show_text_customization', default: true },
          { key: 'show_reading_guide', default: true },
          { key: 'show_focus_mode', default: true },
          { key: 'show_dyslexia_mode', default: true },
          { key: 'show_screen_overlay', default: true },
          // show_dark_mode removed - feature removed, extension UI dark mode remains
          { key: 'show_simplify', default: true },
          { key: 'show_reading_progress', default: true },
          { key: 'show_pomodoro', default: true },
          { key: 'show_reduced_motion', default: true },
          { key: 'show_media_control', default: true },
        ],
      },
      school: {
        features: [
          { key: 'show_citations', default: true },
          { key: 'show_mind_map', default: true },
          { key: 'show_canvas_integration', default: true },
          { key: 'show_moodle_integration', default: true },
          { key: 'show_google_classroom_integration', default: true },
        ],
      },
      'ai-assist': { alwaysVisible: true }, // AI mode has no visibility toggle
    };

    // Apply accordion visibility
    for (const [accordionId, config] of Object.entries(accordionConfig)) {
      if (config.alwaysVisible) {
        toggleAccordion(accordionId, true);
      } else {
        // Check if ANY feature in this accordion is visible
        const hasVisibleFeature = config.features.some(f => isFeatureVisible(f.key, f.default));
        toggleAccordion(accordionId, hasVisibleFeature);
      }
    }

    console.log('[Popup] Visibility settings applied:', visibility);
  }

  /**
   * Initialize accordion sections for cleaner UI organization
   */
  setupAccordions() {
    console.log('[Popup][setupAccordions] Starting accordion setup...');
    const accordionSections = document.querySelectorAll('.accordion-section');
    console.log('[Popup][setupAccordions] Found', accordionSections.length, 'accordion sections');

    const savedState = this.loadAccordionState();
    console.log('[Popup][setupAccordions] Loaded saved state:', savedState);

    let processedCount = 0;
    accordionSections.forEach(section => {
      const header = section.querySelector('.accordion-header');
      const content = section.querySelector('.accordion-content');
      const sectionId = section.dataset.section;

      console.log(
        '[Popup][setupAccordions] Processing section:',
        sectionId,
        'header:',
        !!header,
        'content:',
        !!content
      );

      if (!header || !content) {
        console.warn(
          '[Popup][setupAccordions] ⚠️ Missing header or content for section:',
          sectionId
        );
        return;
      }

      // Set initial state based on saved preferences or defaults
      // Default: "reading" section is expanded
      const isExpanded =
        savedState[sectionId] !== undefined ? savedState[sectionId] : sectionId === 'reading';

      // No animation on the first paint: a section that starts shut has never been open, so there
      // is nothing to wait for before it is taken out of the tab order.
      this.setAccordionState(header, content, isExpanded, false);

      // One activation path, pointer and keyboard together: attachInteractiveHandler binds
      // mousedown AND Enter/Space. A second keydown toggle used to sit here as well, so every
      // key press toggled twice and cancelled itself out — the sections were mouse-only, and a
      // keyboard-only student could not reach Speech-to-Text at all.
      this.attachInteractiveHandler(header, `Accordion: ${sectionId}`, () => {
        const currentlyExpanded = header.getAttribute('aria-expanded') === 'true';
        this.setAccordionState(header, content, !currentlyExpanded);
        this.saveAccordionState();
      });

      processedCount++;
    });

    console.log('[Popup][setupAccordions] ✓ Processed', processedCount, 'accordions');
  }

  /**
   * Open or shut one accordion section — to the eye, to the keyboard and to a screen reader.
   *
   * A shut section used to be shut to the eye alone: `max-height: 0` with `overflow: hidden` and
   * nothing else, so about seventy switches, selects and buttons stayed in the tab order inside
   * boxes with no height. Tab moved focus into a section that was not on screen, no focus ring was
   * visible anywhere, and Space on the stop it landed on switched Speech-to-Text on with the
   * section still shut (SC 2.4.3, 2.4.7, 2.4.11). `inert` takes the whole subtree out of the tab
   * order and out of the accessibility tree; `visibility: hidden` says the same thing to any
   * browser that has not caught up, and neither touches `max-height`, so the animation is unchanged.
   *
   * Making it inert WAITS for the collapse to finish, because the content is still on screen while
   * it shrinks. Re-opening during that wait cancels it — `content` is the key, so a section opened
   * and shut repeatedly can only ever have one pending shutting.
   *
   * Flat drives these same controls while they are hidden, and that still works: `inert` blocks
   * focus and real user input, not a dispatched event or a programmatic `.click()`.
   *
   * @param {HTMLElement} header
   * @param {HTMLElement} content
   * @param {boolean} expanded
   * @param {boolean} [animate] - false on the first paint, when there is no collapse to wait for
   */
  setAccordionState(header, content, expanded, animate = true) {
    header.setAttribute('aria-expanded', expanded.toString());
    content.setAttribute('data-expanded', expanded.toString());

    const pending = this.accordionCloseTimers.get(content);
    if (pending) {
      clearTimeout(pending);
      this.accordionCloseTimers.delete(content);
    }

    if (expanded) {
      content.removeAttribute('inert');
      content.classList.remove('accordion-content--shut');
      return;
    }

    const shut = () => {
      this.accordionCloseTimers.delete(content);
      content.setAttribute('inert', '');
      content.classList.add('accordion-content--shut');
    };

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!animate || reduceMotion) {
      shut();
      return;
    }

    this.accordionCloseTimers.set(content, setTimeout(shut, ACCORDION_COLLAPSE_MS));
  }

  /**
   * Draw the Flat view: every support on one screen.
   *
   * Flat is the popup's face, and it drives the accordion beneath it: that markup stays in the
   * document, hidden, and every control Flat draws proxies to the accordion element of the same id,
   * whose handler does the real work (see flat/flat-mount.js).
   */
  mountFlatView() {
    const container = document.querySelector('.popup-container');
    const main = document.querySelector('.popup-main');
    if (!container || !main || this.flat) {
      return;
    }

    this.flatRoot = document.createElement('div');
    this.flatRoot.id = 'flat-root';
    main.parentNode.insertBefore(this.flatRoot, main);

    // Search the whole popup, because not every support's switch is inside an accordion section —
    // Show Text Stats sits in the bar above `<main>` — but never search Flat's own markup, which
    // draws the same controls again under the same ids and would otherwise be found first.
    const findControl = createControlFinder({ root: container, exclude: '#flat-root' });

    this.flat = mountFlat({
      container: this.flatRoot,
      find: findControl,
      getSettings: () => this.settings,
      getAiMode: () => this.aiMode,
      // Neither runtime list is knowable from the registry — the installed voices come from the
      // speech engine, the student's mind maps from the service worker — so in both cases the real
      // select in the accordion, already filled by its own handler, is the source.
      optionsFor: control => {
        const sourceId = RUNTIME_OPTION_SOURCES[control.optionsFrom];
        if (!sourceId) {
          return undefined;
        }
        const select = findControl(`[id="${sourceId}"]`);
        return [...(select ? select.options : [])].map(option => ({
          value: option.value,
          label: option.textContent,
        }));
      },
      // The theme control lives in Flat's own bar as well as Advanced Options. Both drive the one
      // stored preference, so there is no second copy of the state to fall out of step.
      theme: {
        choices: THEMES.map(value => ({ value, label: THEME_LABELS[value] })),
        current: () => this.themePreference || 'dark',
        set: preference => this.setThemePreference(preference),
      },
    });
  }

  loadAccordionState() {
    try {
      const saved = localStorage.getItem('assist_accordion_state');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }

  saveAccordionState() {
    const state = {};
    document.querySelectorAll('.accordion-section').forEach(section => {
      const header = section.querySelector('.accordion-header');
      const sectionId = section.dataset.section;
      if (header && sectionId) {
        state[sectionId] = header.getAttribute('aria-expanded') === 'true';
      }
    });
    try {
      localStorage.setItem('assist_accordion_state', JSON.stringify(state));
    } catch {
      // Ignore storage errors
    }
  }

  setupEventListeners() {
    console.log('[Popup][setupEventListeners] Starting event listener setup...');

    try {
      // Apply visibility settings
      console.log('[Popup][setupEventListeners] Applying visibility settings...');
      this.applyVisibilitySettings();
      console.log('[Popup][setupEventListeners] ✓ Visibility settings applied');

      const optionsContainer = document.getElementById('options-container');
      const ocrOptionsContainer = document.getElementById('ocr-options-container');

      const ocrEnabled = document.getElementById('ocr-enabled');
      if (ocrEnabled) {
        // An install that predates OCR has no ocr key at all, and getSettings() does not merge
        // defaults in. Seed from the one definition of the default: the literal that used to live
        // here said enabled: true and switched OCR on for every one of those installs.
        if (!this.settings.ocr) {
          this.settings.ocr = structuredClone(StorageManager.DEFAULT_SETTINGS.ocr);
        }

        ocrEnabled.checked = this.settings.ocr.enabled !== false;

        // Show/hide OCR options based on enabled state
        if (ocrEnabled.checked) {
          ocrOptionsContainer.classList.remove('hidden');
        } else {
          ocrOptionsContainer.classList.add('hidden');
        }

        ocrEnabled.addEventListener('change', e => {
          this.settings.ocr.enabled = e.target.checked;
          this.saveSettings();

          // Toggle OCR options visibility
          if (e.target.checked) {
            ocrOptionsContainer.classList.remove('hidden');
          } else {
            ocrOptionsContainer.classList.add('hidden');
          }
        });
      }

      // Maths Support — master toggle + sub-tools (content script converges via storage change)
      const mathsEnabled = document.getElementById('maths-enabled');
      const mathsOptionsContainer = document.getElementById('maths-options-container');
      if (mathsEnabled && mathsOptionsContainer) {
        // A settings object written before 1.0 has no maths branch at all. The defaults live in
        // StorageManager.DEFAULT_SETTINGS and are merged in on read; all this needs is somewhere to
        // write, and the reads below already treat an absent key as its default.
        this.settings.maths ??= {};

        const syncMathsVisibility = () => {
          if (mathsEnabled.checked) {
            mathsOptionsContainer.classList.remove('hidden');
          } else {
            mathsOptionsContainer.classList.add('hidden');
          }
        };
        mathsEnabled.checked = this.settings.maths.enabled === true;
        syncMathsVisibility();
        mathsEnabled.addEventListener('change', e => {
          this.settings.maths.enabled = e.target.checked;
          this.saveSettings();
          syncMathsVisibility();
        });

        [
          ['maths-calculator', 'calculator', true],
          ['maths-number-format', 'numberFormat', false],
          ['maths-place-value', 'placeValue', false],
        ].forEach(([id, key, defaultOn]) => {
          const box = document.getElementById(id);
          if (!box) {
            return;
          }
          box.checked = defaultOn
            ? this.settings.maths[key] !== false
            : this.settings.maths[key] === true;
          box.addEventListener('change', e => {
            this.settings.maths[key] = e.target.checked;
            this.saveSettings();
          });
        });
      }

      // TTS Enable/Disable
      const ttsEnabled = document.getElementById('tts-enabled');
      ttsEnabled.checked = this.settings?.tts?.enabled || false;

      // Show/hide options based on TTS enabled state
      if (ttsEnabled.checked) {
        optionsContainer.classList.remove('hidden');
      } else {
        optionsContainer.classList.add('hidden');
      }

      ttsEnabled.addEventListener('change', e => {
        this.settings.tts.enabled = e.target.checked;
        this.saveSettings();

        // Toggle options visibility
        if (e.target.checked) {
          optionsContainer.classList.remove('hidden');
        } else {
          optionsContainer.classList.add('hidden');
        }

        this.sendCommandToTab(e.target.checked ? 'enable' : 'disable');
      });

      const btnReadPage = document.getElementById('btn-read-page');
      this.attachInteractiveHandler(btnReadPage, 'Read Page Button', () => {
        console.log('[Popup] Read Page button clicked');
        this.sendCommandToTab('readPage');
        this.updateStatus('Reading page...', 'speaking');
      });

      const btnTriggerOCR = document.getElementById('btn-trigger-ocr');
      if (btnTriggerOCR) {
        this.attachInteractiveHandler(btnTriggerOCR, 'OCR Trigger Button', async () => {
          console.log('[Popup] OCR button clicked');
          this.updateStatus('Starting OCR...', 'processing');

          try {
            // Send message to content script to trigger OCR
            const response = await chrome.tabs.sendMessage(this.currentTab.id, {
              type: 'TRIGGER_OCR',
            });

            if (response && response.success) {
              this.updateStatus('OCR complete!', 'success');
            } else {
              this.updateStatus('OCR failed', 'error');
            }
          } catch (error) {
            console.error('[Popup] OCR trigger failed:', error);
            this.updateStatus('OCR error: ' + error.message, 'error');
          }
        });
      }

      const ocrAutoReadingMode = document.getElementById('ocr-auto-reading-mode');
      if (ocrAutoReadingMode) {
        // Initialize OCR settings if they don't exist
        if (!this.settings.ocr) {
          this.settings.ocr = {
            autoActivateReadingMode: true,
            filterNoise: true,
            upscaleFactor: 1.5,
          };
        }

        // Set initial state from settings
        ocrAutoReadingMode.checked = this.settings.ocr.autoActivateReadingMode !== false;

        // Handle toggle changes
        ocrAutoReadingMode.addEventListener('change', e => {
          this.settings.ocr.autoActivateReadingMode = e.target.checked;
          this.saveSettings();
          console.log('[Popup] OCR auto-activate reading mode:', e.target.checked);
        });
      }

      // Opt-in image preprocessing before recognition (changes OCR output — default OFF)
      const ocrOfflineAccuracy = document.getElementById('ocr-offline-accuracy');
      if (ocrOfflineAccuracy) {
        ocrOfflineAccuracy.checked = this.settings.ocr?.offlineAccuracy === true;
        ocrOfflineAccuracy.addEventListener('change', e => {
          this.settings.ocr.offlineAccuracy = e.target.checked;
          this.saveSettings();
        });
      }

      const ocrUpscaleSlider = document.getElementById('ocr-upscale-factor');
      const ocrUpscaleLabel = document.getElementById('ocr-upscale-label');
      if (ocrUpscaleSlider && ocrUpscaleLabel) {
        // Initialize default if not set
        if (!this.settings.ocr) {
          this.settings.ocr = {
            autoActivateReadingMode: true,
            filterNoise: true,
            upscaleFactor: 1.5,
          };
        }

        // Label the zoom level. Higher zoom helps small fonts but makes capture/recognition slower;
        // a region capture is best for very small text.
        const getQualityLabel = factor => {
          const x = `${factor.toFixed(1)}×`;
          if (factor <= 1.0) {
            return `${x} (none)`;
          }
          if (factor <= 1.6) {
            return `${x} (medium)`;
          }
          if (factor <= 2.2) {
            return `${x} (high)`;
          }
          return `${x} (max — best for small text, slower)`;
        };

        // Set initial state from settings
        const initialFactor = this.settings.ocr.upscaleFactor ?? 1.5;
        ocrUpscaleSlider.value = initialFactor;
        ocrUpscaleLabel.textContent = getQualityLabel(initialFactor);

        // Handle slider changes
        ocrUpscaleSlider.addEventListener('input', e => {
          const factor = parseFloat(e.target.value);
          ocrUpscaleLabel.textContent = getQualityLabel(factor);
          this.settings.ocr.upscaleFactor = factor;
          this.saveSettings();
          console.log('[Popup] OCR upscale factor:', factor);
        });
      }

      const ocrLanguageSelect = document.getElementById('ocr-language');
      if (ocrLanguageSelect) {
        this.settings.ocr ??= structuredClone(StorageManager.DEFAULT_SETTINGS.ocr);

        // Set initial state from settings
        ocrLanguageSelect.value = this.settings.ocr.language || 'eng';

        // Handle language changes
        ocrLanguageSelect.addEventListener('change', e => {
          this.settings.ocr.language = e.target.value;
          this.saveSettings();
          console.log('[Popup] OCR language changed to:', e.target.value);
        });
      }

      const ocrConfidenceSlider = document.getElementById('ocr-confidence-threshold');
      const ocrConfidenceLabel = document.getElementById('ocr-confidence-label');
      if (ocrConfidenceSlider && ocrConfidenceLabel) {
        this.settings.ocr ??= structuredClone(StorageManager.DEFAULT_SETTINGS.ocr);

        // Set initial state from settings
        const initialConfidence = this.settings.ocr.confidenceThreshold ?? 60;
        ocrConfidenceSlider.value = initialConfidence;
        ocrConfidenceLabel.textContent = `${initialConfidence}%`;

        // Handle slider changes
        ocrConfidenceSlider.addEventListener('input', e => {
          const confidence = parseInt(e.target.value, 10);
          ocrConfidenceLabel.textContent = `${confidence}%`;
          this.settings.ocr.confidenceThreshold = confidence;
          this.saveSettings();
          console.log('[Popup] OCR confidence threshold:', confidence);
        });
      }

      const ocrAutoTTS = document.getElementById('ocr-auto-tts');
      if (ocrAutoTTS) {
        this.settings.ocr ??= structuredClone(StorageManager.DEFAULT_SETTINGS.ocr);

        // Off unless the student switched it on.
        ocrAutoTTS.checked = this.settings.ocr.autoTTS === true;

        // Handle toggle changes
        ocrAutoTTS.addEventListener('change', e => {
          this.settings.ocr.autoTTS = e.target.checked;
          this.saveSettings();
          console.log('[Popup] OCR auto-TTS:', e.target.checked);
        });
      }

      const highlightMenuEnabled = document.getElementById('highlight-menu-enabled');
      const highlightMenuOptionsContainer = document.getElementById(
        'highlight-menu-options-container'
      );

      if (highlightMenuEnabled && highlightMenuOptionsContainer) {
        // Initialize Highlight Menu settings if they don't exist
        if (!this.settings.highlightMenu) {
          this.settings.highlightMenu = {
            enabled: true,
            showTTS: true,
            showDictionary: true,
            showTranslate: true,
            showSearch: true,
            showAnnotate: true,
            showCopy: true,
            autoHideDelay: 5000,
          };
        }

        highlightMenuEnabled.checked = this.settings.highlightMenu.enabled !== false;

        // Show/hide options based on enabled state
        if (highlightMenuEnabled.checked) {
          highlightMenuOptionsContainer.classList.remove('hidden');
        } else {
          highlightMenuOptionsContainer.classList.add('hidden');
        }

        highlightMenuEnabled.addEventListener('change', e => {
          this.settings.highlightMenu.enabled = e.target.checked;
          this.saveSettings();
          // Also save to highlightMenuSettings for the feature to read
          this.saveHighlightMenuSettings();

          // Toggle options visibility
          if (e.target.checked) {
            highlightMenuOptionsContainer.classList.remove('hidden');
          } else {
            highlightMenuOptionsContainer.classList.add('hidden');
          }

          console.log('[Popup] Highlight Menu enabled:', e.target.checked);
        });
      }

      const buttonToggles = [
        { id: 'highlight-menu-show-tts', key: 'showTTS' },
        { id: 'highlight-menu-show-dictionary', key: 'showDictionary' },
        { id: 'highlight-menu-show-translate', key: 'showTranslate' },
        { id: 'highlight-menu-show-annotate', key: 'showAnnotate' },
        { id: 'highlight-menu-show-speed-read', key: 'showSpeedRead' },
      ];

      buttonToggles.forEach(({ id, key }) => {
        const toggle = document.getElementById(id);
        console.log(`[Popup] Looking for toggle ${id}:`, toggle ? 'FOUND' : 'NOT FOUND');
        if (toggle) {
          // Initialize settings
          if (!this.settings.highlightMenu) {
            this.settings.highlightMenu = {};
          }

          // Set initial checked state
          toggle.checked = this.settings.highlightMenu[key] !== false;
          console.log(`[Popup] Toggle ${id} initial state:`, toggle.checked);

          // Add change listener
          toggle.addEventListener('change', e => {
            console.log(`[Popup] Toggle ${id} CHANGED to:`, e.target.checked);
            this.settings.highlightMenu[key] = e.target.checked;
            this.saveSettings();
            // Also save to highlightMenuSettings for the feature to read
            this.saveHighlightMenuSettings();
            console.log(`[Popup] Highlight Menu ${key}:`, e.target.checked);
          });
        }
      });

      const highlightMenuDelaySlider = document.getElementById('highlight-menu-auto-hide-delay');
      const highlightMenuDelayLabel = document.getElementById('highlight-menu-delay-label');

      if (highlightMenuDelaySlider && highlightMenuDelayLabel) {
        // Initialize default if not set
        if (!this.settings.highlightMenu) {
          this.settings.highlightMenu = { autoHideDelay: 5000 };
        }

        // Set initial value
        const delayValue = this.settings.highlightMenu.autoHideDelay || 5000;
        highlightMenuDelaySlider.value = delayValue;
        highlightMenuDelayLabel.textContent = `${delayValue / 1000} second${delayValue === 1000 ? '' : 's'}`;

        // Add input listener
        highlightMenuDelaySlider.addEventListener('input', e => {
          const delay = parseInt(e.target.value);
          highlightMenuDelayLabel.textContent = `${delay / 1000} second${delay === 1000 ? '' : 's'}`;
          this.settings.highlightMenu.autoHideDelay = delay;
          this.saveSettings();
          // Also save to highlightMenuSettings for the feature to read
          this.saveHighlightMenuSettings();
          console.log('[Popup] Highlight Menu auto-hide delay:', delay);
        });
      }

      const btnTranslatePage = document.getElementById('btn-translate-page');
      const targetLanguageSelect = document.getElementById('translation-target-language');

      if (btnTranslatePage && targetLanguageSelect) {
        // Set initial target language from settings
        targetLanguageSelect.value = this.settings.translation?.targetLanguage || 'en';

        // Handle target language change
        targetLanguageSelect.addEventListener('change', e => {
          if (!this.settings.translation) {
            this.settings.translation = { enabled: true };
          }
          this.settings.translation.targetLanguage = e.target.value;
          this.saveSettings();
          console.log('[Popup] Translation target language:', e.target.value);
        });

        // Handle translate page button click
        this.attachInteractiveHandler(btnTranslatePage, 'Translate Page Button', async () => {
          console.log('[Popup] Translate Page button clicked');
          this.updateStatus('Translating page...', 'processing');

          const targetLang = targetLanguageSelect.value;

          try {
            // Send message to content script to trigger full-page translation
            const response = await chrome.tabs.sendMessage(this.currentTab.id, {
              type: 'TRANSLATE_PAGE',
              targetLang: targetLang,
            });

            if (response && response.success) {
              this.updateStatus('Page translated!', 'success');
            } else {
              this.updateStatus('Translation failed', 'error');
            }
          } catch (error) {
            console.error('[Popup] Translation trigger failed:', error);
            this.updateStatus('Translation error: ' + error.message, 'error');
          }
        });
      }

      // Also absent from any settings object written before 1.0 — see the maths branch above.
      this.settings.citation ??= {};

      const citationEnabled = document.getElementById('citation-enabled');
      const citationOptionsContainer = document.getElementById('citation-options-container');

      if (citationEnabled && citationOptionsContainer) {
        // Set initial state from settings
        citationEnabled.checked = this.settings.citation?.enabled !== false; // default ON from 1.0

        // Initial visibility
        if (citationEnabled.checked) {
          citationOptionsContainer.classList.remove('hidden');
        } else {
          citationOptionsContainer.classList.add('hidden');
        }

        // Handle toggle
        citationEnabled.addEventListener('change', e => {
          this.settings.citation.enabled = e.target.checked;
          this.saveSettings();

          // Toggle options visibility
          if (e.target.checked) {
            citationOptionsContainer.classList.remove('hidden');
          } else {
            citationOptionsContainer.classList.add('hidden');
          }

          console.log('[Popup] Citation enabled:', e.target.checked);
        });
      }

      const citationVerifyOnline = document.getElementById('citation-verify-online');
      if (citationVerifyOnline) {
        citationVerifyOnline.checked = this.settings.citation?.verifyOnline === true;
        // Semantic Scholar is an optional host permission (ADR 0006). The student's choice is saved
        // first, then Chrome is asked, in the same tick: its prompt shows only inside this change's
        // user gesture, and it can close the popup, which must not lose the choice. A refusal
        // while the popup is still open turns the switch back off. Switching off gives the
        // permission back.
        citationVerifyOnline.addEventListener('change', e => {
          const input = e.target;
          const on = input.checked;
          const saved = this.saveVerifyOnline(on);
          if (!on) {
            saved.then(() => releaseHostPermissions(['citationVerification']));
            return;
          }
          requestHostPermissions(originsFor(['citationVerification'])).then(async granted => {
            await saved;
            if (granted) {
              return;
            }
            input.checked = false;
            await this.saveVerifyOnline(false);
            this.updateStatus(
              'Chrome did not give AssisT access to Semantic Scholar, so online checking stays off.',
              'error'
            );
          });
        });
      }

      const btnSaveCitation = document.getElementById('btn-save-citation');

      if (btnSaveCitation) {
        this.attachInteractiveHandler(btnSaveCitation, 'Save Citation Button', async () => {
          console.log('[Popup] Save Citation button clicked');
          this.updateStatus('Extracting citation...', 'processing');

          try {
            // Send message to content script to extract and save citation
            const response = await chrome.tabs.sendMessage(this.currentTab.id, {
              type: 'SAVE_CITATION',
            });

            if (response && response.success) {
              this.updateStatus('Citation saved!', 'success');
              // Refresh citation count. Quick View is a modal dialog, so it cannot be open behind
              // this button, and it loads the list afresh each time it opens.
              await this.updateCitationCount();
            } else {
              this.updateStatus('Failed to save citation', 'error');
            }
          } catch (error) {
            console.error('[Popup] Citation save failed:', error);
            this.updateStatus('Citation error: ' + error.message, 'error');
          }
        });
      }

      const btnCitationManager = document.getElementById('btn-citation-manager');

      if (btnCitationManager) {
        this.attachInteractiveHandler(btnCitationManager, 'Citation Manager Button', async () => {
          console.log('[Popup] Citation Manager button clicked');
          try {
            // Send direct message to open bibliography manager
            const response = await chrome.tabs.sendMessage(this.currentTab.id, {
              type: 'OPEN_BIBLIOGRAPHY_MANAGER',
            });
            if (response?.success) {
              this.updateStatus('Opening Citation Library...', 'info');
              // Close popup after a brief delay
              setTimeout(() => window.close(), 300);
            } else {
              throw new Error(response?.error || 'Failed to open');
            }
          } catch (error) {
            console.error('[Popup] Error opening citation manager:', error);
            this.updateStatus('Failed to open Citation Library', 'error');
          }
        });
      }

      // How-to guide. Unlike the buttons above it this goes straight to the service worker rather
      // than through the content script: the guide is an extension page, so it does not need — and
      // must not wait on — a content script being present in the current tab.
      const btnCitationGuide = document.getElementById('btn-citation-guide');

      if (btnCitationGuide) {
        this.attachInteractiveHandler(btnCitationGuide, 'Citation Guide Button', async () => {
          try {
            await chrome.runtime.sendMessage({ type: 'OPEN_CITATION_GUIDE' });
            this.updateStatus('Opening the citation guide...', 'info');
            setTimeout(() => window.close(), 300);
          } catch (error) {
            console.error('[Popup] Error opening citation guide:', error);
            this.updateStatus('Failed to open the citation guide', 'error');
          }
        });
      }

      this.setupCitationPanel();

      // Voice selection
      const voiceSelect = document.getElementById('voice-select');
      voiceSelect.addEventListener('change', e => {
        this.settings.tts.voice = e.target.value;
        this.saveSettings();
        this.sendCommandToTab('setVoice', { voice: e.target.value });
      });

      // Rate slider
      const rateSlider = document.getElementById('rate-slider');
      const rateValue = document.getElementById('rate-value');
      rateSlider.value = this.settings?.tts?.rate || 1.0;
      rateValue.textContent = `${rateSlider.value}x`;
      rateSlider.addEventListener('input', e => {
        const rate = parseFloat(e.target.value);
        rateValue.textContent = `${rate}x`;
        this.settings.tts.rate = rate;
        this.saveSettings();
        this.sendCommandToTab('setRate', { rate });
      });

      // Pitch slider
      const pitchSlider = document.getElementById('pitch-slider');
      const pitchValue = document.getElementById('pitch-value');
      pitchSlider.value = this.settings?.tts?.pitch || 1.0;
      pitchValue.textContent = pitchSlider.value;
      pitchSlider.addEventListener('input', e => {
        const pitch = parseFloat(e.target.value);
        pitchValue.textContent = pitch;
        this.settings.tts.pitch = pitch;
        this.saveSettings();
        this.sendCommandToTab('setPitch', { pitch });
      });

      // Volume slider. It travels in whole percent, the way it reads; the engine and the stored
      // setting take a 0-1 fraction, so the conversion happens here and nowhere else.
      const volumeSlider = document.getElementById('volume-slider');
      const volumeValue = document.getElementById('volume-value');
      volumeSlider.value = Math.round((this.settings?.tts?.volume ?? 1.0) * 100);
      volumeValue.textContent = `${volumeSlider.value}%`;
      volumeSlider.addEventListener('input', e => {
        const volume = parseInt(e.target.value, 10) / 100;
        volumeValue.textContent = `${e.target.value}%`;
        this.settings.tts.volume = volume;
        this.saveSettings();
        this.sendCommandToTab('setVolume', { volume });
      });

      // Highlighting toggle
      const highlightOptionsContainer = document.getElementById('highlight-options-container');
      const highlightEnabled = document.getElementById('highlight-enabled');
      highlightEnabled.checked = this.settings?.tts?.highlightEnabled ?? true;

      // Show/hide highlight options based on highlighting enabled state
      if (highlightEnabled.checked) {
        highlightOptionsContainer.classList.remove('hidden');
      } else {
        highlightOptionsContainer.classList.add('hidden');
      }

      highlightEnabled.addEventListener('change', e => {
        this.settings.tts.highlightEnabled = e.target.checked;
        this.saveSettings();
        this.sendCommandToTab('setHighlighting', { enabled: e.target.checked });

        // Toggle highlight options visibility
        if (e.target.checked) {
          highlightOptionsContainer.classList.remove('hidden');
        } else {
          highlightOptionsContainer.classList.add('hidden');
        }
      });

      // Highlight Color
      const highlightColor = document.getElementById('highlight-color');
      highlightColor.value = this.settings?.tts?.highlightColor || '#FFEB3B';
      highlightColor.addEventListener('change', e => {
        this.settings.tts.highlightColor = e.target.value;
        this.saveSettings();
        this.sendCommandToTab('setHighlightColor', { color: e.target.value });
      });

      // Highlight Opacity
      const highlightOpacity = document.getElementById('highlight-opacity');
      const opacityValue = document.getElementById('opacity-value');
      highlightOpacity.value = Math.round((this.settings?.tts?.highlightOpacity || 0.7) * 100);
      opacityValue.textContent = `${highlightOpacity.value}%`;
      highlightOpacity.addEventListener('input', e => {
        const opacity = parseInt(e.target.value, 10) / 100;
        opacityValue.textContent = `${e.target.value}%`;
        this.settings.tts.highlightOpacity = opacity;
        this.saveSettings();
        this.sendCommandToTab('setHighlightOpacity', { opacity });
      });

      // Word-by-Word Highlighting toggle
      const wordByWordEnabled = document.getElementById('word-by-word-enabled');
      const wordHighlightModeRow = document.getElementById('word-highlight-mode-row');
      const showModeRow = show => {
        if (wordHighlightModeRow) {
          wordHighlightModeRow.style.display = show ? 'block' : 'none';
        }
      };
      wordByWordEnabled.checked = this.settings?.tts?.wordByWordEnabled || false;
      showModeRow(wordByWordEnabled.checked);
      wordByWordEnabled.addEventListener('change', e => {
        this.settings.tts.wordByWordEnabled = e.target.checked;
        this.saveSettings();
        this.sendCommandToTab('setWordByWord', { enabled: e.target.checked });
        showModeRow(e.target.checked);
      });

      // Word highlight mode (boundary events vs timer prediction)
      const savedMode = this.settings?.tts?.wordHighlightMode || 'boundary';
      const whmRadio = document.querySelector(
        `input[name="word-highlight-mode"][value="${savedMode}"]`
      );
      if (whmRadio) {
        whmRadio.checked = true;
      }
      document.querySelectorAll('input[name="word-highlight-mode"]').forEach(radio => {
        radio.addEventListener('change', e => {
          if (!this.settings.tts) {
            this.settings.tts = {};
          }
          this.settings.tts.wordHighlightMode = e.target.value;
          this.saveSettings();
          this.sendCommandToTab('setWordHighlightMode', { mode: e.target.value });
        });
      });

      // Word highlight speed slider
      const speedSlider = document.getElementById('word-highlight-speed');
      const speedValue = document.getElementById('word-highlight-speed-value');
      if (speedSlider && speedValue) {
        const savedSpeed = this.settings?.tts?.wordHighlightSpeed ?? 2.0;
        speedSlider.value = savedSpeed;
        speedValue.textContent = `${savedSpeed}×`;
        speedSlider.addEventListener('input', e => {
          const speed = parseFloat(e.target.value);
          speedValue.textContent = `${speed}×`;
          if (!this.settings.tts) {
            this.settings.tts = {};
          }
          this.settings.tts.wordHighlightSpeed = speed;
          this.saveSettings();
          this.sendCommandToTab('setWordHighlightSpeed', { speed });
        });
      }

      // Reading scope selector (paragraph / section / page)
      const readingScope = document.getElementById('reading-scope');
      if (readingScope) {
        readingScope.value = this.settings?.tts?.readingScope || 'paragraph';
        readingScope.addEventListener('change', e => {
          if (!this.settings.tts) {
            this.settings.tts = {};
          }
          this.settings.tts.readingScope = e.target.value;
          this.saveSettings();
          this.sendCommandToTab('setReadingScope', { scope: e.target.value });
        });
      }

      this.setupTextCustomization();

      this.setupReadingGuide();

      this.setupCustomCursor();

      this.setupMagnifyingLens();

      this.setupFocusMode();

      this.setupScreenOverlay();

      this.setupReducedMotion();

      this.setupMediaControl();

      // Extension UI dark mode button (in header) remains functional

      this.setupSimplify();

      this.setupReadingProgress();

      this.setupPomodoro();

      this.setupLearningDataControls();

      this.setupMindMap();

      this.setupCanvasIntegration();

      this.setupMoodleIntegration();

      this.setupGoogleClassroomIntegration();

      this.setupSTT();

      this.setupReadingMode();

      this.setupDyslexiaMode();

      this.setupAnnotations();

      this.setupAIAssist();

      this.setupCompanionSection();

      // Settings link
      this.attachInteractiveHandler(
        document.getElementById('link-settings'),
        'Settings Link',
        e => {
          e.preventDefault();
          // Open settings page (to be implemented)
          console.log('[Popup] Settings clicked');
        }
      );

      this.setupHeaderActions();

      // Text Stats main toggle
      const mainTextStatsToggle = document.getElementById('main-text-stats-toggle');
      if (mainTextStatsToggle) {
        // First paint, not first opening of Advanced Options. This switch used to take its state
        // only from loadModalSettings(), which runs when the gear is pressed — so it opened OFF
        // however it had been left, the badge stayed on the page beside it, and switching it off
        // took two presses because the first one only brought the switch into line with storage.
        // The mirror into chrome.storage.local came with it: it is what stops a stale `true` from
        // a previous install leaving the badge on pages, and it has to happen whether or not the
        // student ever opens the gear.
        const uiOverlayAtOpen = this.settings?.ui_overlay || {};
        mainTextStatsToggle.checked = uiOverlayAtOpen.show_text_stats_badge === true;
        chrome.storage.local.set({
          textStatsBadgeVisible: uiOverlayAtOpen.show_text_stats_badge === true,
          textStatsNotificationsEnabled: uiOverlayAtOpen.show_text_stats_notifications === true,
        });

        // Use 'change' (not attachInteractiveHandler/mousedown) — checkboxes need
        // the change event so .checked reflects the new state, not the pre-click state.
        mainTextStatsToggle.addEventListener('change', () => {
          const enabled = mainTextStatsToggle.checked;
          if (!this.settings.ui_overlay) {
            this.settings.ui_overlay = {};
          }
          this.settings.ui_overlay.show_text_stats_badge = enabled;
          this.settings.ui_overlay.show_text_stats_notifications = enabled;
          chrome.storage.local.set({
            textStatsBadgeVisible: enabled,
            textStatsNotificationsEnabled: enabled,
          });
          this.saveSettings();
          this.updateStatus(enabled ? 'Text stats visible' : 'Text stats hidden');
        });
      }

      // Apply the saved popup dark-mode theme on load (the control lives in Advanced Options).
      this.applyPopupThemeOnLoad();

      console.log('[Popup][setupEventListeners] ✓ Event listener setup complete');
    } catch (error) {
      console.error('[Popup][setupEventListeners] ❌ FATAL ERROR during setup:', error);
      console.error('[Popup][setupEventListeners] Error stack:', error.stack);
      throw error; // Re-throw to be caught by initialize()
    }
  }

  async resetToDefaults() {
    if (!confirm('Reset all settings to defaults? This cannot be undone.')) {
      return;
    }

    try {
      // Use the RESET_SETTINGS message type to reset via MessageRouter
      const defaults = await chrome.runtime.sendMessage({
        type: 'RESET_SETTINGS',
      });

      console.log('[Popup] Settings reset to defaults:', defaults);

      // Reload the popup to reflect changes
      window.location.reload();
    } catch (error) {
      console.error('[Popup] Error resetting settings:', error);
      alert('Failed to reset settings. Please try again.');
    }
  }

  /**
   * Wire the header's actions: the settings gear, and the overflow menu beside it.
   */
  setupHeaderActions() {
    this.headerMenu = createHeaderMenu({
      trigger: document.getElementById('btn-header-more'),
      menu: document.getElementById('header-menu'),
    });

    const actions = [
      {
        label: 'Options Button',
        id: 'btn-options-compact',
        run: () => this.showAdvancedOptions(),
      },
      {
        // WCAG 2.2 SC 3.2.6 Consistent Help: folded into the header menu, never further than one
        // press away.
        label: 'Help Button',
        id: 'menu-help',
        run: () => chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/help/help.html') }),
      },
      {
        label: 'Report a Bug Button',
        id: 'menu-report-bug',
        run: () =>
          chrome.tabs.create({
            url: 'https://github.com/Fiavaion/AssisT/issues/new?template=bug_report.md',
          }),
      },
      {
        label: 'Discovery Quiz Button',
        id: 'menu-discovery',
        run: () => {
          chrome.runtime.sendMessage({ action: 'OPEN_DISCOVERY_QUIZ' });
          window.close();
        },
      },
      {
        // resetToDefaults asks for confirmation itself, so the button must not ask a second time.
        label: 'Reset Button',
        id: 'menu-reset',
        run: () => this.resetToDefaults(),
      },
    ];

    actions.forEach(({ label, id, run }) => {
      const element = document.getElementById(id);
      if (!element) {
        return;
      }

      if (element.closest('#header-menu')) {
        // Put the menu away first, or it stays open over whatever the action just opened.
        attachAccessibleHandler(
          element,
          label,
          () => {
            this.headerMenu.close({ refocus: true });
            run();
          },
          // A full-width row swelling against the panel edge reads as a glitch; the row's hover
          // background is the feedback, and it is drawn in forced colours too.
          { enableVisualFeedback: false }
        );
        return;
      }

      this.attachInteractiveHandler(element, label, run);
    });
  }

  /**
   * Resolve and paint the popup's theme at startup.
   *
   * Two states, dark by default. An explicit choice is exactly what shows — there is no system
   * state behind it to repaint against.
   */
  async applyPopupThemeOnLoad() {
    const { preference } = await loadAndApplyTheme();
    this.themePreference = preference;
  }

  /**
   * Store and paint a theme preference, from whichever control the student used.
   * @param {'light'|'dark'} preference
   */
  async setThemePreference(preference) {
    this.themePreference = THEMES.includes(preference) ? preference : 'dark';
    await setThemePreference(this.themePreference);
    this.updateStatus(`Theme set to ${THEME_LABELS[this.themePreference].toLowerCase()}`);
    // Any other theme control on screen has to move with it.
    document.querySelectorAll('[data-theme-choice]').forEach(control => {
      control.setAttribute(
        'aria-pressed',
        String(control.dataset.themeChoice === this.themePreference)
      );
    });
    const select = document.getElementById('popup-theme-select');
    if (select && select.value !== this.themePreference) {
      select.value = this.themePreference;
    }
  }

  /**
   * Wire the theme control in Advanced Options → Preferences.
   * @param {HTMLElement} modal - The advanced options modal element
   */
  setupThemeControl(modal) {
    const select = modal.querySelector('#popup-theme-select');
    if (!select) {
      return;
    }
    select.value = this.themePreference || 'dark';
    // Selects use 'change' so the value read is the new one.
    select.addEventListener('change', () => this.setThemePreference(select.value));
  }

  /**
   * Wire the institution appearance section (Advanced Options → Preferences).
   *
   * There is deliberately no way to ENTER an institution key from the popup. The signature check
   * that stops one institution impersonating another is the whole security value of the feature,
   * and it went unexercised in CI, so for 1.0.0 the entry point is not shipped rather than shipped
   * on an unproven verification. Institutions roll AssisT out through managed policy
   * (chrome.storage.managed, see institution-resolver.readManagedToken), which is untouched by this
   * and needs no popup at all.
   *
   * What stays is the exit: a machine that already carries a locally stored key keeps its colours,
   * and this section is how a student gets back to the standard appearance. It renders only when
   * branding is actually in force from that stored key — no stored key, or a key that verifies to
   * nothing, means no section at all, so a student never meets a control with nothing behind it.
   * A managed-policy skin is not removable here because it is not removable at all from this side;
   * offering the button would be the dead control this avoids.
   *
   * @param {HTMLElement} modal - The advanced options modal element
   */
  async setupInstitutionBranding(modal) {
    const section = modal.querySelector('#institution-branding');
    const nameLine = modal.querySelector('#institution-branding-name');
    const removeBtn = modal.querySelector('#institution-branding-remove');
    const status = modal.querySelector('#institution-branding-status');
    if (!section || !nameLine || !removeBtn || !status) {
      return;
    }

    let branding = null;
    try {
      const stored = await getStoredInstitutionKey();
      branding = stored ? await resolveBrandingFromToken(stored) : null;
    } catch {
      branding = null;
    }
    // Only a skin that is actually painted earns the section (name, colour or logo in force).
    if (!branding || !(branding.name || branding.accent || branding.logo)) {
      return;
    }

    nameLine.textContent = branding.name
      ? `AssisT is showing ${branding.name}'s colours on this computer.`
      : 'AssisT is showing your institution’s colours on this computer.';
    section.hidden = false;

    this.attachInteractiveHandler(removeBtn, 'Use the standard appearance', async () => {
      try {
        await clearInstitutionKey();
        // Retire the button rather than the section: hiding the whole block would take the
        // confirmation away with it, leaving the press with no perceivable outcome. The section is
        // gone the next time Preferences opens, because nothing is stored any more.
        removeBtn.hidden = true;
        nameLine.textContent = 'AssisT is using the standard appearance.';
        status.textContent = 'Your institution’s colours have been removed.';
      } catch {
        status.textContent = 'That could not be changed just now. Try again.';
      }
    });
  }

  /**
   * Wire the settings backup controls (Advanced Options → Preferences).
   *
   * Export writes an allowlisted, secret-free JSON file; import validates it whole before applying
   * it in a single write, and hands back an undo. Both outcomes are announced through the shared
   * action tray (role="status") and left on screen in the section's own summary line, so the
   * message survives the tray's dismissal.
   *
   * @param {HTMLElement} modal - The advanced options modal element
   */
  setupSettingsPortability(modal) {
    const exportBtn = modal.querySelector('#btn-settings-export');
    const importBtn = modal.querySelector('#btn-settings-import');
    const undoBtn = modal.querySelector('#btn-settings-undo');
    const fileInput = modal.querySelector('#settings-import-input');
    const summary = modal.querySelector('#settings-portability-status');
    if (!exportBtn || !importBtn || !undoBtn || !fileInput || !summary) {
      return;
    }

    // The tray announces (role="status"); the summary line is the visible record left behind after
    // it dismisses. Only the tray is a live region, so a screen reader hears each outcome once.
    const report = (message, variant = 'info') => {
      summary.textContent = message;
      showInfoTray({ message, variant, duration: variant === 'error' ? 8000 : 6000 });
    };

    // Storage has changed underneath the open popup. Its in-memory copy of assist_settings, and the
    // pristine copy saveSettings() diffs against, both predate the restore, so the next control the
    // student touches would save the difference back and undo it. Re-reading resets both.
    const refreshInMemorySettings = async () => {
      try {
        await this.loadSettings();
      } catch (error) {
        console.error('[Settings] Could not re-read settings after a restore:', error);
      }
    };

    this.attachInteractiveHandler(exportBtn, 'Save settings to a file', async () => {
      try {
        const { json, filename, keyCount } = await exportSettings();
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        report(`Saved ${keyCount} settings to ${filename}. The file contains no API keys.`);
      } catch (error) {
        console.error('[Settings] Export failed:', error);
        report('Your settings could not be saved to a file. Nothing was changed.', 'error');
      }
    });

    // A button proxies the file input so the control carries a real label and a 44px target; the
    // input stays out of the tab order (hidden) and is opened by the button, keyboard included.
    this.attachInteractiveHandler(importBtn, 'Restore settings from a file', () => {
      fileInput.click();
    });

    // Restoring is destructive, so Undo is a real button in the panel rather than only an action on
    // a tray that times out — it stays put, is reachable by keyboard, and cannot be missed.
    let pendingUndo = null;
    this.attachInteractiveHandler(undoBtn, 'Undo the restore', async () => {
      if (!pendingUndo) {
        return;
      }
      try {
        await pendingUndo();
        pendingUndo = null;
        undoBtn.hidden = true;
        await refreshInMemorySettings();
        report('Restore undone — your previous settings are back.');
      } catch (error) {
        console.error('[Settings] Undo failed:', error);
        report('That restore could not be undone.', 'error');
      }
    });

    // File inputs report their choice through 'change', like checkboxes and selects.
    fileInput.addEventListener('change', async event => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) {
        return;
      }

      const result = await importSettingsFromFile(file);
      if (!result.ok) {
        report(result.message, 'error');
        return;
      }

      pendingUndo = result.undo;
      undoBtn.hidden = false;
      await refreshInMemorySettings();

      const skipped = result.ignored.length
        ? ` ${result.ignored.length} setting(s) this version does not use were skipped.`
        : '';
      report(
        `Restored ${result.applied.length} settings.${skipped} Close and reopen AssisT to see them, ` +
          'or use "Undo the restore" below.'
      );
    });
  }

  /**
   * Open Advanced Options, optionally on a named tab.
   *
   * The tab matters to where the keyboard lands: the dialog's initial focus is the selected tab, so
   * a caller that opened the panel and THEN switched tabs had its choice undone a tick later when
   * the trap's own focus landed. Saying which tab up front is one decision instead of two racing.
   *
   * @param {string} [tabId] - the `data-tab` value to open on
   */
  showAdvancedOptions(tabId = 'features') {
    console.log('[Popup] showAdvancedOptions called');
    // Create modal overlay
    const modal = document.createElement('div');
    modal.id = 'advanced-options-modal';
    modal.className = 'modal-overlay';
    console.log('[Popup] Modal element created:', modal);

    // Safe innerHTML: all content is extension-controlled (hardcoded, no user input)
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="advanced-options-title">Advanced Options</h2>
          <button id="modal-close" type="button" class="modal-close-btn" aria-label="Close">&times;</button>
        </div>

        <div class="modal-tabs" role="tablist" aria-label="Advanced Options sections">
          <button class="modal-tab active" type="button" role="tab" id="tab-btn-features"
                  aria-controls="tab-features" aria-selected="true" data-tab="features">Features</button>
          <button class="modal-tab" type="button" role="tab" id="tab-btn-keyboard" tabindex="-1"
                  aria-controls="tab-keyboard" aria-selected="false" data-tab="keyboard">Keyboard</button>
          <button class="modal-tab" type="button" role="tab" id="tab-btn-preferences" tabindex="-1"
                  aria-controls="tab-preferences" aria-selected="false" data-tab="preferences">Preferences</button>
          <button class="modal-tab" type="button" role="tab" id="tab-btn-ai" tabindex="-1"
                  aria-controls="tab-ai" aria-selected="false" data-tab="ai">AI</button>
          <button class="modal-tab" type="button" role="tab" id="tab-btn-your-data" tabindex="-1"
                  aria-controls="tab-your-data" aria-selected="false" data-tab="your-data">Your data</button>
        </div>

        <div class="modal-body">
          <!-- Features Tab -->
          <div id="tab-features" class="tab-content active" role="tabpanel" aria-labelledby="tab-btn-features">
            <h3>Feature Visibility</h3>
            <p class="tab-description">Choose which features appear in the main popup</p>

            <div class="feature-list">
              <div class="feature-section-header">
                <span>📖 Reading Features</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-ocr" checked>
                  <span>OCR</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-highlight-menu" checked>
                  <span>Highlight Menu</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-dictionary" checked>
                  <span>Dictionary</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-highlighting" checked>
                  <span>Text Highlighting</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-speed-presets" checked>
                  <span>Speed Presets</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-text-customization" checked>
                  <span>Text Customization</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-reading-guide" checked>
                  <span>Reading Guide</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-dyslexia-mode" checked>
                  <span>Dyslexia Reading Mode</span>
                </label>
              </div>

              <div class="feature-section-header">
                <span>🎯 Display & Visual Features</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-focus-mode" checked>
                  <span>Focus Mode</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-screen-overlay" checked>
                  <span>Screen Color Overlay</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-reduced-motion" checked>
                  <span>Reduced Motion</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-media-control" checked>
                  <span>Media Control</span>
                </label>
              </div>

              <!-- Extension popup dark mode is a toggle in the Preferences tab, not a feature-visibility item -->

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-simplify" checked>
                  <span>Simplified Interface</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-reading-progress" checked>
                  <span>Reading Progress Tracker</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-pomodoro" checked>
                  <span>Pomodoro Timer</span>
                </label>
              </div>

              <div class="feature-section-header">
                <span>✍️ Writing Features</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-stt">
                  <span>Speech-to-Text</span>
                </label>
              </div>

              <div class="feature-section-header">
                <span>📝 Annotations & Notes</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-annotations" checked>
                  <span>Annotations & Sticky Notes</span>
                </label>
              </div>

              <div class="feature-item" style="margin-left: 24px; margin-top: 8px;">
                <label class="feature-label" style="font-size: 13px; color: #666;">
                  <span>📦 Storage Mode:</span>
                </label>
                <select id="annotations-storage-mode" class="storage-mode-select" style="margin-top: 6px; padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; width: 100%; max-width: 300px;">
                  <option value="local">Chrome Local Storage (Default)</option>
                  <option value="indexeddb">IndexedDB (For large collections)</option>
                </select>
                <p style="margin: 6px 0 0 0; font-size: 12px; color: #888; line-height: 1.4;">
                  Local storage is faster but limited. IndexedDB supports unlimited annotations.
                </p>
              </div>

              <!-- Annotation Settings Section -->
              <div class="feature-item" style="margin-left: 24px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee;">
                <label class="feature-label" style="font-size: 13px; color: #666; font-weight: 500;">
                  <span>⚙️ Annotation Settings:</span>
                </label>

                <!-- Default Color -->
                <div style="margin-top: 10px;">
                  <label for="annotations-default-color" style="display: block; font-size: 12px; color: #555; margin-bottom: 6px;">
                    Default Color for New Notes
                  </label>
                  <select id="annotations-default-color" style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; width: 100%; max-width: 300px;">
                    <option value="yellow">💛 Yellow (Recommended)</option>
                    <option value="blue">💙 Blue</option>
                    <option value="green">💚 Green</option>
                    <option value="pink">💗 Pink</option>
                    <option value="purple">💜 Purple</option>
                  </select>
                </div>

                <!-- Default Note Size -->
                <div style="margin-top: 10px;">
                  <label for="annotations-default-size" style="display: block; font-size: 12px; color: #555; margin-bottom: 6px;">
                    Default Note Size
                  </label>
                  <select id="annotations-default-size" style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; width: 100%; max-width: 300px;">
                    <option value="small">📦 Small (150x100px)</option>
                    <option value="medium">📦 Medium (200x200px)</option>
                    <option value="large">📦 Large (300x250px)</option>
                  </select>
                </div>

                <!-- Auto-save Toggle -->
                <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" id="annotations-auto-save" checked style="cursor: pointer;">
                  <label for="annotations-auto-save" style="font-size: 12px; color: #555; cursor: pointer;">
                    Auto-save annotations (saves immediately on changes)
                  </label>
                </div>

                <!-- Show Badge Toggle -->
                <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" id="annotations-show-badge" checked style="cursor: pointer;">
                  <label for="annotations-show-badge" style="font-size: 12px; color: #555; cursor: pointer;">
                    Show annotation count badge
                  </label>
                </div>

                <!-- Sidebar Auto-open Toggle -->
                <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" id="annotations-sidebar-auto-open" checked style="cursor: pointer;">
                  <label for="annotations-sidebar-auto-open" style="font-size: 12px; color: #555; cursor: pointer;">
                    Auto-open sidebar on annotation click
                  </label>
                </div>
              </div>

              <div class="feature-section-header">
                <span>🌐 Translation</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-translation" checked>
                  <span>Translation Features</span>
                </label>
              </div>

              <!-- Translation Settings Section -->
              <div class="feature-item" style="margin-left: 24px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #eee;">
                <label class="feature-label" style="font-size: 13px; color: #666; font-weight: 500;">
                  <span>⚙️ Translation Settings:</span>
                </label>

                <!-- Default Target Language -->
                <div style="margin-top: 12px;">
                  <label for="translation-default-language" style="display: block; font-size: 12px; color: #555; margin-bottom: 6px;">
                    Default Target Language
                  </label>
                  <select id="translation-default-language" style="padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; width: 100%; max-width: 300px;">
                    <option value="en">English</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="it">Italian</option>
                    <option value="pt">Portuguese</option>
                    <option value="nl">Dutch</option>
                    <option value="pl">Polish</option>
                    <option value="ru">Russian</option>
                    <option value="zh">Chinese</option>
                    <option value="ja">Japanese</option>
                    <option value="ko">Korean</option>
                    <option value="ar">Arabic</option>
                    <option value="hi">Hindi</option>
                  </select>
                </div>

                <!-- Cache Toggle -->
                <div style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
                  <input type="checkbox" id="translation-cache-enabled" checked style="cursor: pointer;">
                  <label for="translation-cache-enabled" style="font-size: 12px; color: #555; cursor: pointer;">
                    Enable translation cache (faster, reduces API calls)
                  </label>
                </div>

                <!-- Cache Duration Slider -->
                <div id="translation-cache-settings" style="margin-top: 12px;">
                  <label for="translation-cache-duration" style="display: block; font-size: 12px; color: #555; margin-bottom: 6px;">
                    Cache Duration: <span id="translation-cache-duration-label">7 days</span>
                  </label>
                  <input type="range" id="translation-cache-duration" min="1" max="30" value="7" step="1" style="width: 100%; max-width: 300px;">
                </div>

                <!-- Clear Cache Button -->
                <div style="margin-top: 12px;">
                  <button id="translation-clear-cache" type="button" style="padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; font-size: 12px; color: #666;">
                    Clear Cache (<span id="translation-cache-count">0</span> items)
                  </button>
                </div>
              </div>

              <div class="feature-section-header">
                <span>🎓 School Tools & LMS Integration</span>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-citations">
                  <span>Citation Manager</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-mind-map">
                  <span>Mind Map</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-canvas-integration">
                  <span>Canvas LMS</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-moodle-integration">
                  <span>Moodle LMS</span>
                </label>
              </div>

              <div class="feature-item">
                <label class="feature-label">
                  <input type="checkbox" id="show-google-classroom-integration">
                  <span>Google Classroom</span>
                </label>
              </div>

              <div class="feature-note">
                <p><strong>Note:</strong> Core TTS controls (voice, speed, pitch, volume) are always visible and cannot be hidden.</p>
              </div>
            </div>
          </div>

          <!-- Keyboard Tab -->
          <div id="tab-keyboard" class="tab-content" role="tabpanel" aria-labelledby="tab-btn-keyboard">
            <div class="tab-header-row">
              <div>
                <h3>Keyboard Shortcuts</h3>
                <p class="tab-description">Click on a shortcut to assign a key combination</p>
              </div>
              <button id="btn-clear-all-shortcuts" class="modal-btn modal-btn-secondary">
                🗑️ Clear All
              </button>
            </div>

            <div class="shortcuts-grid" id="keyboard-shortcuts-grid">
              <!-- Shortcuts will be dynamically populated here -->
            </div>

          </div>

          <!-- Appearance Tab -->
          <!-- Preferences Tab (merged Appearance + Profiles) -->
          <div id="tab-preferences" class="tab-content" role="tabpanel" aria-labelledby="tab-btn-preferences">
            <h3>Preferences</h3>
            <p class="tab-description">Customize appearance and manage profiles</p>

            <!-- UI Preferences Section -->
            <div class="preferences-section">
              <h4>UI Preferences</h4>
              <div class="appearance-options">
                <div class="option-group">
                  <label for="popup-theme-select">Theme</label>
                  <div class="option-control">
                    <select id="popup-theme-select" class="option-select">
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                    <span class="option-desc">Dark is the default</span>
                  </div>
                </div>

                <div class="option-group">
                  <label>Compact Mode</label>
                  <div class="option-control">
                    <label class="toggle-switch-small">
                      <input type="checkbox" id="compact-mode" checked>
                      <span class="toggle-slider-small"></span>
                    </label>
                    <span class="option-desc">Minimize spacing in popup</span>
                  </div>
                </div>

                <div class="option-group">
                  <label>Show Icons</label>
                  <div class="option-control">
                    <label class="toggle-switch-small">
                      <input type="checkbox" id="show-icons" checked>
                      <span class="toggle-slider-small"></span>
                    </label>
                    <span class="option-desc">Display emoji icons in controls</span>
                  </div>
                </div>

                <div class="option-group">
                  <label>Debug Mode</label>
                  <div class="option-control">
                    <label class="toggle-switch-small">
                      <input type="checkbox" id="debug-mode">
                      <span class="toggle-slider-small"></span>
                    </label>
                    <span class="option-desc">Show console logs for debugging</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Settings Backup Section -->
            <div class="preferences-section settings-portability">
              <h4>💾 Your settings, as a file</h4>
              <p class="settings-portability-intro">
                Save the way you have AssisT set up, so you can put it back after reinstalling or on
                another computer. The file holds your settings only — never your API keys, and none
                of your citations, notes or highlights.
              </p>
              <div class="settings-portability-actions">
                <button id="btn-settings-export" type="button" class="settings-portability-btn">
                  <span aria-hidden="true">📤</span> Save settings to a file
                </button>
                <button id="btn-settings-import" type="button" class="settings-portability-btn">
                  <span aria-hidden="true">📥</span> Restore settings from a file
                </button>
                <input type="file" id="settings-import-input" accept="application/json,.json" hidden>
              </div>
              <p class="settings-portability-warning">
                Restoring replaces your current settings. You can undo it straight afterwards.
              </p>
              <p id="settings-portability-status" class="settings-portability-status"></p>
              <button id="btn-settings-undo" type="button" class="settings-portability-btn" hidden>
                <span aria-hidden="true">↩️</span> Undo the restore
              </button>
            </div>

            <!--
              Institution appearance — a way OUT of an applied skin, and nothing more. There is no
              entry point here on purpose (see setupInstitutionBranding); the whole section stays
              hidden unless this machine is actually showing an institution's colours.
            -->
            <div class="preferences-section" id="institution-branding" hidden
              style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e0e0e0;">
              <h4>🏛️ Institution appearance</h4>
              <p id="institution-branding-name" style="font-size: 13px; color: #666; margin-bottom: 12px;"></p>
              <button id="institution-branding-remove" type="button" class="modal-btn modal-btn-secondary" style="min-height:44px;">
                Use the standard appearance
              </button>
              <p id="institution-branding-status" role="status" aria-live="polite" style="font-size:12px; color:#555; margin-top:8px;"></p>
            </div>

            <!-- UI Overlay Visibility Section -->
            <div class="preferences-section" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e0e0e0;">
              <h4>🎨 UI Overlay Visibility</h4>
              <p style="font-size: 13px; color: #666; margin-bottom: 16px;">
                Control which on-page overlays and notifications are displayed. These settings help reduce visual clutter.
              </p>

              <!-- Individual Overlay Controls -->
              <div id="ui-overlay-controls" style="margin-left: 16px;">
                <div class="option-group">
                  <label>Text Stats Badge</label>
                  <div class="option-control">
                    <label class="toggle-switch-small">
                      <input type="checkbox" id="show-text-stats-badge" checked>
                      <span class="toggle-slider-small"></span>
                    </label>
                    <span class="option-desc">Show floating word count badge</span>
                  </div>
                </div>

                <div class="option-group">
                  <label>Text Stats Notifications</label>
                  <div class="option-control">
                    <label class="toggle-switch-small">
                      <input type="checkbox" id="show-text-stats-notifications" checked>
                      <span class="toggle-slider-small"></span>
                    </label>
                    <span class="option-desc">Show text statistics toasts and popups</span>
                  </div>
                </div>

                <div class="option-group">
                  <label>Feature Notifications</label>
                  <div class="option-control">
                    <label class="toggle-switch-small">
                      <input type="checkbox" id="show-feature-notifications" checked>
                      <span class="toggle-slider-small"></span>
                    </label>
                    <span class="option-desc">Show toast notifications when features activate</span>
                  </div>
                </div>

                <div class="option-group">
                  <label>AI Token Counter</label>
                  <div class="option-control">
                    <label class="toggle-switch-small">
                      <input type="checkbox" id="show-token-counter" checked>
                      <span class="toggle-slider-small"></span>
                    </label>
                    <span class="option-desc">Show AI usage token display</span>
                  </div>
                </div>

                <div class="option-group">
                  <label>Reading Progress Badge</label>
                  <div class="option-control">
                    <label class="toggle-switch-small">
                      <input type="checkbox" id="show-reading-progress-badge" checked>
                      <span class="toggle-slider-small"></span>
                    </label>
                    <span class="option-desc">Show reading progress indicator</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Profile Management Section -->
            <div class="preferences-section" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e0e0e0;">
              <h4>Profile Management</h4>
              <div class="profiles-section-modal">
              <!-- Active Profile Selection -->
              <div class="profile-select-group">
                <label for="modal-profile-select" class="profile-label">Active Profile:</label>
                <select id="modal-profile-select" class="profile-select-modal">
                  <!-- Populated dynamically -->
                </select>
              </div>

              <!-- Profile Description -->
              <div id="profile-description-modal" class="profile-description-modal">
                <p>Select a profile to see its description</p>
              </div>

              <!-- Profile Actions -->
              <div class="profile-actions-modal">
                <button id="btn-profile-save-modal" class="profile-btn profile-btn-primary" title="Save current settings to a new profile">
                  <span class="profile-btn-icon">💾</span>
                  Save Current
                </button>
                <button id="btn-profile-delete-modal" class="profile-btn profile-btn-danger" title="Delete selected profile">
                  <span class="profile-btn-icon">🗑️</span>
                  Delete
                </button>
              </div>

              <!-- Import/Export -->
              <div class="profile-io-modal">
                <h4>Import & Export</h4>
                <div class="profile-io-buttons">
                  <button id="btn-profile-export-modal" class="profile-btn profile-btn-secondary">
                    <span class="profile-btn-icon">📤</span>
                    Export All Profiles
                  </button>
                  <button id="btn-profile-import-modal" class="profile-btn profile-btn-secondary">
                    <span class="profile-btn-icon">📥</span>
                    Import Profiles
                  </button>
                  <input type="file" id="profile-import-input-modal" accept=".json" style="display: none;">
                </div>
              </div>

              <!-- Default Profiles List -->
              <div class="profile-presets-modal">
                <h4>Available Presets</h4>
                <div class="preset-list">
                  <div class="preset-item" data-preset="ADHD Focus" style="cursor: pointer;">
                    <span class="preset-icon">🎯</span>
                    <div class="preset-info">
                      <strong>ADHD Focus</strong>
                      <span>Pomodoro timer, progress tracking, simplified interface</span>
                    </div>
                  </div>
                  <div class="preset-item" data-preset="Autism Comfort" style="cursor: pointer;">
                    <span class="preset-icon">🧘</span>
                    <div class="preset-info">
                      <strong>Autism Comfort</strong>
                      <span>Reduced motion, calm colors, predictable behavior</span>
                    </div>
                  </div>
                  <div class="preset-item" data-preset="Dyslexia Support" style="cursor: pointer;">
                    <span class="preset-icon">📖</span>
                    <div class="preset-info">
                      <strong>Dyslexia Support</strong>
                      <span>OpenDyslexic font, wide spacing, reading progress</span>
                    </div>
                  </div>
                  <div class="preset-item" data-preset="Night Study" style="cursor: pointer;">
                    <span class="preset-icon">🌙</span>
                    <div class="preset-info">
                      <strong>Night Study</strong>
                      <span>Dark mode, reduced eye strain, Pomodoro timer</span>
                    </div>
                  </div>
                  <div class="preset-item" data-preset="Sensory Sensitive" style="cursor: pointer;">
                    <span class="preset-icon">🌿</span>
                    <div class="preset-info">
                      <strong>Sensory Sensitive</strong>
                      <span>No animations, muted colors, media blocking</span>
                    </div>
                  </div>
                  <div class="preset-item" data-preset="Anxiety Calm" style="cursor: pointer;">
                    <span class="preset-icon">💫</span>
                    <div class="preset-info">
                      <strong>Anxiety Calm</strong>
                      <span>Gentle pacing, focus mode, calming colors</span>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>

          <!-- AI Tab -->
          <div id="tab-ai" class="tab-content ai-tab-full" role="tabpanel" aria-labelledby="tab-btn-ai">
            <fieldset class="ai-mode-chips" id="modal-ai-mode-chips">
              <legend class="sr-only">Select AI mode</legend>
              <label class="ai-chip" data-mode="off">
                <input type="radio" name="modal-ai-quick-mode" value="off" />
                <span>Off</span>
              </label>
              <label class="ai-chip" data-mode="cloud">
                <input type="radio" name="modal-ai-quick-mode" value="cloud" />
                <span>&#x2601;&#xFE0E; Cloud</span>
              </label>
              <label class="ai-chip" data-mode="webllm">
                <input type="radio" name="modal-ai-quick-mode" value="webllm" />
                <span>&#x26A1;&#xFE0E; Browser</span>
              </label>
              <label class="ai-chip" data-mode="local">
                <input type="radio" name="modal-ai-quick-mode" value="local" />
                <span>&#x1F916; Local</span>
              </label>
            </fieldset>
            <div
              id="modal-ai-panel"
              class="ai-modal-panel"
              aria-live="polite"
              aria-atomic="false"
            ></div>
            <button id="btn-open-ai-setup-from-modal" class="modal-btn modal-btn-secondary" style="margin-top:12px; width:100%; justify-content:center;">
              Full setup wizard &#x2192;
            </button>
          </div>

          <!-- Your data Tab: filled by your-data.js -->
          <div id="tab-your-data" class="tab-content" role="tabpanel" aria-labelledby="tab-btn-your-data"></div>
        </div>

        <!-- Shortcut Recording Overlay -->
        <div id="shortcut-recording-overlay" class="recording-overlay">
          <div class="recording-box">
            <h3 class="recording-title">Record Keyboard Shortcut</h3>
            <p class="recording-subtitle">Press a key combination with at least one modifier key</p>

            <div class="recording-current">
              <span class="recording-label">Current:</span>
              <kbd id="recording-current-key" class="shortcut-display">None</kbd>
            </div>

            <div class="modifier-keys">
              <span class="modifier-key" data-key="ctrl">Ctrl</span>
              <span class="modifier-key" data-key="alt">Alt</span>
              <span class="modifier-key" data-key="shift">Shift</span>
            </div>

            <div class="recording-new">
              <span class="recording-label">New Shortcut:</span>
              <div id="recording-display" class="shortcut-display">Press keys...</div>
            </div>

            <div id="recording-error" class="recording-error"></div>

            <div class="recording-actions">
              <button id="btn-recording-clear" class="btn-secondary">Clear</button>
              <button id="btn-recording-cancel" class="btn-secondary">Cancel</button>
              <button id="btn-recording-save" class="btn-primary" disabled>Save</button>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button id="modal-save" class="modal-btn modal-btn-primary">Save Changes</button>
          <button id="modal-cancel" class="modal-btn modal-btn-secondary">Cancel</button>
        </div>
      </div>
    `;

    // A real dialog, not a div over the popup. Opened by hand it had no role, no name and no
    // trap: a screen reader announced nothing, fourteen Tab presses walked out into the controls
    // behind it, and Escape left it open with focus dropped somewhere underneath. The shared
    // helper names it, traps Tab, closes on Escape and on a press outside, appends it to the
    // document — which every `document.getElementById` in the loaders below depends on — and hands
    // the keyboard back to the gear on the way out: the compact header's, the one on screen.
    const closeModal = this.openPopupDialog({
      backdrop: modal,
      dialog: modal.querySelector('.modal-content'),
      labelledBy: 'advanced-options-title',
      opener: document.getElementById('btn-options-compact'),
      initialFocus: modal.querySelector(`#tab-btn-${tabId}`) || modal.querySelector('.modal-tab'),
    });
    this.closeAdvancedOptions = () => {
      this.closeAdvancedOptions = null;
      closeModal();
    };
    console.log('[Popup] Modal appended to body');

    // Setup tab switching
    this.setupModalTabs(modal);
    if (tabId !== 'features') {
      this.openModalTab(tabId);
    }
    console.log('[Popup] Modal tabs setup complete');

    // Setup modal actions
    this.setupModalActions(modal);

    // Wire the Dark Mode toggle (Preferences tab; applies + persists live)
    this.setupThemeControl(modal);

    // Wire the settings backup controls (Preferences tab)
    this.setupSettingsPortability(modal);

    // Wire the institution appearance section (Preferences tab)
    this.setupInstitutionBranding(modal);

    // Load current settings into modal
    this.loadModalSettings();

    // Setup profiles tab
    this.setupProfilesTab(modal);

    // Setup AI tab
    console.log('[Popup] About to call setupAITab');
    this.setupAITab(modal);
    console.log('[Popup] setupAITab complete');

    this.setupYourDataTab(modal);
  }

  /**
   * The Your data tab: what AssisT may send to online services, and the stored AI keys.
   *
   * A removed key must not linger in an AI panel already on screen, where Save would put it
   * straight back, so any panel showing that provider has its key field emptied.
   *
   * @param {HTMLElement} modal
   */
  setupYourDataTab(modal) {
    const panel = modal.querySelector('#tab-your-data');
    if (!panel) {
      return;
    }
    renderYourData(panel, {
      // Your data wrote the switch off already; the popup's own copy follows, so the two agree
      // and the next save does not put it back.
      onVerifyOnlineOff: () => {
        [this.settings, this.pristineSettings].forEach(settings => {
          if (settings) {
            settings.citation = { ...(settings.citation || {}), verifyOnline: false };
          }
        });
        const verifySwitch = document.getElementById('citation-verify-online');
        if (verifySwitch) {
          verifySwitch.checked = false;
        }
      },
      onKeyRemoved: provider => {
        document.querySelectorAll('.ai-panel-key-input').forEach(input => {
          const scope = input.closest('.ai-panel-row')?.parentElement;
          const select = scope?.querySelector('select[aria-label="Cloud AI provider"]');
          if (select && select.value === provider) {
            input.value = '';
          }
        });
      },
    }).catch(error => console.error('[Popup] Your data could not be shown:', error));
  }

  /**
   * Setup the Profiles tab in the advanced settings modal
   * @param {HTMLElement} modal - The modal element
   */
  setupProfilesTab(modal) {
    // Populate the profile selector
    this.populateModalProfileSelector(modal);

    // Profile selector change handler
    const profileSelect = modal.querySelector('#modal-profile-select');
    if (profileSelect) {
      profileSelect.addEventListener('change', e => {
        this.profiles_loadProfile(e.target.value);
        this.updateProfileDescription(modal, e.target.value);
      });
    }

    // Save profile button
    const saveBtn = modal.querySelector('#btn-profile-save-modal');
    if (saveBtn) {
      this.attachInteractiveHandler(saveBtn, 'Profile Save Button', () => {
        this.profiles_showSaveModal();
        // Refresh selector after save
        setTimeout(() => this.populateModalProfileSelector(modal), 500);
      });
    }

    // Delete profile button
    const deleteBtn = modal.querySelector('#btn-profile-delete-modal');
    if (deleteBtn) {
      this.attachInteractiveHandler(deleteBtn, 'Profile Delete Button', () => {
        this.profiles_confirmDelete();
        // Refresh selector after delete
        setTimeout(() => this.populateModalProfileSelector(modal), 500);
      });
    }

    // Export profiles button
    const exportBtn = modal.querySelector('#btn-profile-export-modal');
    if (exportBtn) {
      this.attachInteractiveHandler(exportBtn, 'Profile Export Button', () => {
        this.profiles_export();
      });
    }

    // Import profiles button
    const importBtn = modal.querySelector('#btn-profile-import-modal');
    const importInput = modal.querySelector('#profile-import-input-modal');
    if (importBtn && importInput) {
      this.attachInteractiveHandler(importBtn, 'Profile Import Button', () => {
        importInput.click();
      });

      importInput.addEventListener('change', async e => {
        if (e.target.files[0]) {
          await this.profiles_import(e.target.files[0]);
          this.populateModalProfileSelector(modal);
          e.target.value = ''; // Reset file input
        }
      });
    }

    // Preset profile click handlers
    const presetItems = modal.querySelectorAll('.preset-item[data-preset]');
    presetItems.forEach(item => {
      this.attachInteractiveHandler(item, 'Preset Profile Item', () => {
        const presetName = item.getAttribute('data-preset');
        if (
          confirm(
            `Load the "${presetName}" preset profile?\n\nThis will apply all settings from this preset.`
          )
        ) {
          this.profiles_loadProfile(presetName);
          // Update the profile selector to show the loaded preset
          const profileSelect = modal.querySelector('#modal-profile-select');
          if (profileSelect) {
            profileSelect.value = presetName;
            this.updateProfileDescription(modal, presetName);
          }
        }
      });

      // Add hover effect
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#f0f0f0';
      });
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = '';
      });
    });

    // Initialize profile description
    const currentProfile = this.currentProfileName || 'Default';
    this.updateProfileDescription(modal, currentProfile);
  }

  /**
   * Populate the profile selector in the modal
   * @param {HTMLElement} modal - The modal element
   */
  populateModalProfileSelector(modal) {
    const selector = modal.querySelector('#modal-profile-select');
    if (!selector) {
      return;
    }

    // Get profiles from storage
    chrome.storage.local.get('assist_profiles', result => {
      const profiles = result.assist_profiles || this.profiles_createDefaults();
      const currentProfile = this.currentProfileName || 'Default';

      selector.innerHTML = sanitizeHTML('');

      Object.entries(profiles).forEach(([name, profile]) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = profile.displayName || name;
        if (name === currentProfile) {
          option.selected = true;
        }
        selector.appendChild(option);
      });
    });
  }

  /**
   * Update the profile description in the modal
   * @param {HTMLElement} modal - The modal element
   * @param {string} profileName - The selected profile name
   */
  updateProfileDescription(modal, profileName) {
    const descriptionEl = modal.querySelector('#profile-description-modal p');
    if (!descriptionEl) {
      return;
    }

    chrome.storage.local.get('assist_profiles', result => {
      const profiles = result.assist_profiles || {};
      const profile = profiles[profileName];

      if (profile && profile.description) {
        descriptionEl.textContent = profile.description;
      } else {
        // Default descriptions for built-in profiles
        const defaultDescriptions = {
          Default: 'Standard settings with all features available.',
          'ADHD Focus':
            'Optimized for focus and productivity with Pomodoro timer, progress tracking, and simplified interface.',
          'Autism Comfort':
            'Calm, predictable environment with reduced motion, gentle colors, and consistent behavior.',
          'Dyslexia Support':
            'Enhanced readability with OpenDyslexic font, increased spacing, and reading progress indicator.',
          'Sensory Sensitive':
            'Minimal sensory input with no animations, muted colors, and auto-playing media blocked.',
          'Night Study':
            'Reduced eye strain with screen overlay, warm colors, and Pomodoro timer for study sessions.',
          'Anxiety Calm':
            'Gentle, non-overwhelming interface with calm colors and predictable interactions.',
        };
        descriptionEl.textContent =
          defaultDescriptions[profileName] || 'Custom profile with user-defined settings.';
      }
    });
  }

  /**
   * Setup the AI tab in the advanced settings modal.
   * Renders the same inline mode-chip switcher as the popup AI Assist section,
   * plus a link to the full setup wizard.
   * @param {HTMLElement} modal - The modal element
   */
  setupAITab(modal) {
    const chipsEl = modal.querySelector('#modal-ai-mode-chips');
    const panelEl = modal.querySelector('#modal-ai-panel');
    const wizardBtn = modal.querySelector('#btn-open-ai-setup-from-modal');

    if (!chipsEl || !panelEl) {
      console.warn('[Popup] Modal AI tab elements not found');
      return;
    }

    const selectChip = mode => {
      chipsEl.querySelectorAll('input[type="radio"]').forEach(r => {
        r.checked = r.value === mode;
      });
    };

    const renderPanel = async mode => {
      panelEl.innerHTML = '';
      if (mode === 'off') {
        panelEl.innerHTML =
          '<p class="ai-panel-off-msg">AI features are disabled. Select a mode above to enable AI tools.</p>';
        return;
      }
      if (mode === 'cloud') {
        await this._renderCloudPanel(panelEl, true);
        return;
      }
      if (mode === 'webllm') {
        await this._renderWebLLMPanel(panelEl, true);
        return;
      }
      if (mode === 'local') {
        await this._renderLocalPanel(panelEl, true);
        return;
      }
    };

    // Wire chip change handlers
    chipsEl.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', async () => {
        if (!radio.checked) {
          return;
        }
        const newMode = radio.value;
        if (newMode === 'local') {
          await ensureOllamaPermission();
        }
        chrome.storage.local.set({
          aiMode: newMode,
          llmEnabled: newMode === 'local',
          cloudModeEnabled: newMode === 'cloud',
          webllmEnabled: newMode === 'webllm',
        });
        await renderPanel(newMode);
      });
    });

    // Wizard link — also resets the CTA dismiss flag so popup CTA reappears
    if (wizardBtn) {
      this.attachInteractiveHandler(wizardBtn, 'Open AI Setup Wizard', () => {
        chrome.storage.local.remove('aiSetupDismissed');
        chrome.runtime.sendMessage({ action: 'OPEN_AI_SETUP' });
        modal.remove();
      });
    }

    // Initial render
    chrome.storage.local.get(['aiMode', 'llmEnabled', 'cloudModeEnabled'], result => {
      let mode = result.aiMode || 'off';
      if (!result.aiMode) {
        if (result.cloudModeEnabled) {
          mode = 'cloud';
        } else if (result.llmEnabled) {
          mode = 'local';
        }
      }
      selectChip(mode);
      renderPanel(mode);
    });
  }

  /**
   * Switch to Local AI mode
   * @param {HTMLElement} modal - The modal element
   */

  showInstallModelDialog() {
    const modelName = prompt(`Enter model name to install (e.g., ${DEFAULT_CHAT_MODEL}):`);
    if (modelName) {
      alert(
        `Installing model: ${modelName}\n\nRun this in your terminal:\n\nollama pull ${modelName}`
      );
    }
  }

  /**
   * Wire the Advanced Options tabs as a real tablist.
   *
   * They were four buttons with a class on the chosen one: nothing said they were tabs, nothing
   * said which was selected, all four sat in the tab order, and the arrow keys did nothing. The
   * roles and `aria-selected` are written into the markup; this adds the two behaviours a tablist
   * has to have — one tab stop for the whole strip, and the arrow keys moving between them.
   *
   * Activation follows the arrow key (the ARIA pattern for a tablist whose panels are already in
   * the document), so a student arrowing along the strip sees each panel as they reach it.
   *
   * @param {HTMLElement} modal
   */
  setupModalTabs(modal) {
    const tabs = [...modal.querySelectorAll('.modal-tab')];
    const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

    tabs.forEach(tab => {
      this.attachInteractiveHandler(tab, 'Modal Tab', () =>
        this.openModalTab(tab.getAttribute('data-tab'))
      );
    });

    const tablist = modal.querySelector('.modal-tabs');
    if (!tablist) {
      return;
    }
    tablist.addEventListener('keydown', event => {
      const at = tabs.indexOf(event.target);
      if (at === -1) {
        return;
      }
      let next = null;
      if (steps[event.key] !== undefined) {
        next = tabs[(at + steps[event.key] + tabs.length) % tabs.length];
      } else if (event.key === 'Home') {
        next = tabs[0];
      } else if (event.key === 'End') {
        next = tabs[tabs.length - 1];
      }
      if (!next) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.openModalTab(next.getAttribute('data-tab'));
    });
  }

  /**
   * The Advanced Options buttons. Every one of them closes through the dialog's own closer, so
   * focus goes back to the gear whichever way the student left — Escape, Close, Cancel, Save, or
   * a press on the backdrop, which `openPopupDialog` already owns.
   *
   * @param {HTMLElement} modal
   */
  setupModalActions(modal) {
    const close = () => {
      if (this.closeAdvancedOptions) {
        this.closeAdvancedOptions();
      } else {
        modal.remove();
      }
    };

    this.attachInteractiveHandler(modal.querySelector('#modal-close'), 'Modal Close Button', close);

    this.attachInteractiveHandler(
      modal.querySelector('#modal-cancel'),
      'Modal Cancel Button',
      close
    );

    this.attachInteractiveHandler(modal.querySelector('#modal-save'), 'Modal Save Button', () => {
      this.saveModalSettings();
      close();
    });
  }

  loadModalSettings() {
    // Load UI visibility settings
    const visibility = this.settings.ui_visibility || {};

    // Helper function to load checkbox state
    const loadCheckbox = (id, visibilityKey, defaultValue = true) => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        // Use explicit value if set, otherwise use defaultValue
        checkbox.checked =
          visibility[visibilityKey] !== undefined ? visibility[visibilityKey] : defaultValue;
      }
    };

    // Load all feature visibility checkboxes (most default to true)
    loadCheckbox('show-ocr', 'show_ocr'); // OCR
    loadCheckbox('show-highlight-menu', 'show_highlight_menu'); // Highlight Menu
    loadCheckbox('show-dictionary', 'show_dictionary'); // Dictionary
    loadCheckbox('show-highlighting', 'show_highlighting');
    loadCheckbox('show-speed-presets', 'show_speed_presets');
    loadCheckbox('show-text-customization', 'show_text_customization');
    loadCheckbox('show-reading-guide', 'show_reading_guide');
    loadCheckbox('show-focus-mode', 'show_focus_mode');
    loadCheckbox('show-stt', 'show_stt', true);
    loadCheckbox('show-screen-overlay', 'show_screen_overlay');
    loadCheckbox('show-canvas-integration', 'show_canvas_integration', true); // visible by default from 1.0
    loadCheckbox('show-moodle-integration', 'show_moodle_integration', true); // visible by default from 1.0
    loadCheckbox('show-google-classroom-integration', 'show_google_classroom_integration', true); // visible by default from 1.0
    loadCheckbox('show-dyslexia-mode', 'show_dyslexia_mode');
    loadCheckbox('show-annotations', 'show_annotations'); // Annotations
    loadCheckbox('show-citations', 'show_citations', true); // Citations — visible by default from 1.0
    loadCheckbox('show-mind-map', 'show_mind_map', true); // Mind Map — visible by default
    // Dark Mode feature removed - extension UI dark mode remains in popup header
    loadCheckbox('show-simplify', 'show_simplify'); // Simplified Interface
    loadCheckbox('show-reading-progress', 'show_reading_progress'); // Reading Progress Tracker
    loadCheckbox('show-pomodoro', 'show_pomodoro'); // Pomodoro Timer
    loadCheckbox('show-reduced-motion', 'show_reduced_motion'); // Reduced Motion
    loadCheckbox('show-media-control', 'show_media_control'); // Media Control

    // Load annotations storage mode
    const storageMode = document.getElementById('annotations-storage-mode');
    if (storageMode) {
      const currentMode = this.settings.annotations?.storageMode || 'local';
      storageMode.value = currentMode;

      // Track the last committed mode
      let committedMode = currentMode;

      storageMode.addEventListener('change', async e => {
        const newMode = e.target.value;

        debugLog('[Popup] annotation storage mode change:', { committedMode, newMode });

        // If mode actually changed, trigger migration
        if (newMode !== committedMode) {
          // Revert dropdown to old value while migration runs
          e.target.value = committedMode;

          // Run migration
          await this.handleStorageMigration(committedMode, newMode);

          // Migration updates settings, so update our committed tracking
          committedMode = newMode;

          // Update dropdown to new value after successful migration
          e.target.value = newMode;
        }
      });
    }

    // Initialize annotation settings if they don't exist
    if (!this.settings.annotations) {
      this.settings.annotations = {
        storageMode: 'local',
        defaultColor: 'yellow',
        defaultNoteSize: 'medium',
        autoSave: true,
        showBadge: true,
        sidebarAutoOpen: true,
      };
    }

    // Load Default Color setting
    const defaultColorSelect = document.getElementById('annotations-default-color');
    if (defaultColorSelect) {
      defaultColorSelect.value = this.settings.annotations.defaultColor || 'yellow';
      defaultColorSelect.addEventListener('change', e => {
        this.settings.annotations.defaultColor = e.target.value;
        this.saveSettings();
        console.log('[Popup] Annotation default color changed to:', e.target.value);
      });
    }

    // Load Default Note Size setting
    const defaultSizeSelect = document.getElementById('annotations-default-size');
    if (defaultSizeSelect) {
      defaultSizeSelect.value = this.settings.annotations.defaultNoteSize || 'medium';
      defaultSizeSelect.addEventListener('change', e => {
        this.settings.annotations.defaultNoteSize = e.target.value;
        this.saveSettings();
        console.log('[Popup] Annotation default size changed to:', e.target.value);
      });
    }

    // Load Auto-save Toggle
    const autoSaveToggle = document.getElementById('annotations-auto-save');
    if (autoSaveToggle) {
      autoSaveToggle.checked = this.settings.annotations.autoSave !== false;
      autoSaveToggle.addEventListener('change', e => {
        this.settings.annotations.autoSave = e.target.checked;
        this.saveSettings();
        console.log('[Popup] Annotation auto-save:', e.target.checked);
      });
    }

    // Load Show Badge Toggle
    const showBadgeToggle = document.getElementById('annotations-show-badge');
    if (showBadgeToggle) {
      showBadgeToggle.checked = this.settings.annotations.showBadge !== false;
      showBadgeToggle.addEventListener('change', e => {
        this.settings.annotations.showBadge = e.target.checked;
        this.saveSettings();
        console.log('[Popup] Annotation show badge:', e.target.checked);
      });
    }

    // Load Sidebar Auto-open Toggle
    const sidebarAutoOpenToggle = document.getElementById('annotations-sidebar-auto-open');
    if (sidebarAutoOpenToggle) {
      sidebarAutoOpenToggle.checked = this.settings.annotations.sidebarAutoOpen !== false;
      sidebarAutoOpenToggle.addEventListener('change', e => {
        this.settings.annotations.sidebarAutoOpen = e.target.checked;
        this.saveSettings();
        console.log('[Popup] Annotation sidebar auto-open:', e.target.checked);
      });
    }

    // Load translation visibility toggle
    loadCheckbox('show-translation', 'show_translation');

    // Initialize translation settings if they don't exist
    if (!this.settings.translationSettings) {
      this.settings.translationSettings = {
        cacheEnabled: true,
        cacheDuration: 7,
        defaultTargetLanguage: 'en',
      };
    }

    // Load default target language
    const defaultLanguageSelect = document.getElementById('translation-default-language');
    if (defaultLanguageSelect) {
      defaultLanguageSelect.value = this.settings.translationSettings.defaultTargetLanguage || 'en';

      defaultLanguageSelect.addEventListener('change', e => {
        this.settings.translationSettings.defaultTargetLanguage = e.target.value;
        this.saveSettings();
        console.log('[Popup] Translation default target language:', e.target.value);
      });
    }

    // Load cache enabled toggle
    const cacheEnabledToggle = document.getElementById('translation-cache-enabled');
    const cacheSettingsDiv = document.getElementById('translation-cache-settings');

    if (cacheEnabledToggle) {
      cacheEnabledToggle.checked = this.settings.translationSettings.cacheEnabled !== false;

      // Show/hide cache settings based on toggle
      if (cacheSettingsDiv) {
        cacheSettingsDiv.style.display = cacheEnabledToggle.checked ? 'block' : 'none';
      }

      cacheEnabledToggle.addEventListener('change', e => {
        this.settings.translationSettings.cacheEnabled = e.target.checked;
        if (cacheSettingsDiv) {
          cacheSettingsDiv.style.display = e.target.checked ? 'block' : 'none';
        }
        this.saveSettings();
        console.log('[Popup] Translation cache enabled:', e.target.checked);
      });
    }

    // Load cache duration slider
    const cacheDurationSlider = document.getElementById('translation-cache-duration');
    const cacheDurationLabel = document.getElementById('translation-cache-duration-label');

    if (cacheDurationSlider && cacheDurationLabel) {
      const duration = this.settings.translationSettings.cacheDuration || 7;
      cacheDurationSlider.value = duration;
      cacheDurationLabel.textContent = `${duration} day${duration === 1 ? '' : 's'}`;

      cacheDurationSlider.addEventListener('input', e => {
        const days = parseInt(e.target.value);
        cacheDurationLabel.textContent = `${days} day${days === 1 ? '' : 's'}`;
        this.settings.translationSettings.cacheDuration = days;
        this.saveSettings();
        console.log('[Popup] Translation cache duration:', days);
      });
    }

    // Load cache count and clear cache button
    const clearCacheButton = document.getElementById('translation-clear-cache');
    const cacheCountSpan = document.getElementById('translation-cache-count');

    if (clearCacheButton && cacheCountSpan) {
      // Get cache count from storage
      chrome.storage.local.get('translationCache', result => {
        const cacheCount = result.translationCache
          ? Object.keys(result.translationCache).length
          : 0;
        cacheCountSpan.textContent = cacheCount;
      });

      this.attachInteractiveHandler(
        clearCacheButton,
        'Clear Translation Cache Button',
        async () => {
          await chrome.storage.local.set({ translationCache: {} });
          cacheCountSpan.textContent = '0';
          console.log('[Popup] Translation cache cleared');
          alert('Translation cache cleared successfully!');
        }
      );
    }

    // Appearance settings
    const compactMode = document.getElementById('compact-mode');
    if (compactMode) {
      compactMode.checked = this.settings.appearance?.compact_mode !== false;
    }

    const showIcons = document.getElementById('show-icons');
    if (showIcons) {
      showIcons.checked = this.settings.appearance?.show_icons !== false;
    }

    const debugMode = document.getElementById('debug-mode');
    if (debugMode) {
      debugMode.checked = this.settings.appearance?.debug_mode === true;
    }

    // Load UI overlay visibility settings
    const uiOverlay = this.settings.ui_overlay || {};

    // The main popup's own Show Text Stats switch is NOT loaded here. It is on screen from the
    // moment the popup opens, so it is brought into line with storage at first paint instead —
    // see setupEventListeners(). Syncing a visible control from a modal's loader is what made it
    // read OFF whatever had been saved.

    const showTextStatsBadge = document.getElementById('show-text-stats-badge');
    if (showTextStatsBadge) {
      showTextStatsBadge.checked = uiOverlay.show_text_stats_badge === true;
    }

    const showTextStatsNotifications = document.getElementById('show-text-stats-notifications');
    if (showTextStatsNotifications) {
      showTextStatsNotifications.checked = uiOverlay.show_text_stats_notifications === true;
    }

    const showFeatureNotifications = document.getElementById('show-feature-notifications');
    if (showFeatureNotifications) {
      showFeatureNotifications.checked = uiOverlay.show_feature_notifications !== false;
    }

    const showTokenCounter = document.getElementById('show-token-counter');
    if (showTokenCounter) {
      showTokenCounter.checked = uiOverlay.show_token_counter !== false;
    }

    const showReadingProgressBadge = document.getElementById('show-reading-progress-badge');
    if (showReadingProgressBadge) {
      showReadingProgressBadge.checked = uiOverlay.show_reading_progress_badge !== false;
    }

    // Load keyboard shortcuts
    this.loadKeyboardShortcuts();
  }

  /**
   * Inject shortcut badge elements into toggle labels in the main popup.
   * Reads current shortcuts from storage and inserts small <kbd> chips.
   * Called on init and whenever shortcuts are updated in settings.
   */
  async injectShortcutBadges() {
    const shortcuts = await loadShortcuts();

    const isMac = navigator.platform.startsWith('Mac');

    /**
     * A binding as this keyboard writes it — Mac keycaps rather than the words.
     * @param {string} shortcut
     * @returns {string}
     */
    const forDisplay = shortcut =>
      isMac
        ? shortcut
            .replace(/\bCtrl\b/g, '⌃')
            .replace(/\bAlt\b/g, '⌥')
            .replace(/\bShift\b/g, '⇧')
            .replace(/\+/g, '')
        : shortcut;

    // Maps shortcut key → the label[for] selector of the corresponding toggle
    const BADGE_TARGETS = {
      tts_play_pause: 'label[for="tts-enabled"]',
      reading_mode_toggle: 'label[for="reading-mode-enabled"]',
      ocr_activate: 'label[for="ocr-enabled"]',
      highlight_menu_toggle: 'label[for="highlight-menu-enabled"]',
      sticky_note_create: 'label[for="annotations-enabled"]',
      stt_dictate: 'label[for="stt-enabled"]',
      focus_mode_toggle: 'label[for="focus-mode-enabled"]',
      reading_guide_toggle: 'label[for="reading-guide-enabled"]',
      screen_overlay_toggle: 'label[for="screen-overlay-enabled"]',
      dyslexia_mode_toggle: 'label[for="dyslexia-mode-enabled"]',
      open_mind_map: 'label[for="mind-map-enabled"]',
    };

    for (const [key, selector] of Object.entries(BADGE_TARGETS)) {
      const label = document.querySelector(selector);
      if (!label) {
        continue;
      }

      // Remove any existing badge so re-injection is idempotent
      label.querySelector('.shortcut-badge')?.remove();

      const shortcut = shortcuts[key];
      if (!shortcut) {
        continue;
      }

      const display = forDisplay(shortcut);
      const labelText = label.querySelector('.label-text');
      if (!labelText) {
        continue;
      }

      const badge = document.createElement('kbd');
      badge.className = 'shortcut-badge';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = display;
      labelText.appendChild(badge);
    }

    // "Show Microphone Button" says what happens when it is off, and has to name the key the
    // student actually has — the one written into popup.html is only the shipped default.
    const dictationHint = document.getElementById('stt-floating-button-hint');
    if (dictationHint) {
      const dictation = shortcuts.stt_dictate;
      dictationHint.textContent = dictation
        ? `Turn this off and voice typing is still there: press ${forDisplay(dictation)} in ` +
          'any text box to start or stop dictation.'
        : 'No dictation shortcut is set, so the microphone button is the only way to start ' +
          'voice typing. Give it a key under Keyboard Shortcuts.';
    }
  }

  async loadKeyboardShortcuts() {
    const shortcuts = await loadShortcuts();
    const grid = document.getElementById('keyboard-shortcuts-grid');

    if (!grid) {
      console.warn('[Popup] Keyboard shortcuts grid not found');
      return;
    }

    // Shortcut categories for grouping
    const categories = {
      tts_play_pause: 'TTS Controls',
      tts_stop: 'TTS Controls',
      ocr_activate: 'Reading',
      reading_mode_toggle: 'Reading',
      reading_mode_exit: 'Reading',
      dictionary_lookup: 'Lookup Tools',
      text_stats_toggle: 'Reading',
      highlight_menu_toggle: 'Lookup Tools',
      sticky_note_create: 'Writing',
      stt_dictate: 'Writing',
      translation_toggle: 'Lookup Tools',
      focus_mode_toggle: 'Display',
      reading_guide_toggle: 'Display',
      screen_overlay_toggle: 'Display',
      dyslexia_mode_toggle: 'Display',
      open_mind_map: 'Study',
    };

    // Clear existing cards
    grid.innerHTML = sanitizeHTML('');

    // Gathered under headings, because this list doubled when the mind map editor's own keys joined
    // the registry. Thirty undifferentiated rows is a worse thing to read than eighteen, and reading
    // is the whole point of this product. A heading per group also gives a screen reader something to
    // jump between, instead of thirty rows that all sound alike.
    const groupOf = key => categories[key] || (key.startsWith('mm_') ? 'Mind map' : 'General');
    const order = ['TTS Controls', 'Reading', 'Writing', 'Lookup Tools', 'Display', 'Study'];
    const rank = name => {
      const at = order.indexOf(name);
      // Anything unlisted sorts after the known groups; "Mind map" last, as its own page's keys.
      return at === -1 ? (name === 'Mind map' ? order.length + 1 : order.length) : at;
    };
    const entries = Object.entries(shortcuts).sort(
      ([a], [b]) => rank(groupOf(a)) - rank(groupOf(b))
    );

    let lastGroup = null;

    // Create a card for each shortcut
    for (const [key, shortcut] of entries) {
      const group = groupOf(key);
      if (group !== lastGroup) {
        const heading = document.createElement('h4');
        heading.className = 'shortcut-group-heading';
        heading.textContent = group;
        grid.appendChild(heading);
        lastGroup = group;
      }

      const card = document.createElement('div');
      card.className = 'shortcut-card';
      card.setAttribute('data-shortcut', key);

      const displayShortcut = shortcut || 'Not set';
      const isEmpty = !shortcut;

      card.innerHTML = sanitizeHTML(`
        <div class="shortcut-info">
          <span class="shortcut-name">${SHORTCUT_LABELS[key] || key}</span>
          <span class="shortcut-category">${categories[key] || 'General'}</span>
        </div>
        <kbd class="shortcut-key${isEmpty ? ' empty' : ''}">${displayShortcut}</kbd>
        <div class="shortcut-actions">
          <button class="shortcut-edit-btn" data-key="${key}" title="Click to assign shortcut">✏️</button>
          ${!isEmpty ? `<button class="shortcut-clear-btn" data-key="${key}" title="Clear shortcut">✕</button>` : ''}
        </div>
      `);

      grid.appendChild(card);
    }

    // Add event listeners to edit buttons
    grid.querySelectorAll('.shortcut-edit-btn').forEach(btn => {
      this.attachInteractiveHandler(btn, 'Shortcut Edit Button', e => {
        const key = e.currentTarget.getAttribute('data-key');
        this.startShortcutRecording(key, shortcuts);
      });
    });

    // Add event listeners to clear buttons
    grid.querySelectorAll('.shortcut-clear-btn').forEach(btn => {
      this.attachInteractiveHandler(btn, 'Shortcut Clear Button', async e => {
        const key = e.currentTarget.getAttribute('data-key');
        shortcuts[key] = '';
        await saveShortcuts(shortcuts);
        this.loadKeyboardShortcuts();
        this.injectShortcutBadges();
        this.updateStatus(`Cleared shortcut: ${SHORTCUT_LABELS[key]}`);
      });
    });

    // Clear all shortcuts button
    const clearAllBtn = document.getElementById('btn-clear-all-shortcuts');
    if (clearAllBtn) {
      this.attachInteractiveHandler(clearAllBtn, 'Clear All Shortcuts Button', async () => {
        if (confirm('Clear all keyboard shortcuts? This cannot be undone.')) {
          const emptyShortcuts = {};
          for (const key of Object.keys(shortcuts)) {
            emptyShortcuts[key] = '';
          }
          await saveShortcuts(emptyShortcuts);
          this.loadKeyboardShortcuts();
          this.injectShortcutBadges();
          this.updateStatus('All shortcuts cleared');
        }
      });
    }

    // Setup preset buttons
    this.setupShortcutPresets();
  }

  /**
   * Setup shortcut preset buttons
   */
  setupShortcutPresets() {
    const presetBtns = document.querySelectorAll('.preset-btn');

    presetBtns.forEach(btn => {
      this.attachInteractiveHandler(btn, 'Shortcut Preset Button', async e => {
        const preset = e.target.getAttribute('data-preset');

        // Update active state
        presetBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        // Apply preset
        await this.applyShortcutPreset(preset);
      });
    });
  }

  /**
   * Apply a shortcut preset
   * @param {string} preset - Preset name (default, minimal, oneHanded)
   */
  async applyShortcutPreset(preset) {
    const selectedPreset = SHORTCUT_PRESETS[preset];
    if (!selectedPreset) {
      return;
    }

    // A preset covers every registry key, so it replaces the saved set rather than merging into it.
    await saveShortcuts({ ...selectedPreset });

    // Reload the shortcuts display and refresh inline badges
    this.loadKeyboardShortcuts();
    this.injectShortcutBadges();
    this.updateStatus(`Applied "${preset}" shortcut preset`);
  }

  startShortcutRecording(featureKey, currentShortcuts) {
    const overlay = document.getElementById('shortcut-recording-overlay');
    const display = document.getElementById('recording-display');
    const currentKeyDisplay = document.getElementById('recording-current-key');
    const errorDiv = document.getElementById('recording-error');
    const saveBtn = document.getElementById('btn-recording-save');
    const cancelBtn = document.getElementById('btn-recording-cancel');
    const clearBtn = document.getElementById('btn-recording-clear');
    const modifierKeys = document.querySelectorAll('.modifier-key');

    if (!overlay) {
      return;
    }

    // Show overlay with active class
    overlay.classList.add('active');

    // Show current shortcut
    const currentShortcut = currentShortcuts[featureKey] || 'None';
    if (currentKeyDisplay) {
      currentKeyDisplay.textContent = currentShortcut;
    }

    // Reset state
    display.textContent = 'Press keys...';
    errorDiv.textContent = '';
    saveBtn.disabled = true;

    // Reset modifier key highlights
    modifierKeys.forEach(key => key.classList.remove('active'));

    let recordedShortcut = null;
    let isValid = false;

    // Update modifier key visuals
    const updateModifierVisuals = e => {
      modifierKeys.forEach(key => {
        const keyName = key.getAttribute('data-key');
        if (keyName === 'ctrl' && e.ctrlKey) {
          key.classList.add('active');
        } else if (keyName === 'alt' && e.altKey) {
          key.classList.add('active');
        } else if (keyName === 'shift' && e.shiftKey) {
          key.classList.add('active');
        } else if (!e.ctrlKey && keyName === 'ctrl') {
          key.classList.remove('active');
        } else if (!e.altKey && keyName === 'alt') {
          key.classList.remove('active');
        } else if (!e.shiftKey && keyName === 'shift') {
          key.classList.remove('active');
        }
      });
    };

    // Keyboard event handler
    const handleKeyPress = e => {
      e.preventDefault();
      e.stopPropagation();

      // Update modifier visuals
      updateModifierVisuals(e);

      // Convert event to shortcut string
      recordedShortcut = eventToShortcut(e);
      display.textContent = recordedShortcut;

      // Validate shortcut
      const validation = validateShortcut(recordedShortcut, currentShortcuts, featureKey);

      if (validation.valid) {
        errorDiv.textContent = '';
        errorDiv.style.color = '#059669';
        errorDiv.textContent = '✓ Valid shortcut';
        saveBtn.disabled = false;
        isValid = true;
      } else {
        errorDiv.style.color = '#dc2626';
        errorDiv.textContent = validation.error;
        saveBtn.disabled = true;
        isValid = false;
      }
    };

    // Key up handler to update modifier visuals
    const handleKeyUp = e => {
      updateModifierVisuals(e);
    };

    // Add keyboard listeners
    document.addEventListener('keydown', handleKeyPress);
    document.addEventListener('keyup', handleKeyUp);

    // Close overlay function
    const closeOverlay = () => {
      document.removeEventListener('keydown', handleKeyPress);
      document.removeEventListener('keyup', handleKeyUp);
      overlay.classList.remove('active');
      modifierKeys.forEach(key => key.classList.remove('active'));
    };

    // Cancel button
    this.attachInteractiveHandler(cancelBtn, 'Shortcut Capture Cancel Button', closeOverlay);

    // Clear button
    if (clearBtn) {
      this.attachInteractiveHandler(clearBtn, 'Shortcut Capture Clear Button', () => {
        recordedShortcut = null;
        display.textContent = 'Press keys...';
        errorDiv.textContent = '';
        saveBtn.disabled = true;
        modifierKeys.forEach(key => key.classList.remove('active'));
      });
    }

    // Save button
    this.attachInteractiveHandler(saveBtn, 'Shortcut Capture Save Button', async () => {
      if (isValid && recordedShortcut) {
        // Update shortcuts
        currentShortcuts[featureKey] = recordedShortcut;
        await saveShortcuts(currentShortcuts);

        // Reload the shortcuts grid and refresh inline badges
        this.loadKeyboardShortcuts();
        this.injectShortcutBadges();

        // Close overlay
        closeOverlay();

        this.updateStatus(`Shortcut updated: ${SHORTCUT_LABELS[featureKey]}`);
      }
    });

    // Close on escape (but not record it)
    const escapeHandler = e => {
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        closeOverlay();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  saveModalSettings() {
    // Initialize settings objects if they don't exist
    if (!this.settings.ui_visibility) {
      this.settings.ui_visibility = {};
    }
    if (!this.settings.appearance) {
      this.settings.appearance = {};
    }

    // Track if visibility changed (need to reload popup)
    const oldVisibility = { ...this.settings.ui_visibility };

    // Helper function to save checkbox state
    const saveCheckbox = (id, visibilityKey) => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        this.settings.ui_visibility[visibilityKey] = checkbox.checked;
      }
    };

    // Save all feature visibility settings
    saveCheckbox('show-ocr', 'show_ocr'); // OCR
    saveCheckbox('show-highlight-menu', 'show_highlight_menu'); // Highlight Menu
    saveCheckbox('show-dictionary', 'show_dictionary'); // Dictionary
    saveCheckbox('show-highlighting', 'show_highlighting');
    saveCheckbox('show-speed-presets', 'show_speed_presets');
    saveCheckbox('show-text-customization', 'show_text_customization');
    saveCheckbox('show-reading-guide', 'show_reading_guide');
    saveCheckbox('show-focus-mode', 'show_focus_mode');
    saveCheckbox('show-stt', 'show_stt');
    saveCheckbox('show-screen-overlay', 'show_screen_overlay');
    saveCheckbox('show-canvas-integration', 'show_canvas_integration');
    saveCheckbox('show-moodle-integration', 'show_moodle_integration');
    saveCheckbox('show-google-classroom-integration', 'show_google_classroom_integration');
    saveCheckbox('show-dyslexia-mode', 'show_dyslexia_mode');
    saveCheckbox('show-annotations', 'show_annotations'); // Annotations
    saveCheckbox('show-citations', 'show_citations'); // Citations
    saveCheckbox('show-mind-map', 'show_mind_map'); // Mind Map
    saveCheckbox('show-translation', 'show_translation'); // Translation
    // Dark Mode feature removed - extension UI dark mode remains in popup header
    saveCheckbox('show-simplify', 'show_simplify'); // Simplified Interface
    saveCheckbox('show-reading-progress', 'show_reading_progress'); // Reading Progress Tracker
    saveCheckbox('show-pomodoro', 'show_pomodoro'); // Pomodoro Timer
    saveCheckbox('show-reduced-motion', 'show_reduced_motion'); // Reduced Motion
    saveCheckbox('show-media-control', 'show_media_control'); // Media Control

    // Save annotations storage mode
    const storageMode = document.getElementById('annotations-storage-mode');
    if (storageMode) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.storageMode = storageMode.value;
    }

    // Save annotation settings
    const defaultColorSelect = document.getElementById('annotations-default-color');
    if (defaultColorSelect) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.defaultColor = defaultColorSelect.value;
    }

    const defaultSizeSelect = document.getElementById('annotations-default-size');
    if (defaultSizeSelect) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.defaultNoteSize = defaultSizeSelect.value;
    }

    const autoSaveToggle = document.getElementById('annotations-auto-save');
    if (autoSaveToggle) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.autoSave = autoSaveToggle.checked;
    }

    const showBadgeToggle = document.getElementById('annotations-show-badge');
    if (showBadgeToggle) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.showBadge = showBadgeToggle.checked;
    }

    const sidebarAutoOpenToggle = document.getElementById('annotations-sidebar-auto-open');
    if (sidebarAutoOpenToggle) {
      if (!this.settings.annotations) {
        this.settings.annotations = {};
      }
      this.settings.annotations.sidebarAutoOpen = sidebarAutoOpenToggle.checked;
    }

    // Save appearance settings
    const compactMode = document.getElementById('compact-mode');
    if (compactMode) {
      this.settings.appearance.compact_mode = compactMode.checked;
    }

    const showIcons = document.getElementById('show-icons');
    if (showIcons) {
      this.settings.appearance.show_icons = showIcons.checked;
    }

    const debugMode = document.getElementById('debug-mode');
    if (debugMode) {
      this.settings.appearance.debug_mode = debugMode.checked;
    }

    // Save UI overlay visibility settings
    if (!this.settings.ui_overlay) {
      this.settings.ui_overlay = {};
    }

    const showTextStatsBadge = document.getElementById('show-text-stats-badge');
    if (showTextStatsBadge) {
      this.settings.ui_overlay.show_text_stats_badge = showTextStatsBadge.checked;
    }

    const showTextStatsNotifications = document.getElementById('show-text-stats-notifications');
    if (showTextStatsNotifications) {
      this.settings.ui_overlay.show_text_stats_notifications = showTextStatsNotifications.checked;
    }

    const showFeatureNotifications = document.getElementById('show-feature-notifications');
    if (showFeatureNotifications) {
      this.settings.ui_overlay.show_feature_notifications = showFeatureNotifications.checked;
    }

    const showTokenCounter = document.getElementById('show-token-counter');
    if (showTokenCounter) {
      this.settings.ui_overlay.show_token_counter = showTokenCounter.checked;
    }

    const showReadingProgressBadge = document.getElementById('show-reading-progress-badge');
    if (showReadingProgressBadge) {
      this.settings.ui_overlay.show_reading_progress_badge = showReadingProgressBadge.checked;
    }

    // Save to storage (includes both chrome.storage.sync for settings and chrome.storage.local for ui_overlay)
    this.saveSettings();

    // Also save UI overlay settings to chrome.storage.local for content scripts
    chrome.storage.local.set({
      textStatsBadgeVisible: this.settings.ui_overlay.minimize_clutter
        ? false
        : this.settings.ui_overlay.show_text_stats_badge === true,
      textStatsNotificationsEnabled: this.settings.ui_overlay.minimize_clutter
        ? false
        : this.settings.ui_overlay.show_text_stats_notifications === true,
      featureNotificationsEnabled: this.settings.ui_overlay.minimize_clutter
        ? false
        : this.settings.ui_overlay.show_feature_notifications !== false,
      tokenCounterVisible: this.settings.ui_overlay.minimize_clutter
        ? false
        : this.settings.ui_overlay.show_token_counter !== false,
      readingProgressBadgeVisible: this.settings.ui_overlay.minimize_clutter
        ? false
        : this.settings.ui_overlay.show_reading_progress_badge !== false,
    });

    // Show confirmation
    this.updateStatus('Settings saved');

    console.log('[Popup] Modal settings saved:', {
      ui_visibility: this.settings.ui_visibility,
      appearance: this.settings.appearance,
    });

    // Compare what the student saw, not what was stored: a preference never saved is shown ticked,
    // so reading it as `undefined` made the first Save on a fresh install count as a change and
    // reload the popup, dropping a keyboard student's place for nothing.
    const shown = value => value !== false;
    const visibilityChanged = [
      ...new Set([...Object.keys(oldVisibility), ...Object.keys(this.settings.ui_visibility)]),
    ].some(key => shown(oldVisibility[key]) !== shown(this.settings.ui_visibility[key]));

    // Reload popup if visibility changed
    if (visibilityChanged) {
      console.log('[Popup] Visibility changed, reloading...');
      setTimeout(() => window.location.reload(), 300);
    }
  }

  async loadVoices() {
    try {
      const voices = await waitForVoices(speechSynthesis);
      this.populateVoices(voices);
      // Voices can arrive or change after the first list (a language pack installs, Chrome refreshes
      // its network voices); keep the picker in step without touching the saved choice.
      speechSynthesis.addEventListener('voiceschanged', () =>
        this.populateVoices(speechSynthesis.getVoices())
      );
    } catch (error) {
      console.error('[Popup][loadVoices] Error loading voices:', error);
    }
  }

  populateVoices(voices) {
    renderVoiceOptions(document.getElementById('voice-select'), voices, this.settings?.tts?.voice);
  }

  async sendCommandToTab(command, data = {}) {
    if (!this.currentTab) {
      console.warn('[Popup] No current tab');
      return;
    }

    // Skip extension pages and special URLs
    if (
      !this.currentTab.url ||
      this.currentTab.url.startsWith('chrome://') ||
      this.currentTab.url.startsWith('chrome-extension://') ||
      this.currentTab.url.startsWith('edge://') ||
      this.currentTab.url.startsWith('about:')
    ) {
      console.warn('[Popup] Cannot access this page type');
      this.updateStatus('Cannot access browser system pages', 'error');
      return;
    }

    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        type: MESSAGE_TYPES.TTS_COMMAND,
        data: { command, ...data },
      });
    } catch (error) {
      console.error('[Popup] Error sending command:', error);
      // Check if it's a connection error
      if (error.message.includes('Could not establish connection')) {
        this.updateStatus('Please reload the page', 'error');
      } else {
        this.updateStatus('Error: Tab not accessible', 'error');
      }
    }
  }

  updateUI() {
    console.log('[Popup][updateUI] Starting UI update...');
    // UI updates can be added here as needed
    console.log('[Popup][updateUI] ✓ UI update complete');
  }

  /**
   * Save the Verify citations online choice where the popup and the citation analyser read it.
   * Both writes start before this returns, so a caller can ask Chrome for the permission next.
   * @param {boolean} on
   * @returns {Promise<void>}
   */
  saveVerifyOnline(on) {
    this.settings.citation = this.settings.citation || {};
    this.settings.citation.verifyOnline = on;
    const settingsSaved = this.saveSettings();
    const analyserSaved = chrome.storage.local.get('citationAnalyzerSettings').then(stored =>
      chrome.storage.local.set({
        citationAnalyzerSettings: { ...(stored.citationAnalyzerSettings || {}), verifyOnline: on },
      })
    );
    return Promise.all([settingsSaved, analyserSaved]).then(() => undefined);
  }

  updateStatus(message, type = '') {
    const statusIndicator = document.getElementById('status-indicator');
    statusIndicator.textContent = message;
    statusIndicator.className = 'status-indicator ' + type;
  }

  setupTextCustomization() {
    // Initialize textCustomization settings if they don't exist
    if (!this.settings.textCustomization) {
      this.settings.textCustomization = {
        enabled: false,
        fontFamily: 'lexend',
        lineSpacing: 1.5,
        letterSpacing: 0.12,
        wordSpacing: 0.16,
        paragraphSpacing: 2.0,
      };
    }

    const textCustomizationEnabled = document.getElementById('text-customization-enabled');
    const textCustomizationDescription = document.getElementById('text-customization-description');
    const textCustomizationOptions = document.getElementById('text-customization-options');

    // Set initial state
    textCustomizationEnabled.checked = this.settings.textCustomization.enabled || false;

    // Show/hide description and options based on enabled state
    if (textCustomizationEnabled.checked) {
      textCustomizationDescription.classList.remove('hidden');
      textCustomizationOptions.classList.remove('hidden');
    } else {
      textCustomizationDescription.classList.add('hidden');
      textCustomizationOptions.classList.add('hidden');
    }

    // Toggle event
    textCustomizationEnabled.addEventListener('change', e => {
      this.settings.textCustomization.enabled = e.target.checked;
      this.saveSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        textCustomizationDescription.classList.remove('hidden');
        textCustomizationOptions.classList.remove('hidden');
      } else {
        textCustomizationDescription.classList.add('hidden');
        textCustomizationOptions.classList.add('hidden');
      }
    });

    // Font Family selector
    const fontFamilySelect = document.getElementById('text-font-family');
    fontFamilySelect.value = this.settings.textCustomization.fontFamily || 'lexend';
    fontFamilySelect.addEventListener('change', e => {
      this.settings.textCustomization.fontFamily = e.target.value;
      this.saveSettings();
    });

    // Line Spacing slider
    const lineSpacingSlider = document.getElementById('text-line-spacing');
    const lineSpacingValue = document.getElementById('text-line-spacing-value');
    lineSpacingSlider.value = this.settings.textCustomization.lineSpacing || 1.5;
    lineSpacingValue.textContent = lineSpacingSlider.value;
    lineSpacingSlider.addEventListener('input', e => {
      const value = parseFloat(e.target.value);
      lineSpacingValue.textContent = value;
      this.settings.textCustomization.lineSpacing = value;
      this.saveSettings();
    });

    // Letter Spacing slider (percentage to em conversion)
    const letterSpacingSlider = document.getElementById('text-letter-spacing');
    const letterSpacingValue = document.getElementById('text-letter-spacing-value');
    // Convert stored em value to percentage (0.12em = 12%)
    const letterSpacingPercent = Math.round(
      (this.settings.textCustomization.letterSpacing || 0.12) * 100
    );
    letterSpacingSlider.value = letterSpacingPercent;
    letterSpacingValue.textContent = letterSpacingPercent + '%';
    letterSpacingSlider.addEventListener('input', e => {
      const percent = parseInt(e.target.value);
      letterSpacingValue.textContent = percent + '%';
      // Convert percentage to em (12% = 0.12em)
      this.settings.textCustomization.letterSpacing = percent / 100;
      this.saveSettings();
    });

    // Word Spacing slider (percentage to em conversion)
    const wordSpacingSlider = document.getElementById('text-word-spacing');
    const wordSpacingValue = document.getElementById('text-word-spacing-value');
    // Convert stored em value to percentage (0.16em = 16%)
    const wordSpacingPercent = Math.round(
      (this.settings.textCustomization.wordSpacing || 0.16) * 100
    );
    wordSpacingSlider.value = wordSpacingPercent;
    wordSpacingValue.textContent = wordSpacingPercent + '%';
    wordSpacingSlider.addEventListener('input', e => {
      const percent = parseInt(e.target.value);
      wordSpacingValue.textContent = percent + '%';
      // Convert percentage to em (16% = 0.16em)
      this.settings.textCustomization.wordSpacing = percent / 100;
      this.saveSettings();
    });

    // Paragraph Spacing slider
    const paragraphSpacingSlider = document.getElementById('text-paragraph-spacing');
    const paragraphSpacingValue = document.getElementById('text-paragraph-spacing-value');
    paragraphSpacingSlider.value = this.settings.textCustomization.paragraphSpacing || 2.0;
    paragraphSpacingValue.textContent = paragraphSpacingSlider.value + 'em';
    paragraphSpacingSlider.addEventListener('input', e => {
      const value = parseFloat(e.target.value);
      paragraphSpacingValue.textContent = value + 'em';
      this.settings.textCustomization.paragraphSpacing = value;
      this.saveSettings();
    });

    console.log('[Popup] Text Customization initialized');
  }

  setupReadingGuide() {
    // Initialize readingGuide settings if they don't exist
    if (!this.settings.readingGuide) {
      this.settings.readingGuide = {
        enabled: false,
        lineColor: '#000000',
        lineThickness: 3,
        lineOpacity: 0.7,
      };
    }

    const readingGuideEnabled = document.getElementById('reading-guide-enabled');
    const readingGuideDescription = document.getElementById('reading-guide-description');
    const readingGuideOptions = document.getElementById('reading-guide-options');

    // Set initial state
    readingGuideEnabled.checked = this.settings.readingGuide.enabled || false;

    // Show/hide description and options based on enabled state
    if (readingGuideEnabled.checked) {
      readingGuideDescription.classList.remove('hidden');
      readingGuideOptions.classList.remove('hidden');
    } else {
      readingGuideDescription.classList.add('hidden');
      readingGuideOptions.classList.add('hidden');
    }

    // Toggle event
    readingGuideEnabled.addEventListener('change', e => {
      this.settings.readingGuide.enabled = e.target.checked;
      this.saveSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        readingGuideDescription.classList.remove('hidden');
        readingGuideOptions.classList.remove('hidden');
      } else {
        readingGuideDescription.classList.add('hidden');
        readingGuideOptions.classList.add('hidden');
      }
    });

    // Line Color selector
    const lineColorSelect = document.getElementById('reading-guide-color');
    lineColorSelect.value = this.settings.readingGuide.lineColor || '#000000';
    lineColorSelect.addEventListener('change', e => {
      this.settings.readingGuide.lineColor = e.target.value;
      this.saveSettings();
    });

    // Line Thickness slider
    const lineThicknessSlider = document.getElementById('reading-guide-thickness');
    const lineThicknessValue = document.getElementById('reading-guide-thickness-value');
    lineThicknessSlider.value = this.settings.readingGuide.lineThickness || 3;
    lineThicknessValue.textContent = lineThicknessSlider.value + 'px';
    lineThicknessSlider.addEventListener('input', e => {
      const value = parseInt(e.target.value);
      lineThicknessValue.textContent = value + 'px';
      this.settings.readingGuide.lineThickness = value;
      this.saveSettings();
    });

    // Line Opacity slider: whole percent on screen, a 0-1 fraction in storage.
    const lineOpacitySlider = document.getElementById('reading-guide-opacity');
    const lineOpacityValue = document.getElementById('reading-guide-opacity-value');
    lineOpacitySlider.value = Math.round((this.settings.readingGuide.lineOpacity || 0.7) * 100);
    lineOpacityValue.textContent = lineOpacitySlider.value + '%';
    lineOpacitySlider.addEventListener('input', e => {
      const value = parseInt(e.target.value, 10) / 100;
      lineOpacityValue.textContent = e.target.value + '%';
      this.settings.readingGuide.lineOpacity = value;
      this.saveSettings();
    });

    console.log('[Popup] Reading Guide initialized');
  }

  setupCustomCursor() {
    // Initialize customCursor settings if they don't exist
    if (!this.settings.customCursor) {
      this.settings.customCursor = {
        enabled: false,
        size: 32,
        style: 'crosshair',
        color: '#ff0000',
      };
    }

    const cursorEnabled = document.getElementById('custom-cursor-enabled');
    const cursorDescription = document.getElementById('custom-cursor-description');
    const cursorOptions = document.getElementById('custom-cursor-options');

    // Set initial state
    cursorEnabled.checked = this.settings.customCursor.enabled || false;

    // Show/hide description and options based on enabled state
    if (cursorEnabled.checked) {
      cursorDescription.classList.remove('hidden');
      cursorOptions.classList.remove('hidden');
    } else {
      cursorDescription.classList.add('hidden');
      cursorOptions.classList.add('hidden');
    }

    // Toggle event
    cursorEnabled.addEventListener('change', e => {
      this.settings.customCursor.enabled = e.target.checked;
      this.saveSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        cursorDescription.classList.remove('hidden');
        cursorOptions.classList.remove('hidden');
      } else {
        cursorDescription.classList.add('hidden');
        cursorOptions.classList.add('hidden');
      }
    });

    // Cursor Size slider
    const cursorSizeSlider = document.getElementById('custom-cursor-size');
    const cursorSizeValue = document.getElementById('custom-cursor-size-value');
    cursorSizeSlider.value = this.settings.customCursor.size || 32;
    cursorSizeValue.textContent = cursorSizeSlider.value + 'px';
    cursorSizeSlider.addEventListener('input', e => {
      const value = parseInt(e.target.value);
      cursorSizeValue.textContent = value + 'px';
      this.settings.customCursor.size = value;
      this.saveSettings();
    });

    // Cursor Style selector
    const cursorStyleSelect = document.getElementById('custom-cursor-style');
    cursorStyleSelect.value = this.settings.customCursor.style || 'crosshair';
    cursorStyleSelect.addEventListener('change', e => {
      this.settings.customCursor.style = e.target.value;
      this.saveSettings();
    });

    // Cursor Color selector
    const cursorColorSelect = document.getElementById('custom-cursor-color');
    cursorColorSelect.value = this.settings.customCursor.color || '#ff0000';
    cursorColorSelect.addEventListener('change', e => {
      this.settings.customCursor.color = e.target.value;
      this.saveSettings();
    });

    console.log('[Popup] Custom Cursor initialized');
  }

  setupMagnifyingLens() {
    // Initialize magnifyingLens settings if they don't exist
    if (!this.settings.magnifyingLens) {
      this.settings.magnifyingLens = {
        enabled: false,
        scale: 2.0,
        size: 275,
        offsetEnabled: false,
        offset: 150,
        offsetDir: 'right',
        lock: false,
      };
    }

    const lensEnabled = document.getElementById('magnifying-lens-enabled');
    const lensDescription = document.getElementById('magnifying-lens-description');
    const lensOptions = document.getElementById('magnifying-lens-options');

    // Set initial state
    lensEnabled.checked = this.settings.magnifyingLens.enabled || false;

    // Show/hide description and options based on enabled state
    if (lensEnabled.checked) {
      lensDescription.classList.remove('hidden');
      lensOptions.classList.remove('hidden');
    } else {
      lensDescription.classList.add('hidden');
      lensOptions.classList.add('hidden');
    }

    // Toggle event
    lensEnabled.addEventListener('change', e => {
      this.settings.magnifyingLens.enabled = e.target.checked;
      this.saveSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        lensDescription.classList.remove('hidden');
        lensOptions.classList.remove('hidden');
      } else {
        lensDescription.classList.add('hidden');
        lensOptions.classList.add('hidden');
      }
    });

    // Magnification Scale slider
    const scaleSlider = document.getElementById('magnifying-lens-scale');
    const scaleValue = document.getElementById('magnifying-lens-scale-value');
    scaleSlider.value = this.settings.magnifyingLens.scale || 2.0;
    scaleValue.textContent = scaleSlider.value + 'x';
    scaleSlider.addEventListener('input', e => {
      const value = parseFloat(e.target.value);
      scaleValue.textContent = value + 'x';
      this.settings.magnifyingLens.scale = value;
      this.saveSettings();
    });

    // Lens Size slider
    const sizeSlider = document.getElementById('magnifying-lens-size');
    const sizeValue = document.getElementById('magnifying-lens-size-value');
    sizeSlider.value = this.settings.magnifyingLens.size || 275;
    sizeValue.textContent = sizeSlider.value + 'px';
    sizeSlider.addEventListener('input', e => {
      const value = parseInt(e.target.value);
      sizeValue.textContent = value + 'px';
      this.settings.magnifyingLens.size = value;
      this.saveSettings();
    });

    // Offset Enabled toggle
    const offsetEnabledToggle = document.getElementById('magnifying-lens-offset-enabled');
    const offsetControls = document.getElementById('magnifying-lens-offset-controls');
    offsetEnabledToggle.checked = this.settings.magnifyingLens.offsetEnabled || false;

    // Show/hide offset controls based on initial state
    if (offsetEnabledToggle.checked) {
      offsetControls.classList.remove('hidden');
    } else {
      offsetControls.classList.add('hidden');
    }

    offsetEnabledToggle.addEventListener('change', e => {
      this.settings.magnifyingLens.offsetEnabled = e.target.checked;
      this.saveSettings();

      // Toggle offset controls visibility
      if (e.target.checked) {
        offsetControls.classList.remove('hidden');
      } else {
        offsetControls.classList.add('hidden');
      }
    });

    // Offset Distance slider
    const offsetSlider = document.getElementById('magnifying-lens-offset');
    const offsetValue = document.getElementById('magnifying-lens-offset-value');
    offsetSlider.value = this.settings.magnifyingLens.offset || 150;
    offsetValue.textContent = offsetSlider.value + 'px';
    offsetSlider.addEventListener('input', e => {
      const value = parseInt(e.target.value);
      offsetValue.textContent = value + 'px';
      this.settings.magnifyingLens.offset = value;
      this.saveSettings();
    });

    // Offset Direction selector
    const offsetDirSelect = document.getElementById('magnifying-lens-offset-dir');
    offsetDirSelect.value = this.settings.magnifyingLens.offsetDir || 'right';
    offsetDirSelect.addEventListener('change', e => {
      this.settings.magnifyingLens.offsetDir = e.target.value;
      this.saveSettings();
    });

    // Lock Position toggle
    const lockToggle = document.getElementById('magnifying-lens-lock');
    lockToggle.checked = this.settings.magnifyingLens.lock || false;
    lockToggle.addEventListener('change', e => {
      this.settings.magnifyingLens.lock = e.target.checked;
      this.saveSettings();
    });

    console.log('[Popup] Magnifying Lens initialized');
  }

  setupFocusMode() {
    if (!this.settings.focusMode) {
      this.settings.focusMode = {
        enabled: false,
        boxWidth: 400,
        boxHeight: 100,
        overlayOpacity: 0.7,
      };
    }

    const focusModeEnabled = document.getElementById('focus-mode-enabled');
    const focusModeDescription = document.getElementById('focus-mode-description');
    const focusModeOptions = document.getElementById('focus-mode-options');

    focusModeEnabled.checked = this.settings.focusMode.enabled || false;

    if (focusModeEnabled.checked) {
      focusModeDescription.classList.remove('hidden');
      focusModeOptions.classList.remove('hidden');
    } else {
      focusModeDescription.classList.add('hidden');
      focusModeOptions.classList.add('hidden');
    }

    focusModeEnabled.addEventListener('change', e => {
      this.settings.focusMode.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        focusModeDescription.classList.remove('hidden');
        focusModeOptions.classList.remove('hidden');
      } else {
        focusModeDescription.classList.add('hidden');
        focusModeOptions.classList.add('hidden');
      }
    });

    const boxWidthSlider = document.getElementById('focus-mode-width');
    const boxWidthValue = document.getElementById('focus-mode-width-value');
    boxWidthSlider.value = this.settings.focusMode.boxWidth || 400;
    boxWidthValue.textContent = boxWidthSlider.value + 'px';
    boxWidthSlider.addEventListener('input', e => {
      const value = parseInt(e.target.value);
      boxWidthValue.textContent = value + 'px';
      this.settings.focusMode.boxWidth = value;
      this.saveSettings();
    });

    const boxHeightSlider = document.getElementById('focus-mode-height');
    const boxHeightValue = document.getElementById('focus-mode-height-value');
    boxHeightSlider.value = this.settings.focusMode.boxHeight || 100;
    boxHeightValue.textContent = boxHeightSlider.value + 'px';
    boxHeightSlider.addEventListener('input', e => {
      const value = parseInt(e.target.value);
      boxHeightValue.textContent = value + 'px';
      this.settings.focusMode.boxHeight = value;
      this.saveSettings();
    });

    // Whole percent on screen, a 0-1 fraction in storage.
    const overlayOpacitySlider = document.getElementById('focus-mode-opacity');
    const overlayOpacityValue = document.getElementById('focus-mode-opacity-value');
    overlayOpacitySlider.value = Math.round((this.settings.focusMode.overlayOpacity || 0.7) * 100);
    overlayOpacityValue.textContent = overlayOpacitySlider.value + '%';
    overlayOpacitySlider.addEventListener('input', e => {
      const value = parseInt(e.target.value, 10) / 100;
      overlayOpacityValue.textContent = e.target.value + '%';
      this.settings.focusMode.overlayOpacity = value;
      this.saveSettings();
    });

    console.log('[Popup] Focus Mode initialized');
  }

  setupScreenOverlay() {
    if (!this.settings.screenOverlay) {
      this.settings.screenOverlay = {
        enabled: false,
        color: '#FFE4C4',
        opacity: 0.3,
      };
    }

    const screenOverlayEnabled = document.getElementById('screen-overlay-enabled');
    const screenOverlayDescription = document.getElementById('screen-overlay-description');
    const screenOverlayOptions = document.getElementById('screen-overlay-options');

    screenOverlayEnabled.checked = this.settings.screenOverlay.enabled || false;

    if (screenOverlayEnabled.checked) {
      screenOverlayDescription.classList.remove('hidden');
      screenOverlayOptions.classList.remove('hidden');
    } else {
      screenOverlayDescription.classList.add('hidden');
      screenOverlayOptions.classList.add('hidden');
    }

    screenOverlayEnabled.addEventListener('change', e => {
      this.settings.screenOverlay.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        screenOverlayDescription.classList.remove('hidden');
        screenOverlayOptions.classList.remove('hidden');
      } else {
        screenOverlayDescription.classList.add('hidden');
        screenOverlayOptions.classList.add('hidden');
      }
    });

    const colorSelect = document.getElementById('screen-overlay-color');
    colorSelect.value = this.settings.screenOverlay.color || '#FFE4C4';
    colorSelect.addEventListener('change', e => {
      this.settings.screenOverlay.color = e.target.value;
      this.saveSettings();
    });

    // Whole percent on screen, a 0-1 fraction in storage.
    const opacitySlider = document.getElementById('screen-overlay-opacity');
    const opacityValue = document.getElementById('screen-overlay-opacity-value');
    opacitySlider.value = Math.round((this.settings.screenOverlay.opacity || 0.3) * 100);
    opacityValue.textContent = opacitySlider.value + '%';
    opacitySlider.addEventListener('input', e => {
      const value = parseInt(e.target.value, 10) / 100;
      opacityValue.textContent = e.target.value + '%';
      this.settings.screenOverlay.opacity = value;
      this.saveSettings();
    });

    console.log('[Popup] Screen Overlay initialized');
  }

  setupReducedMotion() {
    if (!this.settings.reducedMotion) {
      this.settings.reducedMotion = {
        enabled: false,
        respectSystemPreference: true,
      };
    }

    const reducedMotionEnabled = document.getElementById('reduced-motion-enabled');
    const reducedMotionDescription = document.getElementById('reduced-motion-description');
    const reducedMotionOptions = document.getElementById('reduced-motion-options');

    reducedMotionEnabled.checked = this.settings.reducedMotion.enabled || false;

    if (reducedMotionEnabled.checked) {
      reducedMotionDescription.classList.remove('hidden');
      reducedMotionOptions.classList.remove('hidden');
    } else {
      reducedMotionDescription.classList.add('hidden');
      reducedMotionOptions.classList.add('hidden');
    }

    reducedMotionEnabled.addEventListener('change', e => {
      this.settings.reducedMotion.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        reducedMotionDescription.classList.remove('hidden');
        reducedMotionOptions.classList.remove('hidden');
      } else {
        reducedMotionDescription.classList.add('hidden');
        reducedMotionOptions.classList.add('hidden');
      }
    });

    const systemToggle = document.getElementById('reduced-motion-system');
    systemToggle.checked = this.settings.reducedMotion.respectSystemPreference !== false;

    // The switch always shows the student's own choice and always stays usable. Following the
    // computer's setting can only ADD to that choice, never replace it, so there is nothing to grey
    // out and no way to end up looking switched on with no way back. When the computer is asking for
    // less motion as well, the note says so, because otherwise the student sees motion already
    // reduced while the switch reads off and reasonably concludes it is broken.
    const systemPrefers = () => {
      try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch {
        return false;
      }
    };

    const followingNote = document.getElementById('reduced-motion-following-note');

    const paintMotionSwitch = () => {
      reducedMotionEnabled.checked = this.settings.reducedMotion.enabled || false;
      const systemAlsoAsks = systemToggle.checked && systemPrefers();
      if (followingNote) {
        followingNote.textContent = systemAlsoAsks
          ? 'Your computer is asking for less motion too, so movement stays reduced even with this off.'
          : '';
        followingNote.classList.toggle('hidden', !systemAlsoAsks);
      }
    };

    systemToggle.addEventListener('change', e => {
      this.settings.reducedMotion.respectSystemPreference = e.target.checked;
      this.saveSettings();
      paintMotionSwitch();
    });

    // The computer's setting can change while the popup is open.
    try {
      window
        .matchMedia('(prefers-reduced-motion: reduce)')
        .addEventListener('change', paintMotionSwitch);
    } catch {
      // An older engine without matchMedia listeners: the switch is still correct on open.
    }

    paintMotionSwitch();
  }

  setupMediaControl() {
    if (!this.settings.mediaControl) {
      // One switch covers both video and audio; the three per-type keys were never read.
      this.settings.mediaControl = { enabled: false };
    }

    const mediaControlEnabled = document.getElementById('media-control-enabled');
    const mediaControlDescription = document.getElementById('media-control-description');

    mediaControlEnabled.checked = this.settings.mediaControl.enabled || false;

    if (mediaControlEnabled.checked) {
      mediaControlDescription.classList.remove('hidden');
    } else {
      mediaControlDescription.classList.add('hidden');
    }

    mediaControlEnabled.addEventListener('change', e => {
      this.settings.mediaControl.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        mediaControlDescription.classList.remove('hidden');
      } else {
        mediaControlDescription.classList.add('hidden');
      }
    });

    console.log('[Popup] Media Control initialized');
  }

  // REMOVED - Web page dark mode feature removed
  // Extension UI dark mode button (in header) remains functional

  setupSimplify() {
    if (!this.settings.simplify) {
      this.settings.simplify = {
        enabled: false,
        intensity: 'moderate',
        focusMainContent: true,
        hideAds: true,
        hideSidebars: true,
        hideComments: true,
        hideRelated: true,
        hideFooters: true,
        hideSocialButtons: true,
        hidePopups: true,
        hideAnimations: true,
      };
    }

    const simplifyEnabled = document.getElementById('simplify-enabled');
    const simplifyDescription = document.getElementById('simplify-description');
    const simplifyOptions = document.getElementById('simplify-options');

    simplifyEnabled.checked = this.settings.simplify.enabled || false;

    if (simplifyEnabled.checked) {
      simplifyDescription.classList.remove('hidden');
      simplifyOptions.classList.remove('hidden');
    } else {
      simplifyDescription.classList.add('hidden');
      simplifyOptions.classList.add('hidden');
    }

    simplifyEnabled.addEventListener('change', e => {
      this.settings.simplify.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        simplifyDescription.classList.remove('hidden');
        simplifyOptions.classList.remove('hidden');
      } else {
        simplifyDescription.classList.add('hidden');
        simplifyOptions.classList.add('hidden');
      }
    });

    const intensitySelect = document.getElementById('simplify-intensity');
    intensitySelect.value = this.settings.simplify.intensity || 'moderate';
    intensitySelect.addEventListener('change', e => {
      this.settings.simplify.intensity = e.target.value;
      this.saveSettings();
    });

    const focusContentToggle = document.getElementById('simplify-focus-content');
    focusContentToggle.checked = this.settings.simplify.focusMainContent !== false;
    focusContentToggle.addEventListener('change', e => {
      this.settings.simplify.focusMainContent = e.target.checked;
      this.saveSettings();
    });

    console.log('[Popup] Simplified Interface initialized');
  }

  setupReadingProgress() {
    if (!this.settings.readingProgress) {
      this.settings.readingProgress = {
        enabled: false,
        position: 'top',
        height: 4,
        color: '#4CAF50',
        backgroundColor: 'rgba(0,0,0,0.1)',
        showPercentage: false,
        smoothScroll: true,
        hideOnComplete: false,
      };
    }

    const progressEnabled = document.getElementById('reading-progress-enabled');
    const progressDescription = document.getElementById('reading-progress-description');
    const progressOptions = document.getElementById('reading-progress-options');

    progressEnabled.checked = this.settings.readingProgress.enabled || false;

    if (progressEnabled.checked) {
      progressDescription.classList.remove('hidden');
      progressOptions.classList.remove('hidden');
    } else {
      progressDescription.classList.add('hidden');
      progressOptions.classList.add('hidden');
    }

    progressEnabled.addEventListener('change', e => {
      this.settings.readingProgress.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        progressDescription.classList.remove('hidden');
        progressOptions.classList.remove('hidden');
      } else {
        progressDescription.classList.add('hidden');
        progressOptions.classList.add('hidden');
      }
    });

    const positionSelect = document.getElementById('reading-progress-position');
    positionSelect.value = this.settings.readingProgress.position || 'top';
    positionSelect.addEventListener('change', e => {
      this.settings.readingProgress.position = e.target.value;
      this.saveSettings();
    });

    const colorSelect = document.getElementById('reading-progress-color');
    colorSelect.value = this.settings.readingProgress.color || '#4CAF50';
    colorSelect.addEventListener('change', e => {
      this.settings.readingProgress.color = e.target.value;
      this.saveSettings();
    });

    const percentageToggle = document.getElementById('reading-progress-percentage');
    percentageToggle.checked = this.settings.readingProgress.showPercentage || false;
    percentageToggle.addEventListener('change', e => {
      this.settings.readingProgress.showPercentage = e.target.checked;
      this.saveSettings();
    });

    console.log('[Popup] Reading Progress initialized');
  }

  /**
   * The two supports that record how a student works: their opt-in, and deleting what was recorded.
   *
   * Both live in their own top-level chrome.storage.local keys rather than in `assist_settings`,
   * because the content script listens for a change on them and stops collecting in the tab the
   * student is already reading — an opt-out that only took effect on the next page load would not
   * be an opt-out. Switching the learning profile off says, in the section's status line, that what
   * was already recorded is still there and which button removes it: withdrawing consent and erasing
   * what consent produced are two deliberate acts, and neither is asked for in a native dialog.
   */
  setupLearningDataControls() {
    // Spelled out here as they are in storage, as the other top-level keys in this file are. The
    // profile's own module owns the same two names (`profile-storage.js`), and a unit test pins
    // this spelling to it so a rename cannot leave the popup writing a key nobody reads.
    const PROFILE_KEY = 'cognitiveProfileSettings';
    const STRUGGLE_KEY = 'struggleDetectionSettings';

    /**
     * Write one opt-in, and say whether it stuck.
     *
     * The answer matters most when it is no: if switching recording OFF fails, the checkbox would
     * sit there unticked while the content script kept collecting, which is the one outcome this
     * control exists to prevent. The caller puts the control back and says so.
     *
     * @param {string} key - the storage key holding that opt-in
     * @param {boolean} enabled - what the student just asked for
     * @returns {Promise<boolean>} whether storage now holds it
     */
    const writeOptIn = async (key, enabled) => {
      try {
        const stored = await chrome.storage.local.get(key);
        await chrome.storage.local.set({ [key]: { ...(stored?.[key] || {}), enabled } });
        return true;
      } catch {
        return false;
      }
    };

    const status = document.getElementById('learning-profile-delete-status');
    const say = message => {
      if (status) {
        status.textContent = message;
      }
    };

    const deleteRecord = async () => {
      try {
        const removed = await eraseProfileData();
        say(
          removed.length > 0
            ? 'Deleted. Nothing about how you work is stored on this device.'
            : 'There was nothing stored to delete.'
        );
      } catch {
        say('That did not work, so the record is still here. Try again.');
      }
    };

    const profileToggle = document.getElementById('learning-profile-enabled');
    const struggleToggle = document.getElementById('struggle-detection-enabled');
    const deleteButton = document.getElementById('btn-delete-learning-data');

    chrome.storage.local
      .get([PROFILE_KEY, STRUGGLE_KEY])
      .then(stored => {
        if (profileToggle) {
          profileToggle.checked = stored?.[PROFILE_KEY]?.enabled === true;
        }
        if (struggleToggle) {
          struggleToggle.checked = stored?.[STRUGGLE_KEY]?.enabled === true;
        }
      })
      .catch(() => {
        // Both boxes stay as the markup left them, unticked, which is what "off" looks like. Saying
        // so beats a control that silently claims to know a state it could not read.
        say('Could not read whether these are on. Reopen the popup to check.');
      });

    // A checkbox binds `change` directly: the shared handler's preventDefault() on mousedown would
    // cancel the flip.
    profileToggle?.addEventListener('change', async event => {
      const enabled = event.target.checked;
      if (!(await writeOptIn(PROFILE_KEY, enabled))) {
        event.target.checked = !enabled;
        say(
          enabled
            ? 'That did not save, so nothing is being recorded. Try again.'
            : 'That did not save, so AssisT is still recording. Try again.'
        );
        return;
      }
      say(
        enabled
          ? 'Recording from now on. You can delete it at any time.'
          : 'Stopped. Nothing new will be recorded. What was recorded before is still here — use ' +
              'Delete this record to remove it.'
      );
    });

    struggleToggle?.addEventListener('change', async event => {
      const enabled = event.target.checked;
      if (!(await writeOptIn(STRUGGLE_KEY, enabled))) {
        event.target.checked = !enabled;
        say(
          enabled
            ? 'That did not save, so help will not be offered. Try again.'
            : 'That did not save, so AssisT is still watching for this. Try again.'
        );
      }
    });

    if (deleteButton) {
      attachAccessibleHandler(deleteButton, 'Delete learning record', () =>
        this.confirmDeleteLearningRecord(deleteButton, deleteRecord)
      );
    }
  }

  setupPomodoro() {
    if (!this.settings.pomodoro) {
      this.settings.pomodoro = {
        enabled: false,
        workDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        sessionsUntilLongBreak: 4,
        autoStartBreaks: false,
        autoStartWork: false,
        showNotifications: true,
        playSound: true,
        position: 'bottom-right',
      };
    }

    const pomodoroEnabled = document.getElementById('pomodoro-enabled');
    const pomodoroDescription = document.getElementById('pomodoro-description');
    const pomodoroOptions = document.getElementById('pomodoro-options');

    pomodoroEnabled.checked = this.settings.pomodoro.enabled || false;

    if (pomodoroEnabled.checked) {
      pomodoroDescription.classList.remove('hidden');
      pomodoroOptions.classList.remove('hidden');
    } else {
      pomodoroDescription.classList.add('hidden');
      pomodoroOptions.classList.add('hidden');
    }

    pomodoroEnabled.addEventListener('change', e => {
      this.settings.pomodoro.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        pomodoroDescription.classList.remove('hidden');
        pomodoroOptions.classList.remove('hidden');
      } else {
        pomodoroDescription.classList.add('hidden');
        pomodoroOptions.classList.add('hidden');
      }
    });

    // Work Duration slider
    const workSlider = document.getElementById('pomodoro-work-duration');
    const workValue = document.getElementById('pomodoro-work-value');
    workSlider.value = this.settings.pomodoro.workDuration || 25;
    workValue.textContent = `${workSlider.value} min`;
    workSlider.addEventListener('input', e => {
      workValue.textContent = `${e.target.value} min`;
      this.settings.pomodoro.workDuration = parseInt(e.target.value, 10);
      this.saveSettings();
    });

    // Break Duration slider
    const breakSlider = document.getElementById('pomodoro-break-duration');
    const breakValue = document.getElementById('pomodoro-break-value');
    breakSlider.value = this.settings.pomodoro.shortBreakDuration || 5;
    breakValue.textContent = `${breakSlider.value} min`;
    breakSlider.addEventListener('input', e => {
      breakValue.textContent = `${e.target.value} min`;
      this.settings.pomodoro.shortBreakDuration = parseInt(e.target.value, 10);
      this.saveSettings();
    });

    // Long Break slider
    const longBreakSlider = document.getElementById('pomodoro-long-break');
    const longBreakValue = document.getElementById('pomodoro-long-break-value');
    longBreakSlider.value = this.settings.pomodoro.longBreakDuration || 15;
    longBreakValue.textContent = `${longBreakSlider.value} min`;
    longBreakSlider.addEventListener('input', e => {
      longBreakValue.textContent = `${e.target.value} min`;
      this.settings.pomodoro.longBreakDuration = parseInt(e.target.value, 10);
      this.saveSettings();
    });

    // Position select
    const positionSelect = document.getElementById('pomodoro-position');
    positionSelect.value = this.settings.pomodoro.position || 'top-right';
    positionSelect.addEventListener('change', e => {
      this.settings.pomodoro.position = e.target.value;
      this.saveSettings();
    });

    // Auto-start breaks toggle
    const autoBreaksToggle = document.getElementById('pomodoro-auto-start-breaks');
    autoBreaksToggle.checked = this.settings.pomodoro.autoStartBreaks || false;
    autoBreaksToggle.addEventListener('change', e => {
      this.settings.pomodoro.autoStartBreaks = e.target.checked;
      this.saveSettings();
    });

    // Sound toggle
    const soundToggle = document.getElementById('pomodoro-sound');
    soundToggle.checked = this.settings.pomodoro.playSound !== false;
    soundToggle.addEventListener('change', e => {
      this.settings.pomodoro.playSound = e.target.checked;
      this.saveSettings();
    });

    console.log('[Popup] Pomodoro Timer initialized');
  }

  /**
   * Wire the Mind Map switch, the layout select and the two routes into the feature.
   *
   * The two buttons take different roads on purpose. "Open Mind Maps" goes straight to the service
   * worker, because the library is an extension page and must not wait on a content script being
   * present in the current tab — the same reasoning as the citation guide button. "Map this page"
   * needs the page's own text, so it can only go through the content script, and says so plainly
   * when there is none to answer.
   */
  setupMindMap() {
    if (!this.settings.mindMap) {
      // The whole default, not the half the popup draws: the editor page reads autosave and
      // readAloud out of the same object and must not find them undefined.
      this.settings.mindMap = { enabled: true, layout: 'map', autosave: true, readAloud: true };
    }

    const mindMapEnabled = document.getElementById('mind-map-enabled');
    const mindMapOptions = document.getElementById('mind-map-options-container');

    // Guard: the popup variant may not draw this section — skip rather than abort popup init.
    if (!mindMapEnabled || !mindMapOptions) {
      return;
    }

    mindMapEnabled.checked = this.settings.mindMap.enabled !== false; // default ON
    mindMapOptions.classList.toggle('hidden', !mindMapEnabled.checked);

    mindMapEnabled.addEventListener('change', e => {
      this.settings.mindMap.enabled = e.target.checked;
      this.saveSettings();
      mindMapOptions.classList.toggle('hidden', !e.target.checked);
    });

    const mindMapLayout = document.getElementById('mind-map-layout');
    if (mindMapLayout) {
      mindMapLayout.value = this.settings.mindMap.layout || 'map';
      mindMapLayout.addEventListener('change', e => {
        this.settings.mindMap.layout = e.target.value;
        this.saveSettings();
      });
    }

    const mindMapTarget = document.getElementById('mind-map-target');
    if (mindMapTarget) {
      this.setupMindMapTarget(mindMapTarget);
    }

    const btnOpenMindMaps = document.getElementById('btn-open-mind-maps');
    if (btnOpenMindMaps) {
      this.attachInteractiveHandler(btnOpenMindMaps, 'Open Mind Maps Button', async () => {
        try {
          await chrome.runtime.sendMessage({ type: 'OPEN_MIND_MAP' });
          this.updateStatus('Opening your mind maps...', 'info');
          setTimeout(() => window.close(), 300);
        } catch (error) {
          console.error('[Popup] Error opening mind maps:', error);
          this.updateStatus('Failed to open mind maps', 'error');
        }
      });
    }

    const btnMapThisPage = document.getElementById('btn-map-this-page');
    if (btnMapThisPage) {
      this.attachInteractiveHandler(btnMapThisPage, 'Map This Page Button', async () => {
        this.updateStatus('Reading this page...', 'processing');
        try {
          const response = await chrome.tabs.sendMessage(this.currentTab.id, {
            type: 'MINDMAP_MAP_PAGE',
          });
          if (response?.success) {
            this.updateStatus('Building your map...', 'success');
            setTimeout(() => window.close(), 300);
          } else {
            this.updateStatus(response?.error || 'Could not map this page', 'error');
          }
        } catch (error) {
          // No content script answered — a settings page, the Web Store, or a PDF viewer.
          console.error('[Popup] Map this page failed:', error);
          this.updateStatus('Open a web page first', 'error');
        }
      });
    }
  }

  /**
   * Fill the "Highlights go to" picker and remember what the student chooses.
   *
   * The maps live in the service worker's database, so the popup has to ask for the list; the
   * markup ships with the Inbox option already in place so the control still means something
   * before — or without — an answer. Nothing here may throw: a student capturing a highlight is
   * mid-reading, and a picker that could not be filled must fall back to the Inbox rather than
   * take the rest of the popup down with it.
   *
   * The stored choice is applied after the list arrives, and only if that map is still there — a
   * map the student has since deleted leaves the select showing Inbox, which is where the captures
   * will genuinely land.
   *
   * @param {HTMLSelectElement} select
   * @returns {Promise<void>}
   */
  async setupMindMapTarget(select) {
    let chosen = INBOX_ID;

    try {
      const stored = await chrome.storage.local.get(TARGET_KEY);
      chosen = stored?.mindMapTarget || INBOX_ID;

      const response = await chrome.runtime.sendMessage({ type: 'MINDMAP_LIST' });
      (response?.maps || []).forEach(map => {
        // The Inbox is already the first option; listing it again would offer the same map twice.
        if (map.id === INBOX_ID) {
          return;
        }
        const option = document.createElement('option');
        option.value = map.id;
        option.textContent = map.title;
        select.appendChild(option);
      });
    } catch (error) {
      console.warn('[Popup] Could not list mind maps for the target picker:', error);
    }

    select.value = [...select.options].some(option => option.value === chosen) ? chosen : INBOX_ID;

    // A select binds `change` directly: the shared handler's preventDefault on mousedown would
    // stop the list opening at all. The write goes through mindmap-keys.js so the popup and the
    // service worker cannot drift about where the choice is stored.
    select.addEventListener('change', e => {
      writeTargetId(e.target.value);
    });
  }

  setupCanvasIntegration() {
    // Settings normally arrive already merged over the defaults. Running the branch through the same
    // merge here covers a raw stored object too, and upgrades a quiz helper an older version stored
    // as a bare boolean, so every quizHelper.<option> read below has an object to read.
    this.settings.canvasIntegration = StorageManager.withDefaults({
      canvasIntegration: this.settings.canvasIntegration ?? {},
    }).canvasIntegration;

    const canvasIntegrationEnabled = document.getElementById('canvas-integration-enabled');
    const canvasIntegrationDescription = document.getElementById('canvas-integration-description');
    const canvasIntegrationOptions = document.getElementById('canvas-integration-options');

    // Guard: if the Canvas section isn't present in this popup variant, skip wiring it
    // rather than throwing and aborting the whole popup init chain.
    if (!canvasIntegrationEnabled) {
      return;
    }

    // Set initial state
    canvasIntegrationEnabled.checked = this.settings.canvasIntegration.enabled !== false; // default ON from 1.0

    // Show/hide description and options based on enabled state
    if (canvasIntegrationEnabled.checked) {
      canvasIntegrationDescription.classList.remove('hidden');
      canvasIntegrationOptions.classList.remove('hidden');
    } else {
      canvasIntegrationDescription.classList.add('hidden');
      canvasIntegrationOptions.classList.add('hidden');
    }

    // Toggle event
    canvasIntegrationEnabled.addEventListener('change', e => {
      this.settings.canvasIntegration.enabled = e.target.checked;
      this.saveSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        canvasIntegrationDescription.classList.remove('hidden');
        canvasIntegrationOptions.classList.remove('hidden');
      } else {
        canvasIntegrationDescription.classList.add('hidden');
        canvasIntegrationOptions.classList.add('hidden');
      }
    });

    // Assignment Reader toggle
    const assignmentReaderCheckbox = document.getElementById('canvas-assignment-reader');
    assignmentReaderCheckbox.checked = this.settings.canvasIntegration.assignmentReader !== false;
    assignmentReaderCheckbox.addEventListener('change', e => {
      this.settings.canvasIntegration.assignmentReader = e.target.checked;
      this.saveSettings();
    });

    const quizHelperCheckbox = document.getElementById('canvas-quiz-helper');
    const quizHelperOptions = document.getElementById('quiz-helper-options');

    // Set initial state
    const quizHelperEnabled = this.settings.canvasIntegration.quizHelper.enabled === true;

    quizHelperCheckbox.checked = quizHelperEnabled;

    // Show/hide options based on enabled state
    if (quizHelperEnabled) {
      quizHelperOptions.classList.remove('hidden');
    } else {
      quizHelperOptions.classList.add('hidden');
    }

    // Quiz Helper main toggle
    quizHelperCheckbox.addEventListener('change', e => {
      this.settings.canvasIntegration.quizHelper.enabled = e.target.checked;
      this.saveSettings();

      // Toggle options visibility
      if (e.target.checked) {
        quizHelperOptions.classList.remove('hidden');
      } else {
        quizHelperOptions.classList.add('hidden');
      }
    });

    // Quiz Helper sub-options
    const quizReadAnswers = document.getElementById('quiz-read-answers');
    quizReadAnswers.checked = this.settings.canvasIntegration.quizHelper.readAnswers !== false;
    quizReadAnswers.addEventListener('change', e => {
      this.settings.canvasIntegration.quizHelper.readAnswers = e.target.checked;
      this.saveSettings();
    });

    const quizAutoRead = document.getElementById('quiz-auto-read');
    quizAutoRead.checked = this.settings.canvasIntegration.quizHelper.autoRead || false;
    quizAutoRead.addEventListener('change', e => {
      this.settings.canvasIntegration.quizHelper.autoRead = e.target.checked;
      this.saveSettings();
    });

    const quizHighlightQuestion = document.getElementById('quiz-highlight-question');
    quizHighlightQuestion.checked =
      this.settings.canvasIntegration.quizHelper.highlightQuestion !== false;
    quizHighlightQuestion.addEventListener('change', e => {
      this.settings.canvasIntegration.quizHelper.highlightQuestion = e.target.checked;
      this.saveSettings();
    });

    const quizHighlightColor = document.getElementById('quiz-highlight-color');
    quizHighlightColor.value =
      this.settings.canvasIntegration.quizHelper.highlightColor || '#4A90E2';
    quizHighlightColor.addEventListener('change', e => {
      this.settings.canvasIntegration.quizHelper.highlightColor = e.target.value;
      this.saveSettings();
    });

    const quizKeyboardNav = document.getElementById('quiz-keyboard-nav');
    quizKeyboardNav.checked =
      this.settings.canvasIntegration.quizHelper.keyboardNavigation !== false;
    quizKeyboardNav.addEventListener('change', e => {
      this.settings.canvasIntegration.quizHelper.keyboardNavigation = e.target.checked;
      this.saveSettings();
    });

    // Keyboard Nav toggle (disabled for now - future feature)
    const keyboardNavCheckbox = document.getElementById('canvas-keyboard-nav');
    if (keyboardNavCheckbox) {
      keyboardNavCheckbox.checked = this.settings.canvasIntegration.keyboardNav || false;
    }

    console.log('[Popup] Canvas Integration initialized', this.settings.canvasIntegration);
  }

  setupMoodleIntegration() {
    if (!this.settings.moodleIntegration) {
      this.settings.moodleIntegration = {
        enabled: false,
        assignmentReader: true,
        forumReader: true,
        pageReader: true,
        quizHelper: false,
      };
    }

    const moodleEnabled = document.getElementById('moodle-integration-enabled');
    const moodleDescription = document.getElementById('moodle-integration-description');
    const moodleOptions = document.getElementById('moodle-integration-options');

    if (!moodleEnabled) {
      console.warn('[Popup] Moodle Integration elements not found');
      return;
    }

    moodleEnabled.checked = this.settings.moodleIntegration.enabled !== false; // default ON from 1.0

    const setMoodleVisibility = enabled => {
      if (enabled) {
        moodleDescription?.classList.remove('hidden');
        moodleOptions?.classList.remove('hidden');
      } else {
        moodleDescription?.classList.add('hidden');
        moodleOptions?.classList.add('hidden');
      }
    };

    setMoodleVisibility(moodleEnabled.checked);

    moodleEnabled.addEventListener('change', e => {
      this.settings.moodleIntegration.enabled = e.target.checked;
      this.saveSettings();
      setMoodleVisibility(e.target.checked);
    });

    const moodleAssignmentReader = document.getElementById('moodle-assignment-reader');
    if (moodleAssignmentReader) {
      moodleAssignmentReader.checked = this.settings.moodleIntegration.assignmentReader !== false;
      moodleAssignmentReader.addEventListener('change', e => {
        this.settings.moodleIntegration.assignmentReader = e.target.checked;
        this.saveSettings();
      });
    }

    const moodleForumReader = document.getElementById('moodle-forum-reader');
    if (moodleForumReader) {
      moodleForumReader.checked = this.settings.moodleIntegration.forumReader !== false;
      moodleForumReader.addEventListener('change', e => {
        this.settings.moodleIntegration.forumReader = e.target.checked;
        this.saveSettings();
      });
    }

    const moodlePageReader = document.getElementById('moodle-page-reader');
    if (moodlePageReader) {
      moodlePageReader.checked = this.settings.moodleIntegration.pageReader !== false;
      moodlePageReader.addEventListener('change', e => {
        this.settings.moodleIntegration.pageReader = e.target.checked;
        this.saveSettings();
      });
    }

    // Quiz helper — disabled in HTML until implemented; wired to storage only
    const moodleQuizHelper = document.getElementById('moodle-quiz-helper');
    if (moodleQuizHelper) {
      moodleQuizHelper.checked = this.settings.moodleIntegration.quizHelper || false;
      moodleQuizHelper.addEventListener('change', e => {
        this.settings.moodleIntegration.quizHelper = e.target.checked;
        this.saveSettings();
      });
    }

    console.log('[Popup] Moodle Integration initialized', this.settings.moodleIntegration);
  }

  setupGoogleClassroomIntegration() {
    if (!this.settings.googleClassroomIntegration) {
      this.settings.googleClassroomIntegration = {
        enabled: false,
        assignmentReader: true,
        streamReader: true,
        classworkReader: true,
      };
    }

    const classroomEnabled = document.getElementById('google-classroom-integration-enabled');
    const classroomDescription = document.getElementById(
      'google-classroom-integration-description'
    );
    const classroomOptions = document.getElementById('google-classroom-integration-options');

    if (!classroomEnabled) {
      console.warn('[Popup] Google Classroom Integration elements not found');
      return;
    }

    classroomEnabled.checked = this.settings.googleClassroomIntegration.enabled !== false; // default ON from 1.0

    const setClassroomVisibility = enabled => {
      if (enabled) {
        classroomDescription?.classList.remove('hidden');
        classroomOptions?.classList.remove('hidden');
      } else {
        classroomDescription?.classList.add('hidden');
        classroomOptions?.classList.add('hidden');
      }
    };

    setClassroomVisibility(classroomEnabled.checked);

    classroomEnabled.addEventListener('change', e => {
      this.settings.googleClassroomIntegration.enabled = e.target.checked;
      this.saveSettings();
      setClassroomVisibility(e.target.checked);
    });

    const classroomAssignmentReader = document.getElementById('google-classroom-assignment-reader');
    if (classroomAssignmentReader) {
      classroomAssignmentReader.checked =
        this.settings.googleClassroomIntegration.assignmentReader !== false;
      classroomAssignmentReader.addEventListener('change', e => {
        this.settings.googleClassroomIntegration.assignmentReader = e.target.checked;
        this.saveSettings();
      });
    }

    const classroomStreamReader = document.getElementById('google-classroom-stream-reader');
    if (classroomStreamReader) {
      classroomStreamReader.checked =
        this.settings.googleClassroomIntegration.streamReader !== false;
      classroomStreamReader.addEventListener('change', e => {
        this.settings.googleClassroomIntegration.streamReader = e.target.checked;
        this.saveSettings();
      });
    }

    const classroomClassworkReader = document.getElementById('google-classroom-classwork-reader');
    if (classroomClassworkReader) {
      classroomClassworkReader.checked =
        this.settings.googleClassroomIntegration.classworkReader !== false;
      classroomClassworkReader.addEventListener('change', e => {
        this.settings.googleClassroomIntegration.classworkReader = e.target.checked;
        this.saveSettings();
      });
    }

    console.log(
      '[Popup] Google Classroom Integration initialized',
      this.settings.googleClassroomIntegration
    );
  }

  /**
   * Wire View Session Statistics: the words per minute, accuracy, word count and time of the
   * dictation on this page, asked of the page and shown in a dialog.
   */
  setupSTTStats() {
    const showStatsBtn = document.getElementById('stt-show-stats');
    const statsSummary = document.getElementById('stt-stats-summary');
    if (!showStatsBtn || !statsSummary) {
      return;
    }

    this.attachInteractiveHandler(showStatsBtn, 'STT Show Stats Button', async () => {
      const opened = this.showPanelInSheet({
        id: 'stt-stats-dialog',
        heading: 'Dictation statistics',
        panel: statsSummary,
        opener: showStatsBtn,
      });
      if (!opened) {
        return;
      }
      try {
        const response = await chrome.tabs.sendMessage(this.currentTab.id, {
          type: 'GET_STT_STATS',
        });
        if (response && response.stats) {
          this.updateSTTStatsDisplay(response.stats);
        }
      } catch {
        console.log('[STT Stats] No response from content script');
      }
    });
  }

  setupSTT() {
    if (!this.settings.stt) {
      this.settings.stt = {
        enabled: false,
        continuousMode: true,
        interimResults: true,
        language: 'en-US',
        autoCapitalize: true,
        punctuationCommands: true,
        floatingButton: true,
      };
    }

    const sttEnabled = document.getElementById('stt-enabled');
    const sttDescription = document.getElementById('stt-description');
    const sttOptions = document.getElementById('stt-options');

    sttEnabled.checked = this.settings.stt.enabled || false;

    if (sttEnabled.checked) {
      sttDescription.classList.remove('hidden');
      sttOptions.classList.remove('hidden');
    } else {
      sttDescription.classList.add('hidden');
      sttOptions.classList.add('hidden');
    }

    sttEnabled.addEventListener('change', e => {
      this.settings.stt.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        sttDescription.classList.remove('hidden');
        sttOptions.classList.remove('hidden');
      } else {
        sttDescription.classList.add('hidden');
        sttOptions.classList.add('hidden');
      }
    });

    // Continuous Mode
    const continuousModeCheckbox = document.getElementById('stt-continuous-mode');
    continuousModeCheckbox.checked = this.settings.stt.continuousMode !== false;
    continuousModeCheckbox.addEventListener('change', e => {
      this.settings.stt.continuousMode = e.target.checked;
      this.saveSettings();
    });

    // Language
    const languageSelect = document.getElementById('stt-language');
    languageSelect.value = this.settings.stt.language || 'en-US';
    languageSelect.addEventListener('change', e => {
      this.settings.stt.language = e.target.value;
      this.saveSettings();
    });

    // Recognition Engine Selection
    const engineSelect = document.getElementById('stt-engine');
    const engineStatusIndicator = document.getElementById('stt-engine-indicator');
    const engineNameDisplay = document.getElementById('stt-engine-name');
    const engineOfflineBadge = document.getElementById('stt-engine-offline-badge');
    const preferOfflineCheckbox = document.getElementById('stt-prefer-offline');

    if (engineSelect) {
      // Initialize engine settings if not present
      if (this.settings.stt.engine === undefined) {
        this.settings.stt.engine = 'auto';
      }
      if (this.settings.stt.preferOffline === undefined) {
        this.settings.stt.preferOffline = true;
      }

      // Whisper is not yet available — reset any stored 'whisper' selection to 'auto'
      if (this.settings.stt.engine === 'whisper') {
        this.settings.stt.engine = 'auto';
        this.saveSettings();
      }

      engineSelect.value = this.settings.stt.engine || 'auto';

      // Update engine status display
      const updateEngineStatus = engineType => {
        const engineNames = {
          auto: 'Web Speech API',
          whisper: 'Whisper (Coming Soon)',
          'web-speech': 'Web Speech API',
        };

        if (engineNameDisplay) {
          engineNameDisplay.textContent = engineNames[engineType] || engineType;
        }

        if (engineStatusIndicator) {
          // Green for ready, yellow for loading, red for error
          engineStatusIndicator.style.background = '#10b981'; // Green by default
        }

        // Never show the OFFLINE badge — Whisper is disabled (coming soon) and
        // the online engine (Web Speech API) does not need an offline badge.
        if (engineOfflineBadge) {
          engineOfflineBadge.classList.add('hidden');
        }
      };

      // Initialize display
      updateEngineStatus(this.settings.stt.engine);

      engineSelect.addEventListener('change', e => {
        this.settings.stt.engine = e.target.value;
        this.saveSettings();

        updateEngineStatus(e.target.value);

        // Notify content script
        this.sendCommandToTab({
          command: 'UPDATE_STT_SETTINGS',
          settings: {
            engine: e.target.value,
            preferOffline: this.settings.stt.preferOffline,
          },
        });
      });
    }

    // Prefer Offline Mode
    if (preferOfflineCheckbox) {
      preferOfflineCheckbox.checked = this.settings.stt.preferOffline !== false;

      preferOfflineCheckbox.addEventListener('change', e => {
        this.settings.stt.preferOffline = e.target.checked;
        this.saveSettings();

        // Notify content script
        this.sendCommandToTab({
          command: 'UPDATE_STT_SETTINGS',
          settings: {
            engine: this.settings.stt.engine,
            preferOffline: e.target.checked,
          },
        });
      });
    }

    // Unified Punctuation Help toggle — sets both punctuationCommands and autoPunctuation
    const punctuationCheckbox = document.getElementById('stt-punctuation');
    if (punctuationCheckbox) {
      if (this.settings.stt.autoPunctuation === undefined) {
        this.settings.stt.autoPunctuation = true;
      }
      if (this.settings.stt.autoPunctuationMode === undefined) {
        this.settings.stt.autoPunctuationMode = 'auto';
      }
      const punctuationEnabled =
        this.settings.stt.punctuationCommands !== false ||
        this.settings.stt.autoPunctuation !== false;
      punctuationCheckbox.checked = punctuationEnabled;

      punctuationCheckbox.addEventListener('change', e => {
        this.settings.stt.punctuationCommands = e.target.checked;
        this.settings.stt.autoPunctuation = e.target.checked;
        this.saveSettings();
        this.sendCommandToTab({
          command: 'UPDATE_STT_SETTINGS',
          settings: {
            punctuationCommands: e.target.checked,
            autoPunctuation: e.target.checked,
            autoPunctuationMode: this.settings.stt.autoPunctuationMode,
          },
        });
      });
    }

    // Punctuation mode select (lives in Advanced section — always present, no show/hide)
    const autoPunctuationModeSelect = document.getElementById('stt-auto-punctuation-mode');
    if (autoPunctuationModeSelect) {
      autoPunctuationModeSelect.value = this.settings.stt.autoPunctuationMode || 'auto';
      autoPunctuationModeSelect.addEventListener('change', e => {
        this.settings.stt.autoPunctuationMode = e.target.value;
        this.saveSettings();
        this.sendCommandToTab({
          command: 'UPDATE_STT_SETTINGS',
          settings: {
            autoPunctuation: this.settings.stt.autoPunctuation,
            autoPunctuationMode: e.target.value,
          },
        });
      });
    }

    this.setupSTTStats();

    // Confidence Feedback
    const confidenceFeedbackCheckbox = document.getElementById('stt-confidence-feedback');
    const confidenceThresholdSlider = document.getElementById('stt-confidence-threshold');
    const confidenceThresholdValue = document.getElementById('stt-confidence-threshold-value');
    const confidenceThresholdSection = document.getElementById('confidence-threshold-section');
    const highlightLowConfidenceCheckbox = document.getElementById('stt-highlight-low-confidence');
    const showAlternativesCheckbox = document.getElementById('stt-show-alternatives');

    if (confidenceFeedbackCheckbox) {
      // Initialize confidence settings if not present
      if (this.settings.stt.confidenceFeedback === undefined) {
        this.settings.stt.confidenceFeedback = true;
      }
      if (this.settings.stt.confidenceThreshold === undefined) {
        this.settings.stt.confidenceThreshold = 60;
      }
      if (this.settings.stt.highlightLowConfidence === undefined) {
        this.settings.stt.highlightLowConfidence = true;
      }
      if (this.settings.stt.showAlternatives === undefined) {
        this.settings.stt.showAlternatives = true;
      }

      // Set initial values
      confidenceFeedbackCheckbox.checked = this.settings.stt.confidenceFeedback !== false;
      if (confidenceThresholdSlider) {
        confidenceThresholdSlider.value = this.settings.stt.confidenceThreshold || 60;
        if (confidenceThresholdValue) {
          confidenceThresholdValue.textContent = `${this.settings.stt.confidenceThreshold || 60}%`;
        }
      }
      if (highlightLowConfidenceCheckbox) {
        highlightLowConfidenceCheckbox.checked = this.settings.stt.highlightLowConfidence !== false;
      }
      if (showAlternativesCheckbox) {
        showAlternativesCheckbox.checked = this.settings.stt.showAlternatives !== false;
      }

      // Show/hide threshold section based on enabled state
      if (confidenceThresholdSection) {
        confidenceThresholdSection.style.display = confidenceFeedbackCheckbox.checked
          ? 'block'
          : 'none';
      }

      // Confidence feedback toggle handler
      confidenceFeedbackCheckbox.addEventListener('change', e => {
        this.settings.stt.confidenceFeedback = e.target.checked;
        this.saveSettings();

        // Show/hide threshold section
        if (confidenceThresholdSection) {
          confidenceThresholdSection.style.display = e.target.checked ? 'block' : 'none';
        }

        // Notify content script
        this.sendCommandToTab({
          command: 'UPDATE_STT_SETTINGS',
          settings: {
            confidenceFeedback: e.target.checked,
            confidenceThreshold: this.settings.stt.confidenceThreshold / 100,
            highlightLowConfidence: this.settings.stt.highlightLowConfidence,
            showAlternatives: this.settings.stt.showAlternatives,
          },
        });
      });

      // Threshold slider handler
      if (confidenceThresholdSlider) {
        confidenceThresholdSlider.addEventListener('input', e => {
          const value = parseInt(e.target.value);
          if (confidenceThresholdValue) {
            confidenceThresholdValue.textContent = `${value}%`;
          }
          // Update color based on value
          const color = value >= 85 ? '#22c55e' : value >= 60 ? '#eab308' : '#ef4444';
          confidenceThresholdValue.style.color = color;
        });

        confidenceThresholdSlider.addEventListener('change', e => {
          this.settings.stt.confidenceThreshold = parseInt(e.target.value);
          this.saveSettings();

          // Notify content script
          this.sendCommandToTab({
            command: 'UPDATE_STT_SETTINGS',
            settings: {
              confidenceFeedback: this.settings.stt.confidenceFeedback,
              confidenceThreshold: parseInt(e.target.value) / 100,
              highlightLowConfidence: this.settings.stt.highlightLowConfidence,
              showAlternatives: this.settings.stt.showAlternatives,
            },
          });
        });
      }

      // Highlight low confidence toggle
      if (highlightLowConfidenceCheckbox) {
        highlightLowConfidenceCheckbox.addEventListener('change', e => {
          this.settings.stt.highlightLowConfidence = e.target.checked;
          this.saveSettings();

          this.sendCommandToTab({
            command: 'UPDATE_STT_SETTINGS',
            settings: {
              highlightLowConfidence: e.target.checked,
            },
          });
        });
      }

      // Show alternatives toggle
      if (showAlternativesCheckbox) {
        showAlternativesCheckbox.addEventListener('change', e => {
          this.settings.stt.showAlternatives = e.target.checked;
          this.saveSettings();

          this.sendCommandToTab({
            command: 'UPDATE_STT_SETTINGS',
            settings: {
              showAlternatives: e.target.checked,
            },
          });
        });
      }
    }

    // Voice Editing Commands
    const voiceCommandsCheckbox = document.getElementById('stt-voice-commands');
    if (voiceCommandsCheckbox) {
      // Initialize voiceCommands setting if not present
      if (this.settings.stt.voiceCommands === undefined) {
        this.settings.stt.voiceCommands = true;
      }
      voiceCommandsCheckbox.checked = this.settings.stt.voiceCommands !== false;
      voiceCommandsCheckbox.addEventListener('change', e => {
        this.settings.stt.voiceCommands = e.target.checked;
        this.saveSettings();
        this.sendCommandToTab({ command: 'UPDATE_STT_SETTINGS', settings: this.settings.stt });
      });

      // Show Commands button
      const showCommandsBtn = document.getElementById('stt-show-commands');
      if (showCommandsBtn) {
        this.attachInteractiveHandler(showCommandsBtn, 'STT Show Commands Button', () => {
          this.showVoiceCommandsModal(showCommandsBtn);
        });
      }
    }

    // Auto Capitalize
    const autoCapitalizeCheckbox = document.getElementById('stt-auto-capitalize');
    autoCapitalizeCheckbox.checked = this.settings.stt.autoCapitalize !== false;
    autoCapitalizeCheckbox.addEventListener('change', e => {
      this.settings.stt.autoCapitalize = e.target.checked;
      this.saveSettings();
    });

    // Interim Results
    const interimResultsCheckbox = document.getElementById('stt-interim-results');
    interimResultsCheckbox.checked = this.settings.stt.interimResults !== false;
    interimResultsCheckbox.addEventListener('change', e => {
      this.settings.stt.interimResults = e.target.checked;
      this.saveSettings();
    });

    // Floating Button
    const floatingButtonCheckbox = document.getElementById('stt-floating-button');
    floatingButtonCheckbox.checked = this.settings.stt.floatingButton !== false;
    floatingButtonCheckbox.addEventListener('change', e => {
      this.settings.stt.floatingButton = e.target.checked;
      this.saveSettings();
    });

    // Custom Vocabulary
    this.initializeVocabulary();

    console.log('[Popup] STT initialized');
  }

  /**
   * Initialize Custom Vocabulary UI
   * Handles vocabulary presets, word management, import/export
   */
  async initializeVocabulary() {
    // Initialize vocabulary settings if not present
    if (!this.settings.stt.vocabulary) {
      this.settings.stt.vocabulary = {
        autoLearn: true,
        enabledPresets: [],
        customWords: [],
      };
    }

    // Auto-learn toggle
    const autoLearnCheckbox = document.getElementById('stt-auto-learn');
    if (autoLearnCheckbox) {
      autoLearnCheckbox.checked = this.settings.stt.vocabulary.autoLearn !== false;
      autoLearnCheckbox.addEventListener('change', e => {
        this.settings.stt.vocabulary.autoLearn = e.target.checked;
        this.saveSettings();
        this.sendCommandToTab({
          command: 'UPDATE_VOCABULARY_SETTINGS',
          settings: { autoLearnEnabled: e.target.checked },
        });
      });
    }

    // Vocabulary preset buttons
    const presetButtons = document.querySelectorAll('.preset-chip');
    presetButtons.forEach(btn => {
      const preset = btn.dataset.preset;
      const isEnabled = this.settings.stt.vocabulary.enabledPresets?.includes(preset);

      // Set initial state
      this.updatePresetButtonState(btn, isEnabled);

      this.attachInteractiveHandler(btn, 'Vocabulary Preset Button', async () => {
        const currentlyEnabled = btn.getAttribute('aria-pressed') === 'true';
        const newState = !currentlyEnabled;

        // Update UI immediately for responsiveness
        this.updatePresetButtonState(btn, newState);

        // Update settings
        if (newState) {
          if (!this.settings.stt.vocabulary.enabledPresets) {
            this.settings.stt.vocabulary.enabledPresets = [];
          }
          if (!this.settings.stt.vocabulary.enabledPresets.includes(preset)) {
            this.settings.stt.vocabulary.enabledPresets.push(preset);
          }
        } else {
          this.settings.stt.vocabulary.enabledPresets =
            this.settings.stt.vocabulary.enabledPresets.filter(p => p !== preset);
        }

        this.saveSettings();

        // Send command to content script to load/unload preset
        this.sendCommandToTab({
          command: newState ? 'LOAD_VOCABULARY_PRESET' : 'UNLOAD_VOCABULARY_PRESET',
          preset,
        });

        // Update word counts
        this.updateVocabularyStats();
      });
    });

    // Add Word button
    const addWordBtn = document.getElementById('btn-add-vocab-word');
    if (addWordBtn) {
      this.attachInteractiveHandler(addWordBtn, 'Add Vocabulary Word Button', () => {
        this.showAddVocabularyWordModal(addWordBtn);
      });
    }

    // Manage Vocabulary button
    const manageBtn = document.getElementById('btn-manage-vocabulary');
    if (manageBtn) {
      this.attachInteractiveHandler(manageBtn, 'Manage Vocabulary Button', () => {
        this.showManageVocabularyModal(manageBtn);
      });
    }

    // Import button
    const importBtn = document.getElementById('btn-import-vocabulary');
    if (importBtn) {
      this.attachInteractiveHandler(importBtn, 'Import Vocabulary Button', () => {
        this.importVocabulary();
      });
    }

    // Export button
    const exportBtn = document.getElementById('btn-export-vocabulary');
    if (exportBtn) {
      this.attachInteractiveHandler(exportBtn, 'Export Vocabulary Button', () => {
        this.exportVocabulary();
      });
    }

    // Update initial stats
    this.updateVocabularyStats();

    console.log('[Popup] Vocabulary controls initialized');
  }

  /**
   * Update preset button visual state
   */
  updatePresetButtonState(btn, enabled) {
    btn.setAttribute('aria-pressed', enabled.toString());
    if (enabled) {
      btn.style.background = 'linear-gradient(135deg, #4a90d9, #357abd)';
      btn.style.color = 'white';
      btn.style.borderColor = '#357abd';
    } else {
      btn.style.background = '#f5f5f5';
      btn.style.color = '#333';
      btn.style.borderColor = '#ddd';
    }
  }

  /**
   * Update vocabulary statistics display
   */
  async updateVocabularyStats() {
    const customCountEl = document.getElementById('vocab-word-count');
    const presetCountEl = document.getElementById('vocab-preset-count');

    if (!customCountEl || !presetCountEl) {
      return;
    }

    try {
      // Get counts from content script
      const response = await this.sendCommandToTabWithResponse({
        command: 'GET_VOCABULARY_STATS',
      });

      if (response && response.stats) {
        customCountEl.textContent = response.stats.customCount || 0;
        presetCountEl.textContent = response.stats.presetCount || 0;
      } else {
        // Fallback to settings
        customCountEl.textContent = this.settings.stt.vocabulary.customWords?.length || 0;

        let presetCount = 0;
        const presetSizes = { medical: 48, legal: 38, academic: 31, stem: 43 };
        for (const preset of this.settings.stt.vocabulary.enabledPresets || []) {
          presetCount += presetSizes[preset] || 0;
        }
        presetCountEl.textContent = presetCount;
      }
    } catch (error) {
      console.warn('[Popup] Could not get vocabulary stats:', error);
      customCountEl.textContent = this.settings.stt.vocabulary.customWords?.length || 0;
      presetCountEl.textContent = '0';
    }
  }

  /**
   * Show the Add Custom Word dialog.
   *
   * @param {HTMLElement} [opener] - the control that opened it; the keyboard goes back there on
   *   every way out, including after a word has been added.
   */
  showAddVocabularyWordModal(opener) {
    const existingModal = document.getElementById('add-vocab-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'add-vocab-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    // Safe innerHTML: hardcoded modal content (no user input)
    modal.innerHTML = `
      <div id="add-vocab-dialog" style="background: white; border-radius: 12px; padding: 20px; width: 300px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 id="add-vocab-title" style="margin: 0; font-size: 16px;">Add Custom Word</h3>
          <button id="close-add-vocab-modal" aria-label="Close add custom word" style="background: none; border: none; font-size: 20px; cursor: pointer;">&times;</button>
        </div>
        <div style="margin-bottom: 12px;">
          <label for="vocab-word-input" style="display: block; font-size: 12px; margin-bottom: 4px; color: #666;">Word or Phrase:</label>
          <input type="text" id="vocab-word-input" aria-describedby="vocab-word-error" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;" placeholder="e.g., adenocarcinoma">
          <span id="vocab-word-error" role="alert" style="display: block; margin-top: 4px; font-size: 12px; color: #b3251e;"></span>
          <button id="suggest-pronunciation-btn" style="display: none; margin-top: 6px; padding: 5px 10px; border: 1px solid #4a90d9; border-radius: 6px; background: #f0f7ff; color: #357abd; font-size: 12px; cursor: pointer;">Suggest Pronunciation</button>
          <span id="pronunciation-result" role="status" aria-live="polite" style="display: block; margin-top: 5px; font-size: 12px; color: #555; min-height: 18px;"></span>
        </div>
        <div style="margin-bottom: 16px;">
          <label for="vocab-phonetic-input" style="display: block; font-size: 12px; margin-bottom: 4px; color: #666;">Pronunciation Hint (optional):</label>
          <input type="text" id="vocab-phonetic-input" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box;" placeholder="e.g., ad-uh-no-kar-suh-NO-muh">
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="cancel-add-vocab" style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 6px; background: #f5f5f5; cursor: pointer;">Cancel</button>
          <button id="confirm-add-vocab" style="flex: 1; padding: 8px; border: none; border-radius: 6px; background: linear-gradient(135deg, #4a90d9, #357abd); color: white; cursor: pointer;">Add Word</button>
        </div>
      </div>
    `;

    const wordInput = modal.querySelector('#vocab-word-input');
    const wordError = modal.querySelector('#vocab-word-error');

    const closeModal = this.openPopupDialog({
      backdrop: modal,
      dialog: modal.querySelector('#add-vocab-dialog'),
      labelledBy: 'add-vocab-title',
      opener,
      initialFocus: wordInput,
    });

    /**
     * Say what is wrong where the student is working, rather than in a browser alert box.
     * `role="alert"` on the element means a screen reader reads it as it appears, and the field
     * points at it with aria-describedby so it is read again on focus (SC 3.3.1).
     * @param {string} message - empty clears it.
     */
    const showWordError = message => {
      wordError.textContent = message;
      if (message) {
        wordInput.setAttribute('aria-invalid', 'true');
        wordInput.style.borderColor = '#b3251e';
        wordInput.focus();
      } else {
        wordInput.removeAttribute('aria-invalid');
        wordInput.style.borderColor = '#ddd';
      }
    };

    this.attachInteractiveHandler(
      modal.querySelector('#close-add-vocab-modal'),
      'Close Add Vocab Modal Button',
      closeModal
    );
    this.attachInteractiveHandler(
      modal.querySelector('#cancel-add-vocab'),
      'Cancel Add Vocab Button',
      closeModal
    );

    const addWord = () => {
      const word = wordInput.value.trim();
      const phonetic = modal.querySelector('#vocab-phonetic-input').value.trim();

      if (!word) {
        showWordError('Enter a word or phrase to add.');
        return;
      }

      // Add to settings
      if (!this.settings.stt.vocabulary.customWords) {
        this.settings.stt.vocabulary.customWords = [];
      }

      const exists = this.settings.stt.vocabulary.customWords.some(
        w => w.word.toLowerCase() === word.toLowerCase()
      );

      if (exists) {
        showWordError(`"${word}" is already in your vocabulary.`);
        return;
      }

      this.settings.stt.vocabulary.customWords.push({ word, phonetic });
      this.saveSettings();

      // Send to content script
      this.sendCommandToTab({
        command: 'ADD_VOCABULARY_WORD',
        word,
        phonetic,
      });

      this.updateVocabularyStats();
      closeModal();
    };

    this.attachInteractiveHandler(
      modal.querySelector('#confirm-add-vocab'),
      'Confirm Add Vocab Button',
      addWord
    );

    // Enter in the field submits. It calls addWord directly: the confirm button answers mousedown
    // and Enter/Space on itself, so a synthetic .click() on it did nothing at all.
    wordInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addWord();
      }
    });

    // Show/hide "Suggest Pronunciation" button based on input content
    const suggestBtn = modal.querySelector('#suggest-pronunciation-btn');
    const pronunciationResult = modal.querySelector('#pronunciation-result');

    wordInput.addEventListener('input', () => {
      const hasText = wordInput.value.trim().length > 0;
      suggestBtn.style.display = hasText ? 'inline-block' : 'none';
      // Clear both messages: the student is answering the one they were given.
      showWordError('');
      pronunciationResult.textContent = '';
      pronunciationResult.style.color = '#555';
    });

    // Suggest Pronunciation button handler
    this.attachInteractiveHandler(suggestBtn, 'Suggest Pronunciation Button', async () => {
      const word = wordInput.value.trim();
      if (!word) {
        return;
      }

      pronunciationResult.textContent = 'Checking pronunciation\u2026';
      pronunciationResult.style.color = '#888';
      suggestBtn.disabled = true;

      try {
        const modeInfo = await getAIMode('stt');
        const availability = await checkAIAvailable(modeInfo);

        if (!availability.available) {
          pronunciationResult.textContent =
            'AI unavailable \u2014 pronunciation suggestion requires AI to be enabled';
          pronunciationResult.style.color = '#c0392b';
          return;
        }

        const prompt = `Provide a simple phonetic pronunciation guide for the word: "${word}". Reply with only the phonetic spelling, nothing else. Example format: 'SOK-ra-teez' for 'Socrates'.`;
        const result = await generateWithAI(prompt, modeInfo, { maxTokens: 60 });

        if (result && result.text) {
          pronunciationResult.textContent = `Pronunciation: ${result.text.trim()}`;
          pronunciationResult.style.color = '#27ae60';
        } else {
          pronunciationResult.textContent =
            'Could not generate pronunciation \u2014 check AI settings';
          pronunciationResult.style.color = '#c0392b';
        }
      } catch (err) {
        console.warn('[Popup] Pronunciation suggestion failed:', err);
        pronunciationResult.textContent =
          'Could not generate pronunciation \u2014 check AI settings';
        pronunciationResult.style.color = '#c0392b';
      } finally {
        suggestBtn.disabled = false;
      }
    });
  }

  /**
   * Show the Manage Custom Words dialog.
   *
   * @param {HTMLElement} [opener] - the control that opened it; the keyboard goes back there on
   *   every way out, including after a word has been deleted and the list redrawn.
   */
  showManageVocabularyModal(opener) {
    const existingModal = document.getElementById('manage-vocab-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const customWords = this.settings.stt.vocabulary.customWords || [];

    const modal = document.createElement('div');
    modal.id = 'manage-vocab-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    const wordsList =
      customWords.length > 0
        ? customWords
            .map(
              (w, i) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">
              <div>
                <span style="font-weight: 500;">${sanitizeText(w.word)}</span>
                ${w.phonetic ? `<span style="font-size: 11px; color: #888; margin-left: 8px;">(${sanitizeText(w.phonetic)})</span>` : ''}
              </div>
              <button class="delete-vocab-word" data-index="${i}" aria-label="Delete ${sanitizeText(w.word)}" style="background: #ff4757; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px;">Delete</button>
            </div>
          `
            )
            .join('')
        : '<p style="text-align: center; color: #888; padding: 20px;">No custom words added yet.</p>';

    // Safe innerHTML: hardcoded modal content (no user input)
    modal.innerHTML = `
      <div id="manage-vocab-dialog" style="background: white; border-radius: 12px; padding: 20px; width: 350px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 id="manage-vocab-title" style="margin: 0; font-size: 16px;">Manage Custom Words</h3>
          <button id="close-manage-vocab-modal" aria-label="Close manage custom words" style="background: none; border: none; font-size: 20px; cursor: pointer;">&times;</button>
        </div>
        <div style="flex: 1; overflow-y: auto; max-height: 300px; border: 1px solid #eee; border-radius: 6px;">
          ${wordsList}
        </div>
        <div style="margin-top: 12px; display: flex; gap: 8px;">
          <button id="clear-all-vocab" style="flex: 1; padding: 8px; border: 1px solid #e74c3c; border-radius: 6px; background: white; color: #e74c3c; cursor: pointer; font-size: 12px;">Clear All</button>
          <button id="done-manage-vocab" style="flex: 1; padding: 8px; border: none; border-radius: 6px; background: linear-gradient(135deg, #4a90d9, #357abd); color: white; cursor: pointer; font-size: 12px;">Done</button>
        </div>
      </div>
    `;

    const dialog = modal.querySelector('#manage-vocab-dialog');

    // The panel itself takes the keyboard: the dialog is announced by its heading and the student
    // can read the list before Tab reaches anything — and it is never a Delete button that the
    // keyboard lands on.
    dialog.tabIndex = -1;

    // openPopupDialog appends it, names it, traps Tab, wires Escape and the backdrop press, and
    // hands the keyboard back to `opener` on every way out.
    const closeModal = this.openPopupDialog({
      backdrop: modal,
      dialog,
      labelledBy: 'manage-vocab-title',
      opener,
      initialFocus: dialog,
    });

    this.attachInteractiveHandler(
      document.getElementById('close-manage-vocab-modal'),
      'Close Manage Vocab Modal Button',
      closeModal
    );
    this.attachInteractiveHandler(
      document.getElementById('done-manage-vocab'),
      'Done Manage Vocab Button',
      closeModal
    );

    // Delete word buttons
    modal.querySelectorAll('.delete-vocab-word').forEach(btn => {
      this.attachInteractiveHandler(btn, 'Delete Vocab Word Button', () => {
        const index = parseInt(btn.dataset.index);
        const word = this.settings.stt.vocabulary.customWords[index];

        this.settings.stt.vocabulary.customWords.splice(index, 1);
        this.saveSettings();

        this.sendCommandToTab({
          command: 'DELETE_VOCABULARY_WORD',
          word: word.word,
        });

        this.updateVocabularyStats();
        closeModal();
        // Redraw the list with the word gone. The opener is carried through, so the keyboard goes
        // into the new dialog rather than being dropped on <body> with the button it was on.
        this.showManageVocabularyModal(opener);
      });
    });

    // Clear all button
    this.attachInteractiveHandler(
      document.getElementById('clear-all-vocab'),
      'Clear All Vocab Button',
      () => {
        if (confirm('Are you sure you want to delete all custom words?')) {
          this.settings.stt.vocabulary.customWords = [];
          this.saveSettings();

          this.sendCommandToTab({ command: 'CLEAR_VOCABULARY' });

          this.updateVocabularyStats();
          closeModal();
        }
      }
    );
  }

  /**
   * Import vocabulary from file
   */
  importVocabulary() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.json';

    input.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) {
        return;
      }

      try {
        const content = await file.text();
        let words = [];

        if (file.name.endsWith('.json')) {
          const data = JSON.parse(content);
          words = Array.isArray(data) ? data : data.vocabulary || [];
        } else {
          // Text format: one word per line, optional "word|phonetic" format
          words = content
            .split('\n')
            .filter(line => line.trim())
            .map(line => {
              const parts = line.split('|');
              return {
                word: parts[0].trim(),
                phonetic: parts[1] ? parts[1].trim() : '',
              };
            });
        }

        // Add to settings
        if (!this.settings.stt.vocabulary.customWords) {
          this.settings.stt.vocabulary.customWords = [];
        }

        const existingWords = new Set(
          this.settings.stt.vocabulary.customWords.map(w => w.word.toLowerCase())
        );

        let addedCount = 0;
        for (const word of words) {
          if (!existingWords.has(word.word.toLowerCase())) {
            this.settings.stt.vocabulary.customWords.push(word);
            addedCount++;
          }
        }

        this.saveSettings();

        // Send to content script
        this.sendCommandToTab({
          command: 'IMPORT_VOCABULARY',
          words: words,
        });

        this.updateVocabularyStats();
        alert(`Imported ${addedCount} new words.`);
      } catch (error) {
        console.error('[Popup] Import vocabulary failed:', error);
        alert('Failed to import vocabulary. Please check the file format.');
      }
    });

    input.click();
  }

  /**
   * Export vocabulary to file
   */
  exportVocabulary() {
    const words = this.settings.stt.vocabulary.customWords || [];

    if (words.length === 0) {
      alert('No custom words to export.');
      return;
    }

    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      vocabulary: words,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `assist-vocabulary-${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  /**
   * Send command to tab and wait for response
   */
  async sendCommandToTabWithResponse(message, timeout = 1000) {
    return new Promise(resolve => {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (!tabs[0]?.id) {
          resolve(null);
          return;
        }

        const timeoutId = setTimeout(() => resolve(null), timeout);

        chrome.tabs.sendMessage(tabs[0].id, message, response => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
      });
    });
  }

  /**
   * Show the voice commands reference in a modal dialog.
   *
   * @param {HTMLElement} [opener] - the control that opened it; the keyboard goes back there on
   *   every way out.
   */
  showVoiceCommandsModal(opener) {
    // Remove any existing modal
    const existingModal = document.getElementById('voice-commands-modal');
    if (existingModal) {
      existingModal.remove();
    }

    // Create modal HTML
    const modal = document.createElement('div');
    modal.id = 'voice-commands-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;

    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 500px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    `;

    modalContent.innerHTML = sanitizeHTML(`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h2 id="voice-commands-title" style="margin: 0; font-size: 20px; color: #333;">Voice Commands Reference</h2>
        <button id="close-voice-commands-modal" aria-label="Close voice commands reference" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
      </div>
      <p style="color: #666; margin-bottom: 16px; font-size: 14px;">Speak any of these commands while dictating to edit your text by voice.</p>

      <div style="margin-bottom: 16px;">
        <h3 style="color: #4a90d9; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">Delete Commands</h3>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: #444;">
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Delete last word"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Delete last 3 words"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Delete last sentence"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Delete that"</code> or <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Scratch that"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Delete all"</code></li>
        </ul>
      </div>

      <div style="margin-bottom: 16px;">
        <h3 style="color: #4a90d9; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">Undo / Redo</h3>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: #444;">
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Undo"</code> or <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Undo that"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Undo 3 times"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Redo"</code></li>
        </ul>
      </div>

      <div style="margin-bottom: 16px;">
        <h3 style="color: #4a90d9; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">Replace Commands</h3>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: #444;">
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Replace hello with goodbye"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Change word to phrase"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Correct mispelling to misspelling"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Replace that with new text"</code></li>
        </ul>
      </div>

      <div style="margin-bottom: 16px;">
        <h3 style="color: #4a90d9; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">Select Commands</h3>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: #444;">
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Select all"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Select last word"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Select last 5 words"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Select last sentence"</code></li>
        </ul>
      </div>

      <div style="margin-bottom: 16px;">
        <h3 style="color: #4a90d9; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">Navigation Commands</h3>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: #444;">
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Go to beginning"</code> / <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Go to end"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Move left 3 words"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Find hello"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Next"</code> / <code style="background: #fff; padding: 1px 4px; border-radius: 2px;">"Previous"</code></li>
        </ul>
      </div>

      <div style="margin-bottom: 16px;">
        <h3 style="color: #4a90d9; font-size: 14px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px;">Formatting Commands <span style="font-size: 11px; color: #999;">(Rich text editors only)</span></h3>
        <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: #444;">
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Bold that"</code> / <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Italic that"</code> / <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Underline that"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"New paragraph"</code> / <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"New line"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Bullet point"</code> / <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Numbered list"</code></li>
          <li style="padding: 4px 0;"><code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Heading 1"</code> through <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">"Heading 6"</code></li>
        </ul>
      </div>

      <div style="background: #f0f7ff; padding: 12px; border-radius: 8px; font-size: 12px; color: #555;">
        <strong>Tip:</strong> You can also use punctuation commands like <code style="background: #fff; padding: 1px 4px; border-radius: 2px;">"period"</code>, <code style="background: #fff; padding: 1px 4px; border-radius: 2px;">"comma"</code>, <code style="background: #fff; padding: 1px 4px; border-radius: 2px;">"question mark"</code>, and <code style="background: #fff; padding: 1px 4px; border-radius: 2px;">"new line"</code> while dictating.
      </div>
    `);

    modal.appendChild(modalContent);

    // The panel itself takes the keyboard, so the reference is announced by its heading and the
    // student can scroll the list before Tab reaches the close button.
    modalContent.tabIndex = -1;

    const closeModal = this.openPopupDialog({
      backdrop: modal,
      dialog: modalContent,
      labelledBy: 'voice-commands-title',
      opener,
      initialFocus: modalContent,
    });

    this.attachInteractiveHandler(
      modalContent.querySelector('#close-voice-commands-modal'),
      'Close Voice Commands Modal Button',
      closeModal
    );
  }

  /**
   * Update STT statistics display
   * @param {Object} stats - Statistics object from content script
   */
  updateSTTStatsDisplay(stats) {
    const wpmEl = document.getElementById('stt-stats-wpm');
    const accuracyEl = document.getElementById('stt-stats-accuracy');
    const wordsEl = document.getElementById('stt-stats-words');
    const durationEl = document.getElementById('stt-stats-duration');

    if (wpmEl) {
      wpmEl.textContent = stats.wordsPerMinute || 0;
    }
    if (accuracyEl) {
      // The number says it; the green, amber and red it used to be painted in were under 3:1 on
      // the panel's background.
      accuracyEl.textContent = `${stats.averageConfidence || 0}%`;
    }
    if (wordsEl) {
      wordsEl.textContent = stats.totalWords || 0;
    }
    if (durationEl) {
      durationEl.textContent = `${stats.duration || 0}m`;
    }
  }

  /**
   * Fill the companion checkboxes from storage and store their changes (companion-switches.js),
   * then redraw Flat, which drew its switches from these checkboxes before storage answered.
   */
  async setupCompanionSection() {
    try {
      await bindCompanionSwitches(document);
      if (this.flat) {
        this.flat.refresh();
      }
    } catch (error) {
      console.error('[Popup] Companion switches failed to load:', error);
    }
  }

  setupReadingMode() {
    // Initialize readingMode settings if they don't exist
    if (!this.settings.readingMode) {
      this.settings.readingMode = {
        enabled: false,
        backgroundColor: '#FBF8F3',
        fontFamily: 'OpenDyslexic, Georgia, serif',
        fontSize: '18px',
        lineHeight: '1.6',
        maxWidth: '800px',
      };
    }

    const readingModeEnabled = document.getElementById('reading-mode-enabled');
    const readingModeDescription = document.getElementById('reading-mode-description');
    const readingModeOptions = document.getElementById('reading-mode-options');
    const toggleButton = document.getElementById('btn-toggle-reading-mode');

    // Set initial state
    readingModeEnabled.checked = this.settings.readingMode.enabled || false;

    // Show/hide description and options based on enabled state
    if (readingModeEnabled.checked) {
      readingModeDescription.classList.remove('hidden');
      readingModeOptions.classList.remove('hidden');
    } else {
      readingModeDescription.classList.add('hidden');
      readingModeOptions.classList.add('hidden');
    }

    // Toggle event
    readingModeEnabled.addEventListener('change', e => {
      this.settings.readingMode.enabled = e.target.checked;
      this.saveSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        readingModeDescription.classList.remove('hidden');
        readingModeOptions.classList.remove('hidden');
      } else {
        readingModeDescription.classList.add('hidden');
        readingModeOptions.classList.add('hidden');
      }
    });

    // Toggle Reading Mode button
    this.attachInteractiveHandler(toggleButton, 'Toggle Reading Mode Button', async () => {
      if (!this.currentTab) {
        this.updateStatus('No active tab', 'error');
        return;
      }

      try {
        const reply = await chrome.tabs.sendMessage(this.currentTab.id, {
          type: 'READING_MODE_TOGGLE',
        });

        // Label from the state the page reports, not a guess: on a page with no readable article
        // reading mode does not open, and the button must not then offer to exit it.
        const btnText = toggleButton.querySelector('.btn-text');
        btnText.textContent = reply?.active ? 'Exit Reading Mode' : 'Enter Reading Mode';
      } catch (error) {
        console.error('[Popup] Error toggling reading mode:', error);
        this.updateStatus('Error: Please reload the page', 'error');
      }
    });

    console.log('[Popup] Reading Mode initialized');
  }

  setupDyslexiaMode() {
    if (!this.settings.dyslexiaMode) {
      this.settings.dyslexiaMode = {
        enabled: false,
        bionicReading: false,
        syllableHighlighting: true,
        grammarColors: false,
      };
    }

    const dyslexiaEnabled = document.getElementById('dyslexia-mode-enabled');
    const dyslexiaDescription = document.getElementById('dyslexia-mode-description');
    const dyslexiaOptions = document.getElementById('dyslexia-mode-options');

    dyslexiaEnabled.checked = this.settings.dyslexiaMode.enabled || false;

    if (dyslexiaEnabled.checked) {
      dyslexiaDescription.classList.remove('hidden');
      dyslexiaOptions.classList.remove('hidden');
    } else {
      dyslexiaDescription.classList.add('hidden');
      dyslexiaOptions.classList.add('hidden');
    }

    dyslexiaEnabled.addEventListener('change', e => {
      this.settings.dyslexiaMode.enabled = e.target.checked;
      this.saveSettings();

      if (e.target.checked) {
        dyslexiaDescription.classList.remove('hidden');
        dyslexiaOptions.classList.remove('hidden');
      } else {
        dyslexiaDescription.classList.add('hidden');
        dyslexiaOptions.classList.add('hidden');
      }
    });

    // Feature selection (radio buttons)
    const bionicRadio = document.getElementById('dyslexia-bionic');
    const syllableRadio = document.getElementById('dyslexia-syllable');
    const grammarRadio = document.getElementById('dyslexia-grammar');

    // Set initial state (syllable is the fallback default; bionic stays opt-in)
    if (this.settings.dyslexiaMode.bionicReading) {
      bionicRadio.checked = true;
    } else if (this.settings.dyslexiaMode.grammarColors) {
      grammarRadio.checked = true;
    } else {
      syllableRadio.checked = true;
    }

    // Radio button handlers
    bionicRadio.addEventListener('change', e => {
      if (e.target.checked) {
        this.settings.dyslexiaMode.bionicReading = true;
        this.settings.dyslexiaMode.syllableHighlighting = false;
        this.settings.dyslexiaMode.grammarColors = false;
        this.saveSettings();
      }
    });

    syllableRadio.addEventListener('change', e => {
      if (e.target.checked) {
        this.settings.dyslexiaMode.bionicReading = false;
        this.settings.dyslexiaMode.syllableHighlighting = true;
        this.settings.dyslexiaMode.grammarColors = false;
        this.saveSettings();
      }
    });

    grammarRadio.addEventListener('change', e => {
      if (e.target.checked) {
        this.settings.dyslexiaMode.bionicReading = false;
        this.settings.dyslexiaMode.syllableHighlighting = false;
        this.settings.dyslexiaMode.grammarColors = true;
        this.saveSettings();
      }
    });

    console.log('[Popup] Dyslexia Mode initialized');

    // Note: Storage mode migration event listener is attached in loadModalSettings()
    // after the Advanced Options modal is created (the dropdown doesn't exist here)

    // Migration modal close button
    const btnMigrationClose = document.getElementById('btn-migration-close');
    if (btnMigrationClose) {
      this.attachInteractiveHandler(btnMigrationClose, 'Migration Modal Close Button', () => {
        this.closeMigrationModal();
      });
    }
  }

  async setupUserProfiles() {
    console.log('[Popup] Setting up User Profiles...');

    // Initialize profiles from storage
    await this.profiles_initialize();

    // Setup UI event listeners
    this.profiles_setupEventListeners();
  }

  async profiles_initialize() {
    // Load profiles from storage
    const result = await chrome.storage.local.get(['assist_profiles', 'assist_active_profile']);

    let profiles = result.assist_profiles || {};
    const activeProfile = result.assist_active_profile || 'Default';

    // Create default profiles if they don't exist
    if (Object.keys(profiles).length === 0) {
      profiles = this.profiles_createDefaults();
      await chrome.storage.local.set({
        assist_profiles: profiles,
        assist_active_profile: 'Default',
      });
      console.log('[Profiles] Created default profiles');
    }

    this.profiles = profiles;
    this.activeProfile = activeProfile;

    // Populate profile selector
    this.profiles_populateSelector();

    console.log('[Profiles] Initialized with', Object.keys(profiles).length, 'profiles');
  }

  profiles_createDefaults() {
    const timestamp = new Date().toISOString();

    return {
      Default: {
        name: 'Default',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: {
            enabled: false,
            rate: 1.0,
            pitch: 1.0,
            volume: 1.0,
            highlightEnabled: true,
            highlightColor: '#FFEB3B',
            highlightOpacity: 0.7,
          },
          textCustomization: { enabled: false },
          readingGuide: { enabled: false },
          focusMode: { enabled: false },
          screenOverlay: { enabled: false },
          canvasIntegration: { enabled: false },
          moodleIntegration: { enabled: false },
          googleClassroomIntegration: { enabled: false },
        },
      },
      'Reading Mode': {
        name: 'Reading Mode',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1.2, highlightEnabled: true, wordByWordEnabled: true },
          textCustomization: {
            enabled: true,
            fontSize: 18,
            lineHeight: 1.8,
            fontFamily: 'OpenDyslexic',
          },
          readingGuide: { enabled: true, lineColor: '#4A90E2', opacity: 0.5 },
          focusMode: { enabled: false },
          screenOverlay: { enabled: true, color: '#FFF4E6', opacity: 0.2 },
          canvasIntegration: { enabled: false },
          moodleIntegration: { enabled: false },
          googleClassroomIntegration: { enabled: false },
        },
      },
      'Quiz Mode': {
        name: 'Quiz Mode',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1.0, highlightEnabled: true, wordByWordEnabled: false },
          textCustomization: { enabled: true, fontSize: 16, lineHeight: 1.6 },
          readingGuide: { enabled: false },
          focusMode: { enabled: true, dimAmount: 0.7 },
          screenOverlay: { enabled: false },
          canvasIntegration: {
            enabled: true,
            quizHelper: {
              enabled: true,
              readAnswers: true,
              highlightQuestion: true,
              keyboardNavigation: true,
            },
          },
          moodleIntegration: { enabled: false },
          googleClassroomIntegration: { enabled: false },
        },
      },
      'Low Vision': {
        name: 'Low Vision',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: {
            enabled: true,
            rate: 0.9,
            highlightEnabled: true,
            highlightColor: '#FFEB3B',
            highlightOpacity: 0.9,
          },
          textCustomization: {
            enabled: true,
            fontSize: 22,
            lineHeight: 2.0,
            letterSpacing: 0.15,
            wordSpacing: 0.2,
          },
          readingGuide: { enabled: true, lineColor: '#FF0000', opacity: 0.8 },
          focusMode: { enabled: true, dimAmount: 0.9 },
          screenOverlay: { enabled: false },
          canvasIntegration: { enabled: false },
          moodleIntegration: { enabled: false },
          googleClassroomIntegration: { enabled: false },
        },
      },
      'ADHD Focus': {
        name: 'ADHD Focus',
        description: 'Structured intervals, reduced distractions, and clear visual progress',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1.2, highlightEnabled: true, wordByWordEnabled: true },
          textCustomization: { enabled: true, fontSize: 16, lineHeight: 1.6, fontFamily: 'lexend' },
          readingGuide: { enabled: true, lineColor: '#4A90E2', opacity: 0.6 },
          focusMode: { enabled: false },
          screenOverlay: { enabled: false },
          simplify: { enabled: true, intensity: 'moderate', focusMainContent: true },
          readingProgress: {
            enabled: true,
            position: 'top',
            color: '#4CAF50',
            showPercentage: true,
          },
          pomodoro: {
            enabled: true,
            workDuration: 25,
            shortBreakDuration: 5,
            longBreakDuration: 15,
            autoStartBreaks: true,
            playSound: true,
          },
          reducedMotion: { enabled: false },
          mediaControl: { enabled: true },
          // S.7.1: ADHD STT Profile - fast response, minimal distractions
          stt: {
            enabled: true,
            profile: 'adhd',
            silenceTimeout: 800,
            buttonSize: 'large',
            animations: false,
            audioFeedback: false,
          },
        },
      },
      'Autism Comfort': {
        name: 'Autism Comfort',
        description: 'Predictable environment with sensory-friendly settings',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 0.9, highlightEnabled: true, wordByWordEnabled: false },
          textCustomization: {
            enabled: true,
            fontSize: 18,
            lineHeight: 1.8,
            fontFamily: 'atkinson-hyperlegible',
          },
          readingGuide: { enabled: false },
          focusMode: { enabled: false },
          screenOverlay: { enabled: true, color: '#FFF4E6', opacity: 0.15 },
          simplify: { enabled: true, intensity: 'aggressive', focusMainContent: true },
          readingProgress: {
            enabled: true,
            position: 'top',
            color: '#9C27B0',
            showPercentage: false,
          },
          pomodoro: {
            enabled: true,
            workDuration: 30,
            shortBreakDuration: 10,
            longBreakDuration: 20,
            autoStartBreaks: false,
            playSound: false, // Avoid unexpected sounds
          },
          reducedMotion: { enabled: true, respectSystemPreference: true },
          mediaControl: { enabled: true },
          // S.7.6: Autism STT Profile - predictable, literal commands
          stt: {
            enabled: true,
            profile: 'autism',
            interimResults: false, // Final results only - no changing text
            commandMode: 'literal',
            commandPrefix: 'do',
            animations: false,
            audioFeedback: true,
          },
        },
      },
      'Dyslexia Support': {
        name: 'Dyslexia Support',
        description: 'Optimized fonts, spacing, and reading aids for dyslexic users',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1.0, highlightEnabled: true, wordByWordEnabled: true },
          textCustomization: {
            enabled: true,
            fontSize: 18,
            lineHeight: 2.0,
            letterSpacing: 0.12,
            wordSpacing: 0.16,
            fontFamily: 'opendyslexic',
          },
          readingGuide: { enabled: true, lineColor: '#000000', opacity: 0.5 },
          focusMode: { enabled: false },
          screenOverlay: { enabled: true, color: '#FFF59D', opacity: 0.2 },
          simplify: { enabled: true, intensity: 'light', focusMainContent: false },
          readingProgress: {
            enabled: true,
            position: 'top',
            color: '#2196F3',
            showPercentage: true,
          },
          pomodoro: { enabled: false },
          reducedMotion: { enabled: false },
          mediaControl: { enabled: false },
          // S.7.2: Dyslexia STT Profile - extra pause time, simple commands
          stt: {
            enabled: true,
            profile: 'dyslexia',
            silenceTimeout: 3000, // Extra time to think
            maxAlternatives: 3, // More phonetic alternatives
            commandMode: 'simple',
            spellingCorrection: true,
            audioFeedback: true,
          },
        },
      },
      'Sensory Sensitive': {
        name: 'Sensory Sensitive',
        description: 'Minimal animations, muted colors, and calming interface',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 0.8, highlightEnabled: true, highlightOpacity: 0.5 },
          textCustomization: {
            enabled: true,
            fontSize: 16,
            lineHeight: 1.6,
            fontFamily: 'verdana',
          },
          readingGuide: { enabled: false },
          focusMode: { enabled: false },
          screenOverlay: { enabled: true, color: '#E1BEE7', opacity: 0.15 },
          simplify: { enabled: true, intensity: 'aggressive', focusMainContent: true },
          readingProgress: { enabled: false },
          pomodoro: { enabled: false },
          reducedMotion: { enabled: true, respectSystemPreference: false }, // Always reduce motion
          mediaControl: { enabled: true },
          // S.7.3: Anxiety/Sensory STT Profile - calm colors, no alarming sounds
          stt: {
            enabled: true,
            profile: 'anxiety',
            silenceTimeout: 4000, // Forgiving timing
            animations: true, // Smooth, calming
            audioFeedback: true,
            audioVolume: 0.2, // Very quiet
            errorSounds: false, // No alarming sounds
          },
        },
      },
      'Night Study': {
        name: 'Night Study',
        description: 'Reduced eye strain with screen overlay for late-night studying',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1.0, highlightEnabled: true, highlightColor: '#FFD700' },
          textCustomization: { enabled: true, fontSize: 17, lineHeight: 1.7, fontFamily: 'lexend' },
          readingGuide: { enabled: false },
          focusMode: { enabled: false },
          screenOverlay: { enabled: false },
          simplify: { enabled: true, intensity: 'moderate', focusMainContent: true },
          readingProgress: {
            enabled: true,
            position: 'top',
            color: '#FF9800',
            showPercentage: true,
          },
          pomodoro: {
            enabled: true,
            workDuration: 45,
            shortBreakDuration: 10,
            longBreakDuration: 20,
            autoStartBreaks: true,
            playSound: true,
          },
          reducedMotion: { enabled: true },
          mediaControl: { enabled: true },
        },
      },
      'Anxiety Calm': {
        name: 'Anxiety Calm',
        description: 'Distraction-free reading with gentle pacing and progress indicators',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 0.85, highlightEnabled: true, wordByWordEnabled: true },
          textCustomization: {
            enabled: true,
            fontSize: 18,
            lineHeight: 1.9,
            fontFamily: 'atkinson-hyperlegible',
          },
          readingGuide: { enabled: true, lineColor: '#90EE90', opacity: 0.4 },
          focusMode: { enabled: true, dimAmount: 0.5 },
          screenOverlay: { enabled: true, color: '#C8E6C9', opacity: 0.1 },
          simplify: { enabled: true, intensity: 'aggressive', focusMainContent: true },
          readingProgress: {
            enabled: true,
            position: 'bottom',
            color: '#4CAF50',
            showPercentage: false,
          },
          pomodoro: {
            enabled: true,
            workDuration: 20,
            shortBreakDuration: 5,
            longBreakDuration: 15,
            autoStartBreaks: false,
            playSound: false,
          },
          reducedMotion: { enabled: true },
          mediaControl: { enabled: true },
          // S.7.3: Anxiety STT Profile - calm, forgiving, no pressure
          stt: {
            enabled: true,
            profile: 'anxiety',
            silenceTimeout: 4000, // Very forgiving
            speechTimeout: 30000, // Extended - take your time
            animations: true, // Smooth, calming
            audioFeedback: true,
            audioVolume: 0.2,
            errorSounds: false, // No alarming sounds
            flashOnRecognition: false, // No sudden flashes
          },
        },
      },
      // S.7.4: Motor Impairment Profile - voice-only, large targets
      'Motor Impairment': {
        name: 'Motor Impairment',
        description: 'Voice-only activation, large touch targets, patient timing',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: { enabled: true, rate: 1.0, highlightEnabled: true },
          textCustomization: { enabled: true, fontSize: 18, lineHeight: 1.8 },
          readingGuide: { enabled: false },
          focusMode: { enabled: false },
          screenOverlay: { enabled: false },
          simplify: { enabled: false },
          readingProgress: { enabled: false },
          pomodoro: { enabled: false },
          reducedMotion: { enabled: false },
          mediaControl: { enabled: false },
          stt: {
            enabled: true,
            profile: 'motor-impairment',
            continuous: true, // Continuous to avoid re-clicking
            silenceTimeout: 5000, // Very long - no rush
            speechTimeout: 60000, // Extended dictation
            buttonSize: 'xlarge',
            holdToActivate: true,
            holdDuration: 500,
            voiceActivation: true,
            voiceActivationPhrase: 'start dictation',
            voiceDeactivationPhrase: 'stop dictation',
            audioFeedback: true,
            hapticFeedback: true,
          },
        },
      },
      // S.7.5: Low Vision Profile - large buttons, high contrast, audio feedback
      'Low Vision STT': {
        name: 'Low Vision STT',
        description: 'Extra-large mic button, high contrast, comprehensive audio feedback',
        isDefault: true,
        createdAt: timestamp,
        settings: {
          tts: {
            enabled: true,
            rate: 0.9,
            highlightEnabled: true,
            highlightColor: '#FFEB3B',
            highlightOpacity: 0.9,
          },
          textCustomization: {
            enabled: true,
            fontSize: 24,
            lineHeight: 2.0,
            letterSpacing: 0.15,
            wordSpacing: 0.2,
          },
          readingGuide: { enabled: true, lineColor: '#FF0000', opacity: 0.8 },
          focusMode: { enabled: true, dimAmount: 0.9 },
          screenOverlay: { enabled: false },
          simplify: { enabled: false },
          readingProgress: { enabled: false },
          pomodoro: { enabled: false },
          reducedMotion: { enabled: false },
          mediaControl: { enabled: false },
          stt: {
            enabled: true,
            profile: 'low-vision',
            buttonSize: 'xlarge',
            buttonSizePx: 96, // Very large
            highContrast: true,
            audioFeedback: true,
            audioVolume: 0.7, // Louder
            speakTranscript: true, // Read back what was typed
            hapticFeedback: true,
            announceState: true,
            transcriptFontSize: 24,
          },
        },
      },
    };
  }

  profiles_populateSelector() {
    // Populate main popup selector (if exists)

    // Populate modal selector (if exists)
    const modalSelector = document.getElementById('modal-profile-select');
    if (modalSelector) {
      modalSelector.innerHTML = sanitizeHTML('');
      Object.keys(this.profiles).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        option.selected = name === this.activeProfile;
        modalSelector.appendChild(option);
      });
    }
  }

  /**
   * Wires the save and delete confirmation dialogs, which live in popup.html. The selector,
   * save, export and import controls live in the Advanced Options Preferences tab and are wired
   * there, in setupProfilesTab, when that modal is built. This used to look for a main-popup
   * copy of each of those as well; that surface was removed and the lookups found nothing.
   */
  profiles_setupEventListeners() {
    // Save profile modal
    const cancelSaveBtn = document.getElementById('btn-cancel-save-profile');
    if (cancelSaveBtn) {
      this.attachInteractiveHandler(cancelSaveBtn, 'Cancel Save Profile Button', () => {
        document.getElementById('save-profile-modal')?.classList.add('hidden');
      });
    }

    const confirmSaveBtn = document.getElementById('btn-confirm-save-profile');
    if (confirmSaveBtn) {
      this.attachInteractiveHandler(confirmSaveBtn, 'Confirm Save Profile Button', () => {
        this.profiles_saveNew();
      });
    }

    // Delete profile modal
    const cancelDeleteBtn = document.getElementById('btn-cancel-delete-profile');
    if (cancelDeleteBtn) {
      this.attachInteractiveHandler(cancelDeleteBtn, 'Cancel Delete Profile Button', () => {
        document.getElementById('delete-profile-modal')?.classList.add('hidden');
      });
    }

    const confirmDeleteBtn = document.getElementById('btn-confirm-delete-profile');
    if (confirmDeleteBtn) {
      this.attachInteractiveHandler(confirmDeleteBtn, 'Confirm Delete Profile Button', () => {
        this.profiles_confirmDelete();
      });
    }

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      this.attachInteractiveHandler(overlay, 'Profile Modal Overlay', () => {
        overlay.closest('.modal')?.classList.add('hidden');
      });
    });
  }

  async profiles_loadProfile(name) {
    if (!this.profiles[name]) {
      console.error('[Profiles] Profile not found:', name);
      return;
    }

    const profile = this.profiles[name];
    this.activeProfile = name;

    // Deep merge profile settings with current settings
    this.settings = { ...this.settings, ...profile.settings };

    // Save active profile
    await chrome.storage.local.set({ assist_active_profile: name });

    // Save settings
    await this.saveSettings();

    // Apply STT profile if present (S.7 Neurodivergent STT Profiles)
    if (profile.settings.stt && profile.settings.stt.profile) {
      await this.profiles_applySTTProfile(name, profile.settings.stt);
    }

    // Reload popup to reflect changes
    window.location.reload();
  }

  /**
   * Apply STT profile to content script (S.7)
   * @param {string} profileName - Name of the user profile
   * @param {Object} sttSettings - STT settings from the profile
   */
  async profiles_applySTTProfile(profileName, sttSettings) {
    try {
      // Save STT profile preference
      await chrome.storage.local.set({
        assist_stt_profile: {
          type: sttSettings.profile,
          profileName: profileName,
          customizations: sttSettings,
          savedAt: new Date().toISOString(),
        },
      });

      // Send message to content script to apply the profile
      if (this.currentTab?.id) {
        await chrome.tabs.sendMessage(this.currentTab.id, {
          type: 'STT_COMMAND',
          command: 'applyProfile',
          profileType: sttSettings.profile,
          customizations: sttSettings,
        });
      }

      console.log('[Profiles] STT profile applied:', sttSettings.profile);
    } catch (error) {
      console.error('[Profiles] Failed to apply STT profile:', error);
    }
  }

  profiles_showSaveModal() {
    const modal = document.getElementById('save-profile-modal');
    const input = document.getElementById('profile-name-input');
    input.value = '';
    modal.classList.remove('hidden');
    input.focus();
  }

  async profiles_saveNew() {
    const input = document.getElementById('profile-name-input');
    const name = input.value.trim();

    if (!name) {
      alert('Please enter a profile name');
      return;
    }

    if (this.profiles[name]) {
      if (!confirm(`Profile "${name}" already exists. Overwrite?`)) {
        return;
      }
    }

    // Create new profile from current settings
    const newProfile = {
      name: name,
      isDefault: false,
      createdAt: new Date().toISOString(),
      settings: JSON.parse(JSON.stringify(this.settings)), // Deep clone
    };

    this.profiles[name] = newProfile;

    // Save to storage
    await chrome.storage.local.set({ assist_profiles: this.profiles });

    // Update UI
    this.profiles_populateSelector();

    // Close modal
    document.getElementById('save-profile-modal').classList.add('hidden');

    // Show success message
    this.updateStatus(`Profile "${name}" saved!`, 'success');

    console.log('[Profiles] Saved new profile:', name);
  }

  profiles_showDeleteModal(name) {
    const modal = document.getElementById('delete-profile-modal');
    const nameSpan = document.getElementById('delete-profile-name');
    nameSpan.textContent = name;
    modal.classList.add('hidden');

    this.profileToDelete = name;
    modal.classList.remove('hidden');
  }

  async profiles_confirmDelete() {
    const name = this.profileToDelete;

    if (!name || !this.profiles[name]) {
      return;
    }

    // Cannot delete default profiles
    if (this.profiles[name].isDefault) {
      alert('Cannot delete default profiles');
      return;
    }

    // Delete profile
    delete this.profiles[name];

    // If deleted profile was active, switch to Default
    if (this.activeProfile === name) {
      await this.profiles_loadProfile('Default');
    }

    // Save to storage
    await chrome.storage.local.set({ assist_profiles: this.profiles });

    // Update UI
    this.profiles_populateSelector();

    // Close modal
    document.getElementById('delete-profile-modal').classList.add('hidden');

    // Show success message
    this.updateStatus(`Profile "${name}" deleted`, 'success');

    console.log('[Profiles] Deleted profile:', name);
  }

  profiles_export() {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      profiles: this.profiles,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `assist-profiles-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);

    this.updateStatus('Profiles exported!', 'success');
    console.log('[Profiles] Exported', Object.keys(this.profiles).length, 'profiles');
  }

  async profiles_import(file) {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.profiles || typeof data.profiles !== 'object') {
        alert('Invalid profile file format');
        return;
      }

      // Merge imported profiles (keep existing if name conflicts)
      let importedCount = 0;
      for (const [name, profile] of Object.entries(data.profiles)) {
        if (!this.profiles[name] || !this.profiles[name].isDefault) {
          this.profiles[name] = profile;
          importedCount++;
        }
      }

      // Save to storage
      await chrome.storage.local.set({ assist_profiles: this.profiles });

      // Update UI
      this.profiles_populateSelector();

      // Show success message
      this.updateStatus(`Imported ${importedCount} profiles!`, 'success');

      console.log('[Profiles] Imported', importedCount, 'profiles');
    } catch (error) {
      console.error('[Profiles] Import error:', error);
      alert('Error importing profiles: ' + error.message);
    }
  }

  /**
   * Handle storage mode migration for annotations
   * @param {string} fromMode - Source storage mode
   * @param {string} toMode - Target storage mode
   */
  async handleStorageMigration(fromMode, toMode) {
    console.log(`[Popup] Migrating annotations from ${fromMode} to ${toMode}`);

    // Show migration modal
    this.showMigrationModal();

    try {
      // Perform migration with progress callback
      const result = await migrateAnnotations(fromMode, toMode, {
        clearSource: true,
        onProgress: progress => {
          this.updateMigrationProgress(progress);
        },
      });

      if (result.success) {
        console.log(`[Popup] Migration successful: ${result.count} annotations migrated`);
        this.updateMigrationComplete(result.count, toMode);
      } else {
        console.error('[Popup] Migration failed:', result.error);
        this.updateMigrationError(result.error);
      }
    } catch (error) {
      console.error('[Popup] Migration exception:', error);
      this.updateMigrationError(error.message);
    }
  }

  /**
   * Show migration modal
   */
  showMigrationModal() {
    const modal = document.getElementById('migration-modal');
    if (modal) {
      modal.classList.remove('hidden');

      // Reset modal state
      const closeBtn = document.getElementById('btn-migration-close');
      if (closeBtn) {
        closeBtn.style.display = 'none';
      }

      // Reset progress
      const progressFill = document.getElementById('migration-progress-fill');
      const progressText = document.getElementById('migration-progress-text');
      if (progressFill) {
        progressFill.style.width = '0%';
      }
      if (progressText) {
        progressText.textContent = '0%';
      }
    }
  }

  /**
   * Close migration modal
   */
  closeMigrationModal() {
    const modal = document.getElementById('migration-modal');
    if (modal) {
      modal.classList.add('hidden');

      // Reload settings to reflect migration
      this.loadSettings();
    }
  }

  /**
   * Update migration progress in modal
   * @param {Object} progress - Progress information
   */
  updateMigrationProgress(progress) {
    const { status, current, total, message } = progress;

    // Update message
    const messageEl = document.getElementById('migration-message');
    if (messageEl) {
      messageEl.textContent = message;
    }

    // Calculate percentage
    let percentage = 0;
    if (total > 0) {
      percentage = Math.round((current / total) * 100);
    } else if (status === 'complete') {
      percentage = 100;
    }

    // Update progress bar
    const progressFill = document.getElementById('migration-progress-fill');
    const progressText = document.getElementById('migration-progress-text');
    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
    }
    if (progressText) {
      progressText.textContent = `${percentage}%`;
    }

    // Update details
    const detailsEl = document.getElementById('migration-details');
    if (detailsEl) {
      if (total > 0) {
        detailsEl.textContent = `${current} of ${total} annotations processed`;
      } else {
        detailsEl.textContent = '';
      }
    }
  }

  /**
   * Update migration modal on completion
   * @param {number} count - Number of annotations migrated
   * @param {string} toMode - Target storage mode
   */
  updateMigrationComplete(count, toMode) {
    const messageEl = document.getElementById('migration-message');
    if (messageEl) {
      if (count === 0) {
        messageEl.textContent = 'No annotations to migrate';
      } else {
        const storageLabel = toMode === 'indexeddb' ? 'IndexedDB' : 'Chrome Local Storage';
        messageEl.textContent = `Successfully migrated ${count} annotation${count === 1 ? '' : 's'} to ${storageLabel}`;
      }
    }

    // Show completion (100%)
    const progressFill = document.getElementById('migration-progress-fill');
    const progressText = document.getElementById('migration-progress-text');
    if (progressFill) {
      progressFill.style.width = '100%';
    }
    if (progressText) {
      progressText.textContent = '100%';
    }

    // Clear details
    const detailsEl = document.getElementById('migration-details');
    if (detailsEl) {
      detailsEl.textContent = '';
    }

    // Show close button
    const closeBtn = document.getElementById('btn-migration-close');
    if (closeBtn) {
      closeBtn.style.display = '';
    }
  }

  /**
   * Update migration modal on error
   * @param {string} error - Error message
   */
  updateMigrationError(error) {
    const messageEl = document.getElementById('migration-message');
    if (messageEl) {
      messageEl.textContent = `Migration failed: ${error}`;
    }

    // Show error state (red progress bar)
    const progressFill = document.getElementById('migration-progress-fill');
    if (progressFill) {
      progressFill.style.background = 'linear-gradient(90deg, #f44336 0%, #d32f2f 100%)';
    }

    // Clear details
    const detailsEl = document.getElementById('migration-details');
    if (detailsEl) {
      detailsEl.textContent = 'Please try again or contact support if the issue persists.';
    }

    // Show close button
    const closeBtn = document.getElementById('btn-migration-close');
    if (closeBtn) {
      closeBtn.style.display = '';
    }
  }

  setupAnnotations() {
    // Initialize settings if not present
    if (!this.settings.annotations) {
      this.settings.annotations = {
        enabled: false,
      };
    }

    const annotationsEnabled = document.getElementById('annotations-enabled');
    const annotationsDescription = document.getElementById('annotations-description');
    const annotationsOptions = document.getElementById('annotations-options');
    const createNoteButton = document.getElementById('btn-create-sticky-note');
    const viewAnnotationsButton = document.getElementById('btn-view-annotations');

    // Set initial state
    annotationsEnabled.checked = this.settings.annotations.enabled || false;

    // Show/hide description and options based on enabled state
    if (annotationsEnabled.checked) {
      annotationsDescription.classList.remove('hidden');
      annotationsOptions.classList.remove('hidden');
    } else {
      annotationsDescription.classList.add('hidden');
      annotationsOptions.classList.add('hidden');
    }

    // Toggle event
    annotationsEnabled.addEventListener('change', e => {
      this.settings.annotations.enabled = e.target.checked;
      this.saveSettings();

      // Toggle description and options visibility
      if (e.target.checked) {
        annotationsDescription.classList.remove('hidden');
        annotationsOptions.classList.remove('hidden');
      } else {
        annotationsDescription.classList.add('hidden');
        annotationsOptions.classList.add('hidden');
      }
    });

    // Create sticky note button
    this.attachInteractiveHandler(createNoteButton, 'Create Sticky Note Button', async () => {
      if (!this.currentTab) {
        this.updateStatus('No active tab', 'error');
        return;
      }

      try {
        // Send message to content script to create a sticky note
        await chrome.tabs.sendMessage(this.currentTab.id, {
          action: 'createStickyNote',
          x: null, // Will be centered by content script
          y: null,
          content: '',
          color: 'yellow',
        });

        this.updateStatus('Sticky note created!', 'success');
      } catch (error) {
        console.error('[Popup] Error creating sticky note:', error);
        this.updateStatus('Error: Please reload the page', 'error');
      }
    });

    // View annotations button
    this.attachInteractiveHandler(viewAnnotationsButton, 'View Annotations Button', async () => {
      if (!this.currentTab) {
        this.updateStatus('No active tab', 'error');
        return;
      }

      try {
        // Send message to content script to toggle annotation sidebar
        await chrome.tabs.sendMessage(this.currentTab.id, {
          type: 'toggleAnnotationSidebar',
        });

        this.updateStatus('Sidebar toggled', 'success');
      } catch (error) {
        console.error('[Popup] Error toggling sidebar:', error);
        this.updateStatus('Error: Please reload the page', 'error');
      }
    });

    console.log('[Popup] Annotations initialized');
  }

  setupCitationPanel() {
    const expandBtn = document.getElementById('btn-expand-citations');
    const panelContainer = document.getElementById('citation-manager-panel');

    if (!expandBtn || !panelContainer) {
      console.log('[Popup] Citation panel elements not found');
      return;
    }

    // Initialize the citation manager panel
    this.citationPanel = new CitationManagerPanel(panelContainer, {
      onStatusUpdate: (msg, type) => this.updateStatus(msg, type),
      currentTab: this.currentTab,
    });

    // Load citation count initially
    this.updateCitationCount();

    this.attachInteractiveHandler(expandBtn, 'Citation Quick View Button', async () => {
      const opened = this.showPanelInSheet({
        id: 'citation-quick-view-dialog',
        heading: 'Citation Quick View',
        panel: panelContainer,
        opener: expandBtn,
      });
      if (opened) {
        await this.citationPanel.initialize();
      }
    });

    console.log('[Popup] Citation panel initialized');
  }

  async updateCitationCount() {
    const countBadge = document.getElementById('citation-count-badge');
    if (!countBadge || !this.currentTab) {
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        type: 'GET_CITATIONS',
      });

      if (response && response.success) {
        const count = response.citations?.length || 0;
        countBadge.textContent = count;
        countBadge.title = `${count} citation${count === 1 ? '' : 's'} saved`;
      } else {
        countBadge.textContent = '0';
      }
    } catch (error) {
      console.log('[Popup] Could not get citation count:', error.message);
      countBadge.textContent = '0';
    }
  }

  /**
   * Remember which AI mode is in use, and tell Flat.
   *
   * AI Assist is the one support whose state is not a checkbox — it is the top-level `aiMode`
   * key — so Flat cannot read it off a control the way it reads every other one. It asks this
   * instead, which is why the value has to be kept current rather than read once and forgotten:
   * nothing held it before, so Flat's AI row reported the declared default whatever mode the
   * student was actually in.
   *
   * @param {string} mode
   */
  setAiMode(mode) {
    if (this.aiMode === mode) {
      return;
    }
    this.aiMode = mode;
    if (this.flat) {
      this.flat.refresh();
    }
  }

  /**
   * Set up the AI Assist section — inline mode chips + contextual panel.
   * Users can switch mode without opening the wizard.
   */
  setupAIAssist() {
    this.installedModels = [];

    const chipsEl = document.getElementById('ai-mode-chips');
    const panelEl = document.getElementById('ai-quick-panel');
    const advancedBtn = document.getElementById('btn-ai-advanced');
    const badgeEl = document.getElementById('llm-status-badge');
    const ctaBtn = document.getElementById('btn-ai-setup-cta');

    if (!chipsEl || !panelEl) {
      console.warn('[Popup] AI Assist chip elements not found');
      return;
    }

    // ── Wizard CTA ────────────────────────────────────────────────
    // Show "Set up AI →" button until the user has run the wizard once.
    // Stored as aiSetupDismissed; clicking it opens wizard and hides CTA permanently.
    if (ctaBtn) {
      chrome.storage.local.get('aiSetupDismissed', result => {
        if (!result.aiSetupDismissed) {
          ctaBtn.style.display = '';
        }
      });
      this.attachInteractiveHandler(ctaBtn, 'Set up AI', () => {
        chrome.storage.local.set({ aiSetupDismissed: true });
        ctaBtn.style.display = 'none';
        chrome.runtime.sendMessage({ action: 'OPEN_AI_SETUP' });
      });
    }

    // ── Render lock — prevents concurrent async renders ───────────
    let renderPending = false;

    // ── Badge sync ────────────────────────────────────────────────
    const BADGE_META = {
      off: { text: 'Off', cls: 'llm-badge offline' },
      cloud: { text: 'Cloud', cls: 'llm-badge online' },
      local: { text: 'Local', cls: 'llm-badge online' },
      webllm: { text: 'Browser AI', cls: 'llm-badge online' },
    };

    const syncBadge = mode => {
      if (!badgeEl) {
        return;
      }
      const m = BADGE_META[mode] || BADGE_META.off;
      badgeEl.textContent = m.text;
      badgeEl.className = m.cls;
    };

    // ── Chip selection ────────────────────────────────────────────
    const selectChip = mode => {
      chipsEl.querySelectorAll('input[type="radio"]').forEach(r => {
        r.checked = r.value === mode;
      });
    };

    // ── Contextual panel rendering ────────────────────────────────
    const renderPanel = async mode => {
      if (renderPending) {
        return;
      }
      renderPending = true;
      panelEl.innerHTML = '';

      try {
        if (mode === 'off') {
          panelEl.innerHTML =
            '<p class="ai-panel-off-msg">AI features are disabled. Select a mode above to enable AI tools.</p>';
          return;
        }
        if (mode === 'cloud') {
          await this._renderCloudPanel(panelEl, false);
          return;
        }
        if (mode === 'webllm') {
          await this._renderWebLLMPanel(panelEl, false);
          return;
        }
        if (mode === 'local') {
          await this._renderLocalPanel(panelEl, false);
          return;
        }
      } finally {
        renderPending = false;
      }
    };

    // ── Wire chip change handlers (use change event, the click helper would cancel the radio flip) ──
    chipsEl.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', async () => {
        if (!radio.checked) {
          return;
        }
        const newMode = radio.value;

        // Local AI talks to Ollama over a loopback origin the extension does not hold at install
        // (ADR 0002). Ask for it here, inside the press that turned local AI on — the only moment
        // Chrome will show the prompt. A refusal still selects the mode; the panel below then says
        // in words what is missing, rather than reporting a server that is running as dead.
        if (newMode === 'local') {
          await ensureOllamaPermission();
        }

        // Persist immediately — skip the legacy flags that triggered storage onChanged re-render
        chrome.storage.local.set({
          aiMode: newMode,
          llmEnabled: newMode === 'local',
          cloudModeEnabled: newMode === 'cloud',
          webllmEnabled: newMode === 'webllm',
        });

        syncBadge(newMode);
        await renderPanel(newMode);
      });
    });

    // ── Advanced settings link ────────────────────────────────────
    if (advancedBtn) {
      this.attachInteractiveHandler(advancedBtn, 'AI Advanced Settings', () => {
        // Straight to the AI tab. The button sits in the AI section and says "Advanced settings",
        // so landing on Feature Visibility left the student to find the mode chooser themselves.
        this.showAdvancedOptions('ai');
      });
    }

    // ── Initial render ────────────────────────────────────────────
    chrome.storage.local.get(['aiMode', 'llmEnabled', 'cloudModeEnabled'], result => {
      let mode = result.aiMode || 'off';
      if (!result.aiMode) {
        // Migrate legacy flags without triggering onChanged — write once only
        if (result.cloudModeEnabled) {
          mode = 'cloud';
        } else if (result.llmEnabled) {
          mode = 'local';
        }
        chrome.storage.local.set({ aiMode: mode });
      }
      this.setAiMode(mode);
      selectChip(mode);
      syncBadge(mode);
      // Use renderPending guard: if set already triggered onChanged it will be skipped
      renderPanel(mode);
    });

    // ── Storage listener — keep chips in sync if another page changes mode ──
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.aiMode) {
        const newMode = changes.aiMode.newValue || 'off';
        this.setAiMode(newMode);
        selectChip(newMode);
        syncBadge(newMode);
        renderPanel(newMode);
      }
    });

    console.log('[Popup] AI Assist quick switcher ready');
  }

  // ── Shared panel renderers ────────────────────────────────────────────────

  /**
   * Render the Cloud AI panel into a container element.
   * @param {HTMLElement} container
   * @param {boolean} isModal - true = show extra details (model dropdown)
   */
  async _renderCloudPanel(container, _isModal) {
    const PROVIDERS = [
      { value: 'anthropic', label: 'Anthropic (Claude)' },
      { value: 'openai', label: 'OpenAI (GPT)' },
      { value: 'google', label: 'Google (Gemini)' },
      { value: 'perplexity', label: 'Perplexity' },
    ];

    const s = await chrome.storage.local.get(['cloudProvider', 'cloudModel']);
    const currentProvider = s.cloudProvider || 'anthropic';
    // A saved model that has been replaced moves to its replacement here, and is saved as such.
    const currentModel = s.cloudModel ? resolveModel(currentProvider, s.cloudModel) : '';
    if (currentModel !== (s.cloudModel || '')) {
      chrome.storage.local.set({ cloudModel: currentModel });
    }

    // Provider row
    const provRow = document.createElement('div');
    provRow.className = 'ai-panel-row';
    provRow.innerHTML = `<span class="ai-panel-label">Provider</span>`;
    const provSel = document.createElement('select');
    provSel.className = 'ai-panel-select';
    provSel.setAttribute('aria-label', 'Cloud AI provider');
    PROVIDERS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.value;
      opt.textContent = p.label;
      opt.selected = p.value === currentProvider;
      provSel.appendChild(opt);
    });
    provRow.appendChild(provSel);
    container.appendChild(provRow);

    // API key row
    const keyRow = document.createElement('div');
    keyRow.className = 'ai-panel-row';
    keyRow.innerHTML = `<span class="ai-panel-label">API Key</span>`;
    const keyWrap = document.createElement('div');
    keyWrap.className = 'ai-panel-key-wrap';
    const keyInput = document.createElement('input');
    keyInput.type = 'password';
    keyInput.className = 'ai-panel-key-input';
    keyInput.placeholder = 'Paste API key…';
    keyInput.setAttribute('aria-label', 'API key');
    keyInput.setAttribute('autocomplete', 'off');
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'ai-panel-key-toggle';
    toggleBtn.setAttribute('aria-label', 'Show API key');
    toggleBtn.setAttribute('aria-pressed', 'false');
    toggleBtn.textContent = '👁';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'ai-panel-save-btn';
    saveBtn.textContent = 'Save';
    keyWrap.appendChild(keyInput);
    keyWrap.appendChild(toggleBtn);
    keyWrap.appendChild(saveBtn);
    keyRow.appendChild(keyWrap);
    container.appendChild(keyRow);

    // What saving the key means (ADR 0006): which provider the text goes to. Saving is the yes.
    const consentNote = document.createElement('p');
    consentNote.className = 'ai-panel-consent-note';
    consentNote.setAttribute('data-cloud-consent-note', '');
    consentNote.textContent = describeCloudConsent(currentProvider);
    // The panel can be drawn twice at once (the popup and Advanced Options), so the id is its own.
    consentNote.id = `ai-panel-consent-note-${_isModal ? 'modal' : 'popup'}`;
    keyInput.setAttribute('aria-describedby', consentNote.id);
    container.appendChild(consentNote);

    // Status line
    const statusLine = document.createElement('div');
    statusLine.className = 'ai-panel-status';
    const dot = document.createElement('span');
    dot.className = 'ai-status-dot';
    const statusText = document.createElement('span');
    statusText.id = 'ai-cloud-status-text';
    statusText.textContent = 'Checking…';
    statusLine.appendChild(dot);
    statusLine.appendChild(statusText);
    statusLine.setAttribute('role', 'status');
    // Focusable from script only: where focus goes when the button it was on goes away.
    statusLine.tabIndex = -1;
    container.appendChild(statusLine);

    // The yes to a provider (ADR 0006), for a key saved before consent existed, after a no, or
    // without Chrome's permission for the provider's host (every cloud AI provider is an optional
    // host permission: ADR 0006, and ADR 0007 for Gemini). Described by the note above, which names
    // the provider and what is sent.
    const allowBtn = document.createElement('button');
    allowBtn.type = 'button';
    allowBtn.className = 'ai-panel-save-btn ai-panel-allow-btn';
    allowBtn.hidden = true;
    allowBtn.setAttribute('aria-describedby', consentNote.id);
    container.appendChild(allowBtn);
    const serviceName = provider => DESTINATIONS[provider]?.service || provider;

    // Model row (always visible in popup too — users need quick model switching)
    const modelRow = document.createElement('div');
    modelRow.className = 'ai-panel-row';
    modelRow.style.marginTop = '6px';
    modelRow.innerHTML = `<span class="ai-panel-label">Model</span>`;
    const modelSel = document.createElement('select');
    modelSel.className = 'ai-panel-select';
    modelSel.setAttribute('aria-label', 'Cloud AI model');
    modelRow.appendChild(modelSel);
    container.appendChild(modelRow);

    // ── Populate model dropdown ───────────────────────────────────
    const FALLBACK_MODELS = cloudFallbackModels();

    const populateModels = provider => {
      modelSel.innerHTML = '';
      (FALLBACK_MODELS[provider] || []).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name || m.id;
        opt.selected = m.id === currentModel;
        modelSel.appendChild(opt);
      });
    };

    populateModels(currentProvider);

    // ── Load current API key ──────────────────────────────────────
    const loadKey = async provider => {
      try {
        const { getSecureAPIKey } = await import('../core/storage/secure-key-storage.js');
        const key = await getSecureAPIKey(provider);
        allowBtn.hidden = true;
        if (key) {
          keyInput.value = key;
          const [consent, reachable] = await Promise.all([
            getConsent(provider),
            holdsHostPermissions([provider]),
          ]);
          if (consent !== 'granted') {
            dot.className = 'ai-status-dot warning';
            statusText.textContent = `AssisT sends nothing to ${serviceName(provider)} until you allow it.`;
          } else if (!reachable) {
            dot.className = 'ai-status-dot warning';
            statusText.textContent = `Chrome has not given AssisT access to ${serviceName(provider)}, so nothing can be sent to it yet.`;
          } else {
            dot.className = 'ai-status-dot online';
            statusText.textContent = 'API key configured';
            return;
          }
          allowBtn.textContent = `Allow access to ${serviceName(provider)}`;
          allowBtn.hidden = false;
        } else {
          keyInput.value = '';
          dot.className = 'ai-status-dot warning';
          statusText.textContent = 'API key required';
        }
      } catch {
        dot.className = 'ai-status-dot offline';
        statusText.textContent = 'Could not load key';
      }
    };

    await loadKey(currentProvider);

    /** The button focus was on has gone away: the status line says what happened (SC 2.4.3). */
    const keepFocusInPanel = () => {
      const active = document.activeElement;
      if (allowBtn.hidden && (!active || active === allowBtn || active === document.body)) {
        statusLine.focus();
      }
    };

    // ── Event handlers ────────────────────────────────────────────
    this.attachInteractiveHandler(allowBtn, 'Allow cloud AI provider', () => {
      const provider = provSel.value;
      // Intent first, and both before anything is awaited: the yes is written now, then Chrome is
      // asked inside this gesture. Its prompt can close the popup; the yes is already sent.
      const recorded = recordConsent(provider, true);
      const access = requestHostPermissions(originsFor([provider]));
      recorded
        .then(() => access)
        .then(async granted => {
          await loadKey(provider);
          if (!granted) {
            statusText.textContent = `Chrome did not give AssisT access to ${serviceName(provider)}. Press the button again and choose Allow.`;
          }
          keepFocusInPanel();
        })
        .catch(error => {
          console.error('[Popup] Could not record the answer:', error);
          dot.className = 'ai-status-dot offline';
          statusText.textContent = 'Your answer could not be saved. Try again.';
        });
    });

    // Show/hide toggle
    this.attachInteractiveHandler(toggleBtn, 'Show API key', () => {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
      toggleBtn.setAttribute('aria-pressed', String(keyInput.type === 'text'));
    });

    // Provider change
    provSel.addEventListener('change', async () => {
      const p = provSel.value;
      chrome.storage.local.set({ cloudProvider: p });
      consentNote.textContent = describeCloudConsent(p);
      await loadKey(p);
      populateModels(p);
    });

    // Model change
    modelSel.addEventListener('change', () => {
      chrome.storage.local.set({ cloudModel: modelSel.value });
    });

    // Save key on button click
    this.attachInteractiveHandler(saveBtn, 'Save API Key', () => {
      const key = keyInput.value.trim();
      if (!key) {
        dot.className = 'ai-status-dot warning';
        statusText.textContent = 'Enter a key first';
        return;
      }
      const provider = provSel.value;
      // Intent first, all before anything is awaited: the service worker saves the key (it
      // outlives the popup), the yes is written (saving the key, beside the note that names the
      // provider, is the student's yes), and only then is Chrome asked, inside this gesture. Its
      // prompt can close the popup; what the student did is already on its way.
      const saved = Promise.resolve(
        chrome.runtime.sendMessage({ action: 'SAVE_API_KEY', provider, apiKey: key })
      ).then(
        reply => reply?.success === true,
        () => false
      );
      const recorded = recordConsent(provider, true).then(
        () => true,
        error => {
          console.error('[Popup] Could not record the answer:', error);
          return false;
        }
      );
      const access = requestHostPermissions(originsFor([provider]));
      dot.className = 'ai-status-dot';
      statusText.textContent = 'Saving…';

      saved.then(async stored => {
        if (!stored) {
          dot.className = 'ai-status-dot offline';
          statusText.textContent = 'Save failed — try wizard';
          return;
        }
        const [yes, granted] = await Promise.all([recorded, access]);
        if (granted && yes) {
          allowBtn.hidden = true;
          dot.className = 'ai-status-dot online';
          statusText.textContent = 'Key saved ✓';
          return;
        }
        // The key is saved; what is missing is the yes (its write failed) or Chrome's access. The
        // button beside the note gives both.
        dot.className = 'ai-status-dot warning';
        statusText.textContent = granted
          ? `Key saved. Your answer could not be saved, so nothing is sent to ${serviceName(provider)} yet.`
          : `Key saved. Chrome did not give AssisT access to ${serviceName(provider)}, so nothing can be sent yet.`;
        allowBtn.textContent = `Allow access to ${serviceName(provider)}`;
        allowBtn.hidden = false;
      });
    });

    // Save model selection on blur too (immediate feedback)
    keyInput.addEventListener('blur', () => {
      // Just trim whitespace; save is explicit via button
    });

    // ── Feature Models section (Anthropic only) ───────────────────
    await this._renderFeatureModelsSection(container, currentProvider);

    // Keep feature models section in sync when provider changes
    provSel.addEventListener('change', async () => {
      const existingSection = container.querySelector('.ai-feature-models-section');
      if (existingSection) {
        existingSection.remove();
      }
      await this._renderFeatureModelsSection(container, provSel.value);
    });
  }

  /**
   * Render the per-feature model selection section (Anthropic only).
   * @param {HTMLElement} container
   * @param {string} provider
   */
  async _renderFeatureModelsSection(container, provider) {
    // Only show for Anthropic
    if (provider !== 'anthropic') {
      return;
    }

    const FEATURE_LIST = [
      { key: 'summarization', label: 'Summarization' },
      { key: 'textSimplification', label: 'Text Simplification' },
      { key: 'studyPathGenerator', label: 'Study Path Generator' },
      { key: 'assignmentBreakdown', label: 'Assignment Breakdown' },
      { key: 'socraticTutor', label: 'Socratic Tutor' },
      { key: 'citationAnalyzer', label: 'Citation Analyzer' },
      { key: 'knowledgeGraph', label: 'Knowledge Graph' },
      { key: 'multiDocCompare', label: 'Multi-Doc Compare' },
    ];

    const MODEL_OPTIONS = [
      { value: 'auto', label: 'Auto (feature default)' },
      { value: 'haiku', label: 'Haiku (fastest)' },
      { value: 'sonnet', label: 'Sonnet (balanced)' },
      { value: 'opus', label: 'Opus (most capable)' },
    ];

    // Load current preferences
    const storageKeys = [
      'featureModelAutoSelect',
      ...FEATURE_LIST.map(f => `featureModel_${f.key}`),
    ];
    const stored = await chrome.storage.local.get(storageKeys);
    const autoSelect = stored.featureModelAutoSelect !== false; // default true

    const section = document.createElement('div');
    section.className = 'ai-feature-models-section';
    section.style.cssText =
      'margin-top:12px;border-top:1px solid var(--border-color,#e0e0e0);padding-top:10px;';

    // Section header + toggle row
    const headerRow = document.createElement('div');
    headerRow.className = 'ai-panel-row';
    headerRow.style.marginBottom = '6px';
    headerRow.innerHTML = `<span class="ai-panel-label" style="font-weight:600">Feature Models</span>`;

    const toggleLabel = document.createElement('label');
    toggleLabel.style.cssText =
      'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary,#666);cursor:pointer;';
    const toggleCheck = document.createElement('input');
    toggleCheck.type = 'checkbox';
    toggleCheck.checked = autoSelect;
    toggleCheck.setAttribute('aria-label', 'Auto-select best model for each feature');
    toggleLabel.appendChild(toggleCheck);
    toggleLabel.appendChild(document.createTextNode('Auto-select'));
    headerRow.appendChild(toggleLabel);
    section.appendChild(headerRow);

    // Per-feature dropdown rows (shown when auto-select is OFF)
    const featureRows = document.createElement('div');
    featureRows.className = 'ai-feature-model-rows';
    featureRows.style.display = autoSelect ? 'none' : 'block';

    FEATURE_LIST.forEach(feature => {
      const currentVal = stored[`featureModel_${feature.key}`] || 'auto';
      const row = document.createElement('div');
      row.className = 'ai-panel-row';
      row.style.cssText = 'padding:3px 0;';
      const labelEl = document.createElement('span');
      labelEl.className = 'ai-panel-label';
      labelEl.style.cssText = 'font-size:12px;color:var(--text-secondary,#666);';
      labelEl.textContent = feature.label;
      const sel = document.createElement('select');
      sel.className = 'ai-panel-select';
      sel.style.cssText = 'font-size:12px;padding:2px 4px;';
      sel.setAttribute('aria-label', `Model for ${feature.label}`);
      MODEL_OPTIONS.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        o.selected = opt.value === currentVal;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        chrome.storage.local.set({ [`featureModel_${feature.key}`]: sel.value });
      });
      row.appendChild(labelEl);
      row.appendChild(sel);
      featureRows.appendChild(row);
    });

    section.appendChild(featureRows);
    container.appendChild(section);

    // Toggle handler
    toggleCheck.addEventListener('change', () => {
      const isAuto = toggleCheck.checked;
      chrome.storage.local.set({ featureModelAutoSelect: isAuto });
      featureRows.style.display = isAuto ? 'none' : 'block';
    });
  }

  /**
   * Render the Browser AI (WebLLM) panel into a container element.
   * @param {HTMLElement} container
   * @param {boolean} isModal
   */
  async _renderWebLLMPanel(container, isModal) {
    if (isModal) {
      await this._renderWebLLMBrowser(container);
    } else {
      await this._renderWebLLMQuick(container);
    }
  }

  // ── Compact dropdown panel (popup quick-switch) ────────────────────────────

  async _renderWebLLMQuick(container) {
    const MODELS = [
      { key: 'llama-3.2-1b', label: 'Llama 3.2 1B (650 MB)' },
      { key: 'gemma-2b', label: 'Gemma 2B (1.6 GB)' },
      { key: 'llama-3.2-3b', label: 'Llama 3.2 3B (1.9 GB)' },
      { key: 'phi-3.5-mini', label: 'Phi-3.5 Mini (2.3 GB)' },
      { key: 'qwen2.5-3b', label: 'Qwen 2.5 3B (1.9 GB)' },
      { key: 'mistral-7b', label: 'Mistral 7B (4.4 GB)' },
      { key: 'llama-3.1-8b', label: 'Llama 3.1 8B (4.9 GB)' },
      { key: 'gemma-9b', label: 'Gemma 2 9B (5.4 GB)' },
    ];

    const s = await chrome.storage.local.get(['webllmModel', 'webllmCachedModels']);
    const currentModel = s.webllmModel || 'llama-3.2-1b';
    const cachedModels = s.webllmCachedModels || [];

    const modelRow = document.createElement('div');
    modelRow.className = 'ai-panel-row';
    modelRow.innerHTML = `<span class="ai-panel-label">Model</span>`;
    const modelSel = document.createElement('select');
    modelSel.className = 'ai-panel-select';
    modelSel.setAttribute('aria-label', 'Browser AI model');
    MODELS.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.key;
      opt.textContent = cachedModels.includes(m.key) ? `${m.label} ✓` : m.label;
      opt.selected = m.key === currentModel;
      modelSel.appendChild(opt);
    });
    modelRow.appendChild(modelSel);
    container.appendChild(modelRow);

    const actionRow = document.createElement('div');
    actionRow.className = 'ai-panel-row';
    actionRow.style.marginTop = '6px';
    const dot = document.createElement('span');
    dot.className = 'ai-status-dot';
    const statusText = document.createElement('span');
    statusText.style.cssText = 'flex:1;font-size:11px;color:var(--text-secondary)';
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'ai-panel-action-btn primary';
    actionRow.append(dot, statusText, actionBtn);
    container.appendChild(actionRow);

    const progressBar = document.createElement('div');
    progressBar.className = 'ai-download-bar';
    progressBar.style.display = 'none';
    const progressFill = document.createElement('div');
    progressFill.className = 'ai-download-bar-fill';
    progressBar.appendChild(progressFill);
    container.appendChild(progressBar);

    const refresh = async key => {
      const cached = cachedModels.includes(key);
      try {
        const r = await chrome.runtime.sendMessage({ action: 'WEBLLM_STATUS' });
        const loaded =
          r?.loaded &&
          r?.modelId &&
          r.modelId.toLowerCase().includes(key.split('-').slice(0, 2).join('-').toLowerCase());
        if (loaded) {
          dot.className = 'ai-status-dot online';
          statusText.textContent = 'Ready';
          actionBtn.textContent = 'Change model';
          actionBtn.className = 'ai-panel-action-btn';
        } else if (cached) {
          dot.className = 'ai-status-dot warning';
          statusText.textContent = 'Downloaded — not loaded';
          actionBtn.textContent = 'Load model';
          actionBtn.className = 'ai-panel-action-btn primary';
        } else {
          dot.className = 'ai-status-dot';
          statusText.textContent = 'Not downloaded';
          actionBtn.textContent = 'Download';
          actionBtn.className = 'ai-panel-action-btn primary';
        }
      } catch {
        dot.className = 'ai-status-dot';
        statusText.textContent = cached ? 'Downloaded' : 'Not downloaded';
        actionBtn.textContent = cached ? 'Load model' : 'Download';
        actionBtn.className = 'ai-panel-action-btn primary';
      }
    };

    await refresh(currentModel);

    modelSel.addEventListener('change', async () => {
      chrome.storage.local.set({ webllmModel: modelSel.value });
      await refresh(modelSel.value);
    });

    this.attachInteractiveHandler(actionBtn, 'Download or Load WebLLM Model', async () => {
      progressBar.style.display = 'block';
      progressFill.style.width = '10%';
      actionBtn.disabled = true;
      statusText.textContent = 'Initialising…';
      dot.className = 'ai-status-dot warning';
      try {
        await chrome.runtime.sendMessage({ action: 'WEBLLM_INITIALIZE', modelKey: modelSel.value });
        progressFill.style.width = '100%';
        setTimeout(() => {
          progressBar.style.display = 'none';
        }, 800);
        dot.className = 'ai-status-dot online';
        statusText.textContent = 'Ready';
        actionBtn.textContent = 'Change model';
        actionBtn.className = 'ai-panel-action-btn';
        actionBtn.disabled = false;
      } catch (err) {
        progressBar.style.display = 'none';
        dot.className = 'ai-status-dot offline';
        statusText.textContent = 'Failed — try wizard';
        actionBtn.disabled = false;
        console.error('[Popup] WebLLM init error:', err);
      }
    });
  }

  // ── Full model browser (modal AI tab) ─────────────────────────────────────

  async _renderWebLLMBrowser(container) {
    // Model data — sourced from REGISTRY but inlined to avoid async import in popup
    const MODELS = [
      {
        key: 'llama-3.2-1b',
        name: 'Llama 3.2 1B',
        size: '650 MB',
        speed: '15–25 tok/s',
        quant: 'q4f16_1',
        category: 'lightweight',
      },
      {
        key: 'gemma-2b',
        name: 'Gemma 2B',
        size: '1.6 GB',
        speed: '15–20 tok/s',
        quant: 'q4f16_1',
        category: 'lightweight',
      },
      {
        key: 'llama-3.2-3b',
        name: 'Llama 3.2 3B',
        size: '1.9 GB',
        speed: '12–18 tok/s',
        quant: 'q4f16_1',
        category: 'balanced',
      },
      {
        key: 'phi-3.5-mini',
        name: 'Phi-3.5 Mini',
        size: '2.3 GB',
        speed: '10–18 tok/s',
        quant: 'q4f16_1',
        category: 'balanced',
      },
      {
        key: 'qwen2.5-3b',
        name: 'Qwen 2.5 3B',
        size: '1.9 GB',
        speed: '12–20 tok/s',
        quant: 'q4f16_1',
        category: 'balanced',
      },
      {
        key: 'mistral-7b',
        name: 'Mistral 7B',
        size: '4.4 GB',
        speed: '6–12 tok/s',
        quant: 'q4f16_1',
        category: 'high-quality',
      },
      {
        key: 'llama-3.1-8b',
        name: 'Llama 3.1 8B',
        size: '4.9 GB',
        speed: '5–10 tok/s',
        quant: 'q4f16_1',
        category: 'high-quality',
      },
      {
        key: 'gemma-9b',
        name: 'Gemma 2 9B',
        size: '5.4 GB',
        speed: '5–10 tok/s',
        quant: 'q4f16_1',
        category: 'high-quality',
      },
    ];

    const s = await chrome.storage.local.get(['webllmModel', 'webllmCachedModels']);
    let activeKey = s.webllmModel || 'llama-3.2-1b';
    const cachedModels = new Set(s.webllmCachedModels || []);

    // Get loaded model from service worker
    let loadedKey = null;
    try {
      const r = await chrome.runtime.sendMessage({ action: 'WEBLLM_STATUS' });
      if (r?.loaded && r?.modelId) {
        const found = MODELS.find(m =>
          r.modelId.toLowerCase().includes(m.key.split('-').slice(0, 2).join('-').toLowerCase())
        );
        if (found) {
          loadedKey = found.key;
        }
      }
    } catch {
      /* service worker not ready */
    }

    // ── Filter bar ────────────────────────────────────────────────
    const filterRow = document.createElement('div');
    filterRow.className = 'webllm-filter-row';

    const filterSel = document.createElement('select');
    filterSel.className = 'ai-panel-select webllm-filter-select';
    filterSel.setAttribute('aria-label', 'Filter models by category');
    [
      { value: 'all', label: 'All models' },
      { value: 'lightweight', label: 'Lightweight  (< 2 GB)' },
      { value: 'balanced', label: 'Balanced  (2–3 GB)' },
      { value: 'high-quality', label: 'High-quality  (4+ GB)' },
    ].forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      filterSel.appendChild(opt);
    });
    filterRow.appendChild(filterSel);
    container.appendChild(filterRow);

    // ── Card list ─────────────────────────────────────────────────
    const cardList = document.createElement('div');
    cardList.className = 'webllm-card-list';
    container.appendChild(cardList);

    // Shared progress bar (one for the whole browser)
    const progressBar = document.createElement('div');
    progressBar.className = 'ai-download-bar webllm-browser-progress';
    progressBar.style.display = 'none';
    const progressFill = document.createElement('div');
    progressFill.className = 'ai-download-bar-fill';
    progressBar.appendChild(progressFill);
    container.appendChild(progressBar);

    const renderCards = category => {
      cardList.innerHTML = '';
      const visible = category === 'all' ? MODELS : MODELS.filter(m => m.category === category);

      visible.forEach(m => {
        const isLoaded = m.key === loadedKey;
        const isCached = cachedModels.has(m.key);
        const isActive = m.key === activeKey;

        const card = document.createElement('div');
        card.className =
          'webllm-model-card' + (isLoaded ? ' is-loaded' : isCached ? ' is-cached' : '');
        card.setAttribute('data-key', m.key);

        // Status dot
        const dot = document.createElement('span');
        dot.className = 'ai-status-dot ' + (isLoaded ? 'online' : isCached ? 'warning' : '');

        // Info block
        const info = document.createElement('div');
        info.className = 'webllm-card-info';

        const nameLine = document.createElement('div');
        nameLine.className = 'webllm-card-name';
        nameLine.textContent = m.name;
        if (isActive) {
          const badge = document.createElement('span');
          badge.className = 'webllm-active-badge';
          badge.textContent = 'Active';
          nameLine.appendChild(badge);
        }

        const metaLine = document.createElement('div');
        metaLine.className = 'webllm-card-meta';
        metaLine.textContent = `${m.size} · ${m.quant} · ${m.speed}`;

        info.append(nameLine, metaLine);

        // Action button
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-panel-action-btn' + (isLoaded ? '' : ' primary');
        if (isLoaded) {
          btn.textContent = 'Unload';
        } else if (isCached) {
          btn.textContent = 'Load';
        } else {
          btn.textContent = '↓ Get';
        }

        card.append(dot, info, btn);
        cardList.appendChild(card);

        this.attachInteractiveHandler(btn, `${btn.textContent} ${m.name}`, async () => {
          if (isLoaded) {
            // Unload = switch active key away, don't unload from VRAM (WebLLM has no unload API)
            // Just mark as no longer the selection
            activeKey = '';
            chrome.storage.local.set({ webllmModel: '' });
            renderCards(filterSel.value);
            return;
          }
          // Download or load
          progressBar.style.display = 'block';
          progressFill.style.width = '10%';
          btn.disabled = true;
          try {
            await chrome.runtime.sendMessage({ action: 'WEBLLM_INITIALIZE', modelKey: m.key });
            progressFill.style.width = '100%';
            setTimeout(() => {
              progressBar.style.display = 'none';
            }, 800);
            loadedKey = m.key;
            activeKey = m.key;
            cachedModels.add(m.key);
            chrome.storage.local.set({ webllmModel: m.key });
            renderCards(filterSel.value);
          } catch (err) {
            progressBar.style.display = 'none';
            btn.disabled = false;
            btn.textContent = 'Failed';
            console.error('[Popup] WebLLM browser error:', err);
          }
        });
      });
    };

    renderCards('all');

    filterSel.addEventListener('change', () => renderCards(filterSel.value));
  }

  /**
   * Render the Local AI (Ollama) panel into a container element.
   * @param {HTMLElement} container
   * @param {boolean} isModal
   */
  async _renderLocalPanel(container, _isModal) {
    let lastDetectedModels = [];

    // Status row
    const card = document.createElement('div');
    card.className = 'ai-panel-row';

    const dot = document.createElement('span');
    dot.className = 'ai-status-dot';
    // A live region, and empty until the first check answers. This line carries the sentence
    // asking for permission to reach Ollama, and a student who cannot see the panel would
    // otherwise never learn that a permission prompt is waiting on them.
    const statusText = document.createElement('span');
    statusText.setAttribute('role', 'status');
    statusText.setAttribute('aria-live', 'polite');
    statusText.style.flex = '1';
    statusText.style.fontSize = '12px';

    /**
     * The one place this line is written, so every state reaches the region.
     * @param {string} text
     */
    const setStatus = text => {
      statusText.textContent = text;
    };

    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'ai-panel-action-btn';
    checkBtn.textContent = 'Check again';

    card.appendChild(dot);
    card.appendChild(statusText);
    card.appendChild(checkBtn);
    container.appendChild(card);

    // Model selector row
    const modelRow = document.createElement('div');
    modelRow.className = 'ai-panel-row';
    const modelLabel = document.createElement('span');
    modelLabel.className = 'ai-panel-label';
    modelLabel.textContent = 'Model';
    const modelSel = document.createElement('select');
    modelSel.className = 'ai-panel-select';
    modelSel.setAttribute('aria-label', 'Ollama model');
    modelSel.style.flex = '1';
    modelRow.appendChild(modelLabel);
    modelRow.appendChild(modelSel);
    container.appendChild(modelRow);

    const { ollamaModel: savedModel = '' } = await chrome.storage.local.get('ollamaModel');

    const populateModels = detectedModels => {
      lastDetectedModels = detectedModels || [];
      modelSel.innerHTML = '';
      // Exclude embeddings-only models (e.g. nomic-embed-text) — they can't
      // generate text and would 400 if auto-selected as the active model.
      const detected = filterChatModels(detectedModels);
      const models = detected.length > 0 ? detected : [DEFAULT_CHAT_MODEL, RECOMMENDED_PULL_MODEL];
      const defaultModel = savedModel || pickDefaultChatModel(models) || models[0];
      models.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        opt.selected = name === defaultModel;
        modelSel.appendChild(opt);
      });
      // Persist initial selection if nothing saved yet
      if (!savedModel && models.length > 0) {
        chrome.storage.local.set({ ollamaModel: defaultModel });
      }
    };

    modelSel.addEventListener('change', () => {
      chrome.storage.local.set({ ollamaModel: modelSel.value });
    });

    const checkOllama = async () => {
      setStatus('Checking…');
      dot.className = 'ai-status-dot';
      try {
        const r = await chrome.runtime.sendMessage({ action: 'LOCAL_LLM_CHECK' });
        if (r?.success && r?.available) {
          dot.className = 'ai-status-dot online';
          const models = r.models || [];
          setStatus(`Online — ${models.length} model${models.length !== 1 ? 's' : ''} available`);
          populateModels(models);
          // Update header badge
          const badge = document.getElementById('llm-status-badge');
          if (badge) {
            badge.textContent = 'Online';
            badge.className = 'llm-badge online';
          }
        } else {
          dot.className = 'ai-status-dot offline';
          // A missing permission is not a stopped server. Saying "start Ollama" to someone whose
          // Ollama is already running sends them to fix the one thing that is not broken.
          setStatus(
            r?.needsPermission
              ? 'AssisT needs your permission to reach Ollama on this computer — press Check and choose Allow.'
              : 'Offline — start Ollama to use Local AI'
          );
          populateModels([]);
          const badge = document.getElementById('llm-status-badge');
          if (badge) {
            badge.textContent = 'Offline';
            badge.className = 'llm-badge offline';
          }
        }
      } catch {
        dot.className = 'ai-status-dot offline';
        setStatus('Could not reach Ollama');
        populateModels([]);
      }
    };

    await checkOllama();

    // Check is a press, so it is also the second chance at the permission prompt for a student who
    // dismissed the first one — asked before the check, so a granted permission is checked against.
    this.attachInteractiveHandler(checkBtn, 'Check Ollama Status', async () => {
      await ensureOllamaPermission();
      await checkOllama();
    });

    // Server endpoint — where Ollama lives. Default is the student's own machine; an
    // institution can point every seat at one shared Ollama server on the LAN. A custom
    // origin needs a one-time host-permission grant, requested on Apply (a user gesture).
    const serverRow = document.createElement('div');
    serverRow.className = 'ai-panel-row';
    const serverLabel = document.createElement('span');
    serverLabel.className = 'ai-panel-label';
    serverLabel.textContent = 'Server';
    const serverInput = document.createElement('input');
    serverInput.type = 'text';
    serverInput.setAttribute('aria-label', 'Ollama server URL');
    serverInput.placeholder = DEFAULT_OLLAMA_BASE_URL;
    serverInput.style.flex = '1';
    serverInput.style.minWidth = '0';
    serverInput.style.fontSize = '12px';
    const serverApply = document.createElement('button');
    serverApply.type = 'button';
    serverApply.className = 'ai-panel-action-btn';
    serverApply.textContent = 'Apply';
    serverRow.appendChild(serverLabel);
    serverRow.appendChild(serverInput);
    serverRow.appendChild(serverApply);
    container.appendChild(serverRow);

    const serverStatus = document.createElement('p');
    serverStatus.setAttribute('role', 'status');
    serverStatus.style.margin = '2px 0 6px';
    serverStatus.style.fontSize = '11px';
    container.appendChild(serverStatus);

    const describeServer = url => {
      serverStatus.textContent =
        url === DEFAULT_OLLAMA_BASE_URL
          ? 'AI runs in Ollama on this computer — nothing leaves your machine.'
          : `AI runs on the Ollama server at ${url} — text you analyse is sent to that server. ` +
            'A server other than this computer only works if your institution has added it to the extension.';
    };
    getOllamaBaseUrl().then(url => {
      if (url !== DEFAULT_OLLAMA_BASE_URL) {
        serverInput.value = url;
      }
      describeServer(url);
    });

    this.attachInteractiveHandler(serverApply, 'Apply Ollama Server URL', async () => {
      const result = await applyOllamaBaseUrlChange(serverInput.value);
      if (result.ok) {
        serverInput.value = result.isDefault ? '' : result.url;
        describeServer(result.url);
        await checkOllama();
      } else if (result.reason === 'permission') {
        serverStatus.textContent =
          'AssisT needs your permission to reach that server — Apply again and choose Allow.';
      } else {
        serverStatus.textContent =
          'That doesn’t look like a server address — try host:port, e.g. 192.168.1.50:11434.';
      }
    });

    // ── Get more models ────────────────────────────────────────────────────────
    const catalogDetails = document.createElement('details');
    catalogDetails.className = 'ollama-popup-catalog';

    const catalogSummary = document.createElement('summary');
    catalogSummary.className = 'ollama-popup-catalog-summary';
    catalogSummary.textContent = 'Get more models';
    catalogDetails.appendChild(catalogSummary);

    const catalogBody = document.createElement('div');
    catalogBody.className = 'ollama-popup-catalog-body';
    catalogDetails.appendChild(catalogBody);
    container.appendChild(catalogDetails);

    const buildPopupCatalog = () => {
      if (catalogBody.dataset.built) {
        return;
      }
      catalogBody.dataset.built = '1';

      const ramGB = navigator.deviceMemory || 4;
      // The popup does not measure graphics memory, so the large model shows here only once
      // installed; the AI setup page offers it where the memory is known.
      const compatible = getCompatibleModels(ramGB, { installed: lastDetectedModels });

      if (compatible.length === 0) {
        const msg = document.createElement('p');
        msg.style.cssText = 'font-size:11px;color:var(--color-text-muted);padding:6px 0;';
        msg.textContent = 'No compatible models found for your system.';
        catalogBody.appendChild(msg);
        return;
      }

      compatible.forEach(model => {
        const isInstalled = isCatalogModelInstalled(model, lastDetectedModels);

        const row = document.createElement('div');
        row.className = 'ollama-popup-model-row';

        const info = document.createElement('div');
        info.className = 'ollama-popup-model-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'ollama-popup-model-name';
        nameEl.textContent = model.label;

        const metaEl = document.createElement('div');
        metaEl.className = 'ollama-popup-model-meta';
        metaEl.textContent = `${model.size} · ${model.categoryLabel}`;

        info.appendChild(nameEl);
        info.appendChild(metaEl);

        const actionEl = document.createElement('div');
        actionEl.className = 'ollama-popup-model-action';

        if (isInstalled) {
          const installed = document.createElement('span');
          installed.className = 'ollama-popup-installed';
          installed.textContent = '✓';
          installed.title = 'Installed';
          actionEl.appendChild(installed);
        } else {
          const dlBtn = document.createElement('button');
          dlBtn.type = 'button';
          dlBtn.className = 'ai-panel-action-btn';
          dlBtn.textContent = 'Get';
          dlBtn.style.fontSize = '11px';
          dlBtn.setAttribute('aria-label', `Download ${model.label}`);

          const progressBar = document.createElement('div');
          progressBar.className = 'ollama-popup-progress';
          progressBar.hidden = true;

          const barFill = document.createElement('div');
          barFill.className = 'ollama-popup-progress-fill';
          progressBar.appendChild(barFill);

          this.attachInteractiveHandler(dlBtn, `Download ${model.label}`, () => {
            dlBtn.disabled = true;
            dlBtn.textContent = '…';
            progressBar.hidden = false;

            const listener = msg => {
              if (msg.type !== 'LLM_INSTALL_PROGRESS' || msg.modelName !== model.name) {
                return;
              }
              const pct = msg.progress?.percent || 0;
              barFill.style.width = `${pct}%`;
              dlBtn.title = `${pct}%`;
            };
            chrome.runtime.onMessage.addListener(listener);

            chrome.runtime.sendMessage(
              { action: 'LOCAL_LLM_INSTALL_MODEL', modelName: model.name },
              response => {
                chrome.runtime.onMessage.removeListener(listener);
                if (response?.success) {
                  barFill.style.width = '100%';
                  dlBtn.textContent = '✓';
                  dlBtn.disabled = true;
                  row.classList.add('installed');
                  checkOllama();
                } else {
                  dlBtn.disabled = false;
                  dlBtn.textContent = 'Retry';
                  dlBtn.title = response?.error || 'Failed';
                }
              }
            );
          });

          actionEl.appendChild(dlBtn);
          actionEl.appendChild(progressBar);
        }

        row.appendChild(info);
        row.appendChild(actionEl);
        catalogBody.appendChild(row);
      });
    };

    catalogDetails.addEventListener('toggle', () => {
      if (catalogDetails.open) {
        buildPopupCatalog();
      }
    });
  }

  /**
   * Render the Gemini Nano panel into a container element.
   * @param {HTMLElement} container
   */
  async _renderGeminiPanel(container) {
    const row = document.createElement('div');
    row.className = 'ai-panel-row';
    const dot = document.createElement('span');
    dot.className = 'ai-status-dot';
    const statusText = document.createElement('span');
    statusText.style.fontSize = '12px';
    statusText.textContent = 'Checking device support…';
    row.appendChild(dot);
    row.appendChild(statusText);
    container.appendChild(row);

    try {
      const r = await chrome.runtime.sendMessage({ action: 'GEMINI_LLM_CHECK' });
      if (r?.available) {
        dot.className = 'ai-status-dot online';
        statusText.textContent = 'Ready — Gemini Nano on this device';
      } else {
        dot.className = 'ai-status-dot offline';
        statusText.textContent = 'Not available on this device';
        const note = document.createElement('p');
        note.style.cssText = 'font-size:11px; color:var(--text-secondary); margin-top:6px;';
        note.textContent = 'Gemini Nano requires Chrome with AI features enabled.';
        container.appendChild(note);
      }
    } catch {
      dot.className = 'ai-status-dot offline';
      statusText.textContent = 'Check failed';
    }
  }

  /**
   * Update AI mode (show/hide containers, update badge, notify background)
   */

  setupDarkMode() {
    // No-op: Dark mode feature removed
    console.log('[Popup] Dark mode feature removed - skipping setup');
  }
}

window.addEventListener('unhandledrejection', event => {
  console.error('[Popup] Unhandled promise rejection:', event.reason);
  event.preventDefault();
  const statusIndicator = document.getElementById('status-indicator');
  if (statusIndicator && !statusIndicator.classList.contains('error')) {
    statusIndicator.textContent = 'Unexpected error — see console (F12)';
    statusIndicator.className = 'status-indicator error';
  }
});

window.addEventListener('error', event => {
  console.error('[Popup] Uncaught error:', event.error?.message || event.message);
});

// Initialize popup when DOM is ready
/**
 * Holds a student's click while the popup is still starting. Setup paints every control from
 * storage and only then attaches its listener, so a click in that window flipped a switch that the
 * paint then put back, with nothing yet listening to save it: the choice looked taken and was
 * silently undone. Only trusted input is held; Flat drives hidden controls with programmatic
 * clicks, which must still arrive.
 *
 * @param {Event} event
 */
function holdClickWhileStarting(event) {
  if (event.isTrusted) {
    event.preventDefault();
    event.stopPropagation();
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Popup] DOMContentLoaded fired');
  const container = document.querySelector('.popup-container');
  container?.setAttribute('aria-busy', 'true');
  container?.addEventListener('click', holdClickWhileStarting, true);
  try {
    const popup = new PopupController();
    console.log('[Popup] PopupController created');
    await popup.initialize();
    console.log('[Popup] Initialize complete');
    await popup.setupUserProfiles();
    console.log('[Popup] Setup complete - ready');
  } catch (error) {
    console.error('[Popup] Initialization error:', error);
    // Show user-friendly error in status bar
    const statusIndicator = document.getElementById('status-indicator');
    if (statusIndicator) {
      statusIndicator.textContent = 'Initialization Error - See Console (F12)';
      statusIndicator.className = 'status-indicator error';
    }
  } finally {
    // Released on failure too, so a Retry offered by the failure banner can be pressed.
    container?.removeEventListener('click', holdClickWhileStarting, true);
    container?.removeAttribute('aria-busy');
    // Transitions come back only after the saved state has been painted, so nothing animates into
    // place under a student's pointer; ready is declared once they are back.
    requestAnimationFrame(() => {
      document.documentElement.classList.remove('assist-starting');
      document.documentElement.dataset.popupReady = 'true';
    });
  }
});
