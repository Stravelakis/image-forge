---
title: If you vibe-code
nav_order: 4
---

# If you vibe-code

You want to describe what you want and have an agent do it. Image Forge is
built for that: the manifest is a plain CSV, and there is an MCP server that
exposes the whole pipeline as eight tools.

---

## Wire it up in one command

```bash
claude mcp add image-forge node scripts/mcp-server.js
```

Or drop this in your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "image-forge": {
      "command": "node",
      "args": ["scripts/mcp-server.js", "--csv", "marketplace-images.csv", "--out", "generated-images"]
    }
  }
}
```

Works with Claude Code, Cursor, Cline, Windsurf, n8n, LangChain — anything
that speaks MCP over stdio.

Then just talk to it:

> *"Look at the manifest and add eight tavern interiors in different regional
> styles, then forge the pending ones."*

---

## The eight tools

| Tool | What it does |
|---|---|
| `forge_status` | How many pending, done, failed — and which engine is wired up |
| `forge_list` | List rows, optionally filtered by status |
| `forge_add_row` | Add a picture idea |
| `forge_generate_pending` | Generate everything pending, with an optional `limit` |
| `forge_generate_one` | Generate one row by filename |
| `forge_retry_failed` | Put failed rows back to pending |
| `forge_fix_retired` | Move rows off models the provider switched off |
| `forge_models` | Every model with price per image, delayed price, free allowance |

`forge_generate_*` write real files into `images/`, `vectors/`, `lottie/`,
`sheets/` and `gifs/` under `--out`, and update the CSV. They are not
simulations.

---

## Giving the agent engines

**With no configuration at all it uses OVHcloud SDXL**, which needs no key.
Two pictures a minute, always square.

To give it the same engines the app has, point it at a backup file from the
app — either **Settings → Back up to a file** or **Settings → Advanced →
Backup**:

```bash
node scripts/mcp-server.js --settings ./image-forge-settings-2026-09-13.json
```

Or use environment variables:

| Variable | Meaning |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` · `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI, free |
| `POLLINATIONS_TOKEN` | Pollinations, free |
| `GEMINI_API_KEY` / `GEMINI_API_KEYS` | Google keys, comma-separated, rotated on `429` |
| `GEMINI_IMAGE_MODEL` | Which Google model, e.g. `nano-banana-2-lite` |
| `OPENAI_API_KEY` / `OPENAI_API_KEYS` | Keys for any OpenAI-compatible endpoint |
| `OPENAI_BASE_URL` · `OPENAI_IMAGE_MODEL` | Point at Together, OpenRouter, a local server |
| `FORGE_PROVIDER` | Force `ovh` / `cloudflare` / `pollinations` / `gemini` / `openai` |

Which engine it uses when a row names none:

1. `FORGE_PROVIDER`, if set.
2. Otherwise the engine that was selected when the backup was made (the
   practice forge is skipped — an agent writing real files should not produce
   practice drawings).
3. Otherwise the first one that is set up: Cloudflare, Pollinations, Google,
   OpenAI-compatible.
4. Otherwise OVHcloud, which needs nothing.

A row's own `model` column beats all of it, exactly as in the app.

---

## Things worth knowing before you let it run

**Give it a free engine.** An agent in a loop is exactly how you discover what
your paid balance was. The app's paid confirmation dialog does not exist over
MCP — there is no human there to confirm — so the server has **no spending
guard**. Keep paid keys out of its environment unless you are watching.

**Cap the batch.** `forge_generate_pending` takes a `limit`. Use it.

**OVHcloud is slow on purpose.** Two a minute. A limit of 10 takes about five
minutes.

**Weak models cannot spell.** The server suppresses text instructions on
models that produce gibberish, the same way the app does. Ask a Nano Banana
model if you need real words.

**Filenames are validated.** `forge_add_row` rejects path separators outright.
An agent cannot write outside the output folder by choosing a clever filename.

---

## The CSV is the real API

If MCP is not your thing, skip it. The manifest is
[RFC 4180](https://www.rfc-editor.org/rfc/rfc4180) CSV, and any tool that can
read and write it participates fully:

```python
import csv

with open("marketplace-images.csv", newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

pending = [r for r in rows if r["status"] == "pending"]
```

Missing columns are forgiven on import, so you can hand it a two-column CSV
with just `filename` and `prompt`.

---

## Wiring into other stacks

[CONNECT-AGENTS.md](https://github.com/Stravelakis/image-forge/blob/master/CONNECT-AGENTS.md)
covers Claude Code, n8n, LangGraph and Hermes.

For LangGraph: treat `forge_generate_pending` as a node, `forge_status` as your
loop condition, and let the CSV be the state that survives between runs.

---

## Where to go next

- [Architecture and how to add an engine](developers.md)
- [Every manifest column](manifest.md)
