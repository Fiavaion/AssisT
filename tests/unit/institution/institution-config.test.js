/**
 * Pure config-layer tests: the cosmetic-only whitelist, field validators, and the token parser.
 */
import {
  GENERIC_BRANDING,
  normaliseBranding,
  isBranded,
  isHexColour,
  isSafeLogoUrl,
  isHostname,
  base64urlToBytes,
  bytesToBase64url,
  parseKey,
} from '../../../src/features/institution/institution-config.js';

const validPngLogo = 'data:image/png;base64,iVBORw0KGgoAAAANS';

describe('field validators', () => {
  test('isHexColour accepts 3- and 6-digit hex, rejects anything else', () => {
    expect(isHexColour('#abc')).toBe(true);
    expect(isHexColour('#4e6f78')).toBe(true);
    expect(isHexColour('#ABCDEF')).toBe(true);
    expect(isHexColour('red')).toBe(false);
    expect(isHexColour('#12')).toBe(false);
    expect(isHexColour('#4e6f78; background:url(x)')).toBe(false);
    expect(isHexColour(123)).toBe(false);
  });

  test('isSafeLogoUrl allows https + raster data URLs, rejects svg/other schemes', () => {
    expect(isSafeLogoUrl('https://ncad.ie/logo.png')).toBe(true);
    expect(isSafeLogoUrl(validPngLogo)).toBe(true);
    expect(isSafeLogoUrl('data:image/webp;base64,UklGR')).toBe(true);
    expect(isSafeLogoUrl('data:image/svg+xml;base64,PHN2Zy')).toBe(false);
    expect(isSafeLogoUrl('http://ncad.ie/logo.png')).toBe(false);
    expect(isSafeLogoUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeLogoUrl(null)).toBe(false);
  });

  test('isHostname accepts bare hostnames, rejects schemes/paths/junk', () => {
    expect(isHostname('canvas.ncad.ie')).toBe(true);
    expect(isHostname('instructure.com')).toBe(true);
    expect(isHostname('https://canvas.ncad.ie')).toBe(false);
    expect(isHostname('canvas.ncad.ie/path')).toBe(false);
    expect(isHostname('localhost')).toBe(false);
    expect(isHostname('')).toBe(false);
  });
});

describe('normaliseBranding (cosmetic-only enforcement)', () => {
  test('non-object yields a copy of the generic default', () => {
    expect(normaliseBranding(null)).toEqual(GENERIC_BRANDING);
    expect(normaliseBranding('nope')).toEqual(GENERIC_BRANDING);
    expect(normaliseBranding(undefined)).toEqual(GENERIC_BRANDING);
  });

  test('keeps valid cosmetic fields', () => {
    const out = normaliseBranding({
      institutionId: 'ncad',
      name: 'National College of Art and Design',
      accent: '#4e6f78',
      accentSecondary: '#4f6f58',
      logo: validPngLogo,
      lmsDomain: 'canvas.ncad.ie',
    });
    expect(out).toEqual({
      institutionId: 'ncad',
      name: 'National College of Art and Design',
      accent: '#4e6f78',
      accentSecondary: '#4f6f58',
      logo: validPngLogo,
      lmsDomain: 'canvas.ncad.ie',
    });
  });

  test('drops unknown keys entirely — nothing outside the cosmetic whitelist survives', () => {
    const out = normaliseBranding({
      name: 'X',
      enabled: true,
      aiMode: 'cloud',
      permissions: ['<all_urls>'],
    });
    expect(out.enabled).toBeUndefined();
    expect(out.aiMode).toBeUndefined();
    expect(out.permissions).toBeUndefined();
    expect(Object.keys(out).sort()).toEqual(
      ['accent', 'accentSecondary', 'institutionId', 'logo', 'lmsDomain', 'name'].sort()
    );
  });

  test('invalid field values fall back to null (never passed through)', () => {
    const out = normaliseBranding({
      name: 'Uni',
      accent: 'red; background:url(evil)',
      logo: 'data:image/svg+xml;base64,PHN2Zy',
      lmsDomain: 'https://evil.example/x',
    });
    expect(out.name).toBe('Uni');
    expect(out.accent).toBeNull();
    expect(out.logo).toBeNull();
    expect(out.lmsDomain).toBeNull();
  });

  test('strips control characters but preserves spaces, and caps name length', () => {
    const bell = String.fromCharCode(7);
    const del = String.fromCharCode(0x7f);
    const out = normaliseBranding({ name: `NC${bell}AD ${del}College`.padEnd(300, 'x') });
    expect(out.name).not.toContain(bell);
    expect(out.name).not.toContain(del);
    expect(out.name).toContain(' '); // space (0x20) is not a control char — preserved
    expect(out.name.startsWith('NCAD College')).toBe(true);
    expect(out.name.length).toBeLessThanOrEqual(120);
  });

  test('strips Unicode bidi/zero-width format controls so a key cannot spoof the rendered name', () => {
    const rlo = '‮'; // right-to-left override — reverses following text visually
    const zwsp = '​'; // zero-width space
    const bidiIsolate = '⁦';
    const out = normaliseBranding({ name: `NCAD${rlo}${zwsp} College${bidiIsolate}` });
    expect(out.name).not.toMatch(/[​-‏‪-‮⁦-⁩﻿]/);
    expect(out.name).toBe('NCAD College');
  });
});

describe('isBranded', () => {
  test('false for generic / empty, true when a visible field is set', () => {
    expect(isBranded(GENERIC_BRANDING)).toBe(false);
    expect(isBranded(null)).toBe(false);
    expect(isBranded({ ...GENERIC_BRANDING, lmsDomain: 'canvas.ncad.ie' })).toBe(false);
    expect(isBranded({ ...GENERIC_BRANDING, name: 'NCAD' })).toBe(true);
    expect(isBranded({ ...GENERIC_BRANDING, accent: '#abc' })).toBe(true);
  });
});

describe('base64url round-trip', () => {
  test('encode then decode returns the original bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const seg = bytesToBase64url(bytes);
    expect(seg).not.toContain('+');
    expect(seg).not.toContain('/');
    expect(seg).not.toContain('=');
    expect(Array.from(base64urlToBytes(seg))).toEqual(Array.from(bytes));
  });

  test('rejects segments with non-base64url characters', () => {
    expect(() => base64urlToBytes('not valid!!')).toThrow();
  });
});

describe('parseKey', () => {
  function encodePayload(obj) {
    return bytesToBase64url(new TextEncoder().encode(JSON.stringify(obj)));
  }

  test('parses a well-formed token into payload + signature + signingInput', () => {
    const payloadSeg = encodePayload({ v: 1, name: 'NCAD' });
    const token = `${payloadSeg}.${bytesToBase64url(new Uint8Array([1, 2, 3]))}`;
    const parsed = parseKey(token);
    expect(parsed).not.toBeNull();
    expect(parsed.payload).toEqual({ v: 1, name: 'NCAD' });
    expect(parsed.signature).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(parsed.signingInput)).toBe(payloadSeg);
  });

  test('returns null for malformed / wrong-version / non-object payloads', () => {
    expect(parseKey(null)).toBeNull();
    expect(parseKey('onlyonepart')).toBeNull();
    expect(parseKey('a.b.c')).toBeNull();
    expect(parseKey('.sig')).toBeNull();
    expect(parseKey(`${encodePayload({ v: 2, name: 'x' })}.sig`)).toBeNull();
    expect(parseKey(`${encodePayload([1, 2, 3])}.sig`)).toBeNull();
    expect(parseKey('%%%.@@@')).toBeNull();
  });
});
