# Installing Image Forge

Two ways. Most people want the first.

---

## 1. The normal way — install it like any program (Windows)

1. Open the [downloads page](https://github.com/Stravelakis/image-forge/releases/latest).
2. Under **Assets**, download **`Image.Forge.Setup.x.y.z.exe`** (about 115 MB —
   the app carries its own browser engine).
3. Run it.
4. Windows shows a blue **"Windows protected your PC"** box, because the app
   is not code-signed yet. Click **More info**, then **Run anyway**. Once only.
   ([Why, and what signing will change](CODE_SIGNING_POLICY.md).)
5. It installs for your user, adds **Start Menu and desktop shortcuts**, and
   appears in **Settings → Apps** with a proper uninstaller.

The app opens on the **Start** screen. With nothing set up it already works:
the default engine, OVHcloud, is free and needs no key.

**No install at all?** Download **`image-forge-portable.exe`** instead and run
it from anywhere. It still keeps your settings on the computer it runs on, in
`%APPDATA%\image-forge`.

---

## 2. From source — Windows, macOS or Linux

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/Stravelakis/image-forge.git
cd image-forge
npm install
npm run dev
```

It opens at `http://localhost:3000`. This is the browser version of the same
app; everything works except the link to BYOK Vid Creator, which needs the
desktop app.

To build the Windows installer yourself:

```bash
node scripts/build-exe.js
```

The installer and the portable exe land in `release/`.

---

## Where your things live

| What | Where |
|---|---|
| Settings, keys, manifest (desktop app) | `%APPDATA%\image-forge` — **Help → Where is my data?** opens it |
| Settings, keys, manifest (browser version) | the browser's storage for `localhost:3000` |
| Your pictures | wherever you point **Link folder**, or a ZIP from **Download** |

Nothing is uploaded anywhere except to the image engine you choose.

**Keep a copy of your keys:** **Settings → Back up to a file**. The file holds
them in plain text — keep it private. **Restore** reads it back.

---

## Updating

Download the newer installer and run it. It installs over the old version and
keeps your settings, keys and manifest. **Settings → Advanced** has a button
that asks GitHub whether a newer release exists; the app never checks on its
own.

---

## Repairing and resetting

In the app, **Settings → Advanced**:

- **Run repair** — puts rows stuck on *generating* back to *pending*,
  separates duplicate filenames, moves rows off models a provider switched
  off, and clears expired cooldowns. Your data is kept.
- **Reset** — tick exactly what to wipe (manifest, recipes and batches,
  settings and keys). Press **Download backup first**. It asks twice.

---

## Uninstalling

**Settings → Apps → Image Forge → Uninstall.** It asks one question:
*Remove your Image Forge data as well?*

- **No** — the app goes; your settings, keys and manifest stay in
  `%APPDATA%\image-forge` for a future reinstall.
- **Yes** — that folder goes too.

Pictures you saved to your own folders are never touched. A silent uninstall
(`/S`) always keeps your data.

---

## Letting an AI agent use it

Image Forge has an MCP server with eight tools, so Claude Code, Cursor, n8n or
Hermes can fill the list and make pictures. With no keys at all it uses
OVHcloud, which needs none.

```bash
claude mcp add image-forge node scripts/mcp-server.js
```

Details, tools and environment variables: [docs/vibe-coding.md](docs/vibe-coding.md)
and [CONNECT-AGENTS.md](CONNECT-AGENTS.md).

---

## If it will not start

| You see | What to do |
|---|---|
| "Windows protected your PC" | Expected: More info → Run anyway |
| "Image Forge could not start" | Its local port is busy. Close any other copy of Image Forge and try again |
| A white window | Close it fully and reopen; if it stays white, [open an issue](https://github.com/Stravelakis/image-forge/issues) with your Windows version |
| From source: `port 3000 already in use` | Another dev server is running; stop it first |
| From source: `'node' is not recognized` | Install Node.js, then open a new terminal |

More in [docs/troubleshooting.md](docs/troubleshooting.md).
