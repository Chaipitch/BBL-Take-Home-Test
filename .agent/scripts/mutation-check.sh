#!/usr/bin/env bash
# Mutation check: break a rule on purpose, run the tests, restore the file, report whether the tests
# noticed. A test that passes against the mutant does not protect that rule.
#
#   .agent/scripts/mutation-check.sh <file> <search> <replace> [-- <test command…>]
#   .agent/scripts/mutation-check.sh --file <mutants.tsv> [-- <test command…>]
#
# mutants.tsv: label <TAB> file <TAB> search <TAB> replace [<TAB> survive]
#   - use \n in search/replace for newlines
#   - a 5th column "survive" marks a documented equivalent mutant (surviving is then expected)
#   - a line "#test: <command>" sets the test command for that file (overridden by -- on the CLI)
# Default test command: npm test --prefix backend
set -uo pipefail

TEST_CMD=(npm test --prefix backend)
ARGS=()
while [ $# -gt 0 ]; do
  if [ "$1" = "--" ]; then shift; TEST_CMD=("$@"); break; fi
  ARGS+=("$1"); shift
done

restore() { [ -n "${BACKUP:-}" ] && [ -f "$BACKUP" ] && mv "$BACKUP" "$TARGET"; }
trap 'restore' EXIT INT TERM

run_one() { # label file search replace expected
  local label="$1" file="$2" search="$3" replace="$4" expected="${5:-caught}"
  TARGET="$file"; BACKUP="$(mktemp)"; cp "$file" "$BACKUP"
  if ! python3 - "$file" "$search" "$replace" <<'PY'
import sys
path, search, replace = sys.argv[1], sys.argv[2].replace('\\n', '\n'), sys.argv[3].replace('\\n', '\n')
src = open(path).read()
if search not in src:
    sys.exit(3)
open(path, 'w').write(src.replace(search, replace, 1))
PY
  then
    printf '%-58s SKIPPED (search text not found)\n' "$label"; restore; BACKUP=""; return 2
  fi

  local output status
  output="$("${TEST_CMD[@]}" 2>&1)"; status=$?
  restore; BACKUP=""

  local summary
  summary="$(printf '%s' "$output" | sed $'s/\x1b\\[[0-9;]*m//g' | grep -E '^\s*(Tests|Test Files) ' | tail -1 | tr -s ' ')"
  if [ $status -eq 0 ]; then
    if [ "$expected" = "survive" ]; then
      printf '%-58s survived (expected: documented equivalent)\n' "$label"; return 0
    fi
    printf '%-58s SURVIVED  %s\n' "$label" "$summary"; return 1
  fi
  if [ "$expected" = "survive" ]; then
    printf '%-58s CAUGHT but marked as equivalent — update the file  %s\n' "$label" "$summary"; return 1
  fi
  printf '%-58s caught    %s\n' "$label" "$summary"; return 0
}

survivors=0; total=0
if [ "${ARGS[0]:-}" = "--file" ]; then
  file="${ARGS[1]:?mutants file required}"
  if [ ${#TEST_CMD[@]} -eq 4 ] && [ "${TEST_CMD[0]}" = "npm" ]; then      # no -- given: honour "#test:" in the file
    from_file="$(grep -m1 '^#test:' "$file" | sed 's/^#test: *//')"
    [ -n "$from_file" ] && read -r -a TEST_CMD <<< "$from_file"
  fi
  echo "test command: ${TEST_CMD[*]}"
  while IFS=$'\t' read -r label target search replace expected; do
    case "$label" in ''|'#'*) continue;; esac
    total=$((total + 1)); run_one "$label" "$target" "$search" "$replace" "${expected:-caught}" || [ $? -eq 2 ] || survivors=$((survivors + 1))
  done < "$file"
else
  [ ${#ARGS[@]} -ge 3 ] || { echo "usage: $0 <file> <search> <replace> [-- test command]"; exit 64; }
  total=1; run_one "${ARGS[0]}" "${ARGS[0]}" "${ARGS[1]}" "${ARGS[2]}" || survivors=1
fi

echo "---"
echo "mutants: $total, unexpected results: $survivors"
[ "$survivors" -eq 0 ]
