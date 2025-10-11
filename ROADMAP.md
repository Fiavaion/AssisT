# AssisT Development Roadmap

**Strategic development plan organized by functional cohesion and dependency management**

---

## 📋 Roadmap Philosophy

This roadmap strategically groups functionality based on:

1. **Functional Cohesion**: Related features developed together for efficient implementation
2. **Dependency Management**: Core infrastructure before dependent features
3. **Risk Mitigation**: Critical accessibility features prioritized early
4. **User Value**: MVP delivers immediate value, subsequent phases enhance capability

---

## Phase 1: Core Infrastructure & MVP (Weeks 1-4)

**Goal**: Establish stable foundation with essential TTS functionality

### 1.1 Foundation Setup ✅ COMPLETED
- [x] Project structure and build configuration
- [x] Chrome Extension Manifest V3 setup
- [x] Isolated World content script architecture
- [x] Storage Manager (FERPA-compliant)
- [x] Message Router (secure communication)
- [x] DOM Adapter (Canvas interaction)
- [x] Test infrastructure (Jest + Playwright)

### 1.2 Basic TTS Implementation (Week 2)
**Priority**: HIGH | **Risk**: MEDIUM

**Tasks**:
- [ ] Write TTS Controller unit tests (TDD)
  - Test voice loading
  - Test speech synthesis
  - Test pause/resume/stop controls
- [ ] Enhance TTS Controller
  - Implement voice selection UI
  - Add rate/pitch/volume controls
  - Error handling and fallbacks
- [ ] Implement basic text highlighting
  - Create highlight span wrapper
  - Add remove highlight functionality
  - Style highlight with user color preference

**Deliverable**: Basic TTS reading with manual controls

### 1.3 WAI-Adapt Text Spacing (Week 3)
**Priority**: HIGH | **Risk**: LOW

**Tasks**:
- [ ] Write WAI-Adapt unit tests (TDD)
  - Test WCAG 2.2 SC 1.4.12 spacing ratios
  - Test dynamic application/removal
  - Test persistence across page navigation
- [ ] Enhance WAI-Adapt Manager
  - Implement text spacing controls
  - Add font selection (OpenDyslexic support)
  - Create color scheme presets
- [ ] Create settings UI for text customization

**Deliverable**: WCAG 2.2 compliant text customization

### 1.4 Basic Popup UI (Week 4)
**Priority**: HIGH | **Risk**: LOW

**Tasks**:
- [ ] Design accessible popup interface
  - Keyboard navigation support
  - ARIA labels and roles
  - High contrast support
- [ ] Implement popup.html/css/js
  - Settings toggle controls
  - Quick access TTS controls
  - Help documentation links
- [ ] Connect popup to content script via messaging
- [ ] Add settings persistence

**Deliverable**: Functional extension popup with basic controls

**Phase 1 Exit Criteria**:
- ✅ Extension loads on Canvas without errors
- ✅ Basic TTS reads page content
- ✅ Text spacing meets WCAG 2.2 SC 1.4.12
- ✅ Settings persist across sessions
- ✅ 80% unit test coverage

---

## Phase 2: Advanced TTS & Focus Features (Weeks 5-8)

**Goal**: Enhanced reading experience with synchronized highlighting and distraction reduction

### 2.1 Synchronized TTS Highlighting (Week 5-6)
**Priority**: HIGH | **Risk**: HIGH

**Tasks**:
- [ ] Write advanced highlighting tests
  - Test word boundary detection
  - Test text node mapping
  - Test dynamic content handling
- [ ] Implement word-by-word highlighting
  - Map speech boundary events to DOM nodes
  - Create smooth highlight transitions
  - Handle multi-line text wrapping
- [ ] Add highlight customization
  - Color picker UI
  - Highlight style options (underline, box, background)
  - Animation preferences

**Deliverable**: FR-101 - Synchronized TTS Reader with visual highlighting

### 2.2 Immersive Focus Mode (Week 7)
**Priority**: MEDIUM | **Risk**: MEDIUM

**Tasks**:
- [ ] Write focus mode tests
  - Test extraneous element detection
  - Test hide/restore functionality
  - Test focus mode indicator
- [ ] Implement FR-102 - Focus Mode
  - Detect and hide Canvas sidebars, ads, navigation
  - Create focus mode toggle
  - Add visual focus indicator
  - Preserve main content area
