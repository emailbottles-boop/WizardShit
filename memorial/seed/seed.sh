#!/usr/bin/env bash
# Put the starter photos in this folder onto the live site — once.
#
#   bash seed.sh                      # uploads to https://mahoganyjr.com
#   bash seed.sh https://other.host   # or somewhere else, e.g. the workers.dev address
#
# Captions come from captions.txt (filename|caption). Runs through the same
# public upload endpoint anyone uses, so nothing here needs a password. Each
# file that goes up is recorded in seed/.done and skipped next time, so
# running this again only sends photos added since — drop a new file in,
# add its line to captions.txt, run it again. Captions and names can be
# edited later in /admin.
set -euo pipefail
BASE="${1:-https://mahoganyjr.com}"; BASE="${BASE%/}"
cd "$(dirname "$0")"
touch .done
curl -fsS -m 20 "$BASE/api/memorial" >/dev/null || { echo "Cannot reach $BASE/api/memorial — is the site live there?"; exit 1; }
n=0; failed=0
while IFS='|' read -r file caption; do
  [ -z "$file" ] && continue
  if grep -qxF "$file" .done; then printf '  %-30s already up\n' "$file"; continue; fi
  enc="${caption// /%20}"
  printf '  %-30s ' "$file"
  if curl -fsS -m 120 -X POST "$BASE/api/photos?caption=$enc" -H 'Content-Type: image/jpeg' --data-binary @"$file" -o /dev/null; then
    echo "added"; n=$((n+1)); echo "$file" >> .done
  else
    echo "FAILED"; failed=$((failed+1))
  fi
done < captions.txt
echo "$n added, $failed failed, on $BASE"
[ "$failed" -eq 0 ]
