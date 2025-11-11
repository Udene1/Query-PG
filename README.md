# Query-PG

Small vanilla Web Component for exploring OpenAPI endpoints and running requests.

Quick start

1. Install deps:

```powershell
npm install
```

2. Run tests:

```powershell
npm test
```

3. Build a minified bundle:

```powershell
npm run build
```

What changed in this branch

- Extracted runtime helpers into:
  - `lib/runtime-utils.js` (request/response fallback parsing)
  - `lib/runtime-dispatch.js` (error normalization & notification dispatch)
  - `lib/runtime-ws-utils.js` (ws handler creation & reconnect scheduling)

These make small units easier to test and maintain.

Test coverage

- The project aims for >=80% statement coverage for logic modules. `query-play.js` (UI) is excluded from coverage measurements.

Project name: Query-PG
# query-play

`<query-play>` — a zero-install, embeddable API playground Web Component.

Features
- Drop-in custom element: <query-play api="..." endpoint="/path" ws="..." auth="...">.
- Parses OpenAPI 3.x, auto-generates a simple form for endpoints.
- Uses browser-native fetch() and optional WebSocket feedback.
- Offline caching (localStorage), save requests, response history, dark mode.
- Vanilla JS, Shadow DOM, accessible (basic ARIA labels), under 300 LOC (minified).

Files
- `query-play.js` — source component (development).
- `query-play.min.js` — minified build for production.
- `demo.html` — demo page using Petstore and a local sample OpenAPI.
- `sample-openapi.json` — small JSONPlaceholder-like OpenAPI schema for local testing.

Quick start (open demo)
1. Open `demo.html` directly in your browser: File -> Open File -> select demo.html.
2. Or serve the folder with a static server then open http://localhost:8000/demo.html

PowerShell static server (Windows):
```powershell
# from the project root (where demo.html lives)
python -m http.server 8000
# then open http://localhost:8000/demo.html in your browser
```

Usage
- Drop `<script src="query-play.js"></script>` on any page.
- Insert `<query-play api="https://example.com/openapi.json" endpoint="/users" ws="wss://..." auth="mytoken"></query-play>`.
- If `auth` is provided it is appended as `Authorization: Bearer <token>`.

Packaging and publish (npm/webcomponents.org)
1. npm init -y
2. Update `package.json` `main` to `query-play.min.js` and add a `files` entry.
3. npm publish --access public

Notes & Limitations
- CORS: target APIs must allow cross-origin requests from your demo host.
- This component does not implement complex OpenAPI features like polymorphism, $ref resolution across external files, or OAuth flows — it's a compact playground for quick testing of endpoints.
- **Syntax-Highlighted Responses**: JSON responses are auto-colored (keys blue, strings green, numbers orange); a copy button is provided. Dark mode is supported via the `dark` attribute.
 - **Syntax-Highlighted Responses**: JSON responses are auto-colored (keys blue, strings green, numbers orange); a copy button is provided. Dark mode is supported via the `dark` attribute.
 - **Raw/Highlighted Toggle**: Use the "Highlight Response" checkbox to switch between a pretty-colored JSON view and the raw JSON/text. Copy always copies the uncolored raw output for pasting into editors or logs.

Contributing
- PRs welcome. Keep changes small and add tests/examples in `demo.html`.

What next?
Tweaks for auth flows or mobile?

## Mobile Responsiveness

- Touch-Optimized: Buttons and inputs use larger hit targets on small screens (>=44px where possible) to improve tap accuracy and accessibility.
- Responsive Layout: the component stacks controls vertically on narrow viewports (max-width: 600px) to avoid horizontal scrolling and make forms easy to use on phones.
- Viewport Support: include this in your host page's <head> to ensure proper mobile scaling:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

- Orientation: you can hint the component with `orientation="portrait"` to better constrain height/scrolling on small devices.

Testing: Resize your browser to a narrow width (e.g., 375px) or open the demo on a phone — controls stack and the response pane is scrollable.

## Running tests (Jest + CI)

This project includes a small Jest test suite that runs in jsdom and a GitHub Actions workflow for CI.

Install dev dependencies:

```powershell
npm install
```

Run tests and coverage locally:

```powershell
npm test
```

CI: the workflow at `.github/workflows/ci.yml` runs `npm ci`, builds (npm run build) and runs tests with coverage on push and PRs.

