---
title: Troubleshooting
nav_order: 7
---

# Troubleshooting

Every entry here is something that actually happened, with the cause that was
actually found — not a guess at what might go wrong.

---

## Your settings and keys

### My keys and settings disappeared after restarting the app

**If you were on the 1.0.0 desktop app, that was the app.** It served itself
on a different local port every launch, and the browser engine inside keeps
saved data per port — so every restart opened a new, empty store. Nothing had
failed to save; each launch looked somewhere different.

**1.0.1 fixes it.** Keys you typed into 1.0.0 are stranded under the old
ports and are not recovered, so enter them once more. Then press **Back up to
a file** in Settings.

### Image Forge opened empty after I had been using it (a second copy was open)

**This was the app's fault and is fixed.** The page's saved data belongs to its
address, and the address includes the port. When something else was holding
port 47821, Image Forge opened on 47822 and looked in a different, empty box.
Nothing was lost; it was looking in the wrong place.

Now the desktop app keeps a full copy of everything (settings, keys, your list)
in a file it owns, `vault.bin` inside `%APPDATA%\image-forge`, locked so only your
Windows user can read it. That file is loaded first, so a port change, an update
or a reinstall cannot empty it. What other ports had saved is merged in once.
Test copies can name their own ports with `IMAGEFORGE_PORTS`.

### "Could not read your manifest" or "…your settings and keys"

The app found stored data it could not read. It has **not** overwritten it:
the original is kept under a `.rescue` copy, and saving is paused until you
act. Press **Try again** first. If you have a backup file, **Restore** it.

This exists because older versions, on an unreadable read, fell back to
defaults and then saved those defaults over your data a moment later.

### Settings say "NOT saved"

Every save is read straight back to check it stuck. If it did not — storage
full, a private window, something blocking site data — you see this instead
of a green "Saved and checked". Press **Back up to a file** before closing.

---

## Google

### "Your prepayment credits are depleted" — but there is money in the account

**This is the one that costs people an evening.** Linking your project to
Google Cloud billing is what *causes* it.

In order:

1. A new project is on the **free tier**. It works.
2. You link it to a Cloud billing account — to use a voucher, to use trial
   credit, or because something told you to.
3. Google now marks the project **paid tier**.
4. Paid tier bills against a separate balance called **Prepay – AI Studio**.
5. Ordinary Google Cloud credit does not fund that balance. Neither does free
   trial credit, and nor do most vouchers.
6. The balance is therefore zero, and every request is refused with a `429`.

**Two fixes, and you have to pick one:**

