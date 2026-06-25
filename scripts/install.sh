#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UUID="lightshot-linux@remy.local"
LEGACY_UUID="lightshot-linux@local"
APP_DIR="${HOME}/.local/share/lightshot-linux"
EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
LEGACY_EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/${LEGACY_UUID}"
BIN_DIR="${HOME}/.local/bin"
HELPER_LINK="${BIN_DIR}/lightshot-linux-helper"
CAPTURE_LINK="${BIN_DIR}/lightshot-linux-capture"
BACKUP_FILE="${APP_DIR}/print-keybinding-backup.txt"

mkdir -p "${APP_DIR}" "${BIN_DIR}"

dotnet publish "${ROOT_DIR}/src/LightshotLinux.ImageTool/LightshotLinux.ImageTool.csproj" \
  --configuration Release \
  --output "${APP_DIR}/helper"

ln -sf "${APP_DIR}/helper/LightshotLinux.ImageTool" "${HELPER_LINK}"
install -m 0755 "${ROOT_DIR}/scripts/lightshot-linux-capture" "${CAPTURE_LINK}"

rm -rf "${EXT_DIR}" "${LEGACY_EXT_DIR}"
mkdir -p "${EXT_DIR}"
cp -a "${ROOT_DIR}/extension/." "${EXT_DIR}/"
glib-compile-schemas "${EXT_DIR}/schemas"

: > "${BACKUP_FILE}"
CUSTOM_BINDINGS="$(gsettings get org.gnome.settings-daemon.plugins.media-keys custom-keybindings | tr -d "[],'")"
for path in ${CUSTOM_BINDINGS}; do
  schema="org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:${path}"
  name="$(gsettings get "${schema}" name || true)"
  command="$(gsettings get "${schema}" command || true)"
  binding="$(gsettings get "${schema}" binding || true)"

  if [[ "${binding}" == "'Print'" ]]; then
    {
      printf 'path=%s\n' "${path}"
      printf 'name=%s\n' "${name}"
      printf 'command=%s\n' "${command}"
      printf 'binding=%s\n\n' "${binding}"
    } >> "${BACKUP_FILE}"

    gsettings set "${schema}" binding "''"
    printf 'Cleared existing Print binding at %s; backup written to %s\n' "${path}" "${BACKUP_FILE}"
  fi
done

python3 - "${UUID}" <<'PY'
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
if uuid not in items:
    items.append(uuid)
    value = "[" + ", ".join(repr(item) for item in items) + "]"
    subprocess.check_call([
        "gsettings",
        "set",
        "org.gnome.shell",
        "enabled-extensions",
        value,
    ])
PY

if gnome-extensions info "${UUID}" >/dev/null 2>&1; then
  gnome-extensions enable "${UUID}" || true
else
  printf 'Extension copied to %s. Log out and back in if GNOME has not discovered it yet, then run: gnome-extensions enable %s\n' "${EXT_DIR}" "${UUID}"
fi

printf 'Installed Lightshot Linux.\n'
printf 'Helper: %s\n' "${HELPER_LINK}"
printf 'Capture command: %s\n' "${CAPTURE_LINK}"
printf 'Extension: %s\n' "${EXT_DIR}"
