# ASCII Desktop Overlay

GNOME Shell extension experiment for a hotkey-toggleable desktop ASCII overlay inspired by AcerolaFX.

## Development Workflow

The extension source lives in:

```text
extension/ascii-overlay@local
```

Install or refresh the local extension copy:

```sh
scripts/install-extension.sh
```

Enable the extension:

```sh
scripts/enable-extension.sh
```

Disable the extension:

```sh
scripts/disable-extension.sh
```

Check extension state:

```sh
scripts/status-extension.sh
```

Follow GNOME Shell logs:

```sh
scripts/logs.sh
```

The default overlay toggle shortcut is `Ctrl+Alt+A`. The current visual prototype is a procedural amber ASCII-cell renderer using the density ramp ` .:coPO?@#`. It uses deterministic test luminance for now, not live desktop sampling yet.

Cycle prototype grid presets while the overlay is active:

```text
Ctrl+Alt+Period
```

On Wayland, GNOME Shell usually needs a logout/login after installing a new extension for the first time. Existing extension code can often be refreshed by disabling/enabling the extension, but some GNOME Shell changes still require a new session.
