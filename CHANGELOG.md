# Changelog

All notable changes to Image Forge, in [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format; versions follow [Semantic Versioning](https://semver.org/). Every entry
that fixes something says what was actually wrong, because "various fixes"
helps nobody decide whether to update.

---

## [Unreleased]

Tests: 715 across 39 files.

### Added

- **Made** (it was the Forge tab, and the Gallery's Images page): statistics
  (made, today, waiting, failed, spent, a count by engine), then every picture,
  sheet, GIF and puppet with its exact date, engine and status; **Redo** on each,
  **Redo N marked or failed**, a heart and a cross, **GIF**, click to zoom, and
  **Edit as a table** for the spreadsheet. Thumbnails are kept between restarts
  (they lived only in memory before), and **Find them in my folder** brings back
  the ones made earlier from your linked folder.
- **Start** is simpler: describe it once, say how many, pick a **Style** (the
  word links to Styles), a shape, and an **engine** from a drop-down of the
  engines that are set up, ending in **Add more engines…**. It keeps the run in
  progress and the last run, with **See everything in Made →**.
- A single **Make the N waiting** button in the header (not shown on Made).
- **Wizards are four makers:** Make pictures (three steps), Make a puppet,
  Animate a character, and Prompt factory (copy for Google Sheets, Excel, CSV).
  Uploading to WordPress moved to **Download**. **Gallery** is Everything made,
  Styles and **Templates** (picture setups and puppet templates).
- **Make a puppet:** describe a character (or add up to three inspiration
  photos), pick head, waist-up (default) or full body, and get a puppet for
  Video Forge that talks, blinks, raises its brows, nods and, from the waist up,
  waves, points and shrugs. Four faces are drawn and a picture checker marks
  each; the parts are edits of the chosen face with at most three tries each.
  Two engines (faces, parts), including Z-Image and FLUX.2 klein on your own
  machine through LocalAI, and Cloudflare FLUX.2. The mouth is with lips or
  without (guessed from the description); the background colour is chosen per
  character (magenta, else green, else blue) and the colour spill is cleaned;
  half-open mouths; arm poses are whole-body pictures; an optional side-facing
  view for two characters talking and a sitting view for full body. **Send to
  Video Forge**, **Save zip**, **Save as template**, and **Delete this puppet**
  (asks twice; moved to `%APPDATA%\Forge\puppets-deleted`, not erased). Video
  Forge can order a puppet and Image Forge opens the maker filled in. Method:
  `docs/puppet-recipe.md`; in plain words: `docs/puppets-eli5.md`.
- **Cloudflare FLUX.2** (dev and klein) as engines that work from a picture —
  free reference sheets on Cloudflare.
- **Keys shared with Video Forge.** When both apps are installed, a key typed
  into either works in both: Google (Gemini), OpenRouter, NVIDIA, Mistral,
  Cloudflare, Pollinations, OpenAI, Groq, ElevenLabs and Fish. They are kept in
  `%APPDATA%\Forge\shared-keys.bin`, locked by Windows so only your Windows user
  can read it. A shared key only fills an empty box; it never replaces one you
  typed. Windows only.
- **The twin switch.** The header shows both Forge marks; clicking Video
  Forge's opens it. Hidden when Video Forge is not installed.
- **Hover help on every control:** one bubble over everything (two short
  sentences, optionally a link to the docs), and a test that fails on any
  control without one.
- **Cursor pet:** a violet fox runs after the mouse, sits, naps. Any walk cycle
  from Animate a character can replace it (**Make it my cursor pet**).
- **Settings → Language & pet** (was Appearance): English now; Greek, French,
  German, Spanish and Portuguese are coming, in simple words.
- A **Test** beside every key, run on paste.
- The **Forge ground:** a black ground, the violet "forge" accent, Sora type and
  pill buttons.

### Changed

- New icon: the camera-on-anvil mark on a transparent background.
- **Settings → Appearance removed**; its colour and movement choices are gone.
- Chat and the other writing jobs: a job with no key takes a provider that has
  one, and a busy (429) or retired model falls back to the next engine with a
  key.
- The MCP server and `CONNECT-AGENTS.md` now say what is true: with no keys it
  uses OVHcloud (not Pollinations). The in-app Docs and Agents pages were
  rewritten; the Agents page lists the real eight `forge_*` tools.

### Fixed

- **Empty settings when another copy held the port.** The page's storage
  belongs to its address, port included, so a second copy opened on 47822 with
  no keys, no settings and an empty list. Everything the page keeps is now also
  saved in a file the app owns (`electron/vault.mjs`, locked with Windows'
  per-user encryption), loaded first, with what other ports held merged in once.
  Reset clears it too. Test copies name their own ports with `IMAGEFORGE_PORTS`.
- Halt now aborts requests that are already in flight.
- The NVIDIA and Cloudflare relay now sends request bodies with a length, over
  IPv4: the Chat's fallback to NVIDIA used to hang and end in "read ECONNRESET"
  after 37 seconds.
- Google models were sent your reference picture's request without the
  picture: "from a reference" sheets on Google were really from nothing.

## [1.0.4] - 2026-09-26

### Changed

- **Libraries brought up to date:** React 19, Vite 8, Vitest 5, TypeScript 7,
  Electron 44.4.4 and twelve others. Each was updated on its own and kept only
  after typecheck, all 672 tests and the build passed; the app was then driven
  through every screen. Nothing you do in the app changes.

### Fixed

- The screenshot script no longer hangs at the end.

## [1.0.3] - 2026-09-26

### Added

- **Update now.** When a newer version is out, the desktop app downloads the
  installer from this project's own release page, installs it and reopens by
  itself. It accepts installers from nowhere else. Your data is not touched.
- **Open it in your browser instead of a window** (Settings → Advanced).
  Switching carries your settings, keys and list across; the app keeps running
  from a small icon by the clock. Switch back the same way. The linked folder
  has to be picked again once, because browsers do not share folder
  permissions.

### Fixed

- **"Check for app update" never showed the new version.** It found the
  release and then set up a window that nothing displayed, so a newer version
  looked like silence. The window now appears.

## [1.0.2] - 2026-09-25

### Added

- **A Start screen, and the app opens on it.** One box — "What do you need?" —
  a number, a look, a shape, and one button. Twelve different pictures from one
  sentence, without meeting the spreadsheet first. With a text engine set up it
  writes genuinely different prompts; without one it varies the framing, and
  says which it did. The spreadsheet is one click away.
- **Image Forge and BYOK Vid Creator recognise each other** when both are
  installed. The vid creator can ask the forge for pictures — mouth-shape
  sheets for its puppets, sprites, anything — through a folder in the forge's
  data directory. API keys never leave the forge, neither app has to be open
  at the same moment, and requests on paid engines still stop and ask first.

### Changed

- **A first run with nothing set up makes real pictures.** The default engine
  is now OVHcloud, which needs no key; it used to be the offline practice
  forge. Saved settings keep whatever engine they had.

### Fixed

- **JPEG pictures were still saved as `.png` on several paths.** 1.0.1 fixed
  the normal queue, but not Google's half-price delayed queue (every picture
  from it is JPEG), keeping a variant, duplicating a row, or the agent server.
  All of them now name a file for what its bytes actually are.
- **A duplicated or de-duplicated JPEG got two extensions** — `a.jpg` became
  `a.jpg_2.png`. It is now `a_2.jpg`.
- **New rows started with the old `item_` prefix.** They now start `image_`.
- The row button said **Save PNG** whatever the file was. It now says
  **Save picture**.

---

## [1.0.1] - 2026-09-13

### If you used 1.0.0 on the desktop, read this first

**1.0.0 lost your settings and keys every time you restarted it.** It served
itself on a different local port each launch, and the browser engine inside
keeps saved data per port — so every launch opened a fresh, empty store.
Nothing failed to save; each launch simply looked somewhere new.

1.0.1 uses a fixed port, so settings stay put from now on. Keys you typed into
1.0.0 are stranded under old ports and **need entering once more**. After that,
**Settings → Back up to a file** keeps a copy outside the app.

### Fixed

- **Cloudflare and NVIDIA did not work in the desktop app.** The part of the
  app that talks to them crashed on the first request. They only ever worked
  when running from source. Checked on a real install.
- **Saved settings could be wiped by one bad read.** If the app could not read
  what was stored, it fell back to defaults — and then saved those defaults
  over your real data a moment later. Unreadable data is now kept aside under
  a `.rescue` copy, saving pauses, and the app tells you.
- **"Delete my data too?" in the uninstaller deleted nothing.** It pointed at a
  folder that has never existed. It now removes the real one,
  `%APPDATA%\image-forge`, and a silent uninstall never deletes data.
- **The paid-run dialog overstated the bill.** A queue of 2 paid pictures and
  20 free ones was announced as "22 pictures". It now counts only what is
  billed and says how many are free.
- **Files were named `.png` whatever they really were.** Google and Cloudflare
  return JPEG. The extension now follows the actual file.
- **A paid Google key was checked as if it were a free one**, and told to
  unlink its billing — the one thing a paid key needs. Free and paid keys now
  get the advice that fits them.
- **The desktop app showed nothing at all if it could not start.** It now says
  why.
- **The "no special characters" filename rule also rejected capitals**, so
  switching off "lowercase only" changed nothing.
- **NVIDIA showed "Failed to fetch".** NVIDIA refuses requests from a browser
  page; the app now routes around that, as it already did for Cloudflare.
- **The desktop app was listed with no publisher**, and an old project name in
  its file details.

### New

- **OVHcloud SDXL** — a free image engine that needs no key and no signup.
  Two pictures a minute, always square, no seed.
- **Chat** — make one picture by describing it, ask how the app works, have it
  write a whole list of rows, or have it rewrite rows you already have (you
  see every change before it is applied). History down the left, grouped by
  date or by model.
- **Text engines, set up once** — enter an account at the top (Mistral,
  OpenAI, OpenRouter, Google, NVIDIA, or your own machine), load its models,
  and pick one for each job: writing, code, vision. Each job is tested for the
  job it does.
- **"Only show free models"** — works for providers that publish prices
  (OpenRouter). For those that do not, the app says so rather than guessing.
- **Save now, Back up to a file, Restore** — and a line saying when your
  settings were last saved *and read back*, with a count of stored keys (never
  the keys themselves).
- **See a picture full size** — click it.
- **Favourite styles** — star the looks you use; they come first.
- **Skilitsa and Skilitsa Plain** — a house 3D cartoon style, with and without
  a small branding mark. The branded one is limited to models that can spell.
- **Filename rules you can switch off** — five of the seven. The two that
  protect your files (no characters Windows refuses, no duplicates) stay on.
- **Categories describe what a row makes**: image, svg, lottie, sheet, gif.
  Old `shop_` / `item_` / `event_` / `npc_` names still count as images.
- **The whole interface takes the accent colour you pick**, not just the
  highlights.
- **The desktop window reopens where you left it**, and **Help → Where is my
  data?** opens the folder.

### Known limitations

- The Windows files are **not code-signed**. Windows shows "Windows protected
  your PC" on first run: More info → Run anyway.
- The portable version still saves settings in `%APPDATA%\image-forge` on the
  computer it runs on.
- Mac and Linux run from source only.

---

## [1.0.0] - 2026-09-02

First release.

[Unreleased]: https://github.com/Stravelakis/image-forge/compare/v1.0.4...HEAD
[1.0.4]: https://github.com/Stravelakis/image-forge/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/Stravelakis/image-forge/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/Stravelakis/image-forge/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Stravelakis/image-forge/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Stravelakis/image-forge/releases/tag/v1.0.0
