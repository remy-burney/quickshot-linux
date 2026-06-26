# Snap Store publishing

Quickshot Linux is packaged as an installer-style snap because GNOME Shell
extensions must be copied into a user GNOME extension directory before GNOME
Shell can load them.

## Build

Install Snapcraft, then build the snap from the repository root:

```bash
sudo snap install snapcraft --classic
snapcraft
```

Install the local build for testing:

```bash
sudo snap install ./quickshot-linux_0.1.0_amd64.snap --dangerous --classic
quickshot-linux
```

After the installer finishes, log out and back in if GNOME Shell has not
discovered the extension yet.

To remove the user GNOME Shell integration before uninstalling the snap:

```bash
quickshot-linux.uninstall
sudo snap remove quickshot-linux
```

## Publish

Register the name once:

```bash
snapcraft login
snapcraft register quickshot-linux
```

To publish from GitHub Actions, export store credentials locally and save them
as the repository secret `SNAPCRAFT_STORE_CREDENTIALS`:

```bash
snapcraft export-login \
  --snaps=quickshot-linux \
  --channels=edge,beta,candidate,stable \
  --acls package_access,package_push,package_update,package_release \
  snapcraft-login.txt
```

Paste the contents of `snapcraft-login.txt` into the GitHub Actions secret.

Upload to the edge channel first:

```bash
snapcraft upload --release=edge quickshot-linux_0.1.0_amd64.snap
```

Or run the `Publish snap` workflow manually and select the target channel.

Classic confinement requires Snap Store review before stable release. In the
review request, explain that the snap installs a per-user GNOME Shell extension
and helper wrappers so GNOME Shell can own the Print shortcut and call the
bundled screenshot renderer.

## Classic confinement request

Suggested request text:

```text
Quickshot Linux requires classic confinement because it is a GNOME Shell
extension integration package.

The snap bundles a .NET/SkiaSharp screenshot renderer and a GNOME Shell
extension. GNOME Shell only loads extensions from the user's extension
directories, so the snap provides an installer command that copies the bundled
extension to ~/.local/share/gnome-shell/extensions/lightshot-linux@remy.local
and creates helper wrappers in ~/.local/bin. The extension owns the Print
shortcut through GNOME settings, shows the full-screen Wayland screenshot
selection overlay, and calls the bundled snap helper to render/copy/save the
final PNG.

Strict confinement does not provide a way for GNOME Shell to load the bundled
extension directly from the snap mount, nor to install the per-user helper
wrappers and keybinding integration needed for this workflow.
```

## Store listing

Primary website:

```text
https://github.com/remy-burney/quickshot-linux
```

Source code:

```text
https://github.com/remy-burney/quickshot-linux
```

Category:

```text
Productivity
```

Suggested summary:

```text
Lightshot-style screenshot selection and annotation for GNOME Wayland.
```

Suggested description:

```text
Quickshot Linux provides local screenshot area selection and annotation for
Ubuntu GNOME Wayland.

It uses a GNOME Shell extension for the Wayland-protected parts of the workflow:
the Print shortcut, full-screen overlay, and screenshot capture. A bundled
.NET/SkiaSharp helper renders the final PNG and can copy it to the Wayland
clipboard through wl-copy.

After installing the snap, run Quickshot Linux once from the app launcher or run
quickshot-linux in a terminal to install or repair the GNOME Shell integration.
```

## Store assets

- Icon: `snap/gui/quickshot-linux.svg`
- Screenshots:
  - `snap/store/screenshots/quickshot-linux-overlay.jpeg`
  - `snap/store/screenshots/quickshot-linux-annotated.png`

The Snapcraft project file supports `website` and `source-code` metadata, which
are set in `snap/snapcraft.yaml`. Store category and screenshots are managed in
the Snap Store listing after upload; use the category and screenshot files above.
