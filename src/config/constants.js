/**
 * Shared Constants
 * Centralized configuration to avoid duplication
 */

export const MESSAGE_TYPES = {
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  RESET_SETTINGS: 'RESET_SETTINGS',
  EXPORT_SETTINGS: 'EXPORT_SETTINGS',
  IMPORT_SETTINGS: 'IMPORT_SETTINGS',
  GET_TAB_CONTEXT: 'GET_TAB_CONTEXT',
  GET_PAGE_CONTEXT: 'GET_PAGE_CONTEXT',
  TTS_COMMAND: 'TTS_COMMAND',
  STT_COMMAND: 'STT_COMMAND'
};

export const CANVAS_DOMAINS = '*://*.instructure.com/*';

export const STORAGE_KEYS = {
  SETTINGS: 'assist_settings',
  USER_PROFILE: 'assist_user_profile',
  LAST_SYNC: 'assist_last_sync'
};

export const CONTENT_TYPES = {
  ASSIGNMENT: 'assignment',
  DISCUSSION: 'discussion',
  ANNOUNCEMENT: 'announcement',
  PAGE: 'page',
  QUIZ: 'quiz',
  MODULE: 'module'
};

export const HIGHLIGHT_COLOR = '#FFEB3B';
export const DEFAULT_FONT_SIZE = 16;
export const DEFAULT_TTS_RATE = 1.0;
export const DEFAULT_TTS_PITCH = 1.0;
