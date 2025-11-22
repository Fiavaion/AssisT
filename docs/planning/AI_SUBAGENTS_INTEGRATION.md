# AI Sub-Agents Integration Plan

**Created**: 2025-11-22
**Status**: Planning Phase
**Purpose**: Integrate AI sub-agents into Phase 2 task workflow for autonomous task completion

---

## Overview

This document defines the integration of AI sub-agents into the AssisT extension development workflow. Sub-agents will be automatically invoked when specific tasks are started, enabling autonomous completion of complex multi-step features.

---

## Sub-Agent Architecture

### Agent Types Available

1. **general-purpose**: Multi-step tasks, code search, complex implementations
2. **Explore**: Codebase exploration, finding files, understanding architecture
3. **Plan**: Task planning, breaking down features into steps
4. **claude-code-guide**: Documentation lookup for Claude Code and SDK

### Agent Invocation Pattern

```javascript
// When starting a task, check if it requires a sub-agent
const taskConfig = {
  taskId: '4.12',
  requiresAgent: true,
  agentType: 'general-purpose',
  agentPrompt: 'Implement Dictionary settings panel following the Highlight Menu pattern...',
  thoroughness: 'medium',
};
```

---

## Task-to-Agent Mapping

### Phase 2.1: High-Priority Core Features

#### Feature 1: OCR + Screenshot Tool ✅ COMPLETE

- No agents needed (already complete)

#### Feature 2: Highlight Menu (92% complete)

- **Task 2.13**: E2E test for menu workflow
  - Agent: `general-purpose`
  - Thoroughness: `medium`
  - Prompt: "Create E2E tests for Highlight Menu following the OCR E2E pattern. Test all 6 buttons, positioning, auto-hide, keyboard navigation."

#### Feature 3: Reading Mode ✅ COMPLETE

- No agents needed (already complete)

#### Feature 4: Dictionary Lookup ✅ COMPLETE

- No agents needed (already complete)

---

### Phase 2.2: Writing & Organization (Weeks 6-9)

#### Feature 5: Annotations & Sticky Notes

- **Task 5.1-5.3**: Database and CRUD operations
  - Agent: `general-purpose`
  - Thoroughness: `very thorough`
  - Prompt: "Set up IndexedDB schema with Dexie for annotations. Implement CRUD operations with timestamp tracking and user attribution. Follow Feature Isolation Pattern (DEC-202510-010)."

- **Task 5.4-5.7**: UI Components
  - Agent: `general-purpose`
  - Thoroughness: `medium`
  - Prompt: "Create annotation UI components: sticky note overlay, text highlight markers, toolbar with color picker. Ensure WCAG 2.2 AA compliance."

- **Task 5.8-5.13**: Integration and Testing
  - Agent: `general-purpose`
  - Thoroughness: `medium`
  - Prompt: "Integrate annotations with Reading Mode and Highlight Menu. Create unit and E2E tests. Add keyboard shortcuts."

#### Feature 6: Translation

- **Task 6.1-6.4**: API Integration
  - Agent: `general-purpose`
  - Thoroughness: `medium`
  - Prompt: "Integrate Google Translate API with fallback to LibreTranslate. Implement language detection and multi-language support (20+ languages). Add caching layer."

- **Task 6.5-6.9**: UI and Testing
  - Agent: `general-purpose`
  - Thoroughness: `medium`
  - Prompt: "Create translation modal UI with language selector, original/translated text display. Integrate with Highlight Menu. Add settings panel and tests."

#### Feature 7: Text Statistics

- **Task 7.1-7.6**: Statistics Engine
  - Agent: `general-purpose`
  - Thoroughness: `medium`
  - Prompt: "Implement text statistics calculator using compromise.js NLP. Track word count, reading time, grade level, sentence complexity. Create real-time dashboard."

- **Task 7.7-7.10**: Settings and Testing
  - Agent: `general-purpose`
  - Thoroughness: `quick`
  - Prompt: "Add Text Statistics settings panel, export functionality, and comprehensive unit tests."

---

### Phase 2.3: UX Enhancements (Weeks 10-11)

#### Feature 8: Font Library Expansion

- **Task 8.1-8.6**: Font Integration
  - Agent: `general-purpose`
  - Thoroughness: `quick`
  - Prompt: "Add 4 new fonts (Comic Sans, Lexend, Atkinson Hyperlegible, Dyslexie) to font library. Update font selector UI and add font preview feature."

