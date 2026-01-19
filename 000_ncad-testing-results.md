# @NCAD Extension - Testing Results & Bug Report

**Generated:** 17/01/2026, 17:23:02

---

## Summary

- **Total Features:** 83
- **Tested:** 82
- **Passed:** 40 ✓
- **Failed:** 41 ✗
- **Skipped:** 1 ○
- **Progress:** 99%

---

## ❌ Failed Features (Require Fixes)

### 📋 Header Controls

#### Reset Button
**Issues:**
doesn't work, I activated a number of features and clicked the reset button, the features remained active - this should reset all the features to off by default

---

#### Help Button
**Issues:**
 opens https://github.com/MarJone/AssisT#readme -  I get a 404 on this, no documentation exists, could you create this and link to the button

---

#### Settings Button
**Issues:**
we need to do a full overhaul of the advanced options page, the user should be able to show/hide any feature in the popup html file, anything that exists in the main popup should have a show/hide on the advanced options - features tab. We need to look at the keyboard tab - obvious shorcuts like reading mode, dyslexia mode, activate/deactivate specific profiles, etc.   the 4 tabs is a bit cropped, could  we remove appearance and merge with profiles - I'm happy for you to decide on any other changes that would be useful from an ease of use, flexibility, ui/ux perspective

---

#### Organize Button
**Issues:**
I would like this to be fully customisable, currently we can move features outside their main acordian menu, we can't change the name of the sections eg if I wanted to rename reading help to Reading I can't do this - the pencil tool doesn't work. This should be incorporated in some way with the profiles section in advanced options - users should be able to fully customise the popup and then be able to export that setup to then load on another computer 

---

### 🔊 Reading Help

#### Word-by-Word
**Issues:**
this works fine when at a speed of 1, when speed of reading is changed it is not reflected in the speed of the word highlighting

---

#### OCR Language
**Issues:**
mark this section as experimental

---

#### HM - Read Aloud
**Issues:**
this is redundant as tts already exists  -remove from extension

---

### ✏️ Writing Help

#### Microphone Button
**Issues:**
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### Voice Input Test
**Issues:**
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### STT Pause/Resume
**Issues:**
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### Auto-Punctuation
**Issues:**
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### Voice Commands
**Issues:**
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### Annotations Toggle
**Issues:**
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### Create Annotation
**Issues:**
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### Citations Toggle
**Issues:**
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### Text Simplification
**Issues:**
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

### 📚 Look Up Words

#### Dictionary Toggle
**Issues:**
this is not necessary as this is covered by the quick action menu - remove from the extension

---

#### Dictionary Test
**Issues:**
this is not necessary as this is covered by the quick action menu - remove from the extension

---

#### Translation Toggle
**Issues:**
this is not necessary as this is covered by the quick action menu - remove from the extension

---

#### Translation Test
**Issues:**
this is not necessary as this is covered by the quick action menu - remove from the extension

---

#### Full-Page Translation
**Issues:**
this is not necessary as this is covered by the quick action menu - remove from the extension

---

### 🎨 Page Display

#### Quiet Mode
**Issues:**
I can't test this feature as the pages I have tried didn't work, lets put this to one side and schedule the testing of this feature on it's own at the end of this process

---

#### Reduced Motion
**Issues:**
I can't test this feature as the pages I have tried didn't work, lets put this to one side and schedule the testing of this feature on it's own at the end of this process the same applys to auto play blocking, reading progress which is not included in this list, simplified interface is not on the list and works well

---

### 🎓 School Tools

#### Canvas Toggle
**Issues:**
Mark all lms tools in this section as alpha, they are currently marked as beta

---

#### Canvas Test
**Issues:**
Mark all lms tools in this section as alpha, they are currently marked as beta

---

#### Moodle Toggle
**Issues:**
Mark all lms tools in this section as alpha, they are currently marked as beta

---

#### Google Classroom
**Issues:**
Mark all lms tools in this section as alpha, they are currently marked as beta - also, you didn't include citations in this section, this should be marked as alpha (use with caution)

