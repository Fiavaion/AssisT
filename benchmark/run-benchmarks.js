/**
 * AssisT AI Benchmark Runner
 *
 * Runs comprehensive benchmarks across all VRAM tiers and cloud models.
 * Outputs JSON results for analysis.
 *
 * Usage: node benchmark/run-benchmarks.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const OLLAMA_BASE_URL = 'http://localhost:11434';

// Obfuscation key for API key decryption
const OBFUSCATION_KEY = 'ASSIST_FOCUS_GROUP_2025';
const ENCRYPTED_KEY = 'Mjh+KD0gcic/KmVgcjQRKQEzCnNbWnAqKjUhHh8ZAXsqZDEMEBgrZglrQ2BHZzMnYxEpYGYOeBkvOCUIPGIkEQ1GSlRNDAFgGBYfAAF7JBYQKT8mGwwUEnNEewMZJgARAGwea343Gj0sMBMO';

// Models to test
const LOCAL_MODELS = {
  '2gb': ['phi3:mini', 'llama3.2'],
  '4gb': ['gemma3:4b'],
  '8gb': ['mistral:7b-instruct', 'qwen2.5:7b']
};

const CLOUD_MODELS = {
  'haiku-4.5': 'claude-haiku-4-5',
  'sonnet-4.5': 'claude-sonnet-4-5',
  'opus-4.5': 'claude-opus-4-5'
};

// ============================================================================
// MODEL OPTIMIZATION PROFILES
// Based on research: num_ctx is critical for Mistral (defaults to 32k!)
// ============================================================================

const MODEL_OPTIMIZATION_PROFILES = {
  // Gemma 3 4B - Optimized for structured output
  'gemma3:4b': {
    num_ctx: 4096,
    temperature: 0.7,
    top_k: 40,
    top_p: 0.9,
    repeat_penalty: 1.1
  },
  'gemma3': {
    num_ctx: 4096,
    temperature: 0.7,
    top_k: 40,
    top_p: 0.9,
    repeat_penalty: 1.1
  },
  // Mistral 7B - CRITICAL: reduced from 32k default context
  'mistral:7b-instruct': {
    num_ctx: 4096,
    temperature: 0.4,
    top_p: 0.9,
    repeat_penalty: 1.15
  },
  'mistral:7b': {
    num_ctx: 4096,
    temperature: 0.4,
    top_p: 0.9,
    repeat_penalty: 1.15
  },
  // Llama 3.2 - Optimized for speed
  'llama3.2': {
    num_ctx: 2048,
    temperature: 0.6,
    top_p: 0.9,
    repeat_penalty: 1.1
  },
  'llama3.2:3b': {
    num_ctx: 2048,
    temperature: 0.6,
    top_p: 0.9,
    repeat_penalty: 1.1
  },
  // Phi3 Mini
  'phi3:mini': {
    num_ctx: 2048,
    temperature: 0.5,
    top_p: 0.9,
    repeat_penalty: 1.1
  },
  // Qwen 2.5 7B
  'qwen2.5:7b': {
    num_ctx: 4096,
    temperature: 0.5,
    top_p: 0.9,
    repeat_penalty: 1.1
  },
  // Default profile
  'default': {
    num_ctx: 4096,
    temperature: 0.5,
    top_p: 0.9,
    repeat_penalty: 1.1
  }
};

/**
 * Get optimization profile for a model
 */
function getModelProfile(model) {
  if (MODEL_OPTIMIZATION_PROFILES[model]) {
    return MODEL_OPTIMIZATION_PROFILES[model];
  }
  for (const [key, profile] of Object.entries(MODEL_OPTIMIZATION_PROFILES)) {
    if (model.startsWith(key)) {
      return profile;
    }
  }
  return MODEL_OPTIMIZATION_PROFILES['default'];
}

