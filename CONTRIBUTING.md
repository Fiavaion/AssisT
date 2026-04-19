# Contributing to AssisT

Thanks for wanting to contribute to AssisT. AssisT is a free, open-source accessibility tool for neurodivergent learners — the kind of project where every small improvement reaches people who otherwise hit a wall. We welcome bug reports, feature ideas, accessibility feedback, translations, documentation fixes, and code.

AssisT is part of the [Fiavaion](https://fiavaion.com) portfolio of open-source tools built on a community-funded model.

## Ways to contribute

- **Report a bug** — open an issue with the steps to reproduce, the AssisT version (Popup → About), the browser, the operating system, and whether you were using assistive technology.
- **Report an accessibility issue** — email `accessibility@fiavaion.com` or open an issue with the "accessibility" label. Accessibility issues are triaged first.
- **Suggest a feature** — open a discussion or issue describing the user need, not just the feature. "A dyslexic student in a long-form essay module struggles with X" is more useful than "add Y button."
- **Write code** — pick an issue labelled `good first issue` or `help wanted`, or open an issue describing your intended change before starting work on anything larger.
- **Write documentation** — user guides, keyboard-shortcut references, migration notes for new LMS platforms.
- **Translate** — AssisT's UI is currently English-only; native-speaker reviews of the translation feature's prompt templates are especially valuable.

## Before you start

1. Read `CLAUDE.md` in the repository root — it documents the project's accessibility, security, and build constraints, all of which are non-negotiable.
2. Open an issue describing the change you plan to make, and wait for a short acknowledgement. This avoids effort on changes that conflict with in-flight work or the project direction.
3. Check that you are working against the `main` branch of the [current upstream repository](https://github.com/Fiavaion/AssisT).

## Development setup

```bash
git clone https://github.com/Fiavaion/AssisT.git
cd AssisT
npm install
npm run build
```

Load the `.vite/` output directory as an unpacked extension in Chrome (`chrome://extensions` → Developer Mode → Load Unpacked). See `CLAUDE.md` for the build rules — in particular, **never edit files inside `.vite/`**; edit source in `src/` and rebuild.

## Code standards

- **Accessibility first.** All interactive UI elements must use the shared event-handler utility at `src/utils/event-handlers.js` (`attachInteractiveHandler`, `attachAccessibleHandler`, `attachHandlerBatch`). Raw `addEventListener('click', …)` is not accepted. See `CLAUDE.md` and `LESSONS_UI_EVENT_HANDLING.md`.
- **WCAG 2.2 Level AA** is the compliance floor for any UI change. See `docs/quality/VPAT-2.5-AssisT-v0.1.2.md` for the current conformance statement.
- **Tests first where practical.** Unit tests in `tests/unit/` (Jest); end-to-end in `tests/e2e/` (Playwright). Run `npm test` before submitting.
- **Accessibility automation.** `npm run test:a11y` runs Pa11y against the popup. Your change should not regress this.
- **Conventional Commits.** Commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. Allowed scopes are defined in `commitlint.config.js` (includes `tts`, `stt`, `dyslexia`, `ui`, `popup`, `content`, `canvas`, `moodle`, `classroom`, `profiles`, `focus`, `guide`, `overlay`, `accessibility`, `test`, `ci`, `docs`, `build`, `deps`).
- **Lint and format.** `npm run lint` and `npm run format` are enforced via Husky pre-commit hooks.

## Pull-request process

1. Fork the repository and create a branch from `main`. Branch naming: `feat/short-description`, `fix/short-description`, `docs/short-description`.
2. Make the change. Add or update tests. Update documentation where behaviour changes.
3. Run `npm test`, `npm run lint`, `npm run test:a11y`.
4. Open a PR. Use the template prompts: what changed, why, how it was tested, accessibility impact.
5. A maintainer will review. Expect at least one review round — accessibility constraints are tight.

## Licensing of contributions

AssisT is licensed under the [European Union Public Licence v1.2 (EUPL-1.2)](LICENSE). By contributing, you agree that your contributions are licensed under EUPL-1.2 and that you have the right to submit them under those terms. We do not require a separate Contributor Licence Agreement (CLA) at this time; the implicit agreement from opening a pull request is sufficient.

If you contribute substantial code that you or your employer hold rights to, please confirm in the pull-request description that you have authority to licence it under EUPL-1.2.

## Code of conduct

All interaction in this project is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). Report concerns to `conduct@fiavaion.com`.

## Security issues

Do **not** report security issues via public issues or discussions. See [SECURITY.md](SECURITY.md) for the responsible-disclosure process.

## Questions

- General discussion: open a GitHub Discussion.
- Private questions: `hello@fiavaion.com`.
- Accessibility: `accessibility@fiavaion.com`.

Thank you for contributing to a more accessible web for neurodivergent learners.
