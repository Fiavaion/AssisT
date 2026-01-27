# Multi-Provider Translation System - Implementation TODO

## STATUS: 30% Complete

### ✅ COMPLETED

1. Created `translation-providers.js` module with:
   - MyMemory provider (free, no key)
   - DeepL provider (free tier 500k chars/month)
   - Azure Translator provider (free tier 2M chars/month)
   - Unified translate() function
   - Provider-specific error handling
   - User-friendly error messages

2. Fixed translation bugs:
   - Sequential processing to avoid rate limiting
   - 300ms delays between requests
   - Removed unused variables

### 🚧 TODO: Integration & UI

#### 1. Update translation-api.js

**File:** `src/features/translation/translation-api.js`

- Import the new providers module
- Add provider selection logic
- Load provider preference from chrome.storage
- Load API keys from chrome.storage
- Pass provider + keys to translate function
- Handle provider errors and show notifications

#### 2. Add Provider Selection UI to Popup

**File:** `src/popup/popup.html`

- Add dropdown in "Look Up Words" section (near Translate Page button):
  ```html
  <div class="translation-provider-selector">
    <label for="translation-provider">Translation Provider:</label>
    <select id="translation-provider">
      <option value="mymemory">MyMemory (Free, No Key)</option>
      <option value="deepl">DeepL (Requires Key)</option>
      <option value="azure">Azure Translator (Requires Key)</option>
    </select>
  </div>
  ```

**File:** `src/popup/popup.js`

- Load selected provider from storage
- Save provider when changed
- Show/hide API key fields based on selected provider
- Validate API keys when provider requires them

#### 3. Add API Key Management UI

**File:** `src/popup/popup.html`

- Add API key input fields (show/hide based on provider):
  ```html
  <div id="deepl-key-section" style="display:none;">
    <label>DeepL API Key:</label>
    <input type="password" id="deepl-api-key" placeholder="Enter DeepL API key" />
    <a href="https://www.deepl.com/pro-api" target="_blank">Get Free Key</a>
  </div>
  <div id="azure-key-section" style="display:none;">
    <label>Azure API Key:</label>
    <input type="password" id="azure-api-key" placeholder="Enter Azure API key" />
    <label>Azure Region:</label>
    <input type="text" id="azure-region" value="global" placeholder="global" />
    <a href="https://azure.microsoft.com/services/cognitive-services/translator/" target="_blank"
      >Get Free Key</a
    >
  </div>
  ```

**File:** `src/popup/popup.js`

- Load API keys from chrome.storage.local
- Save API keys when changed (encrypted if possible)
- Add "Test Connection" button to verify keys work

#### 4. Create Error Notification Modal

**File:** `src/features/translation/translation-error-modal.js` (NEW)

- Create modal that shows when provider hits limit
- Display:
  - Error title (e.g., "MyMemory Quota Exceeded")
  - Error message
  - Current provider name
  - Link to switch provider
  - Button to open settings
- Auto-show when quota/rate limit error occurs

**File:** `src/features/translation/translation-error-modal.css` (NEW)

- Style the error modal
- Make it prominent but not blocking
- Include provider logo/icon if possible

#### 5. Add Provider Status Tracking

**File:** `src/features/translation/translation-api.js`

- Track last error per provider in chrome.storage
- Show visual indicator in UI for blocked providers
- Add timestamp for when limit will reset (if known)
- Add retry counter

#### 6. Update full-page-translate.js

**File:** `src/features/translation/full-page-translate.js`

- Use new provider system instead of direct API calls
- Show provider name in progress modal
- Handle provider errors gracefully
- Show error modal when provider fails

### 📋 IMPLEMENTATION ORDER

**Phase 1: Core Integration (30 min)**

1. Update translation-api.js to use providers module
2. Add provider selection dropdown to popup
3. Wire up provider selection to storage

**Phase 2: API Key Management (20 min)** 4. Add API key input fields 5. Save/load keys from storage 6. Pass keys to provider functions

**Phase 3: Error Handling (20 min)** 7. Create error notification modal 8. Integrate error modal with translation system 9. Add provider status indicators

**Phase 4: Testing (15 min)** 10. Test MyMemory (will still be rate limited) 11. Test DeepL with API key 12. Test error handling 13. Build and verify

### 🎯 ACCEPTANCE CRITERIA

- ✅ User can select translation provider from dropdown
- ✅ User can enter API keys for paid providers
- ✅ When provider hits limit, show helpful error modal
- ✅ Error modal explains which provider failed
- ✅ Error modal shows how to switch providers
- ✅ Provider preference persists across sessions
- ✅ API keys stored securely in chrome.storage
- ✅ Full-page translation works with all providers

### 📝 TESTING CHECKLIST

- [ ] MyMemory provider works (will hit limit quickly)
- [ ] DeepL provider works with valid API key
- [ ] Azure provider works with valid API key
- [ ] Error modal appears when quota exceeded
- [ ] Provider selection persists after refresh
- [ ] API keys persist after refresh
- [ ] Switching providers mid-translation works
- [ ] Invalid API key shows proper error

### 🚀 FUTURE ENHANCEMENTS

- Add LibreTranslate (self-hosted) support
- Add Bergamot (local/offline) support
- Provider usage statistics
- Auto-fallback to backup provider
- Batch translation for multiple providers
