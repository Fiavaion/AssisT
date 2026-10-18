/**
 * Optional host permissions, asked for and given back by destination (ADR 0006).
 *
 * The origins come from the worker's request module (`OPTIONAL_HOST_ORIGINS`), the one file allowed
 * to name a third-party host. This module is the one place that turns destinations into a Chrome
 * permission call, so the welcome wizard, the popup's "Your data" area and the "Verify citations
 * online" switch agree on which origins a service needs.
 *
 * THE GESTURE RULE. Chrome shows a permission prompt only from inside a user gesture, and the
 * gesture does not survive an `await`. `requestHostPermissions` therefore calls
 * `chrome.permissions.request` synchronously, before it returns, and a caller must call it before
 * awaiting anything in the handler of the click or change that asked.
 *
 * None of these functions throws: a Chrome error reads as "not granted".
 *
 * @module utils/host-permissions
 */

import { OPTIONAL_HOST_ORIGINS } from '../background/third-party-requests.js';
import { listConsents } from './consent.js';

function permissionsApi() {
  return typeof chrome !== 'undefined' && chrome.permissions ? chrome.permissions : null;
}

/**
 * The optional origins the named destinations need, each once.
 * @param {string[]} destinations
 * @returns {string[]}
 */
export function originsFor(destinations) {
  const origins = [];
  (Array.isArray(destinations) ? destinations : []).forEach(destination => {
    const needed =
      typeof destination === 'string' && Object.hasOwn(OPTIONAL_HOST_ORIGINS, destination)
        ? OPTIONAL_HOST_ORIGINS[destination]
        : [];
    needed.forEach(origin => {
      if (!origins.includes(origin)) {
        origins.push(origin);
      }
    });
  });
  return origins;
}

/**
 * Ask Chrome for these origins in one prompt. Call it before any `await` in a gesture handler.
 * @param {string[]} origins
 * @returns {Promise<boolean>} true when every origin is held afterwards (or none was needed)
 */
export function requestHostPermissions(origins) {
  if (!Array.isArray(origins) || origins.length === 0) {
    return Promise.resolve(true);
  }
  const api = permissionsApi();
  if (!api) {
    return Promise.resolve(false);
  }
  try {
    return Promise.resolve(api.request({ origins })).then(
      granted => granted === true,
      () => false
    );
  } catch {
    return Promise.resolve(false);
  }
}

/**
 * Whether Chrome holds every optional origin these destinations need. A destination that needs
 * none is held without asking; an unreadable answer is not held. No gesture is needed to ask.
 * @param {string[]} destinations
 * @returns {Promise<boolean>}
 */
export async function holdsHostPermissions(destinations) {
  const origins = originsFor(destinations);
  if (origins.length === 0) {
    return true;
  }
  const api = permissionsApi();
  if (!api) {
    return false;
  }
  try {
    return (await api.contains({ origins })) === true;
  } catch {
    return false;
  }
}

/**
 * Give back the optional origins of these destinations, once nothing needs them: an origin another
 * allowed destination still uses is kept (selection and page translation share MyMemory).
 * @param {string[]} destinations
 * @returns {Promise<boolean>} true when there was nothing to give back or Chrome removed them
 */
export async function releaseHostPermissions(destinations) {
  const named = Array.isArray(destinations) ? destinations : [];
  const stillAllowed = (await listConsents())
    .filter(entry => entry.state === 'granted' && !named.includes(entry.destination))
    .map(entry => entry.destination);
  const inUse = originsFor(stillAllowed);
  const origins = originsFor(named).filter(origin => !inUse.includes(origin));
  if (origins.length === 0) {
    return true;
  }
  const api = permissionsApi();
  if (!api) {
    return false;
  }
  try {
    return (await api.remove({ origins })) === true;
  } catch {
    return false;
  }
}
