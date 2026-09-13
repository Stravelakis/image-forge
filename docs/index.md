---
title: Home
nav_order: 1
---

# Image Forge documentation

Bulk AI image generation from a spreadsheet, using your own API keys. No
account, no server, no subscription — your keys stay on your machine.

[Download for Windows](https://github.com/Stravelakis/image-forge/releases/latest){: .btn .btn-primary }
[View on GitHub](https://github.com/Stravelakis/image-forge){: .btn }

---

## Start where you are

Five guides, each written for one kind of reader. Pick yours.

| Guide | For you if |
|---|---|
| [Download and install](download.md) | You are on Windows and want to double-click something. |
| [If you don't write code](no-code.md) | Words like "API key" are unfamiliar and you would like that fixed. |
| [If you vibe-code](vibe-coding.md) | You want an agent to fill the manifest and run the forge. |
| [If you're a developer](developers.md) | You want the architecture and how to add an engine. |
| [If you make content](creators.md) | You want sprite sheets, talking avatars, GIFs and text on surfaces. |

---

## Reference

| Page | What is in it |
|---|---|
| [The manifest](manifest.md) | Every column, what it does, what happens if you leave it out. |
| [Troubleshooting](troubleshooting.md) | Real failures, what causes them, and what to do. |
| [What changed](https://github.com/Stravelakis/image-forge/blob/master/CHANGELOG.md) | Every release, and what was actually wrong. |

---

## The idea in one paragraph

The unit of work is a **spreadsheet row**. One row is one picture: a filename,
a prompt, a shape, a seed, and which engine should paint it. You fill in rows
— by hand, from a CSV, with a wizard, by asking the chat, or by letting an
agent do it — and press **Run queue**. Images come out named and sorted into
folders, and the CSV records what happened to each one. Anything that can
read and write that CSV is a first-class citizen of the project.

---

## What it costs

Nothing, if you want. These engines are free:

| Engine | Free allowance | Needs |
|---|---|---|
| OVHcloud SDXL | two a minute, always square | **nothing — no key, no signup** |
| Cloudflare Workers AI | ~690 images a day | a free account, no card |
| Pollinations | unlimited, ~one per 5s | a free token |
| Your own machine (LocalAI and similar) | unlimited, private, offline | a graphics card and the software |

Paid engines exist and are never used without asking first. Before a paid run
you get how many pictures will be billed, the model, the price each, the
total, and which credit pays for it — with a button to switch to a free engine
instead.

Writing, code and vision models can be free too: one
[Mistral](https://console.mistral.ai/api-keys) key covers all three.

---

## Honest limitations

- Windows gets packaged builds. **Mac and Linux run from source.**
- The app is **not code-signed**, so Windows shows a warning on first run.
  [What to click](download.md).
- Most image models **cannot spell**. Use a Nano Banana model for words in a
  picture, or add text yourself with the Letterer.
- It cannot fix a provider outage or an empty account — but it will tell you
  which one it is, and offer a free engine instead.

---

## Licence

[Apache-2.0](https://github.com/Stravelakis/image-forge/blob/master/LICENSE).
Use it, sell what you make with it, build on it. If you redistribute it, the
[NOTICE](https://github.com/Stravelakis/image-forge/blob/master/NOTICE) file
travels with it. Just using the app carries no obligation.