#### Feature 9: Full Keyboard Shortcuts System

- **Task 9.1-9.10**: Shortcuts Infrastructure (ALREADY COMPLETE)
  - Agent: None (already implemented in Session 008)

- **Task 9.11-9.13**: Testing and Polish
  - Agent: `general-purpose`
  - Thoroughness: `medium`
  - Prompt: "Complete keyboard shortcuts E2E tests. Add shortcuts reference panel and conflict detection UI."

---

### Phase 2.4: Citation & Research Management (Weeks 12-16)

#### Feature 11.1: Citation Capture & Metadata Extraction

- **Task 11.1.1-11.1.7**: Core Capture System
  - Agent: `general-purpose`
  - Thoroughness: `very thorough`
  - Prompt: "Implement citation capture system using open-graph-scraper for metadata extraction. Add PDF detection, DOI regex, and CrossRef API lookup. Follow Feature Isolation Pattern."

- **Task 11.1.8-11.1.13**: UI and Integration
  - Agent: `general-purpose`
  - Thoroughness: `medium`
  - Prompt: "Create citation capture UI: browser action button, context menu, manual entry form, edit modal. Add success toast notifications."

#### Feature 11.2: Citation Formatting (Cite Them Right)

- **Task 11.2.1-11.2.8**: citeproc-js Integration
  - Agent: `general-purpose`
  - Thoroughness: `very thorough`
  - Prompt: "Integrate citeproc-js with harvard-cite-them-right-13th-edition.csl. Generate in-text citations and bibliography entries. Support NCAD requirements and edition selector (10th-13th)."

- **Task 11.2.9-11.2.12**: Export and Testing
  - Agent: `general-purpose`
  - Thoroughness: `medium`
  - Prompt: "Implement bibliography generator with alphabetical sorting. Add export to Word/Google Docs/Plain Text/HTML. Create unit tests for citation formatting."

#### Feature 11.3: Project Organization System

- **Task 11.3.1-11.3.9**: Database and Views
  - Agent: `general-purpose`
  - Thoroughness: `very thorough`
  - Prompt: "Design IndexedDB schema with Dexie for projects, citations, and tags (many-to-many). Implement CRUD operations. Create Gallery/List/Kanban views with drag-and-drop."

- **Task 11.3.10-11.3.17**: Search and Integration
  - Agent: `general-purpose`
  - Thoroughness: `medium`
  - Prompt: "Add thumbnail generation, lazy loading, search/filter/sort functionality. Link annotations to citations. Implement folder grouping."

#### Feature 11.4: Source Evaluation & Credibility

- **Task 11.4.1-11.4.8**: Evaluation Engine
  - Agent: `general-purpose`
  - Thoroughness: `very thorough`
  - Prompt: "Implement CRAAP test integration with 5 questions. Calculate credibility scores (0-100). Add DOI validation via CrossRef, Retraction Watch checks, DOAJ verification, predatory journal detection."

- **Task 11.4.9-11.4.11**: UI and Integration
  - Agent: `general-purpose`
  - Thoroughness: `medium`
  - Prompt: "Create visual badges (green/yellow/red) for source quality. Add bibliography filtering by quality. Integrate Semantic Scholar API for better source suggestions."

#### Feature 11.5: Citation Export & Integration

- **Task 11.5.1-11.5.8**: Export Functionality
  - Agent: `general-purpose`
  - Thoroughness: `medium`
  - Prompt: "Implement export to Word/Google Docs/PDF/Plain Text/HTML. Support library export in JSON/CSV/BibTeX/RIS formats. Add Zotero import/export."

- **Task 11.5.9-11.5.14**: LMS Integration
  - Agent: `general-purpose`
  - Thoroughness: `very thorough`
  - Prompt: "Create Google Docs toolbar integration for inserting citations at cursor. Add Canvas LMS editor integration with floating citation button. Implement project ZIP export with backup/restore."

#### Feature 11.6: Citation UI Design

- **Task 11.6.1-11.6.13**: Main UI Components
  - Agent: `general-purpose`
  - Thoroughness: `very thorough`
  - Prompt: "Create Citation Manager tab in popup with view switcher (All/Projects/Recent), Gallery/List/Kanban toggle, search bar with filters. Design citation detail modal with full metadata, thumbnail, tags/projects UI."

