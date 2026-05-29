/**
 * @fiavaion/local-ai-router — TypeScript definitions
 *
 * Extraction in progress from AssisT src/ai/ (ollama-client, webllm-client,
 * cloud-router, fallback-manager). Full API stabilised at v1.0.
 */

// ─── Mode types ────────────────────────────────────────────────────────────────

/**
 * AI inference mode.
 *
 * - `'auto'`       — router picks best available mode using degradation order
 * - `'ollama'`     — local Ollama server (http://localhost:11434)
 * - `'webllm'`     — in-browser WebLLM (MLC; model loaded into WASM runtime)
 * - `'promptapi'`  — Chrome built-in Prompt API (Chrome 127+, hardware-gated)
 * - `'cloud'`      — cloud provider (Anthropic / Google / OpenAI) via API key
 */
export type RouterMode = 'auto' | 'ollama' | 'webllm' | 'promptapi' | 'cloud';

/** Which inference path was actually used for a given generate() call. */
export type UsedMode = Exclude<RouterMode, 'auto'>;

// ─── Configuration ─────────────────────────────────────────────────────────────

/** Options passed to createRouter(). */
export interface RouterConfig {
  /**
   * Preferred inference mode. Default: `'auto'`.
   * In `'auto'` mode the router tries: Ollama → WebLLM → Chrome Prompt API → cloud.
   */
  preferredMode?: RouterMode;
  /** Ollama server base URL. Default: `'http://localhost:11434'`. */
  ollamaBaseUrl?: string;
  /** Ollama model identifier. Default: `'llama3.2'`. */
  ollamaModel?: string;
  /**
   * WebLLM model identifier (must match an MLC-packaged model).
   * Default: `'llama-3.2-1b-instruct-q4f32_1-MLC'`.
   */
  webllmModel?: string;
  /**
   * Cloud provider. Default: `'anthropic'`.
   * Only used when mode is `'cloud'` or auto-degradation reaches cloud.
   */
  cloudProvider?: 'anthropic' | 'google' | 'openai';
  /** Cloud API key. When omitted the router skips cloud in auto mode. */
  cloudApiKey?: string;
  /** Request timeout in milliseconds. Default: 30000. */
  timeout?: number;
}

// ─── Generation ────────────────────────────────────────────────────────────────

/** Options for a single generate() call. */
export interface GenerateOptions {
  /** Maximum tokens to generate. Default: 1024. */
  maxTokens?: number;
  /** Temperature (0–2). Default: 0.7. */
  temperature?: number;
  /**
   * Override the router's preferred mode for this call only.
   * Useful for feature-specific routing (e.g. always use local for sensitive prompts).
   */
  mode?: RouterMode;
  /** System prompt prepended before the user prompt. */
  systemPrompt?: string;
}

/** Result returned by generate(). */
export interface GenerateResult {
  /** Generated text. */
  text: string;
  /** Which inference path was used. */
  mode: UsedMode;
  /** Token usage if reported by the backend (null for WebLLM / Prompt API). */
  usage: { promptTokens: number | null; completionTokens: number | null } | null;
  /** Whether the response was served from the router's in-memory cache. */
  cached: boolean;
}

// ─── Availability ──────────────────────────────────────────────────────────────

/** Availability status for a single mode. */
export interface ModeAvailability {
  available: boolean;
  /** Human-readable reason when unavailable. */
  reason: string | null;
  /** Whether the mode requires an API key that has not been configured. */
  needsApiKey: boolean;
  /** Whether Ollama needs to be installed/started. */
  needsOllama: boolean;
  /** Whether a WebLLM model needs to be downloaded first. */
  needsWebLLMInit: boolean;
}

/** Full availability map returned by router.checkAvailability(). */
export type AvailabilityMap = Record<UsedMode, ModeAvailability>;

// ─── Router interface ──────────────────────────────────────────────────────────

export interface LocalAIRouter {
  /**
   * Generate text. Auto-degrades through available modes unless a specific
   * mode is requested via options.mode.
   *
   * @throws {RouterError} when all modes fail and no fallback is possible.
   *
   * @example
   * const { text, mode } = await router.generate('Summarise this text: ...', { maxTokens: 500 });
   */
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;

  /**
   * Check availability of all inference modes.
   * Performs lightweight checks (ping Ollama, detect Chrome Prompt API, etc.)
   * without loading models.
   */
  checkAvailability(): Promise<AvailabilityMap>;

  /**
   * Return the mode that would be used for the next generate() call,
   * without actually generating. Useful for updating UI state.
   */
  getActiveMode(): Promise<UsedMode | null>;

  /** Update router configuration after creation. */
  configure(updates: Partial<RouterConfig>): void;

  /** Destroy the router, releasing any held WebLLM resources. */
  destroy(): void;
}

// ─── Errors ────────────────────────────────────────────────────────────────────

export class RouterError extends Error {
  /** Which mode failed. */
  mode: RouterMode;
  /** Whether the failure is retryable. */
  retryable: boolean;
  /** HTTP status code if applicable. */
  statusCode: number | null;
}

// ─── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a LocalAIRouter instance.
 *
 * @example
 * import { createRouter } from '@fiavaion/local-ai-router';
 *
 * const router = createRouter({ preferredMode: 'auto' });
 * const { text, mode } = await router.generate(prompt, { maxTokens: 500 });
 * // mode: 'ollama' | 'webllm' | 'promptapi' | 'cloud'
 */
export function createRouter(config?: RouterConfig): LocalAIRouter;
