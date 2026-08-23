#!/usr/bin/env bash
set -Eeuo pipefail

data_dir="${DATA_DIR:-/data}"
db_path="${DB_PATH:-${data_dir}/transfer.db}"
files_dir="${FILES_DIR:-${UPLOAD_DIR:-${data_dir}/files}}"
backup_dir="${BACKUP_DIR:-${data_dir}/backups}"
retention_days="${BACKUP_RETENTION_DAYS:-0}"

if [[ ! -f "$db_path" ]]; then
  echo "Database not found: $db_path" >&2
  exit 1
fi
if [[ "$backup_dir" == "/" || -z "$backup_dir" ]]; then
  echo "Unsafe BACKUP_DIR: $backup_dir" >&2
  exit 1
fi
if [[ "$db_path" == *"'"* || "$backup_dir" == *"'"* ]]; then
  echo "Paths containing a single quote are not supported" >&2
  exit 1
fi

mkdir -p "$backup_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
stage="$(mktemp -d "${backup_dir}/.backup-${stamp}-XXXXXX")"
archive="${backup_dir}/transfer-${stamp}.tar.gz"
trap 'rm -rf -- "$stage"' EXIT

sqlite3 -readonly "$db_path" ".timeout 10000" ".backup '${stage}/transfer.db'"
printf 'created_at_utc=%s\ndatabase=%s\nfiles=%s\n' "$stamp" "$db_path" "$files_dir" > "${stage}/metadata.txt"

tar_args=(-C "$stage" transfer.db metadata.txt)
if [[ -d "$files_dir" ]]; then
  tar_args+=(-C "$(dirname "$files_dir")" "$(basename "$files_dir")")
fi
tar -czf "${archive}.partial" "${tar_args[@]}"
tar -tzf "${archive}.partial" >/dev/null
mv -- "${archive}.partial" "$archive"

if [[ "$retention_days" =~ ^[0-9]+$ ]] && (( retention_days > 0 )); then
  find "$backup_dir" -maxdepth 1 -type f -name 'transfer-*.tar.gz' -mtime "+${retention_days}" -delete
fi

echo "$archive"
