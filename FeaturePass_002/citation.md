## Building an Accessibility-First Citation Extension for NCAD

The citation management landscape offers powerful tools for academic research, yet **none of the major platforms—Zotero, Mendeley, EndNote, Paperpile, or RefWorks—explicitly address accessibility needs for neurodivergent students**. With 15-25% of students experiencing ADHD, dyslexia, autism, or related differences, this represents a critical design gap. For NCAD students with learning difficulties, an accessibility-focused browser extension could transform the research experience by combining citation management with neurodivergent-friendly design from the ground up.

This research synthesizes insights from citation tools, visual organization systems, accessibility technologies, and technical implementation approaches to inspire development of an NCAD-specific solution.

---

## The citation tool accessibility gap

**Zotero dominates the open-source space** with its robust Connector browser extension capturing citations from thousands of websites, automatic PDF downloads, and comprehensive Harvard referencing support including Cite Them Right 12th and 13th editions. The Connector's architecture—injecting translation frameworks into web pages, maintaining translator caches, and communicating with local clients—provides a proven technical foundation. Yet Zotero users with learning difficulties have identified painful gaps: no spell-check in metadata fields forces dyslexic users to copy text into Word, no built-in text-to-speech requires external tools, and no bionic reading mode leaves ADHD users struggling with large text bodies.

**Commercial alternatives fare no better** on accessibility. Paperpile leads with its clean, minimalist interface that naturally reduces cognitive load through uncluttered design, making it the least overwhelming option for ADHD users. Its Google Docs integration and automatic thumbnail generation provide visual organization benefits. Yet like Mendeley, EndNote, RefWorks, and Citavi, Paperpile offers no dyslexia-friendly fonts, no customizable spacing, no focus modes, and no acknowledgment of neurodivergent users in documentation. The tools comparison reveals a consistent pattern: **powerful features for citation management, zero consideration for cognitive accessibility**.

---

## NCAD's specific citation requirements

NCAD officially mandates **Cite Them Right Harvard style**, referring students to the Edward Maher Library's guides and offering Zotero training sessions. The formatting rules are precise: author-date citations use "and" not ampersands (Smith and Jones, 2020), page numbers require commas before "p." notation, and all online sources need access dates in Day Month Year format. The 12th edition changed DOI display to full URLs, while the 13th edition removed place of publication entirely. Irish colleges consistently recommend Cite Them Right as the authoritative Harvard variant, with minimal regional variations beyond European date formatting.

**The critical insight**: Students struggle not with NCAD's requirements themselves but with **visually matching citation examples** when they have visual processing challenges. Traditional citation instruction shows finished products ("make it look like this") rather than providing verbal descriptions of formatting logic. For screen reader users or those with visual learning difficulties, this approach fails completely. An accessible citation tool must generate correctly formatted references automatically while teaching the underlying structure through clear verbal explanations, not just visual mimicry.

---

## Visual organization transforms research management

**Card-based interfaces fundamentally change information processing** for visual learners. Raindrop.io exemplifies this with grid, masonry, and headline views that display bookmarks as visual cards with automatic thumbnail generation. The human brain processes images 60,000 times faster than text; thumbnails enable rapid scanning through large collections while spatial memory allows location-based recall. Raindrop's permanent copies ensure thumbnails persist even when original pages disappear, addressing a common frustration with ephemeral web content.

**Citation visualization reveals research landscapes** through network mapping. Litmaps displays papers as nodes connected by citation relationships, with customizable axes showing publication dates, citation counts, or title similarity. The interactive maps let researchers spot seminal papers (recent and highly cited cluster in top-right), identify research gaps through sparse network areas, and understand field evolution through chronological arrangement. Adjustable color coding, ring versus standard layouts, and exportable visualizations make complex citation networks comprehensible at a glance.

