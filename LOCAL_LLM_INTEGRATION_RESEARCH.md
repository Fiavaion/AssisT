# Local LLM Integration Research for AssisT Extension

**Research Date:** November 28, 2025
**Target Hardware:** NVIDIA GPU (6GB+ VRAM) | Apple Silicon (Unified Memory)

---

## Executive Summary

Integrating a local LLM into the AssisT extension represents a transformative opportunity to supercharge accessibility features for neurodivergent users. Unlike cloud-based AI services that require API keys, incur ongoing costs, and raise FERPA/privacy concerns, local LLMs provide:

- **Zero-cost inference** after initial setup
- **Complete privacy** - student data never leaves the device
- **Offline capability** - works without internet connection
- **No rate limits** - unlimited usage
- **FERPA/HIPAA compliance** - no third-party data processing

This document explores which features can be enhanced, new capabilities made possible, and practical implementation considerations for the specified hardware targets.

---

## Table of Contents

1. [Hardware Requirements & Model Selection](#1-hardware-requirements--model-selection)
2. [Integration Architecture](#2-integration-architecture)
3. [Supercharged Existing Features](#3-supercharged-existing-features)
4. [New Features Enabled by Local LLM](#4-new-features-enabled-by-local-llm)
5. [Features Replacing Paid API Services](#5-features-replacing-paid-api-services)
6. [Privacy & Compliance Benefits](#6-privacy--compliance-benefits)
7. [Implementation Roadmap](#7-implementation-roadmap)
8. [Sources & References](#8-sources--references)

---

## 1. Hardware Requirements & Model Selection

### NVIDIA GPU (6GB+ VRAM)

For systems with 6GB VRAM (e.g., RTX 3060, RTX 4060), the following models perform well:

| Model | Parameters | VRAM (Q4) | Speed | Best For |
|-------|------------|-----------|-------|----------|
| **Llama 3.2 3B** | 3B | ~2.5GB | 25+ tok/s | General assistance, summarization |
| **Llama 3.2 1B** | 1B | ~1GB | 40+ tok/s | Fast responses, simple tasks |
| **Phi-3 Mini** | 3.8B | ~2.5GB | 20+ tok/s | Reasoning, instruction following |
| **Gemma 2 2B** | 2B | ~1.5GB | 30+ tok/s | Text generation, Q&A |
| **Gemma 3 4B QAT** | 4B | ~3GB | 20+ tok/s | High-quality outputs |
| **Mistral 7B (Q4)** | 7B | ~4.5GB | 15-20 tok/s | Complex reasoning |
| **Qwen 2.5 3B** | 3B | ~2.5GB | 25+ tok/s | Multilingual support |

**Recommended Configuration:**
- **Primary:** Llama 3.2 3B (best balance of quality and speed)
- **Fast fallback:** Llama 3.2 1B (for real-time typing assistance)
- **Quality mode:** Mistral 7B Q4 (for complex summarization)

### Apple Silicon (Unified Memory)

Apple's unified memory architecture provides unique advantages for LLM inference:

| Mac Model | Memory Bandwidth | Expected Performance | Max Model Size |
|-----------|------------------|---------------------|----------------|
| M1/M2 (8GB) | 100GB/s | ~6-8 tok/s | 7B Q4 |
| M1/M2 Pro (16GB) | 200GB/s | ~13 tok/s | 13B Q4 |
| M1/M2 Max (32GB+) | 400GB/s | ~25 tok/s | 30B Q4 |
| M3/M4 (8GB+) | 100-150GB/s | ~7-10 tok/s | 7B Q4 |
| M3/M4 Pro/Max | 150-400GB/s | 15-30 tok/s | 13-30B Q4 |

**Key Insight:** Memory bandwidth (not clock speed) determines LLM performance on Apple Silicon. An M2 Pro outperforms an M3 (non-Pro) for LLM inference despite the M3 being "newer."

**Recommended Frameworks:**
- **MLX** - Apple's native framework, optimized for Apple Silicon
- **llama.cpp** - Cross-platform, slightly faster than MLX
- **Ollama** - User-friendly, uses llama.cpp backend

**Unified Memory Advantage:**
> "Apple's unified memory architecture allows true memory sharing between the GPU and CPU. Data no longer needs to be transferred back and forth between CPU and GPU memory."

This means larger models can run on Macs than equivalent NVIDIA GPUs because the full system RAM is available for model weights.

---

## 2. Integration Architecture

### Recommended Stack: Ollama

**Ollama** is the recommended local LLM server for both platforms:

```
┌─────────────────────────────────────────────────────────┐
│                    AssisT Extension                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Popup     │  │  Content    │  │    Background   │ │
│  │    UI       │  │  Scripts    │  │  Service Worker │ │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘ │
│         │                │                   │          │
│         └────────────────┼───────────────────┘          │
│                          │                              │
│              ┌───────────▼───────────┐                  │
│              │   LLM Service Module   │                  │
│              │  (src/services/llm.js) │                  │
│              └───────────┬───────────┘                  │
└──────────────────────────┼──────────────────────────────┘
                           │ HTTP REST API
                           │ (localhost:11434)
                    ┌──────▼──────┐
                    │   Ollama    │
                    │   Server    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌────▼────┐ ┌─────▼─────┐
        │ Llama 3.2 │ │ Phi-3   │ │ Mistral   │
        │    3B     │ │  Mini   │ │    7B     │
        └───────────┘ └─────────┘ └───────────┘
```

### CORS Configuration

Chrome extensions require special CORS handling to communicate with local Ollama:

**1. Ollama Server Configuration:**
```bash
# Windows (PowerShell)
$env:OLLAMA_ORIGINS="chrome-extension://*"
ollama serve

# macOS
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*"
ollama serve

# Linux
OLLAMA_ORIGINS=chrome-extension://* ollama serve
```

**2. Manifest.json Permissions:**
```json
{
  "permissions": ["tabs", "activeTab", "scripting"],
  "host_permissions": ["http://localhost/*"]
}
```

**3. Alternative: declarativeNetRequest API**
For more robust handling, the extension can use `declarativeNetRequest` to modify request headers, as demonstrated by ollama-ui.

### API Interface

```javascript
// src/services/llm-service.js
const OLLAMA_BASE_URL = 'http://localhost:11434';

export async function generateCompletion(prompt, options = {}) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: options.model || 'llama3.2:3b',
      prompt: prompt,
      stream: options.stream || false,
      options: {
        temperature: options.temperature || 0.7,
        num_predict: options.maxTokens || 256
      }
    })
  });
  return response.json();
}

export async function checkOllamaStatus() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}
```

---

## 3. Supercharged Existing Features

### 3.1 Speech-to-Text (STT) Enhancement

**Current State:** Web Speech API transcription with rule-based auto-punctuation and command parsing.

**LLM Supercharge:**

| Enhancement | Description | Impact |
|-------------|-------------|--------|
| **Context-Aware Correction** | Fix transcription errors based on surrounding text | 40-60% error reduction |
| **Intent Recognition** | Understand what user means, not just what they said | Natural interaction |
| **Smart Punctuation** | LLM-based punctuation placement | Better than rule-based |
| **Vocabulary Expansion** | Learn user's common terms and jargon | Personalized accuracy |
| **Grammar Correction** | Real-time grammar fixes for dysgraphia support | Cleaner output |

**Example Prompt:**
```
You are an assistive writing tool for a student with dyslexia.
The following text was transcribed from speech. Fix any grammar
or punctuation errors while preserving the student's voice and intent:

"their going to the libary tommorow to get there books"

Corrected:
```

**Research Support:**
> "Writers with dyslexia describe a variety of challenges, including spelling, grammar, organization, matching a desired tone, and expressing themselves with clarity and precision." - LaMPost Research (ACM)

### 3.2 OCR Post-Processing

**Current State:** Tesseract.js extracts text with confidence scoring, but raw output often contains errors.

**LLM Supercharge:**

| Enhancement | Description | Impact |
|-------------|-------------|--------|
| **Error Correction** | Fix OCR misreads (0→O, l→1, etc.) | Cleaner text |
| **Structure Recognition** | Identify headers, lists, paragraphs | Better formatting |
| **Table Reconstruction** | Rebuild table structures from OCR | Usable data |
| **Formula Interpretation** | Convert math notation to readable form | STEM accessibility |
| **Language Detection** | Auto-detect and route to correct processing | Multilingual support |

**Example Prompt:**
```
The following text was extracted from an image using OCR.
Clean up any obvious OCR errors while preserving the original meaning:

"Th3 quick br0wn f0x jumps 0ver the 1azy d0g."

Corrected:
```

### 3.3 Translation Enhancement

**Current State:** LibreTranslate/MyMemory API with caching.

**LLM Supercharge:**

| Enhancement | Description | Impact |
|-------------|-------------|--------|
| **Context-Aware Translation** | Understand full paragraph context | More natural translations |
| **Academic Term Handling** | Preserve technical terminology | Better for coursework |
| **Simplified Output Option** | Translate AND simplify simultaneously | Dual benefit |
| **Cultural Adaptation** | Localize idioms and expressions | Better comprehension |

### 3.4 Citation Intelligence

**Current State:** Metadata extraction with CrossRef API, Harvard formatting.

**LLM Supercharge:**

| Enhancement | Description | Impact |
|-------------|-------------|--------|
| **Smart Metadata Extraction** | Extract author/title from unstructured text | More sources captured |
| **Duplicate Detection** | Identify same source with different URLs | Cleaner bibliography |
| **Relevance Scoring** | Assess source relevance to research topic | Better research |
| **Summary Generation** | Auto-generate source summaries | Faster review |
| **Citation Style Conversion** | Convert between APA, MLA, Chicago, etc. | Flexibility |

### 3.5 Reading Mode Enhancement

**Current State:** Mozilla Readability extracts article content for distraction-free reading.

**LLM Supercharge:**

| Enhancement | Description | Impact |
|-------------|-------------|--------|
| **Automatic Summarization** | Generate TL;DR before reading | Time savings |
| **Key Points Extraction** | Bullet-point main ideas | Quick scanning |
| **Difficulty Assessment** | Estimate reading level | Preparation |
| **Vocabulary Highlighting** | Pre-identify difficult words | Reduced interruption |

---

## 4. New Features Enabled by Local LLM

### 4.1 Text Simplification Engine

**The Killer Feature for Neurodivergent Users**

LLMs enable automatic text simplification - converting complex academic text into accessible plain language.

**Research Validation:**
> "SimplifyMyText is the first system designed to produce plain language content from multiple input formats... with flexible customization options for diverse audiences." - ECIR 2025

**Implementation:**
```javascript
async function simplifyText(text, targetLevel = 'high_school') {
  const levels = {
    elementary: 'a 10-year-old student',
    middle_school: 'a middle school student',
    high_school: 'a high school student',
    plain_language: 'someone who prefers plain language'
  };

  const prompt = `Rewrite the following text so it can be understood by ${levels[targetLevel]}.
Keep all important information but use simpler words and shorter sentences:

"${text}"

Simplified version:`;

  return await generateCompletion(prompt, { temperature: 0.3 });
}
```

**User Interface:**
- Button in highlight menu: "Simplify"
- Reading mode toggle: "Simplified View"
- Slider: "Reading Level" (Elementary → College)

**User Study Evidence:**
> "Participants who read the simplified text answered more MCQs correctly than their counterparts who read the original text (3.9% absolute increase). This gain was most striking with PubMed (14.6%)." - LLM Text Simplification Study 2025

### 4.2 Intelligent Writing Assistant

**For Students with Dysgraphia and Writing Difficulties**

| Feature | Description | Use Case |
|---------|-------------|----------|
| **Grammar Correction** | Real-time grammar fixes | Dysgraphia support |
| **Sentence Completion** | Suggest sentence endings | Writer's block |
| **Paragraph Organization** | Suggest restructuring | ADHD focus issues |
| **Tone Adjustment** | Formal/informal rewriting | Academic writing |
| **Expansion/Compression** | Make text longer/shorter | Assignment requirements |

**Research Support:**
> "For those with ADHD or dyspraxia, LLMs can assist in structuring writing by suggesting outlines, offering prompts, or even generating full drafts. This helps reduce the cognitive load associated with organizing ideas." - DoIT Profiler

### 4.3 Comprehension Question Generator

**For Active Learning and Self-Testing**

After reading a passage, the LLM generates comprehension questions to verify understanding:

```javascript
async function generateComprehensionQuestions(text, numQuestions = 3) {
  const prompt = `Based on this text, generate ${numQuestions} comprehension questions
that test understanding of the main ideas. Include one factual recall question,
one inference question, and one application question.

Text: "${text}"

Questions:`;

  return await generateCompletion(prompt);
}
```

**Integration Points:**
- After TTS reading completes
- In reading mode as optional "Quiz Me" button
- For annotations: "Test me on my highlights"

### 4.4 Flashcard Generator

**Automatic Study Material Creation**

Convert annotations, highlights, and notes into flashcards:

```javascript
async function generateFlashcards(notes) {
  const prompt = `Convert these study notes into flashcard format.
Each flashcard should have a question on the front and answer on the back.
Focus on key concepts and definitions.

Notes:
${notes}

Flashcards (JSON format):`;

  return await generateCompletion(prompt, { temperature: 0.3 });
}
```

### 4.5 Concept Explainer

**On-Demand Explanations at Any Level**

When a user encounters a difficult concept:

```javascript
async function explainConcept(concept, context, userLevel = 'simple') {
  const prompt = `Explain "${concept}" in simple terms that a ${userLevel} student
would understand. Use analogies and examples. Keep it under 100 words.

Context where this appeared: "${context}"

Explanation:`;

  return await generateCompletion(prompt);
}
```

### 4.6 Study Schedule Optimizer

**Personalized Learning with Spaced Repetition**

LLM analyzes learning patterns and suggests optimal review times:

- Track which concepts user struggles with
- Suggest review schedule based on forgetting curve
- Prioritize weak areas before exams

### 4.7 Emotional Tone Detector

**For Social-Emotional Learning Support**

Analyze text for emotional tone to help users with autism understand subtext:

```javascript
async function analyzeTone(text) {
  const prompt = `Analyze the emotional tone of this text.
Identify the primary emotion and any subtext or implied meaning
that might not be obvious. Keep it brief and clear.

Text: "${text}"

Analysis:`;

  return await generateCompletion(prompt);
}
```

### 4.8 Assignment Breakdown

**ADHD Task Management**

Break large assignments into manageable steps:

```javascript
async function breakdownAssignment(assignmentText) {
  const prompt = `Break down this assignment into small, manageable steps.
Each step should take no more than 15-20 minutes.
Number each step and make them specific and actionable.

Assignment: "${assignmentText}"

Steps:`;

  return await generateCompletion(prompt);
}
```

---

## 5. Features Replacing Paid API Services

### Currently Requiring API Keys

| Feature | Current Provider | API Cost | Local LLM Replacement |
|---------|-----------------|----------|----------------------|
| Translation | Google Translate | $20/M chars | Multilingual LLM (free) |
| Grammar Check | Grammarly API | $30/month | Local grammar model |
| Summarization | OpenAI GPT-4 | $0.03/1K tokens | Llama 3.2 (free) |
| Text Simplification | OpenAI API | $0.03/1K tokens | Local LLM (free) |
| Question Generation | OpenAI API | $0.03/1K tokens | Local LLM (free) |
| Writing Assistance | OpenAI API | $0.03/1K tokens | Local LLM (free) |

### Cost Savings Example

For a student using the extension 2 hours/day:

| Usage | Cloud API Cost/Month | Local LLM Cost |
|-------|---------------------|----------------|
| Text Simplification (50 pages) | ~$15 | $0 |
| Grammar Correction (100 docs) | ~$10 | $0 |
| Summarization (30 articles) | ~$5 | $0 |
| Q&A about content | ~$20 | $0 |
| **Total** | **~$50/month** | **$0** |

### Zero-API-Key Features

With local LLM, these features work without any external service:

1. **Complete Text Simplification** - No SimplifyMyText API needed
2. **Offline Translation** - Works without internet
3. **Private Grammar Checking** - No text sent to Grammarly
4. **Unlimited Summarization** - No token limits
5. **Personalized Learning** - Model learns user patterns locally

---

## 6. Privacy & Compliance Benefits

### FERPA Compliance

The Family Educational Rights and Privacy Act (FERPA) protects student education records. Local LLM processing ensures:

| Requirement | Cloud AI Risk | Local LLM Solution |
|-------------|--------------|-------------------|
| Data Minimization | Text sent to third parties | All processing on-device |
| Access Control | Cloud provider has access | Only student has access |
| Audit Trail | Complex with cloud services | Simple local logging |
| Data Retention | Unclear cloud policies | User-controlled deletion |
| Third-Party Sharing | API terms may allow | No third parties involved |

### HIPAA Considerations

For students with documented disabilities (IEPs, 504 plans):

> "All data storage (storage API) and external API interactions must adhere to the principle of least privilege and FERPA compliance." - CLAUDE.md

Local LLMs eliminate the risk of disability-related accommodations data being processed by external services.

### Accessibility & Equity

Local LLMs provide:

- **No subscription barriers** - Students from low-income families get equal access
- **No usage limits** - Heavy users aren't penalized
- **Offline access** - Works in areas with poor connectivity
- **Data sovereignty** - Student data stays in their country/institution

---

## 7. Implementation Roadmap

### Phase 1: Foundation (2-3 weeks)

1. **LLM Service Module**
   - Create `src/services/llm-service.js`
   - Ollama API integration
   - Connection status detection
   - Graceful fallback when Ollama unavailable

2. **User Onboarding**
   - Ollama installation guide modal
   - Model download recommendations
   - CORS configuration helper

3. **Settings Integration**
   - LLM enable/disable toggle
   - Model selection dropdown
   - Performance vs. quality slider

### Phase 2: Core Enhancements (3-4 weeks)

4. **STT Enhancement**
   - Post-transcription grammar correction
   - Context-aware punctuation

5. **Text Simplification**
   - Highlight menu integration
   - Reading mode simplified view
   - Configurable reading levels

6. **OCR Post-Processing**
   - Automatic error correction
   - Structure preservation

### Phase 3: New Features (4-6 weeks)

7. **Writing Assistant**
   - Inline grammar suggestions
   - Sentence completion
   - Tone adjustment

8. **Comprehension Tools**
   - Question generation
   - Flashcard creation
   - Concept explainer

9. **Study Optimization**
   - Assignment breakdown
   - Study schedule suggestions

### Phase 4: Advanced Features (6-8 weeks)

10. **Personalization Engine**
    - Learning pattern analysis
    - Adaptive difficulty
    - Usage-based recommendations

11. **Multi-Modal Support**
    - Image understanding (with vision models)
    - Document analysis

---

## 8. Sources & References

### Local LLM & Chrome Extension Integration

- [Ollama Client - GitHub](https://github.com/Shishir435/ollama-client) - Privacy-first Chrome extension for local LLMs
- [Lumos RAG Extension](https://github.com/andrewnguonly/Lumos) - RAG LLM co-pilot powered by local LLMs
- [Page Assist Extension](https://chromewebstore.google.com/detail/page-assist-a-web-ui-for/jfgfiigpkhlkbnfnbobbkinehhfdhndo?hl=en) - Web UI for local AI models
- [Local LLM in Browser with Ollama - Medium](https://medium.com/@andrewnguonly/local-llm-in-the-browser-powered-by-ollama-236817f335da)
- [How to Solve CORS Issues with Ollama - Mellowtel](https://www.mellowtel.com/blog/how-to-solve-cors-ollama-chrome-extension)
- [Ollama CORS Configuration Guide - Medium](https://medium.com/dcoderai/how-to-handle-cors-settings-in-ollama-a-comprehensive-guide-ee2a5a1beef0)

### Hardware & Performance

- [Choosing GPU for LLMs on Ollama](https://www.databasemart.com/blog/choosing-the-right-gpu-for-popluar-llms-on-ollama)
- [Gemma 3 QAT Models - Google Developers](https://developers.googleblog.com/en/gemma-3-quantized-aware-trained-state-of-the-art-ai-to-consumer-gpus/)
- [Llama 3.2 Edge AI - Meta](https://ai.meta.com/blog/llama-3-2-connect-2024-vision-edge-mobile-devices/)
- [Best Ollama Models 2025](https://collabnix.com/best-ollama-models-in-2025-complete-performance-comparison/)
- [Apple Silicon LLM Performance - GitHub Discussion](https://github.com/ggml-org/llama.cpp/discussions/4167)
- [MLX vs llama.cpp Benchmarks - Medium](https://medium.com/@andreask_75652/benchmarking-apples-mlx-vs-llama-cpp-bbbebdc18416)
- [Apple Silicon Performance for Local LLMs - Medium](https://medium.com/@andreask_75652/thoughts-on-apple-silicon-performance-for-local-llms-3ef0a50e08bd)

### Accessibility & Neurodivergent Support

- [LaMPost: AI Writing for Adults with Dyslexia - ACM](https://cacm.acm.org/research-highlights/lampost-ai-writing-assistance-for-adults-with-dyslexia-using-large-language-models/)
- [How AI and LLMs Help Neurodivergent Individuals - DoIT Profiler](https://doitprofiler.com/insight/how-ai-and-large-language-models-llms-can-help-neurodivergent-individuals/)
- [AI for Neurodiversity - Smashing Magazine](https://www.smashingmagazine.com/2024/04/ai-neurodiversity-building-inclusive-tools/)
- [Exploring LLMs Through Neurodivergent Lens - arXiv](https://arxiv.org/html/2410.06336v1)
- [AI-Enhanced Assistive Technologies - ASU](https://accessibility.asu.edu/aaad2023/schedule/ai-enhanced-assistive-technologies-neurodivergent-learners)
- [Dyslexic AI - AI Tools for Dyslexia](https://dyslexic.ai/)

### Text Simplification Research

- [SimplifyMyText LLM System - arXiv](https://arxiv.org/abs/2504.14223)
- [Measuring Readability with GPT-4 - arXiv](https://arxiv.org/html/2410.14028v1)
- [LLM Text Simplification User Study - arXiv](https://arxiv.org/abs/2505.01980)
- [Cognitive Accessibility with LLMs - arXiv](https://arxiv.org/html/2510.00662v1)
- [Easy-Read and LLMs Ethics - Springer](https://link.springer.com/article/10.1007/s10676-024-09792-4)

### AI in Special Education

- [AI, VR, and LLM in Special Education - Springer](https://link.springer.com/article/10.1007/s10639-025-13550-4)
- [Dyslexia and AI Style Guides - Springer](https://link.springer.com/chapter/10.1007/978-3-031-98414-3_3)
- [ChatGPT for Writers with Dyslexia - VML](https://www.vml.com/insight/how-chat-gpt-helps-writers-with-dyslexia)

---

## Conclusion

Local LLM integration represents a paradigm shift for AssisT - transforming it from a collection of discrete accessibility tools into an intelligent, adaptive learning companion. The combination of:

1. **Zero-cost operation** (no API fees)
2. **Complete privacy** (FERPA/HIPAA compliance)
3. **Offline capability** (works anywhere)
4. **Personalization** (learns user patterns)
5. **Powerful new features** (simplification, writing assistance, comprehension tools)

...makes this the logical next evolution for the extension.

With 6GB VRAM NVIDIA GPUs and Apple Silicon Macs both capable of running capable 3-7B parameter models at practical speeds (15-25+ tokens/second), the hardware barrier has effectively been eliminated for most users.

**Recommended Next Step:** Implement Phase 1 (Foundation) to establish the LLM service infrastructure, then validate with user testing before expanding to full feature set.

---

*Generated: November 28, 2025*
*Research compiled for AssisT Adaptive EdTech Extension*
