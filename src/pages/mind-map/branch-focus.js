/**
 * Focus on one branch — the one seam between the map the panes DRAW and the map the student OWNS.
 *
 * Every competing mind map tool lets a student drill into one branch, and for the students this is
 * built for that is not a convenience: a big map is overwhelming, and working on "Argument 2" with
 * the rest of the essay out of sight is most of the value of a mind map at all. So it had to exist.
 *
 * It is a VIEW. Nothing about the map changes, nothing is saved, nothing goes on the undo stack —
 * and the way that is kept true is that it is not a mode the panes know about. The panes are handed
 * a `history`, they read `current()` to draw and they call `apply` to write; this module hands them
 * one whose `current()` is the branch and whose writes go straight through to the real history. So
 * there is no `if (focusMode)` in a pane to get wrong: undo, redo, autosave, multi-select, Move to…,
 * the drags, the inline editors, import and AI generation all keep working because none of them has
 * been touched.
 *
 * Four things this module owns, because each of them is a way a view could lie to a student:
 *
 *  - the breadcrumb, which is the only thing on screen that says where the branch sits, and the way
 *    back up it;
 *  - the branch that stops existing. An undo, an import or a delete in another pane can take the
 *    focused node away, and the student must not be left looking at an empty picture;
 *  - the node that leaves the branch. Outdenting the top level of a focused branch is a real edit
 *    and it is allowed, but the node then goes somewhere out of sight, and saying nothing about it
 *    looks exactly like a delete;
 *  - the selection, which is pruned against the MAP rather than the view (it has to be: a node the
 *    map still holds is still a node). A selected node that has left the view is dropped here, so no
 *    pane is ever asked to draw a ring round something it is not drawing.
 *
 * The derivation itself is `core/branch-view.js`, which is pure and tested on its own. Here it is
 * memoised on the map the ops handed back: a change outside the branch produces a view that is
 * equal to the one on screen, so the view object is KEPT — no pane redraws, and the page can say
 * "Undone: a change outside this branch" instead of leaving the student to wonder.
 *
 * @module pages/mind-map/branch-focus
 */

import { branchView, sameBranchView } from '../../features/mindMap/core/branch-view.js';
import { hasNode } from '../../features/mindMap/core/map-model.js';
import { nodeCount, pathTo } from '../../features/mindMap/core/map-ops.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';

import {
  FOCUS_IS_THE_WHOLE_MAP,
  WHOLE_MAP_SHOWN,
  branchGoneSentence,
  focusedSentence,
  leftBranchSentence,
  selectionShrunkSentence,
} from './focus-sentences.js';
import { SELECT_A_NODE_FIRST, effectiveSet, nameOf } from './node-edits.js';

/**
 * How many steps a trail can hold before the ones in the middle are narrowed on screen.
 *
 * Every step stays a real button whatever this is: the path is what a screen reader reads out and
 * what the keyboard walks. Only the WIDTH of the middle ones is given up, and hovering or focusing
 * one gives it back.
 */
const CRUMBS_IN_FULL = 4;

/**
 * Mount focus mode.
 *
 * @param {HTMLElement} host - where the breadcrumb goes; emptied on mount.
 * @param {Object} options
 * @param {Object} options.history - the REAL `createHistory`. Every write still lands here.
 * @param {Object} options.selection - the shared selection store.
 * @param {(text: string) => void} options.announce - the live region, for what only needs saying.
 * @param {(text: string) => void} options.notify - `showToast`: seen AND said, for the changes a
 *   student watching the screen also has to be told about.
 * @param {(id: string) => void} [options.rescueFocus] - put the keyboard somewhere sensible for a
 *   node, for when a trail button the student is standing on is about to be taken away.
 * @returns {{
 *   history: Object,
 *   isOn: () => boolean,
 *   focused: () => string|null,
 *   reason: () => string,
 *   toggle: () => void,
 *   focusOn: (id: string) => void,
 *   leave: () => void,
 *   subscribe: (listener: () => void) => () => void,
 *   destroy: () => void
 * }}
 */