**Kanban boards structure research workflows** through visual progression. Trello's drag-and-drop cards moving through "To Read," "In Progress," and "Cited" columns provide external structure for ADHD users who struggle with executive function. Notion and Airtable add gallery views where cover images dominate—research papers displayed with journal covers or article thumbnails rather than text-only lists. Combining citation management with visual organization addresses both bibliographic accuracy and cognitive accessibility simultaneously.

### Thumbnail generation technical approaches

Open Graph protocol extraction (`og:image` meta tags) provides the primary method, with screenshot APIs (Urlbox, ThumbnailWS) offering fallbacks for pages without embedded images. Mozilla's Readability library, used by Firefox Reader View, parses DOM structures to identify article content and associated images. JavaScript libraries like `open-graph-scraper` and `extruct` support multiple metadata formats simultaneously. Optimal thumbnail dimensions of 1200×630 pixels for social sharing scale down to 200-400 pixel widths for card displays, with lazy loading and progressive image rendering ensuring performance.

---

## Source credibility evaluation for student researchers

**NewsGuard stands out among fact-checking extensions** through human journalist evaluation rather than algorithmic scoring. Forty-plus reporters assess websites against nine journalistic criteria, providing "Nutrition Labels" with detailed rating explanations. The service is **free for libraries and schools**, making it ideal for educational institutions like NCAD. Color-coded shield icons (green/red) appear on websites and within Google searches, offering immediate visual feedback about source reliability. This transparency teaches evaluation methodology while protecting students from misinformation.

**Academic source verification addresses different needs**. The Source Taster cross-references citations against OpenAlex, Crossref, Semantic Scholar, Europe PMC, and arXiv to verify existence and validity—crucial for detecting AI-generated "hallucinated" citations now appearing in papers. Scite analyzes citation context using machine learning to classify whether papers support, mention, or contradict claims, moving beyond simple citation counts to assess genuine scientific consensus. LibKey Nomad connects institutional subscriptions with Unpaywall's 25 million open access articles, teaching students legitimate access pathways while flagging predatory journals through integrated Retraction Watch data.

**Only Lean Library offers predatory journal protection** through its Hijacked Journal Checker, alerting students when accessing cloned fraudulent journal websites. This remains a largely manual verification area—no other browser extensions automate predatory journal identification. Students must check Cabell's Scholarly Analytics, Think.Check.Submit checklists, or DOAJ inclusion status separately. The gap represents an opportunity for integrated protection within citation workflows.

---

## Bionic reading and neurodivergent reading support

**Bionic Reading bolds initial letters** to create artificial fixation points, theoretically letting the brain complete word recognition while eyes move faster. Multiple Chrome extensions implement this (JiffyReader, ADHD Reader, official Bionic Reading), all allowing per-page toggling. User testimony is overwhelmingly positive among neurodivergent communities, with ADHD users describing it as "game-changing" for maintaining focus through large text bodies.

Yet **scientific evidence tells a contradictory story**. Three studies in 2023 found no significant improvement or even decreased comprehension with Bionic Reading. A Dutch study with 32 students showed no speed or comprehension gains; Norwegian sixth-graders strongly disapproved of readability; Readwise's 61-participant study found 4% marginal speed improvement with reduced comprehension. The developer's own preliminary study concluded "results are not clear." This stark evidence-anecdote gap suggests either placebo effects, individual variation so extreme that some benefit while others suffer, or that neurodivergent brains process text differently enough that standard studies miss real benefits for this population. The practical implication: **offer Bionic Reading as an optional toggle**, letting users self-determine effectiveness.

**OpenDyslexic font shows similar evidence patterns**—mixed research results but strong user advocacy. Each letter has a heavier bottom creating "gravity" to prevent flipping, with distinct shapes reducing b/d/p/q confusion. The official Chrome extension (4.9/5 stars, praised by BBC) and alternatives like Dyslexia Friendly provide simple font replacement. Research suggests effectiveness varies significantly by individual; many dyslexic users prefer familiar sans-serif fonts (Arial, Verdana) over specialized options. The accessibility principle emerges clearly: **provide choice rather than mandating specific fonts**. Let users customize typography, spacing, and contrast according to personal preferences.

