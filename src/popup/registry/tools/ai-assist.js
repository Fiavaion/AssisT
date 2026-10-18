/**
 * The AI Assist accordion section, declared as data.
 *
 * Transcribed from popup.html and popup.js rather than invented: every `id` here is the element
 * that exists today, every `path` is the settings key the current handler writes, and every
 * `default` is the fallback the current handler applies. A drift test holds this file to
 * popup.html, so a control added there without being declared here fails the suite.
 *
 * AI Assist has no `-enabled` checkbox — its state is the top-level `aiMode` key in
 * chrome.storage.local ('cloud' | 'local' | 'webllm' | 'gemini' | 'off'), not a boolean inside
 * `assist_settings`. Its tool entry below uses `toggleId: null` and `state.store: 'local'`.
 *
 * `toggleId: null` is not decoration: a view MUST NOT draw this tool as a switch. The Flat view
 * did, and the switch slid across under the student's finger and changed nothing at all — there
 * was no checkbox for it to drive, and four modes cannot be told apart by a control with two
 * positions anyway. It is drawn as a button that says the current mode in words and opens the
 * place that mode is chosen; `modes` below is where those words come from, and `actions` is where
 * it goes — the wizard while nothing has been set up, the AI settings once it has.
 *
 * It is also the last accordion section in popup.html, so everything after it — the footer, the
 * profile dialogs, the migration modal — sits outside `<main>` and belongs to no section. The
 * drift test bounds the last section at `</main>` for that reason.
 */

/** @type {Object[]} */
export const AI_ASSIST_TOOLS = [
  {
    id: 'ai',
    icon: '✨',
    name: 'AI Assist',
    description: 'Cloud, browser or local AI help with your coursework',
    section: 'ai-assist',
    group: 'Study',
    toggleId: null,
    // popup.js setupAIAssist() reads `result.aiMode || 'off'` (migrating the legacy
    // `cloudModeEnabled`/`llmEnabled` booleans into `aiMode` on first read, without triggering
    // onChanged). There is no checkbox for this tool — see the file header.
    state: { store: 'local', path: 'aiMode', default: 'off', offValue: 'off' },
    visibilityKey: null,
    keywords:
      'artificial intelligence chatgpt claude ollama gemini webllm assistant ' +
      'explain this to me in simpler words summarise coursework',
    // The four mode chips (`#ai-mode-chips input[type="radio"]`, name="ai-quick-mode") select this
    // tool's own state and write it via `chrome.storage.local.set({ aiMode: newMode, ... })` on
    // `change` (popup.js ~9913-9930). They are NOT declared as `radio` controls: unlike every other
    // radio group in this registry, none of the four carries an `id` attribute in popup.html — only
    // a shared `name` and a `value` — so there is no id for the drift test to hold them to. Recorded
    // here as plain metadata instead, so the real values this tool's state can take aren't lost.
    modes: [
      { value: 'off', label: 'Off' },
      { value: 'cloud', label: 'Cloud' },
      { value: 'webllm', label: 'Browser' },
      { value: 'local', label: 'Local' },
    ],
    controls: [],
    actions: [
      // "Set up AI →" — hidden once `aiSetupDismissed` is true; opens the full AI setup wizard.
      { id: 'btn-ai-setup-cta', label: 'Set up AI', visibilityKey: null },
      // Opens the Advanced Options modal for provider/model/API-key configuration. Those fields
      // (provider select, model select, password API-key inputs) are built at runtime by
      // `_renderCloudPanel`/`_renderLocalPanel`/`_renderWebLLMPanel` — not static popup.html — so
      // they carry no ids for this file to declare, and API-key fields are out of schema regardless.
      { id: 'btn-ai-advanced', label: 'Advanced settings', visibilityKey: null },
    ],
  },
];
