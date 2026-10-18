/**
 * Shared Constants
 * Centralized configuration to avoid duplication
 */

export const MESSAGE_TYPES = {
  GET_SETTINGS: 'GET_SETTINGS',
  RESET_SETTINGS: 'RESET_SETTINGS',
  TTS_COMMAND: 'TTS_COMMAND',
  STT_COMMAND: 'STT_COMMAND',
  OPEN_BIBLIOGRAPHY_MANAGER: 'OPEN_BIBLIOGRAPHY_MANAGER',
};

export const STORAGE_KEYS = {
  SETTINGS: 'assist_settings',
};

export const CONTENT_TYPES = {
  ASSIGNMENT: 'assignment',
  DISCUSSION: 'discussion',
  ANNOUNCEMENT: 'announcement',
  PAGE: 'page',
  QUIZ: 'quiz',
  MODULE: 'module',
};

export const HIGHLIGHT_COLOR = '#FFEB3B';
export const DEFAULT_FONT_SIZE = 16;
export const DEFAULT_TTS_RATE = 1.0;
export const DEFAULT_TTS_PITCH = 1.0;