// Test samples at different complexity levels
const TEST_SAMPLES = {
  simple: {
    name: 'Simple',
    text: `The teacher explained the homework assignment. Students need to write a short essay about their favorite book. The essay should be one page long. It is due next Monday. Remember to include the title and author of the book.`
  },
  moderate: {
    name: 'Moderate',
    text: `The research methodology employed in this study combines quantitative and qualitative approaches to examine student learning outcomes. Data was collected through surveys and interviews over a six-month period. The sample included 150 undergraduate students from diverse academic backgrounds. Statistical analysis revealed significant correlations between study habits and academic performance.`
  },
  complex: {
    name: 'Complex (NCAD)',
    text: `The phenomenological approach to visual arts education reconceptualises the relationship between perceiver and perceived, establishing a chiasmic intertwining that constitutes a pre-reflective stratum of meaning-making. This ontological reframing proves particularly generative when applied to post-conceptualist frameworks, wherein the indexical relationship between artwork and viewer instantiates a form of embodied cognition that antecedes discursive thought. The hermeneutic implications of such intersubjective encounters necessitate a reconceptualisation of aesthetic experience as fundamentally dialogical.`
  }
};

// Features to benchmark
const FEATURES = {
  textSimplification: {
    name: 'Text Simplification',
    levels: ['basic', 'moderate', 'academic'],
    buildPrompt: (text, level) => {
      const prompts = {
        basic: `Simplify this text for someone with reading difficulties. Use very simple words and short sentences:\n\n${text}\n\nSimplified version:`,
        moderate: `Simplify this academic text while keeping important terms. Add brief definitions in parentheses for difficult words:\n\n${text}\n\nSimplified version:`,
        academic: `Improve the readability of this academic text while preserving scholarly vocabulary. Add definitions for complex terms:\n\n${text}\n\nImproved version:`
      };
      return prompts[level] || prompts.moderate;
    }
  },
  summarization: {
    name: 'Summarization',
    levels: ['brief', 'moderate', 'detailed'],
    buildPrompt: (text, level) => {
      const prompts = {
        brief: `Summarize this text in 1-2 sentences:\n\n${text}\n\nSummary:`,
        moderate: `Provide a clear summary of this text in 3-4 sentences, capturing the main points:\n\n${text}\n\nSummary:`,
        detailed: `Provide a comprehensive summary of this text, including key details and supporting points:\n\n${text}\n\nDetailed summary:`
      };
      return prompts[level] || prompts.brief;
    }
  },
  socraticTutor: {
    name: 'Socratic Tutor',
    levels: [null],
    buildPrompt: (text) => `You are a Socratic tutor. Generate 3-4 thought-provoking questions to help a student understand this text deeply. Focus on comprehension, analysis, and critical thinking:\n\n${text}\n\nQuestions:`
  },
  assignmentBreakdown: {
    name: 'Assignment Breakdown',
    levels: [null],
    buildPrompt: (text) => `Break down this assignment into clear, actionable steps. Include estimated time for each step and key requirements:\n\n${text}\n\nBreakdown:`
  },
  citationAnalyzer: {
    name: 'Citation Analyzer',
    levels: [null],
    buildPrompt: (text) => `Analyze this text or source for credibility. Assess: source type, potential bias, key claims, and reliability. Provide a credibility score (1-10):\n\n${text}\n\nAnalysis:`
  }
};

// ============================================================================
// API KEY DECRYPTION
// ============================================================================

function decryptApiKey() {
  try {
    const encrypted = Buffer.from(ENCRYPTED_KEY, 'base64').toString('binary');
    let decrypted = '';
    for (let i = 0; i < encrypted.length; i++) {
      decrypted += String.fromCharCode(
        encrypted.charCodeAt(i) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length)
      );
    }
    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt API key:', error);
    return null;
  }
}

// ============================================================================
// OLLAMA API
// ============================================================================

async function checkOllamaModels() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) throw new Error('Ollama not available');
    const data = await response.json();
    return data.models?.map(m => m.name) || [];
  } catch (error) {
    console.error('Ollama check failed:', error.message);
    return [];
  }
}

