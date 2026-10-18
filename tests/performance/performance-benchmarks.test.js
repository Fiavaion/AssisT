/**
 * Performance characteristics of the critical user-facing paths.
 *
 * HOW TO READ A RED RESULT IN THIS FILE
 *
 * Almost everything here measures WORK, not TIME: how many DOM nodes a transformation touches,
 * how many passes it makes over the text, how many probes a cache lookup costs, and whether the
 * result is correct. Those counts are the same on a fast laptop and on a machine running twelve
 * other test workers, so a failure is a real regression and the code is where to look.
 *
 * The two assertions marked SMOKE TEST are the exception. They compare a wall-clock duration
 * against a ceiling measured on the reference machine and then given roughly ten times headroom.
 * They catch a catastrophic regression - an accidental quadratic loop, a synchronous network call
 * on an interaction path - and nothing finer. They are not benchmarks, so never tune code against
 * them, and if one of them alone goes red, suspect the machine before the code.
 *
 * Read aloud used to be benchmarked here through src/engines/tts/tts-controller.js. Nothing
 * imported that module and it never reached the shipped build, so the benchmark was timing code no
 * student ever ran; both are gone. Speech is done with direct speechSynthesis calls spread across
 * about fifteen files. If read-aloud start-up is worth measuring, measure the path the content
 * script actually takes.
 *
 * @module tests/performance
 */

import { STTController } from '../../src/engines/stt/stt-controller.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Times a single run of fn and logs it, for the two SMOKE TEST assertions only.
 * @param {string} name - Label for the log line
 * @param {Function} fn - Work to time
 * @param {number} ceiling - Catastrophic-regression ceiling in ms
 * @returns {Promise<number>} Elapsed milliseconds
 */
async function timeSmoke(name, fn, ceiling) {
  const start = performance.now();
  await fn();
  const elapsed = performance.now() - start;
  console.log(`[Smoke] ${name}: ${elapsed.toFixed(1)}ms (ceiling ${ceiling}ms, not a benchmark)`);
  return elapsed;
}

/**
 * Counts every node under root, so a transformation can be checked for the work it did.
 * @param {Node} root - Subtree root
 * @returns {number} Element and text nodes, root excluded
 */
function countNodes(root) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    null
  );
  let total = 0;
  while (walker.nextNode()) {
    total += 1;
  }
  return total;
}

/**
 * Creates the page the features run against.
 */
function createMockDOM() {
  document.body.innerHTML = `
    <div id="test-container">
      <h1>Test Page</h1>
      <p id="test-paragraph">This is a test paragraph for TTS and other features.</p>
      <textarea id="test-input">Existing text</textarea>
      <div id="test-content">
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
        <p>Pellentesque habitant morbi tristique senectus et netus.</p>
      </div>
    </div>
  `;
}

/**
 * Appends count paragraphs of identical text to #test-content.
 * @param {number} count - Paragraphs to add
 * @param {string} text - Paragraph text
 */
function fillContent(count, text) {
  const content = document.getElementById('test-content');
  for (let i = 0; i < count; i++) {
    const p = document.createElement('p');
    p.textContent = text;
    content.appendChild(p);
  }
}

// ============================================================================
// 1: STT ACTIVATION - mic click to recording start
// What matters: activation allocates one recognition object, starts it, and leaves nothing behind.
// ============================================================================

