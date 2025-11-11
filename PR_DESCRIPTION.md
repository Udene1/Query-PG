Query-PG: Runtime refactor and tests

Summary
- Extracted small runtime helpers and ws utilities to improve testability and maintainability:
  - `lib/runtime-utils.js` - minimal request build and fallback response parser.
  - `lib/runtime-dispatch.js` - error normalization and notification dispatch (onResult/onError/onUnauthorized).
  - `lib/runtime-ws-utils.js` - WebSocket handler creation and reconnect scheduling.

Why
- These changes move deterministic logic out of the large runtime module so unit tests can target small functions. This allowed the project to reach >=80% statement coverage while keeping `query-play.js` excluded from coverage because it's a DOM-heavy single-file component.

Files changed
- `lib/runtime.js` - now delegates to the new helpers for building/parsing/dispatch/ws scheduling.
- `lib/runtime-utils.js`, `lib/runtime-dispatch.js`, `lib/runtime-ws-utils.js` - new modules with focused logic.
- `__tests__/*` - new tests for the added modules and additional runtime branches.

How to run tests locally

1. Install dependencies (if not done):
   npm install

2. Run tests:
   npm test

Build
- To create the minified bundle run:
  npm run build

Notes
- Project name: Query-PG
- The UI file `query-play.js` is excluded from coverage in `jest.config.js` to focus coverage on testable logic. Consider further extracting UI logic into testable modules if you want full coverage including the component.
