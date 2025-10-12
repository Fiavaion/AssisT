# Sprint 7: User Profiles System - Feature Specification

## Overview
User Profiles allow students to save, manage, and quickly switch between different setting configurations optimized for specific tasks (reading, quizzes, assignments, etc.).

## Feature Goals
1. **Quick context switching** - Switch between "Reading Mode", "Quiz Mode", "Assignment Mode" in one click
2. **Reduce setup friction** - Set up once, reuse many times
3. **Share configurations** - Export/import profiles for backup or sharing with others
4. **Smart defaults** - Pre-configured profiles for common scenarios
5. **Flexibility** - Users can create unlimited custom profiles

## User Stories

### US-1: Save Current Settings as Profile
**As a** student who has configured optimal settings for reading
**I want to** save my current settings as a named profile
**So that** I can quickly return to these settings later

**Acceptance Criteria:**
- ✅ "Save Current Settings" button in popup
- ✅ Modal prompts for profile name
- ✅ Profile name validation (non-empty, unique)
- ✅ Captures ALL current settings (TTS, highlighting, text customization, etc.)
- ✅ Shows success toast notification
- ✅ Profile immediately appears in profile selector

### US-2: Switch Between Profiles
**As a** student switching from reading to taking a quiz
**I want to** select a profile from a dropdown
**So that** all my settings change instantly

**Acceptance Criteria:**
- ✅ Profile selector dropdown at top of popup
- ✅ Shows all saved profiles
- ✅ Clicking a profile loads all its settings
- ✅ Current profile is highlighted
- ✅ Settings update in real-time
- ✅ Toast notification confirms profile switch

### US-3: Delete Unwanted Profiles
**As a** user cleaning up my profile list
**I want to** delete profiles I no longer need
**So that** my profile list stays organized

**Acceptance Criteria:**
- ✅ Delete button (trash icon) next to each profile in list
- ✅ Confirmation prompt before deletion
- ✅ Cannot delete currently active profile (or auto-switch to default)
- ✅ Toast notification confirms deletion
- ✅ Profile list updates immediately

### US-4: Export/Import Profiles
**As a** student who wants to backup my settings or share with classmates
**I want to** export and import profile files
**So that** I can restore settings or help others

**Acceptance Criteria:**
- ✅ "Export Profiles" button downloads JSON file
- ✅ "Import Profiles" button opens file picker
- ✅ Import validates JSON structure
- ✅ Import offers to merge or replace existing profiles
- ✅ Toast notification shows import/export success

### US-5: Pre-configured Default Profiles
**As a** new user unfamiliar with best settings
**I want** pre-configured profiles for common tasks
**So that** I can start with good defaults

**Acceptance Criteria:**
- ✅ Default profiles created on first install:
  - "Default" - Original default settings
  - "Reading Mode" - Optimized for long-form reading
  - "Quiz Mode" - Optimized for taking quizzes
  - "Low Vision" - High contrast, large text
- ✅ Default profiles cannot be deleted (can be edited)
- ✅ User can create additional custom profiles

## Technical Design

### Architecture
- **Storage**: Chrome Storage API (local)
- **Structure**: Separate `profiles` object in storage
- **Active Profile Tracking**: `activeProfile` key stores current profile name
- **Profile Contents**: Complete snapshot of all `assist_settings`

### Storage Schema

```javascript
// Storage structure
{
  "assist_settings": { /* current active settings */ },
  "profiles": {
    "Default": {
      name: "Default",
      isDefault: true,
      createdAt: "2025-10-12T...",
      settings: { /* full settings snapshot */ }
    },
    "Reading Mode": {
      name: "Reading Mode",
      isDefault: true,
      createdAt: "2025-10-12T...",
      settings: { /* optimized for reading */ }
    },
    "Quiz Mode": {
      name: "Quiz Mode",
      isDefault: true,
      createdAt: "2025-10-12T...",
      settings: { /* optimized for quizzes */ }
    },
    "My Custom Profile": {
      name: "My Custom Profile",
      isDefault: false,
      createdAt: "2025-10-12T...",
      settings: { /* user's custom settings */ }
    }
  },
  "activeProfile": "Reading Mode"
}
```

### Default Profile Definitions

#### 1. Default Profile
```javascript
{
  name: "Default",
  isDefault: true,
  settings: {
    tts: { enabled: false, /* all TTS defaults */ },
    textCustomization: { enabled: false, /* defaults */ },
    readingGuide: { enabled: false },
    focusMode: { enabled: false },
    screenOverlay: { enabled: false },
    canvasIntegration: { enabled: false }
  }
}
```

