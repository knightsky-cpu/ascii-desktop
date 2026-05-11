# ASCII Desktop Overlay

GNOME Shell extension experiment for a hotkey-toggleable desktop ASCII overlay inspired by AcerolaFX.

## Development Workflow

The extension source lives in:

```text
extension/ascii-overlay@local
```

Install or refresh the local extension copy:

```sh
scripts/installascii.sh
```

Enable the extension:

```sh
scripts/asciion.sh
```

Disable the extension:

```sh
scripts/asciioff.sh
```

Check extension state:

```sh
scripts/status-extension.sh
```

Follow GNOME Shell logs:

```sh
scripts/logs.sh
```

Capture a desktop screenshot through the xdg desktop portal:

```sh
scripts/capture-portal-screenshot.sh /tmp/ascii-desktop-capture.png
```

There is also a direct GNOME Shell screenshot script, but GNOME may block it with `AccessDenied` outside trusted callers:

```sh
scripts/capture-screenshot.sh /tmp/ascii-desktop-capture.png
```

Analyze a screenshot into ASCII luminance cells:

```sh
scripts/analyze-luminance.py /tmp/ascii-desktop-capture.png --cell-size 8 --max-cols 120
```

For manual capture testing, save screenshots into `screenshots/` and analyze the newest one:

```sh
scripts/analyze-latest-screenshot.sh
```

The screenshot directory also contains self-contained helpers, so this workflow can run from there directly:

```sh
cd screenshots
./analyze-latest-screenshot.sh
./analyze-latest-screenshot.sh 8 120 --full-output latest-ascii.txt
./analyze-latest-screenshot.sh 8 120 --contrast 1.15 --gamma 0.9
```

Analyzer output includes a terminal-sized preview and a full-frame character histogram. The `--full-output` option writes the complete ASCII cell frame to a text file. The `--contrast` and `--gamma` options tune luminance mapping; defaults of `1.0` preserve the raw mapping.

The default overlay toggle shortcut is `Ctrl+Alt+A`. The current visual prototype is a fullscreen GPU-side stage-content overlay: GNOME Shell captures the desktop stage into `Clutter_TextureContent`, paints it as a full-screen actor, and applies a GLSL invert pass on the GPU.

Cycle prototype grid presets while the overlay is active:

```text
Ctrl+Alt+Period
```

Run the temporary internal capture probe:

```text
Ctrl+Alt+Comma
```

The capture probe logs whether GNOME Shell exposes an internal screenshot path to the extension and, if successful, writes a one-shot probe image under `/tmp/ascii-overlay-probe-*.png`.

When the overlay is enabled, the current live prototype refreshes in-memory stage content every 66ms without CPU texture readback. The overlay is temporarily hidden during each stage capture so it samples the desktop underneath instead of recursively capturing itself. The earlier `Cogl_Texture2D.get_data()` path remains available only for diagnostics because GNOME Shell returned all-zero pixel data in testing.

The capture probe also attempts to paint the captured stage content directly as a temporary GPU-side preview actor with a small GLSL invert snippet. This tests whether GNOME Shell can render and modify the captured texture without CPU readback.

On Wayland, GNOME Shell usually needs a logout/login after installing a new extension for the first time. Existing extension code can often be refreshed by disabling/enabling the extension, but some GNOME Shell changes still require a new session.

## Original Grid Overlay

The early amber grid prototype is preserved as a separate local extension for screenshots and comparison:

```sh
scripts/install-original.sh
scripts/enable-original.sh
scripts/disable-original.sh
```

It uses the same runtime shortcuts as the ASCII overlay: `Ctrl+Alt+A` toggles the overlay and `Ctrl+Alt+Period` cycles the grid presets. `enable-original.sh` disables the ASCII overlay first so both extensions do not compete for the same shortcuts.
