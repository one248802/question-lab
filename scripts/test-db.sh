#!/usr/bin/env bash
# 임시 로컬 Postgres 를 띄워 마이그레이션 전체를 처음부터 한 번에 실행하고 DB 테스트를 돌립니다.
# 실제 Supabase 에는 접속하지 않습니다. 필요: Postgres 서버 바이너리(initdb, pg_ctl)와 psql
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(pg_config --bindir 2>/dev/null || ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PORT:-55432}"
DIR="$(mktemp -d /tmp/question-lab-db.XXXXXX)"

# initdb 는 root 로 실행할 수 없으므로 root 이면 postgres 사용자로 실행합니다.
run() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$DIR"

cleanup() { run "'$PG_BIN/pg_ctl' -D '$DIR/data' stop -m fast >/dev/null 2>&1" || true; rm -rf "$DIR"; }
trap cleanup EXIT

run "'$PG_BIN/initdb' -D '$DIR/data' -A trust >/dev/null"
run "'$PG_BIN/pg_ctl' -D '$DIR/data' -o '-p $PORT -k $DIR -c listen_addresses=' -l '$DIR/log' start >/dev/null"

PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "== migration: $(basename "$f") (single transaction)"
  "${PSQL[@]}" -1 -f "$f"
done
for f in "$ROOT"/supabase/tests/*_test.sql; do
  echo "== test: $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
