import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Direction = 'in' | 'out' | 'sys';
type LinkState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';
type ProtocolMode = 'auto' | 'raw' | 'socketio';
type PayloadFormat = 'text' | 'json' | 'binary';

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

interface SimpleSchema {
  required?: string[];
  properties?: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>;
}

interface DecodedFrame {
  namespace: string;
  event: string;
  payload: string;
  protocol: 'raw' | 'socket.io';
  correlationId: string | null;
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

const safeJson = (raw: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
};

const safeParseArray = (raw: string): unknown[] | null => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const randomFrom = <T,>(input: readonly T[]): T => input[Math.floor(Math.random() * input.length)];

const extractCorrelationId = (payload: Record<string, unknown> | null): string | null => {
  if (!payload) return null;
  const candidate =
    (typeof payload.responseTo === 'string' && payload.responseTo) ||
    (typeof payload.replyTo === 'string' && payload.replyTo) ||
    (typeof payload.requestId === 'string' && payload.requestId) ||
    (typeof payload.correlationId === 'string' && payload.correlationId) ||
    (typeof payload.id === 'string' && payload.id) ||
    null;
  return candidate;
};

const decodeRawJsonFrame = (raw: string): DecodedFrame => {
  const parsed = safeJson(raw);
  const namespace = typeof parsed?.namespace === 'string' ? parsed.namespace : '/raw';
  const event = typeof parsed?.event === 'string' ? parsed.event : 'message';
  return {
    namespace,
    event,
    payload: raw,
    protocol: 'raw',
    correlationId: extractCorrelationId(parsed),
    format: parsed ? 'json' : 'text',
  };
};

const decodeSocketIoFrame = (raw: string): DecodedFrame | null => {
  let packet = raw;

  if (packet === '2') {
    return { namespace: '/engine', event: 'ping', payload: '{"type":"ping"}', protocol: 'socket.io', correlationId: null, format: 'json' };
  }
  if (packet === '3') {
    return { namespace: '/engine', event: 'pong', payload: '{"type":"pong"}', protocol: 'socket.io', correlationId: null, format: 'json' };
  }

  if (packet.startsWith('4')) {
    packet = packet.slice(1);
  }

  if (packet === '0') {
    return { namespace: '/socket', event: 'connect', payload: '{"type":"connect"}', protocol: 'socket.io', correlationId: null, format: 'json' };
  }

  if (packet.startsWith('0{')) {
    return { namespace: '/engine', event: 'open', payload: packet.slice(1), protocol: 'socket.io', correlationId: null, format: 'json' };
  }

  if (packet === '40') {
    return { namespace: '/socket', event: 'connected', payload: '{"type":"connected"}', protocol: 'socket.io', correlationId: null, format: 'json' };
  }

  if (!(packet.startsWith('42') || packet.startsWith('43'))) {
    return null;
  }

  let cursor = 2;
  let namespace = '/';

  if (packet[cursor] === '/') {
    const commaIdx = packet.indexOf(',', cursor);
    if (commaIdx === -1) return null;
    namespace = packet.slice(cursor, commaIdx);
    cursor = commaIdx + 1;
  }

  while (cursor < packet.length && /\d/.test(packet[cursor])) {
    cursor += 1;
  }

  const data = packet.slice(cursor);
  const arr = safeParseArray(data);

  if (packet.startsWith('43')) {
    return {
      namespace,
      event: 'ack',
      payload: data || '[]',
      protocol: 'socket.io',
      correlationId: null,
      format: arr ? 'json' : 'text',
    };
  }

  if (!arr || arr.length === 0) {
    return null;
  }

  const eventName = typeof arr[0] === 'string' ? arr[0] : 'event';
  const payload = arr.length > 1 ? JSON.stringify(arr[1]) : '{}';
  const parsedPayload = safeJson(payload);

  return {
    namespace,
    event: eventName,
    payload,
    protocol: 'socket.io',
    correlationId: extractCorrelationId(parsedPayload),
    format: parsedPayload ? 'json' : 'text',
  };
};

const decodeIncomingText = (raw: string, mode: ProtocolMode): DecodedFrame => {
  if (mode === 'raw') {
    return decodeRawJsonFrame(raw);
  }

  if (mode === 'socketio') {
    return decodeSocketIoFrame(raw) ?? decodeRawJsonFrame(raw);
  }

  const socketDecoded = decodeSocketIoFrame(raw);
  if (socketDecoded) {
    return socketDecoded;
  }
  return decodeRawJsonFrame(raw);
};

const hexPreview = (bytes: Uint8Array, max = 72): string => {
  const slice = bytes.slice(0, max);
  const hex = [...slice].map(v => v.toString(16).padStart(2, '0')).join(' ');
  const suffix = bytes.length > max ? ` ...(+${bytes.length - max}B)` : '';
  return `${hex}${suffix}`;
};

const textEncoder = new TextEncoder();

const validateAgainstSchema = (schema: SimpleSchema, payload: Record<string, unknown>): string[] => {
  const errors: string[] = [];

  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in payload)) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  if (schema.properties) {
    for (const [field, type] of Object.entries(schema.properties)) {
      if (!(field in payload)) continue;
      const value = payload[field];
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== type) {
        errors.push(`Field ${field} expected ${type}, got ${actualType}`);
      }
    }
  }

  return errors;
};

