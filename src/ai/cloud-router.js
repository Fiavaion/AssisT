/**
 * Cloud AI Router for AssisT
 *
 * Provider-agnostic routing layer that delegates generation requests
 * to the correct cloud AI client based on the user's selected provider.
 *
 * All features send CLOUD_LLM_GENERATE → service worker → this router.
 * The router reads cloudProvider from storage and dispatches accordingly.
 *
 * Nothing is sent to a provider the student has not allowed (ADR 0006). The consent check is here,
 * in the one place every cloud request passes, read fresh from storage on every request, so a
 * withdrawal in the popup stops the very next one. Consent is recorded where the student saves a
 * key (the popup's AI panel and the AI setup page), beside wording that names the provider.
 *
 * Anthropic, OpenAI, Google Gemini and Perplexity are optional host permissions (ADR 0006, and
 * ADR 0007 for Gemini), requested in the same click that saves their key. A request to one of them
 * whose permission Chrome does not hold is refused here too, before anything is sent, with the
 * words a student needs to give it. That is
 * also how an install from before the change finds out: its consent carried over, its permission
 * did not, and the popup's AI Assist panel offers the button that asks Chrome for it.
 *
 * @module ai/cloud-router
 */

import { claudeGenerate } from './claude-client.js';
import { openaiGenerate } from './openai-client.js';
import { geminiGenerate } from './google-client.js';
import { perplexityGenerate } from './perplexity-client.js';
import { getSecureAPIKey } from '../core/storage/secure-key-storage.js';
import { resolveModel } from './model-registry.js';
import { DESTINATIONS, hasConsent } from '../utils/consent.js';
import { holdsHostPermissions } from '../utils/host-permissions.js';

const PROVIDERS = {
  anthropic: { generate: claudeGenerate, name: 'Anthropic' },
  openai: { generate: openaiGenerate, name: 'OpenAI' },
  google: { generate: geminiGenerate, name: 'Google' },
  perplexity: { generate: perplexityGenerate, name: 'Perplexity' },
};

/**
 * Generate text using the user's selected cloud provider
 * Reads cloudProvider from storage and routes to the correct client.
 *
 * @param {string} prompt - The prompt to send
 * @param {Object} options - Generation options (model, maxTokens, temperature, feature)
 * @returns {Promise<{content: string, usage: Object}>}
 */
export async function cloudGenerate(prompt, options = {}) {
  const provider = await getActiveProvider();
  const providerConfig = PROVIDERS[provider];

  if (!providerConfig) {
    throw new Error(
      `Unknown cloud provider: ${provider}. Supported: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }

  await assertConsent(provider);
  await assertHostPermission(provider);

  console.log(
    `[CloudRouter] Routing to ${providerConfig.name} (model: ${options.model || 'default'})`
  );

  // Resolve model keys (e.g., 'sonnet-5.5') to actual API model IDs via registry
  if (options.model) {
    options.model = resolveModel(provider, options.model);
  }

  return providerConfig.generate(prompt, options);
}

/**
 * Check if cloud AI is available for the active provider
 * @returns {Promise<{available: boolean, provider: string, reason?: string}>}
 */
export async function checkCloudAvailability() {
  const provider = await getActiveProvider();
  const hasKey = await getSecureAPIKey(provider);
  const allowed = await hasConsent(provider);
  const reachable = await holdsHostPermissions([provider]);

  let reason = null;
  if (!hasKey) {
    reason = 'API key not configured';
  } else if (!allowed) {
    reason = notAllowedMessage(provider);
  } else if (!reachable) {
    reason = noPermissionMessage(provider);
  }

  return {
    available: !!hasKey && allowed && reachable,
    provider,
    providerName: PROVIDERS[provider]?.name || provider,
    reason,
    needsApiKey: !hasKey,
    needsHostPermission: !!hasKey && allowed && !reachable,
  };
}

/**
 * What a student is told when a provider has not been allowed, and where to allow it.
 * @param {string} provider
 * @returns {string}
 */
function notAllowedMessage(provider) {
  const service = DESTINATIONS[provider]?.service || provider;
  return (
    `You have not allowed AssisT to send text to ${service}, so nothing was sent. ` +
    `Open the AssisT popup, go to AI Assist, and press "Allow access to ${service}".`
  );
}

/**
 * What a student is told when Chrome does not hold the provider's optional host permission.
 * @param {string} provider
 * @returns {string}
 */
function noPermissionMessage(provider) {
  const service = DESTINATIONS[provider]?.service || provider;
  return (
    `Chrome has not given AssisT access to ${service}, so nothing was sent. ` +
    `Open the AssisT popup, go to AI Assist, and press "Allow access to ${service}".`
  );
}

/**
 * Refuse, before anything is sent, a provider the student has not allowed.
 * @param {string} provider
 * @returns {Promise<void>}
 */
async function assertConsent(provider) {
  if (!(await hasConsent(provider))) {
    throw new Error(notAllowedMessage(provider));
  }
}

/**
 * Refuse, before anything is sent, a provider whose optional host permission is not held.
 * @param {string} provider
 * @returns {Promise<void>}
 */
async function assertHostPermission(provider) {
  if (!(await holdsHostPermissions([provider]))) {
    throw new Error(noPermissionMessage(provider));
  }
}

/**
 * Get the active cloud provider from storage
 * @returns {Promise<string>}
 */
async function getActiveProvider() {
  try {
    const result = await chrome.storage.local.get('cloudProvider');
    return result.cloudProvider || 'anthropic';
  } catch {
    return 'anthropic';
  }
}

export default {
  cloudGenerate,
  checkCloudAvailability,
};