---

### 🤖 Local AI

#### Summarization
**Issues:**
none of the ai features display on the quick actions popup so can't test, this applies to local and cloud modes

---

#### AI Simplification
**Issues:**
none of the ai features display on the quick actions popup so can't test, this applies to local and cloud modes

---

#### Socratic Tutor
**Issues:**
none of the ai features display on the quick actions popup so can't test, this applies to local and cloud modes

---

#### Assignment Breakdown
**Issues:**
none of the ai features display on the quick actions popup so can't test, this applies to local and cloud modes

---

### ☁️ Cloud AI

#### API Key Setup
**Issues:**
in the new AI tab of the advanced options put a section for this with a dropdown to chose which supplier to use (anthropic, chatgpt, gemini, etc) then a text field to enter your api key, we need to have a system that will encrypt the api key and not embed/store the key on the system in raw text, this has to be very secure

---

#### Cloud AI Models
**Issues:**
in the new AI tab of the advanced options put a section for this with a dropdown to chose which model to use - this will be context sensitive where depending on the supplier the models will auto populate a dropdown, as this section is in the advanced options there is no need to have this dropdown in the UI for each of the tools (simplify, socratic tutor, etc).

---

### ⌨️ Keyboard Shortcuts

#### Ctrl+Shift+R
**Issues:**
Remove all shortcuts from the system, users should manually enter the shortcuts in advanced options if they want them, have a system where if the user tries to add a shortcut that is already used by chrome the user will be prompted to pick another shortcut

---

#### Ctrl+Shift+T
**Issues:**
Remove all shortcuts from the system, users should manually enter the shortcuts in advanced options if they want them, have a system where if the user tries to add a shortcut that is already used by chrome the user will be prompted to pick another shortcut

---

#### Ctrl+Shift+S
**Issues:**
Remove all shortcuts from the system, users should manually enter the shortcuts in advanced options if they want them, have a system where if the user tries to add a shortcut that is already used by chrome the user will be prompted to pick another shortcut

---

#### Ctrl+Shift+F
**Issues:**
Remove all shortcuts from the system, users should manually enter the shortcuts in advanced options if they want them, have a system where if the user tries to add a shortcut that is already used by chrome the user will be prompted to pick another shortcut

---

#### Ctrl+Shift+D
**Issues:**
Remove all shortcuts from the system, users should manually enter the shortcuts in advanced options if they want them, have a system where if the user tries to add a shortcut that is already used by chrome the user will be prompted to pick another shortcut

---

#### Ctrl+Shift+W
**Issues:**
Remove all shortcuts from the system, users should manually enter the shortcuts in advanced options if they want them, have a system where if the user tries to add a shortcut that is already used by chrome the user will be prompted to pick another shortcut

---

#### ESC (Exit Reading)
**Issues:**
Remove all shortcuts from the system, users should manually enter the shortcuts in advanced options if they want them, have a system where if the user tries to add a shortcut that is already used by chrome the user will be prompted to pick another shortcut

---

### 🖱️ Context Menu

#### Simplify Selected
**Issues:**
AI not functioning

---

## 📝 All Notes & Improvements

### 📋 Header Controls

#### ✗ Reset Button
doesn't work, I activated a number of features and clicked the reset button, the features remained active - this should reset all the features to off by default

---

#### ✗ Help Button
 opens https://github.com/MarJone/AssisT#readme -  I get a 404 on this, no documentation exists, could you create this and link to the button

---

#### ✗ Settings Button
we need to do a full overhaul of the advanced options page, the user should be able to show/hide any feature in the popup html file, anything that exists in the main popup should have a show/hide on the advanced options - features tab. We need to look at the keyboard tab - obvious shorcuts like reading mode, dyslexia mode, activate/deactivate specific profiles, etc.   the 4 tabs is a bit cropped, could  we remove appearance and merge with profiles - I'm happy for you to decide on any other changes that would be useful from an ease of use, flexibility, ui/ux perspective

