/**
 * Institutional customization — pure config layer (no crypto, no chrome, no DOM).
 *
 * An institution can ship a **cosmetic-only** interface skin (display name, accent colours, logo,
 * default LMS domain) delivered as a signed key. This module owns the *data* rules: the generic
 * default, the whitelist of allowed cosmetic fields, and the token parser. Signature verification and
 * storage I/O live in `institution-resolver.js`; keeping this half pure makes the cosmetic-only
 * boundary and the parser fully unit-testable.
 *
 * SECURITY BOUNDARY (see docs/adr/0004): customization is cosmetic ONLY.
 * `normaliseBranding` is the code-level enforcement of that boundary — it copies only known cosmetic
 * fields and validates each, so a key can never smuggle in anything else (a stray `enabled`, a URL, a
 * script). Colours are strict hex and the logo scheme is restricted, so a malicious key cannot inject
 * CSS or active content through the accent/logo values (mirrors the existing "validate custom
 * WAI-Adapt colours before injecting" precedent).
 */

/** The generic (unbranded) default — the public OSS build with no institution key provisioned. */
export const GENERIC_BRANDING = Object.freeze({
  institutionId: null,
  name: null,
  accent: null,
  accentSecondary: null,
  logo: null,
  lmsDomain: null,
});

/** Cap on the display name / id length — defensive, values are rendered via textContent. */
const MAX_NAME_LEN = 120;
const MAX_ID_LEN = 64;

/** Strict 3- or 6-digit hex colour, so an accent value can never carry arbitrary CSS. */
export function isHexColour(value) {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

/**
 * Restrict logos to https URLs or raster data URLs. SVG data URLs are rejected on purpose — even set
 * via <img>/background they are a needless active-content surface for a cosmetic field.
 */
export function isSafeLogoUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) {
    return false;
  }
  if (/^https:\/\/[^\s]+$/i.test(value)) {
    return true;
  }
  return /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value);
}

/** Plain hostname (label.label…tld), no scheme/path/port — used to scope a default LMS domain. */
export function isHostname(value) {
  return (
    typeof value === 'string' &&
    value.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(value)
  );
}

function cleanString(value, max) {
  if (typeof value !== 'string') {
    return null;
  }
  // Drop control chars (0x00–0x1F and DEL) plus Unicode bidi/zero-width format controls, code-point
  // by code-point — no control-char regex literal (keeps eslint's no-control-regex happy). Stripping
  // the bidi overrides / zero-width chars stops a signed key from visually spoofing the rendered
  // institution name (e.g. an RTL-override that reverses trailing text). Then trim and cap length.
  const FORMAT_CONTROLS = new Set([
    0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067,
    0x2068, 0x2069, 0xfeff,
  ]);
  let cleaned = '';
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code >= 0x20 && code !== 0x7f && !FORMAT_CONTROLS.has(code)) {
      cleaned += ch;
    }
  }
  cleaned = cleaned.trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

/**
 * Reduce an arbitrary parsed payload to a safe, cosmetic-only branding object. Unknown keys are
 * dropped entirely; each known key is validated and falls back to null when invalid. Non-objects
 * yield the generic default. Never throws.
 * @param {*} raw
 * @returns {typeof GENERIC_BRANDING}
 */
export function normaliseBranding(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...GENERIC_BRANDING };
  }
  return {
    institutionId: cleanString(raw.institutionId, MAX_ID_LEN),
    name: cleanString(raw.name, MAX_NAME_LEN),
    accent: isHexColour(raw.accent) ? raw.accent : null,
    accentSecondary: isHexColour(raw.accentSecondary) ? raw.accentSecondary : null,
    logo: isSafeLogoUrl(raw.logo) ? raw.logo : null,
    lmsDomain: isHostname(raw.lmsDomain) ? raw.lmsDomain : null,
  };
}

/** True when a branding object carries at least one visible cosmetic value (i.e. is not generic). */
export function isBranded(branding) {
  if (!branding || typeof branding !== 'object') {
    return false;
  }
  return Boolean(branding.name || branding.accent || branding.logo);
}

// ---- base64url + token parsing --------------------------------------------------------------------

/** Decode a base64url segment to bytes. Portable across extension contexts and Node. */
export function base64urlToBytes(segment) {
  if (typeof segment !== 'string' || !/^[a-z0-9\-_]*$/i.test(segment)) {
    throw new Error('invalid base64url');
  }
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64.length % 4 === 0 ? b64 : b64 + '='.repeat(4 - (b64.length % 4));
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/** Encode bytes to a base64url segment (no padding). Used by the issuing tool / tests. */
export function bytesToBase64url(bytes) {
  let bin = '';
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Parse a signed institution token of the form `<payloadSeg>.<sigSeg>`.
 * @param {string} token
 * @returns {{ payload: object, signature: Uint8Array, signingInput: Uint8Array } | null}
 *   null when the token is malformed, has a non-object payload, or the wrong version.
 */
export function parseKey(token) {
  if (typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const [payloadSeg, sigSeg] = parts;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(payloadSeg)));
    if (!payload || typeof payload !== 'object' || payload.v !== 1) {
      return null;
    }
    return {
      payload,
      signature: base64urlToBytes(sigSeg),
      // Sign/verify over the exact encoded payload segment — avoids JSON re-serialisation ambiguity.
      signingInput: new TextEncoder().encode(payloadSeg),
    };
  } catch {
    return null;
  }
}