- [ ] Add progressive disclosure for settings
  - Basic/Advanced settings tabs
  - Minimize cognitive load in UI

**Deliverable**: FR-102 - Immersive Focus Mode reducing cognitive load

### 2.3 SSML Support for TTS (Week 8)
**Priority**: MEDIUM | **Risk**: MEDIUM

**Tasks**:
- [ ] Research SSML tag support in Web Speech API
- [ ] Implement SSML controls
  - Prosody (rate, pitch, volume) via tags
  - Emphasis levels
  - Break/pause insertion
- [ ] Create advanced TTS settings panel
  - SSML preview
  - Save custom voice profiles
- [ ] Add content-aware SSML application
  - Emphasis on headings
  - Pauses at punctuation

**Deliverable**: Enhanced TTS with pedagogical voice control

**Phase 2 Exit Criteria**:
- ✅ Word-by-word highlighting works on all Canvas pages
- ✅ Focus mode successfully hides 90%+ extraneous elements
- ✅ SSML controls provide fine-grained voice customization
- ✅ E2E tests pass on multiple Canvas content types
- ✅ Neurodivergent user testing validates UX improvements

---

## Phase 3: STT & Multimodal Input (Weeks 9-12)

**Goal**: Comprehensive writing support with voice input and error correction

### 3.1 Basic STT Implementation (Week 9-10)
**Priority**: HIGH | **Risk**: MEDIUM

**Tasks**:
- [ ] Write STT Controller unit tests
  - Test recognition start/stop
  - Test transcription insertion
  - Test input field detection
- [ ] Enhance STT Controller
  - Implement microphone UI buttons
  - Add interim result display
  - Handle Canvas rich text editors (TinyMCE)
- [ ] Add STT to all Canvas input contexts
  - Discussion posts
  - Assignment submissions
  - Quiz responses
  - Comment fields

**Deliverable**: FR-103 - High-Accuracy STT Input across Canvas

### 3.2 Multimodal FixOver Correction (Week 11)
**Priority**: HIGH | **Risk**: HIGH

**Tasks**:
- [ ] Research and design FixOver UX
  - Voice + hover interaction pattern
  - Spell-check integration
  - Alternative suggestion display
- [ ] Write FixOver tests
  - Test error detection
  - Test voice correction commands
  - Test auto-correction application
- [ ] Implement FR-104 - FixOver
  - Detect transcription errors
  - Enable hover + voice command correction
  - Integrate with browser spell-checker
  - Eliminate need for re-dictation

**Deliverable**: FR-104 - Multimodal FixOver Correction for dysgraphia support

### 3.3 Domain Adaptation (Week 12)
**Priority**: MEDIUM | **Risk**: HIGH

**Tasks**:
- [ ] Create academic vocabulary lists
  - Scientific terminology
  - Mathematical expressions
  - Common course-specific terms
- [ ] Implement vocabulary injection
  - Pre-load academic terms
  - Course-specific adaptation
  - Custom user dictionaries
- [ ] Test WER (Word Error Rate) improvement
  - Measure baseline WER
  - Measure post-adaptation WER
  - Target <5% WER for academic content

**Deliverable**: Domain-adapted STT with <5% WER on academic language

**Phase 3 Exit Criteria**:
- ✅ STT works on all Canvas input fields
- ✅ FixOver reduces correction time by 60%+
- ✅ Domain adaptation achieves <5% WER on test corpus
- ✅ Motor-impaired user testing validates FixOver UX
- ✅ 85% unit test coverage

---

## Phase 4: Dyscalculia Support & Advanced Adaptation (Weeks 13-16)

**Goal**: Numeric simplification and comprehensive personalization

### 4.1 Numeric Information Adaptation (Week 13-14)
**Priority**: MEDIUM | **Risk**: LOW

**Tasks**:
- [ ] Write numeric adaptation tests
  - Test date/time detection
  - Test semantic replacement
  - Test visual representation
- [ ] Implement FR-106 - Numeric Simplification
  - Detect dates, times, grades, statistics
  - Convert to semantic text ("Due today")
  - Add graphical representations
  - Toggle between numeric/semantic display
