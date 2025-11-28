# Performance Benchmarks for AssisT Extension

## Overview

This document describes the performance benchmark suite for the AssisT adaptive EdTech browser extension. These benchmarks ensure that critical user-facing features meet strict performance targets to provide a smooth, responsive experience for neurodivergent students.

## Performance Targets

| Category                      | Target | Rationale                                             |
| ----------------------------- | ------ | ----------------------------------------------------- |
| **User Interaction Response** | <100ms | Instant feedback to user actions (clicks, selections) |
| **Feature Initialization**    | <200ms | Quick startup of features (TTS, STT, profiles)        |
| **API-Dependent Operations**  | <500ms | Network operations (translation, dictionary)          |
| **Local Processing**          | <300ms | Local fallbacks and page transformations              |

## Benchmark Suite

### Test Environment

- **Framework**: Jest (already configured in project)
- **Timing**: `performance.now()` for high-resolution measurements
- **Iterations**: 10+ per benchmark for statistical significance
- **Metrics**: Mean, Min, Max, Standard Deviation

### Critical Paths Tested

#### 1. TTS Initialization

- **File**: `tests/performance/performance-benchmarks.test.js`
- **Target**: <200ms
- **Measures**: Time from button click to TTS controller ready
- **Components Tested**:
  - `TTSController` instantiation
  - Voice loading
  - Settings application

**Expected Results**:

```
Mean: ~50-100ms
Min: ~30-50ms
Max: ~150-200ms
```

**Optimization Tips**:

- Voice loading is lazy (async)
- Settings are pre-loaded from storage
- No network calls required

---

#### 2. STT Activation

- **File**: `tests/performance/performance-benchmarks.test.js`
- **Target**: <200ms
- **Measures**: Time from mic click to recording start
- **Components Tested**:
  - `STTController` initialization
  - Web Speech API activation
  - Microphone permissions (mocked)

**Expected Results**:

```
Mean: ~80-120ms
Min: ~50-80ms
Max: ~150-200ms
```

**Optimization Tips**:

- Browser API calls are synchronous
- Permission prompts are one-time (mocked in tests)
- No network calls required

---

#### 3. OCR Processing (Per Page)

- **File**: `tests/performance/performance-benchmarks.test.js`
- **Target**: <300ms (framework overhead only, OCR engine is mocked)
- **Measures**: Time for framework overhead (image preprocessing, UI updates)
- **Components Tested**:
  - Image preprocessing
  - Canvas operations
  - Result formatting

**Note**: Actual Tesseract.js processing takes 2-5 seconds per page and is not included in this benchmark. This test validates the framework's overhead is minimal.

**Expected Results**:

```
Mean: ~50-150ms
Min: ~30-80ms
Max: ~200-300ms
```

**Optimization Tips**:

- Image upscaling is optional (can be disabled)
- Canvas operations are GPU-accelerated
- Progress UI is non-blocking

---

#### 4. Reading Mode Activation

- **File**: `tests/performance/performance-benchmarks.test.js`
- **Target**: <300ms
- **Measures**: Time to render simplified view
- **Components Tested**:
  - Content extraction (Readability)
  - DOM cloning
  - Overlay rendering

**Expected Results**:

```
Mean: ~100-200ms
Min: ~80-120ms
Max: ~250-300ms
```

**Optimization Tips**:

- Readability works on cloned DOM (non-blocking)
- CSS is pre-defined (no dynamic computation)
- Content is lazy-rendered

---

#### 5. Highlight Menu Appearance

- **File**: `tests/performance/performance-benchmarks.test.js`
- **Target**: <100ms
- **Measures**: Time from text selection to menu display
- **Components Tested**:
  - Text selection detection
  - Menu creation
  - Positioning calculation

**Expected Results**:

```
Mean: ~20-50ms
Min: ~10-30ms
Max: ~80-100ms
```

**Optimization Tips**:

- Menu is pre-created and hidden (toggled with CSS)
- Positioning uses cached getBoundingClientRect
- No network calls

---

#### 6. Dictionary Lookup

- **File**: `tests/performance/performance-benchmarks.test.js`
- **Target**: <100ms (cached), <500ms (API call)
- **Measures**: Time from lookup trigger to definition display
- **Components Tested**:
  - Cache lookup (LRU)
  - Modal rendering
  - Definition formatting

**Note**: This test focuses on **cached** lookups. Network API calls are tested separately in integration tests.

**Expected Results** (Cached):

```
Mean: ~30-60ms
Min: ~20-40ms
Max: ~80-100ms
```

**Optimization Tips**:

- LRU cache stores last 100 lookups
- Modal is pre-created (hidden until needed)
- API calls are debounced (300ms)

---

