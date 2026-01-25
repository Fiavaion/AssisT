# Building a polished RSVP reader for Chrome extensions

The most effective RSVP (Rapid Serial Visual Presentation) implementations combine **ORP (Optimal Recognition Point) positioning**, **intelligent pause timing**, and **accessibility-first defaults** to deliver a reading experience that genuinely benefits users with dyslexia, ADHD, and attention difficulties. Research shows ADHD users experience approximately **13% improved comprehension** with RSVP compared to traditional reading, while comprehension remains stable at speeds up to **350 WPM** for most users.

The highest-rated Chrome extension, **Reedy (4.8 stars)**, uses an in-page overlay with hover-to-select text blocks—a pattern that outperforms popup windows for user experience. The key technical components are Mozilla's `@mozilla/readability` for content extraction, Shadow DOM for style isolation, and a timing engine with punctuation-aware pauses.

## ORP positioning is the foundation of effective RSVP

The Optimal Recognition Point positions each word so the eye fixates at the optimal location—**approximately 30% into the word**, slightly left of center. Spritz pioneered this technique, and research confirms it eliminates saccadic eye movements that slow traditional reading.

The ORP calculation follows a standard algorithm based on word length:

| Word Length | ORP Position  | Example ("reading") |
| ----------- | ------------- | ------------------- |
| 1-2 letters | 1st character | "**I**", "**t**o"   |
| 3-6 letters | 2nd character | "h**e**llo"         |
| 7-9 letters | 3rd character | "re**a**ding"       |
| 10+ letters | 4th character | "ext**r**aordinary" |

```typescript
function calculateORP(word: string): number {
  const len = word.replace(/[^\w]/g, '').length;
  if (len <= 2) return 0;
  if (len <= 6) return 1;
  if (len <= 9) return 2;
  return 3;
}

function splitWordForDisplay(word: string) {
  const orpIndex = calculateORP(word);
  return {
    before: word.slice(0, orpIndex),
    orp: word[orpIndex] || '',
    after: word.slice(orpIndex + 1),
  };
}
```

