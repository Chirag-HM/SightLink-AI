/* SightLink AI Service Worker — Web Push & Interactive Volunteer Actions */

let cachedAuthToken = null;
let cachedCsrfToken = null;
let cachedApiBase = '';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const payload = event.data || {};
  if (payload.type === 'SET_AUTH_CONTEXT') {
    cachedAuthToken = payload.token || null;
    cachedCsrfToken = payload.csrfToken || null;
    cachedApiBase = payload.apiBase || '';
    return;
  }

  if (payload.type === 'SHOW_LOCAL_NOTIFICATION') {
    const title = payload.title || 'SightLink Alert';
    const options = {
      body: payload.body || '',
      tag: payload.tag || `sightlink-${Date.now()}`,
      renotify: true,
      requireInteraction: Boolean(payload.requireInteraction),
      data: payload.data || {},
      actions: Array.isArray(payload.actions) ? payload.actions : [],
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'SightLink Alert', body: event.data ? event.data.text() : '' };
  }

  const data = payload.data || {};
  const isLiveAssist = Boolean(data.live_assist_id || payload.live_assist_id);
  const isAssistRequest = Boolean(data.request_id || payload.request_id);
  const actions = Array.isArray(payload.actions)
    ? payload.actions
    : isLiveAssist
    ? [
        { action: 'accept_live_assist', title: 'Accept' },
        { action: 'decline_live_assist', title: 'Decline' },
      ]
    : isAssistRequest
    ? [
        { action: 'accept', title: 'Accept' },
        { action: 'decline', title: 'Decline' },
      ]
    : [];

  event.waitUntil(
    self.registration.showNotification(payload.title || 'SightLink Alert', {
      body: payload.body || 'Tap to view details in SightLink.',
      tag: payload.tag || data.live_assist_id || data.request_id || `push-${Date.now()}`,
      renotify: true,
      requireInteraction: isLiveAssist || isAssistRequest || data.event_type === 'SOS_TRIGGERED' || data.urgent,
      data: {
        ...data,
        request_id: data.request_id || payload.request_id || null,
        live_assist_id: data.live_assist_id || payload.live_assist_id || null,
        url: payload.url || (isLiveAssist || isAssistRequest ? '/volunteers' : '/family/track'),
      },
      actions,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const action = event.action;
  const data = event.notification.data || {};
  const requestId = data.request_id;
  const liveAssistId = data.live_assist_id;

  const handleAction = async () => {
    const authHeaders = {
      'Content-Type': 'application/json',
      ...(cachedCsrfToken ? { 'X-CSRF-Token': cachedCsrfToken } : {}),
      ...(cachedAuthToken ? { Authorization: `Bearer ${cachedAuthToken}` } : {}),
    };

    if (liveAssistId && (action === 'accept_live_assist' || action === 'decline_live_assist')) {
      try {
        const sub = action === 'accept_live_assist' ? 'accept' : 'decline';
        await fetch(`${cachedApiBase}/api/live-assist/${encodeURIComponent(liveAssistId)}/${sub}`, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders,
        });
      } catch {
        // Fallback opens UI window below
      }
    } else if (requestId && (action === 'accept' || action === 'decline')) {
      try {
        const endpoint = `${cachedApiBase}/api/assistance/${encodeURIComponent(requestId)}/${action}`;
        await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: authHeaders,
        });
      } catch {
        // Fallback opens UI window below
      }
    }

    let targetPath = data.url || '/volunteers';
    if (liveAssistId && (action === 'accept_live_assist' || action === 'decline_live_assist')) {
      const sub = action === 'accept_live_assist' ? 'accept' : 'decline';
      targetPath = `/volunteers?liveAssistAction=${encodeURIComponent(sub)}&liveAssistId=${encodeURIComponent(liveAssistId)}`;
    } else if (requestId && (action === 'accept' || action === 'decline')) {
      targetPath = `/volunteers?action=${encodeURIComponent(action)}&requestId=${encodeURIComponent(requestId)}`;
    } else if (data.invite_code) {
      targetPath = `/family/track/${encodeURIComponent(data.invite_code)}`;
    }

    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if ('focus' in client) {
        await client.focus();
        client.postMessage({
          type: 'NOTIFICATION_ACTION',
          action: action || 'open',
          request_id: requestId || null,
          live_assist_id: liveAssistId || null,
          url: targetPath,
        });
        return;
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetPath);
    }
  };

  event.waitUntil(handleAction());
});

