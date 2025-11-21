# Universal Debugging Protocol Template

## 🎯 Purpose

Drop this file into any new project to establish aggressive, efficient debugging standards.

---

## ⚡ The 5-Minute Rule

**If you can't fix a bug in 5 minutes, you're using the wrong strategy.**

### Time Budget Breakdown

- **0-1 min:** Reproduce + Add debug logging
- **1-2 min:** Test hypothesis with minimal code
- **2-3 min:** Nuclear option (bypass the failing system)
- **3-4 min:** Verify external factors (build, environment)
- **4-5 min:** Escalate (ask for help, file detailed bug report)

**Why 5 minutes?**

- Prevents rabbit holes
- Forces you to test assumptions instead of reading code
- Identifies when the problem is NOT what you think it is

---

## 🚨 Bug Category Decision Tree

### 1. "It doesn't work at all"

**Strategy: Binary search**

```javascript
// Step 1: Does the code even run?
console.log('🔴 CODE REACHED');

// Step 2: Are inputs correct?
console.log('🔵 INPUTS:', arg1, arg2, arg3);

// Step 3: Does the simple version work?
// Comment out all logic, replace with:
return { success: true, data: 'hardcoded' };
// If this works → Logic bug
// If this fails → Integration bug
```

### 2. "It works sometimes"

**Strategy: Environmental logging**

```javascript
// Log EVERYTHING about the environment when it fails
console.log({
  timestamp: Date.now(),
  userAgent: navigator.userAgent,
  url: window.location.href,
  localStorage: { ...localStorage },
  sessionStorage: { ...sessionStorage },
  cookies: document.cookie,
  viewport: { w: window.innerWidth, h: window.innerHeight },
  // Add project-specific state
});
```

### 3. "It worked before, now it doesn't"

**Strategy: Git bisect + blame**

```bash
# Find exact commit that broke it
git bisect start
git bisect bad HEAD
git bisect good <last-known-good-commit>
# Git will checkout commits for you to test
# Test each one with: npm run test
# Mark with: git bisect good/bad
# Git finds the breaking commit
```

### 4. "UI appears but doesn't respond" (This case)

**Strategy: Event flow verification**

```javascript
// Global event monitor
['click', 'mousedown', 'mouseup', 'touchstart'].forEach(event => {
  document.addEventListener(
    event,
    e => {
      console.log(`🟡 ${event}:`, e.target, e.currentTarget);
    },
    true
  ); // Capture phase
});

// Element-specific
element.onmousedown = e => {
  alert('Handler runs!'); // Nuclear: Forces visibility
  console.log('🔴 Event:', e);
};
```

### 5. "No errors but wrong output"

**Strategy: Assertion injection**

```javascript
function processData(input) {
  console.assert(input != null, 'Input is null!');
  console.assert(Array.isArray(input), 'Input not array!');

  const result = transform(input);

  console.assert(result.length > 0, 'Empty result!');
  console.assert(
    result.every(x => x.id),
    'Missing IDs!'
  );

  return result;
}
```

---

## 🔥 Nuclear Debugging Options

### When Normal Debugging Fails

**Use these heavy-handed approaches to bypass broken systems:**

#### Option 1: Inline Everything

```javascript
// Instead of:
button.addEventListener('click', handler);

// Do this:
button.setAttribute('onclick', 'alert("Works!")');
// If this works → Event system is broken
// If this fails → Element not in DOM or CSS blocking
```

#### Option 2: Polling

```javascript
// If events don't work, poll the state
let lastState = null;
setInterval(() => {
  const currentState = checkCondition();
  if (currentState !== lastState) {
    console.log('STATE CHANGED:', lastState, '→', currentState);
    lastState = currentState;
  }
}, 100);
```

#### Option 3: Debugger Breakpoint Injection

```javascript
// Add debugger statements strategically
function suspiciousFunction(arg) {
  debugger; // Execution WILL pause here
  const result = transform(arg);
  debugger; // Check result before return
  return result;
}
```

#### Option 4: Monkey Patch Core APIs

