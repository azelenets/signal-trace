import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnection } from './useConnection';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;
  onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.call(this as unknown as WebSocket, new CloseEvent('close'));
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.call(this as unknown as WebSocket, new Event('open'));
  }
  emitMessage(data: string) {
    this.onmessage?.call(this as unknown as WebSocket, { data } as MessageEvent);
  }
  emitError() {
    this.onerror?.call(this as unknown as WebSocket, new Event('error'));
  }
}

const makeOptions = (overrides = {}) => ({
  appendTrace: vi.fn(),
  appendSystem: vi.fn(),
  demoMode: false,
  ...overrides,
});

describe('useConnection', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it('initial state is DISCONNECTED', () => {
    const { result } = renderHook(() => useConnection(makeOptions()));
    expect(result.current.connState).toBe('DISCONNECTED');
  });

  it('connect creates a WebSocket with the given URL', () => {
    const { result } = renderHook(() => useConnection(makeOptions()));
    act(() => { result.current.setWsUrl('ws://device:9000'); });
    act(() => { result.current.connect(); });
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://device:9000');
    expect(result.current.connState).toBe('CONNECTING');
  });

  it('onopen sets CONNECTED (no Socket.IO handshake)', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useConnection(opts));
    act(() => { result.current.connect(); });
    act(() => { MockWebSocket.instances[0].emitOpen(); });
    expect(result.current.connState).toBe('CONNECTED');
    expect(opts.appendSystem).toHaveBeenCalledWith('socket_open', expect.stringContaining('ws://'));
  });

  it('onerror sets ERROR', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useConnection(opts));
    act(() => { result.current.connect(); });
    act(() => { MockWebSocket.instances[0].emitError(); });
    expect(result.current.connState).toBe('ERROR');
    expect(opts.appendSystem).toHaveBeenCalledWith('socket_error', expect.any(String));
  });

  it('onclose sets DISCONNECTED', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useConnection(opts));
    act(() => { result.current.connect(); });
    act(() => {
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[0].close();
    });
    expect(result.current.connState).toBe('DISCONNECTED');
    expect(opts.appendSystem).toHaveBeenCalledWith('socket_close', expect.any(String));
  });

  it('disconnect closes the WS and sets DISCONNECTED', () => {
    const { result } = renderHook(() => useConnection(makeOptions()));
    act(() => { result.current.connect(); });
    const ws = MockWebSocket.instances[0];
    act(() => { ws.emitOpen(); });
    act(() => { result.current.disconnect(); });
    expect(ws.close).toHaveBeenCalled();
    expect(result.current.connState).toBe('DISCONNECTED');
  });

  it('demo mode fakes CONNECTED without a real WebSocket', () => {
    const { result } = renderHook(() =>
      useConnection(makeOptions({ demoMode: true })),
    );
    expect(MockWebSocket.instances).toHaveLength(0);
    expect(result.current.connState).toBe('CONNECTED');
  });

  it('demo mode closes an existing WS when activated', () => {
    const opts = makeOptions();
    const { result, rerender } = renderHook(
      ({ demoMode }) => useConnection({ ...opts, demoMode }),
      { initialProps: { demoMode: false } },
    );
    act(() => { result.current.connect(); });
    const ws = MockWebSocket.instances[0];
    act(() => { ws.emitOpen(); });
    rerender({ demoMode: true });
    expect(ws.close).toHaveBeenCalled();
    expect(result.current.connState).toBe('CONNECTED');
  });

  it('recordIncoming text message calls appendTrace', async () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useConnection(opts));
    act(() => { result.current.connect(); });
    await act(async () => {
      MockWebSocket.instances[0].emitOpen();
      MockWebSocket.instances[0].emitMessage('{"event":"ping"}');
    });
    expect(opts.appendTrace).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'in' }),
    );
  });

  it('socket.io handshake: sends connect packet on engine open', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useConnection(opts));
    act(() => { result.current.setSocketIoHandshake(true); });
    act(() => { result.current.setSocketIoNamespace('/devices'); });
    act(() => { result.current.connect(); });
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.emitOpen();
      ws.emitMessage('0{"sid":"abc"}');
    });
    expect(ws.send).toHaveBeenCalledWith('40/devices');
  });

  it('socket.io handshake: namespace connected sets CONNECTED', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useConnection(opts));
    act(() => { result.current.setSocketIoHandshake(true); });
    act(() => { result.current.setSocketIoNamespace('/devices'); });
    act(() => { result.current.connect(); });
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.emitOpen();
      ws.emitMessage('0{}');
      ws.emitMessage('40/devices');
    });
    expect(result.current.connState).toBe('CONNECTED');
    expect(opts.appendTrace).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'socketio_namespace_connected' }),
    );
  });

  it('socket.io handshake: ping packet triggers pong reply', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useConnection(opts));
    act(() => { result.current.setSocketIoHandshake(true); });
    act(() => { result.current.connect(); });
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.emitOpen();
      ws.emitMessage('2');
    });
    expect(ws.send).toHaveBeenCalledWith('3');
  });

  it('socket.io handshake: namespace error sets ERROR', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useConnection(opts));
    act(() => { result.current.setSocketIoHandshake(true); });
    act(() => { result.current.setSocketIoNamespace('/'); });
    act(() => { result.current.connect(); });
    const ws = MockWebSocket.instances[0];
    act(() => {
      ws.emitOpen();
      ws.emitMessage('0{}');
      ws.emitMessage('44{"message":"Unauthorized"}');
    });
    expect(result.current.connState).toBe('ERROR');
  });

  it('trackOutgoing + recordIncoming resolves latency', async () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useConnection(opts));
    act(() => { result.current.connect(); });
    act(() => { MockWebSocket.instances[0].emitOpen(); });

    // Track an outgoing request
    const now = Date.now();
    act(() => { result.current.trackOutgoing('req-42', now); });

    // Simulate server echo with matching requestId
    await act(async () => {
      MockWebSocket.instances[0].emitMessage('{"requestId":"req-42","ok":true}');
    });

    const call = opts.appendTrace.mock.calls.find(
      ([m]) => m.direction === 'in' && m.latencyMs !== undefined,
    );
    expect(call).toBeDefined();
    expect(call![0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('clearPending removes all tracked outgoing requests', async () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useConnection(opts));
    act(() => { result.current.connect(); });
    act(() => { MockWebSocket.instances[0].emitOpen(); });

    act(() => { result.current.trackOutgoing('req-99', Date.now()); });
    act(() => { result.current.clearPending(); });

    await act(async () => {
      MockWebSocket.instances[0].emitMessage('{"requestId":"req-99"}');
    });

    const withLatency = opts.appendTrace.mock.calls.find(([m]) => m.latencyMs !== undefined);
    expect(withLatency).toBeUndefined();
  });

  it('sendRaw sends data when WS is open and not in demo mode', () => {
    const { result } = renderHook(() => useConnection(makeOptions()));
    act(() => { result.current.connect(); });
    const ws = MockWebSocket.instances[0];
    ws.readyState = MockWebSocket.OPEN;
    act(() => { result.current.sendRaw('hello'); });
    expect(ws.send).toHaveBeenCalledWith('hello');
  });

  it('sendRaw is a no-op when demoMode is true', () => {
    const opts = makeOptions({ demoMode: true });
    const { result } = renderHook(() => useConnection(opts));
    act(() => { result.current.sendRaw('hello'); });
    // No WS was created
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('connect with invalid socketio URL sets ERROR', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useConnection(opts));
    act(() => { result.current.setSocketIoHandshake(true); });
    act(() => { result.current.setWsUrl('not-a-url'); });
    act(() => { result.current.connect(); });
    expect(result.current.connState).toBe('ERROR');
    expect(opts.appendSystem).toHaveBeenCalledWith('socketio_url_error', expect.any(String));
  });

  it('stale closure: protocolMode change after connect uses updated decoder', async () => {
    const opts = makeOptions();
    const { result, rerender } = renderHook(
      ({ demoMode }) => useConnection({ ...opts, demoMode }),
      { initialProps: { demoMode: false } },
    );

    act(() => {
      result.current.setProtocolMode('raw');
      result.current.connect();
    });
    act(() => { MockWebSocket.instances[0].emitOpen(); });

    // Change protocol mode AFTER connect (stale closure scenario)
    act(() => { result.current.setProtocolMode('auto'); });
    rerender({ demoMode: false });

    await act(async () => {
      MockWebSocket.instances[0].emitMessage('plain text data');
    });

    // recordIncomingRef should use the updated 'auto' mode
    const call = opts.appendTrace.mock.calls.find(([m]) => m.direction === 'in');
    expect(call).toBeDefined();
  });
});
