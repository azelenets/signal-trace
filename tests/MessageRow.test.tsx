import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageRow } from '../src/components/MessageRow';
import type { TraceMessage } from '../src/types';

const MSG: TraceMessage = {
  id: 'msg-1',
  ts: new Date('2024-01-01T14:23:07.412Z').getTime(),
  direction: 'in',
  namespace: '/telemetry',
  event: 'heartbeat',
  payload: '{"value":72.4}',
  bytes: 14,
  latencyMs: 42,
  protocol: 'raw',
  format: 'json',
};

const renderRow = (overrides: Partial<Parameters<typeof MessageRow>[0]> = {}) =>
  render(
    <MessageRow
      msg={MSG}
      deltaMs={100}
      isExpanded={false}
      copiedId={null}
      onToggle={vi.fn()}
      onCopy={vi.fn()}
      {...overrides}
    />,
  );

describe('MessageRow', () => {
  afterEach(cleanup);

  it('renders namespace, event, direction badge, and bytes', () => {
    renderRow();
    expect(screen.getByText('/telemetry')).toBeInTheDocument();
    expect(screen.getByText('heartbeat')).toBeInTheDocument();
    expect(screen.getByText('IN')).toBeInTheDocument();
    expect(screen.getByText('14B')).toBeInTheDocument();
  });

  it('shows RTT latency when latencyMs is set', () => {
    renderRow();
    expect(screen.getByText('RTT 42ms')).toBeInTheDocument();
  });

  it('shows delta time when latencyMs is absent', () => {
    renderRow({ msg: { ...MSG, latencyMs: undefined } });
    expect(screen.getByText('+100ms')).toBeInTheDocument();
  });

  it('shows payload preview truncated at 190 chars', () => {
    const long = 'x'.repeat(200);
    renderRow({ msg: { ...MSG, payload: long } });
    expect(screen.getByText(`${'x'.repeat(190)}...`)).toBeInTheDocument();
  });

  it('calls onToggle with message id when clicked', () => {
    const onToggle = vi.fn();
    renderRow({ onToggle });
    fireEvent.click(screen.getByRole('article'));
    expect(onToggle).toHaveBeenCalledWith('msg-1');
  });

  it('does not show expanded content when collapsed', () => {
    renderRow({ isExpanded: false });
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  });

  it('shows copy button and full payload when expanded', () => {
    renderRow({ isExpanded: true });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByText('{"value":72.4}')).toBeInTheDocument();
  });

  it('shows Copied! label when copiedId matches', () => {
    renderRow({ isExpanded: true, copiedId: 'msg-1' });
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('calls onCopy when copy button is clicked', () => {
    const onCopy = vi.fn();
    renderRow({ isExpanded: true, onCopy });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(onCopy).toHaveBeenCalledWith('msg-1', '{"value":72.4}');
  });

  it('copy button click does not propagate to toggle', () => {
    const onToggle = vi.fn();
    renderRow({ isExpanded: true, onToggle });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('applies direction class to article element', () => {
    renderRow({ msg: { ...MSG, direction: 'out' } });
    expect(screen.getByRole('article').className).toContain('out');
  });

  it('applies expanded class when isExpanded is true', () => {
    renderRow({ isExpanded: true });
    expect(screen.getByRole('article').className).toContain('expanded');
  });

  it('pretty-prints valid JSON in expanded payload', () => {
    renderRow({ isExpanded: true });
    // Both the preview div and the <pre> contain the value — grab the <pre>
    const pre = screen.getAllByText(/72\.4/).find(el => el.tagName === 'PRE');
    expect(pre).toBeDefined();
    expect(pre!.textContent).toContain('\n');
  });
});
