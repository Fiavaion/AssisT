# AssisT Extension - AI Prompts Reference

This document contains all AI prompts used across the extension's features. These prompts are sent to either local AI models (via Ollama) or cloud AI models (via Anthropic Claude API).

---

## 1. Summarization Feature

**File:** `src/features/summarization/summarization.js`

### Brief Summary Prompt

```
Summarize in 1-2 sentences, capturing only the main point:

[TEXT]

Summary:
```

### Moderate Summary Prompt

```
Summarize the key points in a short paragraph (3-4 sentences):

[TEXT]

Summary:
```

### Detailed Summary Prompt

```
Provide a comprehensive summary with main points and supporting details (5-7 sentences):

[TEXT]

Summary:
```

**Parameters:**

- Max tokens: 150 (brief), 300 (moderate), 500 (detailed)
- Temperature: 0.5

---

## 2. Assignment Breakdown Feature

**File:** `src/features/assignmentBreakdown/assignmentBreakdown.js`

### Task Breakdown Prompt

```
TASK: Break down assignment into actionable steps. Return ONLY valid JSON.

ASSIGNMENT:
[TEXT]

OUTPUT FORMAT (strict JSON, no markdown, no explanation before/after):
{
  "title": "max 10 words",
  "summary": "max 20 words",
  "tasks": [
    {"step": 1, "task": "max 15 words", "timeEstimate": "e.g. 30 min", "tips": "max 15 words"}
  ],
  "keyRequirements": ["max 3 items, 5 words each"],
  "deadline": "date or null",
  "wordCount": "number or null",
  "overallTips": "max 20 words"
}

RULES:
- Exactly 3-5 tasks (no more)
- Keep all text SHORT and simple
- No markdown code blocks
- Start response with { end with }
```

**Parameters:**

- Max tokens: 600 (Haiku), 800 (local/Sonnet), 1200 (Opus)
- Temperature: 0.2
- Model preference: Haiku 4.5 (fast, structured)

---

## 3. Text Simplification Feature

**File:** `src/features/textSimplification/textSimplification.js`

### LOCAL MODEL PROMPTS (Streamlined, No CoT)

#### Basic Level (Local)

```
Simplify this text for people with reading difficulties. Use very simple words and short sentences.

EXAMPLE:
Input: "Cognitive dissonance occurs when beliefs contradict actions."
Output: "We feel bad when what we think and what we do don't match."

TEXT: [TEXT]

SIMPLIFIED:
```

#### Moderate Level (Local)

```
Simplify this academic text. Keep important terms but add definitions in parentheses.

EXAMPLE:
Input: "The phenomenological approach emphasizes lived experience."
Output: "The phenomenological approach (studying direct personal experience) focuses on what people actually experience."

TEXT: [TEXT]

SIMPLIFIED:
```

#### Academic Level (Local)

```
Improve readability while keeping academic vocabulary. Add brief definitions in parentheses for difficult terms.

EXAMPLE:
Input: "The chiasmic intertwining constitutes a pre-reflective stratum."
Output: "The chiasmic intertwining (reciprocal entanglement) creates a pre-reflective layer. This foundational layer exists before conscious thought."

TEXT: [TEXT]

IMPROVED:
```

### CLOUD MODEL PROMPTS (With Chain-of-Thought)

#### Basic Level (Cloud)

```
You are a reading accessibility expert. Simplify text for people with severe reading difficulties.

EXAMPLE 1:
Input: "The implementation of sustainable practices necessitates comprehensive stakeholder engagement."
Output: "We need to work with everyone to be more green. (= better for the planet)"

EXAMPLE 2:
Input: "Cognitive dissonance occurs when beliefs contradict actions."
Output: "We feel bad when what we think and what we do don't match."

RULES:
- Use very simple, common words only
- Write short sentences (max 10 words each)
- Break into small paragraphs
- Replace any hard words with easy ones
- If there's a technical term, add "(= simple explanation)" after it
- Keep the main meaning but make it VERY easy to read

TEXT TO SIMPLIFY:
[TEXT]

SIMPLIFIED VERSION (very simple English):
```

#### Moderate Level (Cloud)

