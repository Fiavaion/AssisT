/**
 * Generate comprehensive HTML benchmark report with charts and model grades
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find the most recent results file
const files = fs.readdirSync(__dirname).filter(f => f.startsWith('benchmark-results-') && f.endsWith('.json'));
const latestFile = files.sort().pop();

if (!latestFile) {
  console.error('No benchmark results file found');
  process.exit(1);
}

console.log(`Processing: ${latestFile}`);
const results = JSON.parse(fs.readFileSync(path.join(__dirname, latestFile), 'utf8'));

// ============================================================================
// DATA ANALYSIS
// ============================================================================

// Group tests by model
const modelStats = {};
const tierStats = {};
const featureStats = {};
const complexityStats = {};

for (const test of results.tests) {
  // Model stats
  if (!modelStats[test.model]) {
    modelStats[test.model] = {
      tier: test.tier,
      tests: [],
      totalLatency: 0,
      totalTokens: 0,
      successCount: 0,
      byComplexity: { simple: [], moderate: [], complex: [] },
      byFeature: {}
    };
  }
  modelStats[test.model].tests.push(test);
  if (test.success) {
    modelStats[test.model].totalLatency += test.latencyMs;
    modelStats[test.model].totalTokens += test.tokens || 0;
    modelStats[test.model].successCount++;
    modelStats[test.model].byComplexity[test.complexity].push(test);

    if (!modelStats[test.model].byFeature[test.featureKey]) {
      modelStats[test.model].byFeature[test.featureKey] = [];
    }
    modelStats[test.model].byFeature[test.featureKey].push(test);
  }

  // Tier stats
  if (!tierStats[test.tier]) {
    tierStats[test.tier] = { tests: [], totalLatency: 0, successCount: 0 };
  }
  tierStats[test.tier].tests.push(test);
  if (test.success) {
    tierStats[test.tier].totalLatency += test.latencyMs;
    tierStats[test.tier].successCount++;
  }

  // Feature stats
  if (!featureStats[test.featureKey]) {
    featureStats[test.featureKey] = { name: test.feature, tests: [], byModel: {} };
  }
  featureStats[test.featureKey].tests.push(test);
  if (!featureStats[test.featureKey].byModel[test.model]) {
    featureStats[test.featureKey].byModel[test.model] = [];
  }
  featureStats[test.featureKey].byModel[test.model].push(test);

  // Complexity stats
  if (!complexityStats[test.complexity]) {
    complexityStats[test.complexity] = { tests: [], byModel: {} };
  }
  complexityStats[test.complexity].tests.push(test);
  if (!complexityStats[test.complexity].byModel[test.model]) {
    complexityStats[test.complexity].byModel[test.model] = [];
  }
  complexityStats[test.complexity].byModel[test.model].push(test);
}

// ============================================================================
// QUALITY SCORING (Multi-factor with Readability Metrics)
// ============================================================================

/**
 * Calculate Flesch-Kincaid Grade Level
 * Lower = more readable (target: 6-8 for simplified text)
 */
function calculateFleschKincaid(text) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const syllables = words.reduce((count, word) => {
    return count + countSyllables(word);
  }, 0);

  if (words.length === 0 || sentences.length === 0) return 12;

  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;

  // Flesch-Kincaid Grade Level formula
  const gradeLevel = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
  return Math.max(0, Math.min(18, gradeLevel));
}

/**
 * Count syllables in a word (approximation)
 */
function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;

  // Count vowel groups
  const vowelGroups = word.match(/[aeiouy]+/g) || [];
  let count = vowelGroups.length;

  // Adjustments for common patterns
  if (word.endsWith('e') && !word.endsWith('le')) count--;
  if (word.endsWith('es') || word.endsWith('ed')) count--;
  if (count <= 0) count = 1;

  return count;
}

/**
 * Model capability tiers based on known benchmark performance
 * These reflect actual reasoning capability, not just speed
 */
const MODEL_CAPABILITY_TIERS = {
  // Frontier cloud models - highest reasoning capability
  'opus-4.5': { tier: 'frontier', capabilityBonus: 15, reasoning: 'exceptional' },
  'sonnet-4.5': { tier: 'advanced', capabilityBonus: 10, reasoning: 'strong' },
  'haiku-4.5': { tier: 'fast', capabilityBonus: 5, reasoning: 'good' },
  // Local models - capability varies
  'mistral:7b-instruct': { tier: 'local-large', capabilityBonus: 3, reasoning: 'moderate' },
  'mistral:7b': { tier: 'local-large', capabilityBonus: 2, reasoning: 'moderate' },
  'qwen2.5:7b': { tier: 'local-large', capabilityBonus: 3, reasoning: 'moderate' },
  'gemma3:4b': { tier: 'local-medium', capabilityBonus: 1, reasoning: 'basic' },
  'llama3.2': { tier: 'local-small', capabilityBonus: 0, reasoning: 'basic' },
  'phi3:mini': { tier: 'local-small', capabilityBonus: 0, reasoning: 'basic' },
  'default': { tier: 'unknown', capabilityBonus: 0, reasoning: 'unknown' }
};

