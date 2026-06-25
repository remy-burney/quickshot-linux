#!/usr/bin/env bash
set -euo pipefail

SNAP_NAME="${SNAP_NAME:-quickshot-linux}"
SNAP_MOUNT="${SNAP:-/snap/${SNAP_NAME}/current}"
UUID="lightshot-linux@remy.local"
LEGACY_UUID="lightshot-linux@local"
APP_DIR="${HOME}/.local/share/lightshot-linux"
EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
LEGACY_EXT_DIR="${HOME}/.local/share/gnome-shell/extensions/${LEGACY_UUID}"
BIN_DIR="${HOME}/.local/bin"
HELPER_LINK="${BIN_DIR}/lightshot-linux-helper"
CAPTURE_LINK="${BIN_DIR}/lightshot-linux-capture"
BACKUP_FILE="${APP_DIR}/print-keybinding-backup.txt"
SNAP_EXTENSION_DIR="${SNAP_MOUNT}/share/quickshot-linux/extension"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

require_command glib-compile-schemas
require_command gsettings
require_command gnome-extensions
require_command python3

if [[ ! -d "${SNAP_EXTENSION_DIR}" ]]; then
  printf 'Could not find bundled extension at %s\n' "${SNAP_EXTENSION_DIR}" >&2
  exit 1
fi

mkdir -p "${APP_DIR}" "${BIN_DIR}"

cat > "${HELPER_LINK}" <<EOF
#!/usr/bin/env bash
exec /snap/bin/${SNAP_NAME}.helper "\$@"
EOF
chmod 0755 "${HELPER_LINK}"

cat > "${CAPTURE_LINK}" <<EOF
#!/usr/bin/env bash
exec /snap/bin/${SNAP_NAME}.capture "\$@"
EOF
chmod 0755 "${CAPTURE_LINK}"

rm -rf "${EXT_DIR}" "${LEGACY_EXT_DIR}"
mkdir -p "${EXT_DIR}"
cp -a "${SNAP_EXTENSION_DIR}/." "${EXT_DIR}/"
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
  printf 'Extension copied to %s.\n' "${EXT_DIR}"
  printf 'Log out and back in if GNOME has not discovered it yet, then run: gnome-extensions enable %s\n' "${UUID}"
fi

printf 'Installed Quickshot Linux.\n'
printf 'Helper: %s\n' "${HELPER_LINK}"
printf 'Capture command: %s\n' "${CAPTURE_LINK}"
printf 'Extension: %s\n' "${EXT_DIR}"
