#!/usr/bin/env sh
# Gate for the DedupCommando site. Run from the repository root after scripts/sync_docs.py and
# scripts/lastmod.py (CI does this; locally use scripts/build.ps1).
#   sh check.sh             build with Zola, then verify the output
#   sh check.sh --no-build  verify an existing public/ only (skip the build)
# Requires zola (for the build step), POSIX sh and grep; python3 (or python) for the JSON-LD check.
set -u

PUB="public"
BASE=$(sed -n 's/^base_url *= *"\([^"]*\)".*/\1/p' config.toml)
OLD_HOST="dedupcommando.github.io"
fail=0
ok()  { printf '  ok   %s\n' "$1"; }
bad() { printf '  FAIL %s\n' "$1"; fail=1; }

if [ "${1:-}" != "--no-build" ]; then
  echo "== zola build =="
  zola build || { echo "build failed"; exit 2; }
fi
[ -d "$PUB" ] || { echo "no $PUB/ (build first)"; exit 2; }
[ -f data/release.json ] || { echo "no data/release.json (run scripts/sync_docs.py first)"; exit 2; }
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' data/release.json)

echo "== routes =="
for p in . ru en ar vi es zh-hans pt-br fr hi \
         en/zfs-file-deduplication en/proxmox-ve-duplicate-files \
         en/linux-duplicate-file-finder en/hardlink-vs-reflink en/safety-and-recovery \
         en/faq en/compare en/safety-model en/verifying-releases en/changelog "en/changelog/v$VERSION" en/docs \
         en/manual en/manual/intro en/manual/install en/manual/safety en/manual/quickstart \
         en/manual/commando en/manual/classic en/manual/scanning en/manual/actions \
         en/manual/triage-board en/manual/diff-trash en/manual/headless en/manual/maintenance \
         en/manual/troubleshooting en/manual/hotkeys; do
  if [ -f "$PUB/$p/index.html" ]; then ok "/$p/"; else bad "/$p/ missing"; fi
done
for u in sitemap.xml robots.txt 404.html en/changelog/atom.xml assets/retro.css assets/retro.js assets/app.js; do
  if [ -f "$PUB/$u" ]; then ok "$u"; else bad "$u missing"; fi
done

echo "== canonical: exactly one per page, on $BASE =="
bad_canon=0
for f in $(find "$PUB" -name index.html); do
  n=$(grep -c 'rel="canonical"' "$f" 2>/dev/null || echo 0)
  [ "$n" = "1" ] || { bad "canonical x$n: $f"; bad_canon=1; }
done
[ "$bad_canon" = "0" ] && ok "one canonical per page"
foreign=$(grep -rhoE '<link rel="canonical" href="[^"]*"' "$PUB" | grep -v "href=\"$BASE/" || true)
if [ -n "$foreign" ]; then bad "canonical on another host: $foreign"; else ok "every canonical on $BASE"; fi

echo "== home: the retro desktop at / (en, x-default) and /ru/ =="
for p in index.html ru/index.html; do
  if grep -q "hreflang=\"x-default\" href=\"$BASE/\"" "$PUB/$p"; then ok "/$p: x-default -> /"; else bad "/$p: x-default not -> /"; fi
  if grep -q 'id="desktop"' "$PUB/$p"; then ok "/$p: retro desktop"; else bad "/$p: not the retro desktop"; fi
  n=$(grep -c '<h1' "$PUB/$p"); [ "$n" = "1" ] && ok "/$p: one <h1>" || bad "/$p: <h1> x$n"
  n=$(grep -c '<h2' "$PUB/$p"); [ "$n" -ge 6 ] && ok "/$p: $n <h2>" || bad "/$p: only $n <h2>"
done
if grep -q "\"softwareVersion\":\"$VERSION\"" "$PUB/index.html"; then ok "/: softwareVersion $VERSION"; else bad "/: softwareVersion is not $VERSION"; fi
if grep -q 'http-equiv="refresh"' "$PUB/en/docs/index.html"; then ok "/en/docs/ redirects to /en/"; else bad "/en/docs/ is not a redirect"; fi

echo "== hreflang: every home page carries the same cluster =="
cluster() { grep -oE '<link rel="alternate" hreflang="[^"]+" href="[^"]+">' "$1" | sort; }
ref=$(cluster "$PUB/index.html")
n=$(printf '%s\n' "$ref" | grep -c hreflang)
[ "$n" = "10" ] && ok "/: 9 languages + x-default" || bad "/: $n hreflang links"
for p in ru ar vi es zh-hans pt-br fr hi; do
  if [ "$(cluster "$PUB/$p/index.html")" = "$ref" ]; then ok "/$p/ same cluster"; else bad "/$p/ cluster differs"; fi
done
if grep -q "hreflang=\"en\" href=\"$BASE/en/manual/safety/\"" "$PUB/en/manual/safety/index.html"; then
  ok "manual chapter references itself"; else bad "manual chapter hreflang"; fi

