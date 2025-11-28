# Voice Commands Reference

AssisT Adaptive EdTech Extension - Speech-to-Text Voice Commands

## Overview

The STT (Speech-to-Text) feature includes comprehensive voice command support for hands-free editing. Voice commands allow you to delete, replace, navigate, format, and control your text without using the keyboard.

## Command Categories

### Delete Commands

Delete text using voice commands:

| Command                      | Action                                                 |
| ---------------------------- | ------------------------------------------------------ |
| `delete last word`           | Deletes the last word before the cursor                |
| `delete last [N] words`      | Deletes the last N words (e.g., "delete last 3 words") |
| `delete [N] words`           | Deletes N words before cursor                          |
| `delete last sentence`       | Deletes the last sentence                              |
| `delete last [N] sentences`  | Deletes the last N sentences                           |
| `delete last paragraph`      | Deletes the last paragraph                             |
| `delete last [N] paragraphs` | Deletes the last N paragraphs                          |
| `delete last character`      | Deletes one character                                  |
| `delete last [N] characters` | Deletes N characters                                   |
| `delete last line`           | Deletes the current line                               |
| `delete last [N] lines`      | Deletes N lines                                        |
| `delete that`                | Deletes the last dictated text                         |
| `scratch that`               | Same as "delete that"                                  |
| `delete this`                | Same as "delete that"                                  |
| `delete selection`           | Deletes selected text                                  |
| `delete selected`            | Same as "delete selection"                             |
| `delete all`                 | Deletes all text in the field                          |
| `clear all`                  | Same as "delete all"                                   |
| `delete "[text]"`            | Deletes specific text (with quotes)                    |
| `delete [text]`              | Deletes specific text                                  |

### Undo/Redo Commands

Undo or redo your changes:

| Command          | Action                            |
| ---------------- | --------------------------------- |
| `undo`           | Undoes the last change            |
| `undo that`      | Same as "undo"                    |
| `undo last`      | Same as "undo"                    |
| `undo [N]`       | Undoes N changes (e.g., "undo 3") |
| `undo [N] times` | Same as above                     |
| `redo`           | Redoes the last undone change     |
| `redo that`      | Same as "redo"                    |
| `redo [N]`       | Redoes N changes                  |
| `redo [N] times` | Same as above                     |

### Replace Commands

Find and replace text:

| Command                        | Action                                 |
| ------------------------------ | -------------------------------------- |
| `replace "[old]" with "[new]"` | Replaces old text with new (quoted)    |
| `replace [old] with [new]`     | Replaces old text with new             |
| `change "[old]" to "[new]"`    | Same as replace (quoted)               |
| `change [old] to [new]`        | Same as replace                        |
| `correct "[old]" to "[new]"`   | Same as replace (for dyslexia support) |
| `correct [old] to [new]`       | Same as replace                        |
| `replace that with "[new]"`    | Replaces last dictation with new text  |
| `replace that with [new]`      | Same as above                          |

### Select Commands

Select text for editing:

| Command                     | Action                         |
| --------------------------- | ------------------------------ |
| `select all`                | Selects all text               |
| `select last word`          | Selects the last word          |
| `select last [N] words`     | Selects the last N words       |
| `select last sentence`      | Selects the last sentence      |
| `select last [N] sentences` | Selects the last N sentences   |
| `select last paragraph`     | Selects the last paragraph     |
| `select last line`          | Selects the current line       |
| `select "[text]"`           | Selects specific text (quoted) |
| `select [text]`             | Selects specific text          |

### Navigation Commands

Move the cursor:

| Command                     | Action                           |
| --------------------------- | -------------------------------- |
| `go to beginning`           | Moves cursor to start of text    |
| `go to the beginning`       | Same as above                    |
| `go to start`               | Same as above                    |
| `go to end`                 | Moves cursor to end of text      |
| `go to the end`             | Same as above                    |
| `move left`                 | Moves cursor one character left  |
| `move right`                | Moves cursor one character right |
| `move up`                   | Moves cursor up one line         |
| `move down`                 | Moves cursor down one line       |
| `move left [N] words`       | Moves cursor N words left        |
| `move left [N] characters`  | Moves cursor N characters left   |
| `move right [N] words`      | Moves cursor N words right       |
| `move right [N] characters` | Moves cursor N characters right  |
| `move up [N] lines`         | Moves cursor up N lines          |
| `move down [N] lines`       | Moves cursor down N lines        |
| `go to line [N]`            | Moves cursor to line N           |
| `find "[text]"`             | Finds and selects text           |
| `find [text]`               | Finds and selects text           |
| `next`                      | Finds next occurrence            |
| `find next`                 | Same as "next"                   |
| `previous`                  | Finds previous occurrence        |
| `find previous`             | Same as "previous"               |

