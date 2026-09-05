#!/usr/bin/env bash
# Put the starter photos in this folder onto the live site — once.
#
#   bash seed.sh                      # uploads to https://mahoganyjr.com
#   bash seed.sh https://other.host   # or somewhere else, e.g. the workers.dev address
#
# Captions come from captions.txt (filename|caption). Runs through the same
# public upload endpoint anyone uses, so nothing here needs a password. A
# marker file is written afterwards so running it twice does not double up;
# delete seed/.done to run it again on purpose. Captions and names can be
# edited later in /admin.
set -euo pipefail
BASE="${1:-https://mahoganyjr.com}"; BASE="${BASE%/}"
cd "$(dirname "$0")"
if [ -f .done ]; then echo "Already seeded on $(cat .done). Remove seed/.done to run again."; exit 0; fi
curl -fsS -m 20 "$BASE/api/memorial" >/dev/null || { echo "Cannot reach $BASE/api/memorial — is the site live there?"; exit 1; }
n=0; failed=0
while IFS='|' read -r file caption; do
  [ -z "$file" ] && continue
  enc="${caption// /%20}"
  printf '  %-30s ' "$file"
  if curl -fsS -m 120 -X POST "$BASE/api/photos?caption=$enc" -H 'Content-Type: image/jpeg' --data-binary @"$file" -o /dev/null; then
    echo "added"; n=$((n+1))
  else
    echo "FAILED"; failed=$((failed+1))
  fi
done < captions.txt
if [ "$n" -gt 0 ]; then date -u +"%Y-%m-%d %H:%MZ" > .done; fi
echo "$n added, $failed failed, on $BASE"
[ "$failed" -eq 0 ]
