# ADR 0004: The institution branding key is not enterable from the popup in 1.0.0

Date: 2026-09-25. Status: accepted.

## Context

An institution can give AssisT a cosmetic skin: its name and an accent colour, so a student on a
university's own virtual learning environment sees something that belongs there. The mechanism is a
short signed token. It grants no capability at all: `institution-config.normaliseBranding` reduces
whatever arrives to a name and a colour, and `institution-theme.js` darkens any accent until it meets
WCAG AA, so a badly chosen brand colour cannot make text unreadable. The token is signed with Ed25519
and verified against a public key bundled in the build, because otherwise any page or any person could
rename the extension and repaint it, which is a plausible way to make a student trust something they
should not.

There were two ways in. An institution deploying at scale sets `institutionKey` through managed
policy, declared in `managed_schema.json`. A person could also paste a token into a field in the
popup, under Advanced Options.

The signature check is the part that matters, and it turns out it has almost certainly never run. The
one test proving that a genuine token verifies and a forged one is refused lived in the end-to-end
release gate and skipped itself whenever an environment variable holding a test key was unset. That
variable is unset on the development machine and, on the evidence, in continuous integration too. So
the security-relevant half of this feature was shipped on the assumption that it worked.

That was found during a full sweep of the extension, days before 1.0.0 goes to the Chrome Web Store.

## Decision

Withdraw the paste field for 1.0.0. The field, its Apply and Clear buttons and its status line are
removed from the popup, along with the setter behind them, so there is no dead control and nothing in
the popup mentions a key.

Three things are deliberately kept:

- **Managed policy still works, untouched.** An institution rolling AssisT out does not go through the
  popup. `managed_schema.json` still ships and the resolver still reads it.
- **Branding already applied keeps working**, because a student who upgrades should not have their
  university's appearance vanish without explanation.
- **A way back to the plain appearance.** A single control, "Use the standard appearance", appears only
  when branding is in force from a locally stored key. It is deliberately absent for a
  policy-supplied skin, because clearing a local key cannot lift one an institution has pushed, and a
  button that does nothing is worse than no button.

The signature test is rewritten so it cannot skip. It mints an Ed25519 pair in the test itself and
proves four things: a genuine signature verifies, a tampered payload is refused, a payload signed by a
different key is refused, and a malformed or truncated key is refused without throwing. It needs no
environment variable and no private key, and it runs with the ordinary unit tests. The permanently
skipping copy in the release gate is deleted, because a gate that never runs is worse than an absent
one: it reports confidence it has not earned.

## Consequences

The feature is parked, not fixed. The verification code still ships and a policy-supplied key still
runs through it, so the risk is reduced rather than removed — what has gone is the path a person could
reach without an administrator. That is the honest description of this decision.

Bringing the paste field back is a small change, and it should happen on the strength of the test that
now exists rather than on the assumption that replaced it. Before it returns, the verification wants
exercising against a real issued token in a browser, which neither the unit test nor any automated
check here can do.

`scripts/issue-institution-key.mjs` stays in the repository. It contains no key material and is not
part of the build, so it ships to nobody.

An institution that was told to paste a token will now need managed policy instead. Nothing published
promises the paste route, so no documentation is made untrue by this, but anyone who has been told it
verbally needs telling again.
