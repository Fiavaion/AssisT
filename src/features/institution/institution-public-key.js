/**
 * Bundled Ed25519 PUBLIC key used to verify institution customization keys.
 *
 * This is the public half of the signing keypair. The matching PRIVATE key is held by the maintainer
 * and NEVER committed (same custody rule as the CWS publish keys) — it is used only by the offline
 * key-issuing tool to mint per-institution keys. A verifier with only the public key can confirm a key
 * is genuine but cannot forge one.
 *
 * When this is `null` the resolver treats the feature as unprovisioned and returns the generic default
 * for every install — so the public OSS build ships unbranded regardless of any key that might be
 * present in storage/policy.
 *
 * Provisioned 2026-07-01 via `scripts/issue-institution-key.mjs genkey`. The matching private key lives
 * outside this repo (custody: maintainer, never committed). Re-minting invalidates all issued keys.
 *
 * @type {string | null}  base64url of the raw (32-byte) Ed25519 public key, or null when unprovisioned.
 */
export const INSTITUTION_PUBLIC_KEY = 'SogUDaBJy-0ZMGB9tHyc9Kr8oGlkepGZeeKZM9B-sIA';
