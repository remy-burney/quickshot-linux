#!/usr/bin/env bash
set -euo pipefail

UUID="lightshot-linux@remy.local"
LEGACY_UUID="lightshot-linux@local"
APP_DIR="${HOME}/.local/share/lightshot-linux"
EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
LEGACY_EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/${LEGACY_UUID}"
BIN_DIR="${HOME}/.local/bin"
HELPER_LINK="${BIN_DIR}/lightshot-linux-helper"
CAPTURE_LINK="${BIN_DIR}/lightshot-linux-capture"
BACKUP_FILE="${APP_DIR}/print-keybinding-backup.txt"

if command -v gsettings >/dev/null 2>&1; then
  python3 - "${UUID}" <<'PY' || true
import ast
import subprocess
import sys

uuid = sys.argv[1]
raw = subprocess.check_output([
    "gsettings",
    "get",
    "org.gnome.shell",
    "enabled-extensions",
], text=True).strip()

items = ast.literal_eval(raw)
if uuid in items:
    items.remove(uuid)
    value = "[" + ", ".join(repr(item) for item in items) + "]"
    subprocess.check_call([
        "gsettings",
        "set",
        "org.gnome.shell",
        "enabled-extensions",
        value,
    ])
PY

  if [[ -s "${BACKUP_FILE}" ]]; then
    while IFS='=' read -r key value; do
      if [[ "${key}" == "path" && -n "${value}" ]]; then
        schema="org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:${value}"
        gsettings set "${schema}" binding "'Print'" || true
        printf 'Restored Print binding at %s\n' "${value}"
      fi
    done < "${BACKUP_FILE}"
  fi
fi

rm -rf "${EXT_DIR}" "${LEGACY_EXT_DIR}"
rm -f "${HELPER_LINK}" "${CAPTURE_LINK}"

printf 'Removed Quickshot Linux user integration.\n'
printf 'Removed extension: %s\n' "${EXT_DIR}"
printf 'Removed helper wrapper: %s\n' "${HELPER_LINK}"
printf 'Removed capture wrapper: %s\n' "${CAPTURE_LINK}"
