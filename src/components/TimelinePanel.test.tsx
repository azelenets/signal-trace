import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimelinePanel } from './TimelinePanel';
import type { Metrics, TraceMessage } from '../types';

const METRICS: Metrics = {
  total: 3,
  inCount: 2,
  outCount: 1,
  avgLatency: 15.5,
  peakLatency: 30,
};

const MSG = (id: string, overrides: Partial<TraceMessage> = {}): TraceMessage => ({
  id,
  ts: 1700000000000 + Number(id.replace(/\D/g, '')) * 1000,
  direction: 'in',
  namespace: '/telemetry',
  event: 'heartbeat',
  payload: '{}',
  bytes: 2,
  protocol: 'raw',
  format: 'json',
  ...overrides,
});

const fileInputRef = { current: null } as React.RefObject<HTMLInputElement | null>;

const defaultProps = {
  filtered: [],
  metrics: METRICS,
  search: '',
  setSearch: vi.fn(),
  expandedId: null,
  copiedId: null,
  replaySpeed: 4,
  setReplaySpeed: vi.fn(),
  fileInputRef,
  onToggleRow: vi.fn(),
  onCopyPayload: vi.fn(),
  onClear: vi.fn(),
  onExportJson: vi.fn(),
  onExportNdjson: vi.fn(),
  onImport: vi.fn(),
  onReplay: vi.fn(),
  onStopReplay: vi.fn(),
};

describe('TimelinePanel', () => {
  afterEach(cleanup);

  it('shows empty state when no messages', () => {
    render(<TimelinePanel {...defaultProps} filtered={[]} />);
    expect(screen.getByText('No traffic')).toBeInTheDocument();
  });

  it('renders a row for each filtered message', () => {
    const msgs = [MSG('1'), MSG('2'), MSG('3')];
    render(<TimelinePanel {...defaultProps} filtered={msgs} />);
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('shows metrics: total, IN, OUT, avg and peak RTT', () => {
    render(<TimelinePanel {...defaultProps} filtered={[MSG('1')]} />);
    expect(screen.getByText('3')).toBeInTheDocument();  // total
    expect(screen.getByText('2')).toBeInTheDocument();  // inCount
    expect(screen.getByText('1')).toBeInTheDocument();  // outCount
    expect(screen.getByText('15.5ms')).toBeInTheDocument();
    expect(screen.getByText('30.0ms')).toBeInTheDocument();
  });

  it('search input calls setSearch on change', () => {
    const setSearch = vi.fn();
    render(<TimelinePanel {...defaultProps} setSearch={setSearch} />);
    fireEvent.change(
      screen.getByPlaceholderText('Search event, namespace, payload'),
      { target: { value: 'heartbeat' } },
    );
    expect(setSearch).toHaveBeenCalledWith('heartbeat');
  });

  it('Clear button calls onClear', () => {
    const onClear = vi.fn();
    render(<TimelinePanel {...defaultProps} onClear={onClear} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('Export JSON button calls onExportJson', () => {
    const onExportJson = vi.fn();
    render(<TimelinePanel {...defaultProps} onExportJson={onExportJson} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }));
    expect(onExportJson).toHaveBeenCalledOnce();
  });

  it('Export NDJSON button calls onExportNdjson', () => {
    const onExportNdjson = vi.fn();
    render(<TimelinePanel {...defaultProps} onExportNdjson={onExportNdjson} />);
    fireEvent.click(screen.getByRole('button', { name: 'Export NDJSON' }));
    expect(onExportNdjson).toHaveBeenCalledOnce();
  });

  it('Replay button calls onReplay', () => {
    const onReplay = vi.fn();
    render(<TimelinePanel {...defaultProps} onReplay={onReplay} />);
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect(onReplay).toHaveBeenCalledOnce();
  });

  it('Stop button calls onStopReplay', () => {
    const onStopReplay = vi.fn();
    render(<TimelinePanel {...defaultProps} onStopReplay={onStopReplay} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStopReplay).toHaveBeenCalledOnce();
  });

  it('replay speed input calls setReplaySpeed', () => {
    const setReplaySpeed = vi.fn();
    render(<TimelinePanel {...defaultProps} setReplaySpeed={setReplaySpeed} />);
    fireEvent.change(screen.getByDisplayValue('4'), { target: { value: '8' } });
    expect(setReplaySpeed).toHaveBeenCalledWith(8);
  });

  it('clicking a row calls onToggleRow with its id', () => {
    const onToggleRow = vi.fn();
    render(<TimelinePanel {...defaultProps} filtered={[MSG('42')]} onToggleRow={onToggleRow} />);
    fireEvent.click(screen.getByRole('article'));
    expect(onToggleRow).toHaveBeenCalledWith('42');
  });

  it('renders messages in reverse chronological order (newest first)', () => {
    const msgs = [
      MSG('1', { event: 'first' }),
      MSG('2', { event: 'second' }),
      MSG('3', { event: 'third' }),
    ];
    render(<TimelinePanel {...defaultProps} filtered={msgs} />);
    const articles = screen.getAllByRole('article');
    // Reversed: third appears before first in the DOM
    expect(articles[0].textContent).toContain('third');
    expect(articles[2].textContent).toContain('first');
  });
});
