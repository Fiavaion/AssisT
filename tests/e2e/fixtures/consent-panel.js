/**
 * Reaching the consent panel from a Playwright spec (ADR 0006).
 *
 * The panel lives in a CLOSED shadow root, so that the host page's scripts cannot read, restyle or
 * press its buttons. Playwright's locators pierce open shadow roots only, and `page.evaluate` runs
 * in the page's own world, which is exactly the world the panel is closed to. Chrome's DevTools
 * protocol is not a page script: `DOM.getDocument` with `pierce: true` returns closed shadow roots
 * too, and `DOM.resolveNode` hands one to a function run over CDP. So a spec can read the panel and
 * find where its buttons are without the product exposing anything, and presses go through
 * `page.mouse` and `page.keyboard`, which Chrome treats as real input.
 */

/** The first node in a CDP DOM tree (children and shadow roots included) that matches. */
function findNode(node, matches) {
  if (!node) {
    return null;
  }
  if (matches(node)) {
    return node;
  }
  for (const child of [...(node.shadowRoots || []), ...(node.children || [])]) {
    const found = findNode(child, matches);
    if (found) {
      return found;
    }
  }
  return null;
}

function isPanelHost(node) {
  const attributes = node.attributes || [];
  for (let i = 0; i < attributes.length; i += 2) {
    if (attributes[i] === 'data-assist-consent-panel') {
      return true;
    }
  }
  return false;
}

/**
 * Run `fn(root, arg)` against the open consent panel's closed shadow root, over CDP.
 * @param {import('@playwright/test').Page} page
 * @param {(root: ShadowRoot, arg: any) => any} fn - serialised; must not close over anything
 * @param {*} [arg]
 * @returns {Promise<*>} what fn returned, or null when no panel is open
 */
export async function inConsentPanel(page, fn, arg = null) {
  const client = await page.context().newCDPSession(page);
  try {
    const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
    const host = findNode(root, isPanelHost);
    const shadow = host && (host.shadowRoots || [])[0];
    if (!shadow) {
      return null;
    }
    const { object } = await client.send('DOM.resolveNode', { backendNodeId: shadow.backendNodeId });
    const { result, exceptionDetails } = await client.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: `function (arg) { return (${fn.toString()})(this, arg); }`,
      arguments: [{ value: arg }],
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    }
    return result.value;
  } finally {
    await client.detach();
  }
}

/** The panel's accessible name (its title), or null when none is open. */
export function consentPanelTitle(page) {
  return inConsentPanel(page, root => {
    const dialog = root.querySelector('[role="dialog"]');
    const title = dialog && root.getElementById(dialog.getAttribute('aria-labelledby'));
    return title ? title.textContent : null;
  });
}

/** Everything the panel's dialog says. */
export function consentPanelText(page) {
  return inConsentPanel(page, root => root.querySelector('[role="dialog"]')?.textContent || null);
}

/** The label of the panel button that has focus, or null. */
export function focusedConsentButton(page) {
  return inConsentPanel(page, root => root.activeElement?.textContent.trim() || null);
}

/** How many of the panel's words or buttons are cut off. */
export function clippedInConsentPanel(page) {
  return inConsentPanel(
    page,
    root =>
      [...root.querySelectorAll('[role="dialog"] h2, [role="dialog"] p, [role="dialog"] button')]
        .filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
        .length
  );
}

/**
 * Press a panel button with the real mouse, once it can be pressed. Until Chrome has first
 * reported Allow visible, the panel marks Allow aria-disabled and ignores presses on it (a press
 * judged by a later report could be taken while the page had faded it), so a spec that pressed at
 * once would see nothing happen. This waits, as a student would, until Allow is available.
 * @param {import('@playwright/test').Page} page
 * @param {string} name - 'Allow' or 'Not now'
 */
export async function clickConsentButton(page, name) {
  const deadline = Date.now() + 5000;
  let centre = null;
  while (Date.now() < deadline) {
    centre = await inConsentPanel(
      page,
      (root, label) => {
        const button = [...root.querySelectorAll('button')].find(b => b.textContent.trim() === label);
        if (!button) {
          return null;
        }
        const box = button.getBoundingClientRect();
        return {
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          ready: button.getAttribute('aria-disabled') !== 'true',
        };
      },
      name
    );
    if (centre && centre.ready) {
      break;
    }
    await page.waitForTimeout(100);
  }
  if (!centre) {
    throw new Error(`No "${name}" button in the consent panel`);
  }
  if (!centre.ready) {
    throw new Error(`The consent panel's "${name}" button never became available`);
  }
  await page.mouse.click(centre.x, centre.y);
}