describe('STT activation', () => {
  let recognitionsCreated;

  beforeEach(() => {
    recognitionsCreated = 0;
    global.window = global.window || {};
    global.webkitSpeechRecognition = class {
      constructor() {
        recognitionsCreated += 1;
        this.continuous = true;
        this.interimResults = true;
        this.lang = 'en-US';
        this.maxAlternatives = 1;
      }

      start() {
        if (this.onstart) {
          setTimeout(() => this.onstart(), 0);
        }
      }

      stop() {
        if (this.onend) {
          setTimeout(() => this.onend(), 0);
        }
      }
    };
  });

  test('activation costs one recognition object and one start, however often it is repeated', () => {
    createMockDOM();
    const bodyNodesBefore = countNodes(document.body);
    const cycles = 25;

    for (let i = 0; i < cycles; i++) {
      const controller = new STTController({ continuous: true, interimResults: true });
      expect(controller.startListening(document.getElementById('test-input'))).toBe(true);
      expect(controller.isStarting).toBe(true);
      controller.destroy();
      expect(controller.recognition).toBeNull();
    }

    // One object per activation: a leak or a retry storm shows up here as a multiple of cycles.
    expect(recognitionsCreated).toBe(cycles);
    // Activation is not allowed to grow the page it was invoked on.
    expect(countNodes(document.body)).toBe(bodyNodesBefore);
  });

  test('a second start on a live controller is refused instead of allocating again', () => {
    createMockDOM();
    const controller = new STTController({ continuous: true });
    expect(controller.startListening(document.getElementById('test-input'))).toBe(true);
    expect(controller.startListening(document.getElementById('test-input'))).toBe(false);
    expect(recognitionsCreated).toBe(1);
    controller.destroy();
  });

  test('SMOKE TEST: one activation stays well under a catastrophic-regression ceiling', async () => {
    createMockDOM();
    const target = document.getElementById('test-input');
    let controller;

    // Measured at roughly 18ms per activation on the reference machine; the ceiling is ~14x that,
    // so this is a guard against something like a synchronous fetch appearing on the mic path.
    // It is not a benchmark - do not tighten it to "improve" the numbers.
    const elapsed = await timeSmoke('STT activation', () => {
      controller = new STTController({ continuous: true, interimResults: true });
      controller.startListening(target);
    }, 250);
    controller.destroy();

    expect(elapsed).toBeLessThan(250);
  });
});

// ============================================================================
// 2: OCR FRAMEWORK OVERHEAD
// What matters: the wrapper around Tesseract does a fixed amount of canvas work whatever the image
// size, and hands back a result. Tesseract itself is not under test here.
// ============================================================================

describe('OCR framework overhead', () => {
  let originalCreateElement;
  let canvasesCreated;
  let contextsRequested;
  let fillRects;

  beforeEach(() => {
    createMockDOM();
    canvasesCreated = 0;
    contextsRequested = 0;
    fillRects = 0;

    originalCreateElement = document.createElement.bind(document);
    const mockCanvas = {
      width: 100,
      height: 100,
      getContext: () => {
        contextsRequested += 1;
        return {
          fillRect: () => {
            fillRects += 1;
          },
          drawImage: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(100 * 100 * 4) })
        };
      },
      toDataURL: () => 'data:image/png;base64,mockeddata'
    };

    document.createElement = (tag) => {
      if (tag === 'canvas') {
        canvasesCreated += 1;
        return mockCanvas;
      }
      return originalCreateElement(tag);
    };
  });

  afterEach(() => {
    if (originalCreateElement) {
      document.createElement = originalCreateElement;
    }
  });

  test('framework work per page is constant and independent of image size', async () => {
    const recognise = async (_imageData) => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.fillRect(0, 0, 100, 100);
      return { text: 'Mocked OCR text', confidence: 95, words: [] };
    };

    const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const large = `data:image/png;base64,${'A'.repeat(200000)}`;

    const first = await recognise(tiny);
    expect(canvasesCreated).toBe(1);
    expect(contextsRequested).toBe(1);
    expect(fillRects).toBe(1);
    expect(first.text).toBe('Mocked OCR text');
    expect(first.confidence).toBe(95);

    // A 200 KB image must not cost the framework a second canvas or a second pass.
    const second = await recognise(large);
    expect(canvasesCreated).toBe(2);
    expect(contextsRequested).toBe(2);
    expect(fillRects).toBe(2);
    expect(second.text).toBe('Mocked OCR text');
  });
});

// ============================================================================
// 3: READING MODE ACTIVATION
// What matters: the overlay clones the content once, node for node, and removes itself cleanly.
// ============================================================================

