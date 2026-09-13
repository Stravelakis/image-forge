---
title: The manifest
nav_order: 8
---

# The manifest

The manifest is a CSV. One row is one picture. It is the contract between you,
the app, and anything else you point at it — and it is deliberately plain
enough that a spreadsheet, a Python script or an agent can all be equal
participants.

```csv
id,filename,prompt,category,aspect_ratio,seed,model,status
1,image_cyber_noodle_bar.png,"rain-slick noodle stall, neon steam",image,16:9,41,cloudflare-flux,pending
```

**`filename` is the only column you must supply.** Everything else has a
sensible default, and import forgives whatever is missing — a two-column CSV
of `filename,prompt` is a perfectly valid manifest.

---

## Every column

| Column | Meaning |
|---|---|
| `id` | Row number. Assigned for you; you can ignore it. |
| **`filename`** | **Required.** The output file. Checked against the filename rules below. |
| `prompt` | What to paint. |
| `negative_prompt` | What to avoid. |
| `note` | Your "make it better" instruction. Folded into the prompt on a redo. |
| `category` | What the row makes: `image` · `svg` · `lottie` · `sheet` · `gif`. Decides the output folder. |
| `kind` | World flavour. Seasons the prompt. |
| `rating` | `like` / `dislike`, set from the Gallery. |
| `item_id` `shop_id` `event_id` | Foreign keys back into *your* database. The app never touches them. |
| `style` | Which of the 36 visual styles to apply. |
| `aspect_ratio` | `16:9`, `1:1`, `9:16`, `4:3`… Some engines ignore it (Cloudflare, OVHcloud). |
| `width` `height` | Derived from the aspect ratio. Written on export for convenience. |
| `seed` | Makes randomness repeatable, on engines that accept one. OVHcloud does not. |
| `model` | **The engine for this row.** Blank means "use the engine picked in the toolbar". |
| `status` | `pending` → `generating` → `done` → `imported`, plus `failed` and `skipped`. |
| `error` | Why it failed, in plain words. |
| `generated_at` | ISO timestamp of the successful strike. |
| `imported_attachment_id` | Filled by the WordPress import step, if you use it. |

Rows from older manifests with the categories `shop`, `item`, `event` or `npc`
are read as `image`.

### Where each category lands

| `category` | Folder |
|---|---|
| `image` | `images/` |
| `svg` | `vectors/` |
| `lottie` | `lottie/` |
| `sheet` | `sheets/` |
| `gif` | `gifs/` |

---

## The filename rules

Checked as you type, with a one-click **auto-fix**. They keep a hundred files
findable a month later. Five are house style and can be switched off in
**Settings → Filenames**; two protect your files and always apply.

| Rule | Can switch off? | Why |
|---|---|---|
| lowercase only | yes | a file is never lost to a forgotten capital |
| no spaces | yes | spaces break URLs and scripts |
| words joined with underscores | yes | a list stays scannable |
| starts with what it makes (`image_`, `svg_`…) | yes | names sort with their kind |
| ends with a known extension | yes | `.png` `.jpg` `.jpeg` `.webp` `.gif` `.svg` `.json` |
| **no special characters** | **no** | Windows refuses `\ / : * ? " < > \|` outright |
| **unique across the manifest** | **no** | a duplicate name overwrites the first file |

`image_cyber_noodle_bar.png` passes. `Image Cyber Noodle Bar.png` fails
several, and auto-fix repairs them at once.

**The extension follows the file.** When a picture comes back, the app checks
what it really is. Google and Cloudflare send JPEG, so
`image_cyber_noodle_bar.png` becomes `image_cyber_noodle_bar.jpg` — the name
before the dot never changes, and it never renames onto another row's file.

---

## The status lifecycle

```
pending ──▶ generating ──▶ done ──▶ imported
   ▲             │
   │             ├──▶ failed    (retryable on its own)
   └─────────────┴──▶ skipped
```

- **pending** — queued. **Run queue** picks these up.
- **generating** — in flight right now.
- **done** — the picture exists. If a linked folder is set, it is on disk.
- **failed** — something went wrong; `error` says what. Retry just these.
- **imported** — handed off to your own system.
- **skipped** — deliberately passed over.

A row that hits a limit is parked with a `retry_at` and re-queues itself once
the cooldown expires.

---

## Per-row engine routing

The `model` column is what lets one batch mix free and paid work:

```csv
filename,prompt,model
image_bakery.png,a village bakery,ovh-sdxl
image_sign.png,a shop sign reading OPEN,nano-banana-2-lite
image_baker.png,the baker,
```

Row one goes to OVHcloud (free, no key). Row two needs real lettering, so it
goes to a model that can spell — and the app asks before spending. Row three is
blank, so it uses the engine picked in the toolbar.

A row's `model` always beats the app default, and beats the agent server's
environment variables too.

---

## Working with it from outside

It is [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180) CSV. Nothing exotic:
quoted fields, doubled quotes for a literal quote, `\r\n` or `\n` line endings
both accepted.

```python
import csv

with open("marketplace-images.csv", newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

# queue everything that has no picture yet
for r in rows:
    if not r["generated_at"]:
        r["status"] = "pending"
```

Write it back, import it in the app, press **Run queue**. That is a complete
integration with no API involved.

> A test called `csv-parity` pins that the app and the agent server read and
> write this file identically. Without it, an agent and a human working on the
> same manifest would slowly corrupt each other's rows.

---

## Export

**CSV** — the same format, round-trips exactly.
**XLSX** — for handing to someone who wants a spreadsheet.
**ZIP** — the pictures in their folders, with the CSV inside.

The app can also keep the CSV refreshed in your linked folder automatically
after every run, which is on by default.
