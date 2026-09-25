<div align="center">

<img src="public/favicon.svg" width="88" alt="">

# Image Forge

### Bulk AI images from one sentence — free, no account, your own keys

<img src="site/public/screens/start-results.png" alt="Image Forge's Start screen: a request for four potion shop fronts, and the four pictures it made on the free engine." width="860">

Say what you need and how many. Get back a folder of pictures, named and
sorted, with a list that says what happened to each one. Your API keys stay on
your machine — there is no account, no server, and nothing to sign up for.

**Runs free, with no card and even no key.** OVHcloud's hosted SDXL needs no
signup at all; Cloudflare Workers AI gives roughly 690 images a day; your own
machine is unlimited and private. Paid engines are there when you want them,
and the app asks before spending a penny.

<br>

### [⬇ Download for Windows](https://github.com/Stravelakis/image-forge/releases/latest)

*Installer and a no-install portable version. Free, open source, no account.*
<br>*Mac and Linux: run it from source — [two commands](#run-it-from-source).*

<br>

[![CI](https://github.com/Stravelakis/image-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/Stravelakis/image-forge/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Stravelakis/image-forge?label=release&color=f2a33c)](https://github.com/Stravelakis/image-forge/releases/latest)
[![Licence](https://img.shields.io/badge/licence-Apache--2.0-8cb56f)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-659-56b8a5)](tests/)

</div>

---

> **New in 1.0.2:** the app opens on a **Start** screen — one box, one number,
> one button — and a fresh install makes real pictures straight away. It also
> works hand in hand with [BYOK Vid Creator](#i-make-videos-with-byok-vid-creator).
> [Everything that changed](CHANGELOG.md).

---

## Start where you are

Three kinds of reader, each with guides written for them. Pick yours and
ignore the rest.

### 🙂 For everyone — no code, no terminal

| | |
|---|---|
| **[Download and install](docs/download.md)** | Windows, double-click. Includes what to do about the blue "Windows protected your PC" box. |
| **[Your first pictures](docs/no-code.md)** | What an API key is, which free engine to start with, and how to make your first batch. Nothing assumed. |
| **[Sheets, GIFs and lettering](docs/creators.md)** | Sprite sheets, mouth shapes for talking avatars, GIFs from a single still, text with perspective warp. |

### ✨ For vibe coders — let an agent do it

| | |
|---|---|
| **[Agents and the manifest](docs/vibe-coding.md)** | Wire it to Claude Code, Cursor or n8n over MCP and let an agent fill the manifest and run the forge. |

### 🧑‍💻 For developers — change the code

| | |
|---|---|
| **[How it is built](docs/developers.md)** | Architecture, the engine registry, how to add a provider, the test suite, releasing. |
| **[HANDOFF.md](HANDOFF.md)** | The full engineering map, every non-obvious decision, and the provider facts that contradict their own docs. |

**[📖 Documentation site — docs.stravelakis.com/image-forge](https://docs.stravelakis.com/image-forge/)** · **[The full manual](GUIDE.md)** · **[Install](INSTALL.md)** · **[What changed](CHANGELOG.md)** · **[When something is wrong](docs/troubleshooting.md)**

---

## Is this the thing you were looking for?

These are the specific problems it exists to solve. If none of them is yours,
it probably is not the right tool, and that is fine.

<details open>
<summary><b>"Google says my prepayment credits are depleted and I never spent anything"</b></summary>

<br>

**Linking your project to Google Cloud billing is what breaks it.** That sounds
backwards, so here it is in order:

1. Your project starts on the **free tier**. It works.
2. You link it to a Cloud billing account — to use your credit, or because
   something told you to.
3. Google now marks the project **paid tier**, and paid tier bills against a
   separate **Prepay – AI Studio** balance.
4. Ordinary Google Cloud credit does not pay for that balance. Neither does
   free-trial credit, and nor do most vouchers.
5. So the balance is zero, and every request is refused with a `429` that
   reads like a rate limit and is not one.

The result: a project with hundreds of euros of Cloud credit sitting in it
that cannot make a single call, *because* of the money. **Unlinking the
project restores the free tier** — confirmed on a real account, not repeated
from a forum.

Image Forge checks each key with a **real call**, not a model list — because a
key in this state lists all fifty models perfectly and then refuses
everything. It names the cause rather than the symptom, and the advice depends
on where the key sits: a key in your **free** pool is told how to get the free
tier back; a key in your **paid** pool is told its prepay balance is empty and
*not* to unlink, because unlinking would undo the very thing it is there for.

There is a second, different failure that looks identical from the outside.
Google also returns `403` *"Your project has been denied access"* — a block on
the whole project, not a billing problem, and not something more credit will
fix. On a real thirteen-key setup we found eight keys in the first state and
**five in the second**. The two are reported separately, by name.

It also finds the same key pasted into two slots, which is easy to do and
quietly halves what you thought your allowance was.

</details>

<details>
<summary><b>"My settings and keys keep disappearing"</b></summary>

<br>

If that was the 1.0.0 desktop app, it was the app, and it is fixed. 1.0.0
served itself on a different local port each launch, and the browser engine
inside keeps saved data per port — so every restart opened an empty store.

1.0.1 also makes saving **visible**. Settings shows when your settings were
last saved *and read straight back*, and how many keys are stored — counted,
never shown. There is **Save now**, **Back up to a file** and **Restore**. And
if stored data ever cannot be read, the app keeps the original aside and
stops saving until you decide, instead of quietly replacing it with defaults.

</details>

<details>
<summary><b>"I want a hundred images, not one, and I want them named properly"</b></summary>

<br>

The unit of work is a spreadsheet row. One row, one picture, one filename —
and the filename rules are checked as you type, with one-click fixes. Images
land in subfolders by what they are: `images/`, `vectors/`, `lottie/`,
`sheets/`, `gifs/`. The CSV records what was made, when, with which model, and
what went wrong if anything did.

A file's extension follows what the engine actually returned. Google and
Cloudflare send JPEG, so those files end in `.jpg` rather than claiming to be
PNG.

Failed rows can be retried on their own. Rows that hit a daily quota park
themselves and re-queue when the quota resets.

Want just one picture? The **Chat** makes one at a time from a description,
and can also write a whole list of rows for you.

</details>

<details>
<summary><b>"I don't want to paste my API key into somebody's website"</b></summary>

<br>

There is no backend. Keys live in your browser's local storage, or in
`%APPDATA%\image-forge` on the desktop build. They are sent to exactly one
place: the engine you chose. Nothing is phoned home, because there is nowhere
to phone.

The desktop build serves itself over `127.0.0.1` on a fixed local port, with
context isolation on and navigation locked to itself. Nothing listens on any
other interface, so nothing on your network can reach it.

</details>

<details>
<summary><b>"I want to spend nothing, or know exactly what I am about to spend"</b></summary>

<br>

Free engines are never gated. Paid ones always are: before a paid run you get
a dialog naming how many pictures will be billed, the model, the price per
picture, the total, and which credit it comes out of — including how many
days that credit has left. If the same queue also holds free rows, it says how
many. You can approve it, or switch to a free engine from the same dialog.

When Google's half-price delayed mode is available, a **New €/2 delayed
queue** button appears. Free-tier keys are always tried before paid ones.

</details>

<details>
<summary><b>"I want an agent to do this, not me"</b></summary>

<br>

`scripts/mcp-server.js` speaks MCP over stdio. Claude Code, Cursor, n8n and
LangChain can list the manifest, add rows, and generate real images through
the same engine code the app uses.

```bash
claude mcp add image-forge node scripts/mcp-server.js
```

Then: *"use the forge to make the pending images"* — and it will. With no keys
at all it uses OVHcloud, which needs none.

</details>

<details id="i-make-videos-with-byok-vid-creator">
<summary><b>"I make videos with BYOK Vid Creator and need pictures for my characters"</b></summary>

<br>

Install both on the same computer and they recognise each other. The vid
creator can ask Image Forge for mouth-shape sheets, sprites or anything else:

```bash
npm run ask-forge -- visemes kaiti --sheets viseme-sheets-v2
```

The request lands in a folder Image Forge watches, so neither app has to be
open at the same moment. Your keys never leave the forge, and a request on a
paid engine still stops and asks first.

Be warned, honestly: free engines usually draw **one** picture when asked for
a grid of nine mouth shapes — seen on a real run. The tools say so every time.
A Google model follows grid instructions far better.

</details>

---

## The engines

| `model` column | Engine | Cost per image | Free allowance |
|---|---|---|---|
| *(blank)* | Whichever engine you picked in the toolbar | — | — |
| `ovh-sdxl` | OVHcloud SDXL | **free** | **no key, no signup** · two a minute · always square, no seed |
| `cloudflare-flux` | Cloudflare Workers AI | **free** | ~690/day, resets midnight UTC, no card |
| `flux` · `turbo` | Pollinations | **free** | unlimited, ~one per 5s, needs a free token |
| *(your own machine)* | LocalAI, ComfyUI, LM Studio… | **free** | unlimited, private, no internet |
| `nano-banana-2-lite` | Google | $0.034 · delayed $0.017 | none |
| `nano-banana-2` | Google | $0.067 · delayed $0.034 | none |
| `nano-banana` | Google | $0.039 · delayed $0.019 | none — **off 2 Oct 2026** |
| `gemini-3-pro-image` | Google | $0.134 · delayed $0.067 | none |
| `dall-e-3` · `gpt-image-1` | Any OpenAI-compatible endpoint | ~$0.04 | none |
| *(practice forge)* | Procedural, offline, deterministic | free | infinite |

> Google, Cloudflare and OpenAI prices and allowances checked on
> **2 September 2026**; OVHcloud checked on **11 September 2026**. Free
> allowances drift — check the provider's own page before you build on one.
> "Delayed" is Google's half price for pictures you collect later.

The `model` column routes **each row** to its own engine, so one batch can mix
free and paid.

**Writing, code and vision** use separate text models. Enter an account once
(Mistral, OpenAI, OpenRouter, Google, NVIDIA or your own machine), load its
models, and pick one per job. One free Mistral key covers all three:
`mistral-medium-latest` writes and sees, `codestral-latest` writes code.

---

## What it does

**Start** — the front door. Describe it once, say how many, press the button.
With a text engine it writes a genuinely different prompt for each picture;
without one it varies the framing and says so.

**Chat** — describe one picture and get it, ask how the app works, or have it
write or rewrite rows. Every change to existing rows is shown before it is
applied. History on the left, grouped by date or model.

**The Wizard** — nine steps, one decision each. Name the batch, pick a world,
list the pictures (or let a text model write them), pick a look, a painter, a
shape, a home. Saved setups become one-click recipes.

**36 styles** in six families, with per-style notes on which engines can
actually do them. Star the ones you use and they come first. Infographics,
posters and the branded house style are limited to the models that can really
render text, rather than letting you find out the expensive way.

**Sheets** — sprite sheets, character turnarounds, expression sets, and viseme
sheets: the mouth shapes an avatar needs to look like it is speaking. Each
frame gets its own seed and a *"change only this"* instruction.

**GIFs** — turn any finished picture into an animation, or describe one and
have the frames generated.

**Text with perspective** — drop text onto an image and drag its four corners
independently. Real projective warp, so text sits on a wall or a sign instead
of floating over it.

**Vectors** — SVG and Lottie written by a code model, sanitised before
anything is rendered or saved.

**Key pools** — as many keys as you like per engine. On a `429` the key rests
and the next one retries the same row immediately. Check every key at once and
see which ones actually work.

**Files** — a linked folder (point it at a Drive sync folder for free cloud
backup), a ZIP with the structure and CSV, or one picture at a time. Click any
picture to see it full size.

**Your settings, provably saved** — last saved and read back at what time, how
many keys are stored, Save now, Back up to a file, Restore.

---

## The manifest is the contract

```csv
id,filename,prompt,category,aspect_ratio,seed,model,status
1,image_cyber_noodle_bar.png,"rain-slick noodle stall, neon steam",image,16:9,41,cloudflare-flux,pending
```

`filename` is the only required column. Everything else has a sensible
default. Import forgives missing columns; export is CSV or XLSX.

Any tool that can read and write this CSV is a first-class citizen of the
project. That is the whole design. [Every column, explained](docs/manifest.md).

---

## Run it from source

```bash
npm install
npm run dev
```

Opens at `http://localhost:3000`. Works on Windows, macOS and Linux. Full
setup, updating, repairing and uninstalling: [INSTALL.md](INSTALL.md).

Build the Windows installer and portable version:

```bash
node scripts/build-exe.js
```

---

## What it is not

Being straight about this saves everyone time.

- **Not signed yet.** Windows shows a blue "Windows protected your PC" box on
  first run. [What to click](docs/download.md). Free open-source signing is
  being prepared — [the policy, and what it will and will not change](CODE_SIGNING_POLICY.md).
- **Not a hosted service.** There is no cloud version and no accounts.
- **Not able to fix a provider's outage or an empty balance.** It will tell
  you clearly which one it is, and offer you a free engine instead.
- **Not able to make most models spell.** Only the Nano Banana family can be
  relied on for words in a picture. The Letterer adds real text afterwards.
- **Mac and Linux run from source only.** The packaged builds are Windows.
- **The portable version is not trace-free.** It keeps settings in
  `%APPDATA%\image-forge` on the computer it runs on.

---

## Licence

[Apache-2.0](LICENSE). Use it, sell what you make with it, build on it.

If you redistribute it or something derived from it, the [NOTICE](NOTICE)
file has to travel with it — in your docs, your own NOTICE, or your credits
screen. That is the one thing asked in return. Just *using* the app carries no
obligation at all.

---

## Contributing

Read **[STANDARDS.md](STANDARDS.md)** first — it is short, and it says what
"done" means here. Then **[HANDOFF.md](HANDOFF.md)** for how the project fits
together.

`npm test`, `npm run typecheck` and `npm run build` all run in CI on every
push. Anything touching the CSV, filenames, money or the engines needs a test.

---

<div align="center">

Built with React · Vite · Tailwind · Electron.
No backend. No accounts. Your keys, your machine.

*struck, not templated* ⚒

</div>
