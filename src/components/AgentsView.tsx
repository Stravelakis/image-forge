import { CodeBlock, CopyBtn, useRevealObserver } from "./ui";

const CONTRACT = `# marketplace-images.csv — the single contract
id,filename,prompt,negative_prompt,note,category,item_id,shop_id,event_id,style,aspect_ratio,width,height,seed,model,status,error,generated_at,imported_attachment_id

# statuses:  pending → generating → done → imported
#            (failed & skipped are side doors; failed rows carry a retry_at cooldown)

# output layout — identical wherever the files land
shops/shop_blacksmith.png
items/item_longsword.png
events/event_escaped_goat.png
npcs/npc_city_guard.png`;

const N8N = `{
  "name": "Image Forge nightly batch",
  "nodes": [
    { "type": "n8n-nodes-base.scheduleTrigger", "note": "every night at 02:00" },
    { "type": "n8n-nodes-base.googleSheets",   "note": "read rows: theme, category, model" },
    { "type": "n8n-nodes-base.httpRequest",    "note": "POST pollinations or Imagen per row (recipes below)" },
    { "type": "n8n-nodes-base.writeBinaryFile","note": "save into shops/ items/ events/ npcs/" },
    { "type": "n8n-nodes-base.wordpress",      "note": "upload to Media Library → Imagify → id back to the sheet" }
  ]
}`;

const MCP = `// mcp-image-forge — a tiny MCP server any agent can call
// npm i @modelcontextprotocol/sdk
server.tool("generate_image",
  { filename: z.string(), prompt: z.string(), negative: z.string().optional(),
    category: z.enum(["shop","item","event","npc"]), model: z.string().optional() },
  async ({ filename, prompt, negative, category, model }) => {
    // 1. append the row to marketplace-images.csv (status: pending)
    // 2. run the same generator the forge uses (pollinations / imagen / openai)
    // 3. write the PNG into <category folder>/filename
    // 4. flip status to done — or failed with the error column filled
    return { filename, folder: categoryFolder[category], status: "done" };
  });
server.tool("list_pending", {}, () => readCsv().filter(r => r.status === "pending"));
server.tool("retry_failed", {}, () => { /* flip failed → pending, honoring retry_at */ });`;

const LANGCHAIN = `from langchain.tools import tool
import httpx, pathlib

@tool
def forge_generate(filename: str, prompt: str, negative: str = "",
                   category: str = "item", model: str = "flux") -> str:
    """Generate one marketplace image the way Image Forge does."""
    r = httpx.get("https://image.pollinations.ai/prompt/" + httpx.quote(prompt),
                  params={"width": 1024, "height": 1024, "model": model,
                          "negative": negative, "nologo": "true"}, timeout=240)
    path = pathlib.Path({"shop":"shops","item":"items",
                         "event":"events","npc":"npcs"}[category]) / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(r.content)   # then append the row to the CSV with status=done
    return str(path)`;

const CURL = `# Pollinations — no key
curl -G "https://image.pollinations.ai/prompt/medieval%20potion%20shop" \\
  --data-urlencode "model=flux" --data-urlencode "negative=text, watermark" \\
  -d "width=1024&height=576&nologo=true" --output shop_potions.png

# Google Imagen — free Gemini key (≈25/day per model)
curl "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=$GEMINI_API_KEY" \\
  -H 'Content-Type: application/json' \\
  -d '{"instances":[{"prompt":"..."}],"parameters":{"sampleCount":1,"aspectRatio":"16:9"}}' \\
  | jq -r '.predictions[0].bytesBase64Encoded' | base64 -d > event_goat.png`;

export default function AgentsView() {
  const ref = useRevealObserver<HTMLDivElement>();
  return (
    <div ref={ref} className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="reveal mb-10">
        <p className="font-mono text-[11px] tracking-[0.28em] text-lagoon uppercase">for the robots</p>
        <h2 className="mt-2 font-display text-3xl text-cream">Agents &amp; API</h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-parch">
          The forge is a browser app, so there's no hosted REST endpoint to call — yet. But the whole system is defined
          by two boring, stable things: <span className="text-cream">the CSV contract</span> and{" "}
          <span className="text-cream">plain HTTPS endpoints</span>. Both are trivial to drive from n8n, an MCP server,
          or a LangChain agent. Here's how.
        </p>
      </header>

      <section className="reveal mb-10">
        <h3 className="mb-3 font-display text-lg text-cream">The contract</h3>
        <CodeBlock code={CONTRACT} />
        <p className="mt-2 text-[12.5px] text-dust">
          Any automation that reads and writes this file is a first-class citizen. The forge's importer even forgives
          missing columns and rows that were mid-generation.
        </p>
      </section>

      <section className="reveal mb-10">
        <h3 className="mb-3 font-display text-lg text-cream">n8n — the nightly batch</h3>
        <p className="mb-3 text-[13.5px] text-parch">
          Sheet → prompts → images → folder → WordPress. Every node already exists; the recipes below supply the HTTP step.
        </p>
        <CodeBlock code={N8N} />
      </section>

      <section className="reveal mb-10">
        <h3 className="mb-3 font-display text-lg text-cream">MCP — for Hermes, Claude &amp; friends</h3>
        <p className="mb-3 text-[13.5px] text-parch">
          A ~50-line MCP server makes the forge callable as tools. The agent never needs to know which engine paints — it just files a request against the manifest.
        </p>
        <CodeBlock code={MCP} />
      </section>

      <section className="reveal mb-10">
        <h3 className="mb-3 font-display text-lg text-cream">LangChain — a forge tool</h3>
        <p className="mb-3 text-[13.5px] text-parch">Wrap the same call as an agent tool and any LangGraph workflow can commission marketplace art:</p>
        <CodeBlock code={LANGCHAIN} />
      </section>

      <section className="reveal mb-10">
        <h3 className="mb-3 font-display text-lg text-cream">The raw recipes</h3>
        <div className="mb-2 flex justify-end"><CopyBtn data-tip="Copies both recipes so you can paste them into your own tool." text={CURL} label="copy both" /></div>
        <CodeBlock code={CURL} />
      </section>

      <p className="reveal border-t border-line pt-5 text-[12px] leading-relaxed text-dust">
        A hosted HTTP facade (POST /generate, GET /status, webhook on done) is the natural v2 — it would make the n8n
        flow two nodes instead of five. Until then: the CSV is the API.
      </p>
    </div>
  );
}
