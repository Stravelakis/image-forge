/** "How to use it" under every sheet (lib/recipeHelp.ts). */
import { useState } from "react";
import type { SheetDef } from "../lib/sheets";
import { helpFor } from "../lib/recipeHelp";

export function RecipeHelpBox({ def, name, frames }: { def: SheetDef; name: string; frames: number }) {
  const h = helpFor(def, { name: name.split(/[\s,]+/)[0] || "character", cell: 512, columns: def.columns, frames });
  const [copied, setCopied] = useState("");
  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      /* the text is on screen to copy by hand */
    }
  };
  return (
    <div className="space-y-2 rounded-lg border border-line bg-[var(--color-field)] p-3" data-tip="How to use what you made — steps, code, and a prompt for another AI.">
      <p className="text-[11px] uppercase tracking-[0.14em] text-dust">how to use it</p>
      <ol className="list-decimal space-y-1 pl-5 text-[12.5px] text-parch">
        {h.steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {h.code && (
        <div>
          <p className="text-[11.5px] text-dust">{h.code.label}</p>
          <pre className="mt-1 overflow-x-auto rounded bg-black/50 p-2 font-mono text-[11px] text-cream">{h.code.text}</pre>
          <button className="mt-1 text-[11.5px] text-parch underline" onClick={() => void copy("code", h.code!.text)} data-tip="Copies the code above, ready to paste.">
            {copied === "code" ? "✓ copied" : "Copy the code"}
          </button>
        </div>
      )}
      {h.links.length > 0 && (
        <p className="text-[12px] text-parch">
          {h.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="mr-3 underline" data-tip={`Opens ${l.label} in your browser.`}>
              {l.label} ↗
            </a>
          ))}
        </p>
      )}
      <div>
        <p className="text-[11.5px] text-dust">Or ask any AI (ChatGPT, Claude…) to write it for your own site or tool — paste this, and fill in the [brackets]:</p>
        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-black/50 p-2 text-[11px] text-cream">{h.aiPrompt}</pre>
        <button className="mt-1 text-[11.5px] text-parch underline" onClick={() => void copy("prompt", h.aiPrompt)} data-tip="Copies the prompt above, to paste into another AI.">
          {copied === "prompt" ? "✓ copied" : "Copy the AI prompt"}
        </button>
      </div>
    </div>
  );
}