```
You are an educational accessibility specialist. Simplify academic text while keeping important terms with definitions.

EXAMPLE 1:
Input: "The phenomenological approach emphasizes lived experience over theoretical abstraction."
Output: "The phenomenological approach (studying direct personal experience) focuses on what people actually experience, rather than abstract theories."

EXAMPLE 2:
Input: "Epistemological frameworks shape our understanding of knowledge acquisition."
Output: "Epistemological frameworks (theories about how we know things) shape how we understand learning and gaining knowledge."

RULES:
- Use clear, straightforward language
- Keep sentences to 15-20 words maximum
- Break long paragraphs into shorter ones
- Keep academic terms but add brief definitions in parentheses
- Maintain the educational content but improve readability
- Restructure complex sentences, don't just swap words
- Output ONLY the simplified text, nothing else

TEXT TO SIMPLIFY:
[TEXT]

SIMPLIFIED VERSION:
```

#### Academic Level (Cloud)

```
You are an academic writing specialist. Improve readability while preserving scholarly tone and vocabulary.

EXAMPLE 1:
Input: "The chiasmic intertwining of perceiver and perceived constitutes a pre-reflective stratum of meaning-making."
Output: "The chiasmic intertwining (reciprocal entanglement) of perceiver and perceived creates a pre-reflective layer of meaning-making. This foundational layer exists before conscious thought shapes our understanding."

EXAMPLE 2:
Input: "Ontological reframing proves particularly generative when applied to post-conceptualist frameworks."
Output: "This ontological reframing (reconceptualising what something fundamentally is) proves particularly productive when applied to post-conceptualist frameworks. It allows us to see art beyond traditional categories."

RULES:
- Keep academic vocabulary - students need to learn these terms
- Add brief definitions in parentheses for difficult terms
- Break complex sentences into clearer structures
- Maintain the scholarly depth and tone
- Restructure syntax while preserving meaning
- DO NOT just replace words with synonyms - transform the structure
- Output ONLY the simplified text, nothing else

TEXT TO SIMPLIFY:
[TEXT]

IMPROVED VERSION:
```

### Two-Stage Processing (Complex Texts - Local Models Only)

#### Stage 1: Extract Difficult Terms

```
List the 5 most difficult academic terms in this text. Just list the terms, one per line, nothing else.

TEXT: [FIRST 500 CHARS OF TEXT]

DIFFICULT TERMS:
```

#### Stage 2: Simplify with Term Awareness

```
Simplify this academic text. Keep the academic terms but add brief definitions in parentheses.

KEY TERMS TO DEFINE: [EXTRACTED_TERMS]

EXAMPLE:
Input: "The phenomenological approach emphasizes lived experience."
Output: "The phenomenological approach (studying direct personal experience) focuses on what people actually experience."

TEXT TO SIMPLIFY:
[TEXT]

SIMPLIFIED VERSION:
```

**Parameters:**

- Max tokens: 400 (basic), 600 (moderate), 800 (academic)
- Temperature: 0.3
- Model preference: Sonnet 4.5 (highest benchmark score: 9.6/10)
- Complexity detection threshold: 0.6 (triggers two-stage processing)

---

## 4. Socratic Tutor Feature

**File:** `src/features/socraticTutor/socraticTutor.js`

### Socratic Questions Prompt

```
TASK: Generate [N] Socratic questions. Return ONLY valid JSON.

TEXT: "[TEXT]"

OUTPUT FORMAT (no markdown, no explanation):
{"topic":"5 words max","questions":[{"type":"comprehension|analysis|synthesis|evaluation","question":"max 15 words","hint":"max 10 words","followUp":"max 12 words"}],"thinkingPrompt":"max 15 words"}

RULES:
- Exactly [N] questions
- Keep all text SHORT
- Simple student-friendly language
- Start with { end with }
```

**Parameters:**

- Max tokens: 600 (Haiku), 800 (local/Sonnet), 1100 (Opus)
- Temperature: 0.5
- Question count: 4 (configurable, capped at 4)
- Model preference: Opus 4.5 (best for pedagogical dialogue, 8.8/10)

---

## Feature Testing Notes

### Testing on test-page.html

The `test-page.html` file contains art and design academic content suitable for testing:

