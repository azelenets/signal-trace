import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  Direction,
  LinkState,
  Metrics,
  SchemaPropertyDraft,
  SchemaValueType,
  SendParams,
  TraceMessage,
} from './types';

describe('types', () => {
  it('defines the supported union values', () => {
    expectTypeOf<Direction>().toEqualTypeOf<'in' | 'out' | 'sys'>();
    expectTypeOf<LinkState>().toEqualTypeOf<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'>();
    expectTypeOf<SchemaValueType>().toEqualTypeOf<'string' | 'number' | 'boolean' | 'object' | 'array'>();
  });

  it('supports the shared domain object shapes', () => {
    const trace: TraceMessage = {
      id: 'trace-1',
      ts: 123,
      direction: 'in',
      namespace: '/telemetry',
      event: 'state',
      payload: '{"ok":true}',
      bytes: 11,
      latencyMs: 42,
      protocol: 'socket.io',
      format: 'json',
    };

    const metrics: Metrics = {
      total: 10,
      inCount: 4,
      outCount: 3,
      avgLatency: 12.5,
      peakLatency: 27,
    };

    const property: SchemaPropertyDraft = {
      id: 'field-1',
      field: 'requestId',
      type: 'string',
      required: true,
    };

    const sendParams: SendParams = {
      payload: '{}',
      namespace: '/telemetry',
      autoRefresh: true,
      socketIoEvent: 'trace',
    };

    expect(trace.protocol).toBe('socket.io');
    expect(metrics.peakLatency).toBe(27);
    expect(property.required).toBe(true);
    expect(sendParams.socketIoEvent).toBe('trace');
  });
});