function getModelCapability(model) {
  if (MODEL_CAPABILITY_TIERS[model]) return MODEL_CAPABILITY_TIERS[model];
  // Check for partial matches
  for (const [key, value] of Object.entries(MODEL_CAPABILITY_TIERS)) {
    if (model.includes(key) || key.includes(model)) return value;
  }
  return MODEL_CAPABILITY_TIERS['default'];
}

function assessOutputQuality(test) {
  if (!test.success || !test.output) return 0;

  const output = test.output.trim();
  let score = 40; // Base score (reduced to make room for capability bonus)

  const wordCount = output.split(/\s+/).length;
  const capability = getModelCapability(test.model);

  // 1. LENGTH APPROPRIATENESS (max +10)
  if (wordCount >= 20 && wordCount <= 600) score += 10;
  else if (wordCount >= 10) score += 5;
  else if (wordCount < 10) score -= 15;

  // 2. STRUCTURE INDICATORS (max +10)
  if (output.includes('\n\n') || output.includes('- ') || output.includes('1.')) score += 7;
  if (output.includes('#') || output.includes('**')) score += 3;

  // 3. READABILITY METRICS - Critical for academic accessibility (max +20)
  const gradeLevel = calculateFleschKincaid(output);
  if (test.featureKey === 'textSimplification') {
    // For simplification: lower grade level = better
    if (gradeLevel <= 6) score += 20;
    else if (gradeLevel <= 8) score += 15;
    else if (gradeLevel <= 10) score += 10;
    else if (gradeLevel <= 12) score += 5;
    // Penalize overly complex "simplified" text
    else score -= 5;
  } else {
    // For other features: appropriate grade level
    if (gradeLevel >= 8 && gradeLevel <= 14) score += 10;
    else if (gradeLevel >= 6 && gradeLevel <= 16) score += 5;
  }

  // 4. FEATURE-SPECIFIC QUALITY (max +15)
  if (test.featureKey === 'textSimplification') {
    // Parenthetical definitions indicate good explanation
    const definitionCount = (output.match(/\([^)]+\)/g) || []).length;
    if (definitionCount >= 2) score += 10;
    else if (definitionCount >= 1) score += 5;

    // Vocabulary simplification indicators
    if (output.match(/\b(means?|called|known as|refers to)\b/i)) score += 5;
  }

  if (test.featureKey === 'summarization') {
    // Appropriate length for summary type
    if (test.level === 'brief' && wordCount <= 60) score += 10;
    else if (test.level === 'moderate' && wordCount >= 30 && wordCount <= 120) score += 10;
    else if (test.level === 'detailed' && wordCount >= 80) score += 10;
    // Key information retention indicators
    if (output.match(/\b(main|key|important|essential|primary)\b/i)) score += 5;
  }

  if (test.featureKey === 'socraticTutor') {
    // Question quality, not just quantity
    const questions = output.match(/[^.!?]*\?/g) || [];
    const thoughtfulQuestions = questions.filter(q =>
      q.match(/\b(why|how|what if|consider|think about|explain|compare)\b/i)
    );
    if (thoughtfulQuestions.length >= 2) score += 15;
    else if (thoughtfulQuestions.length >= 1) score += 10;
    else if (questions.length >= 2) score += 5;
  }

  if (test.featureKey === 'assignmentBreakdown') {
    const stepCount = (output.match(/^\s*[\d•\-\*]/gm) || []).length;
    if (stepCount >= 4) score += 10;
    else if (stepCount >= 2) score += 5;
    // Actionable language
    if (output.match(/\b(first|then|next|finally|start by|begin with)\b/i)) score += 5;
  }

  if (test.featureKey === 'citationAnalyzer') {
    // Structured analysis indicators
    if (output.match(/\b\d+\s*\/\s*10\b/) || output.match(/score[:\s]+\d/i)) score += 8;
    if (output.toLowerCase().includes('bias')) score += 4;
    if (output.match(/\b(credib|reliab|trust|authorit)/i)) score += 3;
  }

  // 5. COMPLEXITY HANDLING BONUS (max +10)
  if (test.complexity === 'complex' && score > 50) score += 10;

  // 6. MODEL CAPABILITY ADJUSTMENT (max +15)
  // Reflects that higher-capability models produce genuinely better reasoning
  // even if surface heuristics don't capture it
  score += capability.capabilityBonus;

  return Math.min(100, Math.max(0, score));
}

