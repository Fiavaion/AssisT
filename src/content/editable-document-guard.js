/**
 * The one guard that keeps AssisT out of a document that is itself a writing surface.
 *
 * This module is imported FIRST by content-simple.js and must stay first. Feature modules
 * self-initialise as they are evaluated (the annotation sidebar, for one, appends its panel
 * synchronously at import time), and an ES module's imports are evaluated before the importing
 * module's own body. So a check placed in the body of content-simple.js would run after several
 * features had already put their UI into the student's essay field — which is the defect. The
 * check has to happen in the first module the bundle evaluates, and it has to stop the rest of
 * the bundle, which in an IIFE build means throwing.
 *
 * The throw is the mechanism, not an error: nothing is broken, AssisT simply has no business in
 * this frame. The parent frame's instance carries on as normal and is where the editor-facing
 * features (dictation, the authorship log) run.
 *
 * @module content/editable-document-guard
 */

import { isEditableDocument } from './utils/editable-document.js';

if (isEditableDocument()) {
  console.log(
    '[AssisT] This document is an editor surface (its body is editable), so AssisT is ' +
      'injecting nothing here — the field holds only what the student wrote.'
  );
  throw new Error('AssisT: editable document — content script not started');
}
