import type { ManifestRow } from "../types";
import { CATEGORIES, CATEGORY_META } from "../types";
import type { ForgeSettings } from "../lib/providers";
import { MODELS } from "../lib/providers";
import { fsSupported, CATEGORY_FOLDER } from "../lib/output";
import { Btn, CodeBlock, CopyBtn, IDownload, IFolder, useRevealObserver } from "./ui";

const FULL_SCHEMA = `id,filename,prompt,negative_prompt,note,category,kind,style,aspect_ratio,width,height,seed,model,status,error,generated_at
1,image_potion_shop.png,"Claymation-style potion shop front","text, watermark",,image,,claymation,16:9,1024,576,41,cloudflare-flux,pending,,
2,image_potion_red.png,"Claymation-style red potion bottle icon",,,image,,claymation,1:1,768,768,3,ovh-sdxl,pending,,`;

const MINIMAL_CSV = `filename,prompt,category,model
image_tavern.png,"ramshackle tavern at dusk, foaming tankard sign",image,ovh-sdxl
image_rope.png,"coiled hempen rope icon on parchment",image,cloudflare-flux`;

const COLUMNS: [string, string][] = [
  ["id", "numeric, optional — assigned automatically when missing"],
  ["filename", "required · must pass the seven filename rules (Settings → Filenames)"],
  ["prompt", "what gets sent to the painter"],
  ["negative_prompt", "what must NOT appear — sent to engines that understand it"],
  ["note", "your margin note · becomes part of the prompt when you redo the picture"],
  ["category", "image · svg · lottie · sheet · gif — decides the output subfolder"],
  ["kind", "optional flavour that seasons the prompt"],
  ["style", "the visual language, e.g. claymation (36 built in, plus your own)"],
  ["aspect_ratio", "16:9 · 1:1 · 9:16 · 4:3 — width/height derive from it"],
  ["seed", "reproducibility seed; 0 lets the engine choose"],
  ["model", "per-row painter, e.g. ovh-sdxl, cloudflare-flux, flux, nano-banana-2-lite, gpt-image-1 or any endpoint id. Empty = the default engine"],
  ["status", "pending → generating → done → imported (failed / skipped are side doors)"],
  ["error", "last failure, written by the forge"],
  ["generated_at", "ISO time of the successful strike"],
];

function wpCliScript(rows: ManifestRow[]): string {
  const finished = rows.filter((r) => r.status === "done" || r.status === "imported");
  const lines = finished.map(
    (r) =>
      `ATT=$(wp media import "${CATEGORY_FOLDER[r.category]}/${r.filename}" --porcelain) && \\
echo "${r.filename},$ATT" >> attachment-ids.csv && \\
wp post meta update "$ATT" _wp_attachment_image_alt "${r.prompt.slice(0, 100).replace(/"/g, "'")}"`
  );
  return `#!/usr/bin/env bash
# Run from the folder that contains images/ vectors/ lottie/ sheets/ gifs/
set -euo pipefail
echo "filename,attachment_id" > attachment-ids.csv

${lines.length ? lines.join("\n\n") : "# no finished rows yet — make some pictures first"}

echo "done — feed attachment-ids.csv into your custom SQL table"`;
}

