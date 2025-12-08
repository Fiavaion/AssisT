/**
 * Academic Quality Benchmark Suite
 * Uses Opus 4.5 as a judge to evaluate model outputs against academic criteria
 *
 * Criteria:
 * - Accuracy (25%): No factual errors, correct interpretation
 * - Completeness (25%): Key information preserved, no critical omissions
 * - Clarity (20%): Understandable by student with learning difficulties
 * - Accessibility (15%): Appropriate vocabulary, sentence structure
 * - Structure (15%): Logical organization, easy to follow
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
const JUDGE_MODEL = 'claude-opus-4-5-20251101'; // Use Opus as judge for highest quality evaluation

// API Key (same obfuscation as main benchmark)
const OBFUSCATION_KEY = 'ASSIST_FOCUS_GROUP_2025';
const ENCRYPTED_KEY = 'Mjh+KD0gcic/KmVgcjQRKQEzCnNbWnAqKjUhHh8ZAXsqZDEMEBgrZglrQ2BHZzMnYxEpYGYOeBkvOCUIPGIkEQ1GSlRNDAFgGBYfAAF7JBYQKT8mGwwUEnNEewMZJgARAGwea343Gj0sMBMO';

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

// VRAM tier configuration
const VRAM_TIERS = {
  '2gb': ['phi3:mini', 'llama3.2', 'llama3.2:3b'],
  '4gb': ['gemma3:4b', 'gemma3'],
  '8gb': ['mistral:7b-instruct', 'mistral:7b', 'qwen2.5:7b']
};

const CLOUD_MODELS = {
  'haiku-4.5': 'claude-3-5-haiku-20241022',
  'sonnet-4.5': 'claude-sonnet-4-5-20250929',
  'opus-4.5': 'claude-opus-4-5-20251101'
};

// Model optimization profiles (from previous benchmark)
const MODEL_OPTIMIZATION_PROFILES = {
  'gemma3:4b': { num_ctx: 4096, temperature: 0.7, top_p: 0.9 },
  'gemma3': { num_ctx: 4096, temperature: 0.7, top_p: 0.9 },
  'mistral:7b-instruct': { num_ctx: 4096, temperature: 0.4, top_p: 0.9 },
  'mistral:7b': { num_ctx: 4096, temperature: 0.4, top_p: 0.9 },
  'llama3.2': { num_ctx: 2048, temperature: 0.6, top_p: 0.9 },
  'llama3.2:3b': { num_ctx: 2048, temperature: 0.6, top_p: 0.9 },
  'phi3:mini': { num_ctx: 2048, temperature: 0.5, top_p: 0.9 },
  'qwen2.5:7b': { num_ctx: 4096, temperature: 0.5, top_p: 0.9 },
  'default': { num_ctx: 4096, temperature: 0.5, top_p: 0.9 }
};

function getModelProfile(model) {
  if (MODEL_OPTIMIZATION_PROFILES[model]) return MODEL_OPTIMIZATION_PROFILES[model];
  for (const [key, profile] of Object.entries(MODEL_OPTIMIZATION_PROFILES)) {
    if (model.startsWith(key)) return profile;
  }
  return MODEL_OPTIMIZATION_PROFILES['default'];
}

// ============================================================================
// ACADEMIC TEST CASES WITH KEY FACTS
// ============================================================================

const ACADEMIC_TEST_CASES = {
  textSimplification: {
    simple: {
      input: `The teacher explained the homework assignment. Students need to write a short essay about their favorite book. The essay should be one page long. It is due next Monday. Remember to include the title and author of the book.`,
      keyFacts: [
        'Write an essay about favorite book',
        'Essay length: one page',
        'Due date: Monday',
        'Must include book title and author'
      ],
      targetAudience: 'Student with reading difficulties, grade 6-8 level',
      task: 'Simplify this text for a student with learning difficulties'
    },
    moderate: {
      input: `Photosynthesis is the process by which plants convert light energy, usually from the sun, into chemical energy that can be later released to fuel the plant's activities. This process involves the absorption of carbon dioxide and water, which are then transformed into glucose and oxygen through a series of complex biochemical reactions in the chloroplasts.`,
      keyFacts: [
        'Photosynthesis converts light to chemical energy',
        'Plants use sunlight',
        'Needs carbon dioxide and water',
        'Makes glucose (food) and oxygen',
        'Happens in chloroplasts'
      ],
      targetAudience: 'Student with learning difficulties, grade 8-10 level',
      task: 'Simplify this scientific text while preserving all key concepts'
    },
    complex: {
      input: `The epistemological foundations of constructivist learning theory posit that knowledge is not passively received but actively constructed by learners through their interactions with the environment. This paradigm shift from objectivist to constructivist perspectives has profound implications for pedagogical practices, particularly in how educators facilitate meaning-making processes rather than simply transmitting information. Vygotsky's zone of proximal development further emphasizes the social dimension of learning, suggesting that cognitive development is mediated through social interaction and scaffolded support from more knowledgeable others.`,
      keyFacts: [
        'Constructivism: learners build knowledge actively',
        'Knowledge comes from interacting with environment',
        'Teachers help students understand, not just give information',
        'Vygotsky: learning is social',
        'Zone of proximal development: learning with help from others',
        'Scaffolding: support from teachers or peers'
      ],
      targetAudience: 'NCAD student (neurodivergent/learning difficulties), college level',
      task: 'Simplify this academic text for a neurodivergent college student while preserving all key educational concepts'
    }
  },
  summarization: {
    brief: {
      input: `Climate change refers to long-term shifts in global temperatures and weather patterns. While natural factors like volcanic eruptions can cause these shifts, human activities have been the primary driver since the 1800s, mainly through burning fossil fuels like coal, oil, and gas. These activities release greenhouse gases that trap heat in Earth's atmosphere, leading to rising temperatures. The effects include melting ice caps, rising sea levels, more frequent extreme weather events, and disruption to ecosystems. Scientists agree that limiting warming to 1.5°C above pre-industrial levels is crucial to avoid the worst impacts.`,
      keyFacts: [
        'Climate change = long-term temperature/weather shifts',
        'Human activities main cause since 1800s',
        'Burning fossil fuels releases greenhouse gases',
        'Effects: melting ice, rising seas, extreme weather',
        '1.5°C limit is important goal'
      ],
      targetAudience: 'Student needing quick overview',
      task: 'Create a brief 2-3 sentence summary (under 50 words)'
    },
    moderate: {
      input: `Climate change refers to long-term shifts in global temperatures and weather patterns. While natural factors like volcanic eruptions can cause these shifts, human activities have been the primary driver since the 1800s, mainly through burning fossil fuels like coal, oil, and gas. These activities release greenhouse gases that trap heat in Earth's atmosphere, leading to rising temperatures. The effects include melting ice caps, rising sea levels, more frequent extreme weather events, and disruption to ecosystems. Scientists agree that limiting warming to 1.5°C above pre-industrial levels is crucial to avoid the worst impacts.`,
      keyFacts: [
        'Climate change = long-term temperature/weather shifts',
        'Natural causes exist (volcanoes)',
        'Human activities main cause since 1800s',
        'Fossil fuels release greenhouse gases',
        'Effects: melting ice, rising seas, extreme weather',
        '1.5°C limit is important goal'
      ],
      targetAudience: 'Student needing balanced overview',
      task: 'Create a moderate-length summary (50-100 words) covering main causes and effects'
    },
    detailed: {
      input: `Climate change refers to long-term shifts in global temperatures and weather patterns. While natural factors like volcanic eruptions can cause these shifts, human activities have been the primary driver since the 1800s, mainly through burning fossil fuels like coal, oil, and gas. These activities release greenhouse gases that trap heat in Earth's atmosphere, leading to rising temperatures. The effects include melting ice caps, rising sea levels, more frequent extreme weather events, and disruption to ecosystems. Scientists agree that limiting warming to 1.5°C above pre-industrial levels is crucial to avoid the worst impacts.`,
      keyFacts: [
        'Climate change = long-term temperature/weather shifts',
        'Natural causes exist (volcanoes)',
        'Human activities main cause since 1800s',
        'Fossil fuels: coal, oil, gas',
        'Greenhouse gases trap heat',
        'Effects: melting ice, rising seas, extreme weather, ecosystem disruption',
        '1.5°C limit is important goal'
      ],
      targetAudience: 'Student needing comprehensive understanding',
      task: 'Create a detailed summary (100+ words) covering all main points with context'
    }
  },
  socraticTutor: {
    conceptual: {
      input: `I don't understand why we need to learn about the water cycle. It seems boring and I don't see how it matters.`,
      keyFacts: [
        'Should ask about student\'s prior knowledge',
        'Should connect to real-life relevance',
        'Should guide toward understanding, not lecture',
        'Questions should build on each other',
        'Should be encouraging, not dismissive'
      ],
      targetAudience: 'Disengaged student with potential learning difficulties',
      task: 'Generate Socratic questions to help the student discover why the water cycle is important and relevant to their life'
    },
    analytical: {
      input: `I read that social media is bad for teenagers but I use it all the time and I feel fine. So the research must be wrong.`,
      keyFacts: [
        'Should question assumptions without being judgmental',
        'Should explore evidence vs. personal experience',
        'Should introduce critical thinking about research',
        'Should acknowledge valid points in student\'s view',
        'Should guide to nuanced understanding'
      ],
      targetAudience: 'Student learning critical thinking skills',
      task: 'Generate Socratic questions to help the student think critically about evidence, personal experience, and research methodology'
    }
  },
  assignmentBreakdown: {
    essay: {
      input: `Write a 1500-word argumentative essay on whether social media has a positive or negative impact on society. Include at least 5 credible sources, a clear thesis statement, counterarguments, and proper APA citations. Due in 2 weeks.`,
      keyFacts: [
        '1500 words',
        'Argumentative essay',
        'Topic: social media impact',
        '5+ credible sources',
        'Thesis statement required',
        'Must address counterarguments',
        'APA citation format',
        '2 week deadline'
      ],
      targetAudience: 'Student with executive function challenges',
      task: 'Break down this assignment into manageable steps with time estimates'
    },
    research: {
      input: `Complete a research project on renewable energy sources. Create a 10-minute presentation with visual aids, a 2-page executive summary, and an annotated bibliography with at least 8 sources. Present to the class next month.`,
      keyFacts: [
        'Topic: renewable energy',
        '10-minute presentation',
        'Visual aids required',
        '2-page executive summary',
        'Annotated bibliography',
        '8+ sources',
        '1 month deadline'
      ],
      targetAudience: 'Student needing help with project planning',
      task: 'Break down this multi-part assignment into a structured plan with clear milestones'
    }
  },
  citationAnalyzer: {
    academic: {
      input: `Source: "The Effects of Mindfulness Meditation on Academic Performance" by Dr. Sarah Chen, published in the Journal of Educational Psychology (2023), peer-reviewed study of 500 college students over 2 semesters.`,
      keyFacts: [
        'Named author with credentials',
        'Peer-reviewed journal',
        'Recent publication (2023)',
        'Large sample size (500)',
        'Longitudinal design (2 semesters)',
        'Academic source'
      ],
      targetAudience: 'Student learning to evaluate sources',
      task: 'Analyze this source for credibility and potential bias'
    },
    questionable: {
      input: `Source: Blog post titled "10 SHOCKING Facts About Vaccines Big Pharma Doesn't Want You to Know!" from naturaltruthseeker.com, posted by "FreedomFighter2024", no date listed, shared 50,000 times on Facebook.`,
      keyFacts: [
        'Anonymous author',
        'Blog/non-academic source',
        'Sensationalist language',
        'No date',
        'Conspiracy framing ("Big Pharma")',
        'Social media popularity ≠ credibility',
        'Website name suggests bias'
      ],
      targetAudience: 'Student learning media literacy',
      task: 'Analyze this source for credibility and identify red flags'
    }
  }
};

// ============================================================================
// ACADEMIC EVALUATION RUBRIC (Opus-as-Judge)
// ============================================================================

const EVALUATION_PROMPT = `You are an expert academic evaluator assessing AI-generated educational content for students with learning difficulties (NCAD - Neurodivergent students and those with Cognitive/Academic Difficulties).

## Your Task
Evaluate the following AI output against strict academic quality criteria. Be rigorous - this content will be used by students who need accurate, clear, and accessible information.

## Original Input
{INPUT}

## Task Given to AI
{TASK}

## Target Audience
{AUDIENCE}

## Key Facts That MUST Be Preserved
{KEY_FACTS}

## AI Model Output to Evaluate
{OUTPUT}

## Evaluation Criteria

Score each criterion from 1-10 and provide specific justification:

### 1. ACCURACY (Weight: 25%)
- Are there ANY factual errors or misrepresentations?
- Is the interpretation of the source material correct?
- Would this mislead a student?
Score 1-3: Contains factual errors that could mislead students
Score 4-6: Mostly accurate with minor issues
Score 7-9: Accurate with no significant errors
Score 10: Perfectly accurate, could be used as reference material

### 2. COMPLETENESS (Weight: 25%)
- Are ALL key facts from the list preserved?
- Is any critical information omitted?
- For simplification: Is meaning preserved despite simpler language?
Score 1-3: Missing multiple critical facts
Score 4-6: Missing 1-2 important facts
Score 7-9: All key facts present, minor details may vary
Score 10: Complete coverage with appropriate depth

### 3. CLARITY (Weight: 20%)
- Would a student with learning difficulties understand this?
- Is the language appropriate for the target audience?
- Are complex concepts explained, not just simplified?
Score 1-3: Confusing, unclear, or still too complex
Score 4-6: Somewhat clear but could be improved
Score 7-9: Clear and well-explained
Score 10: Exceptionally clear, excellent pedagogical approach

### 4. ACCESSIBILITY (Weight: 15%)
- Is vocabulary appropriate for the target audience?
- Are sentences an appropriate length?
- Are technical terms explained when used?
Score 1-3: Vocabulary/structure too advanced
Score 4-6: Some accessibility issues
Score 7-9: Well-adapted for audience
Score 10: Perfect adaptation, exemplary accessibility

### 5. STRUCTURE (Weight: 15%)
- Is the output logically organized?
- Is it easy to follow?
- Does the format aid understanding (lists, sections, etc.)?
Score 1-3: Poorly organized, hard to follow
Score 4-6: Basic organization
Score 7-9: Well-structured and easy to follow
Score 10: Exceptional organization that enhances learning

## Response Format
Respond with ONLY a JSON object in this exact format:
{
  "accuracy": {
    "score": <1-10>,
    "justification": "<specific explanation with examples from the output>"
  },
  "completeness": {
    "score": <1-10>,
    "justification": "<list which key facts are present/missing>",
    "missingFacts": ["<fact1>", "<fact2>"]
  },
  "clarity": {
    "score": <1-10>,
    "justification": "<specific explanation>"
  },
  "accessibility": {
    "score": <1-10>,
    "justification": "<specific explanation about vocabulary/sentence structure>"
  },
  "structure": {
    "score": <1-10>,
    "justification": "<specific explanation about organization>"
  },
  "overallAssessment": "<2-3 sentence summary of strengths and weaknesses>",
  "recommendedForNCAD": <true/false>,
  "criticalIssues": ["<issue1>", "<issue2>"]
}`;

// ============================================================================
// API CLIENTS
// ============================================================================

let API_KEY = null;

async function checkOllamaModels() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.models?.map(m => m.name) || [];
  } catch (error) {
    console.error('Ollama check failed:', error.message);
    return [];
  }
}

async function ollamaGenerate(model, prompt, maxTokens = 600) {
  const startTime = Date.now();
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
          num_ctx: profile.num_ctx,
          num_predict: maxTokens,
          temperature: profile.temperature,
          top_p: profile.top_p
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      output: data.response,
      tokens: data.eval_count || 0,
      latencyMs: Date.now() - startTime
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      latencyMs: Date.now() - startTime
    };
  }
}

async function claudeGenerate(modelId, prompt, maxTokens = 600) {
  const startTime = Date.now();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
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
    return {
      success: true,
      output: data.content?.[0]?.text || '',
      tokens: data.usage?.output_tokens || 0,
      latencyMs: Date.now() - startTime
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
// OPUS EVALUATION FUNCTION
// ============================================================================

async function evaluateWithJudge(testCase, modelOutput) {
  const prompt = EVALUATION_PROMPT
    .replace('{INPUT}', testCase.input)
    .replace('{TASK}', testCase.task)
    .replace('{AUDIENCE}', testCase.targetAudience)
    .replace('{KEY_FACTS}', testCase.keyFacts.map((f, i) => `${i + 1}. ${f}`).join('\n'))
    .replace('{OUTPUT}', modelOutput);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        max_tokens: 2000,
        temperature: 0.1, // Low temperature for consistent evaluation
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Judge API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const evaluation = JSON.parse(jsonMatch[0]);

      // Calculate weighted score
      const weightedScore = (
        evaluation.accuracy.score * 0.25 +
        evaluation.completeness.score * 0.25 +
        evaluation.clarity.score * 0.20 +
        evaluation.accessibility.score * 0.15 +
        evaluation.structure.score * 0.15
      );

      return {
        success: true,
        evaluation,
        weightedScore,
        rawResponse: text
      };
    } else {
      throw new Error('Could not parse evaluation JSON');
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// PROMPT GENERATORS (Same as main benchmark)
// ============================================================================

function generatePrompt(feature, testCase, isCloud = false, level = null) {
  const text = testCase.input;

  switch (feature) {
    case 'textSimplification':
      if (isCloud) {
        return `You are an expert at making academic text accessible for students with learning difficulties.

Simplify this text for: ${testCase.targetAudience}

Original text:
${text}

Requirements:
- Use simple, everyday words
- Break long sentences into shorter ones
- Explain technical terms in parentheses
- Keep ALL important information
- Make it easy to understand on first reading

Simplified version:`;
      } else {
        return `Simplify this text for a student with learning difficulties. Use simple words. Keep all important facts.

Text: ${text}

Simple version:`;
      }

    case 'summarization':
      let lengthInstruction;
      if (level === 'brief') {
        lengthInstruction = 'Create a BRIEF summary in 2-3 sentences (under 50 words). Focus on the single most important point.';
      } else if (level === 'moderate') {
        lengthInstruction = 'Create a MODERATE summary in 50-100 words. Cover the main causes and effects.';
      } else {
        lengthInstruction = 'Create a DETAILED summary in 100+ words. Cover all main points with context and explanation.';
      }

      return `${lengthInstruction}

Text to summarize:
${text}

Summary:`;

    case 'socraticTutor':
      return `You are a Socratic tutor helping students discover understanding through questions.

Student says: "${text}"

Generate 3-5 thoughtful questions that:
- Help the student think deeper
- Connect to their experiences
- Guide them to discover the answer themselves
- Are encouraging, not judgmental

Questions:`;

    case 'assignmentBreakdown':
      return `Break down this assignment into manageable steps for a student with executive function challenges:

Assignment: ${text}

Create a step-by-step plan with:
- Clear, small tasks
- Time estimates
- What to do first
- Tips for staying on track

Plan:`;

    case 'citationAnalyzer':
      return `Analyze this source for academic credibility:

${text}

Evaluate:
1. Author credibility
2. Source type and reliability
3. Potential biases
4. Overall credibility score (1-10)
5. Recommendation for academic use

Analysis:`;

    default:
      return text;
  }
}

// ============================================================================
// MAIN BENCHMARK RUNNER
// ============================================================================

async function runAcademicBenchmark() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     AssisT ACADEMIC Quality Benchmark - Opus-as-Judge         ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Initialize API key
  API_KEY = decryptApiKey();
  if (!API_KEY) {
    console.error('❌ Failed to decrypt API key. Cannot run benchmark.');
    process.exit(1);
  }
  console.log('✓ API key initialized\n');

  const results = {
    metadata: {
      timestamp: new Date().toISOString(),
      judgeModel: JUDGE_MODEL,
      platform: process.platform,
      evaluationType: 'academic-quality',
      rubric: {
        accuracy: 0.25,
        completeness: 0.25,
        clarity: 0.20,
        accessibility: 0.15,
        structure: 0.15
      }
    },
    tests: [],
    modelSummaries: {}
  };

  // Check available models
  console.log('🔍 Checking available models...\n');
  const ollamaModels = await checkOllamaModels();
  console.log(`   Local models: ${ollamaModels.length > 0 ? ollamaModels.join(', ') : 'None'}`);
  console.log(`   Cloud models: ${Object.keys(CLOUD_MODELS).join(', ')}\n`);

  // Build model list
  const modelsToTest = [];

  // Add local models by tier
  for (const [tier, tierModels] of Object.entries(VRAM_TIERS)) {
    for (const model of tierModels) {
      if (ollamaModels.some(m => m.startsWith(model))) {
        const exactModel = ollamaModels.find(m => m.startsWith(model));
        modelsToTest.push({ model: exactModel, tier, isCloud: false });
      }
    }
  }

  // Add cloud models
  for (const [name, modelId] of Object.entries(CLOUD_MODELS)) {
    modelsToTest.push({ model: name, modelId, tier: 'cloud', isCloud: true });
  }

  console.log(`📋 Testing ${modelsToTest.length} models across ${Object.keys(ACADEMIC_TEST_CASES).length} features\n`);

  // Calculate total tests
  let totalTests = 0;
  for (const [feature, cases] of Object.entries(ACADEMIC_TEST_CASES)) {
    totalTests += Object.keys(cases).length * modelsToTest.length;
  }
  console.log(`   Total test cases: ${totalTests}\n`);
  console.log('═'.repeat(65) + '\n');

  let completedTests = 0;

  // Run tests
  for (const [feature, cases] of Object.entries(ACADEMIC_TEST_CASES)) {
    console.log(`\n📚 Feature: ${feature.toUpperCase()}`);
    console.log('─'.repeat(50));

    for (const [complexity, testCase] of Object.entries(cases)) {
      console.log(`\n   Complexity: ${complexity}`);

      for (const { model, modelId, tier, isCloud } of modelsToTest) {
        completedTests++;
        const progress = ((completedTests / totalTests) * 100).toFixed(1);
        process.stdout.write(`   [${progress}%] Testing ${model}... `);

        // Generate output (pass complexity as level for features with multiple levels)
        const prompt = generatePrompt(feature, testCase, isCloud, complexity);
        let genResult;

        if (isCloud) {
          genResult = await claudeGenerate(modelId, prompt);
        } else {
          genResult = await ollamaGenerate(model, prompt);
        }

        if (!genResult.success) {
          console.log(`❌ Generation failed: ${genResult.error}`);
          results.tests.push({
            feature,
            complexity,
            model,
            tier,
            isCloud,
            success: false,
            error: genResult.error
          });
          continue;
        }

        // Evaluate with judge
        process.stdout.write('evaluating... ');
        const evalResult = await evaluateWithJudge(testCase, genResult.output);

        if (!evalResult.success) {
          console.log(`❌ Evaluation failed: ${evalResult.error}`);
          results.tests.push({
            feature,
            complexity,
            model,
            tier,
            isCloud,
            success: false,
            output: genResult.output,
            latencyMs: genResult.latencyMs,
            evaluationError: evalResult.error
          });
          continue;
        }

        const score = evalResult.weightedScore.toFixed(1);
        const recommended = evalResult.evaluation.recommendedForNCAD ? '✓' : '✗';
        console.log(`✓ Score: ${score}/10 [NCAD: ${recommended}]`);

        results.tests.push({
          feature,
          complexity,
          model,
          tier,
          isCloud,
          success: true,
          output: genResult.output,
          latencyMs: genResult.latencyMs,
          tokens: genResult.tokens,
          evaluation: evalResult.evaluation,
          weightedScore: evalResult.weightedScore
        });

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  // Calculate model summaries
  console.log('\n\n' + '═'.repeat(65));
  console.log('📊 CALCULATING MODEL SUMMARIES...\n');

  for (const { model } of modelsToTest) {
    const modelTests = results.tests.filter(t => t.model === model && t.success && t.weightedScore);

    if (modelTests.length === 0) continue;

    const avgScore = modelTests.reduce((a, t) => a + t.weightedScore, 0) / modelTests.length;
    const avgAccuracy = modelTests.reduce((a, t) => a + t.evaluation.accuracy.score, 0) / modelTests.length;
    const avgCompleteness = modelTests.reduce((a, t) => a + t.evaluation.completeness.score, 0) / modelTests.length;
    const avgClarity = modelTests.reduce((a, t) => a + t.evaluation.clarity.score, 0) / modelTests.length;
    const avgAccessibility = modelTests.reduce((a, t) => a + t.evaluation.accessibility.score, 0) / modelTests.length;
    const avgStructure = modelTests.reduce((a, t) => a + t.evaluation.structure.score, 0) / modelTests.length;
    const ncadRecommended = modelTests.filter(t => t.evaluation.recommendedForNCAD).length;
    const avgLatency = modelTests.reduce((a, t) => a + t.latencyMs, 0) / modelTests.length;

    results.modelSummaries[model] = {
      testsCompleted: modelTests.length,
      averageScore: avgScore,
      scores: {
        accuracy: avgAccuracy,
        completeness: avgCompleteness,
        clarity: avgClarity,
        accessibility: avgAccessibility,
        structure: avgStructure
      },
      ncadRecommendedRate: (ncadRecommended / modelTests.length) * 100,
      averageLatencyMs: avgLatency
    };
  }

  // Save results
  const timestamp = Date.now();
  const outputPath = path.join(__dirname, `academic-benchmark-${timestamp}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${outputPath}`);

  // Print summary
  console.log('\n' + '═'.repeat(65));
  console.log('🏆 ACADEMIC QUALITY RANKINGS\n');

  const ranked = Object.entries(results.modelSummaries)
    .sort((a, b) => b[1].averageScore - a[1].averageScore);

  console.log('┌─────────────────────────┬────────┬────────┬────────┬────────┬────────┬────────┬─────────┐');
  console.log('│ Model                   │ Overall│Accuracy│Complete│Clarity │Access. │Struct. │NCAD Rate│');
  console.log('├─────────────────────────┼────────┼────────┼────────┼────────┼────────┼────────┼─────────┤');

  for (const [model, summary] of ranked) {
    const s = summary.scores;
    console.log(`│ ${model.padEnd(23)} │ ${summary.averageScore.toFixed(1).padStart(6)} │ ${s.accuracy.toFixed(1).padStart(6)} │ ${s.completeness.toFixed(1).padStart(6)} │ ${s.clarity.toFixed(1).padStart(6)} │ ${s.accessibility.toFixed(1).padStart(6)} │ ${s.structure.toFixed(1).padStart(6)} │ ${summary.ncadRecommendedRate.toFixed(0).padStart(6)}% │`);
  }

  console.log('└─────────────────────────┴────────┴────────┴────────┴────────┴────────┴────────┴─────────┘');

  console.log('\n✅ Academic benchmark complete!\n');

  return results;
}

// ============================================================================
// RUN
// ============================================================================

runAcademicBenchmark().catch(console.error);
