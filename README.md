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

Enable the same extension with the experimental 20-bucket live luminance mode:

```sh
scripts/asciion20.sh
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

Analyzer output includes a terminal-sized preview and a full-frame character histogram. The `--full-output` option writes the complete ASCII cell frame to a text file. The `--contrast` and `--gamma` options tune luminance mapping; defaults of `1.0` preserve the raw mapping. Use `--ramp fine20` to test a 20-step ASCII luminance ramp at 0.05 increments, and use `--paper-background` to treat near-white cells as blank paper before edge compositing. The `fine20` ramp is:

```text
 .-,'`:;coOP0Q&8%B@#
```

The default overlay toggle shortcut is `Ctrl+Alt+A`. The current visual prototype is a fullscreen GPU-side stage-content overlay: GNOME Shell captures the desktop stage into `Clutter_TextureContent`, paints it as a full-screen actor, and applies a GLSL ASCII fill pass with a coherence-gated luminance edge pass on the GPU. `scripts/asciion.sh` launches the standard 10-bucket mode; `scripts/asciion20.sh` launches an experimental 20-bucket luminance mode using the same procedural glyph masks. The pass samples one color per active grid cell, quantizes luminance, draws procedural glyph masks, and replaces coherent strong-gradient cells with horizontal, vertical, slash, or backslash contour strokes. The live shader approximates the offline DoG/coherence edge path with local contrast gating to keep fullscreen cost low.

Cycle prototype grid presets while the overlay is active:

```text
Ctrl+Alt+Period
```

The GPU path currently cycles the high-detail divisor presets: `1`, `2`, `4`, `5`, `8`, and `10`. On a 3440x1440 display, `1px` maps to a `3440x1440` cell grid, `2px` maps to `1720x720`, `4px` maps to `860x360`, `5px` maps to `688x288`, `8px` maps to `430x180`, and `10px` maps to `344x144`.

Cycle live color/filter styles while the overlay is active:

```text
Ctrl+Alt+Apostrophe
```

The style cycle currently includes `classic-amber`, `dark-amber`, `muted-crt`, `hybrid-edge-tint`, `invert`, and `cyberpunk`. `classic-amber` is the baseline style that restores the original amber shadow/ink look; `dark-amber` uses a deeper low-glow amber palette for darker rooms or lower eye strain. All styles use the same classic-style glyph mask behavior, then swap the palette/filter. The `1px` grid uses the lightest high-resolution render path, `2px` keeps more ASCII mask strength, and larger ASCII cells (`4px`, `5px`, `8px`, and `10px`) use a stronger but still softened glyph mask.

Run the temporary internal capture probe:

```text
Ctrl+Alt+Comma
```

The capture probe logs whether GNOME Shell exposes an internal screenshot path to the extension and, if successful, writes a one-shot probe image under `/tmp/ascii-overlay-probe-*.png`.

Analyze the newest live probe capture as an ASCII reference frame:

```sh
scripts/analyze-latest-probe.sh
scripts/analyze-latest-probe.sh 8 120 --full-output latest-probe-ascii.txt
```

Summarize all benchmark screenshots:

```sh
scripts/analyze-benchmark-set.sh
```

Analyze edge detection only for a single screenshot:

```sh
scripts/analyze-edges.py screenshots/geometricshapes.png --cell-size 8 --max-cols 120
scripts/analyze-edges.py screenshots/geometricshapes.png --cell-size 8 --max-cols 120 --full-output screenshots/geometricshapes-edges.txt
```

Summarize edge density for the benchmark set:

```sh
scripts/analyze-edge-benchmark-set.sh
```

The edge analyzer follows the AcerolaFX structure more closely than the first live shader pass: by default it runs Difference of Gaussians preprocessing, runs Sobel over that edge source, quantizes source edge direction into `_`, `|`, `/`, and `\`, then uses an 8x8 local histogram to choose the dominant edge glyph per output cell. The default `hybrid` mode lets `atan2` build the cell histogram, but requires stricter tile-level confidence before accepting diagonal glyphs. It also rejects low-coherence cells where no direction clearly dominates, runs a small same-direction gap-connection pass, prunes weak unsupported cells, and removes connected edge islands smaller than five cells to improve line cohesion. Use `--edge-source raw` to compare against plain Sobel-on-luminance, which is often cleaner for perfect black-on-white geometry. Use `--angle-mode atan2` to compare against pure angle buckets, `--angle-mode ratio` to compare against the older direction heuristic, tune axis coherence with `--dominance-threshold` and `--dominance-margin`, tune diagonal acceptance with `--diagonal-dominance-threshold` and `--diagonal-margin-threshold`, tune gap bridging with `--connect-gaps` and `--connect-threshold`, disable small-island cleanup with `--min-component-size 0`, test stronger cleanup with `--min-component-size 8`, or test duplicate band thinning with `--thin-edges 1`.

Analyze the full ASCII pass with edge glyphs overlaid:

```sh
scripts/analyze-full.py screenshots/geometricshapes.png --cell-size 8 --max-cols 120
scripts/analyze-full.py screenshots/geometricshapes.png --cell-size 8 --max-cols 120 --full-output screenshots/geometricshapes-full.txt
```

The full analyzer now composites edges with confidence by default, so weak contour cells do not automatically replace the luminance ASCII glyph. It uses a moderate axis threshold and a stricter diagonal threshold so desktop texture does not become slash noise in the combined pass. Use `--edge-composite-threshold` to tune horizontal/vertical overlay strength, `--edge-diagonal-composite-threshold` to tune slash/backslash overlay strength, or `--edge-composite-mode replace` to compare against the older unconditional overlay.

Generate combined ASCII+edge previews and `*-full.txt` files for all benchmark screenshots:

```sh
scripts/analyze-full-benchmark-set.sh
```

When the overlay is enabled, the current live prototype refreshes in-memory stage content every 66ms without CPU texture readback. The overlay is temporarily hidden during each stage capture so it samples the desktop underneath instead of recursively capturing itself. The earlier `Cogl_Texture2D.get_data()` path remains available only for diagnostics because GNOME Shell returned all-zero pixel data in testing.

The capture probe also attempts to paint the captured stage content directly as a temporary GPU-side preview actor with the same GLSL ASCII fill/coherent-edge snippet. This tests whether GNOME Shell can render and modify the captured texture without CPU readback.

On Wayland, GNOME Shell usually needs a logout/login after installing a new extension for the first time. Existing extension code can often be refreshed by disabling/enabling the extension, but some GNOME Shell changes still require a new session.

## Original Grid Overlay

The early amber grid prototype is preserved as a separate local extension for screenshots and comparison:

```sh
scripts/install-original.sh
scripts/enable-original.sh
scripts/disable-original.sh
```

It uses the same runtime shortcuts as the ASCII overlay: `Ctrl+Alt+A` toggles the overlay and `Ctrl+Alt+Period` cycles the grid presets. `enable-original.sh` disables the ASCII overlay first so both extensions do not compete for the same shortcuts.