- [ ] Create dyscalculia settings panel
  - Numeric display preferences
  - Visual vs text preference

**Deliverable**: FR-106 - Numeric Information Adaptation for dyscalculia

### 4.2 Advanced Typography & Color (Week 15)
**Priority**: MEDIUM | **Risk**: LOW

**Tasks**:
- [ ] Implement OpenDyslexic font support
  - Bundle font or CDN integration
  - Add font switcher UI
  - Ensure WCAG contrast compliance
- [ ] Create color scheme library
  - High contrast presets
  - Dyslexia-friendly palettes
  - Custom color picker
- [ ] Implement dark mode

**Deliverable**: Comprehensive visual customization for dyslexia support

### 4.3 Consistent Help (WCAG 3.2.6) (Week 16)
**Priority**: MEDIUM | **Risk**: LOW

**Tasks**:
- [ ] Design help system architecture
  - Consistent placement across all pages
  - Context-sensitive help
  - Tooltips and documentation
- [ ] Implement FR-107 - Consistent Help
  - Fixed help button position
  - Inline contextual help
  - Link to user guide
- [ ] Create comprehensive user documentation

**Deliverable**: FR-107 - WCAG 2.2 SC 3.2.6 compliant help system

**Phase 4 Exit Criteria**:
- ✅ Numeric simplification improves dyscalculia user task success by 40%+
- ✅ Typography options validated by dyslexic users
- ✅ Help system maintains consistent location on 100% of pages
- ✅ Full WCAG 2.2 AA compliance achieved

---

## Phase 5: Cloud Integration & Performance (Weeks 17-20)

**Goal**: Optional cloud TTS/STT engines and performance optimization

### 5.1 Cloud TTS Engine Adapters (Week 17-18)
**Priority**: LOW | **Risk**: MEDIUM

**Tasks**:
- [ ] Design cloud engine adapter interface
  - Abstract TTS/STT interface
  - Engine-specific implementations
- [ ] Implement Google Cloud TTS adapter
  - API key management
  - Neural voice selection
  - SSML pass-through
- [ ] Implement Murf Gen 2 adapter (optional)
- [ ] Add engine selection UI
  - Web Speech API (default)
  - Google Cloud TTS
  - Custom API endpoint

**Deliverable**: Optional high-fidelity cloud TTS engines

### 5.2 Performance Optimization (Week 19)
**Priority**: MEDIUM | **Risk**: MEDIUM

**Tasks**:
- [ ] Audit extension performance
  - Measure page load impact
  - Profile DOM operations
  - Analyze memory usage
- [ ] Optimize critical paths
  - Lazy-load non-essential modules
  - Debounce DOM observers
  - Cache frequently accessed data
- [ ] Implement performance budgets
  - <200ms page load increase
  - <50MB memory footprint

**Deliverable**: Optimized extension meeting NFR-100 performance targets

### 5.3 Accessibility Audit & Remediation (Week 20)
**Priority**: HIGH | **Risk**: LOW

**Tasks**:
- [ ] Conduct comprehensive WCAG 2.2 AA audit
  - Automated testing (axe, WAVE)
  - Manual screen reader testing
  - Keyboard navigation testing
- [ ] Remediate all identified issues
- [ ] Document accessibility conformance
  - VPAT (Voluntary Product Accessibility Template)
  - Accessibility statement
- [ ] Validate with neurodivergent users

**Deliverable**: Full WCAG 2.2 AA conformance with documentation

**Phase 5 Exit Criteria**:
- ✅ Cloud engines available as opt-in feature
- ✅ Page load impact <200ms (NFR-100 compliant)
- ✅ 100% WCAG 2.2 AA conformance
- ✅ VPAT completed and published

---

## Phase 6: LTI Integration & Institutional Deployment (Weeks 21-24)

**Goal**: Production-ready deployment with institutional integration

### 6.1 LTI Advantage Integration (Week 21-22)
**Priority**: LOW | **Risk**: HIGH

**Tasks**:
- [ ] Research LTI Advantage architecture
  - LTI 1.3 specification
  - Canvas LTI integration patterns
  - Security requirements (OAuth 2.0)
- [ ] Implement LTI provider
  - OAuth 2.0 authentication
  - Deep linking support
  - Grade passback (if applicable)
