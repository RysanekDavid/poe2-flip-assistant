#!/usr/bin/env bash
set -euo pipefail

count_file="${TMPDIR:-/tmp}/poe2flip-err-trap-$$-$RANDOM"
trap 'unlink "$count_file" 2>/dev/null || true' EXIT
: > "$count_file"

if COUNT_FILE="$count_file" bash -c '
set -euo pipefail
rollback() { printf "rollback\n" >> "$COUNT_FILE"; }
trap rollback ERR
response=$(false)
'; then
  echo "command-substitution probe unexpectedly succeeded" >&2
  exit 1
fi

rollback_count=$(wc -l < "$count_file")
if [[ $rollback_count -ne 1 ]]; then
  echo "expected one rollback, observed $rollback_count" >&2
  exit 1
fi

echo "ALL PASS - command-substitution failure invokes rollback once"