```javascript
// Override built-in functions to log calls
const originalFetch = window.fetch;
window.fetch = function (...args) {
  console.log('🌐 FETCH:', args);
  return originalFetch.apply(this, args);
};

// Same for DOM methods
const originalAppendChild = Element.prototype.appendChild;
Element.prototype.appendChild = function (child) {
  console.log('➕ APPEND:', this, child);
  return originalAppendChild.call(this, child);
};
```

#### Option 5: Time-Travel Debugging

```javascript
// Record all state changes
const stateHistory = [];
const originalSetState = Component.prototype.setState;
Component.prototype.setState = function (newState) {
  stateHistory.push({
    timestamp: Date.now(),
    component: this.constructor.name,
    before: this.state,
    after: newState,
    stack: new Error().stack,
  });
  return originalSetState.call(this, newState);
};

// Later: Review what happened
console.table(stateHistory);
```

---

## 📋 Standard Debug Log Template

**Use this format for ALL debug logs:**

```javascript
// ✅ GOOD: Structured, searchable, informative
console.log('[ModuleName] Action:', {
  input: data,
  state: currentState,
  timestamp: Date.now(),
});

// ❌ BAD: Unstructured, hard to search
console.log('data:', data);
```

### Log Levels (Use Consistently)

```javascript
console.log('[Module] 🟢 Success:', result); // Normal operation
console.warn('[Module] 🟡 Warning:', issue); // Recoverable problem
console.error('[Module] 🔴 Error:', error); // Critical failure
console.info('[Module] 🔵 Info:', details); // Helpful context
console.debug('[Module] ⚪ Debug:', internals); // Verbose details
```

### Conditional Logging (Production-Safe)

```javascript
const DEBUG = localStorage.getItem('debug') === 'true';

function log(...args) {
  if (DEBUG) console.log(...args);
}

// Enable with: localStorage.setItem('debug', 'true'); location.reload();
```

---

## 🧪 Minimal Test Case Template

**When reporting bugs or asking for help:**

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Bug Reproduction</title>
  </head>
  <body>
    <h1>Expected: [Describe expected behavior]</h1>
    <h2>Actual: [Describe actual behavior]</h2>

    <button id="test">Click Me</button>

    <script>
      // Minimal code that reproduces the issue
      document.getElementById('test').onclick = () => {
        console.log('Clicked!');
        // Add ONLY the code necessary to show the bug
      };
    </script>
  </body>
</html>
```

**Rules:**

1. No external dependencies (unless bug requires them)
2. < 50 lines of code
3. Copy-paste-runnable (no setup required)
4. Clear expected vs actual behavior

---

## 🎯 Testing Hypothesis Framework

### Before You Code, Write This Down

**Hypothesis:** [What you think is wrong]

**Test:** [How to prove/disprove it]

**Expected if TRUE:** [Observable outcome]

**Expected if FALSE:** [Alternative outcome]

**Example:**

```
Hypothesis: Event handler not attached because DOM loads after script

Test: Move script to end of <body>, add console.log in handler

Expected if TRUE: Log appears after moving script

Expected if FALSE: Log still doesn't appear (different issue)
```

---

## 🛡️ Prevention Checklist

### Before Merging Code

- [ ] All interactive elements have visual feedback (hover states)
- [ ] Debug logs added for critical paths
- [ ] Error handling for all async operations
- [ ] Assertions for function preconditions
- [ ] Minimal test case created for new features
- [ ] Escape hatch provided (keyboard shortcut, API call)

### Before Deploying

- [ ] Test in production-like environment
- [ ] Verify build output (source maps, file sizes)
- [ ] Check browser console for warnings
- [ ] Test with cache disabled
- [ ] Test with extensions disabled

---

## 🔧 Browser DevTools Cheatsheet

### Event Debugging

```javascript
// Monitor all events on element
monitorEvents($0); // $0 = currently selected element in Elements panel

// Monitor specific event types
monitorEvents($0, 'mouse');
monitorEvents($0, ['click', 'keydown']);

// Stop monitoring
unmonitorEvents($0);

// Get all listeners
getEventListeners($0);
```

### Performance Debugging

```javascript
// Measure execution time
console.time('operationName');
// ... code ...
console.timeEnd('operationName');

// Count occurrences
console.count('loopIteration');

