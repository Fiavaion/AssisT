## Summary

What changed and why. Link the issue if there is one.

## Testing done

- [ ] `npm test` (or the affected suites)
- [ ] `npm run lint`
- [ ] `npm run build` and tried in Chrome from the `.vite/` folder

## Accessibility check

- [ ] Every new or changed control works with the keyboard alone (Tab, Enter, Space, Escape) and focus is managed when it opens and closes
- [ ] Interactive elements use the helpers in `src/utils/event-handlers.js`
- [ ] Labels, contrast and text spacing hold up (WCAG 2.2 AA); `npm run test:a11y` does not regress
- [ ] Not applicable (no UI change)

## Title

- [ ] The PR title is a Conventional Commit, for example `fix(popup): keep focus on the voice picker after closing`
