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
| `Image Forge Setup x.y.z.exe` | You want a normal install — Start menu entry, desktop shortcut, an uninstaller. **Most people want this one.** |
| `image-forge-portable.exe` | You want no install at all. Runs from wherever you put it, including a USB stick. Your settings and keys are still saved on the computer you run it on, in `%APPDATA%\image-forge`. |

Both are about 200 MB. That is normal: the app carries its own browser engine
so it does not matter what you have installed.

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

> **If you would rather not**, that is a completely reasonable position. You
> can [run it from source](developers.md#run-it-from-source) instead, which
> involves no unsigned executable, or wait until the project can afford a
> certificate.

---

## 3. First run

The app opens on the manifest — an empty spreadsheet. Before you can make
anything you need one engine set up. **The fastest free one takes about three
minutes:**

1. Click the **⚙ Settings** button, top right.
2. Go to **Image engines**.
3. Find **Cloudflare Workers AI**.

Cloudflare gives roughly **690 images a day, free, with no credit card**.
[Step-by-step instructions for getting those two values](no-code.md#cloudflare)
are in the no-code guide.

Prefer to try it with nothing at all first? Set the engine to **practice
forge**. It draws little scenes offline, instantly and free, so you can learn
the app before you sign up for anything.

---

## 4. Where your things live

| What | Where |
|---|---|
| Your settings and keys | `%APPDATA%\image-forge` |
| Your images | Wherever you point **Link folder** — pick your OneDrive or Google Drive folder and you get free cloud backup |
| Your manifest | Inside the app, and written to `marketplace-images.csv` in your linked folder |

Paste `%APPDATA%\image-forge` into the address bar of any Explorer window to
open it. The app's **Help → Where is my data?** menu does the same thing.

---

## 5. Updating

The app checks for a newer release and tells you when there is one. To update,
download the new installer and run it — it installs over the old version and
keeps your settings, keys and manifest.

To go back to an older version, every release stays on the
[releases page](https://github.com/Stravelakis/image-forge/releases)
forever.

---

## Uninstalling

Windows **Settings → Apps → Image Forge → Uninstall**.

The uninstaller asks whether you also want to delete your settings and keys.
Say no if you plan to reinstall; say yes if you are done. Your images are
never touched — they are in your own folder, not the app's.

For the portable version: delete the `.exe`. Your settings and keys stay in `%APPDATA%\image-forge` until you delete that folder too.

---

## When something is wrong

| What you see | What it means |
|---|---|
| Blue "Windows protected your PC" | Expected. See [above](#2-the-blue-box). |
| Antivirus quarantines it | Same cause — unsigned. If you are not comfortable allowing it, run from source instead. |
| App opens to a white screen | Close it fully and reopen. If it persists, [open an issue](https://github.com/Stravelakis/image-forge/issues) and say which Windows version you are on. |
| "Every key is resting" | Your engine hit its daily limit. Switch to another engine in Settings, or wait for the reset. |
| "The key is valid, but its project has no credit" | The key works, but the account behind it has no money. See [the credit problem](troubleshooting.md). |

Still stuck? [Open an issue](https://github.com/Stravelakis/image-forge/issues).
There is no wrong question, and "the button did nothing" is a perfectly good
bug report.
