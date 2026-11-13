import { useCallback, useEffect, useState } from 'react';
import { gpsService } from '../services/api';

const DEVICE_URL_KEY = 'smart-blind-stick-url';
const DEFAULT_DEVICE_URL = import.meta.env.VITE_ESP8266_URL || 'http://10.206.152.89';
const PREVIOUS_DEFAULT_DEVICE_URLS = ['http://10.192.24.89', 'http://10.235.17.89'];

function getInitialDeviceUrl() {
  const savedDeviceUrl = window.localStorage.getItem(DEVICE_URL_KEY);
  return !savedDeviceUrl || PREVIOUS_DEFAULT_DEVICE_URLS.includes(savedDeviceUrl)
    ? DEFAULT_DEVICE_URL
    : savedDeviceUrl;
}

function normalizeDeviceUrl(value) {
  const trimmedValue = value.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmedValue)
    ? trimmedValue
    : `http://${trimmedValue}`);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Enter an HTTP or HTTPS smart stick address.');
  }

  return url.toString().replace(/\/+$/, '');
}

export default function useStickGps(options = {}) {
  const onButtonPress = typeof options === 'function' ? options : options?.onButtonPress;
  const [deviceUrl, setDeviceUrl] = useState(getInitialDeviceUrl);
  const [location, setLocation] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    let active = true;
    let pollTimer;
    let requestTimer;
    let controller;

    const poll = async () => {
      controller = new AbortController();
      requestTimer = window.setTimeout(() => controller.abort(), 2500);
      let connectedNow = false;

      try {
        const cleanBase = deviceUrl.replace(/\/+$/, '');
        let statusObj = null;

        // Try /status first to read GPS, Ultrasonic, and all 3 buttons simultaneously
        try {
          const resp = await fetch(`${cleanBase}/status`, {
            cache: 'no-store',
            signal: controller.signal,
          });
          if (resp.ok) {
            statusObj = await resp.json();
          }
        } catch {
          // Fall through to /gps below
        }

        if (statusObj && typeof statusObj === 'object') {
          if (!active) return;
          connectedNow = true;
          const loc = {
            fix: Boolean(statusObj.gps_fix),
            latitude: statusObj.latitude != null ? Number(statusObj.latitude) : null,
            longitude: statusObj.longitude != null ? Number(statusObj.longitude) : null,
            satellites: Number(statusObj.satellites || 0),
            distance_cm: statusObj.distance_cm != null ? Number(statusObj.distance_cm) : null,
          };
          setLocation(loc);
          setConnection('connected');
          setError('');
          setLastUpdate(new Date());

          if (statusObj.bus_button && onButtonPress) {
            fetch(`${cleanBase}/button`, { cache: 'no-store' }).catch(() => {});
            onButtonPress('bus_assistant', { source: 'esp8266_client_direct' });
          } else if (statusObj.ai_button && onButtonPress) {
            fetch(`${cleanBase}/ai-button`, { cache: 'no-store' }).catch(() => {});
            onButtonPress('single_press', { source: 'esp8266_client_direct' });
          } else if (statusObj.sos_button && onButtonPress) {
            fetch(`${cleanBase}/sos-button`, { cache: 'no-store' }).catch(() => {});
            onButtonPress('long_press', { source: 'esp8266_client_direct' });
          }
        } else {
          const nextLocation = await gpsService.getStickLocation(deviceUrl, controller.signal);
          if (!active) return;

          connectedNow = true;
          setLocation(nextLocation);
          setConnection('connected');
          setError('');
          setLastUpdate(new Date());
        }
      } catch (pollError) {
        if (!active) return;

        setLocation(null);
        setConnection('disconnected');
        setError(
          pollError.name === 'AbortError'
            ? 'GPS request timed out. Check that the stick is on the same Wi-Fi network.'
            : pollError.message || 'Could not read GPS data from the smart stick.',
        );
      } finally {
        window.clearTimeout(requestTimer);
        if (active) {
          pollTimer = window.setTimeout(poll, connectedNow ? (onButtonPress ? 800 : 2500) : 10000);
        }
      }
    };

    setConnection('connecting');
    setError('');
    poll();

    return () => {
      active = false;
      window.clearTimeout(pollTimer);
      window.clearTimeout(requestTimer);
      controller?.abort();
    };
  }, [deviceUrl, onButtonPress]);

  const saveDeviceUrl = useCallback((value) => {
    const normalizedUrl = normalizeDeviceUrl(value);
    window.localStorage.setItem(DEVICE_URL_KEY, normalizedUrl);
    setDeviceUrl(normalizedUrl);
    setLocation(null);
    return normalizedUrl;
  }, []);

  return { deviceUrl, location, connection, error, lastUpdate, saveDeviceUrl };
}
