# Perchance as a picture source — evaluation (20 Oct 2026)

**Verdict: the AI plugins (images, AI text, chat) can only be used on perchance.org by a person. Plain random-text generators can be used from our own tools — Perchance's owner documents how.** Nothing is built in Image Forge (Ak, 20 Oct 2026: do not implement).

## The owner's own word: perchance.org/diy-perchance-api (read 20 Oct 2026)

- Perchance has no official API; the owner offers a do-it-yourself one: download a generator with `https://perchance.org/api/downloadGenerator?generatorName=<name>`, load it in Node.js with JSDOM, and read its lists (`window.root.output`). A Glitch server template and Discord / Twitter / Tumblr bot tutorials exist.
- The two AI plugins — **text-to-image-plugin** and **ai-text-plugin** — are funded by ads, so "these plugins won't work if you try to run them from your own server… those two plugins can only be used on the Perchance site itself."

| Kind | From our tools (script, n8n, WordPress server) | By a person on perchance.org |
|---|---|---|
| Images (text-to-image) | **no** — owner says site only | yes, commercial use allowed |
| AI text, and chat (built on AI text) | **no** — same plugin | yes |
| Video | no video plugin found | — |
| Random-text generators (lists: names, story prompts, character ideas, quotes, dice…) and plugins that run in the browser without AI | **yes** — the DIY API above, endorsed by the owner | yes |
| Embedding a Perchance page on a WordPress site for visitors | — | yes (visitors see the ads) |

## What the plugins do (read 20 Oct 2026)

Source: perchance.org/text-to-image-plugin (rendered page), perchance.org/terms-of-service (updated 18 Jul 2026).

| | Text-to-image plugin |
|---|---|
| Does | words → picture, on Perchance's servers |
| Options | prompt, negativePrompt, seed, resolution (512×512, 768×768, 512×768, 768×512), guidanceScale (1–30, default 7), removeBackground |
| Cannot | edit a picture or work from a reference picture — so it cannot make puppet parts (mouths, blinks, poses), which are all edits of one face |
| Limits | a few requests at a time per user; the model changes without notice, so the same seed gives a different picture after upgrades |
| Paid for by | ads shown to non-logged-in visitors of the generator page ("it costs me money to run… funded with ads") |
| Outside perchance.org | not offered: it works inside a Perchance generator page; forking it is discouraged because it is tied to the server |

The AI text plugin is built the same way (inside a generator page, server-side, ad-funded); I did not read its page in full.

## The terms, on each route

| Route | Letter of the terms | Meaning | Verdict |
|---|---|---|---|
| A person uses a Perchance generator page in a browser and saves the picture | allowed; outputs can be used commercially, no attribution needed (FAQ) | allowed; they see the ads that pay for it | OK (not built — Ak's call) |
| Embed a Perchance generator page (iframe) on a WordPress page, people use it | allowed (a person uses it; ads show) | allowed | OK for WordPress; no use inside Image Forge |
| Headless browser on the mini PC driving a generator page | breaks §3(5): "you will not access the Services through automated or non-human means, whether through a bot, script or otherwise" | breaks it: no one sees the ads, so it uses GPU time nobody pays for; §5 also bars "undue burden" | **No** |
| Community wrappers (OpenAI-style API, PyPI perchance-python, FastAPI wrappers) | same as above — they are scripts | same | **No** — and they break whenever Perchance changes its page |
| n8n calling Perchance | a script | same | **No** |

## Against what Image Forge already has (all free)

| Source | Edits a picture (needed for puppets) | Dependable | Notes |
|---|---|---|---|
| FLUX.2 klein + Z-Image on LocalAI (this laptop) | yes | yes | what the puppets use now |
| Cloudflare FLUX.2 (in Image Forge) | yes | free daily allowance | |
| Perchance (by hand) | no | changes without notice | fine for a first face or inspiration picture |
| Text: NVIDIA, OpenRouter free, Mistral, Groq | — | free tiers with limits | Image Forge already falls back between them |

## What could break

Nothing in Image Forge or Video Forge calls Perchance (the by-hand link was built and then removed, 20 Oct), so nothing can break from their side.
