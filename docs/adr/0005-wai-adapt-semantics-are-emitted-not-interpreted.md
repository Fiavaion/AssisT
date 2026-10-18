# ADR 0005: AssisT emits WAI-Adapt semantics on its own controls, and interprets none

Date: 2026-09-25. Status: accepted.

## Context

WAI-Adapt is a W3C draft vocabulary of attributes that let a page declare what its content and its
controls mean, rather than only how they look. A control marked with its purpose can be relabelled,
replaced with a symbol, or hidden by whatever tooling the reader brings with them. A student who reads
pictures rather than words can be shown a symbol set they already know. A student who is overwhelmed by
a crowded interface can have the parts that are not essential taken away. The specification is split
into Symbols, Tools and Content.

The project's own accessibility rule has named WAI-Adapt semantics a requirement since it was written,
alongside WCAG 2.2 AA and the three success criteria this extension exists to serve.

A full sweep of the extension found that requirement unmet, and found it unmet in a way nobody had
noticed because a file appeared to be doing the work. `src/adapters/wai-adapt-manager.js` was 344 lines
carrying the name, and it did not implement WAI-Adapt semantics at all. It applied text spacing and hid
extraneous page elements, which are features rather than semantics, and both of those already ship:
`src/features/textCustomization/textCustomization.js` applies the same four spacing values that the dead
module held, and focus mode has its own feature. Nothing imported the module and it never reached the
build. Searching the source for `data-symbol`, `data-purpose` and any `adapt-` attribute returned
nothing, so the actual requirement had no implementation anywhere.

Neither published accessibility report overstates this. Both say the code was reviewed against
WAI-Adapt concepts, which is exactly what happened.

The awkward part of this decision is that WAI-Adapt is still a Draft. No browser and no assistive
technology consumes these attributes natively today. Emitting them buys a student nothing this week.

## Decision

Delete the misnamed module and its unread `waiAdapt` settings branch, and implement the requirement
where it actually lives: AssisT's own controls carry WAI-Adapt attributes.

- **Tools and Help semantics** go on the controls whose purpose a reader's tooling would want to know,
  which is also what SC 3.2.6 Consistent Help asks for in a different vocabulary.
- **Symbols** go where a control has an unambiguous symbol to point at, and nowhere else. A wrong symbol
  is worse than an absent one, because it is confidently wrong to somebody relying on it.
- **Nothing is interpreted.** AssisT does not read these attributes from host pages and does not adapt
  Canvas, Moodle or Google Classroom on the strength of them. It declares its own interface and stops
  there.

A gate test keeps this from rotting, because an attribute nothing consumes is exactly the kind of thing
that gets dropped in a refactor without anybody noticing.

Text spacing, SC 1.4.12, is satisfied by `textCustomization` and is not re-implemented. That was the
real content of the deleted module and it works.

## Consequences

The claim this earns is narrow and should be written narrowly: AssisT emits WAI-Adapt semantics on its
own interface. It does not support WAI-Adapt, because supporting a vocabulary means interpreting it, and
nothing here interprets anything. Any store listing or accessibility report that
states it more warmly than that is overstating it.

The benefit is forward-looking. If and when the specification gains consumers, this interface is already
legible to them, and the cost of being early is a handful of attributes and one test. The alternative
considered and rejected was to soften the project rule to describe what shipped. That would have been
honest and free, and it would have left a future session to rediscover the same gap from the same file
name.

The deleted module is in git history if the text-spacing approach it took is ever wanted, though the
shipped feature is the better of the two implementations.
