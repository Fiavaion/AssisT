/**
 * Resolver tests: Ed25519 verification + the managed→stored resolution order. A real Ed25519 keypair
 * is minted with Node's Web Crypto so the genuine sign→verify path is exercised (not a stub), and
 * `subtle` is injected so the test does not depend on jsdom exposing SubtleCrypto.
 *
 * This is now the ONLY home of the signature gate. The equivalent Chrome check in
 * tests/e2e/release-gates.spec.js skipped unless ASSIST_TEST_INSTITUTION_KEY was set, which it
 * never is in CI, so the property that protects against institution impersonation was going
 * unverified on every run. Nothing here reads the project's private key or any real issued token:
 * the keypair is minted in-process, so the genuine → verifies / forged → refused pair actually runs.
 */
import { webcrypto } from 'crypto';
import {
  bytesToBase64url,
  base64urlToBytes,
} from '../../../src/features/institution/institution-config.js';
import { INSTITUTION_PUBLIC_KEY } from '../../../src/features/institution/institution-public-key.js';
import {
  verifyKey,
  resolveBrandingFromToken,
  resolveInstitutionBranding,
  onInstitutionKeyChanged,
} from '../../../src/features/institution/institution-resolver.js';

const subtle = webcrypto.subtle;
const enc = new TextEncoder();

/** Mint a signed token from a payload using a private key (mirrors the offline issuing tool). */
async function mintToken(payload, privateKey) {
  const payloadSeg = bytesToBase64url(enc.encode(JSON.stringify(payload)));
  const sig = await subtle.sign({ name: 'Ed25519' }, privateKey, enc.encode(payloadSeg));
  return `${payloadSeg}.${bytesToBase64url(new Uint8Array(sig))}`;
}

async function exportRawPublic(publicKey) {
  return bytesToBase64url(new Uint8Array(await subtle.exportKey('raw', publicKey)));
}

const NCAD_PAYLOAD = {
  v: 1,
  institutionId: 'ncad',
  name: 'National College of Art and Design',
  accent: '#4e6f78',
  lmsDomain: 'canvas.ncad.ie',
};

let keyPair;
let otherPair;
let publicKey;
let token;

beforeAll(async () => {
  keyPair = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  otherPair = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  publicKey = await exportRawPublic(keyPair.publicKey);
  token = await mintToken(NCAD_PAYLOAD, keyPair.privateKey);
});

describe('verifyKey', () => {
  test('true for a genuine token verified against the matching public key', async () => {
    expect(await verifyKey(token, publicKey, subtle)).toBe(true);
  });

  test('false for a token signed by a different (impersonating) key', async () => {
    const forged = await mintToken({ ...NCAD_PAYLOAD }, otherPair.privateKey);
    expect(await verifyKey(forged, publicKey, subtle)).toBe(false);
  });

  test('false when the payload is tampered after signing', async () => {
    const [payloadSeg, sigSeg] = token.split('.');
    const evil = bytesToBase64url(enc.encode(JSON.stringify({ ...NCAD_PAYLOAD, name: 'Harvard' })));
    expect(await verifyKey(`${evil}.${sigSeg}`, publicKey, subtle)).toBe(false);
    // sanity: the untampered original still verifies
    expect(await verifyKey(`${payloadSeg}.${sigSeg}`, publicKey, subtle)).toBe(true);
  });

  test('false on missing inputs or absent SubtleCrypto', async () => {
    expect(await verifyKey('', publicKey, subtle)).toBe(false);
    expect(await verifyKey(token, null, subtle)).toBe(false);
    expect(await verifyKey(token, publicKey, undefined)).toBe(false);
    expect(await verifyKey('garbage', publicKey, subtle)).toBe(false);
  });

  test('false, never a throw, for a malformed or truncated public key', async () => {
    // importKey rejects each of these; the verifier has to swallow that and fail closed rather than
    // let an exception escape into the caller's render path.
    const truncated = publicKey.slice(0, 20); // short of Ed25519's 32 raw bytes
    const overlong = `${publicKey}AAAAAAAA`;
    const notBase64url = 'not base64url!!';
    for (const bad of [truncated, overlong, notBase64url, '#', 'AA']) {
      await expect(verifyKey(token, bad, subtle)).resolves.toBe(false);
    }
  });

  test('false, never a throw, for a truncated or re-based signature segment', async () => {
    const [payloadSeg, sigSeg] = token.split('.');
    for (const bad of [
      `${payloadSeg}.${sigSeg.slice(0, -6)}`,
      `${payloadSeg}.${sigSeg.slice(0, -6)}AAAAAA`,
      `${payloadSeg}.`,
      payloadSeg,
      `${payloadSeg}.${sigSeg}.${sigSeg}`,
    ]) {
      await expect(verifyKey(bad, publicKey, subtle)).resolves.toBe(false);
    }
  });
});