---

#### ✗ Organize Button
I would like this to be fully customisable, currently we can move features outside their main acordian menu, we can't change the name of the sections eg if I wanted to rename reading help to Reading I can't do this - the pencil tool doesn't work. This should be incorporated in some way with the profiles section in advanced options - users should be able to fully customise the popup and then be able to export that setup to then load on another computer 

---

#### ✓ Organize - Visibility
working as expected  -this should be linked to the feature visability section of the advanced options

---

### 🔊 Reading Help

#### ✗ Word-by-Word
this works fine when at a speed of 1, when speed of reading is changed it is not reflected in the speed of the word highlighting

---

#### ✓ OCR Auto Reading
if there is a way to improve accuracy - great, if it would be to time consuming to achieve - leave it for a future version

---

#### ✗ OCR Language
mark this section as experimental

---

#### ✓ Auto TTS after OCR
it's not auto but that's fine, could we have the ability for the TTS to read directly from the text generated  -allowing the user to correct any problems created by the OCR

---

#### ✓ Highlight Menu
 the testing checklist calls it "Highlight Menu" but the extension calls it "Quick Actions Menu".

---

#### ✗ HM - Read Aloud
this is redundant as tts already exists  -remove from extension

---

#### ✓ HM - Copy
redundant - control+C does the same job - remove from extension

---

### ✏️ Writing Help

#### ✓ STT Toggle
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed -  this is such a huge feature we will need to test this in it's own testing pass

---

#### ✗ Microphone Button
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### ✗ Voice Input Test
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### ✗ STT Pause/Resume
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### ✗ Auto-Punctuation
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### ✗ Voice Commands
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### ✗ Annotations Toggle
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### ✗ Create Annotation
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### ✗ Citations Toggle
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

#### ✗ Text Simplification
can't see Microphone Button so can't test any of this feature - make note to fix this and add to 2nd pass testing once fixed

---

### 📚 Look Up Words

#### ✗ Dictionary Toggle
this is not necessary as this is covered by the quick action menu - remove from the extension

---

#### ✗ Dictionary Test
this is not necessary as this is covered by the quick action menu - remove from the extension

---

#### ✗ Translation Toggle
this is not necessary as this is covered by the quick action menu - remove from the extension

---

#### ✗ Translation Test
this is not necessary as this is covered by the quick action menu - remove from the extension

---

#### ✗ Full-Page Translation
this is not necessary as this is covered by the quick action menu - remove from the extension

---

### 🎨 Page Display

#### ✗ Quiet Mode
I can't test this feature as the pages I have tried didn't work, lets put this to one side and schedule the testing of this feature on it's own at the end of this process

---

#### ✓ Text Customization
works great

---

#### ✗ Reduced Motion
I can't test this feature as the pages I have tried didn't work, lets put this to one side and schedule the testing of this feature on it's own at the end of this process the same applys to auto play blocking, reading progress which is not included in this list, simplified interface is not on the list and works well

---

#### ✓ Stargardt Mode
under mode - mark eye tracking as future feature and grey it out, all other features in this mode work as expected.

---

### 🎓 School Tools

#### ✗ Canvas Toggle
Mark all lms tools in this section as alpha, they are currently marked as beta

---

#### ✗ Canvas Test
Mark all lms tools in this section as alpha, they are currently marked as beta

---

#### ✗ Moodle Toggle
Mark all lms tools in this section as alpha, they are currently marked as beta

---

#### ✗ Google Classroom
Mark all lms tools in this section as alpha, they are currently marked as beta - also, you didn't include citations in this section, this should be marked as alpha (use with caution)

---

### 🤖 Local AI

#### ✓ Local AI Master
there should be a connection with the toggle of cloud AI, have a AI assist section inside this section you will have the 2 AI types as toggles - local and cloud, when local is activated cloud is automatically set to off and visa versa. when activated the local AI you should have the ability to change the local llm being used, the following text should be removed - Powered by Ollama - 100% local, private AI