#### 7. Translation

- **File**: `tests/performance/performance-benchmarks.test.js`
- **Target**: <100ms (cached), <500ms (API call)
- **Measures**: Time from request to translated text display
- **Components Tested**:
  - Cache lookup
  - UI update
  - Text replacement

**Note**: This test focuses on **cached** translations. Network API calls are tested separately.

**Expected Results** (Cached):

```
Mean: ~30-60ms
Min: ~20-40ms
Max: ~80-100ms
```

**Optimization Tips**:

- Cache stores up to 100 translations (7-day TTL)
- MyMemory API is used (free, no API key)
- Requests are batched (max 500 chars)

---

#### 8. Dyslexia Mode Application

- **File**: `tests/performance/performance-benchmarks.test.js`
- **Target**: <300ms
- **Measures**: Time to apply text transformations
- **Components Tested**:
  - Bionic reading (bold first letters)
  - Syllable highlighting
  - Grammar color-coding
  - DOM manipulation

**Expected Results**:

```
Mean: ~150-250ms
Min: ~100-150ms
Max: ~250-300ms
```

**Optimization Tips**:

- TreeWalker API for efficient node traversal
- DocumentFragment for batch DOM updates
- CSS-based highlighting (no inline styles)

---

#### 9. Citation Capture

- **File**: `tests/performance/performance-benchmarks.test.js`
- **Target**: <200ms
- **Measures**: Time to extract and save metadata
- **Components Tested**:
  - Metadata extraction (Open Graph, meta tags)
  - Citation formatting (Harvard style)
  - Storage save

**Expected Results**:

```
Mean: ~80-150ms
Min: ~50-100ms
Max: ~150-200ms
```

**Optimization Tips**:

- Metadata extraction uses querySelector (fast)
- Formatting is template-based (no parsing)
- Storage API is async (non-blocking)

---

#### 10. Profile Switch

- **File**: `tests/performance/performance-benchmarks.test.js`
- **Target**: <200ms
- **Measures**: Time to apply all profile settings
- **Components Tested**:
  - Settings merge
  - Feature reconfiguration
  - UI updates

**Expected Results**:

```
Mean: ~80-150ms
Min: ~50-100ms
Max: ~150-200ms
```

**Optimization Tips**:

- Settings are pre-loaded from storage
- Features are notified via event bus (parallel)
- DOM updates are batched (requestAnimationFrame)

---

## Running the Benchmarks

### Command Line

```bash
# Run all performance benchmarks
npm run test -- tests/performance/performance-benchmarks.test.js

# Run with verbose output
npm run test -- tests/performance/performance-benchmarks.test.js --verbose

# Run specific benchmark
npm run test -- tests/performance/performance-benchmarks.test.js -t "TTS Initialization"
```

### Expected Output

```
PASS  tests/performance/performance-benchmarks.test.js

[Benchmark] TTS Initialization
  Iterations: 10/10
  Mean: 87.42ms (target: 200ms)
  Min: 65.23ms
  Max: 112.45ms
  Std Dev: 15.67ms
  Status: ✓ PASS

[Benchmark] STT Activation
  Iterations: 10/10
  Mean: 95.12ms (target: 200ms)
  Min: 78.34ms
  Max: 118.56ms
  Std Dev: 12.34ms
  Status: ✓ PASS

... (additional benchmarks)

================================================================================
PERFORMANCE BENCHMARK SUMMARY
================================================================================

All critical paths have been benchmarked.
See individual test results above for detailed statistics.

Performance Targets:
  - User interaction response: <100ms
  - Feature initialization: <200ms
  - API-dependent operations: <500ms (with local fallback <300ms)
  - Full page transformations: <300ms
================================================================================
```

---

## Interpreting Results

### Pass/Fail Criteria

- **PASS**: Mean execution time is **below** the target threshold
- **FAIL**: Mean execution time is **above** the target threshold

### Statistical Significance

- **Iterations**: Each benchmark runs 10+ times to account for variance
- **Warm-up**: First run is discarded (JIT compilation, cache warming)
- **Standard Deviation**: Measures consistency (lower is better)

### Acceptable Variance

| Metric      | Acceptable Range | Action if Exceeded         |
| ----------- | ---------------- | -------------------------- |
| **Mean**    | Within target    | ✓ Pass                     |
| **Mean**    | 10% over target  | ⚠ Review optimization     |
| **Mean**    | 25%+ over target | ✗ Fail - refactor required |
| **Std Dev** | <20% of mean     | ✓ Consistent               |
| **Std Dev** | >30% of mean     | ⚠ Investigate outliers    |

---

## Troubleshooting Failing Benchmarks

### Common Issues

#### 1. High Mean Time (Above Target)

