/**
 * Institutional customization — resolver (crypto verification + storage I/O).
 *
 * Resolves the active cosmetic branding for this install from a signed institution key, delivered by
 * either of two channels that both carry the SAME token format (see the 2026-07-01 ADR):
 *   1. chrome.storage.managed — an enterprise policy pushed by any Chrome fleet manager (Google
 *      Workspace, Windows GPO/Intune, macOS MDM, …). Zero-touch for managed institutions. Preferred.
 *   2. chrome.storage.local — a key already present on this machine. As of 1.0.0 there is no way to
 *      enter one: the popup ships the removal control only, because the signature gate below had
 *      never been exercised in CI and an unproven verification is not a path to put in front of a
 *      student. The read stays so an install that was branded before keeps its colours (and can
 *      drop them again through Preferences → Institution appearance).
 *
 * A key is applied only if its Ed25519 signature verifies against the bundled public key — the one
 * guardrail we keep (impersonation prevention; the gate is otherwise deliberately cosmetic and
 * bypassable). Every failure path degrades to the generic default and never throws, so a bad/forged/
 * absent key can only ever yield the unbranded UI — never a crash and never an unverified skin.
 */

import {
  GENERIC_BRANDING,
  normaliseBranding,
  parseKey,
  base64urlToBytes,
} from './institution-config.js';
import { INSTITUTION_PUBLIC_KEY } from './institution-public-key.js';

/** chrome.storage.local key holding an institution token already present on this machine. */
export const INSTITUTION_KEY_STORAGE = 'institutionKey';
/** Policy name read from chrome.storage.managed. */
export const INSTITUTION_MANAGED_KEY = 'institutionKey';

/**
 * Verify a token's Ed25519 signature against a raw public key.
 * @param {string} token
 * @param {string} publicKeyB64url - base64url of the raw 32-byte Ed25519 public key
 * @param {SubtleCrypto} [subtle] - injectable for tests; defaults to the platform Web Crypto
 * @returns {Promise<boolean>} false on any malformed input, unsupported algorithm, or bad signature
 */
export async function verifyKey(token, publicKeyB64url, subtle = globalThis.crypto?.subtle) {
  if (!token || !publicKeyB64url || !subtle) {
    return false;
  }
  const parsed = parseKey(token);
  if (!parsed) {
    return false;
  }
  try {
    const rawKey = base64urlToBytes(publicKeyB64url);
    const key = await subtle.importKey('raw', rawKey, { name: 'Ed25519' }, false, ['verify']);
    return await subtle.verify({ name: 'Ed25519' }, key, parsed.signature, parsed.signingInput);
  } catch {
    // Malformed key, or a browser without Ed25519 support (< Chrome 137) — fail closed to generic.
    return false;
  }
}

/**
 * Resolve branding from a single token: parse → verify → normalise. Generic on any failure.
 * @param {string|null|undefined} token
 * @param {{ publicKey?: string|null, subtle?: SubtleCrypto, verify?: Function }} [deps]
 * @returns {Promise<typeof GENERIC_BRANDING>}
 */
export async function resolveBrandingFromToken(token, deps = {}) {
  const { publicKey = INSTITUTION_PUBLIC_KEY, subtle, verify = verifyKey } = deps;
  if (!token || !publicKey) {
    return { ...GENERIC_BRANDING };
  }
  const ok = await verify(token, publicKey, subtle);
  if (!ok) {
    return { ...GENERIC_BRANDING };
  }
  const parsed = parseKey(token);
  return normaliseBranding(parsed && parsed.payload);
}

/**
 * Resolve the active branding, trying managed policy first, then a locally stored key.
 * Fully injectable so the orchestration is unit-testable without chrome/crypto globals.
 * @param {{
 *   getManaged?: () => Promise<string|null>,
 *   getStored?: () => Promise<string|null>,
 *   publicKey?: string|null,
 *   subtle?: SubtleCrypto,
 *   verify?: Function,
 * }} [deps]
 * @returns {Promise<typeof GENERIC_BRANDING>}
 */
export async function resolveInstitutionBranding(deps = {}) {
  const {
    getManaged = readManagedToken,
    getStored = getStoredInstitutionKey,
    publicKey = INSTITUTION_PUBLIC_KEY,
    subtle,
    verify = verifyKey,
  } = deps;

  // Unprovisioned build: skip all I/O and return generic (public OSS build stays unbranded).
  if (!publicKey) {
    return { ...GENERIC_BRANDING };
  }

  const tokenSources = [getManaged, getStored];
  for (const getToken of tokenSources) {
    let token = null;
    try {
      token = await getToken();
    } catch {
      token = null;
    }
    if (!token) {
      continue;
    }
    const branding = await resolveBrandingFromToken(token, { publicKey, subtle, verify });
    // Only a verified, non-generic key wins; otherwise fall through to the next source.
    if (branding.name || branding.accent || branding.logo || branding.lmsDomain) {
      return branding;
    }
  }
  return { ...GENERIC_BRANDING };
}

// ---- chrome.storage I/O (thin, defensive) ---------------------------------------------------------

/** Read the managed-policy token, or null where unavailable. */
export async function readManagedToken() {
  try {
    if (!chrome?.storage?.managed?.get) {
      return null;
    }
    const result = await chrome.storage.managed.get(INSTITUTION_MANAGED_KEY);
    const token = result && result[INSTITUTION_MANAGED_KEY];
    return typeof token === 'string' && token ? token : null;
  } catch {
    return null;
  }
}

/** Read the locally stored token, or null. */
export async function getStoredInstitutionKey() {
  try {
    const result = await chrome.storage.local.get(INSTITUTION_KEY_STORAGE);
    const token = result && result[INSTITUTION_KEY_STORAGE];
    return typeof token === 'string' && token ? token : null;
  } catch {
    return null;
  }
}

/** Remove any locally stored token (revert to generic, or to a managed-policy skin). */
export async function clearInstitutionKey() {
  await chrome.storage.local.remove(INSTITUTION_KEY_STORAGE);
}

/**
 * Subscribe to institution-key changes across contexts (local + managed policy), so an open
 * surface can re-resolve and re-render live when a key is applied or cleared. Returns an unsubscribe
 * function; a no-op where onChanged is unavailable.
 * @param {() => void} listener
 * @returns {() => void}
 */
export function onInstitutionKeyChanged(listener) {
  if (!chrome?.storage?.onChanged?.addListener) {
    return () => {};
  }
  const handler = (changes, area) => {
    // Same key name ('institutionKey') in both areas — cover local and managed (policy).
    if ((area === 'local' || area === 'managed') && changes[INSTITUTION_KEY_STORAGE]) {
      listener();
    }
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
