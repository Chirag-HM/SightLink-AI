import { useCallback, useEffect, useState } from 'react';
import { gpsService } from '../services/api';

const DEVICE_URL_KEY = 'smart-blind-stick-url';
const DEFAULT_DEVICE_URL = import.meta.env.VITE_ESP8266_URL || 'http://10.235.17.89';
const PREVIOUS_DEFAULT_DEVICE_URL = 'http://10.192.24.89';

function getInitialDeviceUrl() {
  const savedDeviceUrl = window.localStorage.getItem(DEVICE_URL_KEY);
  return !savedDeviceUrl || savedDeviceUrl === PREVIOUS_DEFAULT_DEVICE_URL
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

export default function useStickGps() {
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
      requestTimer = window.setTimeout(() => controller.abort(), 5000);

      try {
        const nextLocation = await gpsService.getStickLocation(deviceUrl, controller.signal);
        if (!active) return;

        setLocation(nextLocation);
        setConnection('connected');
        setError('');
        setLastUpdate(new Date());
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
          pollTimer = window.setTimeout(poll, 2000);
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
  }, [deviceUrl]);

  const saveDeviceUrl = useCallback((value) => {
    const normalizedUrl = normalizeDeviceUrl(value);
    window.localStorage.setItem(DEVICE_URL_KEY, normalizedUrl);
    setDeviceUrl(normalizedUrl);
    setLocation(null);
    return normalizedUrl;
  }, []);

  return { deviceUrl, location, connection, error, lastUpdate, saveDeviceUrl };
}
