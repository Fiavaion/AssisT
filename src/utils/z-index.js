/**
 * @fileoverview Z-Index Layer Scale for AssisT Extension
 *
 * All extension UI elements MUST use values from this file to prevent
 * z-index collisions with each other and with host LMS pages (Canvas,
 * Moodle, Google Classroom) which may use values up to ~9999.
 *
 * Layer hierarchy (lowest → highest):
 *   BASE       - Injected reading guides, overlays behind content
 *   OVERLAY    - Reading progress bar, annotation sidebar
 *   FLOATING   - Sticky notes, emotion indicator, draggable panels
 *   CONTROLS   - Floating action buttons (FABs), microphone button
 *   MODAL      - Feature panels, OCR modal, profile selector
 *   TOAST      - Toast notifications (always on top of modals)
 *   FOCUS      - WAI-Adapt focus indicator (must clear everything)
 */

export const Z = {
  BASE: 100000,
  OVERLAY: 100100,
  FLOATING: 100200,
  CONTROLS: 100300,
  MODAL: 100400,
  TOAST: 100500,
  FOCUS: 100600,
};
