import { AsyncLocalStorage } from "node:async_hooks";

if (!global._requestUserContext) {
  global._requestUserContext = new AsyncLocalStorage();
}

const requestContext = global._requestUserContext;

function normalizeUser(user) {
  if (!user?.id || !user?.username) return null;
  return { id: String(user.id), username: String(user.username) };
}

/**
 * Execute an async request handler with its dashboard user available to
 * console-log capture. AsyncLocalStorage keeps concurrent request contexts
 * isolated while their asynchronous work is in flight.
 */
export function runWithRequestUser(user, handler) {
  return requestContext.run({ user: normalizeUser(user) }, handler);
}

/**
 * Update the user associated with the active request, for example after the
 * selected provider connection resolves its owner.
 */
export function setRequestUser(user) {
  const store = requestContext.getStore();
  if (store) {
    store.user = normalizeUser(user);
    return;
  }
  requestContext.enterWith({ user: normalizeUser(user) });
}

export function getRequestUser() {
  return requestContext.getStore()?.user || null;
}
