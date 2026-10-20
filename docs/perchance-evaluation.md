# Perchance as a picture source — evaluation (20 Oct 2026)

**Verdict: only by hand.** Automated use breaks both the letter and the meaning of Perchance's terms. Image Forge now has a link that opens Perchance in your browser with the face description copied; you bring the picture back with "start from my own picture".

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
| A person uses a Perchance generator page in a browser and saves the picture | allowed; outputs can be used commercially, no attribution needed (FAQ) | allowed; they see the ads that pay for it | **OK — built** |
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

Nothing in Image Forge calls Perchance, so a change on Perchance's side cannot break Image Forge; at worst the link opens a page that has changed.
