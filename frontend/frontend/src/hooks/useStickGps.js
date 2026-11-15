import { useCallback, useEffect, useState, useRef } from 'react';
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

function isValidCoord(val) {
  return typeof val === 'number' && Number.isFinite(val) && val !== 0;
}

export default function useStickGps(options = {}) {
  const onButtonPress = typeof options === 'function' ? options : options?.onButtonPress;
  const [deviceUrl, setDeviceUrl] = useState(getInitialDeviceUrl);
  const [location, setLocation] = useState(null);
  const [connection, setConnection] = useState('connecting');
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);
  const lastButtonPressRef = useRef({});

  // Browser / Local Device GPS tracking (holds continuous high-accuracy fallback)
  const localGpsRef = useRef(null);
  const hasStickGpsFixRef = useRef(false);

  // Watch browser/phone geolocation continuously in background
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator?.geolocation) return undefined;

    const onGeoSuccess = (pos) => {
      const lat = pos?.coords?.latitude;
      const lng = pos?.coords?.longitude;
      const acc = pos?.coords?.accuracy;
      if (isValidCoord(lat) && isValidCoord(lng)) {
        localGpsRef.current = {
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          timestamp: Date.now(),
        };

        // If stick does not have an active GPS fix, immediately update location with local GPS
        if (!hasStickGpsFixRef.current) {
          setLocation((prev) => ({
            fix: true,
            latitude: lat,
            longitude: lng,
            accuracy: acc,
            satellites: 0,
            distance_cm: prev?.distance_cm ?? null,
            source: 'Local Device GPS',
            isLocalFallback: true,
          }));
          setLastUpdate(new Date());
        }
      }
    };

    const onGeoError = () => {
      // Local GPS error or permission denied: silently ignore
    };

    let watchId;
    try {
      navigator.geolocation.getCurrentPosition(onGeoSuccess, onGeoError, {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 10000,
      });

      watchId = navigator.geolocation.watchPosition(onGeoSuccess, onGeoError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      });
    } catch {
      // ignore
    }

    return () => {
      if (watchId != null && navigator?.geolocation?.clearWatch) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    let pollTimer;
    let requestTimer;
    let controller;

    // Helper to resolve composite location: Stick GPS prioritized, Local GPS fallback
    const resolveCompositeLocation = (statusObj) => {
      const stickHasFix =
        Boolean(statusObj?.gps_fix) &&
        isValidCoord(Number(statusObj?.latitude)) &&
        isValidCoord(Number(statusObj?.longitude));

      hasStickGpsFixRef.current = stickHasFix;

      if (stickHasFix) {
        return {
          fix: true,
          latitude: Number(statusObj.latitude),
          longitude: Number(statusObj.longitude),
          satellites: Number(statusObj.satellites || 0),
          distance_cm: statusObj.distance_cm != null ? Number(statusObj.distance_cm) : null,
          source: 'Smart Stick GPS',
          isLocalFallback: false,
        };
      }

      // Stick has NO fix -> Seamless fallback to Local Device GPS
      const local = localGpsRef.current;
      if (local && isValidCoord(local.latitude) && isValidCoord(local.longitude)) {
        return {
          fix: true,
          latitude: local.latitude,
          longitude: local.longitude,
          satellites: 0,
          accuracy: local.accuracy,
          distance_cm: statusObj?.distance_cm != null ? Number(statusObj.distance_cm) : null,
          source: 'Local Device GPS',
          isLocalFallback: true,
        };
      }

      // No stick fix and no local GPS yet
      return {
        fix: false,
        latitude: null,
        longitude: null,
        satellites: 0,
        distance_cm: statusObj?.distance_cm != null ? Number(statusObj.distance_cm) : null,
        source: 'Awaiting Fix',
        isLocalFallback: false,
      };
    };

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

          const loc = resolveCompositeLocation(statusObj);
          setLocation(loc);
          setConnection('connected');
          setError('');
          setLastUpdate(new Date());

          const now = Date.now();
          if (statusObj.bus_button && onButtonPress) {
            if (now - (lastButtonPressRef.current.bus || 0) > 1200) {
              lastButtonPressRef.current.bus = now;
              fetch(`${cleanBase}/button`, { cache: 'no-store' }).catch(() => {});
              onButtonPress('bus_assistant', { source: 'esp8266_client_direct', eventId: `stick-bus-${now}` });
            }
          } else if (statusObj.ai_button && onButtonPress) {
            if (now - (lastButtonPressRef.current.ai || 0) > 1200) {
              lastButtonPressRef.current.ai = now;
              fetch(`${cleanBase}/ai-button`, { cache: 'no-store' }).catch(() => {});
              onButtonPress('single_press', { source: 'esp8266_client_direct', eventId: `stick-ai-${now}` });
            }
          } else if (statusObj.sos_button && onButtonPress) {
            if (now - (lastButtonPressRef.current.sos || 0) > 1200) {
              lastButtonPressRef.current.sos = now;
              fetch(`${cleanBase}/sos-button`, { cache: 'no-store' }).catch(() => {});
              onButtonPress('long_press', { source: 'esp8266_client_direct', eventId: `stick-sos-${now}` });
            }
          }
        } else {
          // Fallback legacy /gps
          const nextLocation = await gpsService.getStickLocation(deviceUrl, controller.signal);
          if (!active) return;

          connectedNow = true;
          const loc = resolveCompositeLocation({
            gps_fix: nextLocation?.fix,
            latitude: nextLocation?.latitude,
            longitude: nextLocation?.longitude,
            satellites: nextLocation?.satellites,
            distance_cm: nextLocation?.distance_cm,
          });
          setLocation(loc);
          setConnection('connected');
          setError('');
          setLastUpdate(new Date());
        }
      } catch (pollError) {
        if (!active) return;

        hasStickGpsFixRef.current = false;
        // Even if stick is disconnected/unreachable, retain local device GPS so user can navigate!
        const local = localGpsRef.current;
        if (local && isValidCoord(local.latitude) && isValidCoord(local.longitude)) {
          setLocation({
            fix: true,
            latitude: local.latitude,
            longitude: local.longitude,
            satellites: 0,
            accuracy: local.accuracy,
            distance_cm: null,
            source: 'Local Device GPS',
            isLocalFallback: true,
          });
        } else {
          setLocation(null);
        }

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
    return normalizedUrl;
  }, []);

  return { deviceUrl, location, connection, error, lastUpdate, saveDeviceUrl };
}