#### 2. Reading Mode Profile
```javascript
{
  name: "Reading Mode",
  isDefault: true,
  settings: {
    tts: {
      enabled: true,
      rate: 1.2,
      highlightEnabled: true,
      wordByWordEnabled: true
    },
    textCustomization: {
      enabled: true,
      fontSize: 18,
      lineHeight: 1.8,
      fontFamily: 'OpenDyslexic'
    },
    readingGuide: {
      enabled: true,
      lineColor: '#4A90E2',
      opacity: 0.5
    },
    focusMode: { enabled: false },
    screenOverlay: {
      enabled: true,
      color: '#FFF4E6', // Warm sepia
      opacity: 0.2
    },
    canvasIntegration: { enabled: false }
  }
}
```

#### 3. Quiz Mode Profile
```javascript
{
  name: "Quiz Mode",
  isDefault: true,
  settings: {
    tts: {
      enabled: true,
      rate: 1.0, // Slower for comprehension
      highlightEnabled: true,
      wordByWordEnabled: false
    },
    textCustomization: {
      enabled: true,
      fontSize: 16,
      lineHeight: 1.6
    },
    readingGuide: { enabled: false },
    focusMode: {
      enabled: true,
      dimAmount: 0.7
    },
    screenOverlay: { enabled: false },
    canvasIntegration: {
      enabled: true,
      quizHelper: {
        enabled: true,
        readAnswers: true,
        highlightQuestion: true,
        keyboardNavigation: true
      }
    }
  }
}
```

#### 4. Low Vision Profile
```javascript
{
  name: "Low Vision",
  isDefault: true,
  settings: {
    tts: {
      enabled: true,
      rate: 0.9, // Slower
      highlightEnabled: true,
      highlightColor: '#FFEB3B', // High contrast yellow
      highlightOpacity: 0.9
    },
    textCustomization: {
      enabled: true,
      fontSize: 22,
      lineHeight: 2.0,
      letterSpacing: 0.15,
      wordSpacing: 0.2,
      textColor: '#000000',
      backgroundColor: '#FFFFFF'
    },
    readingGuide: {
      enabled: true,
      lineColor: '#FF0000', // High contrast
      opacity: 0.8
    },
    focusMode: {
      enabled: true,
      dimAmount: 0.9
    },
    screenOverlay: { enabled: false },
    canvasIntegration: { enabled: false }
  }
}
```

## UI Design

### Profile Management Section (Top of Popup)
```
┌─────────────────────────────────────────┐
│ 👤 Profile: [Reading Mode ▼]           │
│ ┌─────────────────────────────────────┐ │
│ │ Default                             │ │
│ │ Reading Mode                    ✓   │ │
│ │ Quiz Mode                           │ │
│ │ Low Vision                          │ │
│ │ ─────────────────────────────────   │ │
│ │ My Study Settings                🗑 │ │
│ │ ─────────────────────────────────   │ │
│ │ + Create New Profile                │ │
│ └─────────────────────────────────────┘ │
│                                          │
│ [💾 Save Current] [📤 Export] [📥 Import]│
└─────────────────────────────────────────┘
```

### Profile Actions Bar
- **Save Current**: Opens modal to name and save current settings
- **Export**: Downloads all profiles as JSON file
- **Import**: Opens file picker to load profiles from JSON

### Profile Dropdown
- Shows profile name with checkmark for active profile
- Default profiles at top (no delete icon)
- Divider line
- Custom profiles below (with trash icon)
- "+ Create New Profile" at bottom

### Save Profile Modal
```
┌─────────────────────────────────────────┐
│ Save Current Settings as Profile        │
│                                          │
│ Profile Name:                            │
│ ┌──────────────────────────────────────┐│
│ │ My Study Settings                    ││
│ └──────────────────────────────────────┘│
│                                          │
│ This will save all current settings:     │
│ • TTS settings                           │
│ • Text customization                     │
│ • Reading guide                          │
│ • Focus mode                             │
│ • Screen overlay                         │
│ • Canvas integration                     │
│                                          │
│        [Cancel]  [Save Profile]          │
└─────────────────────────────────────────┘
```

### Delete Confirmation Modal
```
┌─────────────────────────────────────────┐
│ Delete Profile?                          │
│                                          │
│ Are you sure you want to delete          │
│ "My Study Settings"?                     │
│                                          │
│ This action cannot be undone.            │
│                                          │
│        [Cancel]  [Delete]                │
└─────────────────────────────────────────┘
```

## Implementation Steps

### Phase 1: Storage Layer (Task 9)
1. Create `ProfileManager` class in popup.js
2. Implement `createDefaultProfiles()` - Initialize default profiles
3. Implement `saveProfile(name, settings)` - Save profile to storage
4. Implement `loadProfile(name)` - Load profile and apply settings
5. Implement `deleteProfile(name)` - Remove profile from storage
6. Implement `getAllProfiles()` - Retrieve all profiles
7. Implement `exportProfiles()` - Generate JSON for download
8. Implement `importProfiles(json)` - Parse and save imported profiles

### Phase 2: UI Components (Task 8)
1. Add profile selector dropdown at top of popup
2. Add profile actions bar (Save, Export, Import buttons)
3. Create save profile modal (HTML + CSS)
4. Create delete confirmation modal
5. Style profile dropdown with icons and dividers
6. Add profile management section to popup.html

