import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

class MockWebSocket {
  static readonly instances: MockWebSocket[] = [];

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
}

describe('App', () => {
  const originalWebSocket = globalThis.WebSocket;

  const selectProtocolMode = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getAllByRole('combobox', { name: 'Protocol Decode' })[0]);
    await user.click(screen.getByRole('option', { name: 'SOCKET.IO' }));
  };

  beforeEach(() => {
    MockWebSocket.instances.length = 0;
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    cleanup();
    globalThis.WebSocket = originalWebSocket;
  });

  it('opens schema builder modal from sidebar', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Open Schema Builder' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Schema Guard Builder')).toBeInTheDocument();
  });

  it('shows schema violation when required field is missing', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Open schema builder and add a required field
    await user.click(screen.getByRole('button', { name: 'Open Schema Builder' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Add Property' }));
    fireEvent.change(within(dialog).getByPlaceholderText('field'), { target: { value: 'requestId' } });
    fireEvent.click(within(dialog).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    // Send a payload that is missing the required field
    const payloadInput = screen.getAllByLabelText('JSON Payload')[0];
    fireEvent.change(payloadInput, { target: { value: '{"action":"ping"}' } });
    await user.click(screen.getByRole('button', { name: 'Demo' }));
    await user.click(screen.getByRole('button', { name: 'Send Frame' }));

    expect(screen.getByText('schema_violation')).toBeInTheDocument();
  });

  it('blocks socket.io send until namespace is ready', async () => {
    const user = userEvent.setup();
    render(<App />);

    await selectProtocolMode(user);
    await user.click(screen.getAllByLabelText('Socket.IO Handshake')[0]);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await user.click(screen.getByRole('button', { name: 'Send Frame' }));

    expect(screen.getByText('socketio_not_ready')).toBeInTheDocument();
  });

  it('completes socket.io handshake and replies to ping', async () => {
    const user = userEvent.setup();
    render(<App />);

    await selectProtocolMode(user);
    await user.click(screen.getAllByLabelText('Socket.IO Handshake')[0]);
    await user.clear(screen.getAllByLabelText('Socket.IO Namespace')[0]);
    await user.type(screen.getAllByLabelText('Socket.IO Namespace')[0], '/devices');
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();

    ws.emitOpen();
    expect(screen.getAllByText('CONNECTING').length).toBeGreaterThan(0);

    ws.emitMessage('0{"sid":"abc"}');
    expect(ws.send).toHaveBeenCalledWith('40/devices');

    ws.emitMessage('40/devices');
    await waitFor(() => {
      expect(screen.getAllByText('CONNECTED').length).toBeGreaterThan(0);
    });

    ws.emitMessage('2');
    expect(ws.send).toHaveBeenCalledWith('3');
  });
});
