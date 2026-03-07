import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimeline } from '../src/hooks/useTimeline';

const BASE_MSG = {
  ts: 1000,
  direction: 'in' as const,
  namespace: '/test',
  event: 'ping',
  payload: '{"ok":true}',
  bytes: 11,
  protocol: 'raw' as const,
  format: 'json' as const,
};

describe('useTimeline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts with empty messages', () => {
    const { result } = renderHook(() => useTimeline());
    expect(result.current.messages).toHaveLength(0);
  });

  it('appendTrace adds a message with auto-assigned id', () => {
    const { result } = renderHook(() => useTimeline());
    act(() => { result.current.appendTrace(BASE_MSG); });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].namespace).toBe('/test');
    expect(result.current.messages[0].id).toMatch(/^1000-/);
  });

  it('caps messages at MAX_MESSAGES (700)', () => {
    const { result } = renderHook(() => useTimeline());
    act(() => {
      for (let i = 0; i < 750; i++) {
        result.current.appendTrace({ ...BASE_MSG, ts: i });
      }
    });
    expect(result.current.messages).toHaveLength(700);
    // Oldest messages dropped: first remaining ts should be 50
    expect(result.current.messages[0].ts).toBe(50);
  });

  it('derives allNamespaces sorted from messages', () => {
    const { result } = renderHook(() => useTimeline());
    act(() => {
      result.current.appendTrace({ ...BASE_MSG, namespace: '/z' });
      result.current.appendTrace({ ...BASE_MSG, namespace: '/a' });
      result.current.appendTrace({ ...BASE_MSG, namespace: '/m' });
    });
    expect(result.current.allNamespaces).toEqual(['/a', '/m', '/z']);
  });

  it('auto-selects all namespaces when first messages arrive', () => {
    const { result } = renderHook(() => useTimeline());
    expect(result.current.activeNamespaces.size).toBe(0);
    act(() => {
      result.current.appendTrace({ ...BASE_MSG, namespace: '/a' });
      result.current.appendTrace({ ...BASE_MSG, namespace: '/b' });
    });
    expect(result.current.activeNamespaces.has('/a')).toBe(true);
    expect(result.current.activeNamespaces.has('/b')).toBe(true);
  });

  it('toggleNamespace adds and removes a namespace', () => {
    const { result } = renderHook(() => useTimeline());
    // Add two namespaces so toggling one doesn't make activeNamespaces empty
    // (which would re-trigger auto-select of all)
    act(() => {
      result.current.appendTrace({ ...BASE_MSG, namespace: '/test' });
      result.current.appendTrace({ ...BASE_MSG, namespace: '/other' });
    });
    act(() => { result.current.toggleNamespace('/test'); });
    expect(result.current.activeNamespaces.has('/test')).toBe(false);
    act(() => { result.current.toggleNamespace('/test'); });
    expect(result.current.activeNamespaces.has('/test')).toBe(true);
  });

  it('filtered excludes messages from inactive namespaces', () => {
    const { result } = renderHook(() => useTimeline());
    act(() => {
      result.current.appendTrace({ ...BASE_MSG, namespace: '/a' });
      result.current.appendTrace({ ...BASE_MSG, namespace: '/b' });
    });
    act(() => { result.current.toggleNamespace('/b'); });
    expect(result.current.filtered.every(m => m.namespace === '/a')).toBe(true);
  });

  it('filtered applies search against event, namespace, payload', () => {
    const { result } = renderHook(() => useTimeline());
    act(() => {
      result.current.appendTrace({ ...BASE_MSG, event: 'heartbeat', namespace: '/alpha' });
      result.current.appendTrace({ ...BASE_MSG, event: 'fault', namespace: '/beta' });
    });
    act(() => { result.current.setSearch('heart'); });
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].event).toBe('heartbeat');
  });

  it('metrics reflect filtered messages', () => {
    const { result } = renderHook(() => useTimeline());
    act(() => {
      result.current.appendTrace({ ...BASE_MSG, direction: 'in', latencyMs: 10 });
      result.current.appendTrace({ ...BASE_MSG, direction: 'out', latencyMs: 30 });
      result.current.appendTrace({ ...BASE_MSG, direction: 'sys' });
    });
    const { metrics } = result.current;
    expect(metrics.total).toBe(3);
    expect(metrics.inCount).toBe(1);
    expect(metrics.outCount).toBe(1);
    expect(metrics.avgLatency).toBe(20);
    expect(metrics.peakLatency).toBe(30);
  });

  it('clearTimeline resets messages and expandedId', () => {
    const { result } = renderHook(() => useTimeline());
    act(() => { result.current.appendTrace(BASE_MSG); });
    act(() => { result.current.toggleRow(result.current.messages[0].id); });
    expect(result.current.expandedId).not.toBeNull();
    act(() => { result.current.clearTimeline(); });
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.expandedId).toBeNull();
  });

  it('toggleRow expands a row and collapses it on second click', () => {
    const { result } = renderHook(() => useTimeline());
    act(() => { result.current.appendTrace(BASE_MSG); });
    const id = result.current.messages[0].id;
    act(() => { result.current.toggleRow(id); });
    expect(result.current.expandedId).toBe(id);
    act(() => { result.current.toggleRow(id); });
    expect(result.current.expandedId).toBeNull();
  });

  it('copyPayload writes to clipboard and sets copiedId', async () => {
    const { result } = renderHook(() => useTimeline());
    act(() => { result.current.appendTrace(BASE_MSG); });
    const id = result.current.messages[0].id;
    await act(async () => {
      await result.current.copyPayload(id, '{"ok":true}');
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('{"ok":true}');
    expect(result.current.copiedId).toBe(id);
    act(() => { vi.advanceTimersByTime(1600); });
    expect(result.current.copiedId).toBeNull();
  });

  it('exportJson triggers URL.createObjectURL', () => {
    const { result } = renderHook(() => useTimeline());
    act(() => { result.current.appendTrace(BASE_MSG); });
    act(() => { result.current.exportJson(); });
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it('exportNdjson triggers URL.createObjectURL', () => {
    const { result } = renderHook(() => useTimeline());
    act(() => { result.current.appendTrace(BASE_MSG); });
    act(() => { result.current.exportNdjson(); });
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });

  it('onImportTimeline loads JSON array and replaces messages', async () => {
    const { result } = renderHook(() => useTimeline());
    const data = JSON.stringify([
      { ts: 2000, direction: 'in', namespace: '/imported', event: 'data', payload: '{}', bytes: 2 },
    ]);
    const file = new File([data], 'test.json', { type: 'application/json' });
    await act(async () => { await result.current.onImportTimeline(file); });
    expect(result.current.messages.some(m => m.namespace === '/imported')).toBe(true);
  });

  it('onImportTimeline loads NDJSON format', async () => {
    const { result } = renderHook(() => useTimeline());
    const line = JSON.stringify({ ts: 3000, direction: 'out', namespace: '/nd', event: 'ev', payload: 'p', bytes: 1 });
    const file = new File([line], 'test.ndjson', { type: 'application/x-ndjson' });
    await act(async () => { await result.current.onImportTimeline(file); });
    expect(result.current.messages.some(m => m.namespace === '/nd')).toBe(true);
  });

  it('onImportTimeline logs error if no valid entries', async () => {
    const { result } = renderHook(() => useTimeline());
    const file = new File(['[{"garbage":true}]'], 'bad.json', { type: 'application/json' });
    await act(async () => { await result.current.onImportTimeline(file); });
    // appendSystem adds a timeline_import message with the error text
    const sysMsg = result.current.messages.find(m => m.event === 'timeline_import');
    expect(sysMsg?.payload).toContain('No valid entries');
  });

  it('replayTimeline logs error when fewer than 2 messages', () => {
    const { result } = renderHook(() => useTimeline());
    act(() => { result.current.appendTrace(BASE_MSG); });
    act(() => { result.current.replayTimeline(); });
    const sysMsg = result.current.messages.find(m => m.event === 'timeline_replay');
    expect(sysMsg?.payload).toContain('at least 2');
  });

  it('demo mode generates synthetic messages via interval', () => {
    const { result } = renderHook(() => useTimeline());
    act(() => { result.current.setDemoMode(true); });
    act(() => { vi.advanceTimersByTime(650 * 3); });
    // 1 demo_mode sys message + 3 interval messages
    expect(result.current.messages.length).toBeGreaterThanOrEqual(3);
    act(() => { result.current.setDemoMode(false); });
  });
});
