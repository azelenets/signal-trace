import { memo, useCallback, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  FormRow,
  FormSection,
  Input,
  Textarea,
  Toggle,
} from '@azelenets/aegis-design-system';
import type { LinkState, SendParams } from '../types';
import type { ProtocolMode } from '../lib/trace-utils';
import { safeJson } from '../lib/trace-utils';

interface TransmitPanelProps {
  connState: LinkState;
  protocolMode: ProtocolMode;
  onOpenSchemaBuilder: () => void;
  onSend: (params: SendParams) => void;
  onSystemLog: (event: string, payload: string) => void;
}

export const TransmitPanel = memo(function TransmitPanel({
  connState,
  protocolMode,
  onOpenSchemaBuilder,
  onSend,
  onSystemLog,
}: TransmitPanelProps) {
  const [namespace, setNamespace] = useState('/telemetry');
  const [payload, setPayload] = useState('{"requestId":"req-1001","action":"ping"}');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [socketIoEvent, setSocketIoEvent] = useState('trace');

  const handleSend = useCallback(() => {
    onSend({ payload, namespace, autoRefresh, socketIoEvent });
  }, [autoRefresh, namespace, onSend, payload, socketIoEvent]);

  const handleFormatJson = useCallback(() => {
    const parsed = safeJson(payload);
    if (!parsed) {
      onSystemLog('format_error', 'Outgoing payload is not valid JSON');
      return;
    }
    setPayload(JSON.stringify(parsed, null, 2));
  }, [onSystemLog, payload]);

  return (
    <Card variant="primary">
      <CardHeader
        title="Transmit"
        eyebrow="Outbound"
        action={(
          <Button type="button" size="sm" variant="secondary" onClick={onOpenSchemaBuilder}>
            Open Schema Builder
          </Button>
        )}
      />
      <CardBody>
        <FormSection>
          <Input
            label="Namespace"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
          />
          {protocolMode === 'socketio' && (
            <Input
              label="Socket.IO Event"
              value={socketIoEvent}
              onChange={(e) => setSocketIoEvent(e.target.value)}
              placeholder="trace"
            />
          )}
          <Toggle
            label="Auto-refresh id/timestamp"
            checked={autoRefresh}
            onChange={() => setAutoRefresh(v => !v)}
          />
          <Textarea
            label="JSON Payload"
            rows={7}
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
          />
          <FormRow cols={2}>
            <Button type="button" variant="secondary" onClick={handleFormatJson}>
              Format JSON
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSend}
              disabled={connState === 'DISCONNECTED'}
            >
              Send Frame
            </Button>
          </FormRow>
        </FormSection>
      </CardBody>
    </Card>
  );
});
