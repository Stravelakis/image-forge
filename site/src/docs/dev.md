## Orientation

Image Forge is a **manifest-driven image pipeline**. One [CSV](https://www.rfc-editor.org/rfc/rfc4180) is the single source of truth: rows describe pictures, a queue runner turns rows into files, files land sorted on disk. It runs three ways from one codebase.

| Runtime | Entry | Shares |
|---|---|---|
| Browser app | `npm run dev` → `http://localhost:3000` | the whole UI and `src/lib/engines.mjs` |
| Windows desktop app | `electron/main.js` | the same UI, served from `127.0.0.1` on a fixed port |
| Agent API | `scripts/mcp-server.js` (MCP over stdio) | `engines.mjs` and the CSV format, not the UI |

Stack: React 19, Vite 8, TypeScript 7, Electron 44 (Windows), Vitest 5. No backend, no state library, about 28k lines of source. Everything durable is a CSV or a `localStorage` key, mirrored on desktop into an encrypted file the app owns (the vault).

Design rules, in the order they win arguments:

1. **The manifest is the API.** Anything that reads and writes the CSV is a first-class participant.
2. **Free first.** Every paid path has a keyless fallback.
3. **One decision per step, plain words.** The UI is written so a ten-year-old can run a batch.

> **Watch out** If this page and the code disagree, the code wins. The full engineering map is [HANDOFF.md](https://github.com/Stravelakis/image-forge/blob/HEAD/HANDOFF.md); this page is the dense version.

## Run it

```bash
npm install
npm run dev                 # browser app on http://localhost:3000
npm test                    # vitest
npm run typecheck           # tsc --noEmit  (vite build does NOT typecheck)
npm run build               # vite build → dist/
node scripts/build-exe.js   # NSIS installer + portable exe → release/
node scripts/mcp-server.js  # the agent API on stdio
cd site && npm run dev      # this docs site, locally
```

CI (`.github/workflows/ci.yml`) runs typecheck, tests and build on Node 22 for every push and pull request. Node 20 is enough to run the app from source but Vitest 5 cannot start its workers on it, so test on 22.

`src-tauri/` is **experimental**: not built in CI, not released, and it needs Rust and the Microsoft C++ Build Tools. Cloudflare and NVIDIA do not work there, because Tauri has no equivalent of the `/cf-api` and `/nv-api` proxies (see the next sections).

## Architecture

```
                 ┌────────────────────────────────────────────┐
                 │                  App.tsx                   │
                 │ rows · settings · queue runner · save/rescue│
                 │ folder doors · toasts · log                │
                 └──────┬─────────────────┬───────────────┬───┘
                        │                 │               │
              ┌─────────▼────────┐ ┌──────▼──────┐ ┌──────▼───────┐
              │   providers.ts   │ │  output.ts  │ │ settings-    │
              │ settings shape,  │ │ folder, ZIP │ │ Backup.ts    │
              │ migration, chat  │ │ blob helpers│ │ verified save│
              └─────────┬────────┘ └─────────────┘ └──────────────┘
                        │ wraps
              ┌─────────▼─────────┐     the same file is imported by
              │    engines.mjs    │◀──  scripts/mcp-server.js
              │ MODELS · routing  │     (DOM-free on purpose)
              │ generateBytes·429 │
              └─────────┬─────────┘
   ┌──────────┬─────────┼──────────┬────────────┬─────────┬──────────┐
   ▼          ▼         ▼          ▼            ▼         ▼          ▼
simulated   local      ovh     cloudflare  pollinations  gemini  openai-compat
(practice) (LocalAI) (no key)  (proxied)     (token)     (paid)    (paid)
```

The UI is a view switch rendered by `App.tsx` with a top menu: Start, Made, Chat, Wizards (Make pictures, Make a puppet, Animate a character, Prompt factory), Gallery (Everything made, Styles, Templates), Docs, Settings. The app opens on **Start** (`StartView.tsx`). Made (`MadeView.tsx`) is the old Forge tab; the spreadsheet is behind *Edit as a table*.

> **Why** One rule explains most of the layout: **`src/lib/engines.mjs` is the single source of truth for routing, prices, network calls and file naming, and it must stay DOM-free** (no React, no `window`, no `document`). That is what lets the browser app, the desktop app and the MCP server run literally the same code. Every time the rule was bent, they behaved differently and a user found it before a test did. Browser-only concerns live in `src/lib/providers.ts`, which wraps it.

## Module map

| File | Owns | Worth knowing |
|---|---|---|
| `types.ts` | vocabulary | `Category` = `image · svg · lottie · sheet · gif`; `migrateCategory()` maps old `shop/item/event/npc` rows on load |
| `lib/engines.mjs` | routing, prices, requests, file types | `MODELS`, `resolveRoute`, `generateBytes` (MIME from the bytes), `estimateCost`, `explainFailure`, the OVH pacer, `withStyleBlock`. Types in `engines.d.mts` |
| `lib/providers.ts` | browser wrapper | `ForgeSettings`, `normalizeSettings` (all migrations), key pools, `scribeChat` with fallback to the next text engine that has a key |
| `lib/csv.ts` | the contract | RFC 4180 parser; forgiving import |
| `lib/validate.ts` | filename rules | `RULES` (7, two of them unswitchable), `nameForMime`, `autoFixFilename` |
| `lib/paidGuard.ts` + `paidGate.ts` | money | `checkPaidRun` routes each row and counts only billed rows; `ensureAffordable()` is the one door every paid call uses |
| `lib/testConnection.ts` | "does this key work?" | real calls, not model lists |
| `lib/settingsBackup.ts` | proof of saving | `saveSettingsVerified` writes, reads back and compares; `censusOf` counts keys without showing them |
| `lib/startPlan.ts`, `readyEngines.ts` | Start screen | one sentence + a number → N prompts; the engine drop-down lists only engines that work now |
| `lib/chatPlan.ts`, `appFacts.ts` | the Chat | `FORGE:` / `ROWS:` / `EDIT:` reply protocol; the chat may state only what is in `APP_FACTS` |
| `lib/styleCatalogue.ts` | 36 looks in 6 groups | which engines can do which look; styles that need readable text are limited to models that can spell |
| `lib/sheets.ts` | sprite / turnaround / viseme / expression sheets | each frame gets its own seed plus a "change ONLY this" instruction |
| `lib/vectorAssets.ts` | SVG and Lottie | `sanitiseSvg()` strips scripts and external references |
| `lib/puppet/` | the puppet maker | `recipe`, `pixels`, `maker`, `rig`, `pageIO`, `shelf`; engine-agnostic (`generate` and `judge` are injected) |
| `lib/vault.ts`, `sharedKeys.ts`, `link.ts` | desktop-only page side | each pairs with a file in `electron/` |
| `components/TipLayer.tsx` | hover help | `data-tip`; `tests/hoverHelp.test.ts` fails on any naked control |
| `electron/main.js` | desktop shell | see [The desktop app](#dev--the-desktop-app) |
| `scripts/mcp-server.js` | the agent API | 8 tools over stdio |

## Data and persistence

| Store | Key | Contents |
|---|---|---|
| localStorage | `image-forge-manifest-v1` | rows (minus `preview`) and the style lock, debounced 350 ms |
| localStorage | `image-forge-settings-v1` | `ForgeSettings`, saved on every change and **read back** |
| localStorage | `…-v1.rescue` | original bytes of anything that could not be read at startup |
| localStorage | `image-forge-setups-v1`, `-batches-v1` | recipes and the batch registry |
| IndexedDB | `image-forge` → `kv.dir` | the linked folder handle |
| IndexedDB | thumbnail store | previews kept between restarts (`thumbStore.ts`) |
| disk (desktop) | `%APPDATA%\image-forge` | Electron's data folder: all of the above plus `window-state.json` |

> **Watch out** **The rescue rule: do not undo it.** `loadInitial` and `loadSettings` report `stored`, `empty` or `rescued`. On `rescued`, the raw bytes are copied to the `.rescue` key and autosave for that store is **held back**. Before this, one unreadable read fell back to defaults and autosave overwrote the real data 350 ms later; a 26-row manifest was reduced to 8 seed rows.

> **Watch out** **Never add `productName` to `package.json`.** Electron names the data folder after `name`. A `productName` would silently move every user's data to a new, empty folder. A test forbids it.

`imagesRef` (a `Map<filename, Blob>`) lives only in memory. Pictures reach disk through the linked folder, a ZIP, or a per-picture save. With no folder linked, every picture is also written the moment it arrives to `<userData>/images/<folder>/` (`electron/autosave.mjs`), and closing the window with an unsaved picture warns first.

## The engine layer

`resolveRoute(row, settings)` returns `{ engine, apiModel, def }`. **The row's `model` column wins**; a blank falls back to `settings.provider`. A route can also be `retired` (the provider switched the model off) or `paused` (the user switched the engine off); both fail at once with a sentence.

How a picture is made:

1. `resolveRoute` picks the engine and API model.
2. A healthy key is taken from the pool, free Gemini keys before paid.
3. `generateBytes()` makes the request and returns bytes plus a MIME type. It **overrides the claimed type with the one the bytes declare** (`mimeFromBytes`), and `nameForMime()` corrects the file extension (never the stem, never onto another row's name).
4. On `429` the key is benched and the **same row** retries with the next key. Only when the whole pool rests does the row park with `retry_at`.
5. The picture is written to the linked folder and the row updated.

The queue runner in `App.tsx` hands rows to 1 to 6 lanes. A slow picture never blocks the others, and Stop lands within one request.

`withStyleBlock()` places a look's words per engine: last normally, **first on SDXL/OVHcloud**, whose text encoder reads about 77 tokens and drops the rest silently.

**The OVH pacer.** OVHcloud's anonymous limit clears in seconds, but a `429` on the normal path would park a row for hours. So `engines.mjs` queues OVH calls one behind another, **31 s apart** (`OVH_GAP_MS`), however many lanes run, and waits out `RateLimit-Reset`.

Provider facts that contradict the providers' own documentation (verified on live accounts; keep adding to this list):

| Provider | Fact |
|---|---|
| Google | The image API accepts only `image/jpeg`. `429` can mean "no prepay balance". `403` can mean a project-level ban |
| Cloudflare | Sends no CORS headers, so it must be proxied. Rejects the whole request if `seed` is sent. Returns JPEG |
| NVIDIA | Preflight returns `200` with no `Access-Control-Allow-Origin`, so it must be proxied |
| OVHcloud | No key. Two a minute anonymously. Only `prompt` and `negative_prompt`. PNG, 1024² |
| Pollinations | Anonymous requests are refused with a Turnstile error; needs a free token |
| Mistral | `mistral-medium-latest` does vision; `pixtral-large-latest` was not on the test account |
| OpenRouter | Publishes a price per model, so "free only" filtering is exact there |

### Providers that refuse browsers

Cloudflare and NVIDIA are forwarded in two places that **must stay in step**: `vite.config.js` (`/cf-api`, `/nv-api` for `npm run dev`) and `electron/main.js` (the same prefixes in the desktop app). A third door, `/local-api/<port>`, forwards to your own LocalAI on `127.0.0.1`, because LocalAI refuses picture requests that come from a web page ("missing csrf token"). It only reaches `127.0.0.1` and only answers the app's own page. The relay sends a `Content-Length` body over IPv4, because a half-working IPv6 route once left a request hanging.

Node has no CORS, so the MCP server calls these providers directly. If "could not reach it" appears only in the browser, this is why.

## Money

`paidGuard.checkPaidRun` routes every row on its own, counts only rows that bill, prices each at the billed model's rate, and names the credit that runs out soonest. Free engines (`local`, `simulated`, `cloudflare`, `pollinations`, `ovh`; the `FREE_ENGINES` set in `engines.mjs`) are never gated.

- A paid model with an **unknown price counts as paid** ("price unknown").
- Google "Pro" image models are refused everywhere.
- Every generating caller (Forge button, variants, sheet maker, the Google half-price queue, the puppet maker) asks through `ensureAffordable()` in `src/lib/paidGate.ts`.
- The puppet maker has its own per-puppet limit (Settings; default $0, meaning free engines only).

**Over MCP there is no human to confirm**, so paid engines are refused unless the operator starts the server with `FORGE_ALLOW_PAID=1`. The limit `FORGE_MAX_USD` (default 1) is counted **in memory, per server process**: it resets when the server restarts. A request is charged before it goes out, because a request that fails half way can still be billed.

> **Watch out** In v1.1.1 the MCP limit lives in a plain variable (`spentUsd` in `scripts/mcp-server.js`), so it **resets whenever the server restarts**. Do not treat it as a daily budget. Keep paid keys out of the agent's environment unless you want it able to spend.

## Output doors

1. **Browser File System Access.** `showDirectoryPicker`, handle kept in IndexedDB. Blocked in sandboxed iframes by design.
2. **ZIP.** Always works.
3. **One picture.** Save from the row.

Files go into `images/`, `vectors/`, `lottie/`, `sheets/` and `gifs/` (from `CATEGORY_META`). With a folder linked, each picture is written as it finishes.

## The desktop app

`electron/main.js` is **ESM** (`"type": "module"`). Never `require()` in it: v1.0.0 did, inside the proxy, and Cloudflare and NVIDIA crashed in the desktop app while working in the browser.

- Serves `dist/` on `127.0.0.1`, **fixed ports 47821 to 47825**. Never `listen(0)`: storage is per origin, so a random port was a new empty store every launch (the 1.0.0 "keys disappear" bug).
- Single instance; a second launch focuses the first window. `APP_USER_MODEL_ID` must equal `appId` in `build-exe.js` (`forge.imageforge.app`). Never change it: it is how an installer knows it is an upgrade.
- A test copy uses `IMAGEFORGE_PORTS=47901,47902` and its own profile with `IMAGEFORGE_USER_DATA=<folder>`, so it cannot meet the installed copy.
- `/app/*` routes need the `X-Forge-App: 1` header. A custom header forces a CORS preflight the server never grants, so no other web page can drive them. A wrong `Host` header gets `403`.
- **Window or browser:** `electron/appctl.mjs`, the same server either way. Switching posts the page's whole localStorage to `/app/mode`, and the other side takes it once from `/app/handover` before React mounts. A window and a browser are separate storage even on one origin; without the handover the switch would look like data loss.
- **Update now:** `/app/update` accepts only `github.com/Stravelakis/image-forge/releases/download/…Setup….exe`, downloads it, and runs it with `/S --updated --force-run`.
- **The vault.** `electron/vault.mjs` keeps a full snapshot of page storage in `<userData>/vault.bin`, locked with Windows DPAPI (plain `vault.json` off Windows). `src/lib/vault.ts` loads it before anything reads storage, merges what other ports' boxes held (lists joined, empty settings filled, nothing overwritten), and writes changes back within about two seconds. Routes: `GET/PUT /app/vault`, `POST /app/vault/harvested`. A reset calls `flushVault()` first, or the reload would bring everything back.
- The uninstaller asks one question (`build/installer.nsh`). It deletes `$APPDATA\image-forge` only on Yes, and `/SD IDNO` makes a silent uninstall answer No.
- `author` in `build-exe.js` must be an object (`{ name }`); a string left the Publisher blank in Settings → Apps.
- The exes are **not signed**. electron-builder's log says "signing with signtool" anyway; `Get-AuthenticodeSignature` reports `NotSigned`.

## The Video Forge link

Two apps, not a merge. Installed side by side they share three things.

**Shared keys.** `electron/forgeKeys.mjs` (the same file lives in Video Forge; change one, copy it to the other) keeps a DPAPI-locked file at `%APPDATA%\Forge\shared-keys.bin`, written through Windows PowerShell via stdin. Routes `GET/POST /app/keys`. Shared names: gemini, openrouter, nvidia, mistral, cloudflare-account, cloudflare-token, pollinations, openai, groq, elevenlabs, fish. The page side (`src/lib/sharedKeys.ts`) fills **empty** boxes on load and shares typed keys 1.5 s after a settings change. Removing a key here is not shared; Video Forge's removals are.

**The puppet shelf.** Puppet orders and finished puppets live under `%APPDATA%\Forge\` (`forgeShelf.mjs`, again the same file in both repos).

**Picture requests.** The desktop main process (`electron/link.mjs`) owns a folder under `userData`:

```
link/presence.json         { app, version, port, inbox, outbox }
link/inbox/<id>.json       request from the other app
link/processing/<id>.json  claimed, being made
link/outbox/<id>/*         pictures, then done.json
```

Requests are validated in the main process only (id shape, at most 60 rows, plain filenames, size limit). Invalid ones move to `inbox/rejected/` with a `.why.txt`. The page polls `/link/requests` every 5 s behind the `X-Forge-Link: 1` header. Rows carry `request_id`; when all end, the page `PUT`s each picture and `POST`s `done`. The Video Forge side is `tools/lib/forgeLink.mjs` and `npm run ask-forge`. Free requests start by themselves; paid ones stop at the usual dialog. Keys never cross over.

## The agent API (MCP)

```bash
claude mcp add image-forge node scripts/mcp-server.js
```

Or in `.mcp.json`:

```json
{
  "mcpServers": {
    "image-forge": {
      "command": "node",
      "args": ["scripts/mcp-server.js", "--csv", "marketplace-images.csv", "--out", "generated-images"]
    }
  }
}
```

Works with any client that speaks MCP over stdio: Claude Code, Cursor, Cline, Windsurf, n8n, LangChain.

| Tool | What it does |
|---|---|
| `forge_status` | counts of pending, done and failed, and which engine is wired up |
| `forge_list` | list rows, optionally by status |
| `forge_add_row` | add a picture idea (rejects path separators in filenames) |
| `forge_generate_pending` | generate everything pending, with an optional `limit` |
| `forge_generate_one` | generate one row by filename |
| `forge_retry_failed` | put failed rows back to pending |
| `forge_fix_retired` | move rows off models the provider switched off |
| `forge_models` | every model with its price, delayed price and free allowance |

The `generate` tools write real files under `--out` and update the CSV. A lock file next to the manifest (`<manifest>.lock`) stops two runs from generating the same rows twice; a stale lock from a dead process is taken over.

**Engine configuration.** With nothing configured it uses OVHcloud SDXL. To give it the engines the app has, point it at a backup file (`--settings ./image-forge-settings-….json`) or use environment variables:

| Variable | Meaning |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI, free |
| `POLLINATIONS_TOKEN` | Pollinations, free |
| `GEMINI_API_KEY` or `GEMINI_API_KEYS` | Google keys, comma-separated, rotated on `429` |
| `GEMINI_IMAGE_MODEL` | which Google model, for example `nano-banana-2-lite` |
| `OPENAI_API_KEY` or `OPENAI_API_KEYS` | keys for any OpenAI-compatible endpoint |
| `OPENAI_BASE_URL`, `OPENAI_IMAGE_MODEL` | point at Together, OpenRouter or a local server |
| `FORGE_PROVIDER` | force `ovh`, `cloudflare`, `pollinations`, `gemini`, `openai` or `local` |
| `FORGE_ALLOW_PAID` | `1` lets rows run on paid engines (off by default) |
| `FORGE_MAX_USD` | the most the server may spend, per process; default 1 |

Which engine a row uses, in order: the row's own `model` column, then `FORGE_PROVIDER`, then the engine selected when the backup was made (the practice forge is skipped), then the first one set up (Cloudflare, Pollinations, Google, OpenAI-compatible), then OVHcloud.

**Before you let an agent loop:**

- Give it a free engine. A loop is how you discover what your balance was.
- Cap the batch with `limit`. OVHcloud is slow on purpose: a limit of 10 takes about five minutes.
- Weak models cannot spell. The server suppresses text instructions on models that produce gibberish, as the app does.

For LangGraph, treat `forge_generate_pending` as a node and `forge_status` as the loop condition, and let the CSV be the state that survives between runs. See also [CONNECT-AGENTS.md](https://github.com/Stravelakis/image-forge/blob/HEAD/CONNECT-AGENTS.md).

## The manifest

One row is one picture. **`filename` is the only required column**; everything else has a default, so a two-column CSV of `filename,prompt` is valid.

```csv
id,filename,prompt,category,aspect_ratio,seed,model,status
1,image_cyber_noodle_bar.png,"rain-slick noodle stall, neon steam",image,16:9,41,cloudflare-flux,pending
```

Columns: `id`, `filename`, `prompt`, `negative_prompt`, `note`, `category`, `kind`, `rating`, `item_id`, `shop_id`, `event_id`, `style`, `aspect_ratio`, `width`, `height`, `seed`, `model`, `status`, `error`, `generated_at`, `imported_attachment_id`. The `model` column routes a row to an engine and beats every default, including the agent server's environment variables.

Status lifecycle: `pending → generating → done → imported`, plus `failed` and `skipped`. A row that hits a limit is parked with `retry_at` and requeues itself when the cooldown ends.

Filename rules, checked as you type with a one-click auto-fix. Five are house style and switchable; two always apply: **no characters Windows refuses** (`\ / : * ? " < > |`) and **unique across the manifest** (a duplicate would overwrite the first file).

A test called `csv-parity` pins that the app and the agent server read and write this file identically. Without it, an agent and a human working on one manifest would slowly corrupt each other's rows.

## Add an engine

1. A `MODELS` entry in `engines.mjs`, with a dated note of what you verified.
2. A branch in `generateBytes()`.
3. Teach `explainFailure()` what its errors really mean. Providers return `429` for "you have no money", which tells a user to wait for a reset that never comes.
4. A check in `testConnection.ts` that makes a **real** call.
5. If it is free, add it to `FREE_ENGINES` in **both** `engines.mjs` and `paidGuard.ts`.
6. A `ProviderId` in `engines.d.mts`, an entry in `PROVIDER_META`, and a toolbar option.
7. A test.

## Tests

Vitest, in `tests/`: more than 800 tests across about 50 files. Anything touching **the CSV, filenames, money or the engines** needs a test; those four fail silently and expensively. Worth knowing:

| Test | Pins |
|---|---|
| `csv-parity.test.ts` | the app and the MCP server read and write the manifest identically |
| `version.test.ts` | the version is the same in `package.json`, the app, the MCP server and `src-tauri` |
| `desktopApp.test.ts` | fixed ports, no `listen(0)`, no `productName`, ESM main process |
| `hoverHelp.test.ts` | every clickable control, label, heading, status and number carries a `data-tip`; each help is at most two sentences and 230 characters |
| `sourceHygiene.test.ts` | no invisible or control characters in source |
| `puppet.test.ts` | the real puppet code on owl pictures in `tests/fixtures/puppet/`; no engine is called |
| `vault.test.ts`, `sharedKeys.test.ts` | the real files, in a temp folder |

## Release

Branch → bump the five version fields (`tests/version.test.ts` enforces them) → CHANGELOG → tests, typecheck, build → build the exe and **install it** → PR → merge → tag `vX.Y.Z`. `release.yml` publishes the exes; `docs.yml` rebuilds this site. Full recipe in [HANDOFF.md](https://github.com/Stravelakis/image-forge/blob/HEAD/HANDOFF.md).

## Conventions

- No `console.log`, `alert` or `confirm` in shipped code. Feedback goes through toasts and the forge console.
- Comments explain **why**, never what, and carry the date a provider fact was confirmed.
- Plain English in the UI. Errors go through `lib/plainError.ts` and `components/ErrorLine.tsx`, so each one says what to do next.
- Free first: every paid engine needs a keyless fallback.
- Shared with Video Forge, copy by hand: `forgeKeys.mjs`, `forgeShelf.mjs`, `TipLayer.tsx`.

## How this site is built

The site lives in `/site` (the shared Stravelakis docs theme) and is served at `docs.stravelakis.com/image-forge/` through the organisation site. **Install (full)** and **Guide (full)** at the bottom are copied from `INSTALL.md` and `GUIDE.md` by `site/scripts/sync-docs.mjs` before every build, so a fact fixed there is fixed here. The tooltips come from `docs/glossary.yml`. The three levels are `site/src/docs/dev.md`, `plain.md` and `eli5.md`.
