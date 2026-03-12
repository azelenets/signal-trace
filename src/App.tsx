import { useCallback } from 'react';
import {
  Accordion,
  Badge,
  Container,
  Grid,
  GridItem,
  Navbar,
  ThemeProvider,
  ThemeToggle,
} from '@azelenets/aegis-design-system';
import {
  extractCorrelationId,
  safeJson,
  validateAgainstSchema,
} from './lib/trace-utils';
import { normalizeSocketIoNamespace } from './lib/socketio-utils';
import type { SendParams } from './types';
import { useTimeline } from './hooks/useTimeline';
import { useConnection } from './hooks/useConnection';
import { useSchemaGuard } from './hooks/useSchemaGuard';
import { ConnectionPanel } from './components/ConnectionPanel';
import { TransmitPanel } from './components/TransmitPanel';
import { SchemaGuardModal } from './components/SchemaGuardModal';
import { TimelinePanel } from './components/TimelinePanel';

const textEncoder = new TextEncoder();

const generateMessageId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `trace-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const App = () => {
  const timeline = useTimeline();

  const connection = useConnection({
    appendTrace: timeline.appendTrace,
    appendSystem: timeline.appendSystem,
    demoMode: timeline.demoMode,
  });

  const schema = useSchemaGuard();

  const handleConnect = useCallback(() => {
    timeline.stopReplay();
    connection.connect();
  }, [connection, timeline]);

  const handleDisconnect = useCallback(() => {
    timeline.stopReplay();
    timeline.setDemoMode(false);
    connection.disconnect();
  }, [connection, timeline]);

  const handleToggleDemo = useCallback(() => {
    timeline.setDemoMode(v => !v);
  }, [timeline]);

  const handleClear = useCallback(() => {
    timeline.clearTimeline();
    connection.clearPending();
  }, [connection, timeline]);

  const handleSend = useCallback((params: SendParams) => {
    if (!params.payload.trim()) return;

    if (
      connection.socketIoHandshake &&
      connection.protocolMode === 'socketio' &&
      !connection.socketIoReadyRef.current
    ) {
      timeline.appendSystem('socketio_not_ready', 'Socket.IO namespace is not connected yet');
      return;
    }

    const now = Date.now();
    const parsedPayload = safeJson(params.payload);
    const enrichedPayload =
      params.autoRefresh && parsedPayload
        ? {
          ...parsedPayload,
          ...(Object.hasOwn(parsedPayload, 'id') ? { id: generateMessageId() } : {}),
          ...(Object.hasOwn(parsedPayload, 'timestamp') ? { timestamp: now } : {}),
        }
        : parsedPayload;

    if (schema.parsedSchema.parseError) {
      timeline.appendSystem('schema_error', schema.parsedSchema.parseError);
      return;
    }

    if (enrichedPayload && schema.parsedSchema.schema) {
      const errors = validateAgainstSchema(schema.parsedSchema.schema, enrichedPayload);
      if (errors.length > 0) {
        timeline.appendSystem('schema_violation', errors.join(' | '));
        return;
      }
    }

    let wire = enrichedPayload ? JSON.stringify(enrichedPayload) : params.payload;
    let requestId = extractCorrelationId(enrichedPayload);

    if (!requestId) {
      requestId = `trace-${now}`;
      const nextPayload = enrichedPayload
        ? { ...enrichedPayload, requestId, namespace: params.namespace }
        : { requestId, namespace: params.namespace, raw: params.payload };
      wire = JSON.stringify(nextPayload);
    }

    connection.trackOutgoing(requestId, now);

    let eventType = 'send';
    let protocol: 'raw' | 'socket.io' = 'raw';

    if (connection.protocolMode === 'socketio') {
      eventType = 'socket_emit';
      protocol = 'socket.io';
      const packetNs = connection.socketIoHandshake
        ? normalizeSocketIoNamespace(connection.socketIoNamespace)
        : params.namespace;
      const eventName = params.socketIoEvent.trim() || 'trace';
      wire = `42${packetNs},[${JSON.stringify(eventName)},${wire}]`;
    }

    timeline.appendTrace({
      ts: now,
      direction: 'out',
      namespace: params.namespace,
      event: eventType,
      payload: wire,
      bytes: textEncoder.encode(wire).length,
      protocol,
      format: enrichedPayload ? 'json' : 'text',
    });

    connection.sendRaw(wire);
  }, [connection, schema.parsedSchema, timeline]);

  return (
    <ThemeProvider defaultTheme="dark">
      <div className="bg-grid"/>
      <Container size="full" className="shell">
        <Navbar
          className="app-navbar pb-4 pt-5"
          brand={(
            <div className="app-brand">
              <span className="app-brand__eyebrow">BlossomGrid Solutions</span>
              <span className="app-brand__title">SIGNAL // TRACE</span>
            </div>
          )}
          actions={(
            <div className="app-navbar__actions">
              <Badge label={connection.connState}
                     variant={connection.connState === 'CONNECTED' ? 'success' : connection.connState === 'ERROR' ? 'alert' : connection.connState === 'CONNECTING' ? 'hazard' : 'ghost'}
                     dot/>
              <ThemeToggle variant="button"/>
            </div>
          )}
        />

        <Grid cols={1} colsLg={12} gap={4} className="layout">
          <GridItem span={12} spanLg={4} className="controls">
            <Accordion
              multiple
              defaultOpen={['connection', 'transmit']}
              items={[
                {
                  id: 'connection',
                  trigger: 'Connection',
                  content: (
                    <ConnectionPanel
                      connState={connection.connState}
                      wsUrl={connection.wsUrl}
                      setWsUrl={connection.setWsUrl}
                      protocolMode={connection.protocolMode}
                      setProtocolMode={connection.setProtocolMode}
                      socketIoHandshake={connection.socketIoHandshake}
                      setSocketIoHandshake={connection.setSocketIoHandshake}
                      socketIoPath={connection.socketIoPath}
                      setSocketIoPath={connection.setSocketIoPath}
                      socketIoNamespace={connection.socketIoNamespace}
                      setSocketIoNamespace={connection.setSocketIoNamespace}
                      socketIoAuth={connection.socketIoAuth}
                      setSocketIoAuth={connection.setSocketIoAuth}
                      demoMode={timeline.demoMode}
                      onConnect={handleConnect}
                      onDisconnect={handleDisconnect}
                      onToggleDemo={handleToggleDemo}
                    />
                  ),
                },
                {
                  id: 'transmit',
                  trigger: 'Transmit',
                  content: (
                    <TransmitPanel
                      connState={connection.connState}
                      protocolMode={connection.protocolMode}
                      onOpenSchemaBuilder={() => schema.setSchemaModalOpen(true)}
                      onSend={handleSend}
                      onSystemLog={timeline.appendSystem}
                    />
                  ),
                },
              ]}
            />
          </GridItem>

          <GridItem span={12} spanLg={8}>
            <TimelinePanel
              allNamespaces={timeline.allNamespaces}
              activeNamespaces={timeline.activeNamespaces}
              filtered={timeline.filtered}
              metrics={timeline.metrics}
              search={timeline.search}
              setSearch={timeline.setSearch}
              expandedId={timeline.expandedId}
              copiedId={timeline.copiedId}
              replaySpeed={timeline.replaySpeed}
              setReplaySpeed={timeline.setReplaySpeed}
              fileInputRef={timeline.fileInputRef}
              onToggleRow={timeline.toggleRow}
              onCopyPayload={timeline.copyPayload}
              onClear={handleClear}
              onExportJson={timeline.exportJson}
              onExportNdjson={timeline.exportNdjson}
              onImport={timeline.onImportTimeline}
              onReplay={timeline.replayTimeline}
              onStopReplay={timeline.stopReplay}
              onToggleNamespace={timeline.toggleNamespace}
            />
          </GridItem>
        </Grid>
      </Container>

      {schema.schemaModalOpen && (
        <SchemaGuardModal
          schemaProperties={schema.schemaProperties}
          onClose={() => schema.setSchemaModalOpen(false)}
          onAdd={schema.addSchemaProperty}
          onRemove={schema.removeSchemaProperty}
          onUpdateField={schema.updateSchemaPropertyField}
          onUpdateType={schema.updateSchemaPropertyType}
          onUpdateRequired={schema.updateSchemaPropertyRequired}
        />
      )}
    </ThemeProvider>
  );
};

export default App;
