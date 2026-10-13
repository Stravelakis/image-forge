---
title: "Making a puppet, in plain words"
nav_order: 4.5
---

# Making a puppet, in plain words

A **puppet** is a cartoon character that a video can make talk. Image Forge
draws it; Video Forge moves it. This page is how to make one, with no jargon.
(The long, technical version is [the puppet recipe](puppet-recipe.md).)

---

## What you get

A character that:

- opens its mouth in the right shape for each word,
- blinks,
- raises its eyebrows when it is surprised,
- nods yes and shakes its head no,
- and, if you chose "waist up", waves, points, shrugs and talks with its hands.

You do not draw any of it. You say what you want, pick the face you like, and
Image Forge makes the rest.

---

## Before you start

- You need **one engine that can draw faces** and **one that can change a
  picture**. The second one is needed for the moving parts.
- **Free and on your own computer:** if LocalAI is running, its picture models
  show up by name. It is free and private, but slow, and it makes your computer
  hot. Do not run a long video job at the same time.
- **Free online:** Cloudflare gives a very small number of pictures a day. A
  puppet takes a few days that way.
- **Paid:** Google's Nano Banana 2 is fast and good. Image Forge shows the price
  before it starts. A puppet is about 20 to 30 pictures when things go well, up to about 65 when many parts need another try (more for full body).

If you are not sure, start with the paid Google engine for one puppet, or the
free one on your own computer if you can leave it alone for a while.

---

## Step by step

Open **Wizards**, then **Make a puppet**.

### 1. Say what you want

- Write a sentence or two: *"a friendly grey owl librarian with round glasses
  and a green knitted cardigan"*. Give it a name.
- Or add up to three photos or drawings for inspiration. They only inspire the
  look; they are not copied.
- Pick a look: 3D animated, flat cartoon, claymation, paper cut-out, anime or
  simple doodle. **Flat and simple looks come out cleanest.**
- Pick how much of the character to show:
  - **Head and shoulders** — talks, blinks, raises its brows.
  - **Waist up** (the default) — all that, plus arms: wave, point, shrug and
    explaining hands.
  - **Full body** — the whole character standing, and if you like, sitting too.
- Two optional extras: a **side-facing view** (so two characters can talk to each
  other) and, for full body, a **sitting view**.

Two small choices are made for you, and shown so you can see them:

- **Its mouth: with lips or no lips.** Animals, doodles and anime faces get no
  lips; people get lips. The whole puppet uses one kind, so it never looks like
  two different characters.
- **The plain background colour.** It is magenta unless your character wears pink
  or purple, then green, or blue. The background is cut away afterwards.

### 2. Pick a face

Four faces are drawn. A **picture checker** looks at each one and says "looks
right", or what is wrong with it. Click the one you like. Tired of choosing? Tick
**Pick the face for me and carry on** and it takes the first face the checker likes.

### 3. The parts are made

Now Image Forge changes **only one thing at a time** on your chosen face: the mouth
in each shape (including half-open ones), the eyes closed, the eyebrows up and
down, and, from the waist up, the arm poses. Because each part is cut out of the
character's own face, it always matches.

Each part gets **at most three tries**. A part that still is not right is marked
**unsure** (it is kept, but flagged) or **missing** (no clean cut). The puppet
works without a missing part, and you can press **Try the unsure/missing again**
to redo only those.

This is the long part. With a free engine it can take a while; the page shows
progress and you can click any picture to see it large.

### 4. Try it

A live preview talks, blinks, nods, shakes its head and laughs. Click anything
to see it large. Then:

- **Send to Video Forge** — puts the puppet where Video Forge can find it. It
  shows up in Video Forge's "Puppets from Image Forge" row.
- **Save zip** — a file you can keep or share.
- **Save as template** — keeps your choices so you can make a cousin of this
  puppet later (find it under **Gallery → Templates**).
- **Delete this puppet** — asks twice, and then moves it to
  `%APPDATA%\Forge\puppets-deleted`. Nothing is erased.

---

## Video Forge can ask for one

In Video Forge, **Cast → Look → Order a new puppet…** writes an order. Image
Forge notices within about 20 seconds and opens the puppet maker already filled
in. Tick **make it without me** and it starts by itself and picks the face.

---

## If something looks wrong

- **Holes or a pink edge** — mention the colours in the description (*"a purple
  dragon"*) so a different background is chosen.
- **A part is unsure or missing** — press **Try the unsure/missing again**.
- **Slow, or the computer is hot** — local engines work in smaller pictures and
  rest for 20 seconds between them on purpose.
- More in [Troubleshooting](troubleshooting.md).
