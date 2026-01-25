# AssisT Extension - Testing Results v2 & Bug Report

**Generated:** 25/01/2026, 13:04:05

---

## Summary

- **Total Features:** 191
- **Tested:** 0
- **Passed:** 0 ✓
- **Failed:** 0 ✗
- **Skipped:** 0 ○
- **Progress:** 0%

---

## ❌ Failed Features (Require Fixes)

_No failed features!_

## 📝 All Notes & Improvements

### 📋 Header Controls

#### ○ Help Button

chrome-extension://heminaclmlpboaofloemnkgocmmbcepl/src/pages/help/help.html - Your file couldn’t be accessed
It may have been moved, edited or deleted.
ERR_FILE_NOT_FOUND

---

#### ○ Settings Button

Storage mode only has chrome local storage as an option, if there is only one option we don't need this or the dropdown, if there is more that 1 mode then fix the dropdown. Annotation settings dropdowns don't work, maybe this is the larger issue similar to storage mode. All dropdowns are not working in the advanced options section, this is serious, we need to fix this first - when I mention a dropdown at any stage below the add that to the list of non functioning dropdown menus - no change from last time

---

#### ○ Organize Button

looks better when clicking on the organise button, still broken though

---

#### ○ Discovery Quiz

still not working - service-worker.js:1243 [AssisT] Background service worker initialized
service-worker.js:29 [AssisT] Setting up context menus...
service-worker.js:45 [AssisT] Context menus created
service-worker.js:1230 [AssisT] Tab activated: 242464220
service-worker.js:1230 [AssisT] Tab activated: 242464207
service-worker.js:1230 [AssisT] Tab activated: 242464207
message-router.js:13 [MessageRouter] Routing message: GET_SETTINGS from: popup
message-router.js:13 [MessageRouter] Routing message: UPDATE_SETTINGS from: popup
message-router.js:13 [MessageRouter] Routing message: undefined from: popup
message-router.js:45 [MessageRouter] Error routing message: Error: Unknown message type: undefined
at MessageRouter.route (message-router.js:42:17)
at service-worker.js:532:17
route @ message-router.js:45
message-router.js:13 [MessageRouter] Routing message: undefined from: popup
message-router.js:45 [MessageRouter] Error routing message: Error: Unknown message type: undefined
at MessageRouter.route (message-router.js:42:17)
at service-worker.js:532:17
route @ message-router.js:45
storage-manager.js:245 [Storage] Settings saved
message-router.js:144 [MessageRouter] Broadcasted to 0 Canvas tabs
service-worker.js:1230 [AssisT] Tab activated: 242464223
service-worker.js:1230 [AssisT] Tab activated: 242464207
service-worker.js:1230 [AssisT] Tab activated: 242464207
message-router.js:13 [MessageRouter] Routing message: GET_SETTINGS from: popup
message-router.js:13 [MessageRouter] Routing message: UPDATE_SETTINGS from: popup
message-router.js:13 [MessageRouter] Routing message: undefined from: popup
message-router.js:45 [MessageRouter] Error routing message: Error: Unknown message type: undefined
at MessageRouter.route (message-router.js:42:17)
at service-worker.js:532:17
route @ message-router.js:45
message-router.js:13 [MessageRouter] Routing message: undefined from: popup
message-router.js:45 [MessageRouter] Error routing message: Error: Unknown message type: undefined
at MessageRouter.route (message-router.js:42:17)
at service-worker.js:532:17
route @ message-router.js:45
storage-manager.js:245 [Storage] Settings saved
message-router.js:144 [MessageRouter] Broadcasted to 0 Canvas tabs
service-worker.js:1230 [AssisT] Tab activated: 242464228
sanitize.js:1 Failed to load resource: net::ERR_FILE_NOT_FOUND

---

#### ○ Organize - Drag/Drop

not working

---

#### ○ Organize - Visibility

not working

---

#### ○ Organize - Persistence

can't test as the other functions don't work

---
