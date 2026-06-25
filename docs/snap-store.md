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

Upload to the edge channel first:

```bash
snapcraft upload --release=edge quickshot-linux_0.1.0_amd64.snap
```

Classic confinement requires Snap Store review before stable release. In the
review request, explain that the snap installs a per-user GNOME Shell extension
and helper wrappers so GNOME Shell can own the Print shortcut and call the
bundled screenshot renderer.

## Store listing

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