// Create collapsible groups
console.group('Processing Data');
console.log('Step 1');
console.log('Step 2');
console.groupEnd();
```

### Network Debugging

```javascript
// Override fetch to log all requests
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  console.log('→ Request:', args[0]);
  const response = await originalFetch(...args);
  console.log('← Response:', response.status, args[0]);
  return response;
};
```

---

## 📊 Bug Report Template

**Copy-paste this when filing bugs:**

```markdown
## Bug: [One-line summary]

**Severity:** Critical / High / Medium / Low
**Environment:** [Browser, OS, version]
**Reproducible:** Always / Sometimes / Rarely

### Steps to Reproduce

1. [First step]
2. [Second step]
3. [Third step]

### Expected Behavior

[What should happen]

### Actual Behavior

[What actually happens]

### Screenshots/Logs

[Paste console output, screenshots]

### Minimal Test Case

[Link to CodePen/JSFiddle or inline code]

### Workaround

[If known]

### Additional Context

- First noticed: [Date/commit]
- Related issues: [Links]
- Attempted fixes: [What you tried]
```

---

## 🧠 Mental Models

### The "Shrinking Box" Method

```
1. Start with: "The entire application is broken"
2. Test: "Is the specific module broken?" → YES
3. Test: "Is the specific function broken?" → YES
4. Test: "Is line 42 broken?" → YES
5. Test: "Is this variable null?" → YES
6. Fix: Add null check

Each test shrinks the box around the bug.
```

### The "Working Backwards" Method

```
1. Desired output: User sees success message
2. What creates that? showMessage() function
3. What calls that? submitForm() function
4. What triggers that? Button click event
5. Is button click working? → NO
6. Why? Event handler not attached
7. Why? DOM not ready when script runs

Start at the end, work backwards to the root cause.
```

---

## 🚀 AI Assistant Instructions

**When asking AI for debugging help, provide:**

1. **Minimal test case** (copy-pasteable code)
2. **Exact error message** (full stack trace)
3. **What you've tried** (prevents repeated suggestions)
4. **Environment details** (browser, build system, framework versions)
5. **Debug logs** (actual output, not "it doesn't work")

**Example:**

```
I have a button that doesn't respond to clicks.

Environment: Chrome 120, Vite 5, vanilla JS

Code:
[paste minimal example]

Debug logs:
[paste console output showing handler creation]

Expected: Click logs "Button clicked"
Actual: Nothing happens, no errors

Tried:
- Added console.log in handler (doesn't fire)
- Verified element exists (document.getElementById returns element)
- Checked CSS (no pointer-events:none)

What am I missing?
```

---

## 🎓 Key Principles

1. **Log first, debug second** - Verify assumptions before reading code
2. **Test in isolation** - Minimal examples find bugs faster
3. **Move fast, break things** - Nuclear options are valid when stuck
4. **5-minute rule** - If not progressing, change strategy
5. **Document everything** - Future you will thank present you
6. **Fail fast, fix fast** - Don't fear breaking things during debugging

---

## 📁 Project Setup

**Add these files to every new project:**

1. `DEBUGGING_PROTOCOL.md` (this file)
2. `LESSONS_[TOPIC].md` (document each major bug)
3. `.debug.js` (reusable debug utilities)
4. `test-minimal.html` (template for isolated tests)

**Example `.debug.js`:**

```javascript
// Reusable debug utilities
window.DEBUG = {
  enabled: localStorage.getItem('debug') === 'true',

  log(...args) {
    if (this.enabled) console.log(...args);
  },

  assert(condition, message) {
    if (!condition) {
      debugger; // Auto-break on assertion failure
      throw new Error(`Assertion failed: ${message}`);
    }
  },

  monitorElement(selector) {
    const el = document.querySelector(selector);
    monitorEvents(el);
    console.log('Monitoring:', el);
  },

  dumpState() {
    return {
      url: location.href,
      localStorage: { ...localStorage },
      cookies: document.cookie,
      viewport: [window.innerWidth, window.innerHeight],
      timestamp: new Date().toISOString(),
    };
  },
};

// Enable with: localStorage.setItem('debug', 'true');
```

---

**Last Updated:** 2025-01-21
**Version:** 1.0
**License:** Public Domain (use in any project)
