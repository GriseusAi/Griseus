#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"

PG_RESTORE_BIN="${PG_RESTORE_BIN:-}"
if [[ -z "$PG_RESTORE_BIN" ]]; then
  if command -v pg_restore >/dev/null 2>&1; then
    PG_RESTORE_BIN="$(command -v pg_restore)"
  elif [[ -x "/opt/homebrew/opt/libpq/bin/pg_restore" ]]; then
    PG_RESTORE_BIN="/opt/homebrew/opt/libpq/bin/pg_restore"
  elif [[ -x "/usr/local/opt/libpq/bin/pg_restore" ]]; then
    PG_RESTORE_BIN="/usr/local/opt/libpq/bin/pg_restore"
  fi
fi

if [[ -z "$PG_RESTORE_BIN" || ! -x "$PG_RESTORE_BIN" ]]; then
  echo "ERROR: pg_restore bulunamadi. macOS icin: brew install libpq" >&2
  exit 1
fi

LATEST_DUMP="$(find "$BACKUP_DIR" -type f -name 'griseus-prod-*.dump' -size +0c -print | sort | tail -n 1)"
if [[ -z "$LATEST_DUMP" ]]; then
  echo "ERROR: backups/ altinda kullanilabilir .dump bulunamadi." >&2
  exit 1
fi

echo "Restore target: STAGING database"
echo "Backup file: $LATEST_DUMP"
echo
printf "Staging DATABASE_PUBLIC_URL yapistir (giris gizli): " >&2
IFS= read -r -s DATABASE_URL
printf "\n" >&2

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL bos." >&2
  exit 1
fi

if [[ "$DATABASE_URL" != postgres://* && "$DATABASE_URL" != postgresql://* ]]; then
  echo "ERROR: DATABASE_URL postgres:// veya postgresql:// ile baslamali." >&2
  exit 1
fi

SANITIZED="$(node -e '
const raw = process.argv[1];
const url = new URL(raw);
console.log(`${url.protocol}//${url.username}:***@${url.host}${url.pathname}`);
' "$DATABASE_URL")"

echo "Target check: $SANITIZED"
echo
printf "Devam etmek icin STAGING yaz: " >&2
IFS= read -r CONFIRM

if [[ "$CONFIRM" != "STAGING" ]]; then
  echo "Restore iptal edildi." >&2
  exit 1
fi

echo "Staging restore basliyor..."
"$PG_RESTORE_BIN" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname "$DATABASE_URL" \
  "$LATEST_DUMP"

echo "Staging restore tamamlandi."
