# Quickshot Linux

Lightshot-style local screenshot selection and annotation for Ubuntu GNOME Wayland.

This project uses a GNOME Shell extension for the parts Wayland protects, including the `Print` shortcut, full-screen overlay, and screenshot capture. A .NET 10 helper renders the final PNG with SkiaSharp and can copy it to the Wayland clipboard through `wl-copy`.

The current install paths, command names, extension UUID, and settings schema still use the original `lightshot-linux` identifier for compatibility.

## Requirements

- Ubuntu GNOME on Wayland.
- GNOME Shell 50.
- .NET 10 SDK, used by the installer to publish the helper.
- `glib-compile-schemas`, `gsettings`, and `gnome-extensions`.
- `wl-copy` from `wl-clipboard` for clipboard copy support.

## Install

```bash
./scripts/install.sh
```

The installer:

- Publishes the helper to `~/.local/share/lightshot-linux/helper`.
- Creates `~/.local/bin/lightshot-linux-helper`.
- Creates `~/.local/bin/lightshot-linux-capture`.
- Installs the extension to `~/.local/share/gnome-shell/extensions/lightshot-linux@remy.local`.
- Compiles the extension settings schema.
- Backs up any existing custom `Print` keybinding to `~/.local/share/lightshot-linux/print-keybinding-backup.txt`.
- Clears existing custom `Print` bindings so the extension can own the key.

On GNOME Wayland, a newly copied extension may require logging out and back in before GNOME Shell discovers it. After logging back in, run:

```bash
gnome-extensions enable lightshot-linux@remy.local
```

## Usage

- `Print`: start capture.
- `lightshot-linux-capture`: start capture from a terminal or custom shortcut.
- Drag: select an area.
- Toolbar: pen, line, arrow, rectangle, highlighter, text, color, undo.
- Mouse wheel: adjust the active tool size or text size.
- `Ctrl+C`: copy the selected annotated screenshot.
- `Ctrl+S`: save to `~/Pictures/Screenshots`.
- `Ctrl+A`: select the whole desktop.
- `Ctrl+Z`: undo last annotation.
- `Esc` or `Ctrl+X`: close the overlay.

## Development

```bash
dotnet build LightshotLinux.slnx
dotnet test LightshotLinux.slnx
./scripts/package-extension.sh
```

The extension package is written to `dist/`.

## Snap Store

Quickshot Linux includes initial Snapcraft packaging for Ubuntu App Center /
Snap Store publishing. The snap uses classic confinement because it installs a
per-user GNOME Shell extension and helper wrappers in locations GNOME Shell can
load.

```bash
sudo snap install snapcraft --classic
snapcraft
sudo snap install ./quickshot-linux_0.1.0_amd64.snap --dangerous --classic
quickshot-linux
```

See `docs/snap-store.md` for the publishing checklist and suggested store
listing copy.
