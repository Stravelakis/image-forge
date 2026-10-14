---
title: "For developers: how it is built"
nav_order: 6
---

# For developers: how it is built

React 19 + Vite 8 + TypeScript, with an Electron shell for Windows. No backend,
no state library. About 28,000 lines of source. Everything durable is a CSV or
a `localStorage` key, mirrored on the desktop app into a file the app owns
(the vault).

The full engineering map is
[HANDOFF.md](https://github.com/Stravelakis/image-forge/blob/master/HANDOFF.md).
This page is the short version.

---

## Run it from source

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest, 715 tests across 39 files
npm run typecheck  # tsc --noEmit
npm run build      # vite build
```

The last three run in CI on every push and pull request.

Package it for Windows:

```bash
node scripts/build-exe.js   # installer + portable, into release/
```

There is also a `src-tauri/` folder. The Tauri build is **experimental**: not
built in CI, not released, and not built recently (it needs Rust and the
Microsoft C++ Build Tools). **Cloudflare and NVIDIA do not work in it** — it has
no equivalent of the Electron proxies those providers need.

---

## The one rule that explains the layout

**`src/lib/engines.mjs` is the single source of truth for routing, prices and
network calls, and it must stay DOM-free.**

No React, no `window`, no `document`. That is what lets the browser app, the
desktop app and the MCP server run *literally the same code*. Every time this
rule was bent, they behaved differently and a user found it before a test did.

Browser-only concerns go in `src/lib/providers.ts`, which wraps it.

---

## Layout

```
src/
├─ App.tsx               orchestrator: queue runner, folder doors, saving
├─ types.ts              statuses, categories (image/svg/lottie/sheet/gif)
├─ lib/
│  ├─ engines.mjs        ← model registry, routing, generateBytes, 429
│  │                       rotation, OVH pacing. DOM-free
│  ├─ providers.ts       settings shape and migration, key pools, text chat
│  │                       (with fallback to the next text engine that has a key)
│  ├─ readyEngines.ts    the engines that are set up now — Start's drop-down
│  ├─ startPlan.ts       one sentence + a number -> N prompts
│  ├─ sharedKeys.ts      keys shared with Video Forge (page side)
│  ├─ vault.ts           the page's side of the vault file (page side)
│  ├─ thumbStore.ts      thumbnails kept between restarts (IndexedDB)
│  ├─ paidGuard.ts       what a run costs, per row
│  ├─ testConnection.ts  "does this key actually work?" — real calls
│  ├─ visionEngine.ts    model lists with provider metadata; NVIDIA routing
│  ├─ settingsBackup.ts  verified saves, key counts, backup files
│  ├─ chatPlan.ts        the chat's FORGE / ROWS / EDIT reply protocol
│  ├─ appFacts.ts        the only facts the chat may state about the app
│  ├─ styleCatalogue.ts  36 styles, and which engines can do each
│  ├─ csv.ts             RFC 4180 parser + full-schema read/write
│  ├─ validate.ts        filename rules; extension follows the real bytes
│  ├─ sheets.ts          sprite / turnaround / viseme / expression sheets
│  ├─ warp.ts            homography maths for the four-corner text warp
│  ├─ vectorAssets.ts    SVG + Lottie via a code model, sanitised
│  ├─ theme.ts           the palette derived from the accent colour
│  ├─ output.ts          folder linking, ZIP, blob helpers
│  └─ puppet/            the puppet maker, engine-agnostic
│     ├─ recipe.ts       looks, framings, the parts and their prompts,
│     │                   background colour and lips choices
│     ├─ pixels.ts       pure picture maths: cut a part, key the background
│     ├─ maker.ts        the run: 4 faces, then parts with <= 3 tries each
│     ├─ rig.ts          builds Video Forge's rig JSON
│     ├─ pageIO.ts       the page's engines, the checker, local unload/rest
│     └─ shelf.ts        orders and puppets on the shared Forge shelf
├─ components/           one file per view; ui.tsx is the primitives
│  ├─ MadeView.tsx       Made: stats, every picture/sheet/GIF/puppet, Redo
│  ├─ StartView.tsx      the front door
│  ├─ PuppetMaker.tsx    the puppet maker pop-up
│  ├─ TipLayer.tsx       the hover-help bubble for the whole window
│  └─ (lib/cursorChaser.ts  cursor chasers: the shared chase script, Try it here, the website download)
scripts/
├─ mcp-server.js         the agent API — 8 tools over stdio
├─ hoverHelp.mjs         the scanner behind tests/hoverHelp.test.ts
└─ build-exe.js          vite → electron-builder
electron/
├─ main.js               desktop shell (ESM — never require()); proxies:
│                          /cf-api, /nv-api, /local-api/<port>
├─ vault.mjs             everything the page keeps, saved in a file the app owns
├─ forgeKeys.mjs         keys shared with Video Forge (same file in both repos)
├─ forgeShelf.mjs        puppet orders and puppets (same file in both repos)
├─ link.mjs              the link to BYOK Vid Creator
└─ appctl.mjs            window or browser mode
```

The files shared with Video Forge (`forgeKeys.mjs`, `forgeShelf.mjs`,
`TipLayer.tsx`) are **the same file in both repos**: change one, copy it to the
other.

---

## How a picture gets made

1. **`resolveRoute(row, settings)`** turns a row into
   `{ engine, apiModel, def }`. The row's `model` column wins; the engine
   picked in the toolbar is the fallback.
2. **A key is chosen** from the healthy pool. Free Gemini keys before paid.
3. **`generateBytes()`** makes the request and returns bytes and a MIME type.
4. On **`429`**, that key is benched and the *same row* retries with the next.
   Only when the whole pool rests does the row park with a `retry_at`.
5. The filename's extension is corrected to match the MIME type, the picture
   is written to the linked folder, and the row is updated.

The queue runner in `App.tsx` hands rows to 1–6 lanes. A slow picture never
blocks the others, and Stop lands within one request.

---

## Adding an engine

1. A `MODELS` entry in `engines.mjs`, with a dated note of what you verified.
2. A branch in `generateBytes()`.
3. Teach `explainFailure()` what its errors really mean. Providers return `429`
   for "you have no money", which tells a user to wait for a reset that never
   comes.
4. A check in `testConnection.ts` that makes a **real** call.
5. If free, add it to `FREE_ENGINES` in **both** `engines.mjs` and
   `paidGuard.ts`.
6. A `ProviderId` in `engines.d.mts`, `PROVIDER_META`, and a toolbar option.
7. A test.

---

## Providers that refuse browsers

Cloudflare sends **no CORS headers**, and NVIDIA answers a preflight without
`Access-Control-Allow-Origin`. Both are forwarded in two places that must stay
in step:

- `vite.config.js` — `/cf-api` and `/nv-api` for `npm run dev`
- `electron/main.js` — the same prefixes for the desktop app

A third door, `/local-api/<port>` in `electron/main.js`, forwards to your own
LocalAI on `127.0.0.1`: LocalAI refuses picture requests that come from a web
page ("missing csrf token"), so the puppet maker sends them through the app.
It only reaches `127.0.0.1` and only answers the app's own page. The NVIDIA and
Cloudflare relay sends bodies with a length over IPv4 (a half-working IPv6
route once left a request hanging).

Node has no CORS, so the MCP server calls them directly. If "could not reach
it" appears only in the browser, this is why.

---

## The desktop app

- Fixed ports 47821–47825. Never `listen(0)`: storage is per origin, and a
  random port was a new empty store every launch. A test copy names its own
  with `IMAGEFORGE_PORTS=47901,47902` and its own profile with
  `IMAGEFORGE_USER_DATA`.
- **The vault.** The page's storage belongs to its address, port included, so a
  second copy on port 47822 used to come up empty. `electron/vault.mjs` now
  keeps a full snapshot in a file under userData (locked with Windows' per-user
  encryption, plain JSON off Windows); `src/lib/vault.ts` copies it into storage
  before the page reads anything, merges what other ports held, and writes
  changes back within a couple of seconds. Routes: `GET/PUT /app/vault`.
- Data lives in `%APPDATA%\image-forge`, named after `package.json` `name`.
  Adding a `productName` would move every user's data. A test forbids it.
- `main.js` is ESM. `require()` there crashed the Cloudflare and NVIDIA
  proxies in 1.0.0.

`tests/desktopApp.test.ts` pins all of this.

---

## Tests

`vitest`, in `tests/`.

Anything touching **the CSV, filenames, money, or the engines** needs a test.
Those four fail silently and expensively.

Worth knowing:
- `csv-parity.test.ts` — the app and the MCP server read and write the
  manifest identically.
- `version.test.ts` — the version is the same in `package.json`, the app and
  the MCP server.
- `sourceHygiene.test.ts` — no invisible or control characters in source.
- `hoverHelp.test.ts` — fails on any clickable control without a `data-tip` or
  `title`. New buttons need one.
- `puppet.test.ts` — the real puppet code on owl pictures in
  `tests/fixtures/puppet/`; no engine is called.
- `vault.test.ts`, `sharedKeys.test.ts` — the real files, in a temp folder.

---

## Conventions

- **No `console.log`, `alert` or `confirm` in shipped code.** Feedback goes
  through toasts and the forge console.
- **Comments explain *why*, never *what*** — with the date a provider fact was
  confirmed.
- **Plain English in the UI.**
- **Free first.** Every paid engine needs a keyless fallback.

Full version: [STANDARDS.md](https://github.com/Stravelakis/image-forge/blob/master/STANDARDS.md).

---

## Where to go next

- [The manifest schema](manifest.md)
- [Wiring agents to it](vibe-coding.md)
- [Known traps and their causes](troubleshooting.md)
