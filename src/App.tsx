import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  decodeIncomingText,
  extractCorrelationId,
  hexPreview,
  safeJson,
  validateAgainstSchema,
  type PayloadFormat,
  type ProtocolMode,
  type SimpleSchema,
} from './lib/trace-utils';
import {
  buildSocketIoWsUrl,
  normalizeSocketIoNamespace,
  parseSocketIoAuth,
} from './lib/socketio-utils';

type Direction = 'in' | 'out' | 'sys';
type LinkState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

interface TraceMessage {
  id: string;
  ts: number;
  direction: Direction;
  namespace: string;
  event: string;
  payload: string;
  bytes: number;
  latencyMs?: number;
  protocol: 'raw' | 'socket.io' | 'binary';
  format: PayloadFormat;
}

const MAX_MESSAGES = 700;
const DEFAULT_URL = 'ws://localhost:8080';

const NS_POOL = ['/telemetry', '/device', '/alerts', '/firmware', '/shadow'];

const fmtTime = (ts: number) =>
  new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(new Date(ts));

const randomFrom = <T,>(input: readonly T[]): T => input[Math.floor(Math.random() * input.length)];

const textEncoder = new TextEncoder();

type SchemaValueType = 'string' | 'number' | 'boolean' | 'object' | 'array';
type SchemaPropertyDraft = { id: string; field: string; type: SchemaValueType; required: boolean };