echo "== sitemap and robots =="
for u in "$BASE/" "$BASE/ru/" "$BASE/en/" "$BASE/en/manual/safety/" "$BASE/en/changelog/v$VERSION/"; do
  if grep -q "<loc>$u</loc>" "$PUB/sitemap.xml"; then ok "sitemap has $u"; else bad "sitemap misses $u"; fi
done
if grep -q "<loc>$BASE/en/docs/</loc>" "$PUB/sitemap.xml"; then bad "sitemap lists the /en/docs/ redirect"; else ok "no redirect stubs in sitemap"; fi
nloc=$(grep -c '<loc>' "$PUB/sitemap.xml"); nmod=$(grep -cE '<lastmod>[0-9]{4}-[0-9]{2}-[0-9]{2}</lastmod>' "$PUB/sitemap.xml")
[ "$nloc" = "$nmod" ] && ok "lastmod on all $nloc URLs" || bad "lastmod on $nmod of $nloc URLs"
if grep -q "^Sitemap: $BASE/sitemap.xml" "$PUB/robots.txt"; then ok "robots.txt points to the sitemap"; else bad "robots.txt sitemap line"; fi

echo "== manual and release notes =="
if grep -q "rel=\"prev\" href=\"$BASE/en/manual/install/\"" "$PUB/en/manual/safety/index.html" &&
   grep -q "rel=\"next\" href=\"$BASE/en/manual/quickstart/\"" "$PUB/en/manual/safety/index.html"; then
  ok "chapter 3: previous = install, next = quickstart"; else bad "manual prev/next order"; fi
