#!/usr/bin/env node
/**
 * Offline issuing tool for institution customization keys (see docs/adr/0004).
 *
 * Mints Ed25519-signed, cosmetic-only branding tokens that the extension verifies against the bundled
 * public key. The PRIVATE key produced by `genkey` is secret and must be kept OUTSIDE the public repo
 * (same custody as the CWS publish keys) — this script itself carries no key material and is safe to
 * commit.
 *
 * Usage:
 *   node scripts/issue-institution-key.mjs genkey <privateKeyOut.jwk>
 *     → generates a keypair, writes the private JWK to <privateKeyOut.jwk>, and prints the base64url
 *       public key to paste into src/features/institution/institution-public-key.js.
 *
 *   node scripts/issue-institution-key.mjs issue <privateKeyIn.jwk> <config.json>
 *     → signs the cosmetic config in <config.json> and prints the token to hand to the institution.
 *       config.json = { "institutionId": "...", "name": "...", "accent": "#rrggbb",
 *                       "accentSecondary": "#rrggbb", "logo": "https://…|data:image/…", "lmsDomain": "…" }
 *       (all fields optional; `v:1` is added automatically; unknown fields are dropped by the client).
 */
import { webcrypto } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { bytesToBase64url } from '../src/features/institution/institution-config.js';

const enc = new TextEncoder();

function usageExit(msg) {
  if (msg) {
    console.error(`Error: ${msg}\n`);
  }
  console.error('Usage:');
  console.error('  node scripts/issue-institution-key.mjs genkey <privateKeyOut.jwk>');
  console.error('  node scripts/issue-institution-key.mjs issue <privateKeyIn.jwk> <config.json>');
  process.exit(1);
}

async function genkey(outPath) {
  if (!outPath) {
    usageExit('genkey needs an output path for the private key');
  }
  const kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const rawPub = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey));
  const jwkPriv = await webcrypto.subtle.exportKey('jwk', kp.privateKey);
  writeFileSync(outPath, JSON.stringify(jwkPriv, null, 2));
  const pub = bytesToBase64url(rawPub);
  console.log('Keypair generated.');
  console.log(`  Private key written to: ${outPath}  (KEEP SECRET — never commit)`);
  console.log('  Paste this public key into src/features/institution/institution-public-key.js:\n');
  console.log(`    export const INSTITUTION_PUBLIC_KEY = '${pub}';\n`);
}

async function issue(privPath, configPath) {
  if (!privPath || !configPath) {
    usageExit('issue needs <privateKeyIn.jwk> and <config.json>');
  }
  const jwk = JSON.parse(readFileSync(privPath, 'utf8'));
  const priv = await webcrypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const payload = { ...config, v: 1 };
  const payloadSeg = bytesToBase64url(enc.encode(JSON.stringify(payload)));
  const sig = await webcrypto.subtle.sign({ name: 'Ed25519' }, priv, enc.encode(payloadSeg));
  const token = `${payloadSeg}.${bytesToBase64url(new Uint8Array(sig))}`;
  console.log('Institution key (hand to the institution / push via policy):\n');
  console.log(token);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'genkey') {
  await genkey(a);
} else if (cmd === 'issue') {
  await issue(a, b);
} else {
  usageExit(cmd ? `unknown command "${cmd}"` : null);
}
