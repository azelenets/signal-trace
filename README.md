![SignalTrace](./banner.svg)

# Signal Trace

Signal Trace is a browser-based WebSocket traffic inspector for real-time IoT debugging. It helps you connect to raw WebSocket or Socket.IO endpoints, inspect inbound and outbound frames, validate outgoing JSON against a lightweight schema, and replay or export captured traffic.

## Tech Stack

- React 19
- TypeScript
- Vite
- Vitest
- Aegis Design System

## Features

- Live connect and disconnect workflow for WebSocket endpoints
- Protocol decode modes: `auto`, `raw`, and `socketio`
- Socket.IO handshake support with configurable path, namespace, auth JSON, and event name
- Timeline inspection with direction, namespace, event, payload, byte size, and latency
- Search and namespace filtering for narrowing noisy traffic
- Outbound payload helpers for JSON formatting and auto-refreshing `id` / `timestamp`
- Schema Guard modal for validating outgoing JSON before send
- Timeline import and export in `JSON` and `NDJSON`
- Replay controls with adjustable playback speed
- Demo mode for synthetic traffic generation without a backend
- Theme toggle in the app shell

## Requirements

- Node.js 20+
- npm 10+

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open the local URL printed by Vite, usually `http://localhost:5173`.

## Scripts

- `npm run dev` - start the Vite dev server
- `npm run typecheck` - run the TypeScript project build without bundling
- `npm run build` - run type-checking and build production assets
- `npm run preview` - preview the production build locally
- `npm run lint` - run ESLint
- `npm run lint:fix` - run ESLint with fixes
- `npm run test` - run Vitest in watch mode
- `npm run test:run` - run the full test suite once

## Basic Usage

1. Enter a WebSocket endpoint such as `ws://localhost:8080`.
2. Choose a protocol decode mode. Start with `auto` unless you know the framing.
3. Click `Connect`.
4. Inspect incoming and outgoing traffic in the timeline.
5. Use search and namespace filters to isolate the frames you care about.
6. Open `Schema Builder` if you want to validate outgoing JSON before sending.
7. Use replay, import, and export controls from the timeline toolbar as needed.

## Sending Frames

- The transmit panel defaults to the `/telemetry` namespace and a JSON payload.
- `Format JSON` prettifies valid JSON and emits a system event if the payload is invalid.
- `Auto-refresh id/timestamp` updates those fields before send when they already exist in the payload.
- If no correlation id is present, Signal Trace injects a `requestId` automatically before sending.

## Socket.IO Handshake

If your backend uses Socket.IO namespaces or auth:

- Enable `Socket.IO Handshake`.
- Set `Socket.IO Path`, typically `/socket.io`.
- Set `Socket.IO Namespace`, for example `/devices`.
- Provide `Socket.IO Auth JSON` when your server expects auth in the namespace connect payload.
- Switch protocol mode to `socketio` for outbound event frames.
- Optionally set `Socket.IO Event`; the default event name is `trace`.
- Signal Trace waits for namespace readiness before allowing Socket.IO sends.
- Engine.IO ping frames (`2`) are answered automatically with pong (`3`).

## Schema Guard

- Open the schema builder from the transmit panel.
- Add fields with type `string`, `number`, `boolean`, `object`, or `array`.
- Mark fields as required when needed.
- Leave the schema empty to disable validation.
- Schema parse or validation failures are written to the system timeline instead of being swallowed.

## Timeline Import, Export, and Replay

- Export captured traffic as formatted `JSON` or line-delimited `NDJSON`.
- Import previously captured files in either format.
- Invalid or empty imports produce a system event instead of silently failing.
- Replay replays imported or captured messages in timestamp order with adjustable speed.
- Demo mode stops replay before starting synthetic traffic.

## Testing

Signal Trace uses Vitest with Testing Library and `@testing-library/jest-dom`.

Run the full test suite once:

```bash
npm run test:run
```

Run tests in watch mode:

```bash
npm run test
```

Coverage is organized around the current source layout:

- `src/lib/*.test.ts` for pure utility helpers
- `src/hooks/*.test.ts` for hook behavior via `renderHook`
- `src/components/*.test.tsx` for component rendering and user flows
- `src/App.test.tsx` for integration coverage across hooks and UI

## Project Structure

```text
src/
  App.tsx                   # Thin orchestrator for hooks and top-level actions
  App.test.tsx              # Integration tests
  types.ts                  # Shared domain types
  main.tsx
  styles.css
  hooks/
    useTimeline.ts          # Timeline state, demo mode, replay, import/export
    useTimeline.test.ts
    useConnection.ts        # WebSocket lifecycle, Socket.IO handshake, RTT tracking
    useConnection.test.ts
    useSchemaGuard.ts       # Schema builder state and parsed schema
    useSchemaGuard.test.ts
  components/
    ConnectionPanel.tsx
    ConnectionPanel.test.tsx
    MessageRow.tsx
    MessageRow.test.tsx
    NamespaceFilter.tsx
    NamespaceFilter.test.tsx
    SchemaGuardModal.tsx
    SchemaGuardModal.test.tsx
    TimelinePanel.tsx
    TimelinePanel.test.tsx
    TransmitPanel.tsx
    TransmitPanel.test.tsx
  lib/
    socketio-utils.ts
    socketio-utils.test.ts
    trace-utils.ts
    trace-utils.test.ts
vitest.setup.ts
vite.config.ts
package.json
AGENTS.md
```

## Verification

- Type check: `npm run typecheck`
- Build check: `npm run build`
- Test check: `npm run test:run`

## Notes

- Use Demo mode when the target endpoint is unavailable and you still want to exercise the UI.
- Imported traffic and incoming frames are treated as untrusted input and normalized before use.
