/** @jest-environment jsdom */

import {
  SENTINEL_STATES,
  createClaimSentinelBadge,
} from '../../../../src/features/citations/ui/claim-sentinel-badge.js';

// ── SENTINEL_STATES export ────────────────────────────────────────────────────

describe('SENTINEL_STATES', () => {
  it('exports the four expected state strings', () => {
    expect(SENTINEL_STATES).toEqual(['unchecked', 'checking', 'supported', 'unsupported']);
  });

  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(SENTINEL_STATES)).toBe(true);
  });
});

// ── available:false — no-stub guarantee ──────────────────────────────────────

describe('createClaimSentinelBadge({ available: false })', () => {
  let badge;

  beforeEach(() => {
    badge = createClaimSentinelBadge({ available: false });
  });

  it('returns null for el', () => {
    expect(badge.el).toBeNull();
  });

  it('getState() returns null', () => {
    expect(badge.getState()).toBeNull();
  });

  it('setState() does not throw', () => {
    expect(() => badge.setState('checking')).not.toThrow();
  });

  it('setState() does not create any DOM nodes', () => {
    badge.setState('supported');
    expect(badge.el).toBeNull();
  });

  it('destroy() does not throw', () => {
    expect(() => badge.destroy()).not.toThrow();
  });

  it('nothing is added to document.body when available:false', () => {
    const before = document.body.children.length;
    createClaimSentinelBadge({ available: false });
    expect(document.body.children.length).toBe(before);
  });
});

// ── Default badge (available:true, state:'unchecked') ────────────────────────

describe('createClaimSentinelBadge() — defaults', () => {
  let badge;

  beforeEach(() => {
    badge = createClaimSentinelBadge();
  });

  it('el is a <span>', () => {
    expect(badge.el.tagName).toBe('SPAN');
  });

  it('el has base class "assist-cite-sentinel"', () => {
    expect(badge.el.classList.contains('assist-cite-sentinel')).toBe(true);
  });

  it('el has no state modifier class by default (unchecked = base only)', () => {
    expect(badge.el.classList.contains('assist-cite-sentinel--checking')).toBe(false);
    expect(badge.el.classList.contains('assist-cite-sentinel--supported')).toBe(false);
    expect(badge.el.classList.contains('assist-cite-sentinel--unsupported')).toBe(false);
  });

  it('displays word "Not checked"', () => {
    const wordEl = badge.el.querySelector('.assist-cite-sentinel__word');
    expect(wordEl.textContent).toBe('Not checked');
  });

  it('displays icon "○"', () => {
    const iconEl = badge.el.querySelector('.assist-cite-sentinel__icon');
    expect(iconEl.textContent).toBe('○');
  });

  it('getState() returns "unchecked"', () => {
    expect(badge.getState()).toBe('unchecked');
  });

  it('aria-busy is not set on unchecked state', () => {
    expect(badge.el.hasAttribute('aria-busy')).toBe(false);
  });
});

// ── Initial state override ────────────────────────────────────────────────────

describe('createClaimSentinelBadge({ state: "supported" })', () => {
  it('reflects the given initial state', () => {
    const badge = createClaimSentinelBadge({ state: 'supported' });
    expect(badge.getState()).toBe('supported');
    expect(badge.el.classList.contains('assist-cite-sentinel--supported')).toBe(true);
    expect(badge.el.querySelector('.assist-cite-sentinel__word').textContent).toBe('Source supports this');
  });
});

describe('createClaimSentinelBadge({ state: "invalid-initial" })', () => {
  it('falls back to unchecked when initial state is invalid', () => {
    const badge = createClaimSentinelBadge({ state: 'invalid-initial' });
    expect(badge.getState()).toBe('unchecked');
    expect(badge.el.querySelector('.assist-cite-sentinel__word').textContent).toBe('Not checked');
  });
});

// ── setState transitions ──────────────────────────────────────────────────────

describe('setState("checking")', () => {
  let badge;

  beforeEach(() => {
    badge = createClaimSentinelBadge();
    badge.setState('checking');
  });

  it('adds --checking modifier class', () => {
    expect(badge.el.classList.contains('assist-cite-sentinel--checking')).toBe(true);
  });

  it('displays word "Checking…"', () => {
    expect(badge.el.querySelector('.assist-cite-sentinel__word').textContent).toBe('Checking…');
  });

  it('displays icon "…"', () => {
    expect(badge.el.querySelector('.assist-cite-sentinel__icon').textContent).toBe('…');
  });

  it('sets aria-busy="true"', () => {
    expect(badge.el.getAttribute('aria-busy')).toBe('true');
  });

  it('getState() returns "checking"', () => {
    expect(badge.getState()).toBe('checking');
  });
});

describe('setState("supported")', () => {
  let badge;

  beforeEach(() => {
    badge = createClaimSentinelBadge();
    badge.setState('supported');
  });

  it('adds --supported modifier class', () => {
    expect(badge.el.classList.contains('assist-cite-sentinel--supported')).toBe(true);
  });

  it('displays word "Source supports this"', () => {
    expect(badge.el.querySelector('.assist-cite-sentinel__word').textContent).toBe('Source supports this');
  });

  it('displays icon "✓"', () => {
    expect(badge.el.querySelector('.assist-cite-sentinel__icon').textContent).toBe('✓');
  });

  it('clears aria-busy', () => {
    // Transition from checking (where aria-busy was set) to supported.
    const b = createClaimSentinelBadge({ state: 'checking' });
    b.setState('supported');
    expect(b.el.hasAttribute('aria-busy')).toBe(false);
  });

  it('getState() returns "supported"', () => {
    expect(badge.getState()).toBe('supported');
  });
});

