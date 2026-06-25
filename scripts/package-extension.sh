#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/dist"

mkdir -p "${OUT_DIR}"
gnome-extensions pack \
  --force \
  --out-dir "${OUT_DIR}" \
  --schema "${ROOT_DIR}/extension/schemas/org.gnome.shell.extensions.lightshot-linux.gschema.xml" \
  "${ROOT_DIR}/extension"

printf 'Extension package written to %s\n' "${OUT_DIR}"
