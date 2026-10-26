# The puppet recipe

How Image Forge makes a **Forge puppet**: a character for Video Forge that
talks (mouth shapes), blinks, raises its brows, nods and shakes its head, and,
shown from the waist up, waves, points, shrugs and explains with its hands.

It is the third kind of character art Image Forge makes, after the classic
sprite sheet and the classic viseme sheet (both in **Animate → Animated
character**). Code: `src/lib/puppet/` and `src/components/PuppetMaker.tsx`.

The method was worked out by hand for the 70-lesson Skilitsa course in
September 2026 (Video Forge `docs/research/how-the-70-videos-were-made.md`,
and the older failure log `recipes/skilitsa-viseme.md`). Every rule below is
there because its absence caused a real failure.

## The idea in one line

Make ONE face a person approves. Edit that same face once per part ("change
ONLY the mouth…"). Compare each edit with the face; the region that changed,
cut out, is the part.

A part cut from the character's own face cannot disagree with it (colour,
teeth, lips), and it lands back where it came from, so nothing is lined up by
hand.

## The steps

| Step | What happens | Who decides |
|---|---|---|
| 1. Describe | Name, one or two sentences, a style, head-and-shoulders or waist-up, up to 3 inspiration pictures | You |
| 2. Faces | 4 faces drawn; the checker marks each "looks right" or says what is wrong | You pick one — or "pick the face for me" |
| 3. Parts | 16 edits (7 mouths + smile, 3 eyelid states, 5 brows), +4 arm poses waist-up | Automatic, bounded retries |
| 4. Try it | A live preview talks, blinks, nods, shakes, laughs; click anything to see it large | You: send to Video Forge, or save a zip |

## Bounded trial and error

Each part gets **at most 3 tries**. A try is turned down by:

- **mechanical checks** (`pixels.ts` → `cutPart`): nothing changed; the change
  covers more than 30% of the picture (60% for arms), so it was redrawn not
  edited; the change is outside the part's band of the picture; a mouth reaches
  up over the eyes (once the eyes are known);
- **the picture checker** (a vision model shown before | after): the change is
  not visible, the eyes moved or crossed, a smear, a seam, a doubled feature.

After 3 tries the part is **unsure** (the checker said no but the cut was
clean: kept, flagged) or **missing** (no clean cut at all). The puppet works
without a missing part; "Try the unsure/missing again" redoes only those.

## Cutting a part (what was learned)

- **Patches, not a box.** The model re-renders the whole picture a little.
  Change is scored on a grid by *strength* (squared difference), grouped into
  connected patches, and only patches with a quarter of the strongest's weight
  are kept. A knitted cardigan shimmering in every edit no longer turns an
  opened beak into a "redrawn" picture (owl, 12 Oct 2026). Two eyes are two
  strong patches; shimmer is many weak ones.
- **Bands.** Mouth 42–100% of the height, lids 20–70%, brows 12–62% for head
  and shoulders (other bands for waist-up). Noise in an ear cannot drag a mouth
  over the eyes.
- **Lids first.** The closed-eyes part gives the eye line; from then on a mouth
  above it is turned down.

## The background

- Asked for **pure magenta**; every model draws its own idea of it (FLUX.2 hot
  pink, Z-Image pastel pink). The colour actually drawn is read from the
  picture's border.
- **Flood-filled from the edges, strict first.** Only background-coloured
  pixels *joined to the border* go. Pink inside the character stays. The
  first version keyed the colour everywhere: a red fox with a white hat came
  out riddled with holes and green (12 Oct 2026). Tolerance starts at 30 and
  loosens (45, 60) only if the border is still standing.
- Only the few pixels at the edge are un-mixed from the background (no pink
  halo); the inside of the character is never touched.
- Each part is keyed from its **whole** edited picture, then cut, so an arm
  reaching past the face's outline keeps its own edge.

## The rig (what Video Forge reads)

`rig.ts` writes `<slug>.rig.json` + PNGs onto the **Forge shelf**
(`%APPDATA%\Forge\puppets\<slug>\`). Positions are fractions of the picture,
exact by construction. Head-and-shoulders puppets are cropped to a square
measured from the eye line. The **neck** is found just under the chin (the
bottom of the widest-open mouth), so the head nods and shakes while the body
stays put. Arm poses are drawn over the body, under the face.

Video Forge's face engine drives it from the script: mouth shapes from the
words, blinks, brows from punctuation and feeling tags, `[laughs]` bobs the
head, `[nods]` / a spoken yes nods, `[shakes head]` / a spoken no shakes,
`[waves]` `[points]` `[shrugs]` `[explains]` raise the arms (a line opening
with a greeting waves by itself).

## Engines

Two engines: one draws the faces, one makes the parts. Parts need an engine
that works **from** a picture.

| Engine | Faces | Parts | Notes (12 Oct 2026) |
|---|---|---|---|
| Z-Image Turbo (LocalAI, this computer) | ✓ best | — | ~50 s a face incl. loading. Draws from words only: inspiration pictures are described in words by the checker. |
| FLUX.2 klein 4B (LocalAI) | ✓ | ✓ | 5 min 40 s an edit at 1024 on an 8 GB card, so local engines work at **768** with a **20 s rest** between pictures to let the card cool. The two local models do not fit the card together; the face model is asked to unload before parts start. |
| OVHcloud SDXL | ✓ | — | Free, no key; older. |
| Cloudflare FLUX.2 klein / dev | ✓ | ✓ | Free allowance is 10,000 neurons/day; one dev picture at 1024 used ~6,100. A puppet takes days. |
| Google Nano Banana 2 (Lite) | ✓ | ✓ | Paid, ~$0.034–0.067 a picture; cost shown before running. |
| Google Nano Banana 2.1 (`gemini-nano-banana-2.1`), batch | ✓ best | ✓ best | Half price by batch. See the note below. |

> **Parts need a stronger model than Z-Image / FLUX.2 klein.** Tested 23 Oct
> 2026 on Blip and Grump with the same recipe prompts: the local engines left
> more than half the parts needing a redo, and the checkers caught only about
> half of those. Nano Banana 2.1 by batch kept the character the same across
> all 46 edits; about 4 needed a redo. The local engines redraw the whole
> picture on every edit, so mouths drift, eyes move and cut-outs land in the
> wrong place. Use them for trying ideas; make the puppet you keep with a
> stronger model.
>
> **Known recipe bug (open):** `basePrompt` always says "both eyes … parallel",
> which overrides a one-eyed (or many-eyed) description. Blip came out with two
> eyes until the clause was rewritten for him.

**Picture checker:** Image Forge's own vision engine if set up, otherwise
Google's free `gemini-flash-lite-latest` through the Google key (free tier can
look at pictures; it cannot make them).

**LocalAI and web pages:** LocalAI refuses picture requests from a web page
("missing csrf token"). The desktop app sends them through its own
`/local-api/<port>` proxy (`electron/main.js`), which only reaches 127.0.0.1
and only answers the app's own page.

## Ordering from Video Forge

Video Forge → Cast → Look → **Order a new puppet…** writes an order on the
shelf (`%APPDATA%\Forge\orders\`) and opens Image Forge, which notices it
within 20 s and opens the puppet maker filled in. With **make it without me**
on, it starts by itself and picks the face; the finished puppet appears in
Video Forge's "Puppets from Image Forge" row.
