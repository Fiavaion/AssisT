# Security Policy

## Supported versions

AssisT is an actively developed Chrome extension. Security fixes are provided for the current minor version only. Users on older versions are expected to update via the Chrome Web Store auto-update channel.

| Version         | Supported |
| --------------- | --------- |
| 0.1.x (current) | Yes       |
| < 0.1.0         | No        |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report security issues privately to `security@fiavaion.com`. Include:

- A description of the issue and why it is a security concern.
- Reproduction steps or proof-of-concept code.
- The AssisT version (Popup → About).
- The browser, operating system, and any relevant extension configuration (for example, which AI mode was enabled).
- Whether the issue affects the extension itself, a dependency, or a specific integration (Canvas, Moodle, Google Classroom).

### What to expect

- Acknowledgement within **3 working days**.
- An initial triage assessment within **10 working days**, classifying severity and outlining a remediation plan.
- Ongoing status updates at reasonable intervals until resolution.
- Credit in the release notes for the fix, if you wish (and you may remain anonymous if you prefer).

### Scope

In scope:

- Vulnerabilities in AssisT's own source code (`src/`).
- Issues in the extension's build and distribution (manifest misconfiguration, excessive permissions, content-script injection flaws, insecure storage).
- Cryptographic issues in the secure key storage (`src/core/storage/secure-key-storage.js`).
- Privacy leaks: any flow that sends user-identifiable data off-device without explicit consent.

Out of scope:

- Vulnerabilities in third-party services the user explicitly opts into (Anthropic, OpenAI, Google Gemini, Perplexity cloud APIs). Report those to the provider.
- Vulnerabilities in host pages (Canvas, Moodle, Google Classroom). Report to the LMS vendor.
- Attacks that require the user to install malicious extensions, disable Chrome protections, or grant elevated browser permissions.
- Social-engineering attacks, phishing, or attacks that depend on compromised user devices.

## Privacy and data handling

AssisT is architected for **local-first, zero-transmission operation where possible**. See the product [privacy policy](https://fiavaion.com/products/assist/privacy) and the [VPAT](docs/quality/VPAT-2.5-AssisT-v0.1.2.md) for the published privacy posture. Brief summary:

- **Ollama, WebLLM, and Chrome Prompt API** AI modes process all data on-device. No external transmission.
- **Cloud AI modes** (optional, user-enabled) transmit the prompt content you submit to the selected third-party provider. API keys are encrypted locally using AES-GCM-256 with PBKDF2 key derivation (100,000 iterations, OWASP-aligned).
- AssisT does not implement analytics, telemetry, crash reporting, or tracking of any kind. The only network requests are (a) the LMS host page you are viewing, and (b) whichever AI provider the user has explicitly selected.

If you observe AssisT transmitting data inconsistent with the above, treat it as a security issue and report it.

## Disclosure policy

We follow coordinated disclosure:

- Public disclosure happens **after** a fix ships in a Chrome Web Store release, or **90 days** after the initial report, whichever is earlier.
- If a vulnerability is actively exploited in the wild, we will accelerate disclosure with the reporter's agreement.
- Reporter credit is offered in the release notes and security advisories. Reporters may opt for anonymity.

## Encryption of this channel

If you prefer encrypted communication, email `security@fiavaion.com` and we will arrange a PGP key exchange or a Signal channel.