### Format Commands

Apply formatting (rich text editors only):

| Command                 | Action                          |
| ----------------------- | ------------------------------- |
| `bold that`             | Makes last dictation bold       |
| `make that bold`        | Same as above                   |
| `make bold`             | Makes selection bold            |
| `italicize that`        | Makes last dictation italic     |
| `italic that`           | Same as above                   |
| `make that italic`      | Same as above                   |
| `make italic`           | Makes selection italic          |
| `underline that`        | Underlines last dictation       |
| `make that underlined`  | Same as above                   |
| `new paragraph`         | Inserts a paragraph break       |
| `new line`              | Inserts a line break            |
| `bullet point`          | Starts a bullet list            |
| `numbered list`         | Starts a numbered list          |
| `number list`           | Same as above                   |
| `heading [1-6]`         | Formats as heading level 1-6    |
| `make this heading [N]` | Same as above                   |
| `quote that`            | Formats last dictation as quote |
| `block quote`           | Formats as block quote          |

### Punctuation Commands

Insert punctuation by speaking:

| Command             | Result          |
| ------------------- | --------------- |
| `period`            | `.`             |
| `comma`             | `,`             |
| `question mark`     | `?`             |
| `exclamation point` | `!`             |
| `exclamation mark`  | `!`             |
| `colon`             | `:`             |
| `semicolon`         | `;`             |
| `quote`             | `"`             |
| `end quote`         | `"`             |
| `apostrophe`        | `'`             |
| `dash`              | `-`             |
| `hyphen`            | `-`             |
| `open parenthesis`  | `(`             |
| `close parenthesis` | `)`             |
| `open bracket`      | `[`             |
| `close bracket`     | `]`             |
| `new line`          | Line break      |
| `new paragraph`     | Paragraph break |

## Tips for Best Results

1. **Speak Clearly**: Enunciate commands clearly for better recognition
2. **Pause Between Commands**: Brief pauses help separate commands from dictation
3. **Use Simple Forms First**: Start with basic commands before using complex variants
4. **Combine Commands**: Commands can be followed by regular dictation text

## Examples

### Deleting Text

- Say: "Hello world" then "delete last word"
- Result: "Hello"

### Replacing Text

- Say: "I want to go their"
- Say: "replace their with there"
- Result: "I want to go there"

### Adding Punctuation

- Say: "How are you question mark"
- Result: "How are you?"

### Formatting (Rich Text)

- Say: "Important" then "bold that"
- Result: **Important**

## Neurodivergent-Friendly Features

### ADHD Support

- Commands work in bursts - dictate, then command
- No need to remember exact syntax - multiple variants work
- "scratch that" for quick corrections

### Dyslexia Support

- "correct" command for fixing common spelling mistakes
- Voice-based corrections avoid spelling difficulties
- Clear undo/redo for confidence while writing

### Autism Support

- Consistent command patterns
- Predictable behavior
- No time pressure - commands wait for you

### Anxiety Support

- "undo" and "redo" provide safety net
- Non-destructive - can always recover
- No judgment - just corrections

## Configuration

Voice commands can be enabled/disabled in the extension settings:

1. Click the AssisT extension icon
2. Go to Settings > Speech-to-Text
3. Toggle "Voice Commands" on/off
4. Toggle "Punctuation Commands" on/off

## Troubleshooting

**Commands not recognized?**

- Ensure voice commands are enabled in settings
- Speak the command clearly and completely
- Try the basic form of the command first

**Wrong action performed?**

- Use "undo" to reverse the action
- Check if the command syntax is correct
- Ensure the text you're targeting exists

**Commands work but dictation doesn't?**

- Check microphone permissions
- Verify the correct language is selected
- Try restarting the STT feature

---

_AssisT Adaptive EdTech Extension - Making learning accessible for everyone_
