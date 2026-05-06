#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"

PG_DUMP_BIN="${PG_DUMP_BIN:-}"
if [[ -z "$PG_DUMP_BIN" ]]; then
  if command -v pg_dump >/dev/null 2>&1; then
    PG_DUMP_BIN="$(command -v pg_dump)"
  elif [[ -x "/opt/homebrew/opt/libpq/bin/pg_dump" ]]; then
    PG_DUMP_BIN="/opt/homebrew/opt/libpq/bin/pg_dump"
  elif [[ -x "/usr/local/opt/libpq/bin/pg_dump" ]]; then
    PG_DUMP_BIN="/usr/local/opt/libpq/bin/pg_dump"
  fi
fi

if [[ -z "$PG_DUMP_BIN" || ! -x "$PG_DUMP_BIN" ]]; then
  echo "ERROR: pg_dump bulunamadi. macOS icin: brew install libpq" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  printf "Production DATABASE_URL yapistir (giris gizli): " >&2
  IFS= read -r -s DATABASE_URL
  printf "\n" >&2
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL bos." >&2
  exit 1
fi

if [[ "$DATABASE_URL" != postgres://* && "$DATABASE_URL" != postgresql://* ]]; then
  echo "ERROR: DATABASE_URL postgres:// veya postgresql:// ile baslamali." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

STAMP="$(TZ=Europe/Istanbul date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/griseus-prod-$STAMP.dump"

echo "Manual production backup basliyor..."
echo "Output: $OUT"

"$PG_DUMP_BIN" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file "$OUT" \
  "$DATABASE_URL"

chmod 600 "$OUT"

SIZE="$(du -h "$OUT" | awk '{print $1}')"
echo "Backup tamamlandi."
echo "File: $OUT"
echo "Size: $SIZE"
echo "Format: PostgreSQL custom dump"
