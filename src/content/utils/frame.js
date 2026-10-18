/**
 * Frame position of the current content-script instance.
 *
 * The manifest injects with `all_frames: true`, so every feature module runs once per iframe on
 * the page. Features that paint a viewport-wide layer or take over the pointer must act in the
 * top document only: a fixed element there already covers every nested frame, and a copy per
 * frame would stack (a multiply tint applied twice, a cursor per frame).
 */

/**
 * Whether this script runs in the top-level document.
 * A cross-origin ancestor makes `window.top` throw; that is still not the top frame.
 * @returns {boolean}
 */
export function isTopFrame() {
  try {
    return window.top === window.self;
  } catch {
    return false;
  }
}
