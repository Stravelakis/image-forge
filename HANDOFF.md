# ⚒ Image Forge — Engineering Handoff

> **Read this before touching anything.** It maps every subsystem, explains the
> non-obvious decisions, and ends with recipes for the changes you are most
> likely to make. True as of **25 September 2026, version 1.0.2**. If this file
> and the code disagree, the code wins — then fix this file.

Also read: **[STANDARDS.md](STANDARDS.md)** (what "done" means here, and how
this repo applies the owner's shared repo standards),
**[CHANGELOG.md](CHANGELOG.md)** (what changed and why),
**[docs/troubleshooting.md](docs/troubleshooting.md)** (provider behaviour that
contradicts provider documentation).

---

## 1. Orientation (60 seconds)

Image Forge is a **manifest-driven image pipeline**. A CSV is the single
source of truth: rows describe pictures, a queue runner turns them into files,
files land sorted on disk.

**Design philosophy, in three lines:**
1. The manifest is the API — anything that reads/writes the CSV is a citizen.
2. Free first — every paid path has a keyless fallback.
3. One decision per step, plain English — a ten-year-old runs a batch.

It runs three ways from one codebase: the browser (`npm run dev`), the Windows
desktop app (Electron), and an agent API (MCP over stdio). The first two share
the UI; all three share `src/lib/engines.mjs`.

---

## 2. Run it

```bash
npm install
npm run dev                 # browser app → http://localhost:3000
npm test                    # vitest — 659 tests across 33 files
npm run typecheck           # tsc --noEmit (vite build does NOT typecheck)
npm run build               # vite build → dist/
node scripts/build-exe.js   # Electron installer + portable → release/
node scripts/mcp-server.js  # the agent API (stdio)
npx electron scripts/capture/capture.mjs   # real screenshots + share card (after npm run build)
cd site && npm run dev      # the docs site, locally
```

CI (`.github/workflows/ci.yml`) runs typecheck, tests and build on every push
and pull request. A red CI is not "probably fine".

`src-tauri/` is **experimental**. It is not built in CI or released, and has
not been built at all recently: this needs Rust and the Microsoft C++ Build
Tools, which the release machine does not have. Its version and dev address
are kept in step by `tests/version.test.ts`, but **Cloudflare and NVIDIA do not
work in it** — Tauri has no equivalent of the `/cf-api` and `/nv-api` proxies,
so those browser-refusing providers fail there.

---

## 3. Architecture at a glance

```
                     ┌──────────────────────────────────────────────┐
                     │                    App.tsx                   │
                     │ rows · settings · strike loop · save/rescue  │
                     │ folder doors · toasts · log                  │
                     └───────┬──────────────────┬────────────────┬──┘
                             │                  │                │
                ┌────────────▼─────┐   ┌────────▼───────┐  ┌─────▼────────┐
                │  providers.ts    │   │   output.ts    │  │ settings-    │
                │ settings shape · │   │ folder · ZIP · │  │ Backup.ts    │
                │ migration · text │   │ blob helpers   │  │ verified save│
                │ chat · wraps ▼   │   └────────────────┘  └──────────────┘
                └────────┬─────────┘
                         │
              ┌──────────▼──────────┐   the same file is imported by
              │    engines.mjs      │◀── scripts/mcp-server.js
              │ MODELS · routing ·  │    (DOM-free on purpose)
              │ generateBytes · 429 │
              └──────────┬──────────┘
      ┌──────────┬───────┼─────────┬──────────┬───────────┬──────────┐
      ▼          ▼       ▼         ▼          ▼           ▼          ▼
  simulated    local    ovh   cloudflare pollinations  gemini   openai-compat
  (practice) (LocalAI) (no key) (proxied)  (token)    (paid)    (paid)
```

The UI is a view switch rendered by `App.tsx`, with a top menu
(`TopMenu.tsx`): Start, Forge, Chat, Wizards, Gallery, Docs, Settings. The app
opens on **Start** (`components/StartView.tsx`).

---

## 4. Module map

| file | owns | worth knowing |
|---|---|---|
| `types.ts` | vocabulary | `Category` = `image · svg · lottie · sheet · gif`; `migrateCategory()` maps old `shop/item/event/npc` rows on load |
| `lib/engines.mjs` | routing, prices, requests, file types | **DOM-free.** `MODELS`, `resolveRoute`, `generateBytes` (MIME from the bytes), `estimateCost`, `explainFailure`, the OVH pacer, `withStyleBlock` (style first on SDXL). Types in `engines.d.mts` |
| `lib/providers.ts` | browser wrapper | `ForgeSettings`, `normalizeSettings` (all migrations), key pools, `scribeChat` |
| `lib/csv.ts` | the contract | RFC 4180 parser; forgiving import |
| `lib/validate.ts` | filename rules | `RULES` (7; 2 unswitchable), `nameForMime` (extension follows bytes), `autoFixFilename` |
| `lib/paidGuard.ts` | money | `checkPaidRun` routes **each row** — it counts only billed rows |
| `lib/testConnection.ts` | "does this key work?" | real calls, not model lists; Gemini checks know free vs paid pool |
| `lib/visionEngine.ts` | chat/vision models | `readModelEntry` (price, vision, chat from provider metadata), `filterModels`, `routeBase` (NVIDIA proxy) |
| `lib/settingsBackup.ts` | proof of saving | `saveSettingsVerified` (write, read back, compare), `censusOf` (counts keys, never shows them), backup file |
| `lib/storage.ts` | the 5 MB box | `safeSet` reports failure in words |
| `lib/chatPlan.ts` + `appFacts.ts` | the Chat | `FORGE:` / `ROWS:` / `EDIT:` reply protocol; the chat answers app questions only from `APP_FACTS` |
| `lib/chatStore.ts` | chat history | |
| `lib/styleCatalogue.ts` | 36 styles, 6 groups | which engines can do which look; `needsText` styles are limited to models that spell |
| `lib/sheets.ts` | sprite / turnaround / viseme / expression / avatar eyes & brows | each frame gets its own seed plus a "change ONLY this" instruction |
| `lib/warp.ts`, `textLayer.ts` | the Letterer | homography maths; text auto-shrinks |
| `lib/vectorAssets.ts` | SVG + Lottie | `sanitiseSvg()` strips scripts and external refs |
| `lib/theme.ts` | colour | the whole palette is derived from the accent hue |
| `lib/version.ts` | `APP_VERSION` | must equal `package.json` — `tests/version.test.ts` enforces it |
| `components/TextEngines.tsx` | accounts + three jobs | dedupes models across accounts; free-only filter hides only what a provider states |
| `components/ui.tsx` | primitives | inline SVG icons, `Btn`, `Lightbox` |
| `lib/startPlan.ts` + `components/StartView.tsx` | the Start screen | one sentence + a number → N prompts: the text engine writes them if set up, otherwise built-in framings; says which |
| `lib/link.ts` + `electron/link.mjs` | the link to BYOK Vid Creator | see §14.2 — validation lives only in `link.mjs` |
| `electron/main.js` | desktop shell | see §9 |
| `scripts/build-exe.js` + `build/installer.nsh` | packaging | see §9 |

---

## 5. Data and persistence

| store | key | contents |
|---|---|---|
| localStorage | `image-forge-manifest-v1` | rows (minus `preview`), style lock — debounced 350 ms |
| localStorage | `image-forge-settings-v1` | `ForgeSettings`, saved on every change and **read back** |
| localStorage | `…-v1.rescue` | the original bytes of anything that could not be read at startup |
| localStorage | `image-forge-setups-v1` / `-batches-v1` | recipes / batch registry |
| IndexedDB | `image-forge` → `kv.dir` | the linked folder handle |
| disk (desktop) | `%APPDATA%\image-forge` | Electron's data folder: all of the above, plus `window-state.json` |

**The rescue rule (do not undo it).** `loadInitial` / `loadSettings` report
`stored`, `empty` or `rescued`. On `rescued` the raw bytes are copied to the
`.rescue` key and autosave for that store is **held back**. Before this, one
unreadable read fell back to defaults and autosave wrote those defaults over
the real data 350 ms later — observed: a 26-row manifest reduced to 8 seed
rows, engine reset.

**The data folder name.** Electron names it after `package.json` `name`
(`image-forge`) because there is no `productName`. **Adding a `productName`
would silently move every user's data to a new empty folder.** A test forbids
it.

`imagesRef` (a `Map<filename, Blob>`) is in memory only. Pictures reach disk
through the folder, ZIP or per-picture save.

---

## 6. Engine internals

`resolveRoute(row, settings)` → `{ engine, apiModel, def }`. **The row's
`model` column wins**; blank falls back to `settings.provider`. A route can
also be `retired` (the provider switched the model off) or `paused` (the user
switched the engine off) — both fail immediately with a sentence.

**Key rotation** is inside `generateBytes`: healthy keys only, free Gemini keys
before paid; on `429` the key is benched and the same row retries with the
next key. Only when the whole pool rests does the row park with `retry_at`.

**Provider facts that contradict their own docs** (dated, verified on live
accounts — keep adding to these):

| Provider | Fact |
|---|---|
| Google | Image API accepts only `image/jpeg`. `429` can mean "no prepay balance". `403` can mean a project-level ban |
| Cloudflare | Sends no CORS headers — must be proxied. Rejects the whole request if `seed` is sent. Returns JPEG |
| NVIDIA | Preflight `200` with no `Access-Control-Allow-Origin` — must be proxied (4 Sep 2026) |
| OVHcloud | No key. Two a minute anonymously. Only `prompt` + `negative_prompt`. PNG 1024² (11 Sep 2026) |
| Pollinations | Anonymous requests refused with a Turnstile error; needs a free token |
| Mistral | `pixtral-large-latest` not on the account; `mistral-medium-latest` does vision (2 Sep 2026) |
| OpenRouter | Publishes a price per model, so "free only" is exact there |

**The OVH pacer.** OVH's limit clears in seconds, but a `429` on the normal
path parks a row for hours. So `engines.mjs` queues OVH calls one behind
another, 31 s apart, however many lanes run, and waits out `RateLimit-Reset`.

**Proxies.** Cloudflare (`/cf-api`) and NVIDIA (`/nv-api`) are forwarded in
**both** `vite.config.js` (dev) and `electron/main.js` (desktop). They must
stay in step. Node has no CORS, so the MCP server calls both directly.

---

## 7. Money

`paidGuard.checkPaidRun` routes every row on its own, counts only the rows
that bill, prices each at the billed model's rate, and names the credit that
runs out soonest. Free engines (`local`, `simulated`, `cloudflare`,
`pollinations`, `ovh`) are never gated. There is **no spending guard over
MCP** — no human is there to confirm — so keep paid keys out of an agent's
environment.

---

## 8. Output doors

1. **Browser File System Access** — `showDirectoryPicker`, handle in
   IndexedDB. Blocked in sandboxed iframes by design.
2. **ZIP** — always works.
3. **One picture** — Save from the row.

Files go into `images/ vectors/ lottie/ sheets/ gifs/` (from `CATEGORY_META`).
The filename extension is corrected from the real MIME type when a picture
comes back (`nameForMime`), never the stem, and never onto another row's name.

---

## 9. The desktop app

`electron/main.js` is **ESM** (`"type": "module"`). Never `require()` in it —
v1.0.0 did, inside the proxy, and Cloudflare and NVIDIA crashed in the desktop
app while working in the browser.

- Serves `dist/` on `127.0.0.1`, **fixed** ports 47821–47825. Never
  `listen(0)`: storage is per origin, so a random port was a new empty store
  every launch (the 1.0.0 "keys disappear" bug).
- Single instance; a second launch focuses the first window.
- `APP_USER_MODEL_ID` must equal `appId` in `build-exe.js`. Never change it —
  it is how an installer knows it is an upgrade.
- Window size and position in `window-state.json`, dropped if off-screen.
- A port that will not open shows an error box rather than no window.
- Help → Where is my data? opens `app.getPath("userData")`.

`build/installer.nsh` adds one uninstall question. It deletes
`$APPDATA\image-forge` only on Yes, and **`/SD IDNO` makes a silent uninstall
answer No**.

`author` in `build-exe.js` must be an object (`{ name }`) — a string left the
Publisher blank in Settings → Apps.

The exes are **not signed**. electron-builder's log says "signing with
signtool" even so; `Get-AuthenticodeSignature` reports `NotSigned`.

---

## 10. Releasing

0. Follow the owner's release gate (STANDARDS.md → repo standards §2): README
   and HANDOFF current, full audit, `gitleaks git -v` clean, CHANGELOG entry
   written, docs site rebuilds. Work on a `release/x.y.z` branch and merge by
   PR — never push straight to master.
1. Bump the version in `package.json`, `src/lib/version.ts`, the
   `version:` in `scripts/mcp-server.js`, `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml`. `tests/version.test.ts` fails if they differ.
2. Add a `CHANGELOG.md` entry that says what was actually wrong.
3. `npm test`, `npm run typecheck`, `npm run build`.
4. `node scripts/build-exe.js` (set `FORGE_OUTPUT` to a folder outside the repo
   if Windows Defender locks `win-unpacked`).
5. **Install it for real** — see STANDARDS #6. What was checked for 1.0.1 on a
   real machine: listed in Settings → Apps with publisher and version; Start
   Menu and Desktop shortcuts pointing at the exe; starts on 47821 with one
   window; the Cloudflare route answers rather than crashing; a second launch
   opens no second copy; closes cleanly; window state written; same port on
   relaunch; silent uninstall removes app and shortcuts and keeps data.
6. Refresh screenshots: `npm run build`, then
   `npx electron scripts/capture/capture.mjs` (add `--skip-make` offline). It
   drives the built app in a throwaway profile and writes
   `site/public/screens/*.png` and the 1200x630 `site/public/og-image.png`.
7. PR → CI → `gh pr merge`, then push a `vX.Y.Z` tag on master.
   `release.yml` builds and publishes both exes; `docs.yml` rebuilds the docs
   site. The GitHub repository's social preview image cannot be set by API —
   upload `site/public/og-image.png` by hand in Settings → General.

**Code signing (not live).** Releases are unsigned. The plan is SignPath
Foundation's free open-source programme — see
[CODE_SIGNING_POLICY.md](CODE_SIGNING_POLICY.md) for its conditions and status.
Once the maintainer is approved, the release workflow gains one step between
"Keep the files" and "Publish the download page": upload the unsigned exes as
an artifact, then `SignPath/github-action-submit-signing-request@v1` with
`api-token` (a repository secret), `organization-id`, `project-slug`,
`signing-policy-slug`, `github-artifact-id` (the upload step's output),
`wait-for-completion: true` and `output-artifact-directory`, and publish the
signed files from that directory. The slugs only exist after approval, so this
is **deliberately not wired in yet** — an untested step in the release path
would break the next release. Follow
[SignPath's GitHub guide](https://docs.signpath.io/trusted-build-systems/github)
when doing it, and update the policy page's status in the same commit.

**Documentation site:** `site/` is a copy of the owner's shared **docs-theme**
(Astro; repo standards §7): three reading levels in `site/src/docs/dev.md`,
`plain.md` and `eli5.md`, screenshots in a carousel, a share card. Most edits
go in `site/site.config.ts` and those three files. `docs.yml` builds it on
every `v*` tag (and by hand) and deploys to GitHub Pages; it is live at
**https://docs.stravelakis.com/image-forge/**. Tags can only deploy because
Settings → Environments → `github-pages` has a rule allowing `v*`.

`docs/*.md` stay as the in-repo guides that README links to; they are no
longer a website.

That address comes from the **organisation site**, the separate repository
`Stravelakis/Stravelakis.github.io`, which owns `docs.stravelakis.com`. GitHub
serves every project site that has no custom domain of its own under the
organisation site's domain, at `/<repo>/`. So **never give this repository its
own custom domain** — that would pull it out from under the shared domain.
`base: '/image-forge'` in `site/astro.config.mjs` must match the repository name.

---

## 11. Recipes

**Add an image engine** → a `MODELS` entry in `engines.mjs` (with a dated
`note` about what you verified); a branch in `generateBytes`; teach
`explainFailure` its errors; add to `FREE_ENGINES` in **both** `engines.mjs`
and `paidGuard.ts` if free; `ProviderId` in `engines.d.mts`; `PROVIDER_META`;
a toolbar option in `TopMenu.tsx`; a `testConnection` check that makes a real
call; a test. If it refuses browsers, add a proxy in both places (§6).

**Add a style** → `STYLE_CATALOGUE`. A look that needs readable words gets
`needsText: true` and a recommended list of models that can spell. No studio
trademarks in a name or prompt — a test enforces it.

**Add a setting** → `ForgeSettings` + `DEFAULT_SETTINGS` + a line in
`normalizeSettings`, so older saved settings still load.

**Change the CSV schema** → `FULL_COLUMNS` + both directions in `csv.ts` +
`docs/manifest.md`. `csv-parity.test.ts` pins that the app and the MCP server
agree.

---

## 12. Known sharp edges

- **Components have almost no tests.** The libraries are well covered; the UI
  is verified by hand. Biggest gap.
- **localStorage is ~5 MB.** Previews are never stored. A very large manifest
  will eventually need IndexedDB.
- **OVH**: square only, no seed, two a minute, and it reads only the first
  ~77 tokens of a prompt. It does **not** follow "draw a 3x3 grid of nine
  panels" — on a real request it painted one portrait. Sheets need a Google
  model or your own machine with a reference picture.
- **The portable exe** keeps settings in `%APPDATA%\image-forge`.
- **Keys from 1.0.0** live under old random ports and are not migrated.
- **File type comes from the bytes, in one place.** `mimeFromBytes`,
  `nameForMime`, `withSuffix` and `uniqueName` live in `engines.mjs` so the app
  and the MCP server share them; `validate.ts` only re-exports. `generateBytes`
  overrides any engine's claimed MIME type with what the bytes say. Do not add
  a second copy anywhere — every `.png`-only assumption was a copy.
- **Two `SettingsSection` unions** (`SettingsView.tsx`, `TopMenu.tsx`) are
  synced by hand.

---

## 13. Where to take it next

1. Component tests for the flows that touch money and files.
2. Code signing — SignPath Foundation, deferred until there is real use to
   show (CODE_SIGNING_POLICY.md).
3. Repo standards §6 still missing: a **browser-mode toggle** inside the app
   (one codebase, the user's choice of window or browser) and an **Update**
   button that installs the latest release rather than only checking.
4. Key pooling with rotation for text engines (they currently use one account
   per job).
5. A headless `forge` CLI wrapping the MCP server.

---

## 14. The direction (decided 20 September 2026, built 25 September)

Two things were agreed on 20 September and both shipped in 1.0.2. This
section keeps the reasoning so later work does not drift from it.

### 14.1 Make it straightforward and intuitive

**Built (1.0.2):** the Start screen is the front door and the default view; a
fresh install defaults to OVHcloud, so the first press makes real pictures.
**Still to do** under the same principles: fewer decisions on the common path
elsewhere (settings sections, the wizard), and a progress view worth watching
for big runs.

The app is powerful and **not easy**. It is a manifest, a queue, nine settings
sections, three text engines, seven filename rules and a wizard, and a newcomer
meets all of it at once. The goal for the next phase is **high-volume image
making that feels obvious**, not more features.

Working principles for that work:

- **One obvious path in.** Say what you want, in one box, and get pictures.
  Everything else — the manifest, the rules, the engines — becomes the thing
  you *can* open, not the thing you must learn.
- **Nothing configured to begin.** OVHcloud needs no key: first run should
  already be able to draw.
- **Bulk is the product.** Sixty pictures should be as easy to ask for as one.
  The chat already writes whole lists; that path deserves to be the front door.
- **Settings are for later.** Anything the app can decide for itself, it
  should, and say what it decided.
- **Count the clicks.** A change that adds a decision to the common path is a
  change that has to justify itself.

### 14.2 Interconnection with BYOK Vid Creator — not a merge

[`BYOK-Vid-Creator`](../BYOK-Vid-Creator) is a separate Electron app that turns
scripts into narrated lesson videos: script → narration → puppet avatars with
lip-sync → background clips → rendered MP4.

**The decision taken on 20 September 2026: they stay two apps.** No merge, no
shared UI, no shared repository. What is wanted is narrower and much safer —
**game recognising game**: when both are installed on the same computer, they
notice each other and cooperate.

The direction of the favour is one-way and specific: **the vid creator asks
the image forge for the pictures it needs** — viseme sheets, sprite sheets,
character turnarounds, expression sets, backgrounds — instead of a person
exporting files from one app and hand-placing them in the other.

Handles that already exist, so this needs no new plumbing invented:

- Image Forge serves itself on a **fixed local port** (47821–47825), so it is
  discoverable by a program on the same machine.
- `scripts/mcp-server.js` already exposes the whole pipeline as **eight tools
  over stdio**, and already writes real files and updates the manifest.
- `lib/sheets.ts` already plans viseme, turnaround, expression and avatar
  eyes/brows sheets — exactly the assets the puppets are made of.

**Built (1.0.2), chosen by the owner:** shared folders, not a network call;
free requests run by themselves, paid ones stop at the usual dialog.

```
%APPDATA%\image-forge\link\presence.json          the forge is running: version, port
                           inbox\<id>.json          a request (dropped by the other app)
                           inbox\rejected\<id>.*    refused, with a .why.txt
                           processing\<id>.json     claimed, being made
                           outbox\<id>\*            the pictures, then done.json last
```

- `electron/link.mjs` (main process) is the **only** place a request is
  validated: id shape, at most 60 rows, plain lowercase picture filenames, a
  size limit. The page never sees an unvalidated request.
- The page polls `/link/requests` every 5 seconds. Every link route demands an
  `X-Forge-Link: 1` header: a custom header forces a browser preflight, which
  this server never grants, so no other web page on the computer can drive it.
- Rows carry `request_id` (kept in the app, not in the CSV). When every row of
  a request has ended — a row parked on a rate limit has not — the page sends
  each picture and then `done`. A picture made in an earlier session is no
  longer in memory and is reported as failed with a reason, not skipped.
- Keys never cross over. Neither app has to be open at the same moment.
- The vid creator's half: `tools/lib/forgeLink.mjs` and
  `npm run ask-forge -- visemes <character>`.

**Verified end to end on 25 September 2026** on the installed 1.0.2: the vid
creator asked, the forge made the picture on OVHcloud and handed it back, the
vid creator built the sheet. And the **honest result**: SDXL ignored the grid
instruction and painted one portrait, so the "sheet" was one picture cut in
nine. Both apps now warn about this every time; see §12.

The matching note is in `BYOK-Vid-Creator/docs/HANDOFF.md`; keep the two in
step.
