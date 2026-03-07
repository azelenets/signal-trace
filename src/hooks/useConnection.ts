import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { TraceMessage, LinkState } from '../types';
import type { ProtocolMode } from '../lib/trace-utils';
import { decodeIncomingText, hexPreview } from '../lib/trace-utils';
import {
  buildSocketIoWsUrl,
  normalizeSocketIoNamespace,
  parseSocketIoAuth,
} from '../lib/socketio-utils';

const DEFAULT_URL = 'ws://localhost:8080';

interface UseConnectionOptions {
  appendTrace: (msg: Omit<TraceMessage, 'id'>) => void;
  appendSystem: (event: string, payload: string) => void;
  demoMode: boolean;
}

export interface UseConnectionReturn {
  connState: LinkState;
  wsUrl: string;
  setWsUrl: Dispatch<SetStateAction<string>>;
  protocolMode: ProtocolMode;
  setProtocolMode: Dispatch<SetStateAction<ProtocolMode>>;
  socketIoHandshake: boolean;
  setSocketIoHandshake: Dispatch<SetStateAction<boolean>>;
  socketIoPath: string;
  setSocketIoPath: Dispatch<SetStateAction<string>>;
  socketIoNamespace: string;
  setSocketIoNamespace: Dispatch<SetStateAction<string>>;
  socketIoAuth: string;
  setSocketIoAuth: Dispatch<SetStateAction<string>>;
  socketIoReadyRef: RefObject<boolean>;
  connect: () => void;
  disconnect: () => void;
  sendRaw: (wire: string) => void;
  trackOutgoing: (requestId: string, ts: number) => void;
  clearPending: () => void;
}