| You want | Do this |
|---|---|
| The free tier back | **Unlink the project** from its billing account at [console.cloud.google.com/billing](https://console.cloud.google.com/billing) |
| To actually pay | Add a **Prepay – AI Studio** balance at [ai.studio/projects](https://ai.studio/projects) |

What does *not* work is being linked to billing with only Cloud credit.

> Confirmed on a real account: a project with €262 of Cloud credit refused
> every call on every model. Unlinking restored it.

**Which advice you get depends on the pool.** A key in the **free** pool is
told how to get the free tier back. A key in the **paid** pool is told
*"Paid tier is on, but the AI Studio prepay balance is empty"* — and not to
unlink, because the free tier has no picture allowance at all.

### A paid key "works" but no picture is ever made

The key check says *"The key works. Whether it has picture money, this cannot
tell you."* That is deliberate. Text has a free allowance and pictures do not,
so a key with an empty prepay balance passes a text check and still refuses
every picture. The only real proof costs one picture, and the app never spends
that behind your back — run one row when you want to know.

### "Your project has been denied access. Please contact support." (403)

A **project-level block**, not a billing state. More credit will not fix it,
and neither will unlinking. Verified not to be a browser problem: the same key
fails identically through a server-side proxy. Make a key in a fresh project,
or take it up with Google.

### A key lists 50 models and then refuses everything

Expected, and why the key check makes a real call. Listing models succeeds on
a key that can do nothing else.

### Model names that a chatbot suggested do not exist

On a live account, `gemini-1.5-flash`, `gemini-1.5-pro` and `gemini-2.5-flash`
return `404 — This model is no longer available to new users.` Press **Load
models** and use what your key actually lists.

---

## Video Forge and puppets

### A key I typed in Video Forge is not here (or the other way round)

Keys are shared through `%APPDATA%\Forge\shared-keys.bin`, locked by Windows, so
this works on Windows only and for these names: Google, OpenRouter, NVIDIA,
Mistral, Cloudflare, Pollinations, OpenAI, Groq, ElevenLabs and Fish. A shared
key only **fills an empty box**; it never replaces one you typed. Removing a
key in Image Forge is not shared; removing one in Video Forge is.

### A puppet part is "unsure" or "missing"

Each part gets at most three tries. *Unsure* means the checker said no but the
cut was clean (it is kept, flagged); *missing* means no clean cut at all. The
puppet works without a missing part. Press *Try the unsure/missing again* to redo
only those. A checker that is too strict about hats "cut off at the top" is a
known issue.

### The puppet maker says LocalAI is not running (or "missing csrf token")

LocalAI refuses picture requests from a web page. The desktop app sends them
through its own `/local-api/<port>` relay, which only reaches `127.0.0.1`. So use
the desktop app, not a plain browser tab, and start LocalAI first; its image
models then appear by name in the engine pick-list.

### The graphics card is hot, or the face model and the parts model do not fit

On an 8 GB card the two local models do not fit together, and FLUX.2 klein takes
minutes a picture. Local engines work at 768 with a 20-second rest between
pictures, and the face model is asked to unload before parts start. Do not run a
puppet and a long Video Forge render at the same time.

### My puppet has holes or a pink fringe

The background colour is chosen per character (magenta, else green, else blue)
to be one the character does not wear, and only background joined to the
picture's edge is removed. A pink or purple character used to bleed into magenta;
if you still see it, say so in the description (for example "a purple dragon") so
the maker picks green.

### I deleted a puppet by mistake

*Delete this puppet* asks twice and **moves** the puppet to
`%APPDATA%\Forge\puppets-deleted`, in a folder named after the puppet plus the
date and time; nothing is erased. To restore it, move that folder into
`%APPDATA%\Forge\puppets` and rename it back to the puppet name (cut off the
date at the end).

---

## Cloudflare

### Cloudflare did not work in the 1.0.0 desktop app

The part of the desktop app that forwards requests to Cloudflare crashed on
the first one. It only worked when running from source. **Fixed in 1.0.1**,
checked on a real install.

### "Could not reach Cloudflare"

Cloudflare's API sends **no CORS headers**, so a browser page cannot call it.
The app forwards the request in both the dev server and the desktop app. If
you see this, you have opened the built HTML file directly — use `npm run dev`
or the desktop app.

### Every Cloudflare image fails at once

If a request includes `seed`, `flux-1-schnell` rejects the **whole request**.
Cloudflare's own model page lists `seed`. It does not work. The app does not
send it. Confirmed on a live account, 2 September 2026.

### 403 on a Cloudflare token

The token needs **Account → Workers AI → Read**.

---

## OVHcloud

### "OVHcloud is still busy after three tries"

It allows two pictures a minute without a key. The app already paces itself
to that — one every 31 seconds, however many run at once — so this only
appears when it stayed busy anyway. Wait a minute and run again.

### My OVHcloud pictures are all square, and the seed does nothing

Correct. It accepts only a prompt and a negative prompt. Every picture is
1024×1024, and the same prompt twice gives two different pictures.

---

## NVIDIA and other text providers

### NVIDIA says "Failed to fetch"

NVIDIA answers a browser's permission check without the header that allows
it, so the browser refuses — not your key, not the address. The app forwards
NVIDIA requests the same way it does Cloudflare. Checked 4 September 2026.

### "Only show models that are free" does nothing for NVIDIA or Google

They do not publish a price per model, so there is nothing true to filter on.
The app says so rather than guessing from model names. OpenRouter does publish
prices, and there the filter is exact.

---

## Pollinations

### "Missing Turnstile token"

Pollinations stopped serving anonymous requests. A free token from
`auth.pollinations.ai` fixes it.

---

## Vision and lettering

### "That model cannot look at pictures"

The model is text-only. Pick one that can see. The vision check sends a real
image — a solid red square — and asks what colour it is.

### Pixtral returns 404

`pixtral-large-latest` is not on Mistral's model list any more (checked
2 September 2026). Use **`mistral-medium-latest`**, which can see and is free
on Mistral's tier.

### The lettering lands in the wrong place

The model proposes, you drag. With no vision model set up, the free **Find a
quiet spot** places the box in the calmest part of the picture.

---

## Files

### My file ends in .jpg, not .png

That is the real format. Google and Cloudflare send JPEG, and the app names a
file for what it is. Older versions wrote `.png` on JPEG data, which confuses
WordPress uploads and strict tools.

---

## The app

### Windows says "Windows protected your PC"

Expected. The app is not signed with a paid code-signing certificate. Click
**More info**, then **Run anyway**. Once only.

### "Image Forge could not start"

It could not open its local port (47821–47825). Close any other copy of Image
Forge, or whatever else is using those ports.

### "Remove your Image Forge data as well?" — did it remove anything?

In 1.0.0, no: it pointed at a folder that never existed, whatever you
answered. From 1.0.1 it removes `%APPDATA%\image-forge` when you say Yes, and
a silent uninstall always keeps your data.

### A picture was made but the row says failed

Fixed. The row now stays **done** and a separate message says writing to your
folder is what failed, because on a paid engine "failed" invites paying twice.

### The paid dialog said far more pictures than I was paying for

Fixed in 1.0.1. A queue mixing paid and free rows was described as if every
row were paid. It now counts only billed rows and says how many are free.

### Text in a picture is gibberish

Most image models cannot spell. Use a Nano Banana model, or add the words with
the **Letterer**, which uses real fonts.

### "Every key is resting"

The whole pool hit its limit. Rows re-queue automatically when the cooldown
expires. Or switch engines (Start has a drop-down) and run again.

### The Chat said its writing engine was busy

Free text engines say "too many requests" (429) now and then. If you have more
than one text account with a key, the next one answers instead, and a writing
job with no key takes a provider that has one. If none has a key the Chat tells
you to add one in Settings → Text engines.

---

## Still stuck

[Open an issue](https://github.com/Stravelakis/image-forge/issues).
Include what you pressed and what it said.

**Never paste an API key into an issue.** The key check in Settings describes
a key without revealing it.
