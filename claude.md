The CLAUDE.md file defines the project's standards, workflow, and critical constraints, ensuring that the AI assistant maintains consistency and adheres to all security and versioning best practices.[27, 28, 7, 29]

📋 Project Configuration - AssisT Adaptive EdTech Extension
🚨 CRITICAL RULES (Mandatory Constraints)

**⚠️ ABSOLUTE RULE #0: THIS FILE IS ALWAYS THE TRUTH**
CLAUDE.md is ALWAYS the absolute source of truth. Even when contradicted by config files, source code, conversation summaries, or any other source - CLAUDE.md wins. No exceptions. If confused or unsure, ASK THE USER TO CONFIRM before proceeding. Never assume. Never guess. Never trust other sources over this file.

ACCESSIBILITY FIRST: All generated code and documentation MUST comply with WCAG 2.2 Level AA and actively incorporate WAI-Adapt semantics (Symbols, Tools, Help). Primary focus criteria are SC 1.4.12 (Text Spacing), SC 3.3.8 (Accessible Auth), and SC 3.2.6 (Consistent Help).

ARCHITECTURE: The solution is a Chrome Extension operating within an Isolated World for DOM injection into Canvas VLE pages. AVOID global JS conflicts.[13]

VERSIONING STANDARD: ALL commits MUST adhere strictly to the Conventional Commits specification. Use the provided automated push script (push alias) for all commits.[30, 31]

TEST-DRIVEN DEVELOPMENT (TDD): ALWAYS write tests based on expected input/output pairs before writing implementation code.[27] Ensure tests fail initially, then write the minimum code required to pass the tests.

RATIONALE DOCUMENTATION: All significant architectural, feature, or design choices MUST be logged immediately in the @projectmemory.md file before coding begins. Use the standard Decision Log format defined in that file.[24, 32]

SECURITY & PRIVACY (FERPA/HIPAA): AVOID requesting excessive permissions in manifest.json. All data storage (storage API) and external API interactions (TTS/STT cloud) must adhere to the principle of least privilege and FERPA compliance.[21, 10]

🎯 PROJECT CONTEXT
Project Goal: To deliver a stable, client-side TTS/STT personalization layer for neurodivergent students using the Canvas VLE.

Technology Stack: Modern JavaScript (ES6+), Chrome Extension API (Manifest V3), WAI-Adapt standards.

Target VLE: Canvas LMS (All domains matching _://_.instructure.com/\* or institutional specific URLs).

Core Feature Focus: TTS with Synchronized Highlighting (Reading) and Multimodal FixOver Correction (Writing).

🔧 DEVELOPMENT PATTERNS
Code Style: Adhere to project ESLint and Prettier configurations (assume default setup).

File Organization: Separate UI logic (popup.js), content injection (content.js), and background services (background.js).

**🚨 CRITICAL: File Location & Build System Rules**

- **ALWAYS edit source files in:** `src/` directory ONLY
- **NEVER edit files in:** `.vite/` directory (Vite build output - auto-generated)
- **Chrome loads extension from:** `.vite/` directory (this is the OUTPUT directory)
- **Build system:** Vite with @crxjs/vite-plugin (Manifest V3 support)
- **Build process:** Run `npm run build` to bundle `src/` → `.vite/`
- **Build output location:** `.vite/` directory contains the final bundled extension
- **Before testing:** Always run `npm run build`, then reload extension in Chrome
- **Validation rule:** If file path contains ".vite/", STOP and redirect to source file in `src/`
- **Key detail:** Vite bundles JavaScript files with hashed names (e.g., `popup.html-0dTtY8E-.js`) into `.vite/assets/`

Commit Workflow: Confirm the type (e.g., feat(tts), fix(ui), refactor(dom)) and scope before committing.[33]

DOM Interaction: Limit DOM manipulation to the content.js script. Use PostMessage for secure communication between isolated worlds.

Testing Strategy: Unit tests for utility functions. End-to-end (E2E) tests for core features (TTS activation, STT input) using a controlled Canvas testing environment.

🧠 MEMORY MANAGEMENT
Knowledge Persistence: The @projectmemory.md file is the definitive source for design rationale and history. Consult this file before proposing major changes.

Tooling Context: Reference files (if needed, generate @general_index.md and @detailed_index.md for large codebases) should be managed by the developer.[34, 35]

🐛 DEBUGGING PROTOCOL (CRITICAL - AI ASSISTANT BEHAVIOR)
**MANDATORY READING:** `TEMPLATE_DEBUGGING_PROTOCOL.md`, `LESSONS_UI_EVENT_HANDLING.md`, and `LESSONS_CLAUDE_MD_AUTHORITY.md`

**⚠️ CRITICAL REMINDER:** CLAUDE.md is the AUTHORITATIVE source of truth. When config files (vite.config.js, package.json, etc.) contradict CLAUDE.md, FIX THE CONFIG to match CLAUDE.md. Never trust discovered state over documented requirements. If the user says "we've been through this before" - STOP and re-read CLAUDE.md.

**The 5-Minute Rule:**

- If a bug cannot be diagnosed in 5 minutes, change strategy immediately
- DO NOT spend time reading large amounts of code before testing hypotheses
- ADD debug logging FIRST, analyze output SECOND

**Proactive Debugging Stance:**
When encountering ANY bug (UI, logic, integration, build):

1. **IMMEDIATE ACTION (0-60 seconds):**
   - Add `console.log()` at suspected failure points
   - Add `alert()` if logs don't appear (forces visibility)
   - Rebuild and test hypothesis

2. **NUCLEAR OPTIONS (60-120 seconds):**
   - If normal approach fails, use aggressive tactics:
     - Inline event handlers (`setAttribute('onclick', ...)`)
     - Hardcoded test data (`return { success: true }`)
     - Debugger breakpoints (`debugger;` statements)
   - These are VALID approaches when stuck

3. **VERIFICATION (120-180 seconds):**
   - Create minimal isolated test case
   - Test in clean environment (new HTML file, no dependencies)
   - Verify external factors (build system, caching, browser extensions)

4. **ESCALATION (180+ seconds):**
   - If still not resolved, problem is likely NOT what you think
   - Check: Module loading, build output, environment config
   - Document findings and ask user for additional context

**AI Assistant Rules:**

- ✅ BE AGGRESSIVE: Try nuclear options early, don't hesitate
- ✅ LOG EVERYTHING: Add debug statements liberally
- ✅ TEST FAST: Small iterations, quick rebuilds
- ✅ FAIL FAST: If approach isn't working in 2 minutes, pivot
- ❌ DON'T: Spend 10+ minutes reading code before testing
- ❌ DON'T: Assume the problem - verify with logs
- ❌ DON'T: Fear "breaking things" during debug (that's the point)

