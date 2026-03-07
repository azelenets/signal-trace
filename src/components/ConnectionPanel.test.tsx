import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionPanel } from './ConnectionPanel';
import type { LinkState } from '../types';
import type { ProtocolMode } from '../lib/trace-utils';

const defaultProps = {
  connState: 'DISCONNECTED' as LinkState,
  wsUrl: 'ws://localhost:8080',
  setWsUrl: vi.fn(),
  protocolMode: 'auto' as ProtocolMode,
  setProtocolMode: vi.fn(),
  socketIoHandshake: false,
  setSocketIoHandshake: vi.fn(),
  socketIoPath: '/socket.io',
  setSocketIoPath: vi.fn(),
  socketIoNamespace: '/',
  setSocketIoNamespace: vi.fn(),
  socketIoAuth: '',
  setSocketIoAuth: vi.fn(),
  demoMode: false,
  onConnect: vi.fn(),
  onDisconnect: vi.fn(),
  onToggleDemo: vi.fn(),
};

describe('ConnectionPanel', () => {
  afterEach(cleanup);

  it('renders endpoint input and protocol select', () => {
    render(<ConnectionPanel {...defaultProps} />);
    expect(screen.getByLabelText('Endpoint')).toHaveValue('ws://localhost:8080');
    expect(screen.getByLabelText('Protocol Decode')).toBeInTheDocument();
  });

  it('shows connection status dot and state label', () => {
    render(<ConnectionPanel {...defaultProps} connState="CONNECTED" />);
    expect(screen.getByText('CONNECTED')).toBeInTheDocument();
    expect(document.querySelector('.dot.connected')).toBeInTheDocument();
  });

  it('hides Socket.IO fields when handshake is off', () => {
    render(<ConnectionPanel {...defaultProps} socketIoHandshake={false} />);
    expect(screen.queryByLabelText('Socket.IO Path')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Socket.IO Namespace')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Socket.IO Auth JSON')).not.toBeInTheDocument();
  });

  it('shows Socket.IO fields when handshake is on', () => {
    render(<ConnectionPanel {...defaultProps} socketIoHandshake={true} />);
    expect(screen.getByLabelText('Socket.IO Path')).toBeInTheDocument();
    expect(screen.getByLabelText('Socket.IO Namespace')).toBeInTheDocument();
    expect(screen.getByLabelText('Socket.IO Auth JSON')).toBeInTheDocument();
  });

  it('Connect button is disabled when CONNECTING', () => {
    render(<ConnectionPanel {...defaultProps} connState="CONNECTING" />);
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  });

  it('Connect button is disabled when CONNECTED', () => {
    render(<ConnectionPanel {...defaultProps} connState="CONNECTED" />);
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  });

  it('Connect button is enabled when DISCONNECTED', () => {
    render(<ConnectionPanel {...defaultProps} connState="DISCONNECTED" />);
    expect(screen.getByRole('button', { name: 'Connect' })).not.toBeDisabled();
  });

  it('Connect button is disabled when demoMode is on', () => {
    render(<ConnectionPanel {...defaultProps} demoMode={true} />);
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  });

  it('Disconnect button is disabled when DISCONNECTED and not in demoMode', () => {
    render(<ConnectionPanel {...defaultProps} connState="DISCONNECTED" demoMode={false} />);
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeDisabled();
  });

  it('Disconnect button is enabled when CONNECTED', () => {
    render(<ConnectionPanel {...defaultProps} connState="CONNECTED" />);
    expect(screen.getByRole('button', { name: 'Disconnect' })).not.toBeDisabled();
  });

  it('clicking Connect calls onConnect', async () => {
    const onConnect = vi.fn();
    const user = userEvent.setup();
    render(<ConnectionPanel {...defaultProps} onConnect={onConnect} />);
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('clicking Disconnect calls onDisconnect', async () => {
    const onDisconnect = vi.fn();
    const user = userEvent.setup();
    render(<ConnectionPanel {...defaultProps} connState="CONNECTED" onDisconnect={onDisconnect} />);
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('Demo button shows "Live Mode" when demoMode is on', () => {
    render(<ConnectionPanel {...defaultProps} demoMode={true} />);
    expect(screen.getByRole('button', { name: 'Live Mode' })).toBeInTheDocument();
  });

  it('clicking Demo button calls onToggleDemo', async () => {
    const onToggleDemo = vi.fn();
    const user = userEvent.setup();
    render(<ConnectionPanel {...defaultProps} onToggleDemo={onToggleDemo} />);
    await user.click(screen.getByRole('button', { name: 'Demo' }));
    expect(onToggleDemo).toHaveBeenCalledOnce();
  });

  it('endpoint input is disabled in demoMode', () => {
    render(<ConnectionPanel {...defaultProps} demoMode={true} />);
    expect(screen.getByLabelText('Endpoint')).toBeDisabled();
  });
});