- [ ] Create institutional admin panel
  - Centralized configuration
  - Usage analytics
  - License management

**Deliverable**: LTI Advantage integration for institutional deployment

### 6.2 Analytics & KPI Tracking (Week 23)
**Priority**: MEDIUM | **Risk**: LOW

**Tasks**:
- [ ] Implement privacy-preserving analytics
  - Anonymous usage metrics
  - Feature adoption tracking
  - Error logging (client-side only)
- [ ] Create analytics dashboard
  - Task Success Rate (TSR)
  - User Error Frequency (UEF)
  - Feature usage statistics
- [ ] Track accessibility KPIs
  - WCAG conformance metrics
  - AT compatibility scores

**Deliverable**: Analytics for measuring product efficacy and KPIs

### 6.3 Production Deployment (Week 24)
**Priority**: HIGH | **Risk**: MEDIUM

**Tasks**:
- [ ] Prepare Chrome Web Store listing
  - Extension description
  - Screenshots and demo video
  - Privacy policy
  - Support documentation
- [ ] Security audit and penetration testing
- [ ] Create deployment documentation
  - Installation guides
  - IT administrator setup
  - Troubleshooting guides
- [ ] Submit to Chrome Web Store
- [ ] Plan institutional rollout strategy

**Deliverable**: Production-ready extension available on Chrome Web Store

**Phase 6 Exit Criteria**:
- ✅ LTI integration tested with institutional Canvas instance
- ✅ Analytics dashboard operational
- ✅ Security audit passed
- ✅ Chrome Web Store approval obtained
- ✅ Deployment documentation complete

---

## Post-Launch: Continuous Improvement

### Ongoing Tasks
- **User Feedback Loop**: Monthly surveys and feedback collection
- **Feature Requests**: Prioritized backlog management
- **Bug Fixes**: Rapid response to critical issues
- **Compliance Updates**: WCAG updates, Canvas API changes
- **Performance Monitoring**: Continuous optimization

### Future Enhancements (Backlog)
- [ ] Firefox and Edge extension ports
- [ ] AI-powered content summarization
- [ ] Multi-language support (i18n)
- [ ] Mobile web support (responsive)
- [ ] Integration with other LMS platforms (Blackboard, Moodle)
- [ ] Advanced analytics (learning patterns, A/B testing)
- [ ] Whisper API integration for superior STT accuracy
- [ ] Custom symbol sets for AAC users

---

## Risk Management

### High-Risk Areas

| Risk | Mitigation Strategy |
|------|---------------------|
| **TTS Highlighting Accuracy** | Extensive testing on diverse Canvas content; fallback to sentence-level highlighting |
| **FixOver UX Complexity** | User testing at prototype stage; simplify interaction if validation fails |
| **Canvas API Changes** | Minimize API dependency; use DOM parsing as primary method; monitor Canvas release notes |
| **Performance on Low-End Devices** | Performance budgets enforced; progressive enhancement; disable features on slow devices |
| **FERPA Compliance** | Legal review at each phase; no cloud transmission without user consent; audit trail |

---

## Success Metrics

### MVP Success (End of Phase 2)
- **Technical**: 80% test coverage, <200ms load impact, zero security vulnerabilities
- **Functional**: TTS + highlighting + focus mode operational on all Canvas pages
- **User**: 70+ AUS score, 90%+ TSR for core tasks

### Production Success (End of Phase 6)
- **Adoption**: 1000+ active users within 3 months
- **Efficacy**: 25% reduction in UEF, 90%+ TSR maintained
- **Compliance**: 100% WCAG 2.2 AA conformance
- **Stability**: <1% error rate, 99.9% uptime

---

## Development Principles

1. **Accessibility First**: Every feature must meet WCAG 2.2 AA before merging
2. **Test-Driven Development**: Write tests before implementation
3. **Privacy by Design**: FERPA compliance in every architectural decision
4. **Neurodiversity-Centered**: Validate with actual neurodivergent users
5. **Graceful Degradation**: Core features work even if advanced features fail
6. **Continuous Documentation**: Update decision log for all major choices

---

**Roadmap Version**: 1.0
**Last Updated**: 2025-10-11
**Status**: Phase 1 Foundation Complete ✅
**Next Milestone**: Phase 1.2 - Basic TTS Implementation (Week 2)