**Helperbird emerges as the most comprehensive accessibility solution** with 1 million users and 4.9-star rating. The free tier includes basic accessibility tools; Pro ($4.99/month) adds OpenDyslexic fonts, text-to-speech with natural voices, dyslexia rulers, reading modes, color overlays, picture dictionaries, annotations, voice typing, and AI summarization. This all-in-one approach reduces cognitive load from managing multiple extensions. Read&Write for Google Chrome offers similar comprehensive support with dual-color highlighting during text-to-speech, though at higher cost ($145/year).

### Reader modes strip cognitive clutter

**Mozilla Readability powers most reader mode implementations**, using DOM parsing to identify article content versus distractions. Scoring algorithms analyze text density, paragraph length, link density, and HTML class names to extract titles, authors, main content, and relevant images while removing ads, sidebars, navigation, and pop-ups. Mercury Reader, Chrome Reader View Extension, and Firefox's native Reader View all implement this approach with customizable typefaces, text sizes, and dark themes. For ADHD users, **removing visual noise fundamentally changes reading experiences** by eliminating the constant temptation of sidebars, ads, and links.

Focus-specific extensions go further. Focus Ex, developed through one-year research, provides custom "Focus Sans" typeface with enlarged letter-spacing, focus mode highlighting current paragraphs, clean function removing unnecessary content, and Kill Caps converting disruptive all-caps to sentence case. LumiRead from Northeastern University combines dyslexia-friendly fonts, AI text simplification at adjustable reading levels, pop-up ad blocking, and natural text-to-speech voices—all designed with neurodiversity consultants. These tools recognize that **reading accessibility requires addressing both text characteristics and environmental distractions simultaneously**.

---

## Neuro-inclusive design principles for academic tools

