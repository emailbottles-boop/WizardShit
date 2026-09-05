#!/usr/bin/env bash
#
# Download everything — every photo file, and the captions and names that go
# with them — onto this computer.
#
#   bash backup.sh https://your-site-address.com
#
# Optionally pass a folder name as a second argument; otherwise it makes one
# named for today's date.
#
# Worth doing once or twice a year, and worth keeping the result somewhere
# that isn't Cloudflare. For some of these photos this may be the only copy
# anyone still has.
#
# (Wrangler can only fetch R2 objects one at a time, and only by exact name.
# So this asks the database what the photos are called, then downloads each
# one from the site itself — which needs no keys, because the wall is public.)
set -euo pipefail

BASE="${1:-}"
if [ -z "$BASE" ]; then
  echo "Usage: bash backup.sh https://your-site-address.com [folder]" >&2
  echo "       (use the address people visit, or the memorial-api.*.workers.dev one)" >&2
  exit 1
fi
BASE="${BASE%/}"
OUT="${2:-backup-$(date +%Y-%m-%d)}"

mkdir -p "$OUT/photos"

echo "==> Saving the captions, names and dates"
npx --yes wrangler d1 export memorial --remote --output="$OUT/memorial.sql"

echo "==> Asking the database which photos exist"
npx --yes wrangler d1 execute memorial --remote --json \
  --command "SELECT r2_key FROM photos ORDER BY id" > "$OUT/.keys.json"

# The JSON comes back as [{ "results": [ {"r2_key": "..."} ], ... }]. Wrangler
# sometimes prints a banner first, so seek to the first '[' rather than
# assuming the file starts with it.
python3 - "$OUT/.keys.json" > "$OUT/.keys.txt" <<'PY'
import json, re, sys
text = open(sys.argv[1], encoding='utf-8').read()
start = text.find('[')
data = json.loads(text[start:]) if start >= 0 else []
for block in data:
    for row in block.get('results', []):
        if row.get('r2_key'):
            print(row['r2_key'])
PY

TOTAL=$(wc -l < "$OUT/.keys.txt" | tr -d ' ')
echo "==> Downloading $TOTAL photo(s) from $BASE/img/"

FAILED=0
N=0
while IFS= read -r key; do
  [ -z "$key" ] && continue
  N=$((N + 1))
  printf '\r    %s of %s' "$N" "$TOTAL"
  if ! curl -fsS --retry 3 -o "$OUT/photos/$key" "$BASE/img/$key"; then
    echo "" >&2
    echo "    could not fetch $key" >&2
    FAILED=$((FAILED + 1))
  fi
done < "$OUT/.keys.txt"
printf '\n'

rm -f "$OUT/.keys.json" "$OUT/.keys.txt"

echo "==> Done. Everything is in: $OUT"
echo "    $OUT/memorial.sql  — captions, names, dates"
echo "    $OUT/photos/       — the photo files"
if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo "    NOTE: $FAILED photo(s) could not be downloaded. Check that the address" >&2
  echo "    you passed is the live site and try again." >&2
  exit 1
fi
