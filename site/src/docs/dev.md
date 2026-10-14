## Stack

React 19 + Vite 8 + TypeScript 7, packaged with Electron for Windows. No backend,
no state library, ~28k lines. Everything durable is a CSV or a `localStorage`
key, mirrored on desktop into a file the app owns (the vault). 715 tests across
39 files (vitest) run in CI on every push with typecheck and build.

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

## Layout, 13 Oct 2026 round

| Path | Owns |
|---|---|
| `src/components/StartView.tsx`, `lib/startPlan.ts`, `lib/readyEngines.ts` | Start: one sentence + N, style, shape, engine drop-down of ready engines |
| `src/components/MadeView.tsx`, `lib/thumbStore.ts` | Made: stats, every row/puppet, Redo; thumbnails in IndexedDB; rows carry `made_with` |
| `src/lib/puppet/` (`recipe`, `pixels`, `maker`, `rig`, `pageIO`, `shelf`) + `components/PuppetMaker.tsx` | the puppet maker; engine-agnostic (`generate`, `judge` injected). Method: `docs/puppet-recipe.md` |
| `electron/vault.mjs` + `src/lib/vault.ts` | all page storage mirrored to a DPAPI-locked file; page loads it first, merges other ports' boxes |
| `electron/forgeKeys.mjs` + `src/lib/sharedKeys.ts` | keys shared with Video Forge: gemini, openrouter, nvidia, mistral, cloudflare-account/-token, pollinations, openai, groq, elevenlabs, fish. A shared key only fills an empty box |
| `electron/forgeShelf.mjs` | puppet orders and puppets under `%APPDATA%\Forge\` (same file in Video Forge) |
| `src/components/TipLayer.tsx` | the hover bubble for the window (`data-tip`, `data-tip-more`, or `title`); `tests/hoverHelp.test.ts` fails on a naked control |
| `src/lib/cursorChaser.ts` | cursor chasers: one chase script used by "Try it here" and the website download |
| `electron/main.js` | adds `/local-api/<port>` (LocalAI refuses page requests: CSRF), `/app/vault`, `/app/keys`, `/app/video-forge`, `/app/orders`, `/app/puppets`; test copies use `IMAGEFORGE_PORTS` and `IMAGEFORGE_USER_DATA` |

Text jobs: `scribeChat` falls back to the next provider with a key on 429, 5xx or
a retired model (`setTextFallbacks`, `pickTextModel`). The Cloudflare/NVIDIA relay
sends a `Content-Length` body over IPv4.

## The link to BYOK Vid Creator

Two apps, not a merge. (Now also shared: keys and the puppet shelf, above.) The desktop main process (`electron/link.mjs`) owns a
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

- **Window or browser** (`electron/appctl.mjs`, `src/lib/desktop.ts`): the
  same server either way. Switching posts the page's whole localStorage to
  `/app/mode`; the other side takes it once from `/app/handover` before
  React mounts. The window and a browser are separate storage even on one
  origin, so without this the switch would look like data loss.
- **Update now**: `/app/update` accepts only
  `github.com/Stravelakis/image-forge/releases/download/…Setup….exe`,
  downloads it and runs it with `/S --updated --force-run`. `/app/*` needs
  the `X-Forge-App: 1` header, like the link.

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
