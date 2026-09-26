# Standards

What "done" means in this project. Short on purpose — a rule nobody reads is
not a rule.

**This repo follows the owner's shared repo standards** (`repo standards/STANDARDS.md`
in the maintainer's workspace: required files, release gate, secret scanning,
installable apps, docs site). The twelve rules below are this project's own,
on top of those. Where this repo does something differently, it is on
purpose, and here is why:

| Shared standard | This repo | Why |
|---|---|---|
| Licence: MIT | **Apache-2.0** | The owner chose it for its NOTICE clause, the strongest standard attribution requirement for anyone who redistributes it |
| Build: Tauri suggested | **Electron** | The stack pointed that way from the start; Tauri exists in `src-tauri/` but is experimental (HANDOFF §2) |
| Docs site in the repo root | **`site/`** | The app already owns the root; the deploy workflow points `DOCS_DIR` at `site` |
| Default branch `main` | **`master`** | Historical; workflows accept both |
| Browser mode on a registered port | Desktop on **47821–47825** (registered); dev server on 3000 | Settings → Advanced switches between the window and your browser on the same port (HANDOFF §13) |

---

Every one of these was written after something went wrong. The reason is given
each time, because a rule without its reason gets dropped the first time it is
inconvenient.

---

## 1. Tell the truth about what happened

If a picture was made but not saved, say that. Do not call it a failure — on a
paid engine that invites paying for it twice.

If a provider says `429`, find out what it *means* before repeating it. Google
returns `429` for "you have no money", which tells the user to wait for a reset
that is never coming. It returns `403` both for a bad key and for a
project-level ban, which are entirely different problems with different fixes.

> **Why:** we shipped "the key is valid, but its project has no credit" and
> advised putting the credit on the same project. Both were wrong. The account
> had €262 in it; linking to Cloud billing was what disabled the free tier.
> That message sent someone to buy what they already owned.

## 2. Plain English in anything a user reads

"The key is valid, but the account behind it has no credit" beats
`429 RESOURCE_EXHAUSTED`.

No jargon, no error codes as the headline, no blaming the user. A ten-year-old
should be able to run a batch. Assume the reader is intelligent and has never
heard the word "endpoint".

## 3. Never claim more than is true

No invented benchmarks. No "blazing fast". No comparison to a competitor we
have not measured.

If the app is unsigned, say so and explain the warning. If Mac has no packaged
build, say so. Limitations go in the README under a heading that admits it.

> **Why:** the whole pitch is being a small developer who cares enough to be
> straight with people. One inflated claim costs more than every honest one
> earns.

## 4. Free first

Every paid engine needs a keyless fallback. Free engines are never gated,
never rate-limited by us, and always offered as the alternative when a paid
run is refused.

Free-tier keys are tried before paid keys, always.

## 5. Never spend money without asking

A paid run stops and shows: how many pictures, which model, the price each,
the total, which credit pays for it, and how long that credit has left. With a
button to switch to a free engine instead.

This is not configurable away by accident.

## 6. Verify against the real thing, not the documentation

Before shipping a provider integration, run it against a live account and say
in a comment when you checked.

Documented behaviour that turned out to be false, all found this way:

- Cloudflare's model page lists `seed`. Sending it rejects the whole request.
- Google's own examples show `image/png`. The API accepts only `image/jpeg`.
- `pixtral-large-latest` is the obvious vision model. It is not on the account.
- `gemini-1.5-flash` is suggested constantly. It 404s for new users.

Dates in comments are not decoration. They tell the next person how stale the
finding is.

## 7. Test what is silent and expensive

Anything touching **the CSV, filenames, money, or the engines** needs a test.
Those four fail quietly and cost real money or real data. A broken button is
loud and someone will report it; a mis-parsed CSV corrupts a manifest over
weeks.

Pin the *wording* of user-facing failure messages. The wording is the feature.

## 8. Comments explain why, not what

A comment restating the code is noise. A comment saying that Cloudflare
rejects `seed`, and the date that was confirmed on a live account, saves the
next person two hours.

Every non-obvious line should answer "why is it like this?" — especially where
the obvious approach was tried and failed.

## 9. Keep `engines.mjs` DOM-free

`src/lib/engines.mjs` is plain ESM: no React, no `window`, no `document`. That
is what lets the browser app and the MCP server run *literally the same code*
instead of two implementations that drift.

Browser-only concerns go in `providers.ts`, which wraps it.

> **Why:** every time this was bent, the app and the agent behaved differently
> and a user found it before a test did.

## 10. Do not guess at model names

Providers rename and retire models faster than this ships. A model id
hard-coded in our source becomes the user's 404.

Ship a **Load models** button that asks the endpoint what it has. Where a
default is unavoidable, verify it against a live account first and date the
comment.

## 11. No `console.log`, no `alert`, no `confirm`

Feedback goes through toasts and the forge console, which the user can read,
scroll and copy. Browser dialogs block the page and cannot be styled or
translated.

## 12. Degrade, do not fail

If the vision model is unreachable, fall back to the free quiet-spot finder
and say why. If a folder write fails, keep the picture and report the write.
If one key is spent, use the next.

A feature that stops working should get smaller, not disappear.

---

## Before you open a pull request

```bash
npm test          # all of them
npm run typecheck # no errors
npm run build     # it builds
```

All three run in CI on every push and pull request. A red CI is not "probably
fine".

If you changed a user-facing message, update the test that pins it. If you
learned something about a provider, put it in a comment with the date, and add
it to [Troubleshooting](docs/troubleshooting.md) if a user could hit it.
