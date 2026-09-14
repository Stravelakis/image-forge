# Code signing policy

## Status — read this first

**Image Forge releases are not code-signed yet.** Windows shows "Windows
protected your PC" on first run. Click **More info → Run anyway**.

The project is preparing to apply to the
[SignPath Foundation](https://signpath.org/) open-source signing programme,
which signs qualifying open-source projects for free. This page is written to
meet that programme's conditions. **Until an application is approved and a
release is actually signed through it, no release is signed, and nothing on
this page should be read as saying otherwise.**

When signing is live, this section will change to say so, and each signed
release will be listed below.

---

## What signing will and will not change

- **Publisher name.** The certificate belongs to SignPath Foundation, so
  Windows will show **"SignPath Foundation"** as the publisher — not
  "Stravelakis".
- **The blue warning will not vanish on day one.** Since 2024 no certificate
  type skips Windows SmartScreen outright. A signed app builds reputation over
  successive releases, and the warning fades as it does.
- **What it proves.** That the file you downloaded is the file built from this
  repository by its public release workflow, unmodified.

---

## What gets signed

Only files built by this repository's own release workflow
(`.github/workflows/release.yml`) on GitHub Actions, from a tagged commit:

- `Image.Forge.Setup.x.y.z.exe` — the installer
- `image-forge-portable.exe` — the portable version

Nothing built on a personal machine is ever submitted for signing, and no
third-party binary is signed as if it were ours. Every signing request is
approved by hand, one release at a time.

The product name and version in each file's metadata are set by the build
(`scripts/build-exe.js`) and checked by `tests/version.test.ts`.

---

## Team roles

| Role | Who | What it means |
|---|---|---|
| Committer | [Stravelakis](https://github.com/Stravelakis) | May push to the repository |
| Reviewer | [Stravelakis](https://github.com/Stravelakis) | Reviews every change from anyone who is not a committer |
| Approver | [Stravelakis](https://github.com/Stravelakis) | Approves each signing request |

Image Forge currently has one maintainer. Changes from outside contributors
arrive as pull requests and are reviewed before merging.

**Multi-factor authentication is required** for everyone above, on both GitHub
and SignPath.

---

## Privacy

This program will not transfer any information to other networked systems
unless specifically requested by the user or the person installing or
operating it.

Specifically, and checked against the source code:

- Picture, text and vision requests go only to the engine **you** chose, with
  **your** key.
- The only other outbound request is the update check, which runs only when
  you press its button in **Settings → Advanced**.
- There is no telemetry, no analytics and no crash reporting.
- API keys stay on your machine, in `%APPDATA%\image-forge` on the desktop app.

---

## Signed releases

None yet.

---

## Applying (for the maintainer)

Conditions, from [SignPath Foundation's terms](https://signpath.org/terms.html):

- [x] OSI-approved licence, no commercial dual licensing — Apache-2.0
- [x] Actively maintained, and already released in the form to be signed
- [x] Functionality described on the download page
- [x] This code signing policy, with team roles and a privacy statement
- [ ] Multi-factor authentication on GitHub and SignPath
- [ ] Apply at [signpath.org/apply](https://signpath.org/apply)
- [ ] After approval: add the signing step to the release workflow
      (see HANDOFF.md, "Releasing"), then sign the next release

Once live, the attribution SignPath requires goes at the top of this page:
*"Free code signing provided by SignPath.io, certificate by SignPath
Foundation."* It is deliberately not there yet, because it would not be true.
