# DedupCommando website

Source of the DedupCommando website: https://dedcom.dequzzy.io/ (GitHub Pages; the older address
https://dedupcommando.github.io/ redirects there). Built with [Zola](https://www.getzola.org/) 0.19.2.
The program itself lives in [dedupcommando/DedupCommando](https://github.com/dedupcommando/DedupCommando).

## Layout

| Path | What it is |
|---|---|
| `templates/retro-home.html`, `templates/retro-home-ru.html` | The home pages at `/` and `/ru/`: the retro "dedcom 95" desktop. `static/assets/retro.css`, `retro.js` and `app.js` drive it. |
| `content/<lang>/_index.md` | Home pages in Arabic, Vietnamese, Spanish, Chinese, Portuguese, French and Hindi. |
| `content/en/_index.md` | The English documentation hub at `/en/` (`/en/docs/` redirects here). |
| `content/en/<topic>/_index.md` | English guides. |
| `scripts/sync_docs.py` | Generates the manual (`/en/manual/`), the safety and verification pages and the release notes (`/en/changelog/`) from the code repository at the commit pinned in `upstream.lock`, and copies the pictures they show into `static/assets/manual/` (the site never loads them from GitHub). The generated files are never committed: edit the manual in the code repository. |
| `scripts/lastmod.py` | Dates every section for the sitemap. |
| `templates/base.html` | Head tags for every page: canonical, hreflang, Open Graph, structured data. |
| `check.sh` | The gate that runs after every build, locally and in CI. |
| `.github/workflows/pages.yml` | Sync, build, check and deploy on every push to `main`. |
| `ops/hostinger/` | Redirect files for the retired copies on Hostinger. |

## Build locally

Needs Python 3, git, Docker (or a `zola` 0.19.2 binary) and a checkout of the code repository.

```sh
pwsh scripts/build.ps1 -Repo ../DedupCommando          # sync, build, check
pwsh scripts/build.ps1 -Repo ../DedupCommando -Serve   # live preview on http://127.0.0.1:1111/
```

Without PowerShell:

```sh
python3 scripts/sync_docs.py --repo ../DedupCommando
python3 scripts/lastmod.py
zola build && sh check.sh --no-build
```

## After a release

Put the new release's commit and tag into `upstream.lock` (`<commit> <tag>`, one line) and push.
CI republishes the manual and adds the release notes.

A docs-only fix published after a release can be pinned by its commit alone (`<commit>`, no tag), once
that commit is on `main` of the code repository. If the release has entries in `RAW_TAG_ESCAPES`
(`scripts/sync_docs.py`), add the same entries under that commit, or the sync fails.
