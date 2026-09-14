---
title: Download and install
nav_order: 2
---

# Download and install on Windows

No terminal. No accounts. Roughly five minutes.

---

## 1. Get the file

### [⬇ Open the downloads page](https://github.com/Stravelakis/image-forge/releases/latest)

Scroll to the bottom of that page, to a grey section called **Assets**. You
want one of these two:

| File | Choose this if |
|---|---|
| `Image.Forge.Setup.x.y.z.exe` | You want a normal install — Start menu entry, desktop shortcut, an entry in Settings → Apps to uninstall it from. **Most people want this one.** |
| `image-forge-portable.exe` | You want no install at all. Runs from wherever you put it, including a USB stick. Your settings and keys are still saved on the computer you run it on, in `%APPDATA%\image-forge`. |

Each is about 115 MB. That is normal: the app carries its own browser engine,
so it does not matter what you have installed.

> **Coming from 1.0.0?** Install 1.0.1 over it. 1.0.0 lost its settings on
> every restart, so keys you typed into it need entering once more. From 1.0.1
> on, they stay. [What happened](https://github.com/Stravelakis/image-forge/blob/master/CHANGELOG.md).

---

## 2. The blue box

The first time you run it, Windows will show a blue screen saying
**"Windows protected your PC"** with only a *Don't run* button.

This is not a virus warning. Windows shows it for every program that has not
been signed with a paid code-signing certificate, which costs a few hundred
euros a year. This project does not have one, and would rather tell you that
plainly than hide it.

**To continue:**

1. Click **More info** — the small text link, which is easy to miss.
2. A **Run anyway** button appears. Click it.

You only do this once.

The very first start can take a little longer while Windows checks the new
program. After that it opens in about a second.

> **If you would rather not**, that is a completely reasonable position. You
> can [run it from source](developers.md#run-it-from-source) instead, which
> involves no unsigned executable.

---

## 3. First run

The app opens on the Forge — an empty list of pictures. You need one engine to
draw them.

**The fastest way needs no signup at all:** in the toolbar at the top, click
the engine button and choose **OVHcloud · SDXL**. That is it. It is free,
needs no key, and makes two pictures a minute, always square.

**For more pictures, faster:** Cloudflare gives roughly **690 images a day,
free, with no credit card**. It takes about three minutes to set up —
[step-by-step instructions](no-code.md#cloudflare).

Prefer to learn the buttons first? Choose **Simulated Forge**. It draws little
scenes offline, instantly and free.

---

## 4. Where your things live

| What | Where |
|---|---|
| Your settings and keys | `%APPDATA%\image-forge` |
| Your images | Wherever you point **Link folder** — pick your OneDrive or Google Drive folder and you get free cloud backup |
| Your manifest | Inside the app, and written to a CSV in your linked folder |

Paste `%APPDATA%\image-forge` into the address bar of any Explorer window to
open it. The app's **Help → Where is my data?** menu opens it for you.

**Keep a copy of your keys.** **Settings** shows when your settings were last
saved, and has a **Back up to a file** button. The file holds your keys in
plain text, so keep it somewhere private. **Restore** reads it back.

---

## 5. Updating

The app checks for a newer release and tells you when there is one. To update,
download the new installer and run it — it installs over the old version and
keeps your settings, keys and manifest.

Every release stays on the
[releases page](https://github.com/Stravelakis/image-forge/releases) if you
ever need an older one.

---

## Uninstalling

Windows **Settings → Apps → Image Forge → Uninstall**.

The uninstaller asks whether you also want to delete your settings and keys.
Say **No** if you plan to reinstall; **Yes** if you are done. Your images are
never touched — they are in your own folder, not the app's.

For the portable version: delete the `.exe`. Your settings and keys stay in
`%APPDATA%\image-forge` until you delete that folder too.

---

## When something is wrong

| What you see | What it means |
|---|---|
| Blue "Windows protected your PC" | Expected. See [above](#2-the-blue-box). |
| Antivirus quarantines it | Same cause — unsigned. If you are not comfortable allowing it, run from source instead. |
| "Image Forge could not start" | It could not open its local port. Close any other copy of Image Forge and try again. |
| App opens to a white screen | Close it fully and reopen. If it persists, [open an issue](https://github.com/Stravelakis/image-forge/issues) and say which Windows version you are on. |
| "Every key is resting" | Your engine hit its limit. Switch to another engine in the toolbar, or wait for the reset. |
| Settings say "NOT saved" | The app could not store your change. Press **Back up to a file** before closing. |

More in [Troubleshooting](troubleshooting.md). Still stuck?
[Open an issue](https://github.com/Stravelakis/image-forge/issues). "The button
did nothing" is a perfectly good bug report.
