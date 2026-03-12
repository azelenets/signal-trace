import { memo, type RefObject } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  HStack,
  Input,
  SearchInput,
  Tag,
} from '@azelenets/aegis-design-system';
import type { Metrics, TraceMessage } from '../types';
import { MessageRow } from './MessageRow';
import { NamespaceFilter } from './NamespaceFilter';

interface TimelinePanelProps {
  allNamespaces: string[];
  activeNamespaces: Set<string>;
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
  onToggleNamespace: (ns: string) => void;
}

export const TimelinePanel = memo(function TimelinePanel({
  allNamespaces,
  activeNamespaces,
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
  onToggleNamespace,
}: TimelinePanelProps) {
  const reversed = [...filtered].reverse();

  return (
    <Card variant="default" className="timeline-card">
      <CardHeader
        title="Message Timeline"
        eyebrow="Observability"
        action={
          <HStack className="metrics-bar" gap={2}>
            <Tag label={`Total ${metrics.total}`} variant="ghost" />
            <Tag label={`IN ${metrics.inCount}`} variant="success" />
            <Tag label={`OUT ${metrics.outCount}`} variant="hazard" />
            <Tag label={`AVG RTT ${metrics.avgLatency.toFixed(1)}ms`} variant="ghost" />
            <Tag label={`PEAK RTT ${metrics.peakLatency.toFixed(1)}ms`} variant="ghost" />
          </HStack>
        }
      />
      <CardBody className="timeline">
        <div className="timeline-head">
          <NamespaceFilter
            allNamespaces={allNamespaces}
            activeNamespaces={activeNamespaces}
            onToggle={onToggleNamespace}
          />
          <SearchInput
            label="Search traffic"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search event, namespace, payload"
            onClear={() => setSearch('')}
          />
        </div>

        <div className="replay-control">
          <Input
            label="Replay Speed (x)"
            type="number"
            min={1}
            max={20}
            value={String(replaySpeed)}
            onChange={(e) => setReplaySpeed(Math.max(1, Number(e.target.value) || 1))}
          />
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
            <Card variant="default" className="empty-state">
              <CardBody>
                <p className="empty-title">No traffic</p>
                <p className="empty-sub">
                  Connect to a WebSocket endpoint or enable Demo Mode to see messages.
                </p>
              </CardBody>
            </Card>
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

        <div className="timeline-actions">
          <Button type="button" variant="ghost" onClick={onClear}>Clear</Button>
          <Button type="button" variant="secondary" onClick={onExportJson}>Export JSON</Button>
          <Button type="button" variant="secondary" onClick={onExportNdjson}>Export NDJSON</Button>
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>Import</Button>
          <Button type="button" variant="primary" onClick={onReplay}>Replay</Button>
          <Button type="button" variant="danger" onClick={onStopReplay}>Stop</Button>
        </div>
      </CardBody>
    </Card>
  );
});