nobc=$(for f in "$PUB"/en/manual/*/index.html; do grep -q '"BreadcrumbList"' "$f" || echo "$f"; done)
[ -z "$nobc" ] && ok "breadcrumbs on every chapter" || bad "no breadcrumbs: $nobc"
missing=$(for f in $(find "$PUB/en" -name index.html); do
  grep -oE "href=\"$BASE/en/[a-z0-9./-]+/#[^\"]+\"" "$f" | sed -E "s|href=\"$BASE/||; s|\"\$||" | while read -r a; do
    p=${a%%#*}; id=${a#*#}
    grep -q "id=\"$id\"" "$PUB/${p}index.html" || echo "$a"
  done
done | sort -u)
[ -z "$missing" ] && ok "every #anchor link resolves" || bad "anchors missing: $missing"
entries=$(grep -c '<entry' "$PUB/en/changelog/atom.xml" 2>/dev/null || echo 0)
[ "$entries" -ge 1 ] && ok "atom feed: $entries entries" || bad "atom feed empty"

echo "== structured data =="
PY=""
for c in python3 python; do  # on Windows "python3" may be a Store stub that does not run
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import json' >/dev/null 2>&1; then PY=$c; break; fi
done
if [ -z "$PY" ]; then bad "python3 not found for the JSON-LD check"; else
  if "$PY" - "$PUB" <<'EOF'
import json, pathlib, re, sys
bad = n = 0
for f in pathlib.Path(sys.argv[1]).rglob("*.html"):
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', f.read_text(encoding="utf-8"), re.S):
        n += 1
        try:
            json.loads(block)
        except ValueError as e:
            bad += 1
            print(f"  invalid JSON-LD in {f}: {e}")
print(f"  {n} JSON-LD blocks checked")
sys.exit(1 if bad or not n else 0)
EOF
  then ok "all JSON-LD parses"; else bad "invalid JSON-LD"; fi
fi

echo "== old host only for the APT repository =="
if [ "$BASE" = "https://$OLD_HOST" ]; then ok "site still served from $OLD_HOST (skipped)"; else
  # Zola escapes "/" as &#x2F; in code blocks; decode it before telling APT links from the rest.
  left=$(grep -rhoE "$OLD_HOST[^\" <)]*" "$PUB" | sed 's|&#x2F;|/|g' | grep -v "^$OLD_HOST/apt" | sort -u)
  [ -z "$left" ] && ok "no links to $OLD_HOST outside /apt" || bad "links to the old host: $left"
fi

echo "== no external scripts / CDNs / ad trackers =="
ext=$(grep -rhoE '<script[^>]+src="[^"]*"' "$PUB" | sed -E 's/.*src="([^"]*)".*/\1/' | grep -vE "^($BASE/|/)" || true)
if [ -n "$ext" ]; then bad "external script: $ext"; else ok "only own scripts"; fi
if grep -rInE 'googleapis|google-analytics|gtag\(|cdn\.|jsdelivr|unpkg|fonts\.(google|gstatic)' "$PUB" 2>/dev/null; then
  bad "external resource or tracker found"; else ok "no CDNs or ad trackers"; fi

echo "== private visit counter =="
gc=$(grep -rhoE 'data-goatcounter="[^"]*"' "$PUB" | sort -u)
if [ "$gc" = 'data-goatcounter="https://oldman007.goatcounter.com/count"' ] && grep -q 'data-goatcounter=' "$PUB/index.html"; then
  ok "one GoatCounter endpoint, script served by the site"; else bad "unexpected visit counter setup: ${gc:-none}"; fi

echo "== forbidden claims =="
if grep -rInE 'TrueNAS|ZFS deduplication|Proxmox DedupCommando|production-ready|production-grade' content templates "$PUB" 2>/dev/null; then
  bad "forbidden claim found"; else ok "none"; fi

echo "== promises the program does not keep =="
# Byte-for-byte group compare is off by default (--verify), a rollback returns the whole dataset, space
# comes back only after the quarantine and snapshots are cleared, the binary needs glibc 2.39+.
if grep -rInE 'byte-for-byte (verify|group verify|✓)|verified byte-for-byte|blake3 \+ (bytewise|побайтов)|побайтовая сверка групп|побайтово ✓|сверены побайтово|Undo is one command|one-command snapshot|одной командой|races by construction|Гонок нет|host won.{1,7}t notice|не заметит|never starves|No dependencies|Без зависимостей|Reclaimed [0-9$]|Освобождено [0-9$]|6[.,]2T used|6\+ (TB|ТБ)' templates content static/assets 2>/dev/null; then
  bad "promise found"; else ok "none"; fi

echo "== hand-written pages: claims corrected for 0.9.2 =="
# Pages synced from the code repository (content/en/manual/ and every file with `generated = true`)
# are corrected at their source, so this reads only hand-written pages, templates and assets.
hand=$(find templates static/assets content -type f ! -path 'content/en/manual/*' \
         -exec grep -L '^generated = true' {} + 2>/dev/null)
# Outside ZFS, delete, hardlink and reflink are refused: not "not recommended", in any language.
corrected='[Aa]pplying[^.]{0,30} (is )?(not|NOT) recommended|ZFS[^.]{0,30}strongly recommended|применять действия[^.]{0,20}не рекомендуется'
corrected=$corrected'|no se recomienda aplicar|ZFS muy recomendado|pas recommandé d.y appliquer|ZFS fortement recommandé'
corrected=$corrected'|não é recomendado aplicar|ZFS fortemente recomendado|không khuyến nghị áp dụng|Rất khuyến nghị ZFS'
corrected=$corrected'|不建议在那里应用操作|强烈推荐 ZFS|لا يُنصح بتطبيق|يُنصح بشدة بـ ZFS|लागू करने की अनुशंसा नहीं|ZFS की पुरज़ोर अनुशंसा'
# Idle lowers a scan's priority and promises nothing to VMs; every new headless --scan runs on Balanced.
corrected=$corrected'|starv(e|es|ing)[a-z ]{0,20}(VMs|guests|backups)|runs reuse it|headless scans reuse'
corrected=$corrected'|Idle( profile)? once in the (TUI|interface)|intensity profile of the last scan configuration'
# Reflink needs OpenZFS 2.2.1 with zfs_bclone_enabled=1; the documented test platform is Proxmox VE 9.1
# with OpenZFS 2.3; an IPMI console is not among the documented terminals.
corrected=$corrected'|ZFS (≥|>=) ?2\.(1|3)([^.0-9]|$)|ZFS 2\.3(\+| or newer| or later)|ZFS[^,;:]{0,20}2\.4\.3'
corrected=$corrected'|(tested on|обкатано на) 2\.4\.3|IPMI'
# What 0.9.2 does unlike these pages once said, and numbers that no public document holds.
corrected=$corrected'|checks only inode, size and times|from the release bundle|creates ./testpool'
corrected=$corrected'|group without a keeper is left alone|Without a keeper, the actions are ignored'
corrected=$corrected'|device, inode, size and mtime are unchanged|space returns when you purge|space comes back only when you purge'
corrected=$corrected'|Summary lists the rollback command|under active writes cannot be deduplicated|cross-dataset hardlink is impossible'
corrected=$corrected'|stops after the current chunk|(changes?|change) nothing on the filesystem|no file is touched'
corrected=$corrected'|no local Rust toolchain|ZFS-aware workflows|926\.1 MiB|1285\.7 MiB|over a minute to appear|2\.2 million files'
# $hand is a newline-separated list of paths without spaces, split on purpose.
# shellcheck disable=SC2086
if [ -n "$hand" ] && grep -nIE "$corrected" $hand 2>/dev/null; then
  bad "a corrected claim is back"; else ok "none"; fi

echo "== release tarball: install from its own directory =="
# The tarball unpacks into dedcom-<version>-<triple>/ (release.yml), so `install -m 755 dedcom …`
# run next to it finds no file.
# shellcheck disable=SC2086
if [ -n "$hand" ] && grep -nIE 'install -m 755 dedcom /' $hand 2>/dev/null; then
  bad "install line misses the tarball directory"; else ok "none"; fi

echo "== arabic RTL =="
if grep -q '<html lang="ar" dir="rtl">' "$PUB/ar/index.html"; then ok "/ar/ dir=rtl"; else bad "/ar/ not rtl"; fi

echo
[ "$fail" = "0" ] && echo "PASS" || echo "FAIL"
exit "$fail"
