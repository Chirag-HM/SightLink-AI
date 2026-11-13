export const OFFLINE_QUEUE_KEY = 'sightlink_offline_outbox';

function getStorage(customStorage) {
  if (customStorage) return customStorage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return null;
}

export function getOfflineQueue(customStorage) {
  const store = getStorage(customStorage);
  if (!store) return [];
  try {
    const raw = store.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(items, customStorage) {
  const store = getStorage(customStorage);
  if (!store) return;
  try {
    store.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage quota errors
  }
}

export function enqueueOfflineAction(action, customStorage) {
  const queue = getOfflineQueue(customStorage);
  const entry = {
    id: action.id || `oq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: action.kind, // 'sos' | 'volunteer' | 'family_checkin'
    payload: action.payload || {},
    label: action.label || action.kind,
    createdAt: action.createdAt || new Date().toISOString(),
  };
  const next = [...queue, entry];
  saveOfflineQueue(next, customStorage);
  return entry;
}

export function clearOfflineQueue(customStorage) {
  saveOfflineQueue([], customStorage);
}

/**
 * Flush queued offline actions sequentially when connectivity returns.
 */
export async function flushOfflineQueue(executors = {}, customStorage) {
  const queue = getOfflineQueue(customStorage);
  if (queue.length === 0) {
    return { flushedCount: 0, remainingCount: 0, results: [] };
  }

  const remaining = [];
  const results = [];
  let flushedCount = 0;

  for (const item of queue) {
    const fn = executors[item.kind];
    if (typeof fn !== 'function') {
      remaining.push(item);
      continue;
    }
    try {
      const response = await fn(item.payload, item);
      flushedCount += 1;
      results.push({ id: item.id, kind: item.kind, status: 'sent', response });
    } catch (err) {
      // Keep item queued if transient network failure; discard deterministic 4xx payload errors
      const httpStatus = Number(err?.status || 0);
      if (httpStatus >= 400 && httpStatus < 500) {
        results.push({ id: item.id, kind: item.kind, status: 'dropped', error: err?.message });
      } else {
        remaining.push(item);
        results.push({ id: item.id, kind: item.kind, status: 'retry_later', error: err?.message });
      }
    }
  }

  saveOfflineQueue(remaining, customStorage);
  return {
    flushedCount,
    remainingCount: remaining.length,
    results,
  };
}

