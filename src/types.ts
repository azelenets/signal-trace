import type { PayloadFormat } from './lib/trace-utils';

export type Direction = 'in' | 'out' | 'sys';
export type LinkState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';
export type SchemaValueType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface TraceMessage {
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

export interface SchemaPropertyDraft {
  id: string;
  field: string;
  type: SchemaValueType;
  required: boolean;
}

export interface Metrics {
  total: number;
  inCount: number;
  outCount: number;
  avgLatency: number;
  peakLatency: number;
}

export interface SendParams {
  payload: string;
  namespace: string;
  autoRefresh: boolean;
  socketIoEvent: string;
}
