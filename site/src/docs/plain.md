## What Image Forge is

A Windows app that makes pictures in bulk. You say what you need and how many,
and it makes them, names them properly, and puts them in a folder.

It uses AI image services — some free, some paid — with **your own keys**.
There is no account and no Image Forge server. Your keys stay on your
computer and are sent only to the service you chose.

## Install it

1. Go to the [downloads page](https://github.com/Stravelakis/image-forge/releases/latest)
   and get **Image.Forge.Setup.x.y.z.exe**.
2. Run it. Windows shows a blue "Windows protected your PC" box, because the
   app is not signed with a paid certificate yet. Click **More info**, then
   **Run anyway**. You only do this once.
3. It installs like any program: Start menu, desktop shortcut, and an entry in
   **Settings → Apps** to uninstall it from.

## Your first pictures

The app opens on the **Start** screen.

1. Type what you need, for example *"12 potion bottle icons, cute, glowing"*.
2. Check **How many** (it reads a number at the start of your sentence).
3. Pick a **Look** and a **Shape** if you like.
4. Press **Make**.

With nothing set up it uses **OVHcloud**, which is free and needs no key. It
makes two pictures a minute and they are always square. The pictures appear
under the box as they finish; click one to see it full size.

## Faster or better pictures

Open **Settings → Image engines**:

- **Cloudflare** — free, about 690 pictures a day, no card. Needs a free
  account id and token.
- **Your own machine** — free and unlimited if you run an image model locally.
- **Google (Nano Banana)** — costs money per picture, but can write readable
  words in a picture and follows complicated instructions best.

A paid engine never runs without asking. You see how many pictures, the price
each, the total and which credit pays — with a button to switch to a free
engine instead.

## More varied sets

The Start screen varies a set by framing. For genuinely different pictures in
one set, add a text engine: **Settings → Text engines → Your accounts**. One
free Mistral key covers writing, code and vision.

## Keeping your settings safe

The top of **Settings** says when your settings were last saved and checked,
and how many keys are stored (it never shows them). Press **Back up to a
file** once your keys are in, and keep the file private — it holds the keys.

## Working with BYOK Vid Creator

If both apps are installed, the video app can ask Image Forge for pictures,
such as mouth-shape sheets for its characters. Free requests run by
themselves; anything that costs money still asks you first.

Be aware: free engines often draw one picture when asked for a grid of nine,
so check sheets by eye. A Google model follows grid instructions far better.

## When something is wrong

- **"Windows protected your PC"** — expected; see Install.
- **"Every key is resting"** — the engine hit its limit; it retries by itself.
- **Google says "prepayment credits are depleted"** — the account has no
  picture balance. The key check in Settings explains which fix you need.
- **Settings say "NOT saved"** — press **Back up to a file** before closing.

The full troubleshooting page, with the cause of each problem, is in the
[repository](https://github.com/Stravelakis/image-forge/blob/master/docs/troubleshooting.md).

## Window or browser, and updates

Image Forge can open in its own window or in the browser you already use —
**Settings → Advanced → Where Image Forge opens**. Your settings and keys come
along. When a new version is out, **Update now** installs it for you and
reopens the app; nothing of yours is touched.
