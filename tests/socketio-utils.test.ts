import { describe, expect, it } from 'vitest';
import {
  buildSocketIoWsUrl,
  normalizeSocketIoNamespace,
  normalizeSocketIoPath,
  parseSocketIoAuth,
} from '../src/lib/socketio-utils';

describe('socketio-utils', () => {
  it('parses auth JSON object and reports invalid input', () => {
    expect(parseSocketIoAuth('{"serial":"s","token":"t"}')).toEqual({
      auth: { serial: 's', token: 't' },
      error: '',
    });
    expect(parseSocketIoAuth('[]').error).toContain('JSON object');
    expect(parseSocketIoAuth('{bad').error).toContain('valid JSON');
  });

  it('normalizes socket.io path and namespace', () => {
    expect(normalizeSocketIoPath('socket.io')).toBe('/socket.io/');
    expect(normalizeSocketIoPath('/ws')).toBe('/ws/');
    expect(normalizeSocketIoNamespace('devices')).toBe('/devices');
    expect(normalizeSocketIoNamespace('/')).toBe('/');
  });

  it('builds ws url with engine.io params', () => {
    const url = buildSocketIoWsUrl('http://localhost:3000', '/socket.io');
    expect(url).toBe('ws://localhost:3000/socket.io/?EIO=4&transport=websocket');
  });

  it('returns null for unsupported endpoint scheme', () => {
    expect(buildSocketIoWsUrl('ftp://localhost:3000', '/socket.io')).toBeNull();
  });
});
