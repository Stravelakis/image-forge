/**
 * "How to use it" for everything Make a sheet makes (Ak, 14 Oct 2026: give
 * instructions to implement it — the steps, the code itself, a WordPress
 * plugin that can do it, or the prompt to give another AI that writes the
 * code). One entry per kind of sheet.
 *
 * Every link here was checked; nothing is promised that was not.
 */
import type { SheetDef } from "./sheets";

export interface RecipeHelp {
  /** plain-words steps */
  steps: string[];
  /** ready code to paste, when there is a short one */
  code?: { label: string; text: string };
  links: { label: string; url: string }[];
  /** paste into ChatGPT, Claude or any coding AI to get the code for YOUR site or game */
  aiPrompt: string;
}

const WPCODE = { label: "WPCode – Insert Headers and Footers (free WordPress plugin)", url: "https://wordpress.org/plugins/insert-headers-and-footers/" };

export function helpFor(def: SheetDef, o: { name: string; cell: number; columns: number; frames: number }): RecipeHelp {
  const grid = `${o.frames} frames, ${o.cell}×${o.cell} pixels each, in a grid ${o.columns} wide (left to right, then the next row), in this order: ${def.frames.map((f) => f.label).join(", ")}`;
  switch (def.kind) {
    case "cursor-chaser":
      return {
        steps: [
          "Press Download for a website — you get a folder with chaser.png, chaser.js, demo.html and a read-me.",
          "Any website: put chaser.png and chaser.js on your site and add the one line below just before </body>.",
          "WordPress: install WPCode (link below), upload chaser.png and chaser.js to Media, then WPCode → Header & Footer → paste the line in Footer, with the two file addresses from Media.",
          "Shopify: Online Store → Themes → Edit code → upload both files to Assets, then add the line before </body> in theme.liquid.",
          "Wix, Squarespace and other site builders: use their Custom Code (or Code Injection) setting for the line — some plans only.",
        ],
        code: { label: "The one line", text: `<script src="chaser.js" data-strip="chaser.png" data-size="64" defer></script>` },
        links: [WPCODE],
        aiPrompt:
          `I have a sprite strip for a "cursor chaser" — a small character that runs after the mouse on a web page. The image chaser.png is one row of 6 frames, each square, ${o.cell}px in the file: frames 1–4 are a run cycle facing right, frame 5 is sitting, frame 6 is asleep. ` +
          `Write the code to add it to my website [say which: plain HTML / WordPress / Shopify / React / Next.js / Wix]. It should: follow the mouse smoothly, flip to face the way it runs (only when clearly moving that way, never flickering back and forth when the mouse is still), sit when it catches up, sleep after 8 seconds of no movement, ignore clicks (pointer-events: none), stay above the page, and not appear for users who prefer reduced motion. Show me exactly where to paste each piece.`,
      };
    case "sprite-walk":
    case "sprite-actions":
      return {
        steps: [
          "Save as one sheet — that file is what games and animation tools read.",
          `Godot: add an AnimatedSprite2D, open its SpriteFrames, press "Add frames from a sprite sheet", pick the file and set ${o.columns} across.`,
          'Unity: import the file, set Sprite Mode to Multiple, open the Sprite Editor and Slice → "Grid By Cell Count", then drag the frames into the scene to make an animation.',
          "A web page: the CSS below plays it as a loop.",
        ],
        code: {
          label: "CSS for a web page (first row of the sheet)",
          text: `.walker { width: ${o.cell / 2}px; height: ${o.cell / 2}px; background: url(sheet.png) 0 0 / ${(o.cell / 2) * o.columns}px auto; animation: walk 0.8s steps(${o.columns}) infinite; }\n@keyframes walk { to { background-position: -${(o.cell / 2) * o.columns}px 0; } }`,
        },
        links: [
          { label: "Godot: 2D sprite animation", url: "https://docs.godotengine.org/en/stable/tutorials/2d/2d_sprite_animation.html" },
          { label: "Unity: Sprite Editor", url: "https://docs.unity3d.com/Manual/sprite/sprite-editor/sprite-editor-window-reference-landing.html" },
        ],
        aiPrompt: `I have a sprite sheet of "${o.name}": ${grid}. Show me, step by step, how to use it as an animated character in [say which: Godot / Unity / a web page / Phaser / Scratch], including how to cut it into frames, the frame rate to use, and the code or settings to make it walk.`,
      };
    case "visemes":
    case "avatar-eyes":
    case "avatar-brows":
    case "expressions":
      return {
        steps: [
          "Save each frame — talking-head tools want one picture per mouth, eye or brow shape.",
          "Video Forge: Make a puppet in Image Forge does all of this for you and sends it ready to talk; these frames are for other tools.",
          "Other animation tools (Adobe Character Animator, Cartoon Animator, Live2D) take one layer per shape — name each file after its shape, as Image Forge already does.",
        ],
        links: [],
        aiPrompt: `I have ${grid} for the character "${o.name}" — ${def.label.toLowerCase()} for a talking avatar. Explain how to rig these in [say which: Adobe Character Animator / Cartoon Animator / Live2D / a web page with JavaScript] so the character lip-syncs (or blinks / changes expression) to a voice recording, including how to name the files and set the timing.`,
      };
    case "turnaround":
      return {
        steps: [
          "Save as one sheet, or each angle on its own.",
          "Hand it to a 3D artist or a 3D-from-image tool as the model sheet, or use the angles as reference in Blender (a reference image per view).",
        ],
        links: [{ label: "Blender: reference images", url: "https://docs.blender.org/manual/en/latest/modeling/empties.html" }],
        aiPrompt: `I have a character turnaround of "${o.name}": ${grid}. Explain how to use it to build the character in [say which: Blender / a 3D-from-image tool / a 2D rig], step by step.`,
      };
    default:
      return { steps: ["Save as one sheet, or each frame on its own."], links: [], aiPrompt: `I have ${grid}. How do I use these frames in [your tool]?` };
  }
}
