import { memo } from 'react';
import type { LinkState } from '../types';
import type { ProtocolMode } from '../lib/trace-utils';

interface ConnectionPanelProps {
  connState: LinkState;
  wsUrl: string;
  setWsUrl: (v: string) => void;
  protocolMode: ProtocolMode;
  setProtocolMode: (v: ProtocolMode) => void;
  socketIoHandshake: boolean;
  setSocketIoHandshake: (v: boolean) => void;
  socketIoPath: string;
  setSocketIoPath: (v: string) => void;
  socketIoNamespace: string;
  setSocketIoNamespace: (v: string) => void;
  socketIoAuth: string;
  setSocketIoAuth: (v: string) => void;
  demoMode: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleDemo: () => void;
}

export const ConnectionPanel = memo(function ConnectionPanel({
  connState,
  wsUrl,
  setWsUrl,
  protocolMode,
  setProtocolMode,
  socketIoHandshake,
  setSocketIoHandshake,
  socketIoPath,
  setSocketIoPath,
  socketIoNamespace,
  setSocketIoNamespace,
  socketIoAuth,
  setSocketIoAuth,
  demoMode,
  onConnect,
  onDisconnect,
  onToggleDemo,
}: ConnectionPanelProps) {
  return (
    <details open>
      <summary>
        Connection
        <span className="summary-status">
          <span className={`dot ${connState.toLowerCase()}`} />
          <span className="summary-state">{connState}</span>
        </span>
      </summary>
      <div className="section-body">
        <label>
          Endpoint
          <input
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            placeholder="ws://localhost:8080"
            disabled={demoMode}
          />
        </label>
        <label>
          Protocol Decode
          <select
            value={protocolMode}
            onChange={(e) => setProtocolMode(e.target.value as ProtocolMode)}
          >
            <option value="auto">AUTO</option>
            <option value="raw">RAW</option>
            <option value="socketio">SOCKET.IO</option>
          </select>
        </label>
        <label className="checkbox-label">
          Socket.IO Handshake
          <input
            type="checkbox"
            checked={socketIoHandshake}
            onChange={(e) => setSocketIoHandshake(e.target.checked)}
            disabled={demoMode}
          />
        </label>
        {socketIoHandshake && (
          <>
            <label>
              Socket.IO Path
              <input
                value={socketIoPath}
                onChange={(e) => setSocketIoPath(e.target.value)}
                placeholder="/socket.io"
                disabled={demoMode}
              />
            </label>
            <label>
              Socket.IO Namespace
              <input
                value={socketIoNamespace}
                onChange={(e) => setSocketIoNamespace(e.target.value)}
                placeholder="/devices"
                disabled={demoMode}
              />
            </label>
            <label>
              Socket.IO Auth JSON
              <textarea
                rows={4}
                value={socketIoAuth}
                onChange={(e) => setSocketIoAuth(e.target.value)}
                placeholder='{"serial":"dev-1","token":"secret"}'
                disabled={demoMode}
              />
            </label>
          </>
        )}
        <div className="row">
          <button
            className={connState === 'DISCONNECTED' || connState === 'ERROR' ? 'btn-primary' : ''}
            onClick={onConnect}
            disabled={demoMode || connState === 'CONNECTING' || connState === 'CONNECTED'}
          >
            Connect
          </button>
          <button
            onClick={onDisconnect}
            disabled={connState === 'DISCONNECTED' && !demoMode}
          >
            Disconnect
          </button>
          <button
            className={demoMode ? 'btn-active' : ''}
            onClick={onToggleDemo}
          >
            {demoMode ? 'Live Mode' : 'Demo'}
          </button>
        </div>
      </div>
    </details>
  );
});