describe('the bundled public key', () => {
  // Proves the shipped anti-impersonation anchor is a well-formed Ed25519 verification key without
  // reading, printing or needing the private half.
  test('is a raw 32-byte Ed25519 key the platform will import for verification', async () => {
    expect(typeof INSTITUTION_PUBLIC_KEY).toBe('string');
    const raw = base64urlToBytes(INSTITUTION_PUBLIC_KEY);
    expect(raw).toHaveLength(32);
    await expect(
      subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify'])
    ).resolves.toBeDefined();
  });

  test('rejects a token minted by any other key', async () => {
    const foreign = await mintToken(NCAD_PAYLOAD, keyPair.privateKey);
    expect(await verifyKey(foreign, INSTITUTION_PUBLIC_KEY, subtle)).toBe(false);
  });
});

describe('resolveBrandingFromToken', () => {
  test('generic when no public key is provisioned (feature inert)', async () => {
    const out = await resolveBrandingFromToken(token, { publicKey: null, subtle });
    expect(out.name).toBeNull();
  });

  test('normalised branding for a verified token', async () => {
    const out = await resolveBrandingFromToken(token, { publicKey, subtle });
    expect(out.name).toBe('National College of Art and Design');
    expect(out.accent).toBe('#4e6f78');
    expect(out.lmsDomain).toBe('canvas.ncad.ie');
    expect(out.institutionId).toBe('ncad');
  });

  test('generic when verification fails', async () => {
    const forged = await mintToken(NCAD_PAYLOAD, otherPair.privateKey);
    const out = await resolveBrandingFromToken(forged, { publicKey, subtle });
    expect(out.name).toBeNull();
  });
});

describe('resolveInstitutionBranding (source precedence)', () => {
  test('skips all I/O and returns generic when unprovisioned', async () => {
    const getManaged = jest.fn();
    const getStored = jest.fn();
    const out = await resolveInstitutionBranding({ publicKey: null, getManaged, getStored, subtle });
    expect(out.name).toBeNull();
    expect(getManaged).not.toHaveBeenCalled();
    expect(getStored).not.toHaveBeenCalled();
  });

  test('managed policy wins over a stored key', async () => {
    const managedToken = await mintToken({ ...NCAD_PAYLOAD, institutionId: 'managed' }, keyPair.privateKey);
    const storedToken = await mintToken({ ...NCAD_PAYLOAD, institutionId: 'stored' }, keyPair.privateKey);
    const out = await resolveInstitutionBranding({
      publicKey,
      subtle,
      getManaged: async () => managedToken,
      getStored: async () => storedToken,
    });
    expect(out.institutionId).toBe('managed');
  });

  test('falls back to the stored key when managed is absent', async () => {
    const out = await resolveInstitutionBranding({
      publicKey,
      subtle,
      getManaged: async () => null,
      getStored: async () => token,
    });
    expect(out.institutionId).toBe('ncad');
  });

  test('a throwing managed source degrades to the stored key', async () => {
    const out = await resolveInstitutionBranding({
      publicKey,
      subtle,
      getManaged: async () => {
        throw new Error('policy unavailable');
      },
      getStored: async () => token,
    });
    expect(out.institutionId).toBe('ncad');
  });

  test('a forged stored key is ignored → generic', async () => {
    const forged = await mintToken(NCAD_PAYLOAD, otherPair.privateKey);
    const out = await resolveInstitutionBranding({
      publicKey,
      subtle,
      getManaged: async () => null,
      getStored: async () => forged,
    });
    expect(out.name).toBeNull();
  });
});

describe('onInstitutionKeyChanged', () => {
  let handler;
  let addListener;
  let removeListener;

  beforeEach(() => {
    // Create the mocks in beforeEach — jest.config resetMocks:true wipes implementations otherwise.
    handler = null;
    addListener = jest.fn(fn => {
      handler = fn;
    });
    removeListener = jest.fn();
    global.chrome = { storage: { onChanged: { addListener, removeListener } } };
  });

  test('fires on institutionKey changes in local and managed areas', () => {
    const listener = jest.fn();
    onInstitutionKeyChanged(listener);
    handler({ institutionKey: { newValue: 'x' } }, 'local');
    handler({ institutionKey: { oldValue: 'x' } }, 'managed');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test('ignores unrelated keys and areas, and unsubscribes', () => {
    const listener = jest.fn();
    const off = onInstitutionKeyChanged(listener);
    handler({ somethingElse: { newValue: 1 } }, 'local');
    handler({ institutionKey: { newValue: 'x' } }, 'sync');
    expect(listener).not.toHaveBeenCalled();
    off();
    expect(removeListener).toHaveBeenCalled();
  });

  test('no-op when onChanged is unavailable', () => {
    global.chrome = { storage: {} };
    expect(() => onInstitutionKeyChanged(() => {})()).not.toThrow();
  });
});
