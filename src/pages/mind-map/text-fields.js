/**
 * Is the keyboard in a box with text in it?
 *
 * Two questions, asked by every keystroke the mind map editor claims. They live here rather than in
 * the page module because the panes need them too: read aloud has to know not to start speaking over
 * a node name being typed, and a second copy of "what counts as a text box" is a second thing to get
 * wrong. The answers decide whether a shortcut fires at all, so getting them wrong either eats the
 * student's typing or leaves the page's keys dead.
 *
 * @module pages/mind-map/text-fields
 */

/**
 * The `input` types a character can be typed into, and which therefore carry their own undo.
 *
 * Listed rather than tested by exclusion: a type nobody has thought of yet should behave like a
 * button, which is the safe way round — the page keeps its keys and nothing is silently swallowed.
 * `input.type` is the effective type, lowercased by the DOM, and 'text' when the attribute is
 * missing or names something no browser knows.
 */
const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
]);

/** The keys a `select` and a slider answer themselves, whatever the page would like them for. */
const STEPPER_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/**
 * A box with text in it, where the browser's own editing keys have to win.
 *
 * Undo is a command history over the map and Ctrl+F is the map's search, so the page claims both
 * everywhere — which is right on the outline rows and the canvas picture, and wrong in every text
 * box on the page. Ctrl+Z in the title box took a step off the map instead of putting back the word
 * the student had just deleted; Ctrl+F in the inspector's notes threw them out of a paragraph they
 * were part way through writing.
 *
 * "Text box" means what it says, and the test is the control's kind rather than its tag. This once
 * read `input, textarea, [contenteditable]`, which counted a colour radio and the Done tick as text:
 * undo, redo, search, Alt+M and every dialog key went dead while the keyboard stood on them — which
 * is precisely where a student stands the moment after changing something and wanting it back. A
 * radio holds no text to undo and no words to search, so the page's meaning is the only meaning
 * those keys have there.
 *
 * The two inline editors (an outline row, a node on the canvas) are not listed because they never
 * reach here: both stop the keystroke at their own input, so text they hold behaves like text.
 *
 * A `select` is not a text box either — there is nothing in it to undo or search. What it does
 * answer for itself is a typed letter and the arrows; that is `consumesKey`, below.
 *
 * @param {EventTarget} target - what the keystroke was aimed at.
 * @returns {boolean}
 */
export function isTextField(target) {
  const field = target?.closest?.('textarea, input, [contenteditable="true"]');
  if (!field) {
    return false;
  }
  // A textarea or a contenteditable is text by definition; an input only for the typing types.
  return field.tagName !== 'INPUT' || TEXT_INPUT_TYPES.has(field.type);
}

/**
 * Whether the control the keyboard is on answers THIS key itself.
 *
 * Every text box answers every key the page would otherwise claim, so a text box is the whole of the
 * answer for Ctrl+Z, Ctrl+F and the rest. A `select` and a slider are the two controls where it
 * depends on the key: a select jumps to an option on a typed letter and both walk their values with
 * the arrows, so a single-character or arrow shortcut must not be taken out of them — while Ctrl+Z
 * means nothing to either, and the page may have it.
 *
 * @param {EventTarget} target - what the keystroke was aimed at.
 * @param {string} key - the KeyboardEvent key.
 * @returns {boolean}
 */
export function consumesKey(target, key) {
  if (isTextField(target)) {
    return true;
  }
  const control = target?.closest?.('select, input');
  if (!control || (control.tagName !== 'SELECT' && control.type !== 'range')) {
    return false;
  }
  return key.length === 1 || STEPPER_KEYS.has(key);
}
