/**
 * Which of the three Ollama states the setup page is in.
 *
 * Kept apart from the rendering because the distinction is the whole point: the page used to show
 * "❌ Ollama not detected — Ollama is not running" whenever the check came back unavailable, and
 * a student whose only problem was an ungranted host permission was sent off to reinstall a
 * server that was already answering. The service worker reports the two cases separately
 * (`needsPermission`); this decides what the page does with that.
 *
 * @module pages/ai-setup/ollama-status
 */

/**
 * @param {{ available?: boolean, models?: string[], needsPermission?: boolean }} [ollama]
 *   The Ollama half of the system assessment.
 * @returns {'ready'|'needs-permission'|'not-running'}
 *   'ready' — reachable with a model installed; 'needs-permission' — the host permission has
 *   never been granted, so one press of Allow may be all that is wrong; 'not-running' —
 *   nothing answered, or nothing is installed yet, so the install steps apply.
 */
export function ollamaPanelState(ollama) {
  if (ollama?.available === true && Array.isArray(ollama.models) && ollama.models.length > 0) {
    return 'ready';
  }
  if (ollama?.needsPermission === true) {
    return 'needs-permission';
  }
  return 'not-running';
}
