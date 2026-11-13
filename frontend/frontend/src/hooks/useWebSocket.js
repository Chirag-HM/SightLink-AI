import { useEffect, useRef, useState, useCallback } from 'react';
import { getWsBase } from '../services/api';

export default function useWebSocket(path, { enabled = true, onMessage } = {}) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!enabled || !path) {
      setConnected(false);
      return undefined;
    }

    let cancelled = false;
    let reconnectTimer = null;
    let pingTimer = null;

    const connect = () => {
      if (cancelled) return;
      const url = `${getWsBase()}${path}`;
      let ws;
      try {
        ws = new WebSocket(url);
      } catch {
        reconnectTimer = setTimeout(connect, 3500);
        return;
      }

      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        if (event.data === 'pong') return;
        try {
          const parsed = JSON.parse(event.data);
          onMessageRef.current?.(parsed);
        } catch {
          onMessageRef.current?.({ raw: event.data });
        }
      };

      ws.onerror = () => {
        // Reconnect handles recovery
      };

      ws.onclose = () => {
        setConnected(false);
        clearInterval(pingTimer);
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
    };
  }, [path, enabled]);

  const sendJson = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  return { connected, sendJson };
}