const appSchemaTemplate = JSON.stringify(
  {
    required: ['requestId', 'action'],
    properties: {
      requestId: 'string',
      action: 'string',
      namespace: 'string',
      value: 'number',
    },
  },
  null,
  2,
);

const parseSocketIoAuth = (raw: string): { auth: Record<string, unknown> | null; error: string } => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { auth: null, error: '' };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { auth: null, error: 'Socket.IO auth must be a JSON object.' };
    }
    return { auth: parsed as Record<string, unknown>, error: '' };
  } catch {
    return { auth: null, error: 'Socket.IO auth must be valid JSON.' };
  }
};

const normalizeSocketIoPath = (path: string): string => {
  const trimmed = path.trim() || '/socket.io';
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};

const normalizeSocketIoNamespace = (ns: string): string => {
  const trimmed = ns.trim() || '/';
  if (trimmed === '/') return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const buildSocketIoWsUrl = (endpoint: string, path: string): string | null => {
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
    if (parsed.protocol === 'https:') parsed.protocol = 'wss:';
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      return null;
    }

    parsed.pathname = normalizeSocketIoPath(path);
    parsed.searchParams.set('EIO', '4');
    parsed.searchParams.set('transport', 'websocket');
    return parsed.toString();
  } catch {
    return null;
  }
};