async function ollamaGenerate(model, prompt, maxTokens = 600) {
  const startTime = Date.now();

  // Get model-specific optimization profile
  const profile = getModelProfile(model);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          // Key optimization: reduced context window for speed
          num_ctx: profile.num_ctx,
          num_predict: maxTokens,
          // Model-specific temperature
          temperature: profile.temperature,
          // Additional profile parameters
          top_p: profile.top_p,
          top_k: profile.top_k,
          repeat_penalty: profile.repeat_penalty
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      output: data.response,
      tokens: data.eval_count || 0,
      latencyMs,
      evalDuration: data.eval_duration,
      totalDuration: data.total_duration,
      // Track optimization settings used
      optimization: {
        num_ctx: profile.num_ctx,
        temperature: profile.temperature
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      latencyMs: Date.now() - startTime
    };
  }
}

// ============================================================================
// CLAUDE API
// ============================================================================

async function claudeGenerate(modelKey, prompt, maxTokens = 600, apiKey) {
  const startTime = Date.now();
  const modelId = CLOUD_MODELS[modelKey];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: maxTokens,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Claude API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      output: data.content?.[0]?.text || '',
      tokens: data.usage?.output_tokens || 0,
      inputTokens: data.usage?.input_tokens || 0,
      latencyMs
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      latencyMs: Date.now() - startTime
    };
  }
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

