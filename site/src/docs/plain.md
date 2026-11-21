---
checkedAgainst: v1.1.1
checkedOn: 2026-11-21
---

## What Image Forge is

A Windows app that makes pictures in bulk. You say what you need and how many, it asks an AI image service to draw them, names each file sensibly, puts them in a folder, and keeps a list of what happened to each one.

Three things make it different from most image tools:

- **It is free to start.** The default engine needs no account and no key.
- **It never spends your money by surprise.** Anything that costs money stops first and shows you the price.
- **Your keys never leave your computer.** There is no Image Forge account and no Image Forge server. Keys go only to the service you picked.

The AI services are called **engines**. Some are free, one needs no signup at all, and some charge per picture. To use some of them you need an **API key**: a long private code from the company that runs the engine.

> **In short** Install, type a sentence, press the button. Everything else on this page is for when you want more control.

## What you need

- A Windows PC and an internet connection.
- About 115 MB of disk space. The app carries its own browser engine, which is why it is that big.
- Nothing else. No account, no key, no extra software.

macOS and Linux can run the browser version from source (see Install in the full manual below). The desktop link to Video Forge needs Windows.

## Install it

1. Open the [downloads page](https://github.com/Stravelakis/image-forge/releases/latest).
2. Under **Assets**, download `Image.Forge.Setup.x.y.z.exe`.
3. Run it. Windows shows a blue **"Windows protected your PC"** box.
4. Click **More info**, then **Run anyway**.
5. Choose where to install it (or keep the suggested place) and finish. You get Start Menu and desktop shortcuts, and an entry in **Settings → Apps** with a proper uninstaller.

> **Why** The blue box appears because the installer is not signed with a paid certificate yet, not because anything is wrong. You do it once. A code-signing plan is written down in the repository.

**No install at all?** Download `image-forge-portable.exe` instead and run it from anywhere. It still keeps your settings on the computer it runs on, in `%APPDATA%\image-forge`.

## Your first pictures

The app opens on the **Start** screen. With nothing set up it already works.

1. Type what you need, for example *"12 potion bottle icons, cute, glowing"*.
2. Check **How many**. It reads a number at the start of your sentence; you can also set it yourself (up to 60).
3. Pick a **Style** if you like, and a **Shape** (square, wide or tall).
4. Pick an **engine** from the drop-down. It lists only engines that are ready right now. The last choice, **Add more engines…**, opens Settings.
5. Press the big button (it says **Make 4**, or whatever your number is).

The line next to the button says which engine will draw them and whether it costs money. With nothing set up it is **OVHcloud**: free, no key, two pictures a minute, always square. Pictures appear under the box as they finish; click one to see it full size.

> **Try it** Start with four pictures, not sixty. On the free engine that is about two minutes, and you will see how it behaves before you commit to a big batch.

**How a set is varied.** If you have a text engine set up (see below), it writes a genuinely different description for each picture. Without one, the app varies the framing (close-up, from above, evening light) and tells you so under the button.

## Choose an engine

| Engine | Cost | Needs | Good for |
|---|---|---|---|
| OVHcloud SDXL | free | nothing | starting straight away; two a minute, always square |
| Cloudflare | free | a free account id and token, no card | about 690 pictures a day |
| Pollinations | free | a free token | unlimited, slow |
| Your own machine | free | an image model running locally | unlimited and private |
| Google (Nano Banana) | from $0.034 a picture | a key with a prepay balance | readable words in pictures, complicated instructions |
| OpenAI-compatible | about $0.04 a picture | a key | when you already pay for one |

Set them up in **Settings → Image engines**. Each one has a **Check** button that makes a real test call and explains any failure in plain words. You can add several keys for one engine: when one runs out, the next takes over by itself.

> **Watch out** Free engines often draw one picture when asked for a grid of nine panels. Check sheets by eye. A Google model follows grid instructions much better.

## Money: how paid engines work

**A paid run always stops first.** You see how many pictures will be billed, the model, the price each, the total, which credit pays, and free engines you could switch to instead. Nothing is spent until you press **Spend it**.

> **Why** Image Forge asks every time because a loop of a hundred pictures on a paid engine is how people discover what their balance was.

If an engine's price is unknown, the app treats it as paid. Google's "Pro" image models are switched off completely.

## Made: everything you have made

**Made** is the second item in the top menu. It shows the numbers first (made, today, waiting, failed, spent) and then every picture, sheet, GIF and puppet with its exact date, engine and status.

- **Redo** makes a picture again. **Redo N marked or failed** remakes all the marked and failed ones together.
- ♥ and ✕ mark what you liked or did not. Filter chips show only pictures, sheets, GIFs or puppets.
- **GIF** turns a picture into a short moving one. Click any picture to enlarge it.
- **Edit as a table** opens the spreadsheet behind it.
- Thumbnails are kept between restarts. For older pictures, **Find them in my folder** brings them back from your linked folder.

When something is waiting, the header shows one **Make the N waiting** button.

## The list behind it (the manifest)

Every picture is one row in a list: a filename, a description, a look, a shape, and optionally which engine should draw it. A row goes **pending → generating → done**, or **failed** with a reason in plain words. Rows that hit an engine's daily limit wait and retry by themselves.

The list is a **CSV** file, which any spreadsheet can open. You can import one, edit rows in the table, and export it again. Only `filename` is required. A two-column CSV of `filename,prompt` is a valid list.

Filenames follow rules you can see and switch in **Settings → Filenames**. Two always apply: no characters Windows refuses, and no two rows with the same name. A file's ending follows what the engine really returned: Google and Cloudflare send JPEG, so those files end in `.jpg`.

## Where the pictures go

Pictures live inside the app until you take them out. Three ways:

- **Link folder** (best; Settings → Folders). Pick a folder and every finished picture is written there as it finishes, sorted into `images/`, `vectors/`, `lottie/`, `sheets/` and `gifs/`. Point it at a OneDrive or Google Drive folder for free cloud backup.
- **Download** (top bar). A ZIP of every picture in its folder plus the list as a CSV; the list alone as CSV or Excel; or **Upload to WordPress** straight into your media library.
- **Save picture**, one at a time, from its row.

If you have no folder linked, each picture is also kept in the app's own folder, and closing the window warns you about any picture with no copy anywhere.

## Text engines and Chat

A **text engine** is an AI that writes rather than draws. Image Forge uses one for three jobs: **writing** (descriptions, chat), **code** (SVG and animated Lottie pictures) and **vision** (finding where lettering should go on a picture).

In **Settings → Text engines**, add an account once under **Your accounts** (Mistral, OpenAI, OpenRouter, Google, NVIDIA or your own machine), press **Load its models**, then pick a model for each job. One free Mistral key covers all three. If a text engine is busy or its model has been retired, the next engine with a key answers instead.

**Chat** in the top menu lets you ask for a picture in your own words, write a whole list of rows at once, change rows you already have (you see every change before it is applied), or ask how the app works. It only states facts the app itself knows.

## Looks, sheets, GIFs, lettering and puppets

- **Looks** (Gallery → Styles): 36 styles in six families. Star the ones you use. A few need readable words and are limited to models that can spell.
- **Templates** (Gallery → Templates): picture setups saved at the end of the picture wizard, and puppet templates.
- **Sheets:** sets of frames of one character, such as walk cycles, turnarounds, expressions, and mouth shapes for talking.
- **GIFs:** animate a finished picture with camera movement, free.
- **Letterer:** put real, correctly spelled text on a picture and drag its four corners so it sits on a sign or a wall.
- **Vectors:** SVG and Lottie, written by the code engine and cleaned of anything unsafe before they are shown or saved.
- **Puppets:** *Wizards → Make a puppet* draws a character in parts so it can talk, blink, nod and wave in Video Forge. You pick one of four faces; each part gets at most three tries and a picture checker. [Step by step](https://github.com/Stravelakis/image-forge/blob/HEAD/docs/puppets-eli5.md).
- **Hover help:** hold the mouse over anything and a bubble says what it is, in plain words. Press Tab to a control and it shows too; Esc closes it.
- **Cursor chasers:** *Animate a character → Cursor chaser* makes a little creature that runs after the mouse on a website. Try it in the app, then download it ready to add.

## Working with Video Forge

If both apps are installed on the same Windows computer they recognise each other.

- **Shared keys.** A key typed into either app works in both (Google, OpenRouter, NVIDIA, Mistral, Cloudflare, Pollinations, OpenAI, Groq, ElevenLabs, Fish). A shared key only fills an empty box; it never replaces one you typed.
- **The twin switch.** The Video Forge mark in the header opens that app. It is hidden when Video Forge is not installed.
- **Puppets.** *Send to Video Forge* puts a puppet on the shared shelf. Video Forge can also order one; Image Forge notices within about 20 seconds and opens the puppet maker filled in.
- **Picture requests.** Video Forge can ask for pictures. Image Forge does not need to be open; the request waits until it is. Free requests start by themselves and show up in Made. Paid ones stop at the usual dialog.

Your keys never leave Image Forge.

## Let an AI assistant use it

Image Forge includes an **MCP** server with eight tools, so an AI assistant such as Claude Code, Cursor or n8n can fill the list and make pictures for you. With no keys at all it uses the free OVHcloud engine.

To connect Claude Code, run this once from the Image Forge folder:

```bash
claude mcp add image-forge node scripts/mcp-server.js
```

Then you can say: *"Look at the manifest and add eight tavern interiors in different styles, then make the pending ones."*

> **Watch out** There is no human to confirm a purchase when an assistant is driving, so paid engines are **refused** unless you start the server with `FORGE_ALLOW_PAID=1`. Even then it stops at a limit (`FORGE_MAX_USD`, default 1) that counts per server run, not per day. If you want zero risk, keep paid keys out of the assistant's environment.

Always cap a batch (`limit`), and remember OVHcloud is slow on purpose: ten pictures take about five minutes.

## Keep your settings safe

On the desktop app, your keys, settings and list are also kept in a file the app owns, locked so only your Windows user can read it. That is why an update or a busy port cannot open the app empty.

- The top of **Settings** says when your settings were last **saved and checked**, and how many keys are stored (it never shows them).
- **Back up to a file** once your keys are in. The file holds your keys, so keep it private. **Restore** reads it back.
- **Settings → Advanced → Run repair** puts stuck rows back in the queue, separates duplicate filenames, moves rows off models a provider switched off, and clears expired cooldowns. Your data is kept.
- **Reset** lets you tick exactly what to wipe, asks twice, and tells you to download a backup first.

## Window or browser, and updates

**Settings → Advanced → Where Image Forge opens** lets you use your own browser instead of the app window. Everything you set up comes along. Your linked folder needs picking again once after switching.

**Updates.** Settings → Advanced → **Check for app update**. If there is a newer version, **Update now** downloads it from the official release page, installs it and reopens Image Forge, in a minute or two. Your keys, settings and pictures are not touched. The app never checks on its own; it only asks GitHub when you press the button.

## When something goes wrong

| You see | What it means | What to do |
|---|---|---|
| A row says **failed** | The engine refused or timed out | Click the row, read the red note, press **Redo** |
| "Every key is resting" | The engine hit its limit | Nothing; rows retry by themselves |
| Google: "prepayment credits are depleted" | The Google account has no picture balance | The key check in Settings says which fix you need |
| Settings say "NOT saved" | The save could not be proved | Press **Back up to a file** before closing |
| Keys look empty on the desktop app | They are kept in the app's own file | Press **Restore** with your backup |
| A puppet part is marked unsure or missing | The checker was not sure | Press *Try the unsure/missing again*; the puppet works without a missing part |
| "Could not read your manifest" | Nothing was overwritten; the original is kept aside | Press **Try again**, or restore a backup |
| Text in a picture is gibberish | Most engines cannot spell | Use a Google model, or the Letterer |
| Everything feels off | Something got out of step | **Settings → Advanced → Run repair** |
| "Image Forge could not start" | Its local port is busy | Close any other copy and try again |

Every problem found so far, with its real cause: [troubleshooting](https://github.com/Stravelakis/image-forge/blob/HEAD/docs/troubleshooting.md).

## Uninstall

**Settings → Apps → Image Forge → Uninstall.** It asks one question: *Remove your Image Forge data as well?*

- **No:** the app goes; your settings, keys and list stay in `%APPDATA%\image-forge` for a future reinstall.
- **Yes:** that folder goes too.

Pictures you saved to your own folders are never touched.

## Privacy and trust

- No account, no tracking, no Image Forge server.
- Keys stay on your computer and go only to the engine you picked.
- Your descriptions (and, for Chat, your messages) go to the engine you choose, because that is how the picture gets drawn. Read that engine's own privacy terms.
- The only other network call is the update check, and only when you press the button.
- Free and open source. The code is on [GitHub](https://github.com/Stravelakis/image-forge).