const generateMessageId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `trace-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const prettyPayload = (payload: string): string => {
  const parsed = safeJson(payload);
  return parsed ? JSON.stringify(parsed, null, 2) : payload;
};

const App = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingMapRef = useRef(new Map<string, number>());
  const seqRef = useRef(0);
  const demoTimerRef = useRef<number | null>(null);
  const replayTimerRef = useRef<number | null>(null);
  const replayCancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const socketIoReadyRef = useRef(false);
  const socketIoConnectSentRef = useRef(false);

  const [wsUrl, setWsUrl] = useState(DEFAULT_URL);
  const [connState, setConnState] = useState<LinkState>('DISCONNECTED');
  const [messages, setMessages] = useState<TraceMessage[]>([]);
  const [activeNamespaces, setActiveNamespaces] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [outNamespace, setOutNamespace] = useState('/telemetry');
  const [outPayload, setOutPayload] = useState('{"requestId":"req-1001","action":"ping"}');
  const [demoMode, setDemoMode] = useState(false);
  const [protocolMode, setProtocolMode] = useState<ProtocolMode>('auto');
  const [socketIoHandshake, setSocketIoHandshake] = useState(false);
  const [socketIoPath, setSocketIoPath] = useState('/socket.io');
  const [socketIoNamespace, setSocketIoNamespace] = useState('/');
  const [socketIoAuth, setSocketIoAuth] = useState('');
  const [socketIoEvent, setSocketIoEvent] = useState('trace');
  const [autoRefreshEnvelope, setAutoRefreshEnvelope] = useState(true);
  const [schemaProperties, setSchemaProperties] = useState<SchemaPropertyDraft[]>([
    { id: 'schema-0', field: 'requestId', type: 'string', required: true },
    { id: 'schema-1', field: 'action', type: 'string', required: true },
    { id: 'schema-2', field: 'namespace', type: 'string', required: false },
    { id: 'schema-3', field: 'value', type: 'number', required: false },
  ]);
  const [replaySpeed, setReplaySpeed] = useState(4);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [schemaModalOpen, setSchemaModalOpen] = useState(false);
  const schemaRowSeqRef = useRef(4);

  const appendTrace = useCallback((msg: Omit<TraceMessage, 'id'>) => {
    setMessages(prev => {
      const next: TraceMessage = {
        ...msg,
        id: `${msg.ts}-${seqRef.current++}`,
      };
      const merged = [...prev, next];
      if (merged.length <= MAX_MESSAGES) {
        return merged;
      }
      return merged.slice(merged.length - MAX_MESSAGES);
    });
  }, []);

  const stopReplay = useCallback(() => {
    replayCancelRef.current = true;
    if (replayTimerRef.current) {
      window.clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    stopReplay();
    socketIoReadyRef.current = false;
    socketIoConnectSentRef.current = false;
    if (demoTimerRef.current) {
      window.clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnState('DISCONNECTED');
  }, [stopReplay]);

  const recordIncoming = useCallback(async (data: unknown) => {
    const now = Date.now();

    if (typeof data === 'string') {
      const decoded = decodeIncomingText(data, protocolMode);
      let latencyMs: number | undefined;

      if (decoded.correlationId) {
        const startedAt = pendingMapRef.current.get(decoded.correlationId);
        if (startedAt) {
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

  const connect = useCallback(() => {
    if (!wsUrl) return;
    const socketAuth = parseSocketIoAuth(socketIoAuth);
    if (socketIoHandshake && socketAuth.error) {
      appendTrace({
        ts: Date.now(),
        direction: 'sys',
        namespace: 'system',
        event: 'socketio_auth_error',
        payload: socketAuth.error,
        bytes: socketAuth.error.length,
        protocol: 'raw',
        format: 'text',
      });
      setConnState('ERROR');
      return;
    }

    const targetUrl = socketIoHandshake ? buildSocketIoWsUrl(wsUrl, socketIoPath) : wsUrl;
    if (!targetUrl) {
      const message = 'Invalid Socket.IO endpoint/path. Use ws://, wss://, http://, or https://.';
      appendTrace({
        ts: Date.now(),
        direction: 'sys',
        namespace: 'system',
        event: 'socketio_url_error',
        payload: message,
        bytes: message.length,
        protocol: 'raw',
        format: 'text',
      });
      setConnState('ERROR');
      return;
    }

    stopReplay();
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
      appendTrace({
        ts: Date.now(),
        direction: 'sys',
        namespace: 'system',
        event: 'socket_open',
        payload: `Connected -> ${targetUrl}`,
        bytes: 0,
        protocol: 'raw',
        format: 'text',
      });
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
      appendTrace({
        ts: Date.now(),
        direction: 'sys',
        namespace: 'system',
        event: 'socket_error',
        payload: 'WebSocket error event',
        bytes: 0,
        protocol: 'raw',
        format: 'text',
      });
    };

    ws.onclose = () => {
      socketIoReadyRef.current = false;
      socketIoConnectSentRef.current = false;
      setConnState('DISCONNECTED');
      appendTrace({
        ts: Date.now(),
        direction: 'sys',
        namespace: 'system',
        event: 'socket_close',
        payload: 'Connection closed',
        bytes: 0,
        protocol: 'raw',
        format: 'text',
      });
    };

    ws.onmessage = (event) => {
      if (socketIoHandshake && typeof event.data === 'string') {
        const packet = event.data;
        const namespace = normalizeSocketIoNamespace(socketIoNamespace);
        const nsWire = namespace === '/' ? '' : namespace;

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
          const authWire = socketAuth.auth ? `,${JSON.stringify(socketAuth.auth)}` : '';
          const connectPacket = `40${nsWire}${authWire}`;
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

        const namespaceConnected = namespace === '/'
          ? packet === '40' || packet.startsWith('40{')
          : packet === `40${namespace}` || packet.startsWith(`40${namespace},`);
        if (namespaceConnected && !socketIoReadyRef.current) {
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

        const namespaceError = namespace === '/' ? packet.startsWith('44') : packet.startsWith(`44${namespace}`);
        if (namespaceError) {
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
      void recordIncoming(event.data);
    };
  }, [appendTrace, recordIncoming, socketIoAuth, socketIoHandshake, socketIoNamespace, socketIoPath, stopReplay, wsUrl]);

  useEffect(() => {
    if (!demoMode) {
      if (demoTimerRef.current) {
        window.clearInterval(demoTimerRef.current);
        demoTimerRef.current = null;
      }
      return;
    }

    disconnect();
    setConnState('CONNECTED');
    appendTrace({
      ts: Date.now(),
      direction: 'sys',
      namespace: 'system',
      event: 'demo_mode',
      payload: 'Synthetic traffic enabled',
      bytes: 0,
      protocol: 'raw',
      format: 'text',
    });

    demoTimerRef.current = window.setInterval(() => {
      const namespace = randomFrom(NS_POOL);
      const event = randomFrom(['state', 'delta', 'heartbeat', 'fault', 'ack']);
      const requestId = `req-${Math.floor(Math.random() * 4000)}`;
      const latency = 5 + Math.floor(Math.random() * 120);
      const payloadObj = {
        namespace,
        event,
        requestId,
        value: Number((Math.random() * 100).toFixed(2)),
        unit: 'ms',
      };
      const payload = JSON.stringify(payloadObj);

      appendTrace({
        ts: Date.now(),
        direction: 'in',
        namespace,
        event,
        payload,
        bytes: payload.length,
        latencyMs: latency,
        protocol: 'raw',
        format: 'json',
      });
    }, 650);

    return () => {
      if (demoTimerRef.current) {
        window.clearInterval(demoTimerRef.current);
        demoTimerRef.current = null;
      }
    };
  }, [appendTrace, demoMode, disconnect]);

  useEffect(() => () => {
    stopReplay();
    if (demoTimerRef.current) {
      window.clearInterval(demoTimerRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
  }, [stopReplay]);

  const allNamespaces = useMemo(() => {
    const uniq = new Set<string>();
    for (const m of messages) uniq.add(m.namespace);
    return [...uniq].sort((a, b) => a.localeCompare(b));
  }, [messages]);

  useEffect(() => {
    if (activeNamespaces.size === 0 && allNamespaces.length > 0) {
      setActiveNamespaces(new Set(allNamespaces));
    }
  }, [activeNamespaces.size, allNamespaces]);

  const toggleNamespace = useCallback((ns: string) => {
    setActiveNamespaces(prev => {
      const next = new Set(prev);
      if (next.has(ns)) {
        next.delete(ns);
      } else {
        next.add(ns);
      }
      return next;
    });
  }, []);

  const parsedSchema = useMemo(() => {
    const required: string[] = [];

    const properties: Record<string, SchemaValueType> = {};
    for (const draft of schemaProperties) {
      const field = draft.field.trim();
      if (!field) continue;
      properties[field] = draft.type;
      if (draft.required) {
        required.push(field);
      }
    }

    if (required.length === 0 && Object.keys(properties).length === 0) {
      return { schema: null, parseError: '' };
    }

    return {
      schema: {
        required: required.length > 0 ? required : undefined,
        properties: Object.keys(properties).length > 0 ? properties : undefined,
      } as SimpleSchema,
      parseError: '',
    };
  }, [schemaProperties]);

  const addSchemaProperty = useCallback(() => {
    const nextId = `schema-${schemaRowSeqRef.current++}`;
    setSchemaProperties(prev => [...prev, { id: nextId, field: '', type: 'string', required: false }]);
  }, []);

  const removeSchemaProperty = useCallback((id: string) => {
    setSchemaProperties(prev => prev.filter(item => item.id !== id));
  }, []);

  const updateSchemaPropertyField = useCallback((id: string, field: string) => {
    setSchemaProperties(prev => prev.map(item => item.id === id ? { ...item, field } : item));
  }, []);

  const updateSchemaPropertyType = useCallback((id: string, type: SchemaValueType) => {
    setSchemaProperties(prev => prev.map(item => item.id === id ? { ...item, type } : item));
  }, []);

  const updateSchemaPropertyRequired = useCallback((id: string, required: boolean) => {
    setSchemaProperties(prev => prev.map(item => item.id === id ? { ...item, required } : item));
  }, []);

  useEffect(() => {
    if (!schemaModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSchemaModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [schemaModalOpen]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return messages.filter(msg => {
      const nsOk = activeNamespaces.size === 0 || activeNamespaces.has(msg.namespace);
      if (!nsOk) return false;
      if (!query) return true;
      return (
        msg.event.toLowerCase().includes(query) ||
        msg.namespace.toLowerCase().includes(query) ||
        msg.payload.toLowerCase().includes(query)
      );
    });
  }, [activeNamespaces, messages, search]);

  const metrics = useMemo(() => {
    const inCount = filtered.filter(m => m.direction === 'in').length;
    const outCount = filtered.filter(m => m.direction === 'out').length;
    const latencies = filtered.map(m => m.latencyMs).filter((v): v is number => typeof v === 'number');
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const peakLatency = latencies.length > 0 ? Math.max(...latencies) : 0;
    return { inCount, outCount, avgLatency, peakLatency, total: filtered.length };
  }, [filtered]);

  const appendSystem = useCallback((event: string, payload: string) => {
    appendTrace({
      ts: Date.now(),
      direction: 'sys',
      namespace: 'system',
      event,
      payload,
      bytes: payload.length,
      protocol: 'raw',
      format: 'text',
    });
  }, [appendTrace]);

  const sendMessage = useCallback(() => {
    if (!outPayload.trim()) return;
    if (socketIoHandshake && protocolMode === 'socketio' && !socketIoReadyRef.current) {
      appendSystem('socketio_not_ready', 'Socket.IO namespace is not connected yet');
      return;
    }
    const now = Date.now();
    const parsedPayload = safeJson(outPayload);
    const enrichedPayload = autoRefreshEnvelope && parsedPayload
      ? {
        ...parsedPayload,
        ...(Object.hasOwn(parsedPayload, 'id') ? { id: generateMessageId() } : {}),
        ...(Object.hasOwn(parsedPayload, 'timestamp') ? { timestamp: now } : {}),
      }
      : parsedPayload;

    if (parsedSchema.parseError) {
      appendSystem('schema_error', parsedSchema.parseError);
      return;
    }

    if (enrichedPayload && parsedSchema.schema) {
      const schemaErrors = validateAgainstSchema(parsedSchema.schema, enrichedPayload);
      if (schemaErrors.length > 0) {
        appendSystem('schema_violation', schemaErrors.join(' | '));
        return;
      }
    }

    let wire = enrichedPayload ? JSON.stringify(enrichedPayload) : outPayload;
    let requestId = extractCorrelationId(enrichedPayload);

    if (!requestId) {
      requestId = `trace-${now}`;
      const nextPayload = enrichedPayload ? { ...enrichedPayload, requestId, namespace: outNamespace } : { requestId, namespace: outNamespace, raw: outPayload };
      wire = JSON.stringify(nextPayload);
    }

    pendingMapRef.current.set(requestId, now);

    let eventType = 'send';
    let protocol: 'raw' | 'socket.io' = 'raw';

    if (protocolMode === 'socketio') {
      eventType = 'socket_emit';
      protocol = 'socket.io';
      const packetNs = socketIoHandshake ? normalizeSocketIoNamespace(socketIoNamespace) : outNamespace;
      const eventName = socketIoEvent.trim() || 'trace';
      const socketFrame = `42${packetNs},[${JSON.stringify(eventName)},${wire}]`;
      wire = socketFrame;
    }

    appendTrace({
      ts: now,
      direction: 'out',
      namespace: outNamespace,
      event: eventType,
      payload: wire,
      bytes: textEncoder.encode(wire).length,
      protocol,
      format: enrichedPayload ? 'json' : 'text',
    });

    if (!demoMode && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(wire);
    }
  }, [appendSystem, appendTrace, autoRefreshEnvelope, demoMode, outNamespace, outPayload, parsedSchema.parseError, parsedSchema.schema, protocolMode, socketIoEvent, socketIoHandshake, socketIoNamespace]);

  const clearTimeline = useCallback(() => {
    stopReplay();
    setMessages([]);
    setExpandedId(null);
    pendingMapRef.current.clear();
  }, [stopReplay]);

  const download = useCallback((name: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportJson = useCallback(() => {
    download('signal-trace-timeline.json', JSON.stringify(messages, null, 2), 'application/json');
    appendSystem('timeline_export', `Exported ${messages.length} entries to JSON`);
  }, [appendSystem, download, messages]);

  const exportNdjson = useCallback(() => {
    const lines = messages.map(m => JSON.stringify(m)).join('\n');
    download('signal-trace-timeline.ndjson', lines, 'application/x-ndjson');
    appendSystem('timeline_export', `Exported ${messages.length} entries to NDJSON`);
  }, [appendSystem, download, messages]);

  const normalizeImportedMessages = useCallback((input: unknown[]): TraceMessage[] => {
    const normalized: TraceMessage[] = [];
    for (const item of input) {
      if (typeof item !== 'object' || item === null) continue;
      const candidate = item as Partial<TraceMessage>;
      if (typeof candidate.ts !== 'number' || typeof candidate.namespace !== 'string' || typeof candidate.event !== 'string' || typeof candidate.payload !== 'string' || typeof candidate.bytes !== 'number') {
        continue;
      }
      normalized.push({
        id: `${candidate.ts}-${seqRef.current++}`,
        ts: candidate.ts,
        direction: candidate.direction === 'in' || candidate.direction === 'out' || candidate.direction === 'sys' ? candidate.direction : 'sys',
        namespace: candidate.namespace,
        event: candidate.event,
        payload: candidate.payload,
        bytes: candidate.bytes,
        latencyMs: typeof candidate.latencyMs === 'number' ? candidate.latencyMs : undefined,
        protocol: candidate.protocol === 'socket.io' || candidate.protocol === 'binary' ? candidate.protocol : 'raw',
        format: candidate.format === 'json' || candidate.format === 'binary' ? candidate.format : 'text',
      });
    }
    return normalized;
  }, []);

  const onImportTimeline = useCallback(async (file: File) => {
    const text = await file.text();
    const trimmed = text.trim();

    let importedRaw: unknown[] = [];
    if (trimmed.startsWith('[')) {
      const parsed = JSON.parse(trimmed) as unknown;
      importedRaw = Array.isArray(parsed) ? parsed : [];
    } else {
      importedRaw = trimmed
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => JSON.parse(line) as unknown);
    }

    const imported = normalizeImportedMessages(importedRaw);
    if (imported.length === 0) {
      appendSystem('timeline_import', 'No valid entries found in import file');
      return;
    }

    stopReplay();
    setMessages(imported);
    setExpandedId(null);
    setActiveNamespaces(new Set(imported.map(m => m.namespace)));
    appendSystem('timeline_import', `Imported ${imported.length} entries`);
  }, [appendSystem, normalizeImportedMessages, stopReplay]);

  const replayTimeline = useCallback(() => {
    if (messages.length < 2) {
      appendSystem('timeline_replay', 'Need at least 2 entries to replay');
      return;
    }

    stopReplay();
    replayCancelRef.current = false;

    const source = [...messages].sort((a, b) => a.ts - b.ts);
    const copy = source.map(m => ({ ...m, id: `${Date.now()}-${seqRef.current++}` }));
    setMessages([copy[0]]);

    let index = 1;
    const tick = () => {
      if (replayCancelRef.current || index >= copy.length) {
        appendSystem('timeline_replay', 'Replay completed');
        return;
      }

      const prev = source[index - 1];
      const next = source[index];
      const rawDelta = Math.max(20, next.ts - prev.ts);
      const delay = Math.max(20, Math.floor(rawDelta / Math.max(1, replaySpeed)));

      replayTimerRef.current = window.setTimeout(() => {
        setMessages(current => [...current, copy[index]]);
        index += 1;
        tick();
      }, delay);
    };

    appendSystem('timeline_replay', `Replay started at ${replaySpeed}x speed`);
    tick();
  }, [appendSystem, messages, replaySpeed, stopReplay]);

  const formatOutgoingJson = useCallback(() => {
    const parsed = safeJson(outPayload);
    if (!parsed) {
      appendSystem('format_error', 'Outgoing payload is not valid JSON');
      return;
    }
    setOutPayload(JSON.stringify(parsed, null, 2));
  }, [appendSystem, outPayload]);

  const copyPayload = useCallback(async (id: string, payload: string) => {
    await navigator.clipboard.writeText(payload);
    setCopiedId(id);
    setTimeout(() => setCopiedId(c => (c === id ? null : c)), 1500);
  }, []);

  const toggleRow = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  return (
    <div className="app-root">
      <div className="bg-grid" />
      <main className="shell">
        <header className="hud panel">
          <p className="eyebrow">R&D // EXPERIMENTAL LAB</p>
          <h1>
            SIGNAL<span>TRACE</span>
          </h1>
          <p className="lead">Browser-based WebSocket traffic inspector for real-time IoT debugging.</p>
        </header>

        <section className="layout">
          <aside className="hud panel controls">

            <details open>
              <summary>
                Connection
                <span className="summary-status">
                  <span className={`dot ${connState.toLowerCase()}`} />
                  <span className="summary-state">{connState}</span>
                </span>
              </summary>
              <div className="section-body">
                <label>
                  Endpoint
                  <input value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} placeholder="ws://localhost:8080" disabled={demoMode} />
                </label>
                <label>
                  Protocol Decode
                  <select value={protocolMode} onChange={(e) => setProtocolMode(e.target.value as ProtocolMode)}>
                    <option value="auto">AUTO</option>
                    <option value="raw">RAW</option>
                    <option value="socketio">SOCKET.IO</option>
                  </select>
                </label>
                <label className="checkbox-label">
                  Socket.IO Handshake
                  <input
                    type="checkbox"
                    checked={socketIoHandshake}
                    onChange={(e) => setSocketIoHandshake(e.target.checked)}
                    disabled={demoMode}
                  />
                </label>
                {socketIoHandshake ? (
                  <>
                    <label>
                      Socket.IO Path
                      <input
                        value={socketIoPath}
                        onChange={(e) => setSocketIoPath(e.target.value)}
                        placeholder="/socket.io"
                        disabled={demoMode}
                      />
                    </label>
                    <label>
                      Socket.IO Namespace
                      <input
                        value={socketIoNamespace}
                        onChange={(e) => setSocketIoNamespace(e.target.value)}
                        placeholder="/devices"
                        disabled={demoMode}
                      />
                    </label>
                    <label>
                      Socket.IO Auth JSON
                      <textarea
                        rows={4}
                        value={socketIoAuth}
                        onChange={(e) => setSocketIoAuth(e.target.value)}
                        placeholder='{"serial":"dev-1","token":"secret"}'
                        disabled={demoMode}
                      />
                    </label>
                  </>
                ) : null}

                <div className="row">
                  <button
                    className={connState === 'DISCONNECTED' || connState === 'ERROR' ? 'btn-primary' : ''}
                    onClick={connect}
                    disabled={demoMode || connState === 'CONNECTING' || connState === 'CONNECTED'}
                  >
                    Connect
                  </button>
                  <button onClick={disconnect} disabled={connState === 'DISCONNECTED' && !demoMode}>Disconnect</button>
                  <button
                    className={demoMode ? 'btn-active' : ''}
                    onClick={() => setDemoMode(v => !v)}
                  >
                    {demoMode ? 'Live Mode' : 'Demo'}
                  </button>
                </div>


              </div>
            </details>

            <details open>
              <summary>Namespace Filter</summary>
              <div className="section-body">
                <div className="ns-list">
                  {allNamespaces.length === 0 ? (
                    <p className="muted">No namespaces captured yet.</p>
                  ) : (
                    allNamespaces.map(ns => (
                      <button
                        key={ns}
                        className={`ns-btn${activeNamespaces.has(ns) ? ' ns-btn--active' : ''}`}
                        onClick={() => toggleNamespace(ns)}
                      >
                        {ns || '(root)'}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </details>

            <details>
              <summary>Schema Guard</summary>
              <div className="section-body">
                <div className="row">
                  <button onClick={() => setSchemaModalOpen(true)}>Open Schema Builder</button>
                </div>
                <p className="muted">Leave both required fields and properties empty to disable validation.</p>
              </div>
            </details>

            <details open>
              <summary>Transmit</summary>
              <div className="section-body">
                <label>
                  Namespace
                  <input value={outNamespace} onChange={(e) => setOutNamespace(e.target.value)} />
                </label>
            {protocolMode === 'socketio' ? (
              <label>
                Socket.IO Event
                <input value={socketIoEvent} onChange={(e) => setSocketIoEvent(e.target.value)} placeholder="trace" />
              </label>
            ) : null}
            <button
              className={autoRefreshEnvelope ? 'btn-active' : ''}
              onClick={() => setAutoRefreshEnvelope(v => !v)}
            >
              Auto-refresh id/timestamp
            </button>
            <label>
              JSON Payload
              <textarea rows={5} value={outPayload} onChange={(e) => setOutPayload(e.target.value)} />
            </label>

                <div className="row">
                  <button onClick={formatOutgoingJson}>Format JSON</button>
                  <button className="btn-primary" onClick={sendMessage}>Send Frame</button>
                </div>
              </div>
            </details>

          </aside>

          <section className="hud panel timeline">
            <div className="timeline-head">
              <h2>Message Timeline</h2>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search event, namespace, payload"
              />
            </div>

            <div className="replay-control">
              <label>
                Replay Speed (x)
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={replaySpeed}
                  onChange={(e) => setReplaySpeed(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json,.ndjson,application/x-ndjson"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void onImportTimeline(file);
                  e.currentTarget.value = '';
                }}
              />
            </div>

            <div className="rows">
              {filtered.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-title">No traffic</p>
                  <p className="empty-sub">Connect to a WebSocket endpoint or enable Demo Mode to see messages.</p>
                </div>
              ) : (
                [...filtered].reverse().map((msg, idx) => {
                  const prev = filtered.at(filtered.length - idx);
                  const delta = prev ? msg.ts - prev.ts : 0;
                  const isExpanded = expandedId === msg.id;
                  const payloadPreview = msg.payload.length > 190 ? `${msg.payload.slice(0, 190)}...` : msg.payload;
                  return (
                    <article
                      key={msg.id}
                      className={`row-item ${msg.direction}${isExpanded ? ' expanded' : ''}`}
                      onClick={() => toggleRow(msg.id)}
                    >
                      <div className="row-main">
                        <div className="stamp">{fmtTime(msg.ts)}</div>
                        <div className="meta">
                          <strong>{msg.namespace}</strong>
                          <span>{msg.event}</span>
                        </div>
                        <div className="payload" title={msg.payload}>{payloadPreview}</div>
                        <div className="overlay">
                          <span className={`dir-badge dir-${msg.direction}`}>{msg.direction.toUpperCase()}</span>
                          <span>{msg.bytes}B</span>
                          <span>{msg.protocol}</span>
                          {msg.latencyMs !== undefined ? (
                            <span className="latency">RTT {msg.latencyMs}ms</span>
                          ) : (
                            <span>+{delta}ms</span>
                          )}
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="row-expand" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="copy-btn"
                            onClick={() => void copyPayload(msg.id, msg.payload)}
                          >
                            {copiedId === msg.id ? 'Copied!' : 'Copy'}
                          </button>
                          <pre className="payload-full">{prettyPayload(msg.payload)}</pre>
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>

            <div className="timeline-footer">
              <div className="metrics-bar">
                <span>Total <strong>{metrics.total}</strong></span>
                <span>IN <strong>{metrics.inCount}</strong></span>
                <span>OUT <strong>{metrics.outCount}</strong></span>
                <span>AVG RTT <strong>{metrics.avgLatency.toFixed(1)}ms</strong></span>
                <span>PEAK RTT <strong>{metrics.peakLatency.toFixed(1)}ms</strong></span>
              </div>
              <div className="timeline-actions">
                <button onClick={clearTimeline}>Clear</button>
                <button onClick={exportJson}>Export JSON</button>
                <button onClick={exportNdjson}>Export NDJSON</button>
                <button onClick={() => fileInputRef.current?.click()}>Import</button>
                <button onClick={replayTimeline}>Replay</button>
                <button onClick={stopReplay}>Stop</button>
              </div>
            </div>
          </section>
        </section>
      </main>
      {schemaModalOpen ? (
        <div className="modal-backdrop" onClick={() => setSchemaModalOpen(false)}>
          <div
            className="modal-card hud panel"
            role="dialog"
            aria-modal="true"
            aria-label="Schema Guard Builder"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>Schema Guard Builder</h2>
              <button onClick={() => setSchemaModalOpen(false)}>Close</button>
            </div>
            <div className="section-body">
              <div className="schema-builder">
                {schemaProperties.map((item) => (
                  <div key={item.id} className="schema-row">
                    <input
                      value={item.field}
                      onChange={(e) => updateSchemaPropertyField(item.id, e.target.value)}
                      placeholder="field"
                    />
                    <select
                      value={item.type}
                      onChange={(e) => updateSchemaPropertyType(item.id, e.target.value as SchemaValueType)}
                    >
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="object">object</option>
                      <option value="array">array</option>
                    </select>
                    <label className="schema-required">
                      <input
                        type="checkbox"
                        checked={item.required}
                        onChange={(e) => updateSchemaPropertyRequired(item.id, e.target.checked)}
                      />
                      Required
                    </label>
                    <button onClick={() => removeSchemaProperty(item.id)}>Remove</button>
                  </div>
                ))}
              </div>
              <div className="row">
                <button onClick={addSchemaProperty}>Add Property</button>
              </div>
              <p className="muted">Press `Esc` or click outside to close.</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default App;
