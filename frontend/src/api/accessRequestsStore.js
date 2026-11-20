/**
 * Shared access-request data (incoming inbox + requests the user sent).
 *
 * The sidebar badge, the notification bell, the dashboard counter and the
 * Access Requests page all need the same two lists.  Previously each one
 * polled the API on its own timer; now one poller fetches both lists and
 * every component reads the shared result.
 *
 * - The poll interval is the shortest one requested by any mounted component
 *   (15 s normally, faster while the Access Requests page is open).
 * - Polling pauses while the browser tab is hidden and refreshes when the
 *   user comes back.
 * - Concurrent refreshes are de-duplicated into one pair of requests.
 */
import { useEffect, useSyncExternalStore } from 'react';
import client from './client';

export const DEFAULT_POLL_MS = 15000;

const EMPTY = { inbox: [], sent: [], loaded: false, loading: false };

let state = EMPTY;
let ownerKey = null;      // which user the cached data belongs to
let generation = 0;       // bumps on user change so stale responses are dropped
let inFlight = null;
let timer = null;
let nextSubscriberId = 0;
const listeners = new Set();
const pollIntervals = new Map(); // subscriber id -> requested interval (ms)

const emit = () => listeners.forEach((listener) => listener());
const setState = (patch) => {
  state = { ...state, ...patch };
  emit();
};

/** Fetch both lists now (shared by all callers while a fetch is running). */
export function refreshAccessRequests() {
  if (inFlight) return inFlight;
  if (!localStorage.getItem('triad_token')) return Promise.resolve();

  const gen = generation;
  setState({ loading: true });
  inFlight = Promise.all([client.get('/access/inbox'), client.get('/access/my-requests')])
    .then(([inboxRes, sentRes]) => {
      if (gen !== generation) return; // user changed meanwhile
      setState({
        inbox: inboxRes.data?.requests || [],
        sent: sentRes.data?.requests || [],
        loaded: true,
      });
    })
    .catch((err) => console.error('Failed to fetch access requests:', err))
    .finally(() => {
      inFlight = null;
      if (gen === generation) setState({ loading: false });
    });
  return inFlight;
}

function reschedule() {
  if (timer) clearInterval(timer);
  timer = null;
  if (pollIntervals.size === 0) return;
  const ms = Math.min(...pollIntervals.values());
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshAccessRequests();
  }, ms);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && pollIntervals.size > 0) {
      refreshAccessRequests();
    }
  });
}

function useOwner(userKey) {
  useEffect(() => {
    if (!userKey || userKey === ownerKey) return;
    // A different user logged in: drop the previous user's cached requests.
    ownerKey = userKey;
    generation += 1;
    inFlight = null;
    state = EMPTY;
    emit();
    refreshAccessRequests();
  }, [userKey]);
}

/**
 * Subscribe to the shared access-request data.
 *
 * @param {string|null} userKey  id of the logged-in user (null = logged out)
 * @param {number|null} pollMs   how often this component wants updates;
 *                               null = read the shared data without polling
 */
export function useAccessRequests(userKey, pollMs = DEFAULT_POLL_MS) {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );

  useOwner(userKey);

  useEffect(() => {
    if (!userKey) return undefined;
    if (!state.loaded && !inFlight) refreshAccessRequests();
    if (!pollMs) return undefined;
    const id = ++nextSubscriberId;
    pollIntervals.set(id, pollMs);
    reschedule();
    return () => {
      pollIntervals.delete(id);
      reschedule();
    };
  }, [userKey, pollMs]);

  return { ...snapshot, refresh: refreshAccessRequests };
}
