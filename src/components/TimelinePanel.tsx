import { memo, type RefObject } from 'react';
import type { Metrics, TraceMessage } from '../types';
import { MessageRow } from './MessageRow';

interface TimelinePanelProps {
  filtered: TraceMessage[];
  metrics: Metrics;
  search: string;
  setSearch: (s: string) => void;
  expandedId: string | null;
  copiedId: string | null;
  replaySpeed: number;
  setReplaySpeed: (v: number) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onToggleRow: (id: string) => void;
  onCopyPayload: (id: string, payload: string) => void;
  onClear: () => void;
  onExportJson: () => void;
  onExportNdjson: () => void;
  onImport: (file: File) => void;
  onReplay: () => void;
  onStopReplay: () => void;
}

export const TimelinePanel = memo(function TimelinePanel({
  filtered,
  metrics,
  search,
  setSearch,
  expandedId,
  copiedId,
  replaySpeed,
  setReplaySpeed,
  fileInputRef,
  onToggleRow,
  onCopyPayload,
  onClear,
  onExportJson,
  onExportNdjson,
  onImport,
  onReplay,
  onStopReplay,
}: TimelinePanelProps) {
  const reversed = [...filtered].reverse();

  return (
    <section className="hud panel timeline">
      <div className="timeline-head">
        <h2>Message Timeline</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search event, namespace, payload"
        />
      </div>

      <div className="replay-control">
        <label>
          Replay Speed (x)
          <input
            type="number"
            min={1}
            max={20}
            value={replaySpeed}
            onChange={(e) => setReplaySpeed(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json,.ndjson,application/x-ndjson"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onImport(file);
            e.currentTarget.value = '';
          }}
        />
      </div>

      <div className="rows">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <p className="empty-title">No traffic</p>
            <p className="empty-sub">
              Connect to a WebSocket endpoint or enable Demo Mode to see messages.
            </p>
          </div>
        ) : (
          reversed.map((msg, idx) => {
            const prev = filtered.at(filtered.length - idx);
            const deltaMs = prev ? msg.ts - prev.ts : 0;
            return (
              <MessageRow
                key={msg.id}
                msg={msg}
                deltaMs={deltaMs}
                isExpanded={expandedId === msg.id}
                copiedId={copiedId}
                onToggle={onToggleRow}
                onCopy={onCopyPayload}
              />
            );
          })
        )}
      </div>

      <div className="timeline-footer">
        <div className="metrics-bar">
          <span>Total <strong>{metrics.total}</strong></span>
          <span>IN <strong>{metrics.inCount}</strong></span>
          <span>OUT <strong>{metrics.outCount}</strong></span>
          <span>AVG RTT <strong>{metrics.avgLatency.toFixed(1)}ms</strong></span>
          <span>PEAK RTT <strong>{metrics.peakLatency.toFixed(1)}ms</strong></span>
        </div>
        <div className="timeline-actions">
          <button onClick={onClear}>Clear</button>
          <button onClick={onExportJson}>Export JSON</button>
          <button onClick={onExportNdjson}>Export NDJSON</button>
          <button onClick={() => fileInputRef.current?.click()}>Import</button>
          <button onClick={onReplay}>Replay</button>
          <button onClick={onStopReplay}>Stop</button>
        </div>
      </div>
    </section>
  );
});
