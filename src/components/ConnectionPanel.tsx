import { memo } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  FormRow,
  FormSection,
  Input,
  Select,
  Textarea,
  Toggle,
} from '@azelenets/aegis-design-system';
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
  const statusVariant = (() => {
    switch (connState) {
      case 'CONNECTED':
        return 'success';
      case 'CONNECTING':
        return 'hazard';
      case 'ERROR':
        return 'alert';
      default:
        return 'ghost';
    }
  })();

  return (
    <Card variant="default">
      <CardHeader
        title="Connection"
        eyebrow="Transport"
        action={<Badge label={connState} variant={statusVariant} dot />}
      />
      <CardBody>
        <FormSection description="Configure the live endpoint and protocol framing.">
          <Input
            label="Endpoint"
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            placeholder="ws://localhost:8080"
            disabled={demoMode}
            icon="link"
          />
          <Select
            label="Protocol Decode"
            value={protocolMode}
            onChange={(value) => setProtocolMode(value as ProtocolMode)}
            options={[
              { value: 'auto', label: 'AUTO' },
              { value: 'raw', label: 'RAW' },
              { value: 'socketio', label: 'SOCKET.IO' },
            ]}
          />
          <Toggle
            label="Socket.IO Handshake"
            checked={socketIoHandshake}
            onChange={(e) => setSocketIoHandshake(e.target.checked)}
            disabled={demoMode}
          />
          {socketIoHandshake && (
            <>
              <Input
                label="Socket.IO Path"
                value={socketIoPath}
                onChange={(e) => setSocketIoPath(e.target.value)}
                placeholder="/socket.io"
                disabled={demoMode}
              />
              <Input
                label="Socket.IO Namespace"
                value={socketIoNamespace}
                onChange={(e) => setSocketIoNamespace(e.target.value)}
                placeholder="/devices"
                disabled={demoMode}
              />
              <Textarea
                label="Socket.IO Auth JSON"
                rows={4}
                value={socketIoAuth}
                onChange={(e) => setSocketIoAuth(e.target.value)}
                placeholder='{"serial":"dev-1","token":"secret"}'
                disabled={demoMode}
              />
            </>
          )}
          <FormRow cols={3}>
            <Button
              type="button"
              variant="primary"
              onClick={onConnect}
              disabled={demoMode || connState === 'CONNECTING' || connState === 'CONNECTED'}
            >
              Connect
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onDisconnect}
              disabled={connState === 'DISCONNECTED' && !demoMode}
            >
              Disconnect
            </Button>
            <Button
              type="button"
              variant={demoMode ? 'primary' : 'ghost'}
              onClick={onToggleDemo}
            >
              {demoMode ? 'Live Mode' : 'Demo'}
            </Button>
          </FormRow>
        </FormSection>
      </CardBody>
    </Card>
  );
});
