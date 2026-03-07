import { memo } from 'react';
import type { TraceMessage } from '../types';
import { safeJson } from '../lib/trace-utils';

const fmtTime = (ts: number) =>
  new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(new Date(ts));

const prettyPayload = (payload: string): string => {
  const parsed = safeJson(payload);
  return parsed ? JSON.stringify(parsed, null, 2) : payload;
};

interface MessageRowProps {
  msg: TraceMessage;
  deltaMs: number;
  isExpanded: boolean;
  copiedId: string | null;
  onToggle: (id: string) => void;
  onCopy: (id: string, payload: string) => void;
}

export const MessageRow = memo(function MessageRow({
  msg,
  deltaMs,
  isExpanded,
  copiedId,
  onToggle,
  onCopy,
}: MessageRowProps) {
  const payloadPreview =
    msg.payload.length > 190 ? `${msg.payload.slice(0, 190)}...` : msg.payload;

  return (
    <article
      className={`row-item ${msg.direction}${isExpanded ? ' expanded' : ''}`}
      onClick={() => onToggle(msg.id)}
    >
      <div className="row-main">
        <div className="stamp">{fmtTime(msg.ts)}</div>
        <div className="meta">
          <strong>{msg.namespace}</strong>
          <span>{msg.event}</span>
        </div>
        <div className="payload" title={msg.payload}>{payloadPreview}</div>
        <div className="overlay">
          <span className={`dir-badge dir-${msg.direction}`}>{msg.direction.toUpperCase()}</span>
          <span>{msg.bytes}B</span>
          <span>{msg.protocol}</span>
          {msg.latencyMs !== undefined ? (
            <span className="latency">RTT {msg.latencyMs}ms</span>
          ) : (
            <span>+{deltaMs}ms</span>
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="row-expand" onClick={(e) => e.stopPropagation()}>
          <button
            className="copy-btn"
            onClick={() => onCopy(msg.id, msg.payload)}
          >
            {copiedId === msg.id ? 'Copied!' : 'Copy'}
          </button>
          <pre className="payload-full">{prettyPayload(msg.payload)}</pre>
        </div>
      )}
    </article>
  );
});
