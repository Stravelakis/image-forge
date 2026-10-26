import { CodeBlock, CopyBtn, useRevealObserver } from "./ui";

const CONTRACT = `# marketplace-images.csv - the single contract (filename is the only required column)
id,filename,prompt,negative_prompt,note,category,style,aspect_ratio,seed,model,status,error,generated_at

# statuses:  pending -> generating -> done -> imported
#            (failed and skipped are side doors)

# output layout - identical wherever the files land
images/image_potion_shop.png
vectors/svg_potion_icon.svg
lottie/lottie_sparkle.json
sheets/sheet_fox_walk.png
gifs/gif_potion_pour.gif`;

const CLAUDE_CODE = `# Already done if you open this folder in Claude Code: .mcp.json sits in the project root.
# Confirm with /mcp. To add it by hand:
claude mcp add image-forge -- node scripts/mcp-server.js`;

const MCP_JSON = `{
  "mcpServers": {
    "image-forge": {
      "command": "node",
      "args": [
        "C:/Users/you/path/to/scripts/mcp-server.js",
        "--csv", "C:/Users/you/path/to/marketplace-images.csv",
        "--out", "C:/Users/you/path/to/generated-images"
      ],
      "env": { "CLOUDFLARE_ACCOUNT_ID": "", "CLOUDFLARE_API_TOKEN": "" }
    }
  }
}`;

const KEYS = `# keys for the agent door: a settings backup from the app (Settings > Advanced > Backup) ...
node scripts/mcp-server.js --settings ./image-forge-backup.json

# ... or the environment
CLOUDFLARE_ACCOUNT_ID  CLOUDFLARE_API_TOKEN   # free, about 690 a day
POLLINATIONS_TOKEN                             # free token
GEMINI_API_KEY         GEMINI_API_KEYS         # Google (comma-separated pool)
OPENAI_API_KEY         OPENAI_BASE_URL         # OpenAI or compatible`;

const TOOLS: [string, string][] = [
  ["forge_status", "How many rows are pending, done or failed, which engine is wired up, and what the pending rows would cost."],
  ["forge_models", "Every model with its price per picture, batch price and free allowance."],
  ["forge_list", "List the rows (filename, category, status), optionally only one status."],
  ["forge_add_row", "Add a picture idea: filename, prompt, category, aspect ratio, seed, model."],
  ["forge_generate_pending", "Make everything pending (optionally up to a limit) and write real pictures to disk."],
  ["forge_generate_one", "Make one row, by filename."],
  ["forge_retry_failed", "Put every failed row back to pending."],
  ["forge_fix_retired", "Move rows off a model the provider switched off, onto its replacement."],
];

export default function AgentsView() {
  const ref = useRevealObserver<HTMLDivElement>();
  return (
    <div ref={ref} className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="reveal mb-10">
        <p data-tip="A small label: this page is for AI helper programs, not for you to type into." className="font-mono text-[11px] tracking-[0.28em] text-lagoon uppercase">for the robots</p>
        <h2 data-tip="How an AI helper program can use Image Forge without you." className="mt-2 font-display text-3xl text-cream">Agents &amp; API</h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-parch">
          An AI agent can drive the forge over <span data-tip="MCP is a standard plug that lets an AI helper program use another program's tools." className="text-cream">MCP</span> (the plug most coding agents use to pick up
          tools). One small program, <span data-tip="The small program file the AI helper starts. You never open it yourself." className="font-mono text-cream">scripts/mcp-server.js</span>, offers eight tools and works on the
          same <span data-tip="CSV is a simple spreadsheet file with one picture per row." className="text-cream">CSV</span> the app uses. The app does not need to be open: the agent and the app are two doors
          onto the same list.
        </p>
      </header>

      <section className="reveal mb-10">
        <h3 data-tip="The things an AI helper is allowed to ask Image Forge to do." className="mb-3 font-display text-lg text-cream">The eight tools</h3>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <tbody>
              {TOOLS.map(([name, what]) => (
                <tr data-tip={what} key={name} className="border-b border-line/60 text-[12.5px] last:border-0">
                  <td className="w-[210px] px-3.5 py-2 align-top font-mono text-[11px] whitespace-nowrap text-ember">{name}</td>
                  <td className="px-3.5 py-2 text-parch">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[12.5px] text-dust">
          Filenames are checked before anything touches the disk: a bare filename only, so an agent cannot write outside its output
          folder. There is no spending guard over MCP (no human is there to press Spend it), so keep paid keys out of an
          agent&apos;s environment.
        </p>
      </section>

      <section className="reveal mb-10">
        <h3 data-tip="How to plug an AI helper in." className="mb-3 font-display text-lg text-cream">Connect it</h3>
        <p data-tip="The one line to run if your AI helper is Claude Code." className="mb-3 text-[13.5px] text-parch">Claude Code:</p>
        <CodeBlock code={CLAUDE_CODE} />
        <p className="mb-3 mt-5 text-[13.5px] text-parch">
          Cursor, Windsurf, goose, opencode and most others read this same block. Use absolute paths: several launch the command from
          their own folder, and a relative path quietly points at the wrong list.
        </p>
        <CodeBlock code={MCP_JSON} />
        <div className="mt-2 flex justify-end"><CopyBtn data-tip="Copies this block so you can paste it into your agent's MCP settings." text={MCP_JSON} label="copy" /></div>
        <p className="mt-2 text-[12.5px] text-dust">
          The full guide, with LangChain and LangGraph, Hermes and a way to test the server by hand, is{" "}
          <span data-tip="A guide file in the project folder with every step for other AI helpers." className="font-mono text-parch">CONNECT-AGENTS.md</span> in the project folder.
        </p>
      </section>

      <section className="reveal mb-10">
        <h3 data-tip="Where the AI helper finds your keys, if you want it to use paid painters." className="mb-3 font-display text-lg text-cream">Keys for the agent door</h3>
        <p className="mb-3 text-[13.5px] text-parch">
          With no keys at all the server uses OVHcloud, which needs none (two pictures a minute, always square). For more, give it
          one of these. Your keys stay on your machine either way.
        </p>
        <CodeBlock code={KEYS} />
      </section>

      <section className="reveal mb-10">
        <h3 data-tip="The exact shape of the spreadsheet the helper and the app both use." className="mb-3 font-display text-lg text-cream">The contract</h3>
        <CodeBlock code={CONTRACT} />
        <p className="mt-2 text-[12.5px] text-dust">
          Anything that reads and writes this file is a first-class citizen: n8n, a Python script, a spreadsheet. The importer
          forgives missing columns and rows that were mid-generation. Every column is explained in docs/manifest.md.
        </p>
      </section>

      <p className="reveal border-t border-line pt-5 text-[12px] leading-relaxed text-dust">
        There is no hosted web address to call: the forge runs on your computer. A small HTTP front (POST /generate, GET /status)
        would be the next step; until then the CSV and the eight tools are the API.
      </p>
    </div>
  );
}
