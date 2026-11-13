import { useState, useEffect, useCallback } from 'react';
import { pushService, getApiBase, getAuthToken, getCookie } from '../services/api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function usePushNotifications({ role = 'volunteer', inviteCode = null, onNotificationAction } = {}) {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const tok = getAuthToken();
        const csrfToken = getCookie('sightlink_csrf');
        reg.active?.postMessage({
          type: 'SET_AUTH_CONTEXT',
          token: tok,
          csrfToken,
          apiBase: getApiBase(),
        });
      })
      .catch(() => {});

    const handleMsg = (event) => {
      if (event.data?.type === 'NOTIFICATION_ACTION') {
        onNotificationAction?.(event.data);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleMsg);
    return () => navigator.serviceWorker.removeEventListener('message', handleMsg);
  }, [onNotificationAction]);

  const enableNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') {
      return { granted: false, reason: 'unsupported' };
    }

    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    setPermission(perm);
    if (perm !== 'granted') {
      return { granted: false, reason: perm };
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const tok = getAuthToken();
      const csrfToken = getCookie('sightlink_csrf');
      reg.active?.postMessage({
        type: 'SET_AUTH_CONTEXT',
        token: tok,
        csrfToken,
        apiBase: getApiBase(),
      });

      const keyResp = await pushService.getVapidKey();
      if (keyResp?.vapid_public_key && reg.pushManager) {
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyResp.vapid_public_key),
        });
        const json = sub.toJSON();
        await pushService.subscribe({
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          role,
          invite_code: inviteCode,
        });
      } else {
        await pushService.subscribe({
          endpoint: `sw-local://${role}/${inviteCode || Date.now()}`,
          role,
          invite_code: inviteCode,
        });
      }
      setSubscribed(true);
      return { granted: true };
    } catch {
      setSubscribed(true);
      return { granted: true };
    }
  }, [role, inviteCode]);

  const showLocalNotification = useCallback(
    async ({ title, body, tag, requireInteraction = false, data = {}, actions = [] }) => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, {
            body,
            tag: tag || `sightlink-${Date.now()}`,
            renotify: true,
            requireInteraction,
            data,
            actions: Array.isArray(actions) ? actions : [],
          });
          return;
        }
        if (reg?.active) {
          reg.active.postMessage({
            type: 'SHOW_LOCAL_NOTIFICATION',
            title,
            body,
            tag,
            requireInteraction,
            data,
            actions,
          });
          return;
        }
        new Notification(title, { body, tag });
      } catch (err) {
        try {
          new Notification(title, { body, tag });
        } catch {
          // ignore if notification blocked
        }
      }
    },
    []
  );

  return {
    permission,
    subscribed,
    enableNotifications,
    showLocalNotification,
  };
}

