#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

make_fake_commands() {
  local bin_dir="$1"
  mkdir -p "${bin_dir}"

  cat > "${bin_dir}/gsettings" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
state_dir="${MOCK_STATE_DIR:?}"

if [[ "$1" == "get" && "$2" == "org.gnome.settings-daemon.plugins.media-keys" && "$3" == "custom-keybindings" ]]; then
  printf "['/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/']\n"
elif [[ "$1" == "get" && "$3" == "name" ]]; then
  printf "'Existing screenshot shortcut'\n"
elif [[ "$1" == "get" && "$3" == "command" ]]; then
  printf "'gnome-screenshot -a'\n"
elif [[ "$1" == "get" && "$3" == "binding" ]]; then
  cat "${state_dir}/binding"
  printf '\n'
elif [[ "$1" == "get" && "$2" == "org.gnome.shell" && "$3" == "enabled-extensions" ]]; then
  printf "[]\n"
elif [[ "$1" == "set" && "$3" == "binding" ]]; then
  printf "%s" "$4" > "${state_dir}/binding"
elif [[ "$1" == "set" ]]; then
  :
else
  printf 'unexpected gsettings call: %s\n' "$*" >&2
  exit 1
fi
SH
  chmod +x "${bin_dir}/gsettings"

  cat > "${bin_dir}/glib-compile-schemas" <<'SH'
#!/usr/bin/env bash
exit 0
SH
  chmod +x "${bin_dir}/glib-compile-schemas"

  cat > "${bin_dir}/gnome-extensions" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == "info" ]]; then
  exit 1
fi
exit 0
SH
  chmod +x "${bin_dir}/gnome-extensions"

  cat > "${bin_dir}/dotnet" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" != "publish" ]]; then
  printf 'unexpected dotnet call: %s\n' "$*" >&2
  exit 1
fi

output=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      shift
      output="${1:-}"
      ;;
  esac
  shift || true
done

if [[ -z "${output}" ]]; then
  printf 'dotnet publish missing --output\n' >&2
  exit 1
fi

mkdir -p "${output}"
cat > "${output}/LightshotLinux.ImageTool" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "${output}/LightshotLinux.ImageTool"
SH
  chmod +x "${bin_dir}/dotnet"
}

run_twice_and_assert_backup_survives() {
  local label="$1"
  shift

  local temp_root
  temp_root="$(mktemp -d)"
  trap 'rm -rf "${temp_root}"' RETURN

  mkdir -p "${temp_root}/snap/share/quickshot-linux"
  cp -a "${ROOT_DIR}/extension" "${temp_root}/snap/share/quickshot-linux/extension"
  printf "'Print'" > "${temp_root}/binding"
  make_fake_commands "${temp_root}/bin"

  env \
    MOCK_STATE_DIR="${temp_root}" \
    HOME="${temp_root}/home" \
    SNAP_NAME="quickshot-linux" \
    SNAP="${temp_root}/snap" \
    PATH="${temp_root}/bin:${PATH}" \
    "$@" >/dev/null

  local backup="${temp_root}/home/.local/share/lightshot-linux/print-keybinding-backup.txt"
  test -s "${backup}"
  grep -F "binding='Print'" "${backup}" >/dev/null
  local first_backup
  first_backup="$(cat "${backup}")"

  env \
    MOCK_STATE_DIR="${temp_root}" \
    HOME="${temp_root}/home" \
    SNAP_NAME="quickshot-linux" \
    SNAP="${temp_root}/snap" \
    PATH="${temp_root}/bin:${PATH}" \
    "$@" >/dev/null

  test "${first_backup}" = "$(cat "${backup}")"
  printf '%s reinstall backup preservation ok\n' "${label}"
}

run_twice_and_assert_backup_survives "source installer" "${ROOT_DIR}/scripts/install.sh"
run_twice_and_assert_backup_survives "snap installer" "${ROOT_DIR}/scripts/install-from-snap.sh"