The critical implementation detail: **align the ORP character to a fixed screen position** rather than center-aligning words. This eliminates all horizontal eye movement. The display container should accommodate approximately **13 characters** (the human perceptual span) with the ORP positioned at the **40% mark** from the left edge. The ORP character should be highlighted in **red (#FF0000)** or another high-contrast accent color against the rest of the word.

## Typography and visual design directly impact reading speed

Sans-serif fonts outperform serif fonts for RSVP reading, particularly at lower luminance levels. **Monospace fonts** provide the most stable ORP positioning since character widths remain consistent regardless of letter content. The optimal configuration uses **24-32px font size** with **normal to slightly expanded letter spacing**.

For the word display container, dark themes reduce eye strain during sustained reading. Use **#121212** (Material Design dark surface) rather than pure black to create visual depth, with text at **90% white opacity** to reduce halation. The container should be **400-500px wide** with **32-48px padding** and subtle alignment guides (hash marks) above and below the focal point.

The visual hierarchy for a polished RSVP reader includes:

```css
.rsvp-container {
  background: #121212;
  border-radius: 8px;
  padding: 32px 48px;
  min-width: 400px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.word-display {
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 32px;
  min-height: 1.5em;
}

.orp-character {
  color: #ff6b6b;
  font-weight: bold;
}

.word-before,
.word-after {
  color: rgba(255, 255, 255, 0.9);
}
```

Progress indicators should include a **thin horizontal progress bar** (4-8px height), **percentage complete**, and **time remaining** displayed as MM:SS. The time calculation is straightforward: `(remainingWords / WPM) * 60`. Controls should support keyboard shortcuts matching industry standards: **Space** for play/pause, **Arrow Up/Down** for speed adjustment (±25 WPM), and **Arrow Left/Right** for word navigation.

## Intelligent pause timing preserves comprehension

Research shows that RSVP comprehension degrades when natural reading pauses are eliminated. Implementing **punctuation-aware delays** restores these pauses computationally:

| Punctuation            | Pause Multiplier | Effect at 300 WPM (200ms base) |
| ---------------------- | ---------------- | ------------------------------ |
| Period, !, ?           | 2.0×             | 400ms pause                    |
| Colon, semicolon       | 1.5×             | 300ms pause                    |
| Comma                  | 1.25×            | 250ms pause                    |
| Long words (10+ chars) | 1.2×             | 240ms pause                    |
| Paragraph break        | 3.0×             | 600ms pause                    |

```typescript
function getWordDelay(word: string, wpm: number): number {
  const baseDelay = 60000 / wpm;

  if (/[.!?]$/.test(word)) return baseDelay * 2.0;
  if (/[,;:]$/.test(word)) return baseDelay * 1.5;
  if (word.length >= 10) return baseDelay * 1.2;

  return baseDelay;
}
```

The default WPM should be **250-300**—this matches average subvocalization speed and maintains comprehension parity with traditional reading. Offer a range from **60 WPM** (accessibility minimum) to **1000 WPM** (trained speed readers), with **25 WPM increments** for fine-grained control. Above 350 WPM, comprehension begins degrading significantly.

## Content extraction requires Mozilla's Readability library

The `@mozilla/readability` package (the engine behind Firefox Reader View) provides the most reliable article extraction for arbitrary web pages. Install with `npm install @mozilla/readability` and pair with `dompurify` for security.

```typescript
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import DOMPurify from 'dompurify';

function extractArticleContent(): string | null {
  if (!isProbablyReaderable(document)) return null;

  const documentClone = document.cloneNode(true) as Document;
  const reader = new Readability(documentClone, {
    charThreshold: 500,
    nbTopCandidates: 5,
  });

  const article = reader.parse();
  if (!article) return null;

  const cleanHTML = DOMPurify.sanitize(article.content);
  const temp = document.createElement('div');
  temp.innerHTML = cleanHTML;
  return temp.textContent || '';
}
```

For Chrome Extension Manifest V3, the required permissions are `storage` (for user preferences), `activeTab` (current tab access), and `scripting` (dynamic script injection). Use Shadow DOM with `mode: 'closed'` to isolate extension styles from page styles and prevent page scripts from accessing extension internals.

## Existing extensions reveal proven patterns

**Reedy** (4.8 stars, open source at `github.com/olegcherr/Reedy-for-Chrome`) leads the market with its in-page overlay approach, hover-to-select text blocks, and gradual acceleration mode. **Sprint Reader** (241 GitHub stars at `github.com/anthonynosek/sprint-reader-chrome`) offers intelligent hyphenation for 40+ languages and grammar-aware delays. **Stutter** (`github.com/jamestomasino/stutter`, 155 stars) provides excellent internationalization with full Readability integration.

The highest-rated implementations share common patterns: **Alt+S or Alt+R hotkey activation**, **context menu integration** for text selection, **draggable/repositionable UI**, and **statistics tracking** showing words read and time saved. Users consistently praise free/open-source options with extensive customization while criticizing extensions that can't pause for reflection on complex material.

For differentiation, consider implementing **hover-to-select text blocks** (Reedy's standout feature), **gradual acceleration mode** (starts slow, increases as the user adjusts), **comprehension testing**, and **chunk reading** (displaying 2-3 words at a time for reduced cognitive load).

## Accessibility features are essential, not optional

RSVP provides documented benefits for users with reading difficulties. Research published in PubMed (2024) found that **ADHD participants showed ~13% comprehension improvement** with RSVP relative to traditional reading, as eliminating eye movements removed interference in reading processes. For users with dyslexia, RSVP eliminates tracking difficulties and reduces visual crowding that impairs single-word recognition.

WCAG 2.1 Level AA compliance requires **4.5:1 contrast ratio** for normal text and **3:1 for large text** (24px+). For an accessibility-focused reader, target Level AAA standards: **7:1 contrast for body text**. Provide light, dark, and high-contrast themes:

```typescript
const themes = {
  light: { bg: '#FFFFFF', text: '#1A1A1A', orp: '#CC0000' },
  dark: { bg: '#121212', text: '#E8E8E8', orp: '#FF6B6B' },
  highContrast: { bg: '#000000', text: '#FFFFFF', orp: '#FFFF00' },
};
```

Text must be **resizable to 200%** without content loss—use relative units (rem, em) rather than fixed pixels. Offer **OpenDyslexic** or **Lexie Readable** as font options. Implement keyboard navigation for all controls, clear focus indicators, and a reduced-motion option for users with vestibular disorders.

## Complete implementation architecture

The recommended technology stack uses **TypeScript** with **Svelte** or **vanilla JS** for minimal bundle size, **Vite** for building, and the following structure:

```
speed-reader-extension/
├── manifest.json           # MV3 configuration
├── background.js           # Service worker
├── content/
│   ├── content.ts         # Main entry, Shadow DOM setup
│   ├── reader.ts          # RSVP timing engine
│   ├── orp.ts             # ORP calculation utilities
│   ├── overlay.ts         # UI components
│   └── text-processor.ts  # Tokenization, pause logic
├── lib/
│   └── readability.js     # Bundled @mozilla/readability
├── popup/                  # Extension popup UI
├── options/                # Settings page
└── styles/                 # Theme CSS
```

The core RSVP engine follows this pattern:

```typescript
class RSVPReader {
  private words: string[] = [];
  private currentIndex = 0;
  private wpm = 300;
  private isPlaying = false;
  private timerId: number | null = null;

  loadText(text: string) {
    this.words = text.split(/\s+/).filter(w => w.length > 0);
    this.currentIndex = 0;
  }

  play() {
    this.isPlaying = true;
    this.tick();
  }

  pause() {
    this.isPlaying = false;
    if (this.timerId) clearTimeout(this.timerId);
  }

  private tick() {
    if (!this.isPlaying || this.currentIndex >= this.words.length) return;

    const word = this.words[this.currentIndex];
    const display = splitWordForDisplay(word);
    this.renderWord(display);

    const delay = getWordDelay(word, this.wpm);
    this.timerId = window.setTimeout(() => {
      this.currentIndex++;
      this.tick();
    }, delay);
  }
}
```

For reference implementations to adapt, start with **jetzt** (`github.com/ds300/jetzt`, 493 stars, Apache 2.0) for Chrome extension patterns, **quickreader** (`github.com/coinstax/quickreader`, MIT) for modern TypeScript ORP utilities, and **react-speed-reader** (npm package) if building a React-based UI. The `@mozilla/readability` package handles content extraction, and Shadow DOM with closed mode provides the style isolation needed for reliable overlay rendering across arbitrary web pages.

## Conclusion

Building a polished RSVP reader requires attention to three domains: **visual precision** (ORP positioning at 40% mark, monospace fonts, fixed focal point), **timing intelligence** (punctuation pauses, speed limits around 350 WPM for comprehension), and **accessibility rigor** (WCAG AAA contrast, dyslexia fonts, keyboard-only operation). The existing open-source implementations—particularly Reedy, jetzt, and quickreader—provide production-tested code patterns that can be directly adapted.

The most impactful differentiating features to implement are hover-to-select content extraction (eliminates manual text selection), gradual acceleration mode (builds user confidence), and peripheral context display (shows faded surrounding words to aid comprehension). For an accessibility-focused extension, default to 250 WPM with 2× pause on sentence endings, and always provide the ability to skip backward—research confirms that inability to regress is RSVP's primary comprehension limitation.