export default function DocsView({
  rows,
  settings,
  folderLinked,
  folderName,
  onLinkFolder,
  onZip,
  onOpenSettings,
}: {
  rows: ManifestRow[];
  settings: ForgeSettings;
  folderLinked: boolean;
  folderName: string;
  onLinkFolder: () => void;
  onZip: () => void;
  onOpenSettings: () => void;
}) {
  const ref = useRevealObserver<HTMLDivElement>();
  const script = wpCliScript(rows);

  return (
    <div ref={ref} className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="reveal mb-10">
        <p data-tip="A small label: this is the manual." className="font-mono text-[11px] tracking-[0.28em] text-ember uppercase">the manual</p>
        <h2 data-tip="The full manual. Hold the mouse over anything in the app for a short explanation." className="mt-2 font-display text-3xl text-cream">Image Forge, documented</h2>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-parch">
          Describe what you need, say how many, and get named, sorted pictures — plus sheets, GIFs and talking puppets for Video
          Forge. Under it all is a spreadsheet you can open any time. Hold the mouse over any control and a small bubble says what it
          does.
        </p>
      </header>

      <ol className="space-y-12">
        <li className="reveal">
          <h3 data-tip="The fastest way to your first pictures." className="font-display text-lg text-cream">01 · Two-minute quickstart</h3>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-parch marker:font-mono marker:text-ember">
            <li data-tip="Step 1: open Start and say what you need.">
              Open <span data-tip="The first page of the app. You type what you need here." className="font-display text-cream">Start</span> (the app opens there). Type what you need, once:{" "}
              <span data-tip="An example of what you could type." className="font-mono text-cream">12 potion bottle icons, cute</span>. A number at the start fills in{" "}
              <span data-tip="The box for how many pictures to make." className="font-display text-cream">How many</span>.
            </li>
            <li data-tip="Step 2: choose a look and a shape. You can skip the look.">Pick a <span data-tip="The look the pictures will have, like clay or paper." className="font-display text-cream">Style</span> (optional) and a shape: square, wide or tall.</li>
            <li data-tip="Step 3: choose which painter draws the pictures.">
              Pick an <span data-tip="The engine is the painter that draws your pictures. Pick one from the list." className="font-display text-cream">engine</span> from the drop-down. It lists only engines that are set
              up; <span data-tip="A free painter that needs no key, so it is always in the list." className="font-mono text-moss">OVHcloud</span> is always there and needs no key. <em data-tip="The last choice in the list. It opens Settings so you can add more painters.">Add more engines…</em> at
              the end opens{" "}
              <button data-tip="Opens Settings on the Image engines page, where you add keys." onClick={onOpenSettings} className="font-mono text-ember underline decoration-ember/40 underline-offset-2">Settings → Image engines</button>.
            </li>
            <li>Press the button. Start shows the run in progress, then your last run. <em data-tip="A link to the Made page, where all your pictures are.">See everything in Made →</em> opens the full list.</li>
            <li>Get the files: link an output folder (auto-save), download the ZIP, or save pictures one by one.</li>
          </ol>
        </li>

        <li className="reveal">
          <h3 data-tip="The Made page: the home of everything you have made." className="font-display text-lg text-cream">02 · Made — everything you have made</h3>
          <p className="mt-2 text-[13.5px] text-parch">
            <span data-tip="The page where all your pictures, sheets, GIFs and puppets are." className="font-mono text-cream">Made</span> (it used to be called Forge) is the home of everything: numbers at the
            top (made, today, waiting, failed, spent, and a count by engine), then every picture, sheet, GIF and puppet with its exact
            date, engine and status.
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-parch marker:text-ember">
            <li><span data-tip="Makes one picture again the same way." className="text-cream">Redo</span> remakes one the same way. <span data-tip="Makes again every picture you marked and every one that failed, together." className="text-cream">Redo N marked or failed</span> remakes the marked and the failed together.</li>
            <li>♥ and ✕ mark what you liked or did not. <span data-tip="Turns a picture into a short moving picture." className="text-cream">GIF</span> turns a picture into a short moving one. Click any picture to see it large.</li>
            <li><span data-tip="Opens your list as a spreadsheet you can change." className="text-cream">Edit as a table</span> opens the spreadsheet: every row, every column, CSV in and out.</li>
            <li>Thumbnails are kept between restarts. For pictures made before that, <span data-tip="Looks in your linked folder for pictures made before and brings them back." className="text-cream">Find them in my folder</span> looks in your linked folder and brings them back.</li>
            <li data-tip="A button that makes everything that is waiting.">When pictures are waiting, a <span data-tip="The button that makes all the waiting pictures." className="text-cream">Make the N waiting</span> button sits in the header on every page except Made.</li>
          </ul>
        </li>

        <li className="reveal">
          <h3 data-tip="Wizards, Gallery and Templates: the guided makers and the places to keep things." className="font-display text-lg text-cream">03 · Wizards, Gallery and Templates</h3>
          <p data-tip="The Wizards page has four guided makers." className="mt-2 text-[13.5px] text-parch">Wizards are four makers:</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-parch marker:text-ember">
            <li><span data-tip="Guides you in three steps: what to make, how it looks, then go." className="text-cream">Make pictures</span> — three steps: what to make, how it looks, go.</li>
            <li><span data-tip="Makes a character that talks, blinks and waves, for Video Forge." className="text-cream">Make a puppet</span> — a character that talks, blinks and waves (section 04).</li>
            <li><span data-tip="Makes sets of small pictures that move, like a walk or a talking mouth." className="text-cream">Animate a character</span> — sprite sheets, turnarounds, expressions, mouth shapes, walk cycles.</li>
            <li><span data-tip="Makes a long list of picture descriptions at once." className="text-cream">Prompt factory</span> — a big list of prompts, copied for Google Sheets or saved as Excel or CSV.</li>
          </ul>
          <p className="mt-3 text-[13.5px] text-parch">
            <span data-tip="The page that keeps everything you made, the looks, and your saved recipes." className="text-cream">Gallery</span> holds <em data-tip="All your pictures in one place.">Everything made</em>, <em data-tip="The looks a picture can have.">Styles</em> (36 looks plus your own) and{" "}
            <em data-tip="Saved recipes you can use again.">Templates</em>: picture setups saved at the end of the picture wizard, and puppet templates saved with{" "}
            <em data-tip="Button to save a puppet as a recipe you can use again.">Save as template</em>, ready to reuse.
          </p>
        </li>

        <li className="reveal">
          <h3 data-tip="How to make a puppet." className="font-display text-lg text-cream">04 · Making a puppet</h3>
          <p className="mt-2 text-[13.5px] text-parch">
            <span data-tip="Open the Wizards page and choose Make a puppet." className="text-cream">Wizards → Make a puppet</span> makes a character for Video Forge that talks, blinks, raises its
            brows, nods and — from the waist up — waves, points and shrugs.
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-parch marker:font-mono marker:text-ember">
            <li>Describe it in a sentence or two, or add up to three inspiration photos. Pick a look and a framing: head and shoulders, waist up (the default) or full body.</li>
            <li>Choose its mouth: with lips or no lips (guessed from your description). Optionally add a side-facing view for two characters talking, and a sitting view for full body.</li>
            <li>Choose two engines: one draws the faces, one makes the parts (the parts need an engine that works from a picture). Your own computer is free; Google costs money and shows the price first.</li>
            <li>Four faces are drawn and a picture checker marks each. Pick one, or tick <em>Pick the face for me and carry on</em>.</li>
            <li>The parts are made by editing that same face, each with at most three tries. Then try it live, and press <span data-tip="Sends the finished puppet to Video Forge." className="text-cream">Send to Video Forge</span>, <span data-tip="Saves the puppet as a zip file you can keep." className="text-cream">Save zip</span> or <span data-tip="Saves the puppet as a recipe you can use again." className="text-cream">Save as template</span>.</li>
          </ol>
          <p className="mt-3 text-[13.5px] text-parch">
            The background colour (magenta, else green, else blue) is chosen to be one the character does not wear, and is cut away
            afterwards. <span data-tip="Moves the puppet to a safe folder. Nothing is erased." className="text-cream">Delete this puppet</span> asks twice and moves it to{" "}
            <span data-tip="The safe folder where deleted puppets wait, so nothing is erased." className="font-mono text-cream">%APPDATA%\Forge\puppets-deleted</span>, so nothing is erased. Video Forge can also
            order a puppet and Image Forge opens the maker, filled in. The method in full:{" "}
            <span data-tip="A file in the project that explains the puppet method step by step." className="font-mono text-parch">docs/puppet-recipe.md</span>; in plain words:{" "}
            <span data-tip="A file in the project that explains puppets in the simplest words." className="font-mono text-parch">docs/puppets-eli5.md</span>.
          </p>
        </li>

        <li className="reveal">
          <h3 data-tip="Little creatures that chase the mouse, the app language, and where keys are kept." className="font-display text-lg text-cream">05 · Cursor chasers, language and keys</h3>
          <p className="mt-2 text-[13.5px] text-parch">
            <em data-tip="Makes a little creature that runs after the mouse on a website.">Animate a character → Cursor chaser</em> makes a little creature that runs after the mouse on a website, sits when it
            catches up and naps when the mouse rests. <em data-tip="Lets the creature chase your mouse in the app for a moment.">Try it here</em> lets it chase your mouse in the app for a moment;{" "}
            <em data-tip="Saves a folder with everything a website needs to show the creature.">Download for a website</em> saves a folder with everything a site needs. <span data-tip="Where you choose the language of the app." className="text-cream">Settings → Language</span>{" "}
            picks the app&apos;s language: English now; Greek, French, German, Spanish and Portuguese are coming, in simple words.
          </p>
          <p className="mt-3 text-[13.5px] text-parch">
            On the desktop app, your settings and keys are kept in a file the app owns, so a changed port or an update cannot empty
            them. When Video Forge is installed too, a key typed into either app works in both (Google, OpenRouter, NVIDIA, Mistral,
            Cloudflare, Pollinations, OpenAI, Groq, ElevenLabs, Fish). A shared key only fills an empty box.
          </p>
        </li>

        <li className="reveal">
          <h3 data-tip="How to bring your own spreadsheet of pictures." className="font-display text-lg text-cream">06 · Feed it your own CSV</h3>
          <p data-tip="Where to import a spreadsheet file." className="mt-2 text-[13.5px] text-parch">
            In Made, <span data-tip="Opens your list as a spreadsheet you can change." className="font-mono text-cream">Edit as a table</span> → <span data-tip="Brings a spreadsheet file in as rows in your list." className="font-mono text-cream">Import CSV</span>, or
            use <span data-tip="A page that writes a big list of picture descriptions for you." className="font-mono text-cream">Wizards → Prompt factory</span>. Only{" "}
            <span data-tip="The one column you must have: the file name of each picture." className="font-mono text-cream">filename</span> is mandatory; everything else gets defaults. Tick{" "}
            <span data-tip="A tick box that starts making the pictures as soon as the file is in." className="text-ember">forge immediately after import</span> and your CSV becomes images on arrival.
          </p>
          <div className="mt-3"><CodeBlock code={MINIMAL_CSV} /></div>
          <p className="mt-4 text-[13.5px] text-parch">Full schema, as exported by the forge:</p>
          <div className="mt-3"><CodeBlock code={FULL_SCHEMA} /></div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <tbody>
                {COLUMNS.map(([col, desc]) => (
                  <tr key={col} className="border-b border-line/60 text-[12.5px] last:border-0">
                    <td data-tip={`The column named ${col}.`} className="w-[210px] px-3.5 py-2 align-top font-mono text-[11px] whitespace-nowrap text-ember">{col}</td>
                    <td data-tip={desc} className="px-3.5 py-2 text-parch">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </li>

        <li className="reveal">
          <h3 data-tip="The painters, taking turns with keys, and waiting when one is tired." className="font-display text-lg text-cream">07 · Painters, key rotation &amp; cooldowns</h3>
          <p data-tip="How each picture gets its painter." className="mt-2 text-[13.5px] text-parch">
            The <span data-tip="The column that names which painter makes each picture." className="font-mono text-cream">model</span> column routes each row to its own painter. When a key
            says "too many requests" it rests and the next key retries the same row instantly. Only when the whole pool rests does the
            row park — on the cooldown <em data-tip="The wait time is your choice, set in Settings.">you</em> set (Settings → Image engines).
          </p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-[var(--color-field)] font-mono text-[9.5px] tracking-[0.18em] text-dust uppercase">
                  <th data-tip="The painter's name as the forge knows it." className="px-3.5 py-2.5 font-medium">model id</th>
                  <th data-tip="The service that runs the painter." className="px-3.5 py-2.5 font-medium">engine</th>
                  <th data-tip="How many free pictures you get from it." className="px-3.5 py-2.5 font-medium">allowance</th>
                  <th data-tip="How many hours the forge waits when this painter is tired." className="px-3.5 py-2.5 font-medium">cooldown</th>
                </tr>
              </thead>
              <tbody>
                {MODELS.map((m) => (
                  <tr key={m.id} className="border-b border-line/60 text-[12px] last:border-0 hover:bg-raise/40">
                    <td data-tip={`The painter's name: ${m.id}.`} className="px-3.5 py-2 font-mono text-[11.5px] text-cream">{m.id}</td>
                    <td data-tip={`The service that runs it: ${m.engine}.`} className="px-3.5 py-2 font-mono text-[11px] text-parch">{m.engine}</td>
                    <td data-tip={`Free allowance: ${m.free}.`} className="px-3.5 py-2 text-moss">{m.free}</td>
                    <td data-tip="The wait time after this painter says it is tired. You can change it in Settings." className="px-3.5 py-2 font-mono text-[11px] text-parch">{settings.cooldowns[m.id] ?? m.defaultCooldownH}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </li>

        <li className="reveal">
          <h3 data-tip="How to get your finished files out of the app." className="font-display text-lg text-cream">08 · Getting the files out</h3>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            <div className="plaque rounded-xl p-4">
              <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-moss uppercase"><IFolder size={12} /> linked folder</p>
              <p className="mt-2 text-[12px] leading-relaxed text-parch">
                Chrome/Edge. Auto-writes into {CATEGORIES.map((c) => CATEGORY_META[c].folder + "/").join(" ")} — your pre-made folders are used as-is. {folderLinked ? `Currently: ${folderName}.` : "Not linked yet."}
              </p>
              {fsSupported() && !folderLinked && (
                <button data-tip="Lets you pick the folder where finished pictures are saved automatically." onClick={onLinkFolder} className="btn-press mt-2.5 font-mono text-[11px] text-ember underline decoration-ember/40 underline-offset-2">link one now →</button>
              )}
            </div>
            <div className="plaque rounded-xl p-4">
              <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-lagoon uppercase"><IDownload size={12} /> zip</p>
              <p className="mt-2 text-[12px] leading-relaxed text-parch">Works everywhere. Full folder structure + CSV. Point it at a Google Drive sync folder for free cloud backup.</p>
              <div className="mt-3"><Btn data-tip="Downloads all finished pictures and the spreadsheet as one ZIP file." onClick={onZip}><IDownload size={12} /> download zip</Btn></div>
            </div>
            <div className="plaque rounded-xl p-4">
              <p data-tip="Save pictures one at a time, from the Made page." className="font-mono text-[10px] tracking-[0.2em] text-ember uppercase">row by row</p>
              <p className="mt-2 text-[12px] leading-relaxed text-parch">Every picture in Made can be saved on its own, and the header&apos;s <span data-tip="The Download menu in the header." className="text-cream">Download</span> menu also has your list as a spreadsheet (CSV) or a spreadsheet.</p>
            </div>
          </div>
        </li>

        <li className="reveal">
          <h3 data-tip="How to send your pictures to a WordPress website." className="font-display text-lg text-cream">09 · The WordPress hand-off</h3>
          <p data-tip="There are two ways to send pictures to WordPress." className="mt-2 text-[13.5px] text-parch">
            Two ways: <span data-tip="Sends your pictures straight to your WordPress website." className="text-cream">Download → Upload to WordPress</span> uploads for real with an
            application password (attachment ids come straight back into the list), or this script — generated live
            from your current list — does it with WP-CLI so Imagify optimizes everything:
          </p>
          <div className="mt-3"><CodeBlock code={script} /></div>
          <div className="mt-2 flex justify-end"><CopyBtn data-tip="Copies this script so you can paste it into your WordPress server." text={script} label="copy script" /></div>
        </li>

        <li className="reveal">
          <h3 data-tip="Fixes for the most common problems." className="font-display text-lg text-cream">10 · Troubleshooting</h3>
          <div className="mt-3 space-y-2.5">
            {[
              ["“Link folder” does nothing", "Folder access needs Chrome or Edge, a secure context (https/localhost) and a normal browser tab — sandboxed previews block it. The exact reason shows in Settings → Folders, and the ZIP always works."],
              ["A row says failed", "Open it in Made and read the red note, then press Redo. A busy engine rests and retries by itself; Redo N marked or failed redoes every failed one at once."],
              ["Every key is resting", "You used today's free allowance on that engine. Add another key, or pick a different engine from Start's drop-down."],
              ["Pollinations is slow", "Normal — free plates take 5–40s. Use turbo, or start the queue and make tea."],
              ["The chat says its writing engine is busy", "With more than one text account set up, the next one with a key answers instead. If none has a key, add one in Settings → Text engines."],
              ["My keys or settings look empty", "On the desktop app they are kept in a file the app owns, so a changed port or an update should not empty them. If they are gone anyway, press Restore in Settings with your backup file."],
              ["My endpoint gives CORS errors", "Your server must allow the forge's origin — or run the same recipe as a local script; the CSV contract is identical."],
            ].map(([q, a]) => (
              <details key={q} className="group rounded-xl border border-line bg-panel/40 px-4 py-3 open:border-line2">
                <summary className="cursor-pointer list-none font-display text-[13px] tracking-wide text-cream">
                  <span className="mr-2 text-ember transition-transform group-open:inline-block group-open:rotate-90">▸</span>
                  {q}
                </summary>
                <p data-tip={a} className="mt-2 pl-5 text-[12.5px] leading-relaxed text-parch">{a}</p>
              </details>
            ))}
          </div>
        </li>
      </ol>

      <p className="reveal mt-10 border-t border-line pt-5 text-[12px] leading-relaxed text-dust">
        Quotas and model ids drift — verify on each provider's pricing page before building on a free tier. Agents want
        in? See <span data-tip="Another page, for AI helper programs that use Image Forge." className="font-mono text-parch">Docs → Agents &amp; API</span>.
      </p>
    </div>
  );
}
