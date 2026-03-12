import { memo } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  HStack,
  Tag,
} from '@azelenets/aegis-design-system';
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
  const directionVariant = msg.direction === 'in'
    ? 'success'
    : msg.direction === 'out'
      ? 'hazard'
      : 'primary';

  return (
    <article
      className={`row-item ${msg.direction}${isExpanded ? ' expanded' : ''}`}
      onClick={() => onToggle(msg.id)}
    >
      <Card variant="default" hoverable className="message-card">
        <CardBody>
          <div className="row-main">
        <div className="stamp">{fmtTime(msg.ts)}</div>
        <div className="meta">
          <strong>{msg.namespace}</strong>
          <span>{msg.event}</span>
        </div>
        <div className="payload" title={msg.payload}>{payloadPreview}</div>
        <div className="overlay">
          <Badge
            label={msg.direction.toUpperCase()}
            variant={directionVariant}
            className={`dir-badge dir-${msg.direction}`}
          />
          <Tag label={`${msg.bytes}B`} variant="ghost" />
          <Tag label={msg.protocol} variant="ghost" />
          {msg.latencyMs !== undefined ? (
            <Tag label={`RTT ${msg.latencyMs}ms`} variant="hazard" className="latency" />
          ) : (
            <Tag label={`+${deltaMs}ms`} variant="ghost" />
          )}
        </div>
          </div>
          {isExpanded && (
            <div className="row-expand" onClick={(e) => e.stopPropagation()}>
              <HStack className="copy-row" align="center">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onCopy(msg.id, msg.payload)}
                >
                  {copiedId === msg.id ? 'Copied!' : 'Copy'}
                </Button>
              </HStack>
              <pre className="payload-full">{prettyPayload(msg.payload)}</pre>
            </div>
          )}
        </CardBody>
      </Card>
    </article>
  );
});
