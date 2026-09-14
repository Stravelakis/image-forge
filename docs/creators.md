---
title: "For everyone: sheets, GIFs and lettering"
nav_order: 4
---

# For everyone: sheets, GIFs and lettering

Sprite sheets, talking-avatar mouth shapes, GIFs from a single still, and text
that sits *on* a surface instead of floating over it.

All of it works on free engines. None of it needs a card.

---

## Styles

36 looks in six families — clay, paper, drawn, anime, photographic, graphic,
tabletop — each with notes on which engines can really do it. **Star** the
ones you use and they come first in the style library and in the wizard.

Two house styles:

- **Skilitsa** — a polished 3D cartoon in happy, saturated colour, with a
  small `skilitsa.com` mark worked into the scene. The mark is text, so this
  style is limited to models that can spell, and those cost money.
- **Skilitsa Plain** — the same look with no mark. Runs on any free engine.

---

## Sheets

A sheet is a set of frames that belong together — same character, same light,
same style, one thing changed per frame.

Every frame gets **its own seed** and an explicit *"change ONLY this"*
instruction, which is what stops the model quietly redesigning your character
between frames.

| Sheet | What it is for |
|---|---|
| **Walk cycle** | contact · down · pass · up, on both feet |
| **Action set** | idle, run, jump, attack, hurt — whatever your game needs |
| **Turnaround** | the same character from every angle |
| **Visemes** | mouth shapes for a talking avatar — see below |
| **Expressions** | one face, many moods |
| **Avatar eyes and brows** | blinks and eyebrow positions, with the mouth held still |

Frames arrive as separate rows, so you can redo any single one without
touching the rest.

> Sheets work best on an engine that accepts a seed and a reference picture —
> your own machine or a Google model. OVHcloud takes no seed, so frames drift
> apart there.

---

## Talking avatars: the mouth shapes

A face does not need a different mouth for all 26 letters. Animation has used
about ten shapes — **visemes** — for a century:

| Shape | Sounds |
|---|---|
| rest | silence |
| A · I | "father", "I" |
| E | "bed" |
| O | "go" |
| U · W · Q | "you" |
| M · B · P | lips pressed shut |
| F · V | teeth on the lower lip |
| L | tongue behind the top teeth |
| C D K N S T | teeth nearly together |
| TH | tongue between the teeth |

Generate the sheet once and you can make that character say **anything**.
Type a line of dialogue and the app works out the shape order and timing for
you.

Mouths alone do not make a face look alive, which is what the eyes and brows
sheets are for.

---

## GIFs

**From a picture you already made.** Any finished row can become a GIF with
camera motion — push in, pull out, pan, drift, tilt — computed from the single
still. No second generation, so it costs nothing even on a paid engine.

**From a description.** Your text model turns what you describe into a motion
plan, and the plan drives the frames.

Encoding is local, so the GIF never leaves your machine.

> **Why camera motion rather than new frames?** Asking an image model for
> twenty frames of the same scene gets you twenty *slightly different scenes*.
> Moving a virtual camera over one real image gives coherent motion — instant
> and free.

---

## Text that sits on the surface

Drop a text layer on any picture and drag **all four corners independently**.
It is a real projective warp, not a skew, so text lands on a signboard, a
wall or a book cover and looks painted there.

- **Real fonts.** Spelled correctly every time.
- **It shrinks to fit.**
- **Find a quiet spot** — free, instant, no model.
- **Ask a model where it goes** — *"put it on the hanging sign"* — and a
  vision model returns the sign's four corners for you to nudge.

No vision model set up? The quiet-spot finder covers you. Nothing breaks.

**[→ Setting up a free vision model](no-code.md)** — one Mistral key, no card.

---

## Vectors

Vectors are **code**, not pictures, so an image model cannot make them. A code
model can: **SVG icons**, **SVG illustrations**, and **Lottie** animations.

Everything generated is **sanitised** before it is shown or saved: scripts,
event handlers, embedded objects and external references are removed.

Codestral is free and made for this.

---

## Practical notes

**Checking a picture properly.** Click a row, then its picture, to see it full
size. A thumbnail hides a sixth finger.

**A consistent character across many pictures.** Fix the seed, keep the
description word-for-word identical, change one thing at a time. A sheet does
this for you.

**Words inside a picture.** Use a Nano Banana model, which can spell, or add
the words with the Letterer, which always can.

**Aspect ratios.** Set per row: `16:9` video, `9:16` shorts, `1:1` square.
Cloudflare and OVHcloud ignore it and return their own size.

**Bulk.** The whole point. Sixty thumbnails in sixty rows, named and sorted,
with a CSV of what happened.

---

## Where to go next

- [Start from nothing](no-code.md)
- [Let an agent run it](vibe-coding.md)
- [Every manifest column](manifest.md)
