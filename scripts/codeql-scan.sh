#!/usr/bin/env bash
#
# Run CodeQL locally to verify a fix clears an analyzer alert — without
# guessing at what the analyzer models as a sanitizer/sink.
#
# Reach for this ONLY for CodeQL/code-scanning alerts (taint-flow queries
# like request-forgery, sql-injection, ...). For ordinary bugs, lint,
# typecheck, or feature work, use pnpm test / typecheck / lint instead —
# CodeQL is heavy (~30s DB build + query eval) and wasteful for non-CodeQL
# problems.
#
# USAGE
#   scripts/codeql-scan.sh                      # default: js/request-forgery
#   scripts/codeql-scan.sh request-forgery      # explicit rule alias
#   scripts/codeql-scan.sh full                 # full javascript-code-scanning suite
#   scripts/codeql-scan.sh <path/to/Query.ql>   # arbitrary query/suite file
#
# ENV OVERRIDE
#   CODEQL_HOME   ... CLI install root (default ~/.local/share/codeql-cli)
#   CODEQL_DB_DIR ... database cache dir (default <repo>/.codeql/db)
#
# EXIT CODES
#   0 = no alerts (clean)   2 = alerts found   1 = setup/usage error
#
# INSTALL (one-time, if CODEQL_HOME is empty):
#   mkdir -p ~/.local/share/codeql-cli
#   curl -sL -o /tmp/codeql.tar.gz \
#     https://github.com/github/codeql-action/releases/latest/download/codeql-bundle-linux64.tar.gz
#   tar xzf /tmp/codeql.tar.gz -C ~/.local/share/codeql-cli
#   # -> creates ~/.local/share/codeql-cli/codeql/codeql
set -euo pipefail

CODEQL_HOME="${CODEQL_HOME:-$HOME/.local/share/codeql-cli}"
CODEQL_BIN="$CODEQL_HOME/codeql/codeql"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_DIR="${CODEQL_DB_DIR:-$REPO_ROOT/.codeql/db}"

if [[ ! -x "$CODEQL_BIN" ]]; then
  echo "ERROR: CodeQL CLI not found at $CODEQL_BIN" >&2
  echo "Install it first (see the INSTALL comment at the top of this script)." >&2
  exit 1
fi

QLQUERIES="$CODEQL_HOME/codeql/qlpacks/codeql/javascript-queries"

resolve_query() {
  local rule="$1"
  case "$rule" in
    request-forgery)
      find "$QLQUERIES" -path "*CWE-918/RequestForgery.ql" ! -path "*experimental*" | head -1
      ;;
    full)
      find "$QLQUERIES" -name "javascript-code-scanning.qls" | head -1
      ;;
    *)
      # Literal query/suite path (absolute or relative to repo).
      if [[ -f "$rule" ]]; then echo "$rule"; fi
      ;;
  esac
}

RULE="${1:-request-forgery}"
QUERY="$(resolve_query "$RULE")"

if [[ -z "$QUERY" ]]; then
  echo "ERROR: could not resolve a query for '$RULE'." >&2
  echo "Pass a rule alias (request-forgery|full) or a path to a .ql/.qls file." >&2
  exit 1
fi

mkdir -p "$DB_DIR"

echo ">> Building CodeQL database (javascript) at $DB_DIR/repo ..."
"$CODEQL_BIN" database create "$DB_DIR/repo" \
  --language=javascript --overwrite --source-root="$REPO_ROOT" >/dev/null

echo ">> Running: $QUERY"
OUT="$(mktemp -d)/results.csv"
# Don't fail the script if the analyzer reports findings; we surface them below.
"$CODEQL_BIN" database analyze "$DB_DIR/repo" "$QUERY" \
  --format=csv --output="$OUT" >/dev/null 2>&1 || true

if [[ -s "$OUT" ]]; then
  count=$(wc -l < "$OUT")
  echo ">> ALERTS ($count):"
  cat "$OUT"
  exit 2
else
  echo ">> No alerts. Clean."
fi
