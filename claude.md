The CLAUDE.md file defines the project's standards, workflow, and critical constraints, ensuring that the AI assistant maintains consistency and adheres to all security and versioning best practices.[27, 28, 7, 29]

📋 Project Configuration - AssisT Adaptive EdTech Extension
🚨 CRITICAL RULES (Mandatory Constraints)
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