describe('setState("unsupported")', () => {
  let badge;

  beforeEach(() => {
    badge = createClaimSentinelBadge();
    badge.setState('unsupported');
  });

  it('adds --unsupported modifier class', () => {
    expect(badge.el.classList.contains('assist-cite-sentinel--unsupported')).toBe(true);
  });

  it('displays word "Source may not support this"', () => {
    expect(badge.el.querySelector('.assist-cite-sentinel__word').textContent).toBe('Source may not support this');
  });

  it('displays icon "⚠"', () => {
    expect(badge.el.querySelector('.assist-cite-sentinel__icon').textContent).toBe('⚠');
  });

  it('getState() returns "unsupported"', () => {
    expect(badge.getState()).toBe('unsupported');
  });
});

// ── In-place patching — same el reference, one modifier at a time ─────────────

describe('setState patches in place', () => {
  it('el reference is unchanged after setState', () => {
    const badge = createClaimSentinelBadge();
    const before = badge.el;
    badge.setState('supported');
    expect(badge.el).toBe(before);
  });

  it('only one --state modifier class is present after a transition', () => {
    const badge = createClaimSentinelBadge();
    badge.setState('checking');
    badge.setState('supported');

    const modifiers = ['checking', 'supported', 'unsupported'].filter(m =>
      badge.el.classList.contains(`assist-cite-sentinel--${m}`)
    );
    expect(modifiers).toHaveLength(1);
    expect(modifiers[0]).toBe('supported');
  });

  it('cycling through all states always leaves exactly 0 or 1 modifier', () => {
    const badge = createClaimSentinelBadge();
    const ALL_MODS = ['checking', 'supported', 'unsupported'];

    for (const state of SENTINEL_STATES) {
      badge.setState(state);
      const active = ALL_MODS.filter(m =>
        badge.el.classList.contains(`assist-cite-sentinel--${m}`)
      );
      // unchecked = 0 modifiers; others = exactly 1
      if (state === 'unchecked') {
        expect(active).toHaveLength(0);
      } else {
        expect(active).toHaveLength(1);
      }
    }
  });
});

// ── Invalid state guard ───────────────────────────────────────────────────────

describe('setState with invalid state', () => {
  it('does not throw on garbage input', () => {
    const badge = createClaimSentinelBadge({ state: 'supported' });
    expect(() => badge.setState('garbage')).not.toThrow();
  });

  it('state is unchanged after garbage input', () => {
    const badge = createClaimSentinelBadge({ state: 'supported' });
    badge.setState('garbage');
    expect(badge.getState()).toBe('supported');
  });

  it('DOM word is unchanged after garbage input', () => {
    const badge = createClaimSentinelBadge({ state: 'supported' });
    badge.setState('garbage');
    expect(badge.el.querySelector('.assist-cite-sentinel__word').textContent).toBe('Source supports this');
  });

  it('does not throw on empty string', () => {
    const badge = createClaimSentinelBadge();
    expect(() => badge.setState('')).not.toThrow();
    expect(badge.getState()).toBe('unchecked');
  });

  it('does not throw on null', () => {
    const badge = createClaimSentinelBadge();
    expect(() => badge.setState(null)).not.toThrow();
    expect(badge.getState()).toBe('unchecked');
  });
});

// ── Accessibility attributes ──────────────────────────────────────────────────

describe('accessibility', () => {
  it('icon span has aria-hidden="true"', () => {
    const badge = createClaimSentinelBadge();
    const iconEl = badge.el.querySelector('.assist-cite-sentinel__icon');
    expect(iconEl.getAttribute('aria-hidden')).toBe('true');
  });

  it('badge has aria-label reflecting current state', () => {
    const badge = createClaimSentinelBadge();
    expect(badge.el.getAttribute('aria-label')).toContain('not checked');
  });

  it('aria-label updates when state changes', () => {
    const badge = createClaimSentinelBadge();
    badge.setState('supported');
    expect(badge.el.getAttribute('aria-label')).toContain('supports');
  });

  it('badge is not a button (tagName is SPAN)', () => {
    const badge = createClaimSentinelBadge();
    expect(badge.el.tagName).toBe('SPAN');
  });

  it('badge has no role="button"', () => {
    const badge = createClaimSentinelBadge();
    expect(badge.el.getAttribute('role')).not.toBe('button');
  });

  it('badge is not in the tab order (no tabindex attribute)', () => {
    const badge = createClaimSentinelBadge();
    expect(badge.el.hasAttribute('tabindex')).toBe(false);
  });
});

// ── destroy() ────────────────────────────────────────────────────────────────

describe('destroy()', () => {
  it('removes el from a parent', () => {
    const badge = createClaimSentinelBadge();
    const parent = document.createElement('div');
    parent.appendChild(badge.el);
    expect(parent.contains(badge.el)).toBe(true);

    badge.destroy();
    expect(parent.contains(badge.el)).toBe(false);
  });

  it('does not throw when el is not mounted', () => {
    const badge = createClaimSentinelBadge();
    expect(() => badge.destroy()).not.toThrow();
  });

  it('calling destroy() twice does not throw', () => {
    const badge = createClaimSentinelBadge();
    const parent = document.createElement('div');
    parent.appendChild(badge.el);
    badge.destroy();
    expect(() => badge.destroy()).not.toThrow();
  });
});
