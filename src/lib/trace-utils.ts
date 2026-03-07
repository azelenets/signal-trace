export type ProtocolMode = 'auto' | 'raw' | 'socketio';
export type PayloadFormat = 'text' | 'json' | 'binary';

export interface SimpleSchema {
  required?: string[];
  properties?: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>;
}

export interface DecodedFrame {
  namespace: string;
  event: string;
  payload: string;
  protocol: 'raw' | 'socket.io';
  correlationId: string | null;
  format: PayloadFormat;
}

export const safeJson = (raw: string): Record<string, unknown> | null => {
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

export const extractCorrelationId = (payload: Record<string, unknown> | null): string | null => {
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

export const decodeRawJsonFrame = (raw: string): DecodedFrame => {
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

export const decodeSocketIoFrame = (raw: string): DecodedFrame | null => {
  const packet = raw;

  if (packet === '2') {
    return {
      namespace: '/engine',
      event: 'ping',
      payload: '{"type":"ping"}',
      protocol: 'socket.io',
      correlationId: null,
      format: 'json',
    };
  }
  if (packet === '3') {
    return {
      namespace: '/engine',
      event: 'pong',
      payload: '{"type":"pong"}',
      protocol: 'socket.io',
      correlationId: null,
      format: 'json',
    };
  }

  if (packet === '0') {
    return {
      namespace: '/socket',
      event: 'connect',
      payload: '{"type":"connect"}',
      protocol: 'socket.io',
      correlationId: null,
      format: 'json',
    };
  }

  if (packet.startsWith('0{')) {
    return {
      namespace: '/engine',
      event: 'open',
      payload: packet.slice(1),
      protocol: 'socket.io',
      correlationId: null,
      format: 'json',
    };
  }

  if (packet === '40') {
    return {
      namespace: '/socket',
      event: 'connected',
      payload: '{"type":"connected"}',
      protocol: 'socket.io',
      correlationId: null,
      format: 'json',
    };
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

export const decodeIncomingText = (raw: string, mode: ProtocolMode): DecodedFrame => {
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

export const hexPreview = (bytes: Uint8Array, max = 72): string => {
  const slice = bytes.slice(0, max);
  const hex = [...slice].map(v => v.toString(16).padStart(2, '0')).join(' ');
  const suffix = bytes.length > max ? ` ...(+${bytes.length - max}B)` : '';
  return `${hex}${suffix}`;
};

export const validateAgainstSchema = (schema: SimpleSchema, payload: Record<string, unknown>): string[] => {
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
