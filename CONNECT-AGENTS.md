# Letting an agent drive the forge

The forge speaks **MCP** — the protocol most coding agents now use to pick up
tools. One small Node program, `scripts/mcp-server.js`, exposes eight tools and
drives the same `marketplace-images.csv` the app uses. Anything that speaks MCP
can therefore add rows, generate them, and fix them.

Nothing here needs the app to be running. The agent and the app are two front
doors onto the same manifest file.

---

## What the agent gets

| tool | what it does |
|---|---|
| `forge_status` | how many rows are pending/done/failed, which engine is wired up, and what the pending rows would cost |
| `forge_models` | every model with its price per image, batch price and free allowance |
| `forge_list` | list rows, optionally filtered by status |
| `forge_add_row` | add a picture idea (filename, prompt, category, aspect, seed, model) |
| `forge_generate_pending` | generate everything pending, writing real PNGs to disk |
| `forge_generate_one` | generate a single row by filename |
| `forge_retry_failed` | put failed rows back to pending |
| `forge_fix_retired` | move rows off a model the provider switched off |

Filenames are checked before anything touches the disk: a bare filename only,
lowercase, ending in `.png`. An agent cannot write outside the output folder.

---

## Keys

With no keys at all the server uses OVHcloud, which needs none (two pictures a
minute, always square). For more, give it keys either way you prefer:

**A settings file** — export a backup from the app (Settings → Advanced →
Backup) and point at it:

```bash
node scripts/mcp-server.js --settings ./image-forge-backup-2026-09-02.json
```

**Or the environment:**

| variable | for |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | the free ~690/day Cloudflare allowance |
| `POLLINATIONS_TOKEN` | free token from auth.pollinations.ai |
| `GEMINI_API_KEY` or `GEMINI_API_KEYS` | Google, comma-separated for a rotating pool |
| `OPENAI_API_KEY` / `OPENAI_API_KEYS`, `OPENAI_BASE_URL` | OpenAI or anything that speaks its dialect |
| `FORGE_PROVIDER` | force `local`, `cloudflare`, `pollinations`, `gemini` or `openai` |
| `GEMINI_IMAGE_MODEL` | e.g. `nano-banana-2-lite` |

**Your own machine works here too.** Point `--settings` at a backup whose local
address is set, or run the app once to write one. Free, unlimited, private.

---

## Claude Code

Already done — `.mcp.json` sits in the project root, so opening this folder in
Claude Code picks the forge up automatically. Confirm with `/mcp`.

To add it by hand instead:

```bash
claude mcp add image-forge -- node scripts/mcp-server.js
```

Then just ask: *"add six shop fronts to the manifest and generate them."*

---

## Anything using the standard MCP config

goose, opencode, antigravity, openhuman, Cursor, Windsurf and most others read
the same shape. Point them at this block, adjusting the path:

```json
{
  "mcpServers": {
    "image-forge": {
      "command": "node",
      "args": [
        "C:/Users/you/path/to/scripts/mcp-server.js",
        "--csv", "C:/Users/you/path/to/marketplace-images.csv",
        "--out", "C:/Users/you/path/to/generated-images"
      ],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "",
        "CLOUDFLARE_API_TOKEN": ""
      }
    }
  }
}
```

Where each one keeps that file:

| agent | file |
|---|---|
| goose | `~/.config/goose/config.yaml` (under `extensions:`, as an `stdio` extension) |
| opencode | project `opencode.json`, under `mcp` |
| Cursor | `.cursor/mcp.json` in the project |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| antigravity / openhuman / buzz | check each one's settings for "MCP servers"; the JSON above is the shape they expect |

Use **absolute paths**. Several of these launch the command from their own
working directory, not yours, and a relative path will silently point at the
wrong manifest.

---

## Hermes and openworker

Both drive MCP over stdio the same way. If either wants a single command string
rather than a command/args pair:

```
node C:/Users/you/path/to/scripts/mcp-server.js --csv C:/Users/you/path/to/marketplace-images.csv
```

If a tool only speaks HTTP and not stdio, wrap it with `mcp-proxy` rather than
changing the server.

---

## LangGraph / LangChain

The adapters package turns MCP tools into LangChain tools, so the forge becomes
eight ordinary tools your graph can call.

```bash
pip install langchain-mcp-adapters langgraph "langchain[openai]"
```

```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent

async def main():
    client = MultiServerMCPClient(
        {
            "image_forge": {
                "command": "node",
                "args": [
                    r"C:/Users/you/path/to/scripts/mcp-server.js",
                    "--csv", r"C:/Users/you/path/to/marketplace-images.csv",
                    "--out", r"C:/Users/you/path/to/generated-images",
                ],
                "transport": "stdio",
            }
        }
    )

    tools = await client.get_tools()          # async — needs the await
    agent = create_agent("openai:gpt-4.1", tools)

    result = await agent.ainvoke(
        {"messages": [{"role": "user",
                       "content": "Add three market stall pictures and generate them."}]}
    )
    print(result["messages"][-1].content)

asyncio.run(main())
```

Two things that catch people out:

- `get_tools()` is **async**. Forgetting the `await` gives you a coroutine where
  a tool list should be, and a confusing error much later.
- stdio launches the server as a **child process**. Fine on your own machine,
  which is what it was designed for. If you ever put this behind a web server,
  use an HTTP transport instead.

---

## Checking it works

Without any agent at all, you can talk to the server by hand:

```bash
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node scripts/mcp-server.js
```

You should get two JSON lines back, the second listing eight tools. If you do,
any MCP client will work; if you do not, the problem is Node or the path, not
the agent.

To see which engine it would use and what a run would cost:

```bash
printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"p","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"forge_status","arguments":{}}}' \
  | node scripts/mcp-server.js
```

---

## If something goes wrong

**"unknown tool"** — the agent is caching an old tool list. Restart it.

**Nothing is generated and every row fails** — run `forge_status`. It says which
engine is wired up and whether any keys were found. Most often there are none,
and Pollinations is refusing anonymous requests.

**Rows fail with "switched off by the provider"** — they point at a retired
model. Run `forge_fix_retired`.

**The agent writes to the wrong manifest** — a relative `--csv` path resolved
against the agent's working directory. Use absolute paths.
