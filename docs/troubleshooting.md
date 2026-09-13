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
expires. Or switch engines and run again.

---

## Still stuck

[Open an issue](https://github.com/Stravelakis/image-forge/issues).
Include what you pressed and what it said.

**Never paste an API key into an issue.** The key check in Settings describes
a key without revealing it.
