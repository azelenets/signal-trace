![SignalTrace](./banner.svg)

# Signal Trace

Signal Trace is a browser-based WebSocket traffic inspector for real-time IoT debugging.
It helps you connect to a WebSocket endpoint, inspect inbound/outbound messages, validate payloads against a simple schema, and replay/export traffic timelines.

## Tech Stack
- React 19
- TypeScript
- Vite

## Features
- Live WebSocket connect/disconnect workflow
- Protocol decode modes (`auto`, `raw`, `socket.io`)
- Traffic timeline with direction, namespace, event, payload, bytes, and latency
- Search (in timeline header) and namespace filtering
- Visual Schema Guard constructor (modal) for outgoing payload validation
- Timeline import/export (`JSON` and `NDJSON`)
- Timeline replay with speed controls
- Demo mode for local experimentation

## Requirements
- Node.js 20+ (recommended current LTS)
- npm 10+

## Getting Started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start development server:
   ```bash
   npm run dev
   ```
3. Open the local URL shown in terminal (typically `http://localhost:5173`).

## Available Scripts
- `npm run dev` - Start Vite dev server
- `npm run build` - Type-check and build production assets
- `npm run preview` - Preview the production build locally
- `npm run test` - Run tests in watch mode
- `npm run test:run` - Run all tests once

## Basic Usage
1. Set WebSocket URL (default: `ws://localhost:8080`).
2. Choose protocol mode (`auto` is recommended initially).
3. Click **Connect**.
4. Inspect incoming/outgoing traffic in the timeline.
5. Use timeline search and namespace filters to narrow results.
6. Optionally validate outgoing JSON payloads with the schema panel.
7. Export or replay timeline data as needed.

### Socket.IO Auth Handshake
If your backend uses Socket.IO namespaces/auth:
- Enable **Socket.IO Handshake**.
- Set **Socket.IO Path** (commonly `/socket.io` or `/ws`).
- Set **Socket.IO Namespace** (for example `/devices` or `/frontend`).
- Provide **Socket.IO Auth JSON** when required (for example `{"serial":"...","token":"..."}`).
- Use protocol mode `socketio` to send event frames, and set **Socket.IO Event** if you need an event name other than `trace`.
- Signal Trace waits for namespace connection before allowing Socket.IO sends.
- Engine.IO ping (`2`) is handled automatically with pong (`3`) keepalive replies.

### Schema Guard Builder
- Open **Schema Guard** from the sidebar and click **Open Schema Builder**.
- Add fields with type (`string`, `number`, `boolean`, `object`, `array`).
- Use the **Required** checkbox next to each field to mark it required.
- Leave all fields empty to disable schema validation.

## Testing

Stack: **Vitest** + **@testing-library/react** + **@testing-library/user-event** + **@testing-library/jest-dom**. Test files live next to their implementation files.

Run all tests once:
```bash
npm run test:run
```

Run in watch mode:
```bash
npm run test
```

Coverage areas:
- `src/lib/` — pure utility unit tests (frame decoding, schema validation, Socket.IO URL/auth/namespace helpers)
- `src/hooks/` — `renderHook` + `act` tests for `useTimeline`, `useConnection`, `useSchemaGuard`
- `src/components/` — render + user-event tests for every component
- `src/App.test.tsx` — integration tests: schema modal, validation errors, Socket.IO handshake lifecycle

## Project Structure
```text
src/
  App.tsx                   # Thin orchestrator — wires hooks + components
  App.test.tsx              # Integration tests
  types.ts                  # Shared domain types
  main.tsx
  styles.css
  hooks/
    useTimeline.ts           # Messages, filtering, search, metrics, demo mode, replay, import/export
    useTimeline.test.ts
    useConnection.ts         # WebSocket lifecycle, Socket.IO handshake, protocol decode, RTT tracking
    useConnection.test.ts
    useSchemaGuard.ts        # Schema builder state, parsedSchema memo, Esc key listener
    useSchemaGuard.test.ts
  components/
    ConnectionPanel.tsx      # Connection settings form
    ConnectionPanel.test.tsx
    NamespaceFilter.tsx      # Namespace toggle buttons
    NamespaceFilter.test.tsx
    TransmitPanel.tsx        # Send form with local state
    TransmitPanel.test.tsx
    SchemaGuardModal.tsx     # Schema builder modal
    SchemaGuardModal.test.tsx
    MessageRow.tsx           # Single message row with expand/copy
    MessageRow.test.tsx
    TimelinePanel.tsx        # Right-panel shell composing MessageRow list
    TimelinePanel.test.tsx
  lib/
    trace-utils.ts           # Pure: frame decoding, schema validation, hex preview, safeJson
    trace-utils.test.ts
    socketio-utils.ts        # Pure: URL building, namespace/path normalization, auth parsing
    socketio-utils.test.ts
vitest.setup.ts              # @testing-library/jest-dom setup
vite.config.ts
index.html
package.json
AGENTS.md                    # Architecture and development guidelines
```

## Notes
- If your endpoint is unavailable, use Demo mode to test the UI behavior.