⚠️ Start Ollama with: OLLAMA_ORIGINS=* ollama serve

Or install models via terminal: ollama pull phi3:mini

Status:
Connected to Ollama
Models:
llama3.1:8b-instruct-q4_K_M, qwen3:8b-q4_K_M, nomic-embed-text:latest +11 more

We should have a button that auto selects the best model for each use case if appropiate, if most use cases use the same model leave that as the model chosen or let the extension decide its self

The model installation section should be put into a new AI tab in the advanced options section of the extension

---

#### ✗ Summarization
none of the ai features display on the quick actions popup so can't test, this applies to local and cloud modes

---

#### ✗ AI Simplification
none of the ai features display on the quick actions popup so can't test, this applies to local and cloud modes

---

#### ✗ Socratic Tutor
none of the ai features display on the quick actions popup so can't test, this applies to local and cloud modes

---

#### ✗ Assignment Breakdown
none of the ai features display on the quick actions popup so can't test, this applies to local and cloud modes

---

### ☁️ Cloud AI

#### ✓ Cloud AI Master
toggle works - the following ui appears   -⚠️ Focus Group Testing Only - Uses Claude 4.5 models for enhanced AI quality. Compare local vs cloud performance.

📊 Usage Statistics
Requests: 0
Total Tokens: 0
Avg In: 0
Avg Out: 0
📤 JSON
📊 CSV
🗑️ Clear
Ready

---

#### ✗ API Key Setup
in the new AI tab of the advanced options put a section for this with a dropdown to chose which supplier to use (anthropic, chatgpt, gemini, etc) then a text field to enter your api key, we need to have a system that will encrypt the api key and not embed/store the key on the system in raw text, this has to be very secure

---

#### ✗ Cloud AI Models
in the new AI tab of the advanced options put a section for this with a dropdown to chose which model to use - this will be context sensitive where depending on the supplier the models will auto populate a dropdown, as this section is in the advanced options there is no need to have this dropdown in the UI for each of the tools (simplify, socratic tutor, etc).

---

### ⌨️ Keyboard Shortcuts

#### ✗ Ctrl+Shift+R
Remove all shortcuts from the system, users should manually enter the shortcuts in advanced options if they want them, have a system where if the user tries to add a shortcut that is already used by chrome the user will be prompted to pick another shortcut

---

#### ✗ Ctrl+Shift+T
Remove all shortcuts from the system, users should manually enter the shortcuts in advanced options if they want them, have a system where if the user tries to add a shortcut that is already used by chrome the user will be prompted to pick another shortcut

---

#### ✗ Ctrl+Shift+S
Remove all shortcuts from the system, users should manually enter the shortcuts in advanced options if they want them, have a system where if the user tries to add a shortcut that is already used by chrome the user will be prompted to pick another shortcut

---

#### ✗ Ctrl+Shift+F
Remove all shortcuts from the system, users should manually enter the shortcuts in advanced options if they want them, have a system where if the user tries to add a shortcut that is already used by chrome the user will be prompted to pick another shortcut

---

#### ✗ Ctrl+Shift+D
Remove all shortcuts from the system, users should manually enter the shortcuts in advanced options if they want them, have a system where if the user tries to add a shortcut that is already used by chrome the user will be prompted to pick another shortcut

---

#### ✗ Ctrl+Shift+W
Remove all shortcuts from the system, users should manually enter the shortcuts in advanced options if they want them, have a system where if the user tries to add a shortcut that is already used by chrome the user will be prompted to pick another shortcut

---

#### ✗ ESC (Exit Reading)
Remove all shortcuts from the system, users should manually enter the shortcuts in advanced options if they want them, have a system where if the user tries to add a shortcut that is already used by chrome the user will be prompted to pick another shortcut

---

### 🖱️ Context Menu

#### ✗ Simplify Selected
AI not functioning

---

