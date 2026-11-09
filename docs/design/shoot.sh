#!/bin/sh
# Screenshot a grill.html state with headless Chrome.
# Usage: docs/design/shoot.sh <out.png> <hash-state> [width] [height]
# Example: docs/design/shoot.sh docs/design/shots/a.png "v=a&s=live" 520 900
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out=$1
state=$2
w=${3:-520}
h=${4:-1000}
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --allow-file-access-from-files --virtual-time-budget=1500 \
  --window-size="$w,$h" --screenshot="$out" "file://$here/grill.html#$state" >/dev/null 2>&1
echo "$out"
