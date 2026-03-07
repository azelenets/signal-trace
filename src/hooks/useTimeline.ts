import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Metrics, TraceMessage } from '../types';

const MAX_MESSAGES = 700;
const NS_POOL = ['/telemetry', '/device', '/alerts', '/firmware', '/shadow'] as const;

const randomFrom = <T,>(input: readonly T[]): T => input[Math.floor(Math.random() * input.length)];

const download = (name: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

const normalizeImported = (input: unknown[], seq: { current: number }): TraceMessage[] => {
  const out: TraceMessage[] = [];
  for (const item of input) {
    if (typeof item !== 'object' || item === null) continue;
    const c = item as Partial<TraceMessage>;
    if (
      typeof c.ts !== 'number' ||
      typeof c.namespace !== 'string' ||
      typeof c.event !== 'string' ||
      typeof c.payload !== 'string' ||
      typeof c.bytes !== 'number'
    ) continue;
    out.push({
      id: `${c.ts}-${seq.current++}`,
      ts: c.ts,
      direction: c.direction === 'in' || c.direction === 'out' || c.direction === 'sys' ? c.direction : 'sys',
      namespace: c.namespace,
      event: c.event,
      payload: c.payload,
      bytes: c.bytes,
      latencyMs: typeof c.latencyMs === 'number' ? c.latencyMs : undefined,
      protocol: c.protocol === 'socket.io' || c.protocol === 'binary' ? c.protocol : 'raw',
      format: c.format === 'json' || c.format === 'binary' ? c.format : 'text',
    });
  }
  return out;
};

export interface UseTimelineReturn {
  messages: TraceMessage[];
  filtered: TraceMessage[];
  metrics: Metrics;
  allNamespaces: string[];
  activeNamespaces: Set<string>;
  toggleNamespace: (ns: string) => void;
  search: string;
  setSearch: (s: string) => void;
  expandedId: string | null;
  toggleRow: (id: string) => void;
  copiedId: string | null;
  copyPayload: (id: string, payload: string) => Promise<void>;
  demoMode: boolean;
  setDemoMode: React.Dispatch<React.SetStateAction<boolean>>;
  replaySpeed: number;
  setReplaySpeed: React.Dispatch<React.SetStateAction<number>>;
  replayTimeline: () => void;
  stopReplay: () => void;
  appendTrace: (msg: Omit<TraceMessage, 'id'>) => void;
  appendSystem: (event: string, payload: string) => void;
  clearTimeline: () => void;
  exportJson: () => void;
  exportNdjson: () => void;
  onImportTimeline: (file: File) => Promise<void>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function useTimeline(): UseTimelineReturn {
  const seqRef = useRef(0);
  const demoTimerRef = useRef<number | null>(null);
  const replayTimerRef = useRef<number | null>(null);
  const replayCancelRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [messages, setMessages] = useState<TraceMessage[]>([]);
  const [activeNamespaces, setActiveNamespaces] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(4);

  const appendTrace = useCallback((msg: Omit<TraceMessage, 'id'>) => {
    setMessages(prev => {
      const next: TraceMessage = { ...msg, id: `${msg.ts}-${seqRef.current++}` };
      const merged = [...prev, next];
      return merged.length <= MAX_MESSAGES ? merged : merged.slice(merged.length - MAX_MESSAGES);
    });
  }, []);

  const appendSystem = useCallback((event: string, payload: string) => {
    appendTrace({
      ts: Date.now(),
      direction: 'sys',
      namespace: 'system',
      event,
      payload,
      bytes: payload.length,
      protocol: 'raw',
      format: 'text',
    });
  }, [appendTrace]);

  const stopReplay = useCallback(() => {
    replayCancelRef.current = true;
    if (replayTimerRef.current) {
      window.clearTimeout(replayTimerRef.current);
      replayTimerRef.current = null;
    }
  }, []);

  // Demo mode: start/stop synthetic traffic
  useEffect(() => {
    if (!demoMode) {
      if (demoTimerRef.current) {
        window.clearInterval(demoTimerRef.current);
        demoTimerRef.current = null;
      }
      return;
    }

    stopReplay();
    appendTrace({
      ts: Date.now(),
      direction: 'sys',
      namespace: 'system',
      event: 'demo_mode',
      payload: 'Synthetic traffic enabled',
      bytes: 0,
      protocol: 'raw',
      format: 'text',
    });

    demoTimerRef.current = window.setInterval(() => {
      const namespace = randomFrom(NS_POOL);
      const event = randomFrom(['state', 'delta', 'heartbeat', 'fault', 'ack'] as const);
      const requestId = `req-${Math.floor(Math.random() * 4000)}`;
      const latency = 5 + Math.floor(Math.random() * 120);
      const payloadObj = {
        namespace, event, requestId,
        value: Number((Math.random() * 100).toFixed(2)),
        unit: 'ms',
      };
      const payload = JSON.stringify(payloadObj);
      appendTrace({
        ts: Date.now(),
        direction: 'in',
        namespace,
        event,
        payload,
        bytes: payload.length,
        latencyMs: latency,
        protocol: 'raw',
        format: 'json',
      });
    }, 650);

    return () => {
      if (demoTimerRef.current) {
        window.clearInterval(demoTimerRef.current);
        demoTimerRef.current = null;
      }
    };
  }, [appendTrace, demoMode, stopReplay]);

  // Cleanup on unmount
  useEffect(() => () => {
    stopReplay();
    if (demoTimerRef.current) window.clearInterval(demoTimerRef.current);
  }, [stopReplay]);

  const allNamespaces = useMemo(() => {
    const uniq = new Set<string>();
    for (const m of messages) uniq.add(m.namespace);
    return [...uniq].sort((a, b) => a.localeCompare(b));
  }, [messages]);

  // Auto-select all namespaces when first messages arrive
  useEffect(() => {
    if (activeNamespaces.size === 0 && allNamespaces.length > 0) {
      setActiveNamespaces(new Set(allNamespaces));
    }
  }, [activeNamespaces.size, allNamespaces]);

  const toggleNamespace = useCallback((ns: string) => {
    setActiveNamespaces(prev => {
      const next = new Set(prev);
      if (next.has(ns)) next.delete(ns); else next.add(ns);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return messages.filter(msg => {
      if (activeNamespaces.size > 0 && !activeNamespaces.has(msg.namespace)) return false;
      if (!query) return true;
      return (
        msg.event.toLowerCase().includes(query) ||
        msg.namespace.toLowerCase().includes(query) ||
        msg.payload.toLowerCase().includes(query)
      );
    });
  }, [activeNamespaces, messages, search]);

  const metrics = useMemo((): Metrics => {
    const inCount = filtered.filter(m => m.direction === 'in').length;
    const outCount = filtered.filter(m => m.direction === 'out').length;
    const latencies = filtered.map(m => m.latencyMs).filter((v): v is number => typeof v === 'number');
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const peakLatency = latencies.length > 0 ? Math.max(...latencies) : 0;
    return { total: filtered.length, inCount, outCount, avgLatency, peakLatency };
  }, [filtered]);

  const toggleRow = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const copyPayload = useCallback(async (id: string, payload: string) => {
    await navigator.clipboard.writeText(payload);
    setCopiedId(id);
    setTimeout(() => setCopiedId(c => c === id ? null : c), 1500);
  }, []);

  const clearTimeline = useCallback(() => {
    stopReplay();
    setMessages([]);
    setExpandedId(null);
  }, [stopReplay]);

  const exportJson = useCallback(() => {
    download('signal-trace-timeline.json', JSON.stringify(messages, null, 2), 'application/json');
    appendSystem('timeline_export', `Exported ${messages.length} entries to JSON`);
  }, [appendSystem, messages]);

  const exportNdjson = useCallback(() => {
    const lines = messages.map(m => JSON.stringify(m)).join('\n');
    download('signal-trace-timeline.ndjson', lines, 'application/x-ndjson');
    appendSystem('timeline_export', `Exported ${messages.length} entries to NDJSON`);
  }, [appendSystem, messages]);

  const onImportTimeline = useCallback(async (file: File) => {
    const text = await file.text();
    const trimmed = text.trim();
    let raw: unknown[] = [];
    if (trimmed.startsWith('[')) {
      const parsed = JSON.parse(trimmed) as unknown;
      raw = Array.isArray(parsed) ? parsed : [];
    } else {
      raw = trimmed.split('\n').map(l => l.trim()).filter(Boolean).map(l => JSON.parse(l) as unknown);
    }
    const imported = normalizeImported(raw, seqRef);
    if (imported.length === 0) {
      appendSystem('timeline_import', 'No valid entries found in import file');
      return;
    }
    stopReplay();
    setMessages(imported);
    setExpandedId(null);
    setActiveNamespaces(new Set(imported.map(m => m.namespace)));
    appendSystem('timeline_import', `Imported ${imported.length} entries`);
  }, [appendSystem, stopReplay]);

  const replayTimeline = useCallback(() => {
    if (messages.length < 2) {
      appendSystem('timeline_replay', 'Need at least 2 entries to replay');
      return;
    }
    stopReplay();
    replayCancelRef.current = false;
    const source = [...messages].sort((a, b) => a.ts - b.ts);
    const copy = source.map(m => ({ ...m, id: `${Date.now()}-${seqRef.current++}` }));
    setMessages([copy[0]]);
    let index = 1;
    const tick = () => {
      if (replayCancelRef.current || index >= copy.length) {
        appendSystem('timeline_replay', 'Replay completed');
        return;
      }
      const rawDelta = Math.max(20, source[index].ts - source[index - 1].ts);
      const delay = Math.max(20, Math.floor(rawDelta / Math.max(1, replaySpeed)));
      replayTimerRef.current = window.setTimeout(() => {
        setMessages(cur => [...cur, copy[index]]);
        index += 1;
        tick();
      }, delay);
    };
    appendSystem('timeline_replay', `Replay started at ${replaySpeed}x speed`);
    tick();
  }, [appendSystem, messages, replaySpeed, stopReplay]);

  return {
    messages,
    filtered,
    metrics,
    allNamespaces,
    activeNamespaces,
    toggleNamespace,
    search,
    setSearch,
    expandedId,
    toggleRow,
    copiedId,
    copyPayload,
    demoMode,
    setDemoMode,
    replaySpeed,
    setReplaySpeed,
    replayTimeline,
    stopReplay,
    appendTrace,
    appendSystem,
    clearTimeline,
    exportJson,
    exportNdjson,
    onImportTimeline,
    fileInputRef,
  };
}
