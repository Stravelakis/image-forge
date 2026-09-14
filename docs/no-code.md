---
title: "For everyone: your first pictures"
nav_order: 3
---

# For everyone: your first pictures

This guide assumes nothing. If a word is unfamiliar, it gets explained the
first time it appears.

---

## What this app actually is

You write a list of pictures you want, one per line, in something that looks
like a spreadsheet. You press a button. It makes them all and puts them in a
folder with tidy names.

That is the whole idea. Everything else is a convenience on top of it.

If you would rather just describe one picture in a sentence, there is a
**Chat** for that too — and it can write a whole list of rows for you.

---

## Words you will meet

**API key** — a long password that lets this app use somebody else's picture
machine on your behalf. You get one from the company that runs the machine.
Treat it like a password: anyone who has it can spend your allowance.

**Engine** — the company or program that actually draws the picture.
OVHcloud, Cloudflare, Google and Pollinations are engines. So is your own
computer.

**Model** — a specific painter inside an engine. Different models have
different strengths and prices.

**Manifest** — the spreadsheet. One row per picture.

**Prompt** — the sentence describing what you want drawn.

**Seed** — a number that makes randomness repeatable. Same prompt plus same
seed gives you the same picture again, on engines that accept a seed.

---

## Make a picture with nothing set up

1. In the toolbar at the top, click the **engine** button.
2. Choose **OVHcloud · SDXL**. It needs no key and no account.
3. Click **Add a picture**, type a description in **prompt**, and press
   **Run queue**.

It makes two pictures a minute and they are always square. That is enough to
learn the app and to make real pictures.

Just want to see where the buttons are? Choose **Simulated Forge** instead. It
draws simple scenes on your own computer, instantly — not AI pictures, but
everything else behaves exactly as it will with a real engine.

---

## A faster free engine: Cloudflare {#cloudflare}

**Cloudflare Workers AI** gives about **690 images a day**, no credit card,
and is quicker than OVHcloud.

### Step 1 — make a Cloudflare account

Go to [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) and
sign up. Email and password. You do not need a domain name and you do not need
to enter a card.

### Step 2 — find your Account ID

Once you are signed in, look at the address bar. The URL looks like:

```
https://dash.cloudflare.com/abc123def456.../home
```

That long string of letters and numbers after `.com/` **is your Account ID**.
Copy it.

### Step 3 — make an API token

1. Click your profile icon (top right) → **Profile**
2. Left menu → **API Tokens**
3. **Create Token**
4. Scroll to the bottom and choose **Create Custom Token → Get started**
5. Give it a name, e.g. `image forge`
6. Under **Permissions**, set the three dropdowns to:
   **Account** · **Workers AI** · **Read**
7. **Continue to summary** → **Create Token**

The token appears **once**. Copy it now. If you lose it, delete that token and
make another; nothing bad happens.

### Step 4 — put both into the app

**Settings → Image engines → Cloudflare.** Paste the Account ID into the first
box and the token into the second, then press **Check the account and token**.
If it does not work, the message tells you which of the two is wrong.

Then pick **Cloudflare · FLUX** in the toolbar's engine button.

---

## Your first real batch

1. Click **Add a picture**.
2. In **filename**, type something like `image_bakery.png`

   The app checks your filenames as you type — lowercase, underscores instead
   of spaces, starting with what the row makes (`image_`). If one breaks a
   rule it says which, and **auto-fix** repairs it. You can switch most rules
   off in **Settings → Filenames** if your project names things differently.

3. In **prompt**, describe the picture: *"a warm village bakery at dawn,
   bread in the window, soft morning light"*
4. Press **Run queue**.

The row shows a thumbnail when it is done. Click the row, then the picture, to
see it full size.

> The file may end in `.jpg` rather than `.png`. Some engines send JPEG, and
> the app names the file for what it really is.

---

## Keeping the pictures

By default they live inside the app. To get them onto your disk, pick one:

**Link folder** *(best)* — choose a folder, and every picture from then on is
written there as it finishes, sorted into `images/`, `vectors/`, `lottie/`,
`sheets/` and `gifs/`.

> **Free cloud backup:** point it at your OneDrive or Google Drive folder.
> Everything syncs itself with no extra work.

**Download** — a ZIP with all the pictures, the folders and the CSV inside.

**Save** — one picture at a time, from the row.

## Keeping your keys

**Settings** shows *Saved and checked at…* and how many keys are stored. Press
**Back up to a file** once your keys are in, and keep that file somewhere
private — it holds them in plain text. **Restore** reads it back.

---

## About money

**You cannot spend money by accident.** Free engines never ask, because there
is nothing to ask about. A paid engine always stops and shows you a dialog
first, like:

> *2 pictures on Nano Banana 2 Lite — about $0.067 ($0.034 each). The other 7
> are free.*

You press **Spend it — go ahead**, or pick one of the free engines listed
underneath. Nothing is spent until you press the first one.

---

## When it goes wrong

**"Every key is resting"** — you used up the allowance. The rows park
themselves and try again automatically when it resets. Or switch to a
different engine and press **Run queue** again.

**"OVHcloud is still busy"** — it allows two pictures a minute. The app waits
its turn automatically; this only appears if it stayed busy anyway. Try again
shortly.

**Google says "prepayment credits are depleted"** — the key is fine; the
account behind it has no picture balance. This is very common and
counter-intuitive. [The full explanation is here](troubleshooting.md).

**A picture came out wrong** — open the row, write what was wrong in the
**Note** field in plain words — *"too dark, and she should be facing left"* —
and press **Generate** again. Your note is folded into the prompt.

**Text in the picture is gibberish** — most image models cannot spell. Use a
Nano Banana model for anything with real words in it, or add the text yourself
afterwards with the **Letterer**, which uses actual fonts.

---

## Where to go next

- [Make sprite sheets, GIFs and talking avatars](creators.md)
- [Every column in the manifest, explained](manifest.md)
- [When something is broken](troubleshooting.md)
