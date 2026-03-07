# AGENTS.md

## Purpose
This file defines how agents should implement changes in `signal-trace` using best practices for its actual stack: React 19 + TypeScript + Vite + Vitest.

## Project Context
- Application type: browser-based WebSocket traffic inspector for IoT debugging.
- Entry: `src/main.tsx` → `src/App.tsx` (thin orchestrator, ~160 lines).
- Build tool: Vite.
- Package manager: npm.
- Scripts:
  - `npm run dev` — start Vite dev server
  - `npm run build` — type-check (`tsc -b`) then bundle
  - `npm run preview` — preview production build
  - `npm run test` — Vitest watch mode
  - `npm run test:run` — run all tests once

---

## Project Structure

```
src/
  App.tsx                   # Thin orchestrator — wires hooks + components, owns handleSend/handleConnect/handleDisconnect/handleClear
  types.ts                  # Shared domain types: TraceMessage, Metrics, SendParams, Direction, LinkState, SchemaValueType, SchemaPropertyDraft
  main.tsx
  styles.css
  hooks/
    useTimeline.ts           # Messages, filtering, search, metrics, demo mode, replay, import/export
    useConnection.ts         # WebSocket lifecycle, Socket.IO handshake, protocol decode, RTT tracking
    useSchemaGuard.ts        # Schema builder state, parsedSchema memo, Esc key listener
  components/
    ConnectionPanel.tsx      # Connection settings form (React.memo)
    NamespaceFilter.tsx      # Namespace toggle buttons (React.memo)
    TransmitPanel.tsx        # Send form with local state (React.memo)
    SchemaGuardModal.tsx     # Schema builder modal (React.memo)
    MessageRow.tsx           # Single message row with expand/copy (React.memo)
    TimelinePanel.tsx        # Right-panel shell composing MessageRow list (React.memo)
  lib/
    trace-utils.ts           # Pure: frame decoding, schema validation, hex preview, safeJson
    socketio-utils.ts        # Pure: URL building, namespace/path normalization, auth parsing
tests/
  hooks/                    # renderHook tests for useTimeline, useConnection, useSchemaGuard
  components/               # render tests for every component
  app.test.tsx              # Integration tests via full App render
  trace-utils.test.ts
  socketio-utils.test.ts
  setup.ts
```

---

## Core Delivery Rules
- Make the smallest safe change that fully solves the task.
- Preserve existing behavior unless the task explicitly changes it.
- Do not refactor unrelated areas in the same patch.
- Prefer explicit, typed contracts over implicit assumptions.
- Keep code easy to debug in real-time traffic scenarios.

---

## Architecture Rules

### Hook responsibilities
| Hook | Owns |
|---|---|
| `useTimeline` | messages, activeNamespaces, search, expandedId, copiedId, demoMode, replaySpeed, all replay/import/export logic |
| `useConnection` | wsRef, connState, WS event handlers, Socket.IO handshake, protocolMode, pendingMapRef (RTT), all connection settings |
| `useSchemaGuard` | schemaProperties, schemaModalOpen, parsedSchema |

- Hooks accept only primitive props or stable callbacks — never raw state setters from another hook.
- `App.tsx` is the only place allowed to call more than one hook and combine their outputs.
- `sendMessage` / `handleSend` stays in `App.tsx` because it bridges all three hooks.
- `clearPending` must be called from `App.tsx`'s `handleClear` alongside `clearTimeline`.
- When disconnecting or toggling demo mode, call `stopReplay` in `App.tsx` before delegating to the hook.

### Component responsibilities
- Components receive data and callbacks via props — they hold no business logic.
- `TransmitPanel` is the only component that owns local UI state (form fields). It calls `onSend(SendParams)`.
- All list/panel components are wrapped in `React.memo`.

### Separation of concerns
- Pure utilities live in `src/lib/`. They have no React imports and are fully unit-testable.
- WebSocket side-effects live in `useConnection` only.
- Timer side-effects (demo interval, replay timeout) live in `useTimeline` only.
- File I/O (import/export) lives in `useTimeline` only.

---

## React 19 Best Practices

### Hooks
- Use `useCallback` for callbacks passed to memoized child components or used in `useEffect` deps.
- Use `useMemo` for expensive derivations (filtered list, metrics, parsedSchema).
- Avoid `useEffect` for derived state — compute it during render with `useMemo` instead.
- Use functional `setState` updates (`prev => ...`) whenever new state depends on previous.
- Keep `useEffect` dependency arrays minimal and correct; prefer stable refs for values that must not re-trigger effects.

### Stale closure pattern
- When a `useEffect`-created event handler (e.g., `ws.onmessage`) needs to call a function that depends on state, store the function in a `useRef` and update the ref via `useEffect`. The handler always reads `ref.current`. See `recordIncomingRef` in `useConnection.ts`.

### Memoization
- Wrap every component in `React.memo` that renders inside a list or receives stable-but-complex props.
- Do not memo components that always receive new props on every parent render (no benefit).
- Pass primitive values or `useCallback`-wrapped handlers as props to memoized components to keep them from unnecessary re-renders.