- **Task 11.6.14-11.6.24**: Accessibility and Polish
  - Agent: `general-purpose`
  - Thoroughness: `medium`
  - Prompt: "Add project dashboard with citation count and progress tracker. Implement TTS for abstracts, Bionic Reading, Focus mode. Ensure full keyboard navigation and high contrast theme support (WCAG 2.2 AA)."

---

## Agent Invocation Protocol

### 1. Task Start Hook

```javascript
// When /start command is issued
function onTaskStart(taskId) {
  const taskConfig = getTaskAgentConfig(taskId);

  if (taskConfig.requiresAgent) {
    invokeSubAgent({
      type: taskConfig.agentType,
      thoroughness: taskConfig.thoroughness,
      prompt: taskConfig.agentPrompt,
      taskId: taskConfig.taskId,
    });
  } else {
    // Proceed with manual implementation
    proceedWithManualTask(taskId);
  }
}
```

### 2. Agent Response Handling

```javascript
// Agent completes and returns result
function onAgentComplete(taskId, result) {
  // Validate result
  validateTaskCompletion(taskId, result);

  // Run tests
  runTaskTests(taskId);

  // Commit changes
  commitTaskChanges(taskId);

  // Update task status
  updateTaskStatus(taskId, 'complete');

  // Move to next task
  moveToNextTask();
}
```

### 3. Agent Error Handling

```javascript
// Agent encounters error
function onAgentError(taskId, error) {
  // Log error
  logAgentError(taskId, error);

  // Attempt recovery
  if (isRecoverable(error)) {
    retryAgentTask(taskId);
  } else {
    // Fallback to manual implementation
    requestManualIntervention(taskId, error);
  }
}
```

---

## Task Configuration Schema

```json
{
  "taskId": "11.1.1",
  "featureId": "11.1",
  "featureName": "Citation Capture & Metadata Extraction",
  "taskName": "IndexedDB schema setup",
  "requiresAgent": true,
  "agentType": "general-purpose",
  "thoroughness": "very thorough",
  "agentPrompt": "Set up IndexedDB schema with Dexie...",
  "dependencies": [],
  "estimatedTime": "30-45 minutes",
  "testStrategy": "unit",
  "files": ["src/features/citations/citation-db.js", "tests/unit/citation-db.test.js"]
}
```

---

## Benefits of Sub-Agent Integration

1. **Autonomous Completion**: Sub-agents can complete entire features without intervention
2. **Consistency**: Agents follow established patterns (Feature Isolation, WCAG compliance)
3. **Speed**: Parallel task execution possible for independent features
4. **Quality**: Agents write tests, validate WCAG compliance, follow commit conventions
5. **Documentation**: Agents auto-generate session notes and update progress tracking

---

## Implementation Phases

### Phase 1: Infrastructure Setup (Next Session)

- [x] Create AI_SUBAGENTS_INTEGRATION.md (this document)
- [ ] Update PHASE2_TASKS.md with agent configuration for each task
- [ ] Create task-agent-config.json mapping file
- [ ] Add agent invocation helpers to project

### Phase 2: Pilot Testing (Phase 2.2 Start)

- [ ] Test sub-agent on Feature 5 (Annotations) - first new feature
- [ ] Validate agent follows Feature Isolation Pattern
- [ ] Ensure WCAG compliance in agent output
- [ ] Refine agent prompts based on pilot results

### Phase 3: Full Rollout (Phase 2.3+)

- [ ] Apply sub-agents to all remaining Phase 2 tasks
- [ ] Enable parallel agent execution for independent features
- [ ] Monitor and optimize agent performance
- [ ] Document lessons learned

---

## Next Steps

1. **Immediate**: Update PHASE2_TASKS.md with agent configurations
2. **Session 012**: Create task-agent-config.json with all mappings
3. **Session 013**: Implement agent invocation system
4. **Session 014**: Test pilot agent on Feature 5 (Annotations)

---

## Notes

- All agents must follow Feature Isolation Pattern (DEC-202510-010)
- All agents must ensure WCAG 2.2 AA compliance
- All agents must write unit tests (target 80%+ coverage)
- All agents must follow Conventional Commits specification
- Agents should commit incrementally (ONE-CHANGE-AT-A-TIME)
- Session notes must be auto-generated by agents after task completion

---

**Document Complete** - Ready for context clearing and Session 012 start
