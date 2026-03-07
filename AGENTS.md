# AGENTS.md

## Purpose
This file defines how agents should implement changes in `signal-trace` using best practices for its actual stack: React 19 + TypeScript + Vite.

## Project Context
- Application type: browser-based WebSocket traffic inspector for IoT debugging.
- Main runtime file: `src/App.tsx`.
- Build tool: Vite.
- Package manager: npm.
- Current scripts:
  - `npm run dev`
  - `npm run build`
  - `npm run preview`

## Core Delivery Rules
- Make the smallest safe change that fully solves the task.
- Preserve current behavior unless the task explicitly changes it.
- Do not refactor unrelated areas in the same patch.
- Prefer explicit, typed contracts over implicit assumptions.
- Keep code easy to debug in real-time traffic scenarios.

## Architecture and Boundaries
- Keep UI rendering concerns separate from protocol/decoding/validation logic.
- Extract pure utilities for:
  - frame decoding
  - payload parsing/normalization
  - schema validation
  - replay timing logic
- Avoid coupling transport formats directly to presentation components.
- Keep side effects (WebSocket connect/disconnect, timers, file import/export) localized and cleanup-safe.

## React 19 + Vite Best Practices
- Follow Vercel React guidance for performance-sensitive code paths.
- Re-render hygiene:
  - use `useMemo`/`useCallback` only for expensive computations or stable callback identity needs
  - avoid derived state in `useEffect` when it can be derived during render
  - prefer functional `setState` updates when using previous state
- Effects:
  - keep dependencies correct and as primitive/stable as possible
  - move user-triggered logic into event handlers instead of effects
  - always clean up WebSocket and timer side effects
- Bundle discipline:
  - avoid unnecessary dependencies
  - prefer direct imports over barrel patterns in hot paths
  - gate optional/heavy features behind lazy loading when justified
- Rendering:
  - keep long-list rendering efficient
  - avoid extra object/array allocations in tight render loops unless needed for correctness

## TypeScript Standards
- Keep strict typing; do not introduce `any` unless unavoidable and documented.
- Model domain types explicitly (`TraceMessage`, protocol mode, payload format).
- Parse unknown input as `unknown`, then narrow with guards.
- Validate imported/exported data shape before storing in app state.

## Data Validation and Safety
- Treat all incoming WebSocket frames and imported files as untrusted input.
- Fail fast on invalid JSON/schema with user-visible, actionable errors.
- Keep boundary validation close to IO operations.
- Never log secrets or sensitive tokens from payloads.

## Error Handling and Observability
- Do not swallow errors silently.
- Emit system events/messages for recoverable issues (connect errors, schema violations, import failures).
- Include enough context in diagnostics to reproduce issues (event, namespace, protocol mode).

## UX and Accessibility
- Preserve keyboard-accessible controls and semantic form elements.
- Keep loading/empty/error/success states explicit in the UI.
- Maintain readable contrast and clear status indicators for connection state.

## Testing and Verification
- For each behavior change, add or update tests where test infrastructure exists.
- Until automated tests are added, perform focused manual verification:
  - connect/disconnect lifecycle
  - message send/receive in all protocol modes (`auto`, `raw`, `socketio`)
  - schema validation success/failure paths
  - import/export JSON and NDJSON
  - timeline replay and cancel behavior
- Always run `npm run build` before finishing substantial changes.

## Git and Change Hygiene
- Keep commits focused and descriptive.
- In PR/task summary, include:
  - what changed
  - why it changed
  - risks/regression areas
  - how it was verified

## Definition of Done
- Requirements implemented and behavior validated.
- Build succeeds via `npm run build`.
- New edge cases and failure paths are handled.
- README/docs updated if workflow or behavior changed.
- No obvious type or runtime regressions introduced.