export function mountBranchFocus(host, options = {}) {
  const {
    history,
    selection,
    announce = () => {},
    notify = () => {},
    rescueFocus = () => {},
  } = options;

  const doc = host.ownerDocument;

  /** The node the student is focused on, or null for the whole map. */
  let focusedId = null;

  /** The map the panes are drawing: the whole map, or the branch. Kept, not rebuilt, when equal. */
  let view = history.current();

  /**
   * The real map `view` was derived from, and the view the panes have actually been told about.
   *
   * The history's notification is NOT the first thing that runs when the map changes: the selection
   * store prunes itself on the same subscription, ahead of this one, and its own listeners move focus
   * — so a pane asking `current()` from there was handed the map as it stood BEFORE the change. That
   * is a lie with teeth: the outline read a node an undo had just removed as still present, tried to
   * remove it again, and threw. So the view is derived on demand as well as on the notification, and
   * `published` is what keeps one derivation from being announced twice or not at all.
   */
  let derivedFrom = history.current();
  let published = view;

  /** Subscribers to the view — the drawing panes, through the history handed back below. */
  const viewListeners = new Set();

  /** Subscribers to the STATE of focus mode — the page's toolbar, and the Details panel's button. */
  const focusListeners = new Set();

  // ── the breadcrumb ────────────────────────────────────────────────────────

  const nav = doc.createElement('nav');
  nav.className = 'assist-mm-crumbs';
  nav.setAttribute('aria-label', 'Focused branch');
  nav.hidden = true;

  const trail = doc.createElement('ol');
  trail.className = 'assist-mm-crumbs__trail';
  nav.appendChild(trail);
  host.replaceChildren(nav);

  /** What is on screen for each step of the trail, by node id: `{ step, control, kind }`. */
  const steps = new Map();
  let crumbCleanups = [];

  /**
   * Build or reuse one step of the trail.
   *
   * Kept by id the way the outline keeps its rows: a change to the map that leaves an ancestor in
   * the path must not take the button out of the document underneath a student standing on it.
   *
   * @param {string} id
   * @param {'button'|'current'} kind
   * @returns {{step: HTMLElement, control: HTMLElement, kind: string}}
   */
  function stepFor(id, kind) {
    const held = steps.get(id);
    if (held && held.kind === kind) {
      return held;
    }
    if (held) {
      held.step.remove();
    }
    const step = doc.createElement('li');
    step.className = 'assist-mm-crumbs__step';
    const separator = doc.createElement('span');
    separator.className = 'assist-mm-crumbs__separator';
    separator.setAttribute('aria-hidden', 'true');
    separator.textContent = '›';
    const label = doc.createElement('span');
    label.className = 'assist-mm-crumb__label';

    let control;
    if (kind === 'current') {
      control = doc.createElement('span');
      // The one step that is not a link to anywhere: it is where the student already is.
      control.setAttribute('aria-current', 'location');
    } else {
      control = doc.createElement('button');
      control.type = 'button';
    }
    control.className = `assist-mm-crumb assist-mm-crumb--${kind}`;
    control.dataset.id = id;
    control.appendChild(label);
    step.append(separator, control);

    const made = { step, control, kind };
    steps.set(id, made);
    return made;
  }

  /** Draw the trail from the centre of the map down to the focused node. */
  function renderCrumbs() {
    const wasIn = nav.contains(doc.activeElement) ? doc.activeElement : null;
    for (const cleanup of crumbCleanups) {
      cleanup();
    }
    crumbCleanups = [];

    if (focusedId === null) {
      nav.hidden = true;
      trail.replaceChildren();
      steps.clear();
      return;
    }

    const map = history.current();
    const path = pathTo(map, focusedId);
    const elements = path.map((id, at) => {
      const last = at === path.length - 1;
      const { step, control } = stepFor(id, last ? 'current' : 'button');
      control.querySelector('.assist-mm-crumb__label').textContent = nameOf(map.nodes[id].text);
      // The trail narrows in the middle when it is long: the first step and the last two keep their
      // width, and a narrowed one opens again on hover or on focus. Not a `title`: a tooltip is not
      // reachable from the keyboard and is read by nothing reliably.
      const folded = path.length > CRUMBS_IN_FULL && at > 0 && at < path.length - 2;
      control.dataset.folded = String(folded);
      if (!last) {
        crumbCleanups.push(
          attachAccessibleHandler(control, 'Mind map focused branch trail', () => {
            // The centre is the whole map, so the first step of the trail is the way out.
            if (id === map.rootId) {
              leave();
            } else {
              focusOn(id);
            }
            rescueFocus(id);
          })
        );
      }
      return step;
    });

    // Only the steps that are out of place are moved: moving an element takes it out of the
    // document for an instant, and whatever was holding the keyboard loses it.
    elements.forEach((element, at) => {
      if (trail.children[at] !== element) {
        trail.insertBefore(element, trail.children[at] || null);
      }
    });
    while (trail.children.length > elements.length) {
      trail.lastElementChild.remove();
    }
    const kept = new Set(path);
    for (const id of [...steps.keys()]) {
      if (!kept.has(id)) {
        steps.get(id).step.remove();
        steps.delete(id);
      }
    }
    nav.hidden = false;

    // A button the student was standing on can go: the trail shortens as they walk up it, and the
    // step they pressed becomes the one they are on. `<body>` is not where they belong afterwards.
    if (wasIn && !wasIn.isConnected) {
      rescueFocus(focusedId);
    }
  }

  // ── the view ──────────────────────────────────────────────────────────────

  /**
   * Bring the view up to date with the map, deriving it if this map has not been derived yet.
   *
   * @returns {Object} the map the panes should be drawing.
   */
  function take() {
    const map = history.current();
    if (map === derivedFrom) {
      return view;
    }
    derivedFrom = map;
    if (focusedId === null || !hasNode(map, focusedId)) {
      // Nothing is narrowing the view, so the map IS the view — the same object, so a pane comparing
      // what an op handed back against what it drew sees exactly what it would have seen before focus
      // mode existed.
      view = map;
      return view;
    }
    const next = branchView(map, focusedId);
    // A change the student cannot see keeps the view they have: no pane redraws, nothing flickers,
    // and the page can say what happened in words instead.
    if (!sameBranchView(view, next)) {
      view = next;
    }
    return view;
  }

  /**
   * Tell the panes, once, when what they are drawing has actually changed.
   *
   * @param {string} opName
   * @returns {boolean} true when a redraw was asked for.
   */
  function publishView(opName) {
    if (view === published) {
      return false;
    }
    published = view;
    for (const listener of [...viewListeners]) {
      // One pane throwing must not stop the others hearing about the change: a half-drawn editor
      // with no error in the console is the worst thing this page can do to a student.
      try {
        listener(view, opName);
      } catch (error) {
        console.error(`[mind map branch focus] view listener failed on ${opName}:`, error);
      }
    }
    return true;
  }

  function publishFocus() {
    for (const listener of [...focusListeners]) {
      try {
        listener();
      } catch (error) {
        console.error('[mind map branch focus] focus listener failed:', error);
      }
    }
  }

  /**
   * Drop anything from the selection that is no longer in the view.
   *
   * The store prunes against the MAP, which is right — a node that moved out of the branch is still
   * a node. But a pane cannot ring a node it is not drawing, and the inspector would be editing
   * something the student cannot see, so the view has the last word on what may be selected in it.
   * The top of the branch is where the selection goes when nothing else survives: it is the one node
   * the student is certainly looking at.
   *
   * @returns {{was: number, now: number}|null} how many were selected and how many are left, when
   *   the set was shrunk — so the caller can say it. Null when nothing was dropped.
   */
  function repairSelection() {
    if (focusedId === null) {
      return null;
    }
    const chosen = selection.ids();
    const inside = chosen.filter(id => hasNode(view, id));
    if (inside.length === chosen.length) {
      return null;
    }
    if (inside.length === 0) {
      selection.set(focusedId, { source: 'program', said: true });
      return { was: chosen.length, now: 1 };
    }
    selection.selectAll(inside, { source: 'program', said: true });
    return { was: chosen.length, now: inside.length };
  }

  /**
   * Say where a node went when a move took it out of the branch.
   *
   * @param {Object} map - the real map, after the change.
   * @param {Object} before - the view as it was.
   */
  function sayLeavers(map, before) {
    const gone = Object.keys(before.nodes).filter(id => hasNode(map, id) && !hasNode(view, id));
    if (gone.length === 0) {
      return;
    }
    // Only the tops of what moved: a branch that left took its own children with it, and naming
    // them one by one would be four sentences about one thing the student did.
    const tops = effectiveSet(map, gone);
    if (tops.length === 0) {
      return;
    }
    const moved = map.nodes[tops[0]];
    const parent = map.nodes[moved.parentId];
    const focused = map.nodes[focusedId];
    // Where an outdent out of a branch puts a node: among the branch's own siblings, just after it.
    const beside =
      Boolean(parent) &&
      moved.parentId === focused.parentId &&
      parent.children.indexOf(tops[0]) === parent.children.indexOf(focusedId) + 1;
    repairSelection();
    notify(
      leftBranchSentence({
        count: tops.length,
        text: moved.text,
        targetText: beside ? focused.text : (parent && parent.text) || '',
        after: beside,
      })
    );
  }

  /**
   * Every change to the real map, whoever made it.
   *
   * @param {Object} map
   * @param {string} opName
   */
  function onRealChange(map, opName) {
    // What the panes are drawing, which is not necessarily `view`: a listener ahead of this one may
    // already have asked `current()` and had the new view derived for it.
    const shown = published;

    // The branch itself has gone — an undo of the step that made it, an import that replaced the
    // map, a delete from another pane. Focus mode is LEFT rather than moved to the nearest surviving
    // ancestor: the branch the student chose is not there, and choosing another one for them is a
    // decision they did not make.
    if (focusedId !== null && !hasNode(map, focusedId)) {
      const lost = shown.nodes[focusedId] ? shown.nodes[focusedId].text : '';
      focusedId = null;
      derivedFrom = null;
      take();
      publishView(opName);
      renderCrumbs();
      publishFocus();
      notify(branchGoneSentence(lost));
      return;
    }

    take();
    const changed = publishView(opName);
    if (focusedId === null) {
      return;
    }
    // The trail is restated either way: where the branch SITS is not part of the view, so a rename
    // of an ancestor, or a move of the branch itself, changes the trail and nothing else. It is
    // keyed by node, so a trail that has not changed loses neither a button nor the keyboard.
    renderCrumbs();
    if (changed) {
      sayLeavers(map, shown);
    }
  }

  const unsubscribeHistory = history.subscribe(onRealChange);

  // ── what the page and the panes are handed ────────────────────────────────

  /**
   * The history the DRAWING panes are given: the same contract, over the branch.
   *
   * `current()` is the view. Everything that writes is the real history's own method, so an undo
   * step, a coalesced keystroke and a mark taken by an editor all mean exactly what they meant
   * before — and `apply` hands back the view because that is the map its caller compared against
   * (an op that changed nothing returns the very same view object, which is how the panes know).
   */
  const viewHistory = {
    current: () => take(),

    /**
     * The whole map, which may be more than the caller is drawing.
     *
     * For the one question a pane can legitimately ask about what it is NOT showing: has this node
     * gone from the student's map, or has it only left the part of it on screen? The canvas's inline
     * editor asks, because the answers are "say it was removed" and "keep the name they typed".
     *
     * @returns {Object}
     */
    real: () => history.current(),

    apply(op, args, applyOptions) {
      history.apply(op, args, applyOptions);
      return take();
    },
    applyBatch(stepList, batchOptions) {
      history.applyBatch(stepList, batchOptions);
      return take();
    },
    undo() {
      history.undo();
      return take();
    },
    redo() {
      history.redo();
      return take();
    },
    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),
    mark: () => history.mark(),
    rewindTo: (mark, rewindOptions) => history.rewindTo(mark, rewindOptions),
    squashSince: (mark, squashOptions) => history.squashSince(mark, squashOptions),
    subscribe(listener) {
      viewListeners.add(listener);
      return () => viewListeners.delete(listener);
    },
  };

  /**
   * Show one branch and nothing else.
   *
   * @param {string} id - the node to focus on. A caller that can refuse asks `reason()` first; this
   *   simply does nothing for the centre or for a node the map does not hold.
   */
  function focusOn(id) {
    const map = history.current();
    if (!hasNode(map, id) || id === map.rootId) {
      return;
    }
    focusedId = id;
    derivedFrom = null;
    take();
    // The panes first, so the picture the page is about to fit exists.
    publishView('focus');
    const shrunk = repairSelection();
    renderCrumbs();
    publishFocus();
    // One toast, not two: the second would replace the first on screen and read over it in the live
    // region, and both halves are news about the same press.
    notify(
      `${focusedSentence(view.nodes[id].text, nodeCount(view))}` +
        `${shrunk ? ` ${selectionShrunkSentence(shrunk.was, shrunk.now)}` : ''}`
    );
  }

  /** Show the whole map again. */
  function leave() {
    if (focusedId === null) {
      return;
    }
    focusedId = null;
    derivedFrom = null;
    take();
    publishView('focus');
    renderCrumbs();
    publishFocus();
    // Said rather than shown: the whole map coming back IS the visible half of the news.
    announce(WHOLE_MAP_SHOWN);
  }

  return {
    history: viewHistory,

    /** @returns {boolean} */
    isOn: () => focusedId !== null,

    /** @returns {string|null} the node the branch hangs from. */
    focused: () => focusedId,

    /**
     * Why the toggle cannot act, or '' when it can.
     *
     * @returns {string}
     */
    reason() {
      if (focusedId !== null) {
        // Leaving is always possible.
        return '';
      }
      const map = history.current();
      const id = selection.get();
      if (!id || !hasNode(map, id)) {
        return SELECT_A_NODE_FIRST;
      }
      return id === map.rootId ? FOCUS_IS_THE_WHOLE_MAP : '';
    },

    /** Focus on the primary selected node, or leave the branch that is already on screen. */
    toggle() {
      if (focusedId !== null) {
        leave();
        return;
      }
      focusOn(selection.get());
    },

    focusOn,
    leave,

    /**
     * @param {() => void} listener - called whenever focus mode is entered, left or moved.
     * @returns {() => void} unsubscribe.
     */
    subscribe(listener) {
      focusListeners.add(listener);
      return () => focusListeners.delete(listener);
    },

    destroy() {
      unsubscribeHistory();
      for (const cleanup of crumbCleanups) {
        cleanup();
      }
      crumbCleanups = [];
      steps.clear();
      viewListeners.clear();
      focusListeners.clear();
      nav.remove();
    },
  };
}
