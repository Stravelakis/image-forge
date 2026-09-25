## Stack

React 18 + Vite + TypeScript, packaged with Electron for Windows. No backend,
no state library, ~20k lines. Everything durable is a CSV or a `localStorage`
key. 659 tests (vitest) run in CI on every push with typecheck and build.

```bash
npm install
npm run dev              # http://localhost:3000 (browser mode)
npm test && npm run typecheck && npm run build
node scripts/build-exe.js   # NSIS installer + portable exe
```

## The rule that shapes the layout

`src/lib/engines.mjs` is the single source of truth for routing, prices,
network calls and file naming, and it is **DOM-free** — no React, `window` or
`document`. That is what lets the app and the MCP server (`scripts/mcp-server.js`)
run the same code. Browser-only concerns live in `src/lib/providers.ts`.

## How a picture is made

1. `resolveRoute(row, settings)` → `{ engine, apiModel, def }`. The row's
   `model` column wins; blank falls back to the engine picked in the toolbar
   (default for a fresh install: `ovh`).
2. A healthy key is chosen; free Gemini keys before paid.
3. `generateBytes()` makes the request, then **overrides the claimed MIME type
   with the one the bytes declare** (`mimeFromBytes`); the filename's extension
   is corrected to match (`nameForMime`), never the stem.
4. On `429` the key is benched and the same row retries with the next key.
5. Paid rows never start without `checkPaidRun()` → a confirmation dialog.

`withStyleBlock()` places a style's words per engine: last normally, **first
on SDXL/OVHcloud**, whose CLIP text encoder reads ~77 tokens and drops the
rest silently.

## Engines

| id | engine | cost | notes |
|---|---|---|---|
| `ovh-sdxl` | OVHcloud SDXL | free, no key | 2/min, paced in-process; 1024² only; no seed |
| `cloudflare-flux` | Workers AI | free | no CORS → proxied (`/cf-api`); rejects `seed` |
| `flux` / `turbo` | Pollinations | free | needs a token |
| *(local)* | LocalAI & co. | free | `ref_images` supported |
| `nano-banana*` | Google | paid | JPEG only; `429` may mean "no prepay balance" |
| `gpt-image-1`, `dall-e-3` | OpenAI-compatible | paid | |

## The link to BYOK Vid Creator

Two apps, not a merge. The desktop main process (`electron/link.mjs`) owns a
folder under `userData`:

```
link/presence.json         { app, version, port, inbox, outbox }
link/inbox/<id>.json       request from the other app
link/processing/<id>.json  claimed, being made
link/outbox/<id>/*         pictures, then done.json
```

Requests are validated in the main process only (id shape, ≤ 60 rows, plain
filenames, size limit); invalid ones are moved to `inbox/rejected/` with a
`.why.txt`. The page polls `/link/requests` every 5 s behind an
`X-Forge-Link: 1` header — a custom header forces a CORS preflight the server
never grants, so no other web page can drive it. Rows carry `request_id`;
when all end, the page `PUT`s each picture and `POST`s `done`. Keys never
cross over. The vid creator side is `tools/lib/forgeLink.mjs` +
`npm run ask-forge`.

## Desktop specifics

- ESM main process; never `require()` (it crashed the proxies in 1.0.0).
- Fixed ports 47821–47825, never `listen(0)`: storage is per origin.
- Data in `%APPDATA%\image-forge` (package `name`; no `productName`).
- Loads report `stored | empty | rescued`; a rescued load keeps a `.rescue`
  copy and holds autosave instead of writing defaults over real data.

## Releasing

Branch → bump five version fields (`tests/version.test.ts` enforces) →
CHANGELOG → tests/typecheck/build → build exe and **install it** → PR → merge →
tag `vX.Y.Z`. `release.yml` publishes the exes; `docs.yml` rebuilds this site.
Full map: [HANDOFF.md](https://github.com/Stravelakis/image-forge/blob/master/HANDOFF.md).