**Event Handling Bugs (UI appears but doesn't respond):**

- FIRST ACTION: Change `onclick` to `onmousedown` + `e.preventDefault()` + `e.stopPropagation()`
- SECOND ACTION: Add logging to ALL event listeners in the chain
- THIRD ACTION: Check CSS (`pointer-events`, `z-index`) and DOM structure
- See `LESSONS_UI_EVENT_HANDLING.md` for full playbook

**🚨 MANDATORY: Event Handler Standard**

ALL interactive UI elements (buttons, clickable divs, controls) MUST use the shared utility from `src/utils/event-handlers.js`:

```javascript
import { attachInteractiveHandler } from '../utils/event-handlers.js';

// Basic usage
attachInteractiveHandler(button, 'Button Label', () => {
  // Handler logic
});

// With cleanup
const cleanup = attachInteractiveHandler(element, 'Close Button', handleClose);
// Later: cleanup();

// Batch handlers
import { attachHandlerBatch } from '../utils/event-handlers.js';
attachHandlerBatch([
  { element: playBtn, label: 'Play', handler: play },
  { element: pauseBtn, label: 'Pause', handler: pause },
]);

// With keyboard support (for accessibility)
import { attachAccessibleHandler } from '../utils/event-handlers.js';
attachAccessibleHandler(button, 'Submit', submitForm);
```

**❌ NEVER use these patterns:**

- `element.addEventListener('click', handler)`
- `element.onclick = handler` (without preventDefault/stopPropagation)
- Inline onclick attributes (except during debugging)

**✅ ALWAYS use:**

- `attachInteractiveHandler()` or variants from `src/utils/event-handlers.js`
- Provides automatic race condition prevention
- Built-in visual feedback for accessibility
- Error handling and debug logging
- Cleanup function for proper teardown

**Why this matters:**
Document-level mousedown listeners can hide UI elements before button click handlers execute, causing buttons to appear broken. Using mousedown with stopPropagation() prevents this race condition.

**See:**

- `src/utils/event-handlers.js` - Utility implementation
- `LESSONS_UI_EVENT_HANDLING.md` - Full technical explanation
- `src/popup/popup.js` - Reference implementation (lines 641-665)

---

🧠 OPUS 4.5 ENHANCED CAPABILITIES

**Model-Specific Optimizations**: When running with Claude Opus 4.5, the following constraints are relaxed to leverage enhanced reasoning capabilities.

### Multi-File Changes (Relaxed from ONE-CHANGE-AT-A-TIME)

The original protocol required modifying only ONE file at a time. With Opus 4.5:

- **ALLOWED**: Modify 2-3 related files in a single logical change
  - Example: New module + its integration point + its test file
  - Example: Rename function across up to 5 files
  - Example: Extract code to new file + update imports
- **STILL REQUIRED**: Run `npm run build` after each logical change
- **STILL REQUIRED**: Test in Chrome after build
- **STILL FORBIDDEN**: Large architectural refactors without user approval
- **STILL FORBIDDEN**: Changing more than 5 files simultaneously

### Debugging Protocol (Relaxed from 5-Minute Rule)

The original protocol required switching strategies after 5 minutes. With Opus 4.5:

- **Extended to 10-minute rule** for complex bugs
- **ALLOWED**: Read and reason about code before adding debug logging (60-120 seconds)
- **ALLOWED**: Form hypothesis through code analysis, then verify with targeted logging
- **STILL REQUIRED**: If 10 minutes pass without progress, escalate or pivot
- **STILL REQUIRED**: Document findings for user context

### Sub-Agent Task Prompts (Simplified)

Sub-agent prompts can be more concise with Opus 4.5:

- **Focus on WHAT** to build, trust model to determine HOW
- **Remove** explicit line count estimates (artificial constraint)
- **Remove** detailed CSS specifications (follow existing patterns)
- **Remove** explicit function signatures (let model determine optimal design)
- **Keep** integration points, file locations, and accessibility requirements

### Refactoring Capabilities

With Opus 4.5's enhanced reasoning:

- **ALLOWED**: Use `/refactor` command for coordinated multi-file changes
- **ALLOWED**: Extract modules with confidence in dependency tracking
- **STILL REQUIRED**: Create safety net (git stash or branch) before refactoring
- **STILL REQUIRED**: Verify tests pass before and after refactoring

### When to Fall Back to Conservative Mode

Use the original strict constraints when:

- Working on critical/production code paths
- Debugging issues that have already consumed significant time
- Making changes requested by user that seem risky
- Unsure about the impact of changes

---

🚀 Automated Versioning and Rollback Setup
To facilitate automatic progress versioning and reliable rollback capability, use the following steps to set up the push alias:

### 1. Create the Push Script (push.sh)

Create a file named push.sh in the root of the repository and populate it with the following Bash script. This script automatically stages all changes, requires a Conventional Commit message, executes a git pull --rebase to ensure a linear, clean history, and finally pushes the changes.[36, 1]

```bash
#!/bin/bash

# --- Automated Conventional Commit & Push Script ---
echo "--- Starting Automated Commit & Push Process ---"

# 1. Stage all changes (equivalent to git add .)
git add .
echo "Staged all changes for commit."

# 2. Prompt for the Conventional Commit message
# Format required: <type>[optional scope]: <description> (e.g., feat(ui): add new settings toggle)
read -p "Enter Conventional Commit message: " commit_message

# Check if commit message is empty
if [ -z "$commit_message" ]; then
  echo "Commit message cannot be empty. Aborting commit."
  exit 1
fi

# 3. Commit the staged changes
git commit -m "$commit_message"

# Check if the commit was successful
if [ $? -ne 0 ]; then
  echo "Commit failed or no changes to commit. Aborting push."
  exit 1
fi

# 4. Determine the current branch name
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# 5. Pull (Rebase) to maintain linear history for safer rollbacks
echo "Pulling latest changes from origin/$BRANCH with rebase..."
git pull --rebase origin "$BRANCH"

if [ $? -ne 0 ]; then
  echo "Rebase/Pull failed. Please resolve conflicts manually before re-running."
  echo "Use 'git rebase --abort' or 'git rebase --continue' as appropriate."
  exit 1
fi

# 6. Push the committed changes
echo "Pushing changes to origin/$BRANCH..."
git push origin "$BRANCH"

if [ $? -eq 0 ]; then
  echo "SUCCESS: Commit '$commit_message' pushed to $BRANCH."
else
  echo "ERROR: Push failed. Check connectivity or remote repository status."
fi
```

### 2. Grant Execution Permissions

Make the script executable:

```bash
chmod +x push.sh
```

### 3. Create the push Alias

Add the following line to your shell configuration file (e.g., ~/.bashrc, ~/.zshrc, or equivalent) to enable the single-command workflow:

```bash
alias push='~/path/to/your/repo/push.sh'
# NOTE: Replace '~/path/to/your/repo/' with the actual path to the push.sh file.
```

Once the alias is active (after restarting your shell or sourcing the configuration file), developers will use the command push after completing any coding step. This process ensures every code change is an atomic commit with descriptive versioning, enabling easy rollback to previous stable versions if required.