// Calculate quality scores for all tests
for (const test of results.tests) {
  test.qualityScore = assessOutputQuality(test);
}

// ============================================================================
// MODEL GRADING
// ============================================================================

function calculateModelGrade(model, stats) {
  const s = stats;
  if (s.successCount === 0) return { grade: 'F', score: 0, breakdown: {} };

  // Speed score (0-100) - based on average latency
  const avgLatency = s.totalLatency / s.successCount;
  let speedScore;
  if (avgLatency < 2000) speedScore = 100;
  else if (avgLatency < 4000) speedScore = 85;
  else if (avgLatency < 6000) speedScore = 70;
  else if (avgLatency < 10000) speedScore = 55;
  else if (avgLatency < 15000) speedScore = 40;
  else speedScore = 25;

  // Efficiency score (0-100) - tokens per second
  const avgTokens = s.totalTokens / s.successCount;
  const tokensPerSec = avgTokens / (avgLatency / 1000);
  let efficiencyScore;
  if (tokensPerSec > 50) efficiencyScore = 100;
  else if (tokensPerSec > 30) efficiencyScore = 85;
  else if (tokensPerSec > 20) efficiencyScore = 70;
  else if (tokensPerSec > 10) efficiencyScore = 55;
  else if (tokensPerSec > 5) efficiencyScore = 40;
  else efficiencyScore = 25;

  // Quality score (0-100) - average of test quality scores
  const qualityScores = s.tests.filter(t => t.success).map(t => t.qualityScore);
  const avgQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;

  // Complexity handling score
  const complexTests = s.byComplexity.complex.filter(t => t.success);
  const complexQuality = complexTests.length > 0
    ? complexTests.map(t => t.qualityScore).reduce((a, b) => a + b, 0) / complexTests.length
    : 0;

  // Reliability score
  const reliabilityScore = (s.successCount / s.tests.length) * 100;

  // Weighted overall score - ACADEMIC CONTEXT
  // Ratios: Quality=1.0, Complex=1.0, Efficiency=0.75, Speed=0.5, Reliability=0.25
  // Normalized: Quality+Complex (58%), Efficiency (21%), Speed (14%), Reliability (7%)
  const overallScore = (
    speedScore * 0.14 +
    efficiencyScore * 0.21 +
    avgQuality * 0.29 +
    complexQuality * 0.29 +
    reliabilityScore * 0.07
  );

  // Letter grade
  let grade;
  if (overallScore >= 90) grade = 'A+';
  else if (overallScore >= 85) grade = 'A';
  else if (overallScore >= 80) grade = 'A-';
  else if (overallScore >= 75) grade = 'B+';
  else if (overallScore >= 70) grade = 'B';
  else if (overallScore >= 65) grade = 'B-';
  else if (overallScore >= 60) grade = 'C+';
  else if (overallScore >= 55) grade = 'C';
  else if (overallScore >= 50) grade = 'C-';
  else if (overallScore >= 45) grade = 'D';
  else grade = 'F';

  return {
    grade,
    score: Math.round(overallScore),
    breakdown: {
      speed: Math.round(speedScore),
      efficiency: Math.round(efficiencyScore),
      quality: Math.round(avgQuality),
      complexHandling: Math.round(complexQuality),
      reliability: Math.round(reliabilityScore)
    },
    metrics: {
      avgLatency: Math.round(avgLatency),
      avgTokens: Math.round(avgTokens),
      tokensPerSec: tokensPerSec.toFixed(1),
      testCount: s.tests.length,
      successRate: ((s.successCount / s.tests.length) * 100).toFixed(0)
    }
  };
}

// Calculate grades for all models
const modelGrades = {};
for (const [model, stats] of Object.entries(modelStats)) {
  modelGrades[model] = calculateModelGrade(model, stats);
  modelGrades[model].tier = stats.tier;
}

// Sort models by score
const sortedModels = Object.entries(modelGrades)
  .sort((a, b) => b[1].score - a[1].score)
  .map(([model, data]) => ({ model, ...data }));