**Root Causes**:

- Synchronous blocking operations
- Excessive DOM manipulation
- Large data structures (arrays, objects)
- Inefficient loops

**Solutions**:

- Profile with Chrome DevTools Performance tab
- Use `requestAnimationFrame` for DOM batching
- Optimize data structures (Map vs Object, Set vs Array)
- Use Web Workers for heavy computation

---

#### 2. High Standard Deviation (Inconsistent)

**Root Causes**:

- Network variability (API calls)
- Garbage collection pauses
- Browser throttling (background tabs)
- Test environment noise

**Solutions**:

- Mock network calls in benchmarks
- Increase iteration count (20+ for better averaging)
- Run tests in foreground tab
- Close other browser tabs/processes

---

#### 3. All Iterations Failing

**Root Causes**:

- Missing dependencies (mocks, globals)
- Syntax errors in test code
- Runtime exceptions

**Solutions**:

- Check Jest console output for error stack traces
- Verify all imports are mocked correctly
- Add `try/catch` blocks to identify failing step

---

## Continuous Integration

### GitHub Actions

Add to `.github/workflows/ci.yml`:

```yaml
- name: Run Performance Benchmarks
  run: npm run test -- tests/performance/performance-benchmarks.test.js
```

### Pre-commit Hook

Add to `.husky/pre-commit`:

```bash
# Run performance benchmarks before commit (optional)
npm run test -- tests/performance/performance-benchmarks.test.js --silent
```

---

## Optimization Recommendations

### General Guidelines

1. **Minimize DOM Access**: Cache element references
2. **Batch DOM Updates**: Use DocumentFragment or requestAnimationFrame
3. **Lazy Load**: Only initialize features when needed
4. **Cache Aggressively**: Store API responses, computed values
5. **Debounce User Input**: Delay processing until user stops typing (300ms)
6. **Use Web Workers**: Offload heavy computation (OCR, NLP)
7. **Profile First**: Use Chrome DevTools before optimizing blindly

### Feature-Specific Tips

| Feature            | Optimization                                      |
| ------------------ | ------------------------------------------------- |
| **TTS**            | Lazy load voices, reuse utterances                |
| **STT**            | Debounce interim results (100ms)                  |
| **OCR**            | Upscale only if needed, process pages in parallel |
| **Reading Mode**   | Clone DOM once, cache Readability results         |
| **Highlight Menu** | Pre-create menu (hide/show with CSS)              |
| **Dictionary**     | LRU cache (100 entries), debounce lookups         |
| **Translation**    | Cache translations (7-day TTL), batch requests    |
| **Dyslexia Mode**  | Use TreeWalker, batch DOM updates                 |
| **Citations**      | Template-based formatting, async storage          |
| **Profiles**       | Parallel feature updates, batch DOM changes       |

---

## Benchmark Maintenance

### When to Update Benchmarks

- After adding new critical features
- After significant refactoring
- After dependency updates (Chrome API changes)
- When performance regressions are reported

### Updating Targets

If real-world usage shows targets are too strict or too lenient:

1. Gather telemetry data (average execution times)
2. Calculate 95th percentile (P95) from production
3. Set new target to P95 + 20% buffer
4. Update `target` parameter in test file
5. Document change in this file

---

## References

- [Web Performance Best Practices](https://web.dev/fast/)
- [Chrome Extension Performance](https://developer.chrome.com/docs/extensions/mv3/performance/)
- [JavaScript Performance Tips](https://developer.mozilla.org/en-US/docs/Web/Performance/JavaScript_performance_best_practices)
- [AssisT CLAUDE.md](../../CLAUDE.md) - Project standards

---

## Appendix: Test File Structure

```
tests/performance/
├── performance-benchmarks.test.js  # Main benchmark suite
└── README.md                       # Quick start guide (optional)
```

### Test File Organization

Each benchmark follows this pattern:

```javascript
describe('Performance Benchmark N: Feature Name', () => {
  beforeEach(() => {
    // Set up mocks, DOM, etc.
  });

  test('Feature meets <XYZ>ms target', async () => {
    const result = await runBenchmark(
      'Feature Name',
      async () => {
        // Code to benchmark
      },
      10, // Iterations
      200 // Target in ms
    );

    expect(result.passed).toBe(true);
    expect(result.mean).toBeLessThan(200);
  });
});
```

---

## Change Log

| Date       | Version | Changes                         | Author                |
| ---------- | ------- | ------------------------------- | --------------------- |
| 2025-11-28 | 1.0.0   | Initial benchmark suite created | Claude (AI Assistant) |

---

**Document Status**: ✓ Complete
**Last Updated**: 2025-11-28
**Next Review**: After Phase 3 launch (performance regression check)