export function useConnection({
  appendTrace,
  appendSystem,
  demoMode,
}: UseConnectionOptions): UseConnectionReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingMapRef = useRef(new Map<string, number>());
  const socketIoReadyRef = useRef(false);
  const socketIoConnectSentRef = useRef(false);
  // Ref holds the latest recordIncoming so ws.onmessage never captures a stale closure
  const recordIncomingRef = useRef<(data: unknown) => Promise<void>>(async () => {});

  const [wsUrl, setWsUrl] = useState(DEFAULT_URL);
  const [connState, setConnState] = useState<LinkState>('DISCONNECTED');
  const [protocolMode, setProtocolMode] = useState<ProtocolMode>('auto');
  const [socketIoHandshake, setSocketIoHandshake] = useState(false);
  const [socketIoPath, setSocketIoPath] = useState('/socket.io');
  const [socketIoNamespace, setSocketIoNamespace] = useState('/');
  const [socketIoAuth, setSocketIoAuth] = useState('');

  const trackOutgoing = useCallback((requestId: string, ts: number) => {
    pendingMapRef.current.set(requestId, ts);
  }, []);

  const clearPending = useCallback(() => {
    pendingMapRef.current.clear();
  }, []);

  const sendRaw = useCallback((wire: string) => {
    if (!demoMode && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(wire);
    }
  }, [demoMode]);

  const disconnect = useCallback(() => {
    socketIoReadyRef.current = false;
    socketIoConnectSentRef.current = false;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnState('DISCONNECTED');
  }, []);

  // Demo mode: close any real WS and show fake CONNECTED state
  useEffect(() => {
    if (!demoMode) return;
    socketIoReadyRef.current = false;
    socketIoConnectSentRef.current = false;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnState('CONNECTED');
  }, [demoMode]);

  const recordIncoming = useCallback(async (data: unknown) => {
    const now = Date.now();

    if (typeof data === 'string') {
      const decoded = decodeIncomingText(data, protocolMode);
      let latencyMs: number | undefined;

      if (decoded.correlationId) {
        const startedAt = pendingMapRef.current.get(decoded.correlationId);
        if (startedAt !== undefined) {
          latencyMs = now - startedAt;
          pendingMapRef.current.delete(decoded.correlationId);
        }
      }

      appendTrace({
        ts: now,
        direction: 'in',
        namespace: decoded.namespace,
        event: decoded.event,
        payload: decoded.payload,
        bytes: data.length,
        latencyMs,
        protocol: decoded.protocol,
        format: decoded.format,
      });
      return;
    }

    let bytes = new Uint8Array(0);
    if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else if (data instanceof Blob) {
      bytes = new Uint8Array(await data.arrayBuffer());
    }

    appendTrace({
      ts: now,
      direction: 'in',
      namespace: '/binary',
      event: 'binary_frame',
      payload: hexPreview(bytes),
      bytes: bytes.byteLength,
      protocol: 'binary',
      format: 'binary',
    });
  }, [appendTrace, protocolMode]);

  // Keep the ref in sync so ws.onmessage always uses the latest recordIncoming
  useEffect(() => {
    recordIncomingRef.current = recordIncoming;
  }, [recordIncoming]);

  const connect = useCallback(() => {
    if (!wsUrl) return;

    const socketAuth = parseSocketIoAuth(socketIoAuth);
    if (socketIoHandshake && socketAuth.error) {
      appendSystem('socketio_auth_error', socketAuth.error);
      setConnState('ERROR');
      return;
    }

    const targetUrl = socketIoHandshake
      ? buildSocketIoWsUrl(wsUrl, socketIoPath)
      : wsUrl;

    if (!targetUrl) {
      appendSystem(
        'socketio_url_error',
        'Invalid Socket.IO endpoint/path. Use ws://, wss://, http://, or https://.',
      );
      setConnState('ERROR');
      return;
    }

    socketIoReadyRef.current = false;
    socketIoConnectSentRef.current = false;
    if (wsRef.current && wsRef.current.readyState <= 1) {
      wsRef.current.close();
    }

    setConnState('CONNECTING');
    const ws = new WebSocket(targetUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!socketIoHandshake) {
        setConnState('CONNECTED');
      }
      appendSystem('socket_open', `Connected -> ${targetUrl}`);
      if (socketIoHandshake) {
        appendTrace({
          ts: Date.now(),
          direction: 'sys',
          namespace: 'system',
          event: 'socketio_wait_namespace',
          payload: 'Waiting for Socket.IO engine open packet before namespace connect',
          bytes: 0,
          protocol: 'socket.io',
          format: 'text',
        });
      }
    };

    ws.onerror = () => {
      setConnState('ERROR');
      appendSystem('socket_error', 'WebSocket error event');
    };

    ws.onclose = () => {
      socketIoReadyRef.current = false;
      socketIoConnectSentRef.current = false;
      setConnState('DISCONNECTED');
      appendSystem('socket_close', 'Connection closed');
    };

    // Capture these at connection time — they're connection-scoped
    const namespace = normalizeSocketIoNamespace(socketIoNamespace);
    const nsWire = namespace === '/' ? '' : namespace;
    const authFragment = socketAuth.auth ? `,${JSON.stringify(socketAuth.auth)}` : '';

    ws.onmessage = (event) => {
      if (socketIoHandshake && typeof event.data === 'string') {
        const packet = event.data as string;

        if (packet === '2') {
          ws.send('3');
          appendTrace({
            ts: Date.now(),
            direction: 'sys',
            namespace: 'system',
            event: 'socketio_pong_emit',
            payload: '3',
            bytes: 1,
            protocol: 'socket.io',
            format: 'text',
          });
        }

        if (!socketIoConnectSentRef.current && packet.startsWith('0')) {
          const connectPacket = `40${nsWire}${authFragment}`;
          ws.send(connectPacket);
          socketIoConnectSentRef.current = true;
          appendTrace({
            ts: Date.now(),
            direction: 'sys',
            namespace: 'system',
            event: 'socketio_connect_emit',
            payload: connectPacket,
            bytes: connectPacket.length,
            protocol: 'socket.io',
            format: 'text',
          });
        }

        const nsConnected =
          namespace === '/'
            ? packet === '40' || packet.startsWith('40{')
            : packet === `40${namespace}` || packet.startsWith(`40${namespace},`);

        if (nsConnected && !socketIoReadyRef.current) {
          socketIoReadyRef.current = true;
          setConnState('CONNECTED');
          appendTrace({
            ts: Date.now(),
            direction: 'sys',
            namespace: 'system',
            event: 'socketio_namespace_connected',
            payload: `Namespace connected -> ${namespace}`,
            bytes: 0,
            protocol: 'socket.io',
            format: 'text',
          });
        }

        const nsError =
          namespace === '/'
            ? packet.startsWith('44')
            : packet.startsWith(`44${namespace}`);

        if (nsError) {
          setConnState('ERROR');
          appendTrace({
            ts: Date.now(),
            direction: 'sys',
            namespace: 'system',
            event: 'socketio_connect_error',
            payload: packet,
            bytes: packet.length,
            protocol: 'socket.io',
            format: 'text',
          });
        }
      }

      void recordIncomingRef.current(event.data);
    };
  }, [appendSystem, appendTrace, socketIoAuth, socketIoHandshake, socketIoNamespace, socketIoPath, wsUrl]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (wsRef.current) wsRef.current.close();
  }, []);

  return {
    connState,
    wsUrl,
    setWsUrl,
    protocolMode,
    setProtocolMode,
    socketIoHandshake,
    setSocketIoHandshake,
    socketIoPath,
    setSocketIoPath,
    socketIoNamespace,
    setSocketIoNamespace,
    socketIoAuth,
    setSocketIoAuth,
    socketIoReadyRef,
    connect,
    disconnect,
    sendRaw,
    trackOutgoing,
    clearPending,
  };
}
