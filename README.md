<div align="center">

<img src="public/favicon.svg" width="88" alt="">

# Image Forge

### Bulk AI image generation from a spreadsheet, using your own API keys

Give it a list of pictures you want. Get back a folder of images, named and
sorted, with a CSV that says what happened to each one. Your API keys stay on
your machine — there is no account, no server, and nothing to sign up for.

**Runs free with no credit card.** Cloudflare Workers AI gives roughly 690
images a day; Pollinations is unlimited but slow; your own machine is
unlimited and private. Paid engines are there when you want them, and the app
asks before spending a penny.

<br>

### [⬇ Download for Windows](https://github.com/Stravelakis/image-forge/releases/latest)

*Installer and a no-install portable version. Free, open source, no account.*
<br>*Mac and Linux: run it from source — [two commands](#run-it-from-source).*

<br>

[![CI](https://github.com/Stravelakis/image-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/Stravelakis/image-forge/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Stravelakis/image-forge?label=release&color=f2a33c)](https://github.com/Stravelakis/image-forge/releases/latest)
[![Licence](https://img.shields.io/badge/licence-Apache--2.0-8cb56f)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-484-56b8a5)](tests/)

</div>

---

## Start where you are

Five doors. Each one is a full guide written for that reader — pick yours and
ignore the rest.

| | | |
|---|---|---|
| 🪟 | **[I just want to download and use it](docs/download.md)** | Windows, double-click, no terminal. Includes what to do about the blue "Windows protected your PC" box. |
| 🙂 | **[I don't write code](docs/no-code.md)** | What an API key is, which free engine to start with, and how to make your first batch. Nothing assumed. |
| ✨ | **[I vibe-code](docs/vibe-coding.md)** | Wire it to Claude Code, Cursor or n8n over MCP and let an agent fill the manifest and run the forge. |
| 🧑‍💻 | **[I'm a developer](docs/developers.md)** | Architecture, the engine registry, how to add a provider, the test suite, the CSV contract. |
| 🎥 | **[I make content](docs/creators.md)** | Sprite sheets, mouth shapes for talking avatars, GIFs from a single still, text with perspective warp. |

**[📖 Full documentation](https://stravelakis.github.io/image-forge/)** — searchable, with a page per subsystem.

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

Image Forge tests each key with a **real generation call**, not a model list —
because a key in this state lists all fifty models perfectly and then refuses
everything. It names the cause rather than the symptom, tells you which of the
two fixes you want, and offers the free engines meanwhile.

There is a second, different failure that looks identical from the outside.
Google also returns `403` *"Your project has been denied access"* — a block on
the whole project, not a billing problem, and not something more credit will
fix. On a real thirteen-key setup we found eight keys in the first state and
**five in the second**, which no amount of topping up would have helped. The
two are now reported separately, by name.

It also finds the same key pasted into two slots, which is easy to do and
quietly halves what you thought your allowance was.

</details>

<details>
<summary><b>"Imagen was retired and my script stopped working"</b></summary>

<br>

Google switched off every Imagen `:predict` endpoint on **17 August 2026**,
and the old free allowance went with it. Image generation moved to a new API
with a different request shape.

Old manifests are migrated on load. **Settings → Advanced → Repair** moves any
row still pointing at a dead model onto a current one, and the agent API has
`forge_fix_retired` for the same job.

</details>

<details>
<summary><b>"I want a hundred images, not one, and I want them named properly"</b></summary>

<br>

The unit of work is a spreadsheet row, not a chat message. One row, one
picture, one filename — and the filename rules are enforced as you type, with
one-click fixes. Images land in subfolders by category. The CSV records what
was made, when, with which model, and what went wrong if anything did.

Failed rows can be retried on their own. Rows that hit a daily quota park
themselves and re-queue when the quota resets.

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
a dialog naming the count, the model, the price per picture, the total, and
which credit it comes out of — including how many days that credit has left.
You can approve it, or switch to a free engine from the same dialog.

Google's half-price batch mode is one button. Free-tier keys are always tried
before paid ones.

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

Then: *"use the forge to make the pending images"* — and it will.

</details>

---

## The engines

| `model` column | Engine | Cost per image | Free allowance |
|---|---|---|---|
| *(blank)* | Your own machine via LocalAI | **free** | unlimited, private, no internet |
| `cloudflare-flux` | Cloudflare Workers AI | **free** | ~690/day, resets midnight UTC, no card |
| `flux` · `turbo` | Pollinations | **free** | unlimited, ~one per 5s, needs a free token |
| `nano-banana-2-lite` | Google | $0.034 · batch $0.017 | none |
| `nano-banana-2` | Google | $0.067 · batch $0.034 | none |
| `nano-banana` | Google | $0.039 · batch $0.019 | none — **off 2 Oct 2026** |
| `gemini-3-pro-image` | Google | $0.134 · batch $0.067 | none |
| `dall-e-3` · `gpt-image-1` | Any OpenAI-compatible endpoint | ~$0.04 | none |
| *(practice forge)* | Procedural, offline, deterministic | free | infinite |

> Prices checked against the providers on **2 September 2026**. Free
> allowances drift — check the provider's own page before you build on one.
> "Batch" is Google's half price for pictures you will collect later.

The `model` column routes **each row** to its own engine, so one batch can mix
free and paid.

---

## What it does

**The Wizard** — nine steps, one decision each. Name the batch, pick a world,
list the pictures (or let a text model write them), pick a look, a painter, a
shape, a home. Saved setups become one-click recipes.

**34 styles** in six families, with per-style notes on which engines can
actually do them. Infographics and posters are limited to the models that can
really render text, rather than letting you find out the expensive way.

**Sheets** — sprite sheets, character turnarounds, and viseme sheets: the ten
mouth shapes an avatar needs to look like it is speaking. Each frame gets its
own seed and a *"change only this"* instruction.

**GIFs** — turn any finished picture into an animation, or describe one and
have the frames generated.

**Text with perspective** — drop text onto an image and drag its four corners
independently, the way you would in PowerPoint or Photoshop. Real projective
warp, so text sits on a wall or a sign instead of floating over it.

**Vectors** — SVG and Lottie written by a code model, sanitised before
anything is rendered or saved.

**Key pools** — as many keys as you like per engine. On a `429` the key rests
and the next one retries the same row immediately. Check every key in a pool
at once and see which ones actually work.

**Files** — a linked folder (point it at a Drive sync folder for free cloud
backup), a ZIP with the structure and CSV, or one picture at a time.

---

## The manifest is the contract

```csv
id,filename,prompt,category,aspect_ratio,seed,model,status
1,shop_cyber_noodle_bar.png,"rain-slick noodle stall, neon steam",shop,16:9,41,cloudflare-flux,pending
```

`filename` is the only required column. Everything else has a sensible
default. Import forgives missing columns; export is CSV or XLSX.

Any tool that can read and write this CSV is a first-class citizen of the
project. That is the whole design.

---

## Run it from source

```bash
npm install
npm run dev
```

Opens at `http://localhost:3000`. Works on Windows, macOS and Linux.

Build a Windows installer:

```bash
node scripts/build-exe.js
```

---

## What it is not

Being straight about this saves everyone time.

- **Not a chat image generator.** If you want one picture from one sentence,
  the provider's own web app is faster.
- **Not signed.** Windows shows a blue "Windows protected your PC" box on
  first run, because a code-signing certificate costs a few hundred a year.
  [What to click](docs/download.md).
- **Not a hosted service.** There is no cloud version and no accounts.
- **Not able to fix a provider's outage or an empty balance.** It will tell
  you clearly which one it is, and offer you a free engine instead.
- **Mac and Linux run from source only.** The packaged builds are Windows.

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

Built with React · Vite · Tailwind · Electron · Tauri.
No backend. No accounts. Your keys, your machine.

*struck, not templated* ⚒

</div>