1. **Summarization**: Test on the long paragraphs about Gestalt principles, color theory, or typography
2. **Assignment Breakdown**: Test on Assignment 4.1 (8-step multi-modal project) or Assignment 4.2 (design system)
3. **Text Simplification**: Test on dense theoretical paragraphs (phenomenology, Dieter Rams case study, grid systems)
4. **Socratic Tutor**: Test on any conceptual section (ethics of persuasive design, visual hierarchy, etc.)

---

## Model Configuration

### Available Models

**Local Models** (via Ollama):

- Configurable in settings
- Benchmark tested: Mistral:7b, LLaMA 3.2:3b, Gemma3:4b

**Cloud Models** (via Anthropic Claude API):

- `claude-haiku-4-5-20251101` (Haiku 4.5) - Fast, concise
- `claude-sonnet-4-5-20250929` (Sonnet 4.5) - Balanced
- `claude-opus-4-5-20251101` (Opus 4.5) - Detailed, best reasoning

### Benchmark-Optimized Defaults (Academic Benchmark Report Dec 2025)

| Feature              | Cloud Default       | Local Default         | Reasoning                                   |
| -------------------- | ------------------- | --------------------- | ------------------------------------------- |
| Summarization        | Opus 4.5 (7.0/10)   | Mistral:7b (7.4/10)   | Only cloud model to pass ND-Ready threshold |
| Assignment Breakdown | Haiku 4.5 (8.8/10)  | LLaMA 3.2:3b (7.9/10) | Fast & structured output                    |
| Text Simplification  | Sonnet 4.5 (9.6/10) | Mistral:7b (8.4/10)   | Highest single benchmark score              |
| Socratic Tutor       | Opus 4.5 (8.8/10)   | Gemma3:4b (8.8/10)    | Best pedagogical dialogue                   |

---

## Prompt Engineering Notes

### Why Different Prompts for Local vs Cloud?

**Local Models (< 10B parameters):**

- Benefit from direct, streamlined prompts
- Chain-of-Thought (CoT) doesn't improve performance significantly
- Focus on simple examples and clear structure
- Keep prompts under 200 tokens when possible

**Cloud Models (50B+ parameters):**

- Benefit from Chain-of-Thought reasoning
- Can handle more complex instructions
- Better at following multi-step rules
- More reliable JSON generation

**Source:** [Prompt Engineering Guide - CoT Techniques](https://www.promptingguide.ai/techniques/cot)

### JSON Generation Best Practices

1. **Explicit Format**: Show exact JSON structure with example values
2. **No Markdown**: Explicitly forbid markdown code blocks (```json)
3. **Truncation Handling**: Limit input text length to avoid incomplete responses
4. **Cleanup Logic**: Strip markdown, extract JSON between first { and last }
5. **Validation**: Check for required fields before using response
6. **Fallback**: Always have a rule-based fallback for failed generation

---

## Error Handling & Fallbacks

All features implement graceful degradation:

1. **API Key Missing (Cloud Mode)**: Show warning dialog with option to switch to local
2. **LLM Unavailable (Local Mode)**: Fall back to rule-based algorithms
3. **JSON Parse Failed**: Use fallback structure or extractive methods
4. **Network Timeout**: Retry with exponential backoff (max 3 attempts)
5. **Token Limit Exceeded**: Truncate input text to safe limits

---

## Usage Statistics Tracking

All AI features log usage for analytics:

- Feature name
- Model used (local/cloud)
- Success/failure status
- Response time
- Token count (cloud only)

Access via: Extension Popup → Advanced Options → AI tab → Usage Statistics

---

## Privacy & Security

- **Local Mode**: All processing happens on user's machine via Ollama (localhost:11434)
- **Cloud Mode**: Text sent to Anthropic Claude API (HTTPS encrypted)
- **Storage**: Only feature settings stored locally, no prompt/response history
- **API Keys**: Stored in Chrome's local storage (per-extension isolation)

---

## Future Enhancements

Planned prompt improvements:

- [ ] Few-shot learning for assignment types (essay, lab report, design brief)
- [ ] Context-aware simplification (preserve domain terminology)
- [ ] Multi-turn Socratic dialogue (follow-up questions based on student responses)
- [ ] Adaptive difficulty (adjust based on user's cognitive profile)