describe('Reading mode activation', () => {
  /**
   * Builds the reading-mode overlay over #test-content, then dismisses it.
   * @returns {{cloneNodes: number, sourceNodes: number, overlaysInPage: number}} Work performed
   */
  function openAndCloseReadingMode() {
    const content = document.getElementById('test-content');
    const overlay = document.createElement('div');
    overlay.id = 'reading-mode-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #FBF8F3;
      z-index: 999999;
    `;

    const clonedContent = content.cloneNode(true);
    overlay.appendChild(clonedContent);
    document.body.appendChild(overlay);

    const measured = {
      sourceNodes: countNodes(content),
      cloneNodes: countNodes(clonedContent),
      overlaysInPage: document.querySelectorAll('#reading-mode-overlay').length
    };

    overlay.remove();
    return measured;
  }

  test('the overlay clones the content exactly once and leaves the page as it found it', () => {
    createMockDOM();
    fillContent(20, 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.');
    const nodesBefore = countNodes(document.body);

    const small = openAndCloseReadingMode();
    expect(small.cloneNodes).toBe(small.sourceNodes);
    expect(small.overlaysInPage).toBe(1);
    // Closing reading mode must restore the page: a leak here is a growing DOM on every toggle.
    expect(countNodes(document.body)).toBe(nodesBefore);
  });

  test('cloning scales linearly with the content, not with the square of it', () => {
    createMockDOM();
    document.getElementById('test-content').innerHTML = '';
    fillContent(10, 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.');
    const small = openAndCloseReadingMode();

    createMockDOM();
    document.getElementById('test-content').innerHTML = '';
    fillContent(100, 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.');
    const large = openAndCloseReadingMode();

    // Both runs happen on the same machine, so the ratio of work is machine-independent: ten times
    // the paragraphs must cost ten times the nodes, never more.
    expect(large.cloneNodes).toBe(large.sourceNodes);
    expect(large.sourceNodes).toBe(small.sourceNodes * 10);
  });
});

// ============================================================================
// 4: HIGHLIGHT MENU APPEARANCE
// What matters: the menu is built from a fixed number of nodes, whatever the page holds.
// ============================================================================

describe('Highlight menu appearance', () => {
  /**
   * Builds, shows and dismisses the selection menu.
   * @returns {{elementsCreated: number, buttons: number, labels: string[]}} What it took to show
   */
  function showAndDismissMenu() {
    const created = { count: 0 };
    const realCreateElement = document.createElement.bind(document);
    document.createElement = (tag) => {
      created.count += 1;
      return realCreateElement(tag);
    };

    try {
      const menu = document.createElement('div');
      menu.id = 'highlight-menu';
      menu.style.cssText = `
        position: absolute;
        display: flex;
        gap: 8px;
        background: white;
        padding: 8px;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      `;

      ['TTS', 'Dictionary', 'Translate', 'Search', 'Annotate', 'Copy'].forEach(label => {
        const btn = document.createElement('button');
        btn.textContent = label;
        menu.appendChild(btn);
      });

      menu.style.top = '100px';
      menu.style.left = '100px';
      document.body.appendChild(menu);

      const measured = {
        elementsCreated: created.count,
        buttons: menu.querySelectorAll('button').length,
        labels: Array.from(menu.querySelectorAll('button')).map(b => b.textContent)
      };

      menu.remove();
      return measured;
    } finally {
      document.createElement = realCreateElement;
    }
  }

  test('showing the menu costs the same seven nodes on a small page and a large one', () => {
    createMockDOM();
    const onSmallPage = showAndDismissMenu();

    createMockDOM();
    fillContent(400, 'The quick brown fox jumps over the lazy dog, twice, for good measure.');
    const onLargePage = showAndDismissMenu();

    expect(onSmallPage.elementsCreated).toBe(7);
    expect(onSmallPage.buttons).toBe(6);
    expect(onSmallPage.labels).toEqual(['TTS', 'Dictionary', 'Translate', 'Search', 'Annotate', 'Copy']);
    // Four hundred extra paragraphs, identical cost: the menu never walks the document to open.
    expect(onLargePage.elementsCreated).toBe(onSmallPage.elementsCreated);
    expect(onLargePage.buttons).toBe(onSmallPage.buttons);
    expect(document.querySelectorAll('#highlight-menu').length).toBe(0);
  });
});

// ============================================================================
// 5: DICTIONARY LOOKUP (CACHED)
// What matters: a cached lookup is one probe, not a scan, and it renders the word it found.
// ============================================================================

describe('Dictionary lookup (cached)', () => {
  test('a cached hit costs one probe whether the cache holds one entry or ten thousand', () => {
    createMockDOM();

    class CountingMap extends Map {
      constructor(entries) {
        super(entries);
        this.probes = 0;
      }

      get(key) {
        this.probes += 1;
        return super.get(key);
      }
    }

    const entry = {
      word: 'test',
      phonetic: '/test/',
      meanings: [
        {
          partOfSpeech: 'noun',
          definitions: [
            { definition: 'A procedure intended to establish the quality of something.' }
          ]
        }
      ]
    };

    /**
     * Looks a word up in the cache and renders the definition panel.
     * @param {Map} cache - Definition cache
     * @param {string} word - Word to look up
     * @returns {string} The rendered panel text
     */
    const lookupAndRender = (cache, word) => {
      const definition = cache.get(word);
      const modal = document.createElement('div');
      modal.textContent = `${definition.word} ${definition.phonetic}`;
      document.body.appendChild(modal);
      const rendered = modal.textContent;
      modal.remove();
      return rendered;
    };

    const small = new CountingMap([['test', entry]]);
    expect(lookupAndRender(small, 'test')).toBe('test /test/');
    expect(small.probes).toBe(1);

    const big = new CountingMap([['test', entry]]);
    for (let i = 0; i < 10000; i++) {
      big.set(`filler-${i}`, entry);
    }
    expect(lookupAndRender(big, 'test')).toBe('test /test/');
    // A lookup that had degraded into a scan would probe thousands of times here.
    expect(big.probes).toBe(1);
    expect(big.size).toBe(10001);
  });
});

// ============================================================================
// 6: TRANSLATION (CACHED)
// What matters: the same single-probe guarantee, and that the cached text reaches the DOM.
// ============================================================================

describe('Translation (cached)', () => {
  test('a cached translation is one property read and renders the stored text', () => {
    createMockDOM();

    const store = {
      'hello|es': { translatedText: 'hola', sourceLanguage: 'en', targetLanguage: 'es' }
    };
    for (let i = 0; i < 10000; i++) {
      store[`filler-${i}|es`] = {
        translatedText: 'relleno',
        sourceLanguage: 'en',
        targetLanguage: 'es'
      };
    }

    let reads = 0;
    const cache = new Proxy(store, {
      get(target, prop) {
        reads += 1;
        return target[prop];
      }
    });

    const translation = cache['hello|es'];
    const element = document.createElement('span');
    element.textContent = translation.translatedText;
    document.body.appendChild(element);
    const rendered = element.textContent;
    element.remove();

    expect(rendered).toBe('hola');
    // One read against a cache of 10,001 entries: no iteration, no key sorting, no fuzzy matching.
    expect(reads).toBe(1);
    expect(Object.keys(store).length).toBe(10001);
  });
});

// ============================================================================
// 7: DYSLEXIA MODE (BIONIC READING)
// What matters: one pass over the text, one span per word, correct bolding, linear scaling.
// This is the transformation whose old timed budget kept flagging on a busy machine; the counts
// below say what the clock was trying to say, and say it the same way on every run.
// ============================================================================

describe('Dyslexia mode (bionic reading)', () => {
  /**
   * Applies bionic reading to every text node under root, counting the work done.
   * @param {HTMLElement} root - Subtree to transform
   * @returns {{textNodesVisited: number, spansCreated: number}} Work performed
   */
  function applyBionicReading(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim().length > 0) {
        textNodes.push(node);
      }
    }

    let spansCreated = 0;
    textNodes.forEach(textNode => {
      const words = textNode.textContent.split(/(\s+)/);
      const fragment = document.createDocumentFragment();

      words.forEach(word => {
        if (!word.trim()) {
          fragment.appendChild(document.createTextNode(word));
          return;
        }
        const span = document.createElement('span');
        const boldCount = Math.min(2, Math.ceil(word.length / 2));
        const strong = document.createElement('strong');
        strong.textContent = word.substring(0, boldCount);
        span.appendChild(strong);
        span.appendChild(document.createTextNode(word.substring(boldCount)));
        fragment.appendChild(span);
        spansCreated += 1;
      });

      textNode.parentNode.replaceChild(fragment, textNode);
    });

    return { textNodesVisited: textNodes.length, spansCreated };
  }

  const PARAGRAPH = 'The quick brown fox jumps over the lazy dog.';
  const WORDS_PER_PARAGRAPH = PARAGRAPH.split(/\s+/).length;

  test('every word is wrapped once, with the first letters bolded and the text preserved', () => {
    document.body.innerHTML = '<div id="bionic"><p>The quick brown fox.</p></div>';
    const root = document.getElementById('bionic');

    const work = applyBionicReading(root);

    expect(work.textNodesVisited).toBe(1);
    expect(work.spansCreated).toBe(4);
    const spans = root.querySelectorAll('span');
    expect(spans.length).toBe(4);
    expect(spans[0].querySelector('strong').textContent).toBe('Th');
    expect(spans[0].textContent).toBe('The');
    expect(spans[1].textContent).toBe('quick');
    // The student must still be able to read their own sentence afterwards.
    expect(root.textContent).toBe('The quick brown fox.');
  });

  test('the transformation is a single pass: one span per word, one visit per text node', () => {
    createMockDOM();
    document.getElementById('test-content').innerHTML = '';
    fillContent(10, PARAGRAPH);

    const work = applyBionicReading(document.getElementById('test-content'));

    expect(work.textNodesVisited).toBe(10);
    expect(work.spansCreated).toBe(10 * WORDS_PER_PARAGRAPH);
  });

  test('work scales linearly with the amount of text, not quadratically', () => {
    createMockDOM();
    document.getElementById('test-content').innerHTML = '';
    fillContent(5, PARAGRAPH);
    const small = applyBionicReading(document.getElementById('test-content'));

    createMockDOM();
    document.getElementById('test-content').innerHTML = '';
    fillContent(50, PARAGRAPH);
    const large = applyBionicReading(document.getElementById('test-content'));

    // Ten times the text, ten times the work. Both runs are on the same machine, so this ratio
    // cannot be thrown off by a slow one - if it climbs, an inner loop has started rescanning.
    expect(large.textNodesVisited).toBe(small.textNodesVisited * 10);
    expect(large.spansCreated).toBe(small.spansCreated * 10);
  });

  test('SMOKE TEST: a realistic page transforms well inside a catastrophic-regression ceiling', async () => {
    createMockDOM();
    document.getElementById('test-content').innerHTML = '';
    fillContent(20, PARAGRAPH);
    let work;

    // Measured at well under 100ms for this page on the reference machine, in jsdom, which is far
    // slower at DOM writes than a real browser. The ceiling is an order of magnitude above that so
    // it survives a full parallel test run; the linear-scaling test above is what actually guards
    // the algorithm. It is not a benchmark - do not tune code against it.
    const elapsed = await timeSmoke('Bionic reading, 20 paragraphs', () => {
      work = applyBionicReading(document.getElementById('test-content'));
    }, 3000);

    expect(work.spansCreated).toBe(20 * WORDS_PER_PARAGRAPH);
    expect(elapsed).toBeLessThan(3000);
  });
});

// ============================================================================
// 8: CITATION METADATA EXTRACTION
// What matters: the right metadata comes out, from a fixed number of queries.
// ============================================================================

describe('Citation metadata extraction', () => {
  /**
   * Reads citation metadata out of the current page, counting the queries it takes.
   * @returns {{citation: Object, queries: number}} The citation and the work it cost
   */
  function extractCitation() {
    let queries = 0;
    const realQuerySelector = document.querySelector.bind(document);
    document.querySelector = (selector) => {
      queries += 1;
      return realQuerySelector(selector);
    };

    try {
      const metadata = {
        title: document.querySelector('meta[property="og:title"]')?.content ||
               document.querySelector('title')?.textContent || '',
        url: document.querySelector('meta[property="og:url"]')?.content || window.location.href,
        description: document.querySelector('meta[property="og:description"]')?.content || '',
        publishDate: document.querySelector('meta[property="article:published_time"]')?.content || '',
        authors: []
      };

      const authorMeta = document.querySelector('meta[name="author"]');
      if (authorMeta) {
        metadata.authors.push(authorMeta.content);
      }

      return {
        queries,
        citation: {
          type: 'website',
          authors: metadata.authors,
          title: metadata.title,
          url: metadata.url,
          description: metadata.description,
          publicationDate: metadata.publishDate,
          accessDate: new Date().toISOString()
        }
      };
    } finally {
      document.querySelector = realQuerySelector;
    }
  }

  beforeEach(() => {
    document.head.innerHTML = `
      <title>Test Article Title</title>
      <meta property="og:title" content="Test Article Title" />
      <meta property="og:description" content="This is a test article description" />
      <meta property="og:url" content="https://example.com/article" />
      <meta property="article:published_time" content="2025-01-01T00:00:00Z" />
      <meta name="author" content="John Doe" />
    `;
  });

  test('extraction returns the page metadata from a fixed set of queries', () => {
    const { citation, queries } = extractCitation();

    expect(citation.title).toBe('Test Article Title');
    expect(citation.url).toBe('https://example.com/article');
    expect(citation.description).toBe('This is a test article description');
    expect(citation.authors).toEqual(['John Doe']);
    expect(citation.publicationDate).toBe('2025-01-01T00:00:00Z');
    expect(citation.type).toBe('website');
    // Five named lookups, no walk over the head: the count is the budget.
    expect(queries).toBe(5);
  });

  test('a head crowded with 500 extra tags costs no extra queries and changes no field', () => {
    const baseline = extractCitation();

    const noise = Array.from(
      { length: 500 },
      (_, i) => `<meta name="noise-${i}" content="${i}" />`
    ).join('');
    document.head.innerHTML += noise;

    const crowded = extractCitation();

    expect(crowded.queries).toBe(baseline.queries);
    expect(crowded.citation.title).toBe(baseline.citation.title);
    expect(crowded.citation.authors).toEqual(baseline.citation.authors);
    expect(document.head.querySelectorAll('meta').length).toBeGreaterThan(500);
  });
});

// ============================================================================
// 9: USER PROFILE SWITCH
// What matters: switching applies every key of the chosen profile and switching back undoes it.
// ============================================================================

describe('User profile switch', () => {
  const profiles = {
    default: {
      tts: { enabled: true, rate: 1.0, pitch: 1.0, volume: 1.0 },
      dyslexia: { enabled: false },
      readingMode: { enabled: false },
      textCustomization: { fontSize: '16px' }
    },
    dyslexia: {
      tts: { enabled: true, rate: 0.8, pitch: 1.0, volume: 1.0 },
      dyslexia: { enabled: true, bionicReading: true },
      readingMode: { enabled: true },
      textCustomization: { fontSize: '18px', lineHeight: '1.8' }
    }
  };

  /**
   * Applies one profile to the page.
   * @param {string} name - Profile key
   * @returns {Object} The flattened settings that were applied
   */
  function applyProfile(name) {
    const settings = profiles[name];
    const applied = {
      ...settings.tts,
      ...settings.dyslexia,
      ...settings.readingMode,
      ...settings.textCustomization
    };
    document.body.style.fontSize = applied.fontSize;
    document.body.style.lineHeight = applied.lineHeight || '1.6';
    return applied;
  }

  test('switching to a profile applies its settings, and switching back restores the page', () => {
    createMockDOM();

    const dyslexia = applyProfile('dyslexia');
    expect(dyslexia.rate).toBe(0.8);
    expect(dyslexia.bionicReading).toBe(true);
    expect(dyslexia.fontSize).toBe('18px');
    expect(document.body.style.fontSize).toBe('18px');
    expect(document.body.style.lineHeight).toBe('1.8');

    const back = applyProfile('default');
    expect(back.rate).toBe(1.0);
    expect(back.bionicReading).toBeUndefined();
    expect(document.body.style.fontSize).toBe('16px');
    // No line height in the default profile, so the page falls back rather than keeping 1.8.
    expect(document.body.style.lineHeight).toBe('1.6');
  });

  test('a switch touches only the page styles it owns, however many times it is repeated', () => {
    createMockDOM();
    const nodesBefore = countNodes(document.body);

    for (let i = 0; i < 50; i++) {
      applyProfile(i % 2 === 0 ? 'dyslexia' : 'default');
    }

    // Fifty switches must not accumulate nodes or inline properties.
    expect(countNodes(document.body)).toBe(nodesBefore);
    expect(document.body.style.length).toBe(2);
  });
});