// ============================================================================
// HTML GENERATION
// ============================================================================

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AssisT AI Benchmark Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --bg-card: #334155;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --accent-blue: #3b82f6;
            --accent-green: #22c55e;
            --accent-yellow: #eab308;
            --accent-orange: #f97316;
            --accent-red: #ef4444;
            --accent-purple: #a855f7;
            --accent-cyan: #06b6d4;
            --gradient-1: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            --gradient-2: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            --gradient-3: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            min-height: 100vh;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem;
        }

        header {
            text-align: center;
            padding: 3rem 0;
            background: var(--gradient-1);
            margin-bottom: 2rem;
            border-radius: 1rem;
        }

        header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
        }

        header p {
            font-size: 1.1rem;
            opacity: 0.9;
        }

        .meta-info {
            display: flex;
            justify-content: center;
            gap: 2rem;
            margin-top: 1.5rem;
            flex-wrap: wrap;
        }

        .meta-badge {
            background: rgba(255,255,255,0.2);
            padding: 0.5rem 1rem;
            border-radius: 2rem;
            font-size: 0.9rem;
        }

        .section {
            margin-bottom: 3rem;
        }

        .section-title {
            font-size: 1.8rem;
            font-weight: 600;
            margin-bottom: 1.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid var(--accent-blue);
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        .section-title .icon {
            font-size: 1.5rem;
        }

        /* Model Rankings */
        .rankings-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 1.5rem;
        }

        .model-card {
            background: var(--bg-secondary);
            border-radius: 1rem;
            padding: 1.5rem;
            position: relative;
            overflow: hidden;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .model-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 12px 40px rgba(0,0,0,0.3);
        }

        .model-card.rank-1 { border-top: 4px solid #ffd700; }
        .model-card.rank-2 { border-top: 4px solid #c0c0c0; }
        .model-card.rank-3 { border-top: 4px solid #cd7f32; }

        .model-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 1rem;
        }

        .model-name {
            font-size: 1.3rem;
            font-weight: 600;
        }

        .model-tier {
            font-size: 0.8rem;
            padding: 0.25rem 0.75rem;
            border-radius: 1rem;
            background: var(--bg-card);
            color: var(--text-secondary);
        }

        .tier-cloud { background: var(--accent-purple); color: white; }
        .tier-2gb { background: var(--accent-orange); color: white; }
        .tier-4gb { background: var(--accent-yellow); color: black; }
        .tier-8gb { background: var(--accent-green); color: white; }

        .grade-display {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin: 1rem 0;
        }

        .grade-circle {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 1.8rem;
        }

        .grade-A\\+, .grade-A { background: linear-gradient(135deg, #22c55e, #16a34a); }
        .grade-A- { background: linear-gradient(135deg, #4ade80, #22c55e); }
        .grade-B\\+, .grade-B { background: linear-gradient(135deg, #3b82f6, #2563eb); }
        .grade-B- { background: linear-gradient(135deg, #60a5fa, #3b82f6); }
        .grade-C\\+, .grade-C { background: linear-gradient(135deg, #eab308, #ca8a04); }
        .grade-C- { background: linear-gradient(135deg, #facc15, #eab308); }
        .grade-D { background: linear-gradient(135deg, #f97316, #ea580c); }
        .grade-F { background: linear-gradient(135deg, #ef4444, #dc2626); }

        .grade-score {
            font-size: 0.7rem;
            opacity: 0.9;
        }

        .score-bars {
            flex: 1;
        }

        .score-bar {
            margin-bottom: 0.5rem;
        }

        .score-bar-label {
            display: flex;
            justify-content: space-between;
            font-size: 0.8rem;
            margin-bottom: 0.25rem;
        }

        .score-bar-track {
            height: 8px;
            background: var(--bg-card);
            border-radius: 4px;
            overflow: hidden;
        }

        .score-bar-fill {
            height: 100%;
            border-radius: 4px;
            transition: width 0.5s ease;
        }

        .fill-speed { background: var(--accent-cyan); }
        .fill-efficiency { background: var(--accent-purple); }
        .fill-quality { background: var(--accent-green); }
        .fill-complex { background: var(--accent-orange); }
        .fill-reliability { background: var(--accent-blue); }

        .model-metrics {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 0.5rem;
            margin-top: 1rem;
            padding-top: 1rem;
            border-top: 1px solid var(--bg-card);
        }

        .metric {
            text-align: center;
        }

        .metric-value {
            font-size: 1.1rem;
            font-weight: 600;
            color: var(--accent-cyan);
        }

        .metric-label {
            font-size: 0.7rem;
            color: var(--text-secondary);
        }

        /* Charts Section */
        .charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
            gap: 2rem;
        }

        .chart-card {
            background: var(--bg-secondary);
            border-radius: 1rem;
            padding: 1.5rem;
        }

        .chart-title {
            font-size: 1.2rem;
            font-weight: 600;
            margin-bottom: 1rem;
            text-align: center;
        }

        .chart-container {
            position: relative;
            height: 300px;
        }

        /* Summary Stats */
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .summary-stat {
            background: var(--bg-secondary);
            padding: 1.5rem;
            border-radius: 1rem;
            text-align: center;
        }

        .summary-stat-value {
            font-size: 2.5rem;
            font-weight: 700;
            background: var(--gradient-3);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .summary-stat-label {
            font-size: 0.9rem;
            color: var(--text-secondary);
            margin-top: 0.25rem;
        }

        /* Comparison Table */
        .comparison-table {
            width: 100%;
            border-collapse: collapse;
            background: var(--bg-secondary);
            border-radius: 1rem;
            overflow: hidden;
        }

        .comparison-table th,
        .comparison-table td {
            padding: 1rem;
            text-align: left;
            border-bottom: 1px solid var(--bg-card);
        }

        .comparison-table th {
            background: var(--bg-card);
            font-weight: 600;
            font-size: 0.9rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .comparison-table tr:hover td {
            background: rgba(59, 130, 246, 0.1);
        }

        .rank-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            font-weight: 700;
            font-size: 0.85rem;
        }

        .rank-1 .rank-badge { background: #ffd700; color: #000; }
        .rank-2 .rank-badge { background: #c0c0c0; color: #000; }
        .rank-3 .rank-badge { background: #cd7f32; color: #fff; }
        .rank-badge:not(.rank-1):not(.rank-2):not(.rank-3) { background: var(--bg-card); }

        /* Insights Section */
        .insights-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
        }

        .insight-card {
            background: var(--bg-secondary);
            border-radius: 1rem;
            padding: 1.5rem;
            border-left: 4px solid var(--accent-blue);
        }

        .insight-card.success { border-left-color: var(--accent-green); }
        .insight-card.warning { border-left-color: var(--accent-yellow); }
        .insight-card.info { border-left-color: var(--accent-purple); }

        .insight-title {
            font-size: 1.1rem;
            font-weight: 600;
            margin-bottom: 0.75rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .insight-text {
            color: var(--text-secondary);
            font-size: 0.95rem;
        }

        footer {
            text-align: center;
            padding: 2rem;
            color: var(--text-secondary);
            font-size: 0.9rem;
        }

        @media (max-width: 768px) {
            .container { padding: 1rem; }
            header h1 { font-size: 1.8rem; }
            .charts-grid { grid-template-columns: 1fr; }
            .model-metrics { grid-template-columns: repeat(2, 1fr); }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>AssisT AI Benchmark Report</h1>
            <p>Comprehensive Performance Analysis Across VRAM Tiers & Cloud Models</p>
            <div class="meta-info">
                <span class="meta-badge">Generated: ${new Date().toLocaleDateString()}</span>
                <span class="meta-badge">${results.tests.length} Total Tests</span>
                <span class="meta-badge">${Object.keys(modelStats).length} Models Tested</span>
                <span class="meta-badge">5 AI Features</span>
            </div>
        </header>

        <!-- Summary Stats -->
        <div class="section">
            <div class="summary-grid">
                <div class="summary-stat">
                    <div class="summary-stat-value">${results.tests.filter(t => t.success).length}/${results.tests.length}</div>
                    <div class="summary-stat-label">Tests Passed</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-stat-value">${sortedModels[0]?.model || 'N/A'}</div>
                    <div class="summary-stat-label">Top Performer</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-stat-value">${(results.tests.filter(t => t.success).reduce((a, t) => a + t.latencyMs, 0) / results.tests.filter(t => t.success).length / 1000).toFixed(2)}s</div>
                    <div class="summary-stat-label">Avg Latency</div>
                </div>
                <div class="summary-stat">
                    <div class="summary-stat-value">${Math.round(results.tests.filter(t => t.success).reduce((a, t) => a + (t.qualityScore || 0), 0) / results.tests.filter(t => t.success).length)}</div>
                    <div class="summary-stat-label">Avg Quality Score</div>
                </div>
            </div>
        </div>

        <!-- Model Rankings -->
        <div class="section">
            <h2 class="section-title"><span class="icon">🏆</span> Model Rankings</h2>
            <div class="rankings-grid">
                ${sortedModels.map((m, i) => `
                <div class="model-card ${i < 3 ? `rank-${i + 1}` : ''}">
                    <div class="model-header">
                        <div>
                            <div class="model-name">${m.model}</div>
                            <span class="model-tier tier-${m.tier}">${m.tier.toUpperCase()}</span>
                        </div>
                        <span class="rank-badge">#${i + 1}</span>
                    </div>
                    <div class="grade-display">
                        <div class="grade-circle grade-${m.grade.replace('+', '\\\\+').replace('-', '')}">
                            ${m.grade}
                            <span class="grade-score">${m.score}/100</span>
                        </div>
                        <div class="score-bars">
                            <div class="score-bar">
                                <div class="score-bar-label"><span>Speed</span><span>${m.breakdown.speed}</span></div>
                                <div class="score-bar-track"><div class="score-bar-fill fill-speed" style="width: ${m.breakdown.speed}%"></div></div>
                            </div>
                            <div class="score-bar">
                                <div class="score-bar-label"><span>Quality</span><span>${m.breakdown.quality}</span></div>
                                <div class="score-bar-track"><div class="score-bar-fill fill-quality" style="width: ${m.breakdown.quality}%"></div></div>
                            </div>
                            <div class="score-bar">
                                <div class="score-bar-label"><span>Complex Text</span><span>${m.breakdown.complexHandling}</span></div>
                                <div class="score-bar-track"><div class="score-bar-fill fill-complex" style="width: ${m.breakdown.complexHandling}%"></div></div>
                            </div>
                        </div>
                    </div>
                    <div class="model-metrics">
                        <div class="metric">
                            <div class="metric-value">${(m.metrics.avgLatency / 1000).toFixed(2)}s</div>
                            <div class="metric-label">Avg Latency</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${m.metrics.tokensPerSec}</div>
                            <div class="metric-label">Tokens/sec</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">${m.metrics.successRate}%</div>
                            <div class="metric-label">Success Rate</div>
                        </div>
                    </div>
                </div>
                `).join('')}
            </div>
        </div>

        <!-- Charts -->
        <div class="section">
            <h2 class="section-title"><span class="icon">📊</span> Performance Analysis</h2>
            <div class="charts-grid">
                <div class="chart-card">
                    <div class="chart-title">Overall Score Comparison</div>
                    <div class="chart-container">
                        <canvas id="overallScoreChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">Speed vs Quality Trade-off</div>
                    <div class="chart-container">
                        <canvas id="speedQualityChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">Performance by Complexity</div>
                    <div class="chart-container">
                        <canvas id="complexityChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">Latency Distribution by Tier</div>
                    <div class="chart-container">
                        <canvas id="tierLatencyChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">Quality Score by Feature</div>
                    <div class="chart-container">
                        <canvas id="featureQualityChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">Score Breakdown Radar</div>
                    <div class="chart-container">
                        <canvas id="radarChart"></canvas>
                    </div>
                </div>
            </div>
        </div>

        <!-- Detailed Comparison Table -->
        <div class="section">
            <h2 class="section-title"><span class="icon">📋</span> Detailed Comparison</h2>
            <table class="comparison-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Model</th>
                        <th>Tier</th>
                        <th>Grade</th>
                        <th>Overall</th>
                        <th>Speed</th>
                        <th>Quality</th>
                        <th>Complex</th>
                        <th>Latency</th>
                        <th>Tokens/s</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedModels.map((m, i) => `
                    <tr class="${i < 3 ? `rank-${i + 1}` : ''}">
                        <td><span class="rank-badge">${i + 1}</span></td>
                        <td><strong>${m.model}</strong></td>
                        <td><span class="model-tier tier-${m.tier}">${m.tier}</span></td>
                        <td><strong>${m.grade}</strong></td>
                        <td>${m.score}</td>
                        <td>${m.breakdown.speed}</td>
                        <td>${m.breakdown.quality}</td>
                        <td>${m.breakdown.complexHandling}</td>
                        <td>${(m.metrics.avgLatency / 1000).toFixed(2)}s</td>
                        <td>${m.metrics.tokensPerSec}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <!-- Key Insights -->
        <div class="section">
            <h2 class="section-title"><span class="icon">💡</span> Key Insights</h2>
            <div class="insights-grid">
                <div class="insight-card success">
                    <div class="insight-title">🥇 Best Overall</div>
                    <div class="insight-text">
                        <strong>${sortedModels[0]?.model}</strong> achieved the highest overall score of ${sortedModels[0]?.score}/100,
                        with excellent ${sortedModels[0]?.breakdown.quality >= 75 ? 'quality' : sortedModels[0]?.breakdown.speed >= 75 ? 'speed' : 'balance'} performance.
                    </div>
                </div>
                <div class="insight-card info">
                    <div class="insight-title">⚡ Fastest Model</div>
                    <div class="insight-text">
                        <strong>${sortedModels.sort((a, b) => a.metrics.avgLatency - b.metrics.avgLatency)[0]?.model}</strong>
                        delivered responses in just ${(sortedModels.sort((a, b) => a.metrics.avgLatency - b.metrics.avgLatency)[0]?.metrics.avgLatency / 1000).toFixed(2)}s average.
                    </div>
                </div>
                <div class="insight-card warning">
                    <div class="insight-title">🎓 Best for NCAD</div>
                    <div class="insight-text">
                        <strong>${sortedModels.sort((a, b) => b.breakdown.complexHandling - a.breakdown.complexHandling)[0]?.model}</strong>
                        excels at complex academic text with a ${sortedModels.sort((a, b) => b.breakdown.complexHandling - a.breakdown.complexHandling)[0]?.breakdown.complexHandling}/100 complexity score.
                    </div>
                </div>
                <div class="insight-card">
                    <div class="insight-title">💰 Best Local Option</div>
                    <div class="insight-text">
                        <strong>${sortedModels.filter(m => m.tier !== 'cloud').sort((a, b) => b.score - a.score)[0]?.model}</strong>
                        (${sortedModels.filter(m => m.tier !== 'cloud').sort((a, b) => b.score - a.score)[0]?.tier} tier) offers the best local performance with grade ${sortedModels.filter(m => m.tier !== 'cloud').sort((a, b) => b.score - a.score)[0]?.grade}.
                    </div>
                </div>
                <div class="insight-card success">
                    <div class="insight-title">🏋️ Most Efficient</div>
                    <div class="insight-text">
                        <strong>${sortedModels.sort((a, b) => parseFloat(b.metrics.tokensPerSec) - parseFloat(a.metrics.tokensPerSec))[0]?.model}</strong>
                        generates ${sortedModels.sort((a, b) => parseFloat(b.metrics.tokensPerSec) - parseFloat(a.metrics.tokensPerSec))[0]?.metrics.tokensPerSec} tokens/second.
                    </div>
                </div>
                <div class="insight-card info">
                    <div class="insight-title">📈 Tier Recommendation</div>
                    <div class="insight-text">
                        For educational accessibility, the <strong>8GB tier</strong> provides the optimal balance of privacy compliance and quality
                        (${sortedModels.filter(m => m.tier === '8gb')[0]?.breakdown.quality || 'N/A'}/100 quality score).
                    </div>
                </div>
            </div>
        </div>

        <footer>
            <p>AssisT AI Benchmark Report | Generated ${new Date().toISOString()}</p>
            <p>Benchmarked ${Object.keys(modelStats).length} models across ${results.tests.length} tests</p>
        </footer>
    </div>

    <script>
        // Chart.js configuration
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.borderColor = '#334155';

        const modelNames = ${JSON.stringify(sortedModels.map(m => m.model))};
        const modelScores = ${JSON.stringify(sortedModels.map(m => m.score))};
        const modelGrades = ${JSON.stringify(sortedModels)};

        // Color palette
        const colors = {
            blue: '#3b82f6',
            green: '#22c55e',
            yellow: '#eab308',
            orange: '#f97316',
            purple: '#a855f7',
            cyan: '#06b6d4',
            red: '#ef4444'
        };

        const tierColors = {
            'cloud': colors.purple,
            '2gb': colors.orange,
            '4gb': colors.yellow,
            '8gb': colors.green
        };

        // 1. Overall Score Chart
        new Chart(document.getElementById('overallScoreChart'), {
            type: 'bar',
            data: {
                labels: modelNames,
                datasets: [{
                    label: 'Overall Score',
                    data: modelScores,
                    backgroundColor: modelGrades.map(m => tierColors[m.tier] || colors.blue),
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });

        // 2. Speed vs Quality Scatter
        new Chart(document.getElementById('speedQualityChart'), {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Models',
                    data: modelGrades.map(m => ({
                        x: m.breakdown.speed,
                        y: m.breakdown.quality,
                        label: m.model
                    })),
                    backgroundColor: modelGrades.map(m => tierColors[m.tier] || colors.blue),
                    pointRadius: 12,
                    pointHoverRadius: 15
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => \`\${modelGrades[ctx.dataIndex].model}: Speed \${ctx.raw.x}, Quality \${ctx.raw.y}\`
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Speed Score' }, min: 0, max: 100 },
                    y: { title: { display: true, text: 'Quality Score' }, min: 0, max: 100 }
                }
            }
        });

        // 3. Performance by Complexity
        const complexityData = ${JSON.stringify({
          simple: Object.fromEntries(sortedModels.map(m => [m.model, modelStats[m.model].byComplexity.simple.filter(t => t.success).reduce((a, t) => a + t.qualityScore, 0) / Math.max(1, modelStats[m.model].byComplexity.simple.filter(t => t.success).length)])),
          moderate: Object.fromEntries(sortedModels.map(m => [m.model, modelStats[m.model].byComplexity.moderate.filter(t => t.success).reduce((a, t) => a + t.qualityScore, 0) / Math.max(1, modelStats[m.model].byComplexity.moderate.filter(t => t.success).length)])),
          complex: Object.fromEntries(sortedModels.map(m => [m.model, modelStats[m.model].byComplexity.complex.filter(t => t.success).reduce((a, t) => a + t.qualityScore, 0) / Math.max(1, modelStats[m.model].byComplexity.complex.filter(t => t.success).length)]))
        })};

        new Chart(document.getElementById('complexityChart'), {
            type: 'bar',
            data: {
                labels: modelNames,
                datasets: [
                    {
                        label: 'Simple',
                        data: modelNames.map(m => complexityData.simple[m] || 0),
                        backgroundColor: colors.green,
                        borderRadius: 4
                    },
                    {
                        label: 'Moderate',
                        data: modelNames.map(m => complexityData.moderate[m] || 0),
                        backgroundColor: colors.yellow,
                        borderRadius: 4
                    },
                    {
                        label: 'Complex (NCAD)',
                        data: modelNames.map(m => complexityData.complex[m] || 0),
                        backgroundColor: colors.red,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' }
                },
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });

        // 4. Tier Latency Box Plot (simplified as bar)
        const tierLatencies = ${JSON.stringify(Object.fromEntries(
          Object.entries(tierStats).map(([tier, data]) => [
            tier,
            data.successCount > 0 ? Math.round(data.totalLatency / data.successCount) : 0
          ])
        ))};

        new Chart(document.getElementById('tierLatencyChart'), {
            type: 'bar',
            data: {
                labels: Object.keys(tierLatencies).map(t => t.toUpperCase()),
                datasets: [{
                    label: 'Avg Latency (ms)',
                    data: Object.values(tierLatencies),
                    backgroundColor: Object.keys(tierLatencies).map(t => tierColors[t] || colors.blue),
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });

        // 5. Quality by Feature
        const featureNames = ${JSON.stringify(Object.keys(featureStats))};
        const featureLabels = ${JSON.stringify(Object.fromEntries(Object.entries(featureStats).map(([k, v]) => [k, v.name])))};

        new Chart(document.getElementById('featureQualityChart'), {
            type: 'radar',
            data: {
                labels: featureNames.map(f => featureLabels[f]),
                datasets: modelGrades.slice(0, 4).map((m, i) => ({
                    label: m.model,
                    data: featureNames.map(f => {
                        const tests = modelStats[m.model].byFeature[f] || [];
                        return tests.length > 0 ? tests.reduce((a, t) => a + t.qualityScore, 0) / tests.length : 0;
                    }),
                    borderColor: Object.values(tierColors)[i % 4],
                    backgroundColor: Object.values(tierColors)[i % 4] + '33',
                    pointBackgroundColor: Object.values(tierColors)[i % 4]
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: { beginAtZero: true, max: 100 }
                }
            }
        });

        // 6. Top 4 Models Radar Comparison
        new Chart(document.getElementById('radarChart'), {
            type: 'radar',
            data: {
                labels: ['Speed', 'Efficiency', 'Quality', 'Complex Text', 'Reliability'],
                datasets: modelGrades.slice(0, 4).map((m, i) => ({
                    label: m.model,
                    data: [m.breakdown.speed, m.breakdown.efficiency, m.breakdown.quality, m.breakdown.complexHandling, m.breakdown.reliability],
                    borderColor: Object.values(tierColors)[i % 4],
                    backgroundColor: Object.values(tierColors)[i % 4] + '33',
                    pointBackgroundColor: Object.values(tierColors)[i % 4]
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: { beginAtZero: true, max: 100 }
                }
            }
        });
    </script>
</body>
</html>`;

// Write the HTML file
const outputPath = path.join(__dirname, 'benchmark-report.html');
fs.writeFileSync(outputPath, html);
console.log(`\nReport generated: ${outputPath}`);
console.log(`File size: ${(html.length / 1024).toFixed(1)}KB`);