### State batching
- React 19 batches all state updates by default. Never call multiple setters and expect intermediate renders between them.
- When a test sets state before calling a function under test, use separate `act()` blocks: one for state, one for the action.

---

## TypeScript Standards
- Always use `strict: true`. Never introduce `any` unless unavoidable and annotated with a comment.
- Model domain types explicitly in `src/types.ts`. Add new shared types there, not inline in component files.
- Parse external input (`unknown`) with explicit type guards before storing in state.
- Use `import type` for type-only imports to keep runtime output clean.
- Prefer `interface` for public API shapes, `type` for union/intersection aliases.

---

## WebSocket and Protocol Handling
- All WS event handlers (`onopen`, `onclose`, `onerror`, `onmessage`) are set once at connection time in `useConnection.connect()`.
- `protocolMode` changes after connection are handled via the `recordIncomingRef` pattern — do not recreate the WS or re-attach handlers for mode changes.
- Socket.IO handshake sequence: engine open (`0...`) → send namespace connect (`40<ns>`) → await namespace ready (`40<ns>` or `40<ns>,`) → set `socketIoReadyRef.current = true` → `CONNECTED`.
- Engine.IO ping (`2`) is handled automatically with pong (`3`) in `onmessage`.
- Always clean up: call `ws.close()` and null `wsRef.current` in both `disconnect()` and the unmount cleanup effect.

---

## CSS and Layout
- Styling is in a single `src/styles.css` — no CSS modules or Tailwind.
- CSS variables: `--bg`, `--panel`, `--line`, `--line-strong`, `--text`, `--muted`, `--hazard`, `--good`, `--err`, `--info`.
- Layout: `.shell` fills `100dvh` with `grid-template-rows: auto 1fr`. `.layout` is a two-column grid (350px sidebar + 1fr timeline). Both have `min-height: 0; overflow: hidden` to enable child scroll.
- `.timeline` is a flex column with `min-height: 0; overflow: hidden`. `.rows` has `flex: 1; overflow: auto` — this is what actually scrolls.
- `.controls` (sidebar) has `overflow-y: auto` to scroll independently.
- Use `.hud` for the corner-bracket HUD border effect.
- Button variants: plain (default), `.btn-primary` (accent border), `.btn-active` (amber active state).
- Status dot variants: `.dot.disconnected`, `.dot.connecting` (pulse), `.dot.connected` (breathe), `.dot.error`.

---

## Testing Standards

### Stack
- Vitest + `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom`.
- Setup file: `tests/setup.ts` (imports `@testing-library/jest-dom/vitest`).
- Environment: jsdom.

### Coverage requirements
- Every new hook must have a `tests/useXxx.test.ts` using `renderHook` + `act`.
- Every new component must have a `tests/ComponentName.test.tsx` using `render` + user events.
- Integration flows that span multiple hooks should be tested in `tests/app.test.tsx`.
- Pure utilities in `src/lib/` must have dedicated unit tests.

### Patterns
- Mock `WebSocket` with a `MockWebSocket` class that exposes `emitOpen()`, `emitMessage(data)`, `emitError()`, and `emitClose()` helpers.
- Mock `navigator.clipboard.writeText` with `vi.fn().mockResolvedValue(undefined)` in `beforeEach`.
- Mock `URL.createObjectURL` / `URL.revokeObjectURL` for export tests.
- Use `vi.useFakeTimers()` / `vi.useRealTimers()` for demo mode and replay timer tests.
- State setters and the action that reads updated state must be in **separate** `act()` blocks.
- Use `within(container)` to scope queries when multiple similar elements exist (e.g., checkboxes inside a modal vs. in the background).
- Always `cleanup()` in `afterEach`.

### What not to test
- Internal ref values — test observable behavior (state, rendered output, callbacks fired).
- CSS class names beyond the functional ones (`.expanded`, `.ns-btn--active`, direction classes).
- Implementation details of third-party libraries.

---

## Data Validation and Safety
- Treat all incoming WebSocket frames and imported files as untrusted (`unknown`).
- Validate imported timeline entries in `normalizeImported` before pushing to state.
- Never log or display raw auth tokens from Socket.IO auth payloads in the timeline.
- Fail fast with a system-event message for recoverable errors (connect failure, schema violation, import parse error).

---

## Error Handling and Observability
- Do not swallow errors silently.
- Use `appendSystem(event, payload)` to emit diagnostic messages into the timeline.
- Include event name, namespace, and protocol mode in error context where relevant.

---

## UX and Accessibility
- All interactive controls must be reachable via keyboard.
- Use semantic HTML: `<button>`, `<label>`, `<input>`, `<select>`, `<details>`/`<summary>`, `<article>` for message rows.
- Connection state must always be visible via the status dot + label in the Connection panel summary.
- Keep empty, loading, and error states explicit — no blank panels.

---

## Git and Change Hygiene
- Keep commits focused and descriptive.
- In a PR/task summary include: what changed, why, regression areas, and how it was verified.

---

## Definition of Done
- Requirements implemented and behavior validated.
- `npm run build` succeeds with no type errors.
- `npm run test:run` passes — all tests green.
- New behavior has corresponding tests.
- No regressions in existing tests.
- README updated if the user-visible workflow or feature set changed.
