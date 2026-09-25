# Deploy: Image Forge

## Where it runs

Nowhere central. Image Forge is a desktop app people install on their own
Windows machine, plus a browser version they can run from source. There is no
server, no account and no hosting.

| What | Where it ships |
|---|---|
| Windows installer + portable exe | GitHub Releases, built by `.github/workflows/release.yml` on every `v*` tag |
| Documentation site | https://docs.stravelakis.com/image-forge/, built by `.github/workflows/docs.yml` on every `v*` tag |
| Agent server (MCP) | runs from source: `node scripts/mcp-server.js` |

## Environment variables

The app itself needs none — keys are entered in Settings and stay on the
user's machine. The agent server can read keys from the environment; the full
list is in `.env.example`.

| Name | Required | What |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | no | free Cloudflare engine for the agent server |
| `POLLINATIONS_TOKEN` | no | free Pollinations engine |
| `GEMINI_API_KEY(S)` / `OPENAI_API_KEY(S)` | no | paid engines — no spending guard over MCP |
| `FORGE_PROVIDER` | no | force an engine; with nothing set the server uses OVHcloud, which needs no key |

## Release

Follow the release gate in STANDARDS.md §2, then:

1. Branch `release/x.y.z`. Bump the version in `package.json`,
   `src/lib/version.ts`, `scripts/mcp-server.js`, `src-tauri/tauri.conf.json`
   and `src-tauri/Cargo.toml` (`tests/version.test.ts` fails if they differ).
2. Write the `CHANGELOG.md` entry.
3. `npm test`, `npm run typecheck`, `npm run build`, then
   `node scripts/build-exe.js` and **install the result on a real machine**
   (HANDOFF §10 lists what to check).
4. Open a PR, let CI pass, `gh pr merge`.
5. Tag `vX.Y.Z` on master and push the tag. The release and docs workflows run
   on the tag.

## Rollback

Every release stays on the Releases page.

1. Users: download the previous `Image.Forge.Setup.x.y.z.exe` and run it — it
   installs over the newer version and keeps settings, keys and manifest.
2. Maintainer: mark the bad release as a pre-release (or delete its assets) so
   "latest" points at the good one; fix forward on a new patch version. Never
   move or reuse a tag.
3. Docs: re-run the docs workflow on the previous tag.

## After deploying, check

- [ ] The release page has both exes and the notes name what changed
- [ ] The installer from the release page installs and starts (HANDOFF §10)
- [ ] https://docs.stravelakis.com/image-forge/ shows the new version
- [ ] The release and docs workflow logs show no errors
