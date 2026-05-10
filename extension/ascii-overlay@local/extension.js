import Cairo from 'gi://cairo';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TOGGLE_SHORTCUT = 'toggle-shortcut';
const MIN_CELL_SIZE = 4;
const CYCLE_PRESET_SHORTCUT = 'cycle-preset-shortcut';
const ASCII_RAMP = ' .:coPO?@#';
const GRID_PRESETS = [
    {
        name: 'fine-ascii',
        cellSize: 8,
        backgroundOpacity: 0.28,
        amberIntensity: 1.0,
    },
    {
        name: 'medium-ascii',
        cellSize: 16,
        backgroundOpacity: 0.4,
        amberIntensity: 1.6,
    },
    {
        name: 'large-strong-ascii',
        cellSize: 32,
        backgroundOpacity: 0.65,
        amberIntensity: 3.0,
    },
];

export default class AsciiOverlayExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._overlay = null;
        this._overlayRepaintId = null;
        this._gridPresetIndex = 0;
        this._monitorsChangedId = Main.layoutManager.connect(
            'monitors-changed',
            () => this._syncOverlayGeometry()
        );

        Main.wm.addKeybinding(
            TOGGLE_SHORTCUT,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._toggleOverlay()
        );
        this._logShortcutRegistration(TOGGLE_SHORTCUT);

        Main.wm.addKeybinding(
            CYCLE_PRESET_SHORTCUT,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._cycleGridPreset()
        );
        this._logShortcutRegistration(CYCLE_PRESET_SHORTCUT);

        if (this._settings.get_boolean('overlay-enabled'))
            this._showOverlay();

        console.log(`${this.metadata.uuid}: enabled`);
    }

    disable() {
        Main.wm.removeKeybinding(TOGGLE_SHORTCUT);
        Main.wm.removeKeybinding(CYCLE_PRESET_SHORTCUT);

        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }

        this._destroyOverlay();
        console.log(`${this.metadata.uuid}: disabled`);
        this._settings = null;
    }

    _getActiveGridPreset() {
        return GRID_PRESETS[this._gridPresetIndex];
    }

    _cycleGridPreset() {
        this._gridPresetIndex = (this._gridPresetIndex + 1) % GRID_PRESETS.length;
        this._logActiveGridPreset('cycle-preset');
        this._queueOverlayRepaint();
    }

    _toggleOverlay() {
        const enabled = !this._settings.get_boolean('overlay-enabled');
        this._settings.set_boolean('overlay-enabled', enabled);

        if (enabled)
            this._showOverlay();
        else
            this._destroyOverlay();
    }

    _showOverlay() {
        if (this._overlay)
            return;

        this._overlay = new St.DrawingArea({
            name: 'ascii-overlay-debug',
            reactive: false,
            can_focus: false,
        });
        this._overlayRepaintId = this._overlay.connect('repaint', () => {
            this._drawAsciiPrototype();
        });

        Main.uiGroup.add_child(this._overlay);
        this._syncOverlayGeometry();
        this._logActiveGridPreset('show-overlay');
    }

    _destroyOverlay() {
        if (!this._overlay)
            return;

        if (this._overlayRepaintId) {
            this._overlay.disconnect(this._overlayRepaintId);
            this._overlayRepaintId = null;
        }

        this._overlay.destroy();
        this._overlay = null;
    }

    _syncOverlayGeometry() {
        if (!this._overlay)
            return;

        this._overlay.set_position(Main.uiGroup.x, Main.uiGroup.y);
        this._overlay.set_size(Main.uiGroup.width, Main.uiGroup.height);
        Main.uiGroup.set_child_above_sibling(this._overlay, null);
        this._overlay.queue_repaint();
    }

    _queueOverlayRepaint() {
        this._overlay?.queue_repaint();
    }

    _logShortcutRegistration(key) {
        console.log(
            `${this.metadata.uuid}: registered ${key} ` +
            `${JSON.stringify(this._settings.get_strv(key))}`
        );
    }

    _logActiveGridPreset(reason) {
        const preset = this._getActiveGridPreset();
        console.log(
            `${this.metadata.uuid}: ${reason} preset=${preset.name} ` +
            `cell-size=${preset.cellSize} ` +
            `background-opacity=${preset.backgroundOpacity} ` +
            `amber-intensity=${preset.amberIntensity}`
        );
    }

    _drawAsciiPrototype() {
        if (!this._overlay)
            return;

        const [width, height] = this._overlay.get_surface_size();
        const cr = this._overlay.get_context();
        const preset = this._getActiveGridPreset();
        const cellSize = Math.max(
            MIN_CELL_SIZE,
            preset.cellSize
        );
        const backgroundOpacity = preset.backgroundOpacity;
        const amberIntensity = preset.amberIntensity;

        cr.setSourceRGBA(0.06, 0.015, 0.0, backgroundOpacity);
        cr.rectangle(0, 0, width, height);
        cr.fill();

        for (let y = 0; y < height; y += cellSize) {
            for (let x = 0; x < width; x += cellSize) {
                const luminance = this._samplePrototypeLuminance(x, y, width, height, cellSize);
                const glyphIndex = Math.min(
                    ASCII_RAMP.length - 1,
                    Math.floor(luminance * ASCII_RAMP.length)
                );

                this._drawAsciiGlyph(cr, ASCII_RAMP[glyphIndex], x, y, cellSize, amberIntensity);
            }
        }

        cr.setLineWidth(1);
        cr.setSourceRGBA(1.0, 0.7, 0.22, 0.06 * amberIntensity);

        for (let x = 0.5; x < width; x += cellSize) {
            cr.moveTo(x, 0);
            cr.lineTo(x, height);
        }

        for (let y = 0.5; y < height; y += cellSize) {
            cr.moveTo(0, y);
            cr.lineTo(width, y);
        }

        cr.stroke();
        cr.$dispose();
    }

    _samplePrototypeLuminance(x, y, width, height, cellSize) {
        const gradient = (x / Math.max(1, width) * 0.65) + (y / Math.max(1, height) * 0.35);
        const cellX = Math.floor(x / cellSize);
        const cellY = Math.floor(y / cellSize);
        const wave = (Math.sin(cellX * 0.55) + Math.cos(cellY * 0.4)) * 0.12;
        const checker = ((cellX + cellY) % 2) * 0.08;

        return Math.max(0.0, Math.min(0.999, gradient + wave + checker));
    }

    _drawAsciiGlyph(cr, glyph, x, y, size, amberIntensity) {
        if (glyph === ' ')
            return;

        const fontSize = size * 0.95;

        cr.save();
        cr.selectFontFace('monospace', Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
        cr.setFontSize(fontSize);
        cr.setSourceRGBA(1.0, 0.62, 0.12, Math.min(1.0, 0.55 * amberIntensity));

        const extents = cr.textExtents(glyph);
        const textX = x + (size - extents.width) / 2 - extents.xBearing;
        const textY = y + (size - extents.height) / 2 - extents.yBearing;

        cr.moveTo(textX, textY);
        cr.showText(glyph);
        cr.restore();
    }
}
