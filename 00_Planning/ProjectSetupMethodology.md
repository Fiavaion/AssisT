# Project Setup Methodology Guide

## Optimal AI-Assisted Development Workflow

**Version:** 1.0
**Date:** 2026-02-14
**Based on:** AssisT Extension Development (2025-2026)
**Purpose:** Template for starting new projects with AI assistance (Claude Code)

---

## Table of Contents

1. [Quick Start Checklist](#quick-start-checklist)
2. [Core Principles](#core-principles)
3. [Initial Project Structure](#initial-project-structure)
4. [The CLAUDE.md File](#the-claudemd-file)
5. [Planning Documents](#planning-documents)
6. [Slash Commands Reference](#slash-commands-reference)
7. [Task & Todo Management](#task--todo-management)
8. [Lessons Learned System](#lessons-learned-system)
9. [Version Control Workflow](#version-control-workflow)
10. [Debugging Protocol](#debugging-protocol)
11. [Project Phases](#project-phases)
12. [Best Practices](#best-practices)
13. [Common Pitfalls](#common-pitfalls)
14. [Templates](#templates)

---

## Quick Start Checklist

When starting a new project, complete these steps in order:

### Day 1: Foundation Setup

- [ ] **1. Create project repository**

  ```bash
  mkdir my-new-project
  cd my-new-project
  git init
  ```

- [ ] **2. Create CLAUDE.md file** (see [template](#claudemd-template))
  - Define project goals and constraints
  - Set coding standards and architecture rules
  - Document critical rules and workflows

- [ ] **3. Create planning folder**

  ```bash
  mkdir 00_Planning
  ```

- [ ] **4. Create docs/lessons folder**

  ```bash
  mkdir -p docs/lessons
  ```

- [ ] **5. Write initial planning document**
  - Create `00_Planning/ProjectOverview.md`
  - Define scope, timeline, success criteria

- [ ] **6. Set up version control workflow**
  - Create `.gitignore`
  - Configure commit message conventions
  - Set up automated push script (optional)

- [ ] **7. Start first development session**
  - Use `/start` command
  - Begin with feature planning, not coding

### Day 2: Development Infrastructure

- [ ] **8. Set up build system** (if applicable)
  - Configure bundler (Vite, Webpack, etc.)
  - Test build process

- [ ] **9. Create testing infrastructure**
  - Unit test framework
  - Integration test plan

- [ ] **10. Document initial architecture**
  - Create architecture diagram
  - Document key design decisions

---

## Core Principles

### 1. **Documentation-First Approach**

**Principle:** Write plans and documents BEFORE writing code.

**Why:** AI assistants work better with clear context. Planning documents prevent feature creep and maintain focus.

**Practice:**

```
Planning Document → User Approval → Implementation → Testing → Documentation Update
```

**Example from AssisT:**

- Created `NewFeaturesPlan.md` (8,500 lines) BEFORE implementing dysarthria features
- Result: Clear scope, no wasted effort, user could reject before coding began

### 2. **CLAUDE.md as Single Source of Truth**

**Principle:** All project rules, standards, and workflows live in CLAUDE.md.

**Why:** Prevents AI from "forgetting" project context across sessions. Overrides all other sources (code, config files, summaries).

**Critical Rule from AssisT:**

```markdown
⚠️ ABSOLUTE RULE #0: THIS FILE IS ALWAYS THE TRUTH
CLAUDE.md is ALWAYS the absolute source of truth. Even when contradicted
by config files, source code, conversation summaries, or any other source -
CLAUDE.md wins. No exceptions.
```

### 3. **Lessons-Driven Development**

**Principle:** Document every significant bug, challenge, or discovery in a lessons file.

**Why:** Future you (and AI) won't repeat mistakes. Lessons files become debugging playbooks.

**Practice:**

```
Bug Encountered → Debugging → Resolution → Lessons File Updated → CLAUDE.md Updated
```

**Example from AssisT:**

- `LESSONS_UI_EVENT_HANDLING.md` - Documented race condition between mousedown/click
- `LESSONS_CONTENT_SCRIPT_INJECTION.md` - Web accessible resources for Vite builds
- `LESSONS_CLAUDE_MD_AUTHORITY.md` - Config files contradicting CLAUDE.md

### 4. **Slash Commands for Workflow Automation**

**Principle:** Use project skills (`/start`, `/commit`, `/test`, `/review`) for consistency.

**Why:** Reduces cognitive load, ensures best practices are followed automatically.

**Example:**

```
/start → Creates session plan, sets up todos
/commit → Enforces conventional commits, adds co-author tag
/test → Runs full test suite with coverage
/review → Code quality check before merge
/end → Saves session summary, updates project memory
```

### 5. **Incremental Feature Development**

**Principle:** Build features in small, testable increments.

**Why:** Easier to debug, easier to rollback, maintains working state.

**Practice:**

```
Feature Slice 1 (30 min) → Test → Commit
Feature Slice 2 (30 min) → Test → Commit
Feature Slice 3 (30 min) → Test → Commit
```

**From AssisT CLAUDE.md:**

```markdown
ONE-CHANGE-AT-A-TIME: Modify only ONE file at a time. Run npm run build
and test in Chrome after EACH change. This prevents compounding errors
and makes debugging trivial.
```

---

## Initial Project Structure

### Recommended Folder Layout

```
my-project/
├── 00_Planning/                # Planning documents (sorted first)
│   ├── ProjectOverview.md      # Main project vision
│   ├── FeaturePlan_v1.md       # Feature roadmap
│   ├── ArchitectureDecisions.md # ADRs (Architecture Decision Records)
│   └── Roadmap.md              # Timeline and milestones
│
├── docs/                       # Technical documentation
│   ├── lessons/                # Lessons learned files
│   │   ├── TEMPLATE_LESSON.md  # Template for new lessons
│   │   ├── LESSONS_[TOPIC].md  # Specific lessons
│   │   └── README.md           # Lessons index
│   │
│   ├── planning/               # Task tracking (optional)
│   │   ├── CURRENT_STATUS.md   # Current sprint status
│   │   └── PHASE1_TASKS.md     # Phase-specific tasks
│   │
│   ├── API.md                  # API documentation
│   ├── ARCHITECTURE.md         # Architecture overview
│   └── CONTRIBUTING.md         # Contribution guidelines
│
├── src/                        # Source code
│   └── ...
│
├── tests/                      # Test files
│   └── ...
│
├── CLAUDE.md                   # ⭐ AI assistant instructions (CRITICAL!)
├── README.md                   # User-facing documentation
├── .gitignore                  # Git ignore rules
├── package.json                # Dependencies
└── ...
```

### Why `00_Planning/` Prefix?

- **Alphabetically first** in directory listings
- **Visually prominent** - hard to miss
- **Clear intent** - planning documents, not code
- **Easy to find** - new contributors know where to look

---

## The CLAUDE.md File

### Purpose

CLAUDE.md is the **AI assistant's instruction manual** for your project. It contains:

1. Critical rules and constraints
2. Architecture decisions and patterns
3. Coding standards and style guides
4. Build system requirements
5. Testing strategies
6. Debugging protocols
7. Commit message conventions

### Structure

```markdown
# Project Name - AI Assistant Instructions

## 🚨 CRITICAL RULES (Mandatory Constraints)

### RULE #0: THIS FILE IS ALWAYS THE TRUTH

[Always list this first - it's the most important rule]

### RULE #1: [Your most critical project constraint]

[e.g., ACCESSIBILITY FIRST, PRIVACY FIRST, TEST-DRIVEN, etc.]

### RULE #2: [Second most critical constraint]

## 🎯 PROJECT CONTEXT

- Goal: [One sentence project goal]
- Technology Stack: [List main technologies]
- Target Users: [Who uses this?]
- Core Features: [Top 3-5 features]

## 🔧 DEVELOPMENT PATTERNS

- Code Style: [ESLint, Prettier, etc.]
- File Organization: [How files are structured]
- Build System: [Build process and critical details]
- Testing Strategy: [How to test]

## 🧠 MEMORY MANAGEMENT

- Knowledge Persistence: [Where to find project history]
- Decision Log: [Where architecture decisions are recorded]

## 🐛 DEBUGGING PROTOCOL

- [Your debugging methodology]
- [Common issues and solutions]

## 🚀 COMMIT WORKFLOW

- [How to commit code]
- [Commit message format]

## 🧪 TESTING REQUIREMENTS

- [When to write tests]
- [How to run tests]
```

### CLAUDE.md Template

See [Templates Section](#claudemd-template) for full template.

---

## Planning Documents

### Types of Planning Documents

**1. Project Overview** (`00_Planning/ProjectOverview.md`)

- High-level vision
- Success criteria
- Stakeholders
- Timeline

**2. Feature Plans** (`00_Planning/FeaturePlan_[Name].md`)

- Detailed feature specifications
- Implementation steps
- Sub-agent orchestration (if using AI)
- Testing strategy

**3. Architecture Decision Records** (`00_Planning/ArchitectureDecisions.md`)

- Major technical decisions
- Rationale
- Alternatives considered
- Consequences

**4. Roadmap** (`00_Planning/Roadmap.md`)

- Phases and milestones
- Dependencies
- Resource allocation

### Planning Document Template

```markdown
# [Feature/Project Name] Plan

**Version:** 1.0
**Date:** YYYY-MM-DD
**Status:** Planning | In Progress | Complete
**Estimated Effort:** X hours/days/weeks

## Executive Summary

[3-5 sentences describing what this is and why it matters]

## Goals

- [ ] Goal 1
- [ ] Goal 2
- [ ] Goal 3

## Non-Goals

- What this explicitly does NOT include

## Technical Approach

### Architecture

[Diagrams, component descriptions]

### Implementation Steps

1. Step 1 (X hours)
   - Subtask A
   - Subtask B
2. Step 2 (X hours)
   - Subtask A

### Testing Strategy

- Unit tests: [What to test]
- Integration tests: [What to test]
- Manual testing: [What to verify]

## Success Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| ...  | ...        | ...    | ...        |

## Alternatives Considered

### Alternative 1: [Name]

- Pros: ...
- Cons: ...
- Why rejected: ...

## Timeline

- Week 1: [Tasks]
- Week 2: [Tasks]

## Decision Log

[Record major decisions made during planning/implementation]
```

---

## Slash Commands Reference

### Available Skills (from AssisT Project)

AssisT uses Claude Code project skills. Here are the most useful ones:

#### Project Management

**`/start` - Start Next Task**

- **When to use:** Beginning of each work session
- **What it does:**
  - Reviews current project status
  - Identifies next priority task
  - Creates session plan with todos
  - Sets up working context
- **Example:**
  ```
  User: /start
  Claude: Reviewing current status...
          Next task: Implement dysarthria STT profile
          Creating todo list for this session...
  ```

**`/end` - End Session**

- **When to use:** End of work session or before long break
- **What it does:**
  - Saves session summary to project memory
  - Updates status documents
  - Records decisions made
  - Creates handoff notes for next session
- **Example:**
  ```
  User: /end
  Claude: Saving session summary...
          Completed: 3 tasks (dysarthria profile, phrase learning, tests)
          Next session: Create UI components
  ```

**`/status` - Project Status**

- **When to use:** Anytime you want a project overview
- **What it does:**
  - Shows current phase/sprint
  - Lists completed features
  - Shows pending tasks
  - Highlights blockers
- **Example:**
  ```
  User: /status
  Claude: Phase 2 (70% complete)
          ✅ 15 features completed
          🚧 3 features in progress
          📋 7 features pending
  ```

#### Code Quality

**`/commit` - Safe Commit**

- **When to use:** After completing a logical unit of work
- **What it does:**
  - Runs pre-commit checks (linting, tests)
  - Prompts for conventional commit message
  - Adds co-author tag (Claude)
  - Verifies build passes before commit
- **Example:**
  ```
  User: /commit
  Claude: Running pre-commit checks...
          ✅ Linting passed
          ✅ Tests passed (47/47)
          Enter commit message: feat(stt): add dysarthria support profile
          Committing with co-author tag...
  ```

**`/review` - Code Review**

- **When to use:** Before merging feature branch or after major changes
- **What it does:**
  - Analyzes recent changes
  - Checks for bugs, logic errors, security issues
  - Validates code quality and conventions
  - Provides actionable feedback
- **Example:**
  ```
  User: /review
  Claude: Reviewing 247 lines changed across 5 files...
          ✅ No security vulnerabilities
          ⚠️  1 potential bug (line 42: null check missing)
          💡 2 refactoring suggestions
  ```

**`/refactor` - Safe Refactoring**

- **When to use:** Before major code restructuring
- **What it does:**
  - Creates safety net (git stash or branch)
  - Plans refactoring steps
  - Executes coordinated multi-file changes
  - Verifies tests pass after each step
- **Example:**
  ```
  User: /refactor Extract phrase learning to separate module
  Claude: Creating safety branch...
          Planning refactoring in 4 steps...
          Step 1: Create new module...
          Step 2: Move functions...
          ✅ Tests pass, continuing...
  ```

#### Testing

**`/test` - Run Test Suite**

- **When to use:** After code changes, before commits
- **What it does:**
  - Runs all tests with coverage
  - Identifies failures and suggests fixes
  - Shows coverage gaps
- **Example:**

  ```
  User: /test
  Claude: Running test suite...
          ✅ 47 passing
          ❌ 2 failing
          Coverage: 87% (target: 90%)

          Failures:
          1. phrase-learner.test.js:42 - Expected 3, got 2
          2. ...
  ```

**`/debug` - Debug Workflow Helper**

- **When to use:** When stuck on a bug
- **What it does:**
  - Launches structured debugging workflow
  - Adds strategic logging
  - Suggests hypotheses to test
  - Prevents time-wasting rabbit holes
- **Example:**
  ```
  User: /debug Button click not working
  Claude: Starting 5-minute debug protocol...
          Adding console.logs at suspected failure points...
          Hypothesis 1: Event handler race condition
          Test: Change onclick → onmousedown
  ```

#### Build & Deployment

**`/build` - Build Project**

- **When to use:** Before testing, before commits
- **What it does:**
  - Runs build process
  - Reports errors and warnings
  - Validates output
- **Example:**
  ```
  User: /build
  Claude: Running npm run build...
          ✓ Built in 7.08s
          Output: .vite/ (2.1 MB)
          ⚠️  3 warnings (unused imports)
  ```

#### Documentation

**`/prd` - View/Edit PRD**

- **When to use:** When referencing product requirements
- **What it does:**
  - Opens product requirements document
  - Allows inline editing
  - Syncs with planning docs

**`/adr` - Create Architecture Decision Record**

- **When to use:** After making significant architecture choice
- **What it does:**
  - Creates ADR document
  - Records decision, context, alternatives, consequences
  - Adds to decision log

### Creating Custom Slash Commands

You can create custom skills for your project. Example:

**`.claude/skills/deploy.md`**

```markdown
# Deploy Skill

Deploy the application to staging or production.

## Usage

/deploy [staging|production]

## Steps

1. Run full test suite
2. Build production bundle
3. Run smoke tests
4. Deploy to specified environment
5. Run post-deployment health checks

## Safety Checks

- Require explicit environment confirmation
- Block production deploys on Friday afternoons
- Verify no uncommitted changes
```

---

## Task & Todo Management

### Approach from AssisT Project

AssisT uses **TodoWrite** tool for real-time task tracking during development sessions.

### When to Use Todos

**✅ Use todos for:**

- Complex multi-step tasks (3+ steps)
- Non-trivial features requiring planning
- When user provides multiple tasks (numbered or comma-separated)
- Tracking progress through implementation phases

**❌ Skip todos for:**

- Single, straightforward tasks
- Trivial operations (fixing typos)
- Purely conversational requests

### Todo Structure

```javascript
{
  content: "Implement phrase learning system",
  status: "in_progress",  // pending | in_progress | completed
  activeForm: "Implementing phrase learning system"
}
```

### Todo Workflow

```
1. User requests feature
2. AI creates todo list with all steps
3. AI marks first todo as "in_progress"
4. AI completes task
5. AI marks todo as "completed" IMMEDIATELY
6. AI marks next todo as "in_progress"
7. Repeat until all todos completed
```

### Best Practices

1. **Granular tasks:** Break large tasks into <2 hour chunks
2. **Clear descriptions:** Use imperative voice ("Run tests", not "Testing")
3. **Active forms:** Present continuous for in-progress ("Running tests")
4. **Immediate completion:** Mark completed as soon as done, don't batch
5. **One in-progress:** Only ONE todo should be in-progress at a time

### Example Todo Session

```markdown
Session: Implement Dysarthria Support (8-10 hours)

Todos:
✅ Design DYSARTHRIA_SUPPORT profile configuration (30 min)
✅ Implement phrase learning system (2 hours)
🔄 Build communication assistant - word prediction (2 hours)
📋 Build communication assistant - phrase templates (1 hour)
📋 Create alternative suggestions panel UI (2 hours)
📋 Write unit tests (1.5 hours)
📋 Manual testing with simulated unclear speech (1 hour)
```

### Alternative: CURRENT_STATUS.md

For longer-term tracking, use a status document:

**`docs/planning/CURRENT_STATUS.md`**

```markdown
# Current Development Status

**Last Updated:** 2026-02-14
**Phase:** 2 - Feature Expansion
**Sprint:** 5 (Feb 10-24)

## In Progress

- [ ] Dysarthria STT profile (70% complete)
  - [x] Profile configuration
  - [x] Phrase learning system
  - [ ] UI components
  - [ ] Testing

## Blocked

- [ ] Canvas API integration (waiting for API key)

## Up Next

- [ ] Error resilience implementation
- [ ] Query caching

## Completed This Sprint

- [x] Dark mode support
- [x] STT profile manager
- [x] Confidence feedback UI
```

---

## Lessons Learned System

### Purpose

Capture debugging insights, architectural discoveries, and "gotchas" so they're never forgotten.

### When to Create a Lesson File

Create a new lesson file when:

- You spend >30 minutes debugging an issue
- You discover a non-obvious platform quirk
- You make an architectural mistake that could repeat
- You find a solution to a problem that wasn't documented

### Lesson File Template

**`docs/lessons/LESSONS_[TOPIC].md`**

````markdown
# Lessons Learned: [Topic Name]

**Date:** YYYY-MM-DD
**Context:** [What were you trying to do?]
**Issue:** [What went wrong?]
**Root Cause:** [Why did it go wrong?]
**Solution:** [How did you fix it?]
**Prevention:** [How to avoid this in the future?]

---

## Problem Description

[Detailed description of the issue]

### Symptoms

- Symptom 1
- Symptom 2

### What We Tried (That Didn't Work)

1. Attempt 1 - Why it failed
2. Attempt 2 - Why it failed

## Root Cause Analysis

[Deep dive into why the problem occurred]

### Technical Details

```code
// Example of the problem
```
````

## Solution

[Step-by-step solution]

### Code Changes

```code
// Before
[problematic code]

// After
[fixed code]
```

## Integration with CLAUDE.md

[How to update CLAUDE.md to prevent this issue]

**Add to CLAUDE.md:**

```markdown
🚨 CRITICAL: [Rule to prevent this issue]

- Specific guidance
- Code pattern to follow
- Anti-pattern to avoid
```

## Related Issues

- Link to similar problems
- Cross-references to other lessons

## Prevention Checklist

- [ ] Checklist item 1
- [ ] Checklist item 2

## References

- External docs
- Stack Overflow links
- GitHub issues

````

### Examples from AssisT

**1. `LESSONS_UI_EVENT_HANDLING.md`**
- **Issue:** Buttons appeared to work but clicks did nothing
- **Root Cause:** Document-level mousedown listener hid UI before click event fired
- **Solution:** Use mousedown with stopPropagation instead of click
- **CLAUDE.md Rule:** ALL interactive elements MUST use shared event handler utility

**2. `LESSONS_CONTENT_SCRIPT_INJECTION.md`**
- **Issue:** Content scripts worked on LMS sites but failed on regular websites
- **Root Cause:** Misunderstanding of `optional_host_permissions` vs. `web_accessible_resources`
- **Solution:** Add `assets/*.js` to web_accessible_resources for `<all_urls>` pattern
- **CLAUDE.md Rule:** NEVER use source paths for web_accessible_resources, ALWAYS use build output paths

**3. `LESSONS_CLAUDE_MD_AUTHORITY.md`**
- **Issue:** AI kept discovering config files that contradicted CLAUDE.md
- **Root Cause:** AI trusts "discovered state" over documented requirements
- **Solution:** Explicit rule that CLAUDE.md ALWAYS wins, even when contradicted
- **CLAUDE.md Rule:** ⚠️ ABSOLUTE RULE #0: THIS FILE IS ALWAYS THE TRUTH

### Lesson File Maintenance

**Monthly Review:**
1. Read all lesson files
2. Verify CLAUDE.md includes prevention rules
3. Archive obsolete lessons
4. Create lessons index document

**`docs/lessons/README.md`**
```markdown
# Lessons Learned Index

## UI & Frontend
- [Event Handling Race Conditions](LESSONS_UI_EVENT_HANDLING.md)
- [Dark Mode Implementation](LESSONS_DARK_MODE.md)

## Build System
- [Content Script Injection](LESSONS_CONTENT_SCRIPT_INJECTION.md)
- [Vite Build Output Paths](LESSONS_VITE_OUTPUT.md)

## Architecture
- [CLAUDE.md Authority](LESSONS_CLAUDE_MD_AUTHORITY.md)

## Testing
- [Async Test Flakiness](LESSONS_ASYNC_TESTING.md)
````

---

## Version Control Workflow

### Commit Message Convention

Use **Conventional Commits** format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (build, dependencies)

**Examples:**

```
feat(stt): add dysarthria support profile

Implements comprehensive dysarthria STT profile with:
- Extended timeouts for slower speech
- 7 recognition alternatives
- Phrase learning system
- Communication assistance features

Closes #142

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

```
fix(ui): resolve button click race condition

Changed interactive elements to use mousedown instead of click
to prevent race condition with document-level mousedown listener.

See: docs/lessons/LESSONS_UI_EVENT_HANDLING.md

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

### Branching Strategy

**Main Branches:**

- `main` - Production-ready code
- `develop` - Integration branch for features

**Feature Branches:**

- `feature/[name]` - New features
- `fix/[name]` - Bug fixes
- `refactor/[name]` - Code refactoring
- `docs/[name]` - Documentation updates

**Example Workflow:**

```bash
# Start new feature
git checkout -b feature/dysarthria-support

# Make changes, commit frequently
git add .
git commit -m "feat(stt): add dysarthria profile configuration"

# More work
git commit -m "feat(stt): implement phrase learning system"

# When feature complete
git checkout main
git merge feature/dysarthria-support --no-ff
git push origin main

# Delete feature branch
git branch -d feature/dysarthria-support
```

### Automated Push Script (Optional)

**`push.sh`** (from AssisT CLAUDE.md)

```bash
#!/bin/bash

echo "--- Automated Conventional Commit & Push ---"

# 1. Stage all changes
git add .
echo "Staged all changes."

# 2. Prompt for commit message
read -p "Enter Conventional Commit message: " commit_message

if [ -z "$commit_message" ]; then
  echo "Commit message cannot be empty. Aborting."
  exit 1
fi

# 3. Commit
git commit -m "$commit_message"

if [ $? -ne 0 ]; then
  echo "Commit failed. Aborting."
  exit 1
fi

# 4. Get current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# 5. Pull with rebase (maintain linear history)
echo "Pulling from origin/$BRANCH with rebase..."
git pull --rebase origin "$BRANCH"

if [ $? -ne 0 ]; then
  echo "Rebase failed. Resolve conflicts manually."
  exit 1
fi

# 6. Push
echo "Pushing to origin/$BRANCH..."
git push origin "$BRANCH"

if [ $? -eq 0 ]; then
  echo "SUCCESS: '$commit_message' pushed to $BRANCH"
else
  echo "ERROR: Push failed."
fi
```

**Usage:**

```bash
chmod +x push.sh
./push.sh
```

**Add alias:**

```bash
# In ~/.bashrc or ~/.zshrc
alias push='/path/to/project/push.sh'
```

---

## Debugging Protocol

### The 5-Minute Rule (from AssisT CLAUDE.md)

**Rule:** If you can't diagnose a bug in 5 minutes, change strategy immediately.

**Why:** Prevents time-wasting rabbit holes. Forces systematic approach.

### Debugging Workflow

**Phase 1: Immediate Action (0-60 seconds)**

1. Add `console.log()` at suspected failure points
2. Add `alert()` if logs don't appear (forces visibility)
3. Rebuild and test hypothesis

**Phase 2: Nuclear Options (60-120 seconds)**
If normal approach fails, use aggressive tactics:

- Inline event handlers (`setAttribute('onclick', ...)`)
- Hardcoded test data (`return { success: true }`)
- Debugger breakpoints (`debugger;` statements)

**Phase 3: Verification (120-180 seconds)**

- Create minimal isolated test case
- Test in clean environment (new HTML file, no dependencies)
- Verify external factors (build system, caching, browser extensions)

**Phase 4: Escalation (180+ seconds)**
If still not resolved, problem is likely NOT what you think:

- Check: Module loading, build output, environment config
- Document findings in temporary notes
- Consider creating a lesson file

### Example Debug Session

```markdown
Bug: Button click does nothing

00:00 - Add console.log to button click handler
→ No log appears when clicking

00:30 - Add console.log at top of file (verify script loads)
→ Log appears, so script is running

01:00 - Add alert() in click handler
→ No alert appears

01:30 - Nuclear option: Inline onclick attribute
<button onclick="alert('test')">Click</button>
→ Alert appears! Problem is with addEventListener

02:00 - Check for event listener conflicts
→ Found document.addEventListener('mousedown', hideUI)
→ Hypothesis: mousedown fires before click, hides button

02:30 - Change to mousedown with stopPropagation()
→ WORKS! Button now responds

03:00 - Create LESSONS_UI_EVENT_HANDLING.md
Update CLAUDE.md with new rule
```

### Debugging Checklist

Before spending time debugging, verify:

- [ ] Code is actually running (add log at entry point)
- [ ] Build succeeded without errors
- [ ] Browser cache cleared
- [ ] Correct file is being edited (not `.vite/` output)
- [ ] Event listeners are actually attached
- [ ] CSS isn't hiding element (`display: none`, `pointer-events: none`)
- [ ] No errors in browser console

---

## Project Phases

### Phase 0: Planning (Week 1)

**Goals:**

- Define project scope
- Create CLAUDE.md
- Write initial planning documents
- Set up repository

**Deliverables:**

- [ ] CLAUDE.md file
- [ ] `00_Planning/ProjectOverview.md`
- [ ] `00_Planning/FeaturePlan_v1.md`
- [ ] Repository with basic structure
- [ ] README.md

**Key Activities:**

- Research and feasibility studies
- Architecture brainstorming
- Risk assessment
- Timeline estimation

### Phase 1: Foundation (Weeks 2-3)

**Goals:**

- Build core infrastructure
- Implement basic features
- Establish development workflow
- Create initial tests

**Deliverables:**

- [ ] Build system configured
- [ ] Basic feature set working
- [ ] Unit test framework set up
- [ ] CI/CD pipeline (optional)

**Key Activities:**

- Set up development environment
- Implement "Hello World" equivalent
- First commit, first test, first build
- Document architecture decisions

### Phase 2: Feature Development (Weeks 4-8)

**Goals:**

- Implement planned features iteratively
- Maintain test coverage >80%
- Document as you go

**Deliverables:**

- [ ] Core features complete
- [ ] Comprehensive test suite
- [ ] Updated documentation

**Key Activities:**

- Daily: `/start` → code → `/test` → `/commit` → `/end`
- Weekly: `/review` codebase, update planning docs
- As needed: Create lesson files for discoveries

### Phase 3: Polish & Testing (Week 9)

**Goals:**

- Bug fixes
- Performance optimization
- User testing
- Documentation finalization

**Deliverables:**

- [ ] All critical bugs fixed
- [ ] Performance benchmarks met
- [ ] User documentation complete

**Key Activities:**

- Load testing
- User acceptance testing
- Accessibility audit
- Security review

### Phase 4: Release (Week 10)

**Goals:**

- Deploy to production
- Monitor for issues
- Gather user feedback

**Deliverables:**

- [ ] Production deployment
- [ ] Release notes
- [ ] Support documentation

**Key Activities:**

- Final release candidate testing
- Staged rollout
- Monitoring setup
- Post-launch support

---

## Best Practices

### AI Collaboration

**1. Be Explicit About Intent**

```
❌ "Update the button"
✅ "Change the submit button color to blue (#2196F3) for better visibility"
```

**2. Approve Plans Before Implementation**

```
User: "Let's add user authentication"
Claude: "I'll create a plan for authentication. Please review before I implement."
[Creates plan]
User: "Approved, proceed"
[Claude implements]
```

**3. Use Rollback When Needed**

```
User: "I don't want to implement this plan as yet - roll back any changes"
Claude: [Reverts all changes, preserves planning documents]
```

**4. Provide Context with Questions**

```
❌ "Why isn't this working?"
✅ "Button click isn't working. I see 'onclick' attribute in HTML,
    addEventListener in JS, but no console logs. Build succeeded.
    Browser console shows no errors."
```

### Code Quality

**1. Test-Driven Development**

```
1. Write test (fails)
2. Write minimum code to pass test
3. Refactor
4. Repeat
```

**2. Incremental Commits**

```
Commit frequency: Every 30-60 minutes or logical unit
Commit size: 50-300 lines changed
```

**3. Code Review Checklist**

- [ ] Follows CLAUDE.md standards
- [ ] Has tests with >80% coverage
- [ ] No console.log() in production code
- [ ] No TODO comments without issue links
- [ ] Documentation updated

### Documentation

**1. Document Decisions, Not Code**

```
❌ "This function adds two numbers"
✅ "We use BigInt instead of Number because Canvas API
    returns 64-bit integers that overflow Number.MAX_SAFE_INTEGER"
```

**2. Keep Documentation Close to Code**

```
✅ Inline JSDoc comments for functions
✅ README.md in each major directory
✅ Architecture diagrams in docs/
```

**3. Update Documentation During Development**

```
Not: Code all features → Document at end
But: Code feature → Document feature → Repeat
```

---

## Common Pitfalls

### Pitfall 1: Skipping Planning Phase

**Problem:** Jumping straight into coding without clear plan.

**Consequence:** Feature creep, scope changes, wasted effort.

**Solution:**

- ALWAYS create planning document first
- Get user/stakeholder approval before coding
- Use `/start` to review plan each session

### Pitfall 2: Not Updating CLAUDE.md

**Problem:** Discovering new constraints but not documenting them.

**Consequence:** AI repeats mistakes, violates new rules.

**Solution:**

- Every lesson learned → Update CLAUDE.md
- Every architectural decision → Update CLAUDE.md
- Monthly CLAUDE.md review

### Pitfall 3: Ignoring Build Warnings

**Problem:** "It builds, ship it!" mentality.

**Consequence:** Warnings become errors, technical debt accumulates.

**Solution:**

- Treat warnings as errors
- Fix warnings before committing
- Add linter rules to prevent warnings

### Pitfall 4: No Rollback Plan

**Problem:** Implementing complex feature without safety net.

**Consequence:** Breaking changes, can't revert, lost time.

**Solution:**

- Use feature branches
- Commit frequently
- Test before merge
- Use `/refactor` skill for risky changes

### Pitfall 5: Over-Engineering

**Problem:** Building for hypothetical future requirements.

**Consequence:** Complexity, maintenance burden, slower development.

**Solution:**

- YAGNI (You Aren't Gonna Need It)
- Build for current requirements only
- Refactor when requirements actually change

### Pitfall 6: Debugging Without Logging

**Problem:** Staring at code trying to "figure it out".

**Consequence:** Wasted time, guessing instead of knowing.

**Solution:**

- Follow 5-minute rule
- Add logs first, think second
- Use `/debug` skill for structured approach

### Pitfall 7: Not Writing Tests

**Problem:** "I'll add tests later."

**Consequence:** No tests ever get written, bugs in production.

**Solution:**

- TDD: Test first, code second
- Use `/test` before every commit
- Aim for >80% coverage

---

## Templates

### CLAUDE.md Template

```markdown
# [Project Name] - AI Assistant Instructions

📋 Project Configuration - [Brief Description]

---

## 🚨 CRITICAL RULES (Mandatory Constraints)

### ⚠️ ABSOLUTE RULE #0: THIS FILE IS ALWAYS THE TRUTH

CLAUDE.md is ALWAYS the absolute source of truth. Even when contradicted by config files,
source code, conversation summaries, or any other source - CLAUDE.md wins. No exceptions.
If confused or unsure, ASK THE USER TO CONFIRM before proceeding.

### RULE #1: [YOUR TOP PRIORITY - e.g., ACCESSIBILITY FIRST]

[Detailed explanation of your most important constraint]

Example:
```

ACCESSIBILITY FIRST: All generated code and documentation MUST comply with
WCAG 2.2 Level AA and actively incorporate WAI-Adapt semantics.

```

### RULE #2: [ARCHITECTURE CONSTRAINT]
[Explanation of architectural requirements]

Example:
```

ARCHITECTURE: This is a Chrome Extension operating within an Isolated World
for DOM injection. AVOID global JS conflicts. Content scripts MUST use
PostMessage for communication with page context.

```

### RULE #3: [VERSIONING/COMMIT STANDARD]
[Explanation of version control requirements]

Example:
```

VERSIONING STANDARD: ALL commits MUST adhere strictly to the Conventional
Commits specification. Use the provided automated push script for all commits.

```

### RULE #4: [TESTING REQUIREMENT]
[Explanation of testing approach]

Example:
```

TEST-DRIVEN DEVELOPMENT (TDD): ALWAYS write tests based on expected
input/output pairs before writing implementation code. Ensure tests fail
initially, then write the minimum code required to pass.

```

### RULE #5: [DOCUMENTATION REQUIREMENT]
[Explanation of documentation standards]

Example:
```

RATIONALE DOCUMENTATION: All significant architectural, feature, or design
choices MUST be logged immediately in the projectmemory.md file before
coding begins.

```

---

## 🎯 PROJECT CONTEXT

**Project Goal:** [One sentence describing what you're building and why]

**Technology Stack:**
- [Technology 1] (e.g., JavaScript ES6+)
- [Technology 2] (e.g., Chrome Extension Manifest V3)
- [Technology 3] (e.g., React, Vue, etc.)
- [Technology 4] (e.g., Build tool - Vite, Webpack)

**Target Users:** [Who will use this?]

**Core Features:**
1. [Feature 1]
2. [Feature 2]
3. [Feature 3]

---

## 🔧 DEVELOPMENT PATTERNS

### Code Style
- Follow [ESLint config / Prettier config / style guide]
- [Specific conventions - e.g., "Use arrow functions for callbacks"]

### File Organization
```

src/
components/ - Reusable UI components
features/ - Feature-specific code
utils/ - Shared utilities
services/ - External API interactions

```

### Build System
**CRITICAL: [Your build system specifics]**

Example:
```

- ALWAYS edit source files in: src/ directory ONLY
- NEVER edit files in: build/ directory (auto-generated)
- Build command: npm run build
- Build output location: build/ directory
- Before testing: Always run npm run build, then reload in browser

```

### Testing Strategy
- Unit tests for utility functions
- Integration tests for feature workflows
- [Specific testing tools - Jest, Vitest, etc.]
- Coverage target: >80%

---

## 🐛 DEBUGGING PROTOCOL (CRITICAL - AI ASSISTANT BEHAVIOR)

### The 5-Minute Rule
If a bug cannot be diagnosed in 5 minutes, change strategy immediately.
DO NOT spend time reading large amounts of code before testing hypotheses.
ADD debug logging FIRST, analyze output SECOND.

### Proactive Debugging Stance
When encountering ANY bug:

1. **IMMEDIATE ACTION (0-60 seconds):**
   - Add console.log() at suspected failure points
   - Add alert() if logs don't appear
   - Rebuild and test hypothesis

2. **NUCLEAR OPTIONS (60-120 seconds):**
   - Inline event handlers
   - Hardcoded test data
   - Debugger breakpoints

3. **VERIFICATION (120-180 seconds):**
   - Create minimal isolated test case
   - Test in clean environment

4. **ESCALATION (180+ seconds):**
   - Problem is likely NOT what you think
   - Check: Module loading, build output, environment config
   - Document findings and ask user for context

---

## 🚀 COMMIT WORKFLOW

### Standard Workflow
1. Make changes
2. Run tests: npm test
3. Run build: npm run build
4. Test manually
5. Commit with conventional commit message

### Commit Message Format
```

<type>(<scope>): <description>

[optional body]

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>

```

### Types
- feat: New feature
- fix: Bug fix
- docs: Documentation
- style: Formatting
- refactor: Code refactoring
- perf: Performance
- test: Tests
- chore: Maintenance

---

## 🧠 MEMORY MANAGEMENT

### Knowledge Persistence
- **Design Rationale:** `00_Planning/ArchitectureDecisions.md`
- **Project History:** Git commit history + session summaries
- **Lessons Learned:** `docs/lessons/LESSONS_*.md`

### Before Major Changes
1. Read relevant planning documents
2. Check lessons learned for related issues
3. Verify CLAUDE.md doesn't prohibit approach

---

## 📚 LESSONS LEARNED INTEGRATION

**Location:** `docs/lessons/`

**When to Create Lesson File:**
- Debugging took >30 minutes
- Discovered non-obvious platform quirk
- Made architectural mistake

**Lesson File Format:** See `docs/lessons/TEMPLATE_LESSON.md`

**After Creating Lesson:**
- Update CLAUDE.md with prevention rule
- Add reference to relevant section above

---

## 🔒 SECURITY & PRIVACY (If Applicable)

[Your security requirements]

Example:
```

SECURITY & PRIVACY (FERPA/HIPAA):

- AVOID requesting excessive permissions in manifest.json
- All data storage must adhere to principle of least privilege
- No data transmission to external servers without explicit user consent

```

---

## 📝 ADDITIONAL PROJECT-SPECIFIC RULES

[Any other rules specific to your project]

---

**Last Updated:** [Date]
**Version:** [Version number]
```

---

## Conclusion

This methodology has been proven effective on the AssisT project, a Chrome extension with:

- 79 features across 9 categories
- 50,000+ lines of code
- Complex build system (Vite + Manifest V3)
- Strict accessibility requirements (WCAG 2.2 AA)
- Multiple AI integrations (Ollama, Anthropic, etc.)

### Key Takeaways

1. **CLAUDE.md is the foundation** - Everything else builds on it
2. **Planning before coding** - Prevents wasted effort
3. **Lessons learned system** - Never repeat mistakes
4. **Incremental development** - Small, tested changes
5. **AI as partner** - Slash commands automate best practices

### Getting Started with Your Next Project

1. Copy this file to your new project as `00_Planning/ProjectSetupMethodology.md`
2. Copy CLAUDE.md template and customize for your project
3. Create `00_Planning/` and `docs/lessons/` directories
4. Use `/start` to begin your first session
5. Refer back to this guide when stuck

### Questions?

This methodology is a living document. As you discover new patterns or improvements, update this file and share with the community.

---

**Created by:** AssisT Development Team
**Last Updated:** 2026-02-14
**License:** MIT (use freely in your own projects)
