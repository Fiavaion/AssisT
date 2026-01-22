# AssisT Extension - Focus Group Testing Package

Welcome to the AssisT Extension focus group! Thank you for helping us test this accessibility-focused Chrome extension.

## What is AssisT?

AssisT is a Chrome extension designed to enhance accessibility for neurodivergent students using the Canvas Learning Management System. It provides features like:

- Text-to-Speech (TTS) with synchronized highlighting
- Speech-to-Text (STT) for writing assistance
- OCR for reading text from images
- AI-powered study tools
- Customizable reading modes and highlighting
- And much more!

## Installation Instructions

### For Chrome Users

1. **Open Chrome Extension Settings**
   - Open Google Chrome
   - Type `chrome://extensions/` in the address bar and press Enter
   - OR click the three dots menu (⋮) → More Tools → Extensions

2. **Enable Developer Mode**
   - Look for the "Developer mode" toggle in the top-right corner
   - Turn it ON (it should turn blue)

3. **Load the Extension**
   - Click the "Load unpacked" button
   - Navigate to this `FG_build` folder on your computer
   - Select the folder and click "Select Folder" (or "Open")

4. **Verify Installation**
   - You should see "AssisT" appear in your list of extensions
   - Make sure it's enabled (toggle should be blue/on)

### For Microsoft Edge Users

1. **Open Edge Extension Settings**
   - Open Microsoft Edge
   - Type `edge://extensions/` in the address bar and press Enter
   - OR click the three dots menu (⋯) → Extensions

2. **Enable Developer Mode**
   - Look for the "Developer mode" toggle in the bottom-left corner
   - Turn it ON

3. **Load the Extension**
   - Click the "Load unpacked" button
   - Navigate to this `FG_build` folder on your computer
   - Select the folder and click "Select Folder"

4. **Verify Installation**
   - You should see "AssisT" appear in your list of extensions
   - Make sure it's enabled (toggle should be on)

## Testing the Extension

### Quick Start

1. **Navigate to Canvas**
   - Go to any Canvas LMS page (e.g., `canvas.instructure.com`)
   - The extension should automatically activate on Canvas pages

2. **Open the Extension Popup**
   - Click the AssisT icon in your browser's toolbar
   - If you don't see it, click the puzzle piece icon and pin AssisT

3. **Explore Features**
   - Try different features by clicking their buttons
   - Test settings in the Advanced Options (gear icon)
   - Experiment with keyboard shortcuts

### Using the Feature Testing Tool

We've included a comprehensive testing checklist to help you systematically test all 83+ features and document any issues.

#### Opening the Testing Tool

1. **Locate the file:**
   - In the `FG_build` folder, find `feature-testing.html`

2. **Open in your browser:**
   - Double-click the file, or
   - Right-click → Open with → Chrome/Edge

#### Using the Testing Tool

**Search Functionality:**

- Use the search box at the top to quickly find features
- Example searches: "OCR", "highlight", "dictionary", "keyboard"
- The tool will auto-expand sections containing matching features
- Matching text will be highlighted in yellow

**Testing Features:**

- Click section headers to expand/collapse them
- For each feature, mark it as:
  - ✓ **Pass** - Works correctly
  - ✗ **Fail** - Has bugs or doesn't work
  - ○ **Skip** - Couldn't test or not applicable

**Documenting Issues:**

- Click the notes area under each feature
- Document bugs, improvements, or observations
- Be specific: What did you do? What happened? What should have happened?

**Tracking Progress:**

- Your progress is automatically saved in your browser
- The progress bar at the top shows overall completion
- Stats show how many features you've tested

**Exporting Results:**

1. **Export Bug Report** (Markdown format)
   - Click "Export Results" button
   - Saves a detailed markdown file with all failed features and notes
   - Send this file back to us!

2. **Export Progress** (JSON format)
   - Click "Export Progress" button
   - Saves your current testing progress
   - You can import this on another computer to continue testing

**Other Controls:**

- **Expand All** - Opens all sections at once
- **Collapse All** - Closes all sections
- **Clear All** - Resets all testing data (use with caution!)
- **Import Progress** - Load previously saved progress

## What We're Looking For

### Critical Issues

- Features that don't work at all
- Features that crash or freeze the browser
- Features that interfere with Canvas functionality
- Security or privacy concerns

### Usability Issues

- Features that are confusing or hard to use
- UI elements that are hard to find or understand
- Accessibility problems (keyboard navigation, screen reader issues)
- Features that are slow or laggy

### Improvement Suggestions

- Features that could work better
- Missing features you'd like to see
- UI/UX improvements
- Workflow enhancements

## Tips for Effective Testing

1. **Test on Real Canvas Pages**
   - Use your actual Canvas courses if possible
   - Test on different page types (assignments, discussions, quizzes, etc.)

2. **Test Different Scenarios**
   - Try features with different types of content (text, images, videos)
   - Test with both short and long content
   - Try edge cases (what happens if you click twice quickly?)

3. **Document Everything**
   - Even small issues are worth noting
   - Include steps to reproduce bugs
   - Mention your browser and OS version for any major issues

4. **Take Your Time**
   - You don't need to test everything in one session
   - Your progress is saved automatically
   - Come back and continue testing when convenient

## System Requirements

- **Browser:** Chrome 90+ or Edge 90+
- **Operating System:** Windows, macOS, or Linux
- **Canvas Access:** Access to a Canvas LMS instance for testing

## Getting Help

If you encounter any issues during testing or have questions:

1. **Check the Extension's Help**
   - Click the "?" button in the extension popup

2. **Document in Testing Tool**
   - Use the notes section to document your questions
   - We'll review all feedback submitted

3. **Contact Information**
   - [Your contact email/information here]

## Privacy & Data

- All AI processing can be done locally (no data sent to servers)
- Cloud AI features are optional and can be disabled
- Testing data is stored only in your browser's localStorage
- No personal data is collected or transmitted during focus group testing

## Thank You!

Your feedback is invaluable in making AssisT better for all users. We genuinely appreciate the time you're taking to help us improve this accessibility tool.

**Please submit your completed testing results by [deadline date]**

---

_AssisT Extension - Adaptive EdTech for Neurodivergent Students_
