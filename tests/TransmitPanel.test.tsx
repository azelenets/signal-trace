import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TransmitPanel } from '../src/components/TransmitPanel';

const defaultProps = {
  protocolMode: 'auto' as const,
  onSend: vi.fn(),
  onSystemLog: vi.fn(),
};

describe('TransmitPanel', () => {
  afterEach(cleanup);

  it('renders namespace and payload fields', () => {
    render(<TransmitPanel {...defaultProps} />);
    expect(screen.getByLabelText('Namespace')).toBeInTheDocument();
    expect(screen.getByLabelText('JSON Payload')).toBeInTheDocument();
  });

  it('hides Socket.IO Event field when not in socketio mode', () => {
    render(<TransmitPanel {...defaultProps} protocolMode="auto" />);
    expect(screen.queryByLabelText('Socket.IO Event')).not.toBeInTheDocument();
  });

  it('shows Socket.IO Event field in socketio mode', () => {
    render(<TransmitPanel {...defaultProps} protocolMode="socketio" />);
    expect(screen.getByLabelText('Socket.IO Event')).toBeInTheDocument();
  });

  it('calls onSend with correct params when Send Frame is clicked', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<TransmitPanel {...defaultProps} onSend={onSend} />);
    await user.click(screen.getByRole('button', { name: 'Send Frame' }));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: '/telemetry',
        payload: expect.stringContaining('requestId'),
        autoRefresh: true,
        socketIoEvent: 'trace',
      }),
    );
  });

  it('onSend reflects edited namespace and payload', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<TransmitPanel {...defaultProps} onSend={onSend} />);

    await user.clear(screen.getByLabelText('Namespace'));
    await user.type(screen.getByLabelText('Namespace'), '/alerts');

    const payloadArea = screen.getByLabelText('JSON Payload');
    fireEvent.change(payloadArea, { target: { value: '{"action":"alert"}' } });

    await user.click(screen.getByRole('button', { name: 'Send Frame' }));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: '/alerts',
        payload: '{"action":"alert"}',
      }),
    );
  });

  it('Auto-refresh button toggles and passes value to onSend', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<TransmitPanel {...defaultProps} onSend={onSend} />);

    // Default is on (active class) — turn it off
    await user.click(screen.getByRole('button', { name: 'Auto-refresh id/timestamp' }));
    await user.click(screen.getByRole('button', { name: 'Send Frame' }));
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ autoRefresh: false }));
  });

  it('Format JSON button formats valid JSON payload', async () => {
    const user = userEvent.setup();
    render(<TransmitPanel {...defaultProps} />);

    const payloadArea = screen.getByLabelText('JSON Payload');
    fireEvent.change(payloadArea, { target: { value: '{"a":1,"b":2}' } });

    await user.click(screen.getByRole('button', { name: 'Format JSON' }));
    expect((payloadArea as HTMLTextAreaElement).value).toContain('\n');
  });

  it('Format JSON calls onSystemLog for invalid JSON', async () => {
    const onSystemLog = vi.fn();
    const user = userEvent.setup();
    render(<TransmitPanel {...defaultProps} onSystemLog={onSystemLog} />);

    const payloadArea = screen.getByLabelText('JSON Payload');
    fireEvent.change(payloadArea, { target: { value: 'not json' } });

    await user.click(screen.getByRole('button', { name: 'Format JSON' }));
    expect(onSystemLog).toHaveBeenCalledWith('format_error', expect.any(String));
  });

  it('socketIoEvent is passed to onSend in socketio mode', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<TransmitPanel {...defaultProps} protocolMode="socketio" onSend={onSend} />);

    await user.clear(screen.getByLabelText('Socket.IO Event'));
    await user.type(screen.getByLabelText('Socket.IO Event'), 'device_telemetry');

    await user.click(screen.getByRole('button', { name: 'Send Frame' }));
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({ socketIoEvent: 'device_telemetry' }),
    );
  });
});