async function runBenchmarks() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║         AssisT AI Benchmark Suite - Starting...               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const results = {
    metadata: {
      timestamp: new Date().toISOString(),
      platform: process.platform,
      nodeVersion: process.version,
      optimized: true,
      optimizationVersion: '1.0',
      description: 'Benchmark with model-specific num_ctx, temperature, and parameter optimizations'
    },
    localModels: {},
    cloudModels: {},
    tests: []
  };

  // Check available Ollama models
  console.log('🔍 Checking Ollama models...');
  const installedModels = await checkOllamaModels();
  console.log(`   Found ${installedModels.length} models: ${installedModels.join(', ')}\n`);
  results.localModels.installed = installedModels;

  // Get API key for cloud models
  console.log('🔑 Decrypting API key for cloud models...');
  const apiKey = decryptApiKey();
  const cloudEnabled = apiKey && apiKey.startsWith('sk-');
  console.log(`   Cloud API: ${cloudEnabled ? '✓ Available' : '✗ Not available'}\n`);
  results.cloudModels.enabled = cloudEnabled;

  // Build test matrix - CLOUD FIRST to verify API keys work
  const testMatrix = [];

  // Cloud model tests FIRST
  if (cloudEnabled) {
    for (const modelKey of Object.keys(CLOUD_MODELS)) {
      for (const [featureKey, feature] of Object.entries(FEATURES)) {
        for (const complexity of Object.keys(TEST_SAMPLES)) {
          for (const level of feature.levels) {
            testMatrix.push({
              type: 'cloud',
              tier: 'cloud',
              model: modelKey,
              featureKey,
              featureName: feature.name,
              complexity,
              level,
              buildPrompt: feature.buildPrompt
            });
          }
        }
      }
    }
  }

  // Local model tests SECOND
  for (const [tier, models] of Object.entries(LOCAL_MODELS)) {
    for (const model of models) {
      const isInstalled = installedModels.some(m =>
        m === model || m.startsWith(`${model}:`) || m.startsWith(model)
      );
      if (isInstalled) {
        for (const [featureKey, feature] of Object.entries(FEATURES)) {
          for (const complexity of Object.keys(TEST_SAMPLES)) {
            for (const level of feature.levels) {
              testMatrix.push({
                type: 'local',
                tier,
                model,
                featureKey,
                featureName: feature.name,
                complexity,
                level,
                buildPrompt: feature.buildPrompt
              });
            }
          }
        }
      }
    }
  }

  console.log(`📊 Running ${testMatrix.length} benchmark tests...\n`);
  console.log('─'.repeat(70));

  let completed = 0;
  const total = testMatrix.length;

  for (const test of testMatrix) {
    completed++;
    const sample = TEST_SAMPLES[test.complexity];
    const prompt = test.level
      ? test.buildPrompt(sample.text, test.level)
      : test.buildPrompt(sample.text);

    const testLabel = `[${completed}/${total}] ${test.tier.toUpperCase()} | ${test.model} | ${test.featureName} | ${test.complexity}${test.level ? ` (${test.level})` : ''}`;
    process.stdout.write(`${testLabel}... `);

    let result;
    if (test.type === 'local') {
      // Find actual installed model name
      const actualModel = installedModels.find(m =>
        m === test.model || m.startsWith(`${test.model}:`) || m.startsWith(test.model)
      );
      result = await ollamaGenerate(actualModel, prompt);
    } else {
      result = await claudeGenerate(test.model, prompt, 600, apiKey);
    }

    const statusIcon = result.success ? '✓' : '✗';
    const latency = result.latencyMs ? `${(result.latencyMs / 1000).toFixed(2)}s` : 'N/A';
    console.log(`${statusIcon} ${latency}`);

    results.tests.push({
      type: test.type,
      tier: test.tier,
      model: test.model,
      feature: test.featureName,
      featureKey: test.featureKey,
      complexity: test.complexity,
      complexityName: sample.name,
      level: test.level,
      inputText: sample.text,
      inputLength: sample.text.length,
      ...result,
      timestamp: new Date().toISOString()
    });

    // Small delay between tests to avoid overwhelming APIs
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('─'.repeat(70));
  console.log(`\n✅ Benchmark complete! ${results.tests.filter(t => t.success).length}/${total} tests passed.\n`);

  // Save results
  const outputPath = path.join(__dirname, `benchmark-results-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`📁 Results saved to: ${outputPath}\n`);

  // Print summary
  printSummary(results);

  return results;
}

// ============================================================================
// SUMMARY PRINTER
// ============================================================================

function printSummary(results) {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                     BENCHMARK SUMMARY                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Group by tier
  const byTier = {};
  for (const test of results.tests) {
    if (!byTier[test.tier]) byTier[test.tier] = [];
    byTier[test.tier].push(test);
  }

  for (const [tier, tests] of Object.entries(byTier)) {
    const successful = tests.filter(t => t.success);
    const avgLatency = successful.length > 0
      ? successful.reduce((sum, t) => sum + t.latencyMs, 0) / successful.length
      : 0;
    const successRate = (successful.length / tests.length * 100).toFixed(0);

    console.log(`┌─ ${tier.toUpperCase()} TIER ─────────────────────────────────────`);
    console.log(`│  Tests: ${tests.length} | Success: ${successRate}% | Avg Latency: ${(avgLatency / 1000).toFixed(2)}s`);

    // Group by model within tier
    const byModel = {};
    for (const test of tests) {
      if (!byModel[test.model]) byModel[test.model] = [];
      byModel[test.model].push(test);
    }

    for (const [model, modelTests] of Object.entries(byModel)) {
      const modelSuccess = modelTests.filter(t => t.success);
      const modelAvgLatency = modelSuccess.length > 0
        ? modelSuccess.reduce((sum, t) => sum + t.latencyMs, 0) / modelSuccess.length
        : 0;
      console.log(`│  ├─ ${model}: ${modelSuccess.length}/${modelTests.length} passed, ${(modelAvgLatency / 1000).toFixed(2)}s avg`);
    }
    console.log('└' + '─'.repeat(50) + '\n');
  }

  // Complexity breakdown
  console.log('┌─ COMPLEXITY BREAKDOWN ─────────────────────────────');
  const byComplexity = {};
  for (const test of results.tests) {
    if (!byComplexity[test.complexity]) byComplexity[test.complexity] = [];
    byComplexity[test.complexity].push(test);
  }

  for (const [complexity, tests] of Object.entries(byComplexity)) {
    const successful = tests.filter(t => t.success);
    const avgLatency = successful.length > 0
      ? successful.reduce((sum, t) => sum + t.latencyMs, 0) / successful.length
      : 0;
    console.log(`│  ${complexity}: ${successful.length}/${tests.length} passed, ${(avgLatency / 1000).toFixed(2)}s avg`);
  }
  console.log('└' + '─'.repeat(50) + '\n');
}

// ============================================================================
// MAIN
// ============================================================================

runBenchmarks().catch(console.error);
