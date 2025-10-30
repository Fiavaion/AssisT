/**
 * Color utility functions for the AssisT extension
 * @module core/utils/color
 */

/**
 * Converts a hexadecimal color code to an RGBA color string
 *
 * @param {string} hex - Hexadecimal color code (with or without # prefix)
 * @param {number} opacity - Opacity value between 0 and 1
 * @returns {string} RGBA color string in format "rgba(r, g, b, opacity)"
 *
 * @example
 * hexToRgba('#FF5733', 0.8) // Returns "rgba(255, 87, 51, 0.8)"
 * hexToRgba('00BFFF', 0.5)  // Returns "rgba(0, 191, 255, 0.5)"
 */
export function hexToRgba(hex, opacity) {
  // Remove # if present
  hex = hex.replace('#', '');

  // Parse hex values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
