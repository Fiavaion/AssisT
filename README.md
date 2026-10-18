# AssisT — Adaptive Augmentative Tool for All Learners

**Version:** 1.0.0 | **License:** EUPL-1.2 | **Platform:** Chrome Extension (Manifest V3)

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/assist-adaptive-augmentat/dkekfjomoacmhbkekjkngmpbdlljjfhi)
[![WCAG 2.2 AA](https://img.shields.io/badge/WCAG-2.2%20AA-blue?style=for-the-badge)](https://www.w3.org/WAI/WCAG22/quickref/)
[![License: EUPL-1.2](https://img.shields.io/badge/License-EUPL--1.2-blue?style=for-the-badge)](https://opensource.org/licenses/EUPL-1.2)

---

## About

AssisT adds text-to-speech, speech-to-text, and AI-powered writing support directly into Canvas LMS, Moodle, and Google Classroom. Moodle matching covers `*.moodle.org` and `*.moodlecloud.com`; other self-hosted Moodle and LMS sites work through the optional all-sites mode, which you grant in the browser. It was built for students who didn't get early literacy support and arrive at third level already behind — and who can't access or afford the tools that exist.

It is free, non-commercial, and runs client-side. Nothing you select on a page is sent anywhere until you say yes: AssisT asks about each online service the first time it would be used, in setup or on first use, and remembers your answer.

Built by Mark Jones, a former assistive technology technician, as an independent project.

---

## Features

- **Text-to-Speech** with word-by-word synchronized highlighting
- **Speech-to-Text** with 60+ voice commands and neurodivergent profiles
- **AI Writing Coach** — summarization, simplification, assignment breakdown, Socratic tutor
- **Dyslexia-Optimized Reading** — Bionic Reading, Syllable Highlighting, Grammar Colours
- **OCR** — extract text from images and PDFs
- **Reading Mode** — distraction-free article view
- **Translation** — 35+ languages, no API key required
- **Citation Management** — Harvard, APA 7, MLA 9 and Chicago 17; import BibTeX, RIS and CSL-JSON files; export BibTeX, RIS, CSL-JSON, CSV, JSON and plain text
- **Annotations & Sticky Notes**
- **Screen Overlays** and True Dark Mode
- **Pomodoro Timer** for focus support
- **8 built-in profiles** — ADHD, Autism, Dyslexia, Anxiety, Sensory Sensitive, Night Study, Motor Impairment and Low Vision
- **Customizable keyboard shortcuts** — 18 page shortcuts plus 12 in the mind map editor
- **Local AI** via Ollama or WebLLM (in-browser, no cloud required)

---

## Installation (users)

Install directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/assist-adaptive-augmentat/dkekfjomoacmhbkekjkngmpbdlljjfhi). No account or configuration required.

---

## Development Setup

**Prerequisites:** Node.js 20.19+ or 22.12+ (required by Vite 7), Google Chrome, Git

```bash
git clone https://github.com/Fiavaion/AssisT.git
cd AssisT
npm install
npm run build
```

Then open `chrome://extensions/`, enable Developer mode, click Load unpacked, and select the `.vite` folder.

After any code change, run `npm run build` and reload the extension in Chrome.

The first build downloads the WebLLM model libraries (about 45 MB) from a pinned commit of
`mlc-ai/binary-mlc-llm-libs`, checks each against its SHA-256 in `src/ai/webllm-model-libs.js`, and
keeps them in `.cache/webllm-libs/`; later builds need no network.

---

## Running Tests

```bash
# Unit tests
npm test

# Unit tests with coverage
npm run test:coverage

# E2E tests
npm run test:e2e
```

---

## Contributing

Contributions are welcome. Please use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages.

Allowed scopes: `tts`, `stt`, `dyslexia`, `ui`, `popup`, `content`, `canvas`, `moodle`, `classroom`, `profiles`, `focus`, `guide`, `overlay`, `accessibility`, `test`, `ci`, `docs`, `build`, `deps`

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## Privacy & Security

- Nothing you select leaves your device until you allow it. AssisT asks, one service at a time, in first-run setup or the first time a feature needs it, and remembers your answer. Change any answer later in the popup, under Advanced Options > Your data.
- The services AssisT can reach, and what each receives: Free Dictionary API (the word or phrase you look up), MyMemory (the text you translate, or with Translate Page, all the visible text of the page, which can include names on it), and Crossref (a DOI). Read from Images reads English with nothing sent; for another language it downloads that language's file from jsDelivr once, after asking, and sends no image or text. Dictation uses Chrome's speech recognition, which sends your voice to Google while it listens. Lecture capture uses the same service and is asked about separately, because it sends everything the microphone hears, other people's voices included. Read-aloud uses a voice on your device by default. If you pick an online voice (the voice picker labels them), the text being read is sent to Google or Microsoft. Semantic Scholar receives up to 120 characters of a citation title, only if you turn on online citation checking. A cloud AI provider you choose and save a key for (Anthropic, OpenAI, Google Gemini, or Perplexity) receives the text you ask it about.
- Local AI (Ollama) and in-browser AI (WebLLM) never send your text off the device. WebLLM downloads a model's weights from Hugging Face once; the code that runs the model is part of AssisT.
- No name, account, email, or usage data is ever sent, and there is no analytics.
- Saved AI keys are encrypted on your device. That stops casual inspection, not someone who can read the browser storage on that computer, so on a shared computer remove them under Your data when you finish. A settings export never includes keys or your consent answers.
- Full detail: [Privacy Policy](public/privacy-policy.html).
- See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## Licence

[European Union Public Licence v1.2 (EUPL-1.2)](LICENSE)

---

## Acknowledgements

- [OpenDyslexic](https://opendyslexic.org/) — font for dyslexic readers
- [compromise.js](https://compromisejs.com/) — NLP library
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) — browser TTS/STT
- [Ollama](https://ollama.com/) — local AI runtime
- [Vite](https://vitejs.dev/) + [@crxjs/vite-plugin](https://crxjs.dev/) — build tooling
