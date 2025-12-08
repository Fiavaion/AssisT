/**
 * Generate comprehensive HTML report for Academic Quality Benchmark
 * Shows Opus-evaluated quality scores with detailed breakdowns
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find the most recent academic benchmark results
const files = fs.readdirSync(__dirname).filter(f => f.startsWith('academic-benchmark-') && f.endsWith('.json'));
const latestFile = files.sort().pop();

if (!latestFile) {
  console.error('No academic benchmark results found. Run run-academic-benchmark.js first.');
  process.exit(1);
}

console.log(`Processing: ${latestFile}`);
const results = JSON.parse(fs.readFileSync(path.join(__dirname, latestFile), 'utf8'));

// ============================================================================
// DATA PROCESSING
// ============================================================================

// Sort models by average score
const rankedModels = Object.entries(results.modelSummaries)
  .sort((a, b) => b[1].averageScore - a[1].averageScore)
  .map(([model, data], index) => ({
    rank: index + 1,
    model,
    ...data
  }));

// Get tier for each model
function getModelTier(model) {
  const test = results.tests.find(t => t.model === model);
  return test?.tier || 'unknown';
}

// Calculate feature averages per model
const featureScores = {};
for (const test of results.tests.filter(t => t.success && t.weightedScore)) {
  if (!featureScores[test.feature]) {
    featureScores[test.feature] = {};
  }
  if (!featureScores[test.feature][test.model]) {
    featureScores[test.feature][test.model] = [];
  }
  featureScores[test.feature][test.model].push(test.weightedScore);
}

// Average feature scores
const featureAverages = {};
for (const [feature, models] of Object.entries(featureScores)) {
  featureAverages[feature] = {};
  for (const [model, scores] of Object.entries(models)) {
    featureAverages[feature][model] = scores.reduce((a, b) => a + b, 0) / scores.length;
  }
}

// Grade calculation
function getGrade(score) {
  if (score >= 9.0) return { grade: 'A+', color: '#22c55e' };
  if (score >= 8.5) return { grade: 'A', color: '#22c55e' };
  if (score >= 8.0) return { grade: 'A-', color: '#4ade80' };
  if (score >= 7.5) return { grade: 'B+', color: '#3b82f6' };
  if (score >= 7.0) return { grade: 'B', color: '#3b82f6' };
  if (score >= 6.5) return { grade: 'B-', color: '#60a5fa' };
  if (score >= 6.0) return { grade: 'C+', color: '#eab308' };
  if (score >= 5.5) return { grade: 'C', color: '#eab308' };
  if (score >= 5.0) return { grade: 'C-', color: '#facc15' };
  if (score >= 4.0) return { grade: 'D', color: '#f97316' };
  return { grade: 'F', color: '#ef4444' };
}

// Tier colors
const tierColors = {
  'cloud': '#a855f7',
  '2gb': '#f97316',
  '4gb': '#eab308',
  '8gb': '#22c55e'
};

// ============================================================================
// HTML GENERATION
// ============================================================================

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AssisT Academic Quality Benchmark Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg-primary: #0f172a;
            --bg-secondary: #1e293b;
            --bg-card: #334155;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --accent-green: #22c55e;
            --accent-blue: #3b82f6;
            --accent-purple: #a855f7;
            --accent-yellow: #eab308;
            --accent-orange: #f97316;
            --accent-red: #ef4444;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem;
        }

        header {
            text-align: center;
            padding: 3rem 2rem;
            background: linear-gradient(135deg, #059669 0%, #0d9488 50%, #0891b2 100%);
            margin-bottom: 2rem;
            border-radius: 1rem;
        }

        header h1 {
            font-size: 2.5rem;
            margin-bottom: 0.5rem;
        }

        header .subtitle {
            font-size: 1.2rem;
            opacity: 0.9;
            margin-bottom: 1rem;
        }

        .badge-row {
            display: flex;
            justify-content: center;
            gap: 1rem;
            flex-wrap: wrap;
        }

        .badge {
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
            margin-bottom: 1.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid var(--accent-green);
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }

        /* Methodology Section */
        .methodology-card {
            background: var(--bg-secondary);
            border-radius: 1rem;
            padding: 2rem;
            margin-bottom: 2rem;
        }

        .methodology-card h3 {
            color: var(--accent-green);
            margin-bottom: 1rem;
        }

        .criteria-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-top: 1rem;
        }

        .criterion {
            background: var(--bg-card);
            padding: 1rem;
            border-radius: 0.5rem;
            text-align: center;
        }

        .criterion-name {
            font-weight: 600;
            color: var(--accent-green);
        }

        .criterion-weight {
            font-size: 1.5rem;
            font-weight: 700;
        }

        /* Rankings */
        .rankings-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 1.5rem;
        }

        .model-card {
            background: var(--bg-secondary);
            border-radius: 1rem;
            padding: 1.5rem;
            position: relative;
            transition: transform 0.2s;
        }

        .model-card:hover {
            transform: translateY(-4px);
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
            font-size: 0.75rem;
            padding: 0.25rem 0.75rem;
            border-radius: 1rem;
            color: white;
            font-weight: 600;
        }

        .rank-badge {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            background: var(--bg-card);
        }

        .rank-1 .rank-badge { background: #ffd700; color: #000; }
        .rank-2 .rank-badge { background: #c0c0c0; color: #000; }
        .rank-3 .rank-badge { background: #cd7f32; color: #fff; }

        .score-display {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin: 1rem 0;
        }

        .grade-circle {
            width: 70px;
            height: 70px;
            border-radius: 50%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 1.5rem;
        }

        .grade-score {
            font-size: 0.7rem;
            opacity: 0.9;
        }

        .score-bars {
            flex: 1;
        }

        .score-bar {
            margin-bottom: 0.4rem;
        }

        .score-bar-label {
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
            margin-bottom: 0.15rem;
        }

        .score-bar-track {
            height: 6px;
            background: var(--bg-card);
            border-radius: 3px;
            overflow: hidden;
        }

        .score-bar-fill {
            height: 100%;
            border-radius: 3px;
            transition: width 0.5s ease;
        }

        .ncad-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            font-size: 0.9rem;
            margin-top: 0.5rem;
        }

        .ncad-recommended {
            background: rgba(34, 197, 94, 0.2);
            color: var(--accent-green);
        }

        .ncad-caution {
            background: rgba(234, 179, 8, 0.2);
            color: var(--accent-yellow);
        }

        .ncad-not-recommended {
            background: rgba(239, 68, 68, 0.2);
            color: var(--accent-red);
        }

        /* Charts */
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
            height: 350px;
        }

        /* Detailed Table */
        .detail-table {
            width: 100%;
            border-collapse: collapse;
            background: var(--bg-secondary);
            border-radius: 1rem;
            overflow: hidden;
        }

        .detail-table th,
        .detail-table td {
            padding: 1rem;
            text-align: left;
            border-bottom: 1px solid var(--bg-card);
        }

        .detail-table th {
            background: var(--bg-card);
            font-weight: 600;
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .detail-table tr:hover td {
            background: rgba(59, 130, 246, 0.1);
        }

        /* Sample Outputs */
        .sample-output {
            background: var(--bg-secondary);
            border-radius: 1rem;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
        }

        .sample-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid var(--bg-card);
        }

        .sample-model {
            font-weight: 600;
            font-size: 1.1rem;
        }

        .sample-score {
            font-size: 1.5rem;
            font-weight: 700;
        }

        .sample-content {
            background: var(--bg-card);
            padding: 1rem;
            border-radius: 0.5rem;
            font-family: monospace;
            font-size: 0.9rem;
            white-space: pre-wrap;
            max-height: 200px;
            overflow-y: auto;
        }

        .evaluation-breakdown {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 0.5rem;
            margin-top: 1rem;
        }

        .eval-item {
            text-align: center;
            padding: 0.5rem;
            background: var(--bg-primary);
            border-radius: 0.5rem;
        }

        .eval-item-label {
            font-size: 0.7rem;
            color: var(--text-secondary);
        }

        .eval-item-score {
            font-size: 1.2rem;
            font-weight: 600;
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
            .rankings-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🎓 Academic Quality Benchmark</h1>
            <p class="subtitle">AI-Evaluated Educational Content Quality for NCAD Students</p>
            <div class="badge-row">
                <span class="badge">📊 Judge: ${results.metadata.judgeModel}</span>
                <span class="badge">🧪 ${results.tests.length} Tests</span>
                <span class="badge">🤖 ${rankedModels.length} Models</span>
                <span class="badge">📅 ${new Date(results.metadata.timestamp).toLocaleDateString()}</span>
            </div>
        </header>

        <!-- Methodology -->
        <div class="section">
            <h2 class="section-title">📋 Evaluation Methodology</h2>
            <div class="methodology-card">
                <h3>How This Benchmark Works</h3>
                <p>Each model's output is evaluated by ${results.metadata.judgeModel} against strict academic quality criteria. The judge assesses whether content is appropriate for students with learning difficulties (NCAD - Neurodivergent/Cognitive/Academic Difficulties).</p>

                <h3 style="margin-top: 1.5rem;">Evaluation Criteria</h3>
                <div class="criteria-grid">
                    <div class="criterion">
                        <div class="criterion-name">Accuracy</div>
                        <div class="criterion-weight">25%</div>
                        <div>No factual errors</div>
                    </div>
                    <div class="criterion">
                        <div class="criterion-name">Completeness</div>
                        <div class="criterion-weight">25%</div>
                        <div>All key facts preserved</div>
                    </div>
                    <div class="criterion">
                        <div class="criterion-name">Clarity</div>
                        <div class="criterion-weight">20%</div>
                        <div>Understandable for target audience</div>
                    </div>
                    <div class="criterion">
                        <div class="criterion-name">Accessibility</div>
                        <div class="criterion-weight">15%</div>
                        <div>Appropriate vocabulary/structure</div>
                    </div>
                    <div class="criterion">
                        <div class="criterion-name">Structure</div>
                        <div class="criterion-weight">15%</div>
                        <div>Logical organization</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Rankings -->
        <div class="section">
            <h2 class="section-title">🏆 Model Rankings</h2>
            <div class="rankings-grid">
                ${rankedModels.map((m, i) => {
                  const tier = getModelTier(m.model);
                  const gradeInfo = getGrade(m.averageScore);
                  const ncadRate = m.ncadRecommendedRate || 0;
                  let ncadClass, ncadText;
                  if (ncadRate >= 80) { ncadClass = 'ncad-recommended'; ncadText = '✓ Recommended for NCAD'; }
                  else if (ncadRate >= 50) { ncadClass = 'ncad-caution'; ncadText = '⚠ Use with caution'; }
                  else { ncadClass = 'ncad-not-recommended'; ncadText = '✗ Not recommended'; }

                  return `
                <div class="model-card ${i < 3 ? `rank-${i + 1}` : ''}">
                    <div class="model-header">
                        <div>
                            <div class="model-name">${m.model}</div>
                            <span class="model-tier" style="background: ${tierColors[tier] || '#666'}">${tier.toUpperCase()}</span>
                        </div>
                        <span class="rank-badge">#${m.rank}</span>
                    </div>

                    <div class="score-display">
                        <div class="grade-circle" style="background: ${gradeInfo.color}">
                            ${gradeInfo.grade}
                            <span class="grade-score">${m.averageScore.toFixed(1)}/10</span>
                        </div>
                        <div class="score-bars">
                            <div class="score-bar">
                                <div class="score-bar-label"><span>Accuracy</span><span>${m.scores.accuracy.toFixed(1)}</span></div>
                                <div class="score-bar-track"><div class="score-bar-fill" style="width: ${m.scores.accuracy * 10}%; background: #22c55e"></div></div>
                            </div>
                            <div class="score-bar">
                                <div class="score-bar-label"><span>Completeness</span><span>${m.scores.completeness.toFixed(1)}</span></div>
                                <div class="score-bar-track"><div class="score-bar-fill" style="width: ${m.scores.completeness * 10}%; background: #3b82f6"></div></div>
                            </div>
                            <div class="score-bar">
                                <div class="score-bar-label"><span>Clarity</span><span>${m.scores.clarity.toFixed(1)}</span></div>
                                <div class="score-bar-track"><div class="score-bar-fill" style="width: ${m.scores.clarity * 10}%; background: #a855f7"></div></div>
                            </div>
                            <div class="score-bar">
                                <div class="score-bar-label"><span>Accessibility</span><span>${m.scores.accessibility.toFixed(1)}</span></div>
                                <div class="score-bar-track"><div class="score-bar-fill" style="width: ${m.scores.accessibility * 10}%; background: #f97316"></div></div>
                            </div>
                            <div class="score-bar">
                                <div class="score-bar-label"><span>Structure</span><span>${m.scores.structure.toFixed(1)}</span></div>
                                <div class="score-bar-track"><div class="score-bar-fill" style="width: ${m.scores.structure * 10}%; background: #06b6d4"></div></div>
                            </div>
                        </div>
                    </div>

                    <div class="ncad-badge ${ncadClass}">
                        ${ncadText} (${ncadRate.toFixed(0)}%)
                    </div>
                </div>
                  `;
                }).join('')}
            </div>
        </div>

        <!-- Charts -->
        <div class="section">
            <h2 class="section-title">📊 Performance Analysis</h2>
            <div class="charts-grid">
                <div class="chart-card">
                    <div class="chart-title">Overall Academic Quality Scores</div>
                    <div class="chart-container">
                        <canvas id="overallChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">Criteria Breakdown (Top 4 Models)</div>
                    <div class="chart-container">
                        <canvas id="radarChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">Performance by Feature</div>
                    <div class="chart-container">
                        <canvas id="featureChart"></canvas>
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">NCAD Recommendation Rate</div>
                    <div class="chart-container">
                        <canvas id="ncadChart"></canvas>
                    </div>
                </div>
            </div>
        </div>

        <!-- Detailed Table -->
        <div class="section">
            <h2 class="section-title">📋 Detailed Comparison</h2>
            <table class="detail-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Model</th>
                        <th>Tier</th>
                        <th>Overall</th>
                        <th>Accuracy</th>
                        <th>Complete</th>
                        <th>Clarity</th>
                        <th>Access.</th>
                        <th>Structure</th>
                        <th>NCAD %</th>
                        <th>Latency</th>
                    </tr>
                </thead>
                <tbody>
                    ${rankedModels.map(m => `
                    <tr>
                        <td><strong>#${m.rank}</strong></td>
                        <td><strong>${m.model}</strong></td>
                        <td><span class="model-tier" style="background: ${tierColors[getModelTier(m.model)] || '#666'}; font-size: 0.7rem;">${getModelTier(m.model)}</span></td>
                        <td><strong>${m.averageScore.toFixed(2)}</strong></td>
                        <td>${m.scores.accuracy.toFixed(1)}</td>
                        <td>${m.scores.completeness.toFixed(1)}</td>
                        <td>${m.scores.clarity.toFixed(1)}</td>
                        <td>${m.scores.accessibility.toFixed(1)}</td>
                        <td>${m.scores.structure.toFixed(1)}</td>
                        <td>${(m.ncadRecommendedRate || 0).toFixed(0)}%</td>
                        <td>${(m.averageLatencyMs / 1000).toFixed(2)}s</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <!-- Key Insights -->
        <div class="section">
            <h2 class="section-title">💡 Key Insights</h2>
            <div class="rankings-grid">
                <div class="methodology-card" style="border-left: 4px solid var(--accent-green);">
                    <h3>🥇 Best for NCAD Students</h3>
                    <p><strong>${rankedModels[0]?.model}</strong> achieved the highest academic quality score of ${rankedModels[0]?.averageScore.toFixed(2)}/10 with ${(rankedModels[0]?.ncadRecommendedRate || 0).toFixed(0)}% NCAD recommendation rate.</p>
                </div>
                <div class="methodology-card" style="border-left: 4px solid var(--accent-blue);">
                    <h3>📚 Most Accurate</h3>
                    <p><strong>${rankedModels.sort((a, b) => b.scores.accuracy - a.scores.accuracy)[0]?.model}</strong> had the highest accuracy score of ${rankedModels.sort((a, b) => b.scores.accuracy - a.scores.accuracy)[0]?.scores.accuracy.toFixed(1)}/10.</p>
                </div>
                <div class="methodology-card" style="border-left: 4px solid var(--accent-purple);">
                    <h3>✨ Most Clear</h3>
                    <p><strong>${rankedModels.sort((a, b) => b.scores.clarity - a.scores.clarity)[0]?.model}</strong> produced the clearest explanations with ${rankedModels.sort((a, b) => b.scores.clarity - a.scores.clarity)[0]?.scores.clarity.toFixed(1)}/10.</p>
                </div>
                <div class="methodology-card" style="border-left: 4px solid var(--accent-orange);">
                    <h3>🏠 Best Local Model</h3>
                    <p><strong>${rankedModels.filter(m => getModelTier(m.model) !== 'cloud')[0]?.model}</strong> is the top local option with ${rankedModels.filter(m => getModelTier(m.model) !== 'cloud')[0]?.averageScore.toFixed(2)}/10.</p>
                </div>
            </div>
        </div>

        <footer>
            <p>AssisT Academic Quality Benchmark Report</p>
            <p>Generated: ${new Date().toISOString()} | Judge Model: ${results.metadata.judgeModel}</p>
            <p>Evaluated ${results.tests.filter(t => t.success).length} successful tests across ${rankedModels.length} models</p>
        </footer>
    </div>

    <script>
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.borderColor = '#334155';

        const models = ${JSON.stringify(rankedModels.map(m => m.model))};
        const scores = ${JSON.stringify(rankedModels.map(m => m.averageScore))};
        const modelData = ${JSON.stringify(rankedModels)};
        const featureAvgs = ${JSON.stringify(featureAverages)};

        const tierColors = {
            'cloud': '#a855f7',
            '2gb': '#f97316',
            '4gb': '#eab308',
            '8gb': '#22c55e'
        };

        function getModelTier(model) {
            const test = ${JSON.stringify(results.tests)}.find(t => t.model === model);
            return test?.tier || 'unknown';
        }

        // Overall scores bar chart
        new Chart(document.getElementById('overallChart'), {
            type: 'bar',
            data: {
                labels: models,
                datasets: [{
                    label: 'Academic Quality Score',
                    data: scores,
                    backgroundColor: models.map(m => tierColors[getModelTier(m)] || '#666'),
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, max: 10 } }
            }
        });

        // Radar chart - top 4 models
        new Chart(document.getElementById('radarChart'), {
            type: 'radar',
            data: {
                labels: ['Accuracy', 'Completeness', 'Clarity', 'Accessibility', 'Structure'],
                datasets: modelData.slice(0, 4).map((m, i) => ({
                    label: m.model,
                    data: [m.scores.accuracy, m.scores.completeness, m.scores.clarity, m.scores.accessibility, m.scores.structure],
                    borderColor: Object.values(tierColors)[i % 4],
                    backgroundColor: Object.values(tierColors)[i % 4] + '33',
                    pointBackgroundColor: Object.values(tierColors)[i % 4]
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { r: { beginAtZero: true, max: 10 } }
            }
        });

        // Feature performance chart
        const features = Object.keys(featureAvgs);
        new Chart(document.getElementById('featureChart'), {
            type: 'bar',
            data: {
                labels: features,
                datasets: models.slice(0, 4).map((model, i) => ({
                    label: model,
                    data: features.map(f => featureAvgs[f][model] || 0),
                    backgroundColor: Object.values(tierColors)[i % 4],
                    borderRadius: 4
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'top' } },
                scales: { y: { beginAtZero: true, max: 10 } }
            }
        });

        // NCAD recommendation chart
        new Chart(document.getElementById('ncadChart'), {
            type: 'doughnut',
            data: {
                labels: models,
                datasets: [{
                    data: modelData.map(m => m.ncadRecommendedRate || 0),
                    backgroundColor: models.map(m => tierColors[getModelTier(m)] || '#666')
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => \`\${ctx.label}: \${ctx.raw.toFixed(0)}% NCAD recommended\`
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>`;

// Write the HTML file
const outputPath = path.join(__dirname, 'academic-benchmark-report.html');
fs.writeFileSync(outputPath, html);
console.log(`\nReport generated: ${outputPath}`);
console.log(`File size: ${(html.length / 1024).toFixed(1)}KB`);
