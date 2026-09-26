# Changelog

All notable changes to Image Forge, in [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format; versions follow [Semantic Versioning](https://semver.org/). Every entry
that fixes something says what was actually wrong, because "various fixes"
helps nobody decide whether to update.

---

## [Unreleased]

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