**Reducing cognitive load forms the foundation** of ADHD-friendly interfaces. Research comparing standard and ADHD-friendly websites found both groups benefited from redesigns but ADHD users experienced greater challenges with originals. The findings confirm that **ADHD-sensitive design improves experiences for everyone**—a universal design principle. Implementation means clean minimalist layouts with calm color palettes, ample white space between sections, uncluttered interfaces avoiding decorative distractions, limited choices per screen (Hick's Law: more options increases decision difficulty), and content chunked into short manageable sections with clear headings.

**Visual hierarchy guides attention** through color-coding important elements, bullet points and numbered lists replacing continuous prose, panels grouping related information, and progressive disclosure gradually revealing details rather than overwhelming users immediately. Memory support provides visible reminders eliminating forced memorization—form labels remaining visible when clicked, breadcrumbs showing location, clear instructions staying present, not hiding in tooltips. Focus modes toggle to hide non-essential content, minimal animations with disable options, no auto-playing media, and dark mode options reducing visual stimulation.

**Dyslexia-friendly typography follows British Dyslexia Association guidelines**: sans-serif fonts (Arial, Verdana, Tahoma, Open Sans, Comic Sans), 12-14 point minimum size, rounded letters with clear differentiation between similar characters, left-aligned text without justification, avoiding italics and all-caps, bold or color for emphasis, short paragraphs with regular breaks, 45-65 character line length, increased letter spacing (kerning), and 1.5× minimum line spacing. Color and contrast choices matter profoundly: **dark grey text instead of pure black**, soft muted backgrounds instead of pure white (cream or pastels preferred), high 4.5:1 contrast ratios for normal text, and avoiding green/red/pink (colorblind difficulties).

### Multi-modal presentation serves diverse learning styles

**Universal Design for Learning (UDL) provides the framework**: multiple means of engagement (meaningful choices, personal interest options, self-regulation support, progress celebration), multiple means of representation (visual diagrams/videos, audio options, text alternatives for visuals), and multiple means of action and expression (oral versus written assessment, graphic organizers, digital demonstration tools). Research shows students with good organizational skills have better outcomes across well-being areas—tools providing external structure compensate for executive function challenges.

**Leantime exemplifies neurodivergent-focused design** in project management through dopamine-boosting progress visualization, AI-driven task prioritization, reduced cognitive load layouts based on research, celebration prompts for micro-achievements, and visual progress bars at individual/project/company levels. This targets ADHD dopamine regulation challenges directly. Motion and Fireflies.ai provide similar executive function support through automated task scheduling and auto-generated meeting notes with transcription, eliminating note-taking while maintaining focus.

---

## Technical implementation architecture

**Browser extensions in Manifest V3** require service workers replacing persistent background pages, content scripts with DOM access injected into web pages, and injected scripts running in page context to access JavaScript variables. Message passing connects layers—content scripts send extracted metadata to service workers handling API calls and storage. Zotero Connector's proven architecture injects full translation frameworks into each page, maintains translator caches in background processes, performs initial URL-based detection via regex matching, and routes translated items to local clients (port 23119 HTTP server) or zotero.org Web API fallback.

**Metadata capture supports multiple standards**: basic HTML meta tags (author, description), OpenGraph protocol (og:title, og:image, og:type widely adopted by publishers), Dublin Core 15 core elements (DC.title format), COinS embedded OpenURL data in spans, JSON-LD structured data in script tags (increasingly common, Schema.org vocabulary), Microdata using HTML5 itemscope/itemprop attributes, and RDFa expressing multiple vocabularies simultaneously. JavaScript libraries handle extraction—`open-graph-scraper` (85,000+ weekly npm downloads), `extruct` supporting all formats, and Zotero's Embedded Metadata Translator prioritizing Dublin Core/OpenGraph before falling back to HTML meta tags.

**Citation Style Language (CSL) provides formatting flexibility** through XML files defining citation rules, locale files with language-specific translations, and processors applying styles to metadata. The CSL Style Repository maintains 10,000+ community-contributed styles including multiple Cite Them Right Harvard editions (10th, 11th, 12th, 13th). citeproc-js, the most widely used JavaScript processor (1,300+ integration tests, used by Zotero and Mendeley), takes CSL JSON formatted items and generates correctly formatted citations and bibliographies. Harvard implementation in CSL specifies author-date format, "and" text connector for multiple authors (not ampersand), et al. rules configurable via et-al-min and et-al-use-first attributes, and alphabetical bibliography sorting by surname.

### PDF handling and storage strategies

**PDF.js extracts metadata and text** through standard fields (Title, Author, Subject, Keywords, Creator, Producer, dates) and XMP metadata packages (Dublin Core dc:creator, dc:title, dc:subject). Browser extensions face challenges accessing PDF content in built-in viewers, requiring URL detection and separate fetching. Zotero downloads PDFs temporarily for metadata extraction using pdf-worker background processing. Text extraction from first pages enables DOI detection through regex patterns (10.\\d{4,}/[^\\s]+), enabling automatic metadata lookup via CrossRef or DataCite APIs when embedded metadata is incomplete.

**Local storage via chrome.storage.local** provides 10MB limits (unlimited with permission), while IndexedDB handles larger datasets with database-style querying. Cloud sync architectures require incremental updates (only changed items), version number comparison, conflict resolution strategies (last-write-wins simple, version vectors robust, user intervention for critical conflicts), and background service worker synchronization. Zotero's RESTful API with versioning and separate file attachment storage demonstrates production-quality sync implementation. **Hybrid offline-first with eventual consistency** provides best user experience—immediate local access, periodic background sync, graceful offline handling.

---

## Design recommendations for NCAD accessibility extension

**Visual card-based bibliography display** should show thumbnail previews of sources (article pages, book covers, website screenshots), title and author prominently displayed, color-coded tags for organization (course, topic, project), drag-and-drop sorting into collections, and gallery view as default with list view alternative. Implement using Notion-style gallery components with Open Graph image extraction, screenshot API fallbacks (Urlbox, ThumbnailWS), lazy loading for performance, and 200-400px thumbnail widths. Raindrop.io's permanent copies approach ensures persistence even when sources change.

**Cite Them Right Harvard automation** must generate correctly formatted citations following NCAD requirements (12th or 13th edition selectable, "and" not ampersand connectors, comma before page numbers, Day Month Year access dates for all online sources, DOIs as full URLs in 12th edition, place of publication removed in 13th edition). Implement using Zotero's CSL styles as base (harvard-cite-them-right from style repository), citeproc-js processor for formatting, verbal descriptions of formatting rules not just visual examples, and integration with spell-checking for metadata fields addressing dyslexic users' primary complaint with existing tools.

**Bionic reading, OpenDyslexic font, and reader mode toggles** should provide per-page activation, intensity adjustment for bionic bolding (how much of each word emphasized), font choice including OpenDyslexic, Arial, Verdana, Comic Sans, adjustable sizes 12-20pt with 1.5-2× line spacing options, left-align enforcement with justification disabled, cream/pastel background options instead of pure white, and dark mode with reduced contrast (dark grey on soft black rather than harsh extremes). Reader mode using Mozilla Readability strips ads and distractions while maintaining customization options.

### Source evaluation integration

**Built-in credibility checking** should integrate NewsGuard's Nutrition Labels for news sources (free for educational institutions—negotiate institutional access), The Source Taster citation verification cross-referencing OpenAlex/Crossref/Semantic Scholar/arXiv databases, Scite smart citations showing supporting/mentioning/contrasting classification of citation context, and visual indicators (color-coded badges) on captured sources showing peer-review status, open access availability, journal quality metrics, and retraction checks. LibKey Nomad integration connects institutional library subscriptions while flagging predatory journals through Retraction Watch Hijacked Journal Checker.

**Teaching source evaluation** through CRAAP test framework (Currency, Relevance, Authority, Accuracy, Purpose) embedded in item capture workflow, prompting students to answer evaluation questions as they save sources, optional checklists before adding to bibliography, visual summaries of source quality based on student assessments, and integration with assignments requiring source evaluation documentation. This transforms passive collection into active critical analysis.

---

## Addressing learning difficulties through thoughtful interaction design

**Spell-checking in citation metadata fields** emerges as the top user-requested feature for dyslexic Zotero users—currently requiring copy-paste to Word to find errors. Implement using Web Speech API's spellcheck capabilities, context-aware suggestions from Grammarly-style APIs, visual highlighting of misspelled words in real-time, and right-click corrections integrated naturally. Author name validation against institutional databases reduces errors while teaching proper formatting.

**Text-to-speech for reading abstracts and articles** addresses dyslexia, ADHD, and multiple disabilities. Implement using Read Aloud's open-source approach (multiple voices, adjustable speed, synchronized highlighting) or Speechify's premium natural voices. Critical feature: **ability to skip citations and parenthetical content** like TorTalk implements, reducing cognitive overload from processing reference formatting while reading main text. Add playback controls overlay (play/pause, speed adjustment, skip forward/back), progress indicators, and offline voice synthesis for privacy.

**Focus modes reduce overwhelm** in complex interfaces through distraction-free reading views hiding toolbars and sidebars, progressive disclosure revealing only immediately needed options, one primary action per screen (Save, Edit, Format Citation buttons appear individually rather than toolbar clutter), step-by-step wizards for multi-stage processes like bibliography generation, and visual progress trackers showing completion status. Pomodoro timer integration (25-minute focused work intervals with breaks) provides external time structure for ADHD users.

**Error prevention and helpful feedback** includes auto-save preventing lost work, confirmation dialogs before destructive actions, undo/redo capabilities, real-time form validation showing errors immediately not after submission, format example tooltips near input fields, and specific constructive error messages ("Email missing '@' symbol" not "Invalid input"). Success confirmation with brief celebrations boosts dopamine for ADHD users—"Citation saved! 15 sources in your library" with positive visual feedback.

### Customization enables individual optimization

**User preference storage** should allow saved font choices persisting across sessions, color scheme selection (light/dark/custom), bionic reading intensity levels, TTS voice and speed preferences, organizational system (tags, folders, colors) structure preservation, and keyboard shortcut customization. Export/import settings enables sharing successful configurations between students or resetting to defaults when experimenting goes wrong. Multiple preset configurations ("Dyslexia Optimized," "ADHD Focused," "Visual Learner") provide starting points with customization encouragement.

**Accessibility preferences menu** consolidates controls in one location: reading assistance (bionic, fonts, spacing, colors), focus modes (reader view, distraction reduction, progress tracking), audio features (TTS settings, notification sounds), motion settings (animation on/off, transition speeds), and input methods (keyboard shortcuts, voice commands). Following WCAG 2.2 AA standards as baseline, add selective AAA criteria (unusual word definitions, abbreviation expansion, lower reading level content, pronunciation guides), and implement COGA (Cognitive and Learning Disabilities Accessibility) supplemental guidance.

---

## Building on proven foundations

**Zotero Connector provides production-ready architecture** with translation framework code on GitHub (https://github.com/zotero/zotero-connectors), 500+ website-specific translators maintained by community (https://github.com/zotero/translators), comprehensive CSL style support including all Cite Them Right Harvard editions, and MIT open-source license enabling adaptation. The TypeScript plugin template (https://github.com/windingwind/zotero-plugin-template) with toolkit (https://github.com/windingwind/zotero-plugin-toolkit) demonstrates modern development practices. Existing accessibility plugins prove feasibility: Bionic Reading for Zotero, ZotCard for visual note-taking, Better Notes for enhanced organization.

**Starting with Zotero integration** allows focusing accessibility innovations on top of proven citation management. Develop as Zotero 7 plugin using official APIs (ItemTreeManager.registerColumn for custom views, ItemPaneManager.registerSection for accessibility controls, Reader.registerEventListener for reading assistance), then optionally expand to standalone browser extension. This progressive approach delivers value quickly to NCAD's existing Zotero users while building toward comprehensive solution.

**Community-based development** should involve NCAD students with learning difficulties from initial design through iterative testing, partner with Edward Maher Library for institutional integration and Cite Them Right style verification, contribute improvements back to Zotero and CSL communities, document accessibility features explicitly (unlike current tools' silence), and create video tutorials and guides in multiple formats (text, audio, visual demonstrations).

## Conclusion: accessible citation tools transform research experiences

Citation management tools have neglected neurodivergent users despite representing 15-25% of students. The convergence of proven technologies—Zotero's citation management, visual card interfaces, Bionic Reading implementations, comprehensive accessibility extensions like Helperbird, and modern browser architectures—makes an accessibility-focused solution feasible now. NCAD's specific Cite Them Right Harvard requirements, institutional Zotero support, and art/design student population create ideal conditions for pioneering truly inclusive academic tools.

Success requires embedding accessibility from inception rather than retrofitting accommodations. Visual organization, customizable typography, focus modes, source evaluation guidance, and multi-modal presentation aren't special features for disabled users—they're universal design improvements benefiting everyone. Research confirms ADHD-friendly interfaces help all users; the distinction is that **neurodivergent students can't work effectively without these considerations while neurotypical students simply appreciate them**.

**The opportunity extends beyond NCAD**. Irish universities share Cite Them Right Harvard standards, creating scalable solution potential. The broader academic community desperately needs citation tools designed for cognitive diversity. By combining Zotero's technical excellence with neurodivergent-centered design, accessibility-focused typography, visual organization systems, and integrated source evaluation, NCAD could demonstrate that academic tools can serve all students excellently rather than most students adequately.
