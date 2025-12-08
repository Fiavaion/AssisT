/**
 * Format benchmark results into a readable markdown file
 * Shows all input texts and model responses organized by complexity and model
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

// Build the markdown output
let md = `# AssisT AI Benchmark Results - Full Output\n\n`;
md += `**Generated**: ${results.metadata.timestamp}\n`;
md += `**Platform**: ${results.metadata.platform}\n`;
md += `**Total Tests**: ${results.tests.length}\n\n`;
md += `---\n\n`;

// Group by complexity first
const complexities = ['simple', 'moderate', 'complex'];
const complexityNames = {
  simple: 'Simple Text',
  moderate: 'Moderate Text',
  complex: 'Complex Text (NCAD Academic)'
};

// Input texts
md += `# Input Texts\n\n`;
for (const complexity of complexities) {
  const sample = results.tests.find(t => t.complexity === complexity);
  if (sample) {
    md += `## ${complexityNames[complexity]}\n\n`;
    md += `> ${sample.inputText}\n\n`;
    md += `**Character count**: ${sample.inputLength}\n\n`;
    md += `---\n\n`;
  }
}

// Group tests by feature, then complexity, then model
const features = [...new Set(results.tests.map(t => t.featureKey))];

for (const feature of features) {
  const featureTests = results.tests.filter(t => t.featureKey === feature);
  const featureName = featureTests[0]?.feature || feature;

  md += `# ${featureName}\n\n`;

  for (const complexity of complexities) {
    const complexityTests = featureTests.filter(t => t.complexity === complexity);
    if (complexityTests.length === 0) continue;

    md += `## ${complexityNames[complexity]}\n\n`;

    // Group by tier (cloud, 2gb, 4gb, 8gb)
    const tiers = ['cloud', '2gb', '4gb', '8gb'];

    for (const tier of tiers) {
      const tierTests = complexityTests.filter(t => t.tier === tier);
      if (tierTests.length === 0) continue;

      md += `### ${tier.toUpperCase()} Tier\n\n`;

      // Group by model
      const models = [...new Set(tierTests.map(t => t.model))];

      for (const model of models) {
        const modelTests = tierTests.filter(t => t.model === model);

        for (const test of modelTests) {
          const levelLabel = test.level ? ` (${test.level})` : '';
          md += `#### ${model}${levelLabel}\n\n`;
          md += `**Latency**: ${(test.latencyMs / 1000).toFixed(2)}s | `;
          md += `**Tokens**: ${test.tokens || 'N/A'} | `;
          md += `**Status**: ${test.success ? '✓ Success' : '✗ Failed'}\n\n`;

          if (test.success && test.output) {
            md += `**Response**:\n\n`;
            md += `\`\`\`\n${test.output.trim()}\n\`\`\`\n\n`;
          } else if (test.error) {
            md += `**Error**: ${test.error}\n\n`;
          }

          md += `---\n\n`;
        }
      }
    }
  }
}

// Summary statistics
md += `# Summary Statistics\n\n`;

// By tier
md += `## By Tier\n\n`;
md += `| Tier | Tests | Success Rate | Avg Latency | Avg Tokens |\n`;
md += `|------|-------|--------------|-------------|------------|\n`;

const tierStats = {};
for (const test of results.tests) {
  if (!tierStats[test.tier]) {
    tierStats[test.tier] = { total: 0, success: 0, latency: 0, tokens: 0 };
  }
  tierStats[test.tier].total++;
  if (test.success) {
    tierStats[test.tier].success++;
    tierStats[test.tier].latency += test.latencyMs;
    tierStats[test.tier].tokens += test.tokens || 0;
  }
}

for (const [tier, stats] of Object.entries(tierStats)) {
  const avgLatency = stats.success > 0 ? (stats.latency / stats.success / 1000).toFixed(2) : 'N/A';
  const avgTokens = stats.success > 0 ? Math.round(stats.tokens / stats.success) : 'N/A';
  const successRate = ((stats.success / stats.total) * 100).toFixed(0);
  md += `| ${tier.toUpperCase()} | ${stats.total} | ${successRate}% | ${avgLatency}s | ${avgTokens} |\n`;
}

md += `\n`;

// By model
md += `## By Model\n\n`;
md += `| Model | Tests | Success Rate | Avg Latency | Avg Tokens |\n`;
md += `|-------|-------|--------------|-------------|------------|\n`;

const modelStats = {};
for (const test of results.tests) {
  if (!modelStats[test.model]) {
    modelStats[test.model] = { total: 0, success: 0, latency: 0, tokens: 0 };
  }
  modelStats[test.model].total++;
  if (test.success) {
    modelStats[test.model].success++;
    modelStats[test.model].latency += test.latencyMs;
    modelStats[test.model].tokens += test.tokens || 0;
  }
}

for (const [model, stats] of Object.entries(modelStats)) {
  const avgLatency = stats.success > 0 ? (stats.latency / stats.success / 1000).toFixed(2) : 'N/A';
  const avgTokens = stats.success > 0 ? Math.round(stats.tokens / stats.success) : 'N/A';
  const successRate = ((stats.success / stats.total) * 100).toFixed(0);
  md += `| ${model} | ${stats.total} | ${successRate}% | ${avgLatency}s | ${avgTokens} |\n`;
}

// Write output
const outputPath = path.join(__dirname, 'benchmark-full-responses.md');
fs.writeFileSync(outputPath, md);
console.log(`\nOutput written to: ${outputPath}`);
console.log(`Total size: ${(md.length / 1024).toFixed(1)}KB`);
