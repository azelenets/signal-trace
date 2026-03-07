import { describe, expect, it } from 'vitest';
import {
  decodeIncomingText,
  decodeSocketIoFrame,
  hexPreview,
  safeJson,
  validateAgainstSchema,
} from './trace-utils';

describe('trace-utils', () => {
  it('parses object JSON and rejects non-object JSON', () => {
    expect(safeJson('{"ok":true}')).toEqual({ ok: true });
    expect(safeJson('1')).toBeNull();
    expect(safeJson('bad-json')).toBeNull();
  });

  it('decodes socket.io ping/pong packets', () => {
    expect(decodeSocketIoFrame('2')?.event).toBe('ping');
    expect(decodeSocketIoFrame('3')?.event).toBe('pong');
  });

  it('decodes socket.io event packet with namespace', () => {
    const frame = decodeSocketIoFrame('42/devices,["device_telemetry",{"id":"abc"}]');
    expect(frame?.namespace).toBe('/devices');
    expect(frame?.event).toBe('device_telemetry');
    expect(frame?.protocol).toBe('socket.io');
  });

  it('falls back to raw mode when socket.io decode fails in auto', () => {
    const frame = decodeIncomingText('plain text', 'auto');
    expect(frame.protocol).toBe('raw');
    expect(frame.event).toBe('message');
    expect(frame.namespace).toBe('/raw');
  });

  it('validates schema required and property types', () => {
    const errors = validateAgainstSchema(
      {
        required: ['requestId', 'value'],
        properties: {
          requestId: 'string',
          value: 'number',
        },
      },
      {
        requestId: 'abc',
        value: '10',
      },
    );

    expect(errors).toContain('Field value expected number, got string');
    expect(errors).not.toContain('Missing required field: requestId');
  });

  it('creates stable hex preview with truncation suffix', () => {
    const bytes = new Uint8Array(80).fill(255);
    const preview = hexPreview(bytes, 8);
    expect(preview).toMatch(/^ff ff ff ff ff ff ff ff/);
    expect(preview).toContain('...(+72B)');
  });
});
