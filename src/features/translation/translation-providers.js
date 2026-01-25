/**
 * Translation Providers Module
 *
 * Supports multiple translation providers with fallback
 * - MyMemory (free, no key)
 * - DeepL (free tier 500k chars/month with key)
 * - Azure Translator (free tier 2M chars/month with key)
 */

// Provider configurations
export const PROVIDERS = {
  mymemory: {
    id: 'mymemory',
    name: 'MyMemory',
    requiresKey: false,
    freeLimit: '10,000 words/day per IP',
    quality: 'Basic',
    website: null,
  },
  deepl: {
    id: 'deepl',
    name: 'DeepL',
    requiresKey: true,
    freeLimit: '500,000 chars/month',
    quality: 'Excellent',
    website: 'https://www.deepl.com/pro-api',
  },
  azure: {
    id: 'azure',
    name: 'Azure Translator',
    requiresKey: true,
    freeLimit: '2 million chars/month',
    quality: 'Very Good',
    website: 'https://azure.microsoft.com/services/cognitive-services/translator/',
  },
};

/**
 * MyMemory Provider
 */
export async function translateWithMyMemory(text, targetLang, sourceLang = 'en') {
  const langpair = `${sourceLang}|${targetLang}`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`;

  const response = await fetch(url);

  if (response.status === 429) {
    throw new Error('RATE_LIMIT_EXCEEDED');
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  if (data.quotaFinished === true) {
    throw new Error('QUOTA_EXCEEDED');
  }

  if (data.responseStatus !== 200) {
    throw new Error(`Translation failed: ${data.responseDetails || 'Unknown error'}`);
  }

  const translatedText = data.responseData?.translatedText || data.translatedText;

  if (!translatedText) {
    throw new Error('No translation in response');
  }

  return translatedText;
}

/**
 * DeepL Provider
 */
export async function translateWithDeepL(text, targetLang, sourceLang, apiKey) {
  if (!apiKey) {
    throw new Error('API_KEY_REQUIRED');
  }

  // DeepL uses different language codes
  const deepLTargetLang = targetLang.toUpperCase();

  const url = 'https://api-free.deepl.com/v2/translate';

  const params = new URLSearchParams({
    auth_key: apiKey,
    text: text,
    target_lang: deepLTargetLang,
  });

  if (sourceLang && sourceLang !== 'auto') {
    params.append('source_lang', sourceLang.toUpperCase());
  }

  const response = await fetch(url, {
    method: 'POST',
    body: params,
  });

  if (response.status === 403) {
    throw new Error('INVALID_API_KEY');
  }

  if (response.status === 456) {
    throw new Error('QUOTA_EXCEEDED');
  }

  if (response.status === 429) {
    throw new Error('RATE_LIMIT_EXCEEDED');
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data.translations || data.translations.length === 0) {
    throw new Error('No translation in response');
  }

  return data.translations[0].text;
}

/**
 * Azure Translator Provider
 */
export async function translateWithAzure(text, targetLang, sourceLang, apiKey, region = 'global') {
  if (!apiKey) {
    throw new Error('API_KEY_REQUIRED');
  }

  const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${targetLang}`;

  const headers = {
    'Ocp-Apim-Subscription-Key': apiKey,
    'Ocp-Apim-Subscription-Region': region,
    'Content-Type': 'application/json',
  };

  if (sourceLang && sourceLang !== 'auto') {
    url += `&from=${sourceLang}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify([{ text: text }]),
  });

  if (response.status === 401) {
    throw new Error('INVALID_API_KEY');
  }

  if (response.status === 403) {
    throw new Error('QUOTA_EXCEEDED');
  }

  if (response.status === 429) {
    throw new Error('RATE_LIMIT_EXCEEDED');
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  if (!data || data.length === 0 || !data[0].translations || data[0].translations.length === 0) {
    throw new Error('No translation in response');
  }

  return data[0].translations[0].text;
}

/**
 * Unified translate function with provider selection
 */
export async function translate(text, targetLang, sourceLang = 'auto', providerId, apiKeys = {}) {
  // Determine provider (fallback to myMemory if not specified)
  const provider = providerId || 'mymemory';

  try {
    switch (provider) {
      case 'deepl':
        return await translateWithDeepL(text, targetLang, sourceLang, apiKeys.deepl);

      case 'azure':
        return await translateWithAzure(
          text,
          targetLang,
          sourceLang,
          apiKeys.azure,
          apiKeys.azureRegion
        );

      case 'mymemory':
      default:
        return await translateWithMyMemory(text, targetLang, sourceLang);
    }
  } catch (error) {
    // Add provider info to error
    error.provider = provider;
    throw error;
  }
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error) {
  const providerName = PROVIDERS[error.provider]?.name || error.provider;

  switch (error.message) {
    case 'RATE_LIMIT_EXCEEDED':
      return {
        title: `${providerName} Rate Limit Exceeded`,
        message: `You're sending requests too quickly. Please wait a moment and try again.`,
        action: 'Try switching to a different translation provider.',
      };

    case 'QUOTA_EXCEEDED':
      return {
        title: `${providerName} Quota Exceeded`,
        message: `You've reached the ${PROVIDERS[error.provider]?.freeLimit} limit for ${providerName}.`,
        action: 'Switch to a different provider in the translation settings.',
      };

    case 'INVALID_API_KEY':
      return {
        title: 'Invalid API Key',
        message: `Your ${providerName} API key is invalid or has expired.`,
        action: 'Update your API key in the extension settings.',
      };

    case 'API_KEY_REQUIRED':
      return {
        title: 'API Key Required',
        message: `${providerName} requires an API key.`,
        action: `Get a free API key at: ${PROVIDERS[error.provider]?.website}`,
      };

    default:
      return {
        title: 'Translation Error',
        message: `${providerName}: ${error.message}`,
        action: 'Try switching to a different provider.',
      };
  }
}
