/**
 * Vite plugin: puts the WebLLM model libraries into the package (ADR 0010).
 *
 * Each Browser AI model needs a compiled WebGPU library that is not on npm and is not committed to
 * this repo. At build time each library pinned in `src/ai/webllm-model-libs.js` is read from the
 * gitignored cache `.cache/webllm-libs/<version>/`, or, when missing there, downloaded from the
 * upstream repo at a fixed commit. Its size and SHA-256 must match the pin, or the build stops;
 * nothing unverified is cached or emitted. A repeat build needs no network.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import {
  WEBLLM_LIB_DIR,
  WEBLLM_LIB_VERSION,
  WEBLLM_MODEL_LIBS,
} from '../src/ai/webllm-model-libs.js';

/** The upstream commit the pins were measured from (mlc-ai/binary-mlc-llm-libs, 2026-05-19). */
const UPSTREAM_COMMIT = '025bcaf3780fa8254f5e5efd3bfea0a5397248f4';

export const WEBLLM_LIB_SOURCE =
  `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/${UPSTREAM_COMMIT}` +
  `/web-llm-models/${WEBLLM_LIB_VERSION}/`;

const DEFAULT_CACHE_DIR = path.join('.cache', 'webllm-libs', WEBLLM_LIB_VERSION);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function matches(bytes, pin) {
  return bytes.length === pin.bytes && sha256(bytes) === pin.sha256;
}

/**
 * One pinned library's bytes: from the cache when it matches, otherwise downloaded and checked.
 *
 * @param {{file: string, bytes: number, sha256: string}} pin
 * @param {{cacheDir?: string, fetchImpl?: typeof fetch}} [options]
 * @returns {Promise<Buffer>}
 * @throws {Error} when the download fails or does not match the pin
 */
export async function pinnedModelLib(pin, { cacheDir = DEFAULT_CACHE_DIR, fetchImpl = fetch } = {}) {
  const cached = path.join(cacheDir, pin.file);
  if (fs.existsSync(cached)) {
    const bytes = fs.readFileSync(cached);
    if (matches(bytes, pin)) {
      return bytes;
    }
  }

  const url = `${WEBLLM_LIB_SOURCE}${pin.file}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`WebLLM model library ${pin.file}: download failed (HTTP ${response.status})`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!matches(bytes, pin)) {
    throw new Error(
      `WebLLM model library ${pin.file} does not match its pin: expected ${pin.bytes} bytes, ` +
        `sha256 ${pin.sha256}; got ${bytes.length} bytes, sha256 ${sha256(bytes)}. ` +
        'Nothing was cached. See src/ai/webllm-model-libs.js and ADR 0010.'
    );
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cached, bytes);
  return bytes;
}

/**
 * @param {{pins?: Object, cacheDir?: string, fetchImpl?: typeof fetch}} [options] - tests only
 * @returns {import('vite').Plugin}
 */
export function webllmModelLibs({ pins = WEBLLM_MODEL_LIBS, cacheDir, fetchImpl } = {}) {
  return {
    name: 'assist-webllm-model-libs',
    async generateBundle() {
      for (const pin of Object.values(pins)) {
        const bytes = await pinnedModelLib(pin, { cacheDir, fetchImpl });
        this.emitFile({
          type: 'asset',
          fileName: `${WEBLLM_LIB_DIR}/${pin.file}`,
          source: new Uint8Array(bytes),
        });
      }
    },
  };
}