### Phase 3: Profile Logic (Task 9)
1. Populate dropdown with profiles on load
2. Handle profile selection change
3. Handle "Save Current" button click
4. Handle delete button clicks
5. Handle export button (download JSON)
6. Handle import button (file picker + validation)
7. Handle "+ Create New Profile" click

### Phase 4: Settings Application (Task 9)
1. `applyProfile(settings)` - Load all settings from profile
2. Update all UI controls to reflect loaded settings
3. Trigger saveSettings() to update active settings
4. Update content scripts with new settings
5. Show toast notification on profile switch

### Phase 5: Default Profiles Initialization (Task 9)
1. Check if profiles exist in storage
2. If not, create default profiles
3. Set "Default" as active profile
4. Run on extension install/update

## API Design

### ProfileManager Class
```javascript
class ProfileManager {
  constructor(settingsManager) {
    this.settingsManager = settingsManager;
    this.profiles = {};
    this.activeProfile = 'Default';
  }

  // Initialize default profiles
  async initializeDefaultProfiles() { }

  // Get all profiles
  async getAllProfiles() { }

  // Save current settings as new profile
  async saveCurrentAsProfile(name) { }

  // Load profile and apply settings
  async loadProfile(name) { }

  // Delete profile
  async deleteProfile(name) { }

  // Export profiles to JSON
  exportProfiles() { }

  // Import profiles from JSON
  async importProfiles(json) { }

  // Get active profile name
  getActiveProfile() { }

  // Set active profile
  async setActiveProfile(name) { }
}
```

## Testing Checklist (Task 10)

### Profile Creation
- [ ] Create new profile with valid name
- [ ] Profile saves all current settings
- [ ] Profile appears in dropdown
- [ ] Cannot create profile with empty name
- [ ] Cannot create profile with duplicate name
- [ ] Toast notification on successful save

### Profile Loading
- [ ] Select profile from dropdown
- [ ] All settings update to match profile
- [ ] UI controls reflect new settings
- [ ] Content scripts receive updated settings
- [ ] Active profile marked with checkmark
- [ ] Toast notification on profile switch

### Profile Deletion
- [ ] Click delete icon on custom profile
- [ ] Confirmation modal appears
- [ ] Cancel button dismisses modal
- [ ] Delete button removes profile
- [ ] Profile removed from dropdown
- [ ] Cannot delete default profiles
- [ ] Toast notification on deletion

### Export/Import
- [ ] Export downloads JSON file
- [ ] JSON contains all profiles
- [ ] Import opens file picker
- [ ] Valid JSON imports successfully
- [ ] Invalid JSON shows error message
- [ ] Imported profiles appear in dropdown
- [ ] Import offers merge/replace option

### Default Profiles
- [ ] Default profiles created on first run
- [ ] "Default", "Reading Mode", "Quiz Mode", "Low Vision" exist
- [ ] Default profiles cannot be deleted
- [ ] Default profiles can be selected
- [ ] Settings match specification

### Edge Cases
- [ ] Switch profiles while TTS is active
- [ ] Delete profile while it's active (auto-switch to Default)
- [ ] Import duplicate profile names (prompt for rename)
- [ ] Export with no custom profiles
- [ ] Import empty profiles list
- [ ] Very long profile names (truncate in UI)

## Success Metrics
- ✅ Users can save unlimited custom profiles
- ✅ Profile switching applies all settings instantly
- ✅ Default profiles provide good starting points
- ✅ Export/import enables backup and sharing
- ✅ UI is intuitive and non-intrusive
- ✅ No performance impact with many profiles (tested up to 50)

## Known Limitations (v1)
- No profile editing (must create new or modify settings then save)
- No profile descriptions/notes
- No profile icons/colors
- No auto-switching based on page type (future feature)
- No cloud sync (local storage only)

## Future Enhancements (Backlog)
- Edit profile name and settings in-place
- Add profile descriptions
- Custom profile icons/colors
- Auto-switch profiles based on URL patterns
- Auto-switch profiles based on Canvas page type
- Cloud sync via Chrome Sync Storage
- Profile sharing via URL/code
- Community profile marketplace
- Profile categories/folders
- Profile templates for specific disabilities

## Dependencies
- ✅ Existing settings system (already implemented)
- ✅ Chrome Storage API (already in use)
- ✅ Toast notification system (already implemented)

## File Changes Required
1. **src/popup/popup.html** - Add profile management UI section at top
2. **src/popup/popup.js** - Add ProfileManager class and UI handlers
3. **src/popup/popup.css** - Style profile dropdown, modals, buttons

## Commit Strategy
1. Single feature commit: `feat(profiles): add User Profiles system with export/import`
2. Conventional commit format
3. Detailed commit message with usage instructions

---

**Status**: Specification Complete ✅
**Next Step**: Implement User Profiles UI in popup (Task 8)
**Estimated Effort**: 4-5 hours implementation + 1 hour testing
