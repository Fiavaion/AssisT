# AssisT — Adaptive Augmentative Tool for All Learners

**Version:** 0.9.3 | **License:** EUPL-1.2 | **Platform:** Chrome Extension (Manifest V3)

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/assist-adaptive-augmentat/dkekfjomoacmhbkekjkngmpbdlljjfhi)
[![WCAG 2.2 AA](https://img.shields.io/badge/WCAG-2.2%20AA-blue?style=for-the-badge)](https://www.w3.org/WAI/WCAG22/quickref/)
[![License: EUPL-1.2](https://img.shields.io/badge/License-EUPL--1.2-blue?style=for-the-badge)](https://opensource.org/licenses/EUPL-1.2)

---

## About

AssisT adds text-to-speech, speech-to-text, and AI-powered writing support directly into Canvas LMS, Moodle, and Google Classroom. It was built for students who didn't get early literacy support and arrive at third level already behind — and who can't access or afford the tools that exist.

It is free, non-commercial, and runs locally by default. No data leaves the browser unless the user opts into a cloud AI provider.

Built by a Digital Technical Officer and former assistive technology technician at NCAD, Dublin.

---

## Features

- **Text-to-Speech** with word-by-word synchronized highlighting
- **Speech-to-Text** with 60+ voice commands and neurodivergent profiles
- **AI Writing Coach** — summarization, simplification, assignment breakdown, Socratic tutor
- **Dyslexia-Optimized Reading** — Bionic Reading, Syllable Highlighting, Grammar Colors
- **OCR** — extract text from images and PDFs
- **Reading Mode** — distraction-free article view
- **Translation** — 35+ languages, no API key required
- **Citation Management** — Harvard formatting, BibTeX/RIS export
- **Annotations & Sticky Notes**
- **Screen Overlays** and True Dark Mode
- **Pomodoro Timer** for focus support
- **9 Neurodivergent Profiles** — ADHD, Autism, Dyslexia, Anxiety, and more
- **14 customizable keyboard shortcuts**
- **Local AI** via Ollama or WebLLM (in-browser, no cloud required)

---

## Installation (users)

Install directly from the [Chrome Web Store](https://chromewebstore.google.com/detail/assist-adaptive-augmentat/dkekfjomoacmhbkekjkngmpbdlljjfhi). No account or configuration required.

---

## Development Setup

**Prerequisites:** Node.js v18+, Google Chrome, Git

```bash
git clone https://github.com/Fiavaion/AssisT.git
cd AssisT
npm install
npm run build
```

Then open `chrome://extensions/`, enable Developer mode, click Load unpacked, and select the `.vite` folder.

After any code change, run `npm run build` and reload the extension in Chrome.

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

- All processing is local by default
- No user data is collected or transmitted without explicit user action
- Cloud AI features require the user to supply their own API key
- See [SECURITY.md](SECURITY.md) for vulnerability reporting

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