const App = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingMapRef = useRef(new Map<string, number>());
  const seqRef = useRef(0);
  const demoTimerRef = useRef<number | null>(null);
  const replayTimerRef = useRef<number | null>(null);
  const replayCancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  const [schemaText, setSchemaText] = useState(appSchemaTemplate);
  const [replaySpeed, setReplaySpeed] = useState(4);

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
    if (wsRef.current && wsRef.current.readyState <= 1) {
      wsRef.current.close();
    }

    setConnState('CONNECTING');
    const ws = new WebSocket(targetUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnState('CONNECTED');
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
        const namespace = normalizeSocketIoNamespace(socketIoNamespace);
        const nsWire = namespace === '/' ? '' : namespace;
        const authWire = socketAuth.auth ? `,${JSON.stringify(socketAuth.auth)}` : '';
        const connectPacket = `40${nsWire}${authWire}`;
        ws.send(connectPacket);
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
    const parsed = safeJson(schemaText);
    if (!parsed) {
      return { schema: null, parseError: 'Schema must be valid JSON.' };
    }

    const required = Array.isArray(parsed.required) ? parsed.required.filter(v => typeof v === 'string') : undefined;
    const propertiesRaw = parsed.properties;
    const allowedTypes = new Set(['string', 'number', 'boolean', 'object', 'array']);
    const properties: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'> = {};

    if (typeof propertiesRaw === 'object' && propertiesRaw !== null) {
      for (const [field, type] of Object.entries(propertiesRaw)) {
        if (typeof type === 'string' && allowedTypes.has(type)) {
          properties[field] = type as 'string' | 'number' | 'boolean' | 'object' | 'array';
        }
      }
    }

    return { schema: { required, properties } as SimpleSchema, parseError: '' };
  }, [schemaText]);

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
    const now = Date.now();
    const parsedPayload = safeJson(outPayload);

    if (parsedSchema.parseError) {
      appendSystem('schema_error', parsedSchema.parseError);
      return;
    }

    if (parsedPayload && parsedSchema.schema) {
      const schemaErrors = validateAgainstSchema(parsedSchema.schema, parsedPayload);
      if (schemaErrors.length > 0) {
        appendSystem('schema_violation', schemaErrors.join(' | '));
        return;
      }
    }

    let wire = outPayload;
    let requestId = extractCorrelationId(parsedPayload);

    if (!requestId) {
      requestId = `trace-${now}`;
      const nextPayload = parsedPayload ? { ...parsedPayload, requestId, namespace: outNamespace } : { requestId, namespace: outNamespace, raw: outPayload };
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
      format: parsedPayload ? 'json' : 'text',
    });

    if (!demoMode && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(wire);
    }
  }, [appendSystem, appendTrace, demoMode, outNamespace, outPayload, parsedSchema.parseError, parsedSchema.schema, protocolMode, socketIoEvent, socketIoHandshake, socketIoNamespace]);

  const clearTimeline = useCallback(() => {
    stopReplay();
    setMessages([]);
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
            <h2>Connection</h2>
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
            <label>
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
              <button onClick={connect} disabled={demoMode || connState === 'CONNECTING'}>Connect</button>
              <button onClick={disconnect}>Disconnect</button>
              <button onClick={() => setDemoMode(v => !v)}>{demoMode ? 'Live Mode' : 'Demo Mode'}</button>
            </div>

            <div className="status">
              <span className={`dot ${connState.toLowerCase()}`} />
              <span>{connState}</span>
            </div>

            <h2>Namespace Filter</h2>
            <div className="ns-list">
              {allNamespaces.length === 0 ? <p className="muted">No namespaces captured yet.</p> : allNamespaces.map(ns => (
                <label key={ns} className="ns-item">
                  <input type="checkbox" checked={activeNamespaces.has(ns)} onChange={() => toggleNamespace(ns)} />
                  <span>{ns}</span>
                </label>
              ))}
            </div>

            <h2>Search</h2>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="event, namespace, payload" />

            <h2>Schema Guard</h2>
            <label>
              Outgoing Payload Schema
              <textarea rows={7} value={schemaText} onChange={(e) => setSchemaText(e.target.value)} />
            </label>
            {parsedSchema.parseError ? <p className="error">{parsedSchema.parseError}</p> : null}

            <h2>Transmit</h2>
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
            <label>
              JSON Payload
              <textarea rows={5} value={outPayload} onChange={(e) => setOutPayload(e.target.value)} />
            </label>

            <div className="row">
              <button onClick={formatOutgoingJson}>Format JSON</button>
              <button onClick={sendMessage}>Send Frame</button>
            </div>
          </aside>

          <section className="hud panel timeline">
            <div className="timeline-head">
              <h2>Message Timeline</h2>
              <div className="chips">
                <span>Total {metrics.total}</span>
                <span>IN {metrics.inCount}</span>
                <span>OUT {metrics.outCount}</span>
                <span>AVG RTT {metrics.avgLatency.toFixed(1)}ms</span>
                <span>PEAK RTT {metrics.peakLatency.toFixed(1)}ms</span>
                <button onClick={clearTimeline}>Clear</button>
                <button onClick={exportJson}>Export JSON</button>
                <button onClick={exportNdjson}>Export NDJSON</button>
                <button onClick={() => fileInputRef.current?.click()}>Import</button>
                <button onClick={replayTimeline}>Replay</button>
                <button onClick={stopReplay}>Stop Replay</button>
              </div>
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
                <p className="empty">No traffic after current filters.</p>
              ) : (
                [...filtered].reverse().map((msg, idx) => {
                  const prev = filtered.at(filtered.length - idx);
                  const delta = prev ? msg.ts - prev.ts : 0;
                  const payloadPreview = msg.payload.length > 190 ? `${msg.payload.slice(0, 190)}...` : msg.payload;
                  return (
                    <article key={msg.id} className={`row-item ${msg.direction}`}>
                      <div className="stamp">{fmtTime(msg.ts)}</div>
                      <div className="meta">
                        <strong>{msg.namespace}</strong>
                        <span>{msg.event}</span>
                      </div>
                      <div className="payload" title={msg.payload}>{payloadPreview}</div>
                      <div className="overlay">
                        <span>{msg.bytes}B</span>
                        <span>{msg.protocol}</span>
                        <span>{msg.format}</span>
                        {msg.latencyMs !== undefined ? <span className="latency">RTT {msg.latencyMs}ms</span> : <span>+{delta}ms</span>}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
};

export default App;
