import { memo, useCallback, useState } from 'react';
import type { SendParams } from '../types';
import type { ProtocolMode } from '../lib/trace-utils';
import { safeJson } from '../lib/trace-utils';

interface TransmitPanelProps {
  protocolMode: ProtocolMode;
  onSend: (params: SendParams) => void;
  onSystemLog: (event: string, payload: string) => void;
}

export const TransmitPanel = memo(function TransmitPanel({
  protocolMode,
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
    <details open>
      <summary>Transmit</summary>
      <div className="section-body">
        <label>
          Namespace
          <input value={namespace} onChange={(e) => setNamespace(e.target.value)} />
        </label>
        {protocolMode === 'socketio' && (
          <label>
            Socket.IO Event
            <input
              value={socketIoEvent}
              onChange={(e) => setSocketIoEvent(e.target.value)}
              placeholder="trace"
            />
          </label>
        )}
        <button
          className={autoRefresh ? 'btn-active' : ''}
          onClick={() => setAutoRefresh(v => !v)}
        >
          Auto-refresh id/timestamp
        </button>
        <label>
          JSON Payload
          <textarea
            rows={5}
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
          />
        </label>
        <div className="row">
          <button onClick={handleFormatJson}>Format JSON</button>
          <button className="btn-primary" onClick={handleSend}>Send Frame</button>
        </div>
      </div>
    </details>
  );
});
