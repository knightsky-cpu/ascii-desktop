import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TOGGLE_SHORTCUT = 'toggle-shortcut';
const CYCLE_PRESET_SHORTCUT = 'cycle-preset-shortcut';
const MIN_CELL_SIZE = 4;

const GRID_PRESETS = [
    {
        name: 'original-fine',
        cellSize: 8,
        backgroundOpacity: 0.28,
        amberIntensity: 1.0,
    },
    {
        name: 'original-medium',
        cellSize: 16,
        backgroundOpacity: 0.4,
        amberIntensity: 1.6,
    },
    {
        name: 'original-large-strong',
        cellSize: 32,
        backgroundOpacity: 0.65,
        amberIntensity: 3.0,
    },
];

export default class OriginalGridOverlayExtension extends Extension {
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
            name: 'original-grid-overlay',
            reactive: false,
            can_focus: false,
        });
        this._overlayRepaintId = this._overlay.connect('repaint', () => {
            this._drawOriginalGrid();
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

    _drawOriginalGrid() {
        if (!this._overlay)
            return;

        const [width, height] = this._overlay.get_surface_size();
        const cr = this._overlay.get_context();
        const preset = this._getActiveGridPreset();
        const cellSize = Math.max(MIN_CELL_SIZE, preset.cellSize);
        const backgroundOpacity = preset.backgroundOpacity;
        const amberIntensity = preset.amberIntensity;

        cr.setSourceRGBA(0.06, 0.015, 0.0, backgroundOpacity);
        cr.rectangle(0, 0, width, height);
        cr.fill();

        this._drawCellWash(cr, width, height, cellSize, amberIntensity);
        this._drawCellGuides(cr, width, height, cellSize, amberIntensity);

        cr.$dispose();
    }

    _drawCellWash(cr, width, height, cellSize, amberIntensity) {
        const weakAlpha = 0.018 * amberIntensity;
        const strongAlpha = 0.042 * amberIntensity;

        for (let y = 0; y < height; y += cellSize) {
            for (let x = 0; x < width; x += cellSize) {
                const cellX = Math.floor(x / cellSize);
                const cellY = Math.floor(y / cellSize);
                const alpha = ((cellX + cellY) % 2 === 0) ? weakAlpha : strongAlpha;

                cr.setSourceRGBA(1.0, 0.62, 0.1, Math.min(0.22, alpha));
                cr.rectangle(x, y, cellSize, cellSize);
                cr.fill();
            }
        }
    }

    _drawCellGuides(cr, width, height, cellSize, amberIntensity) {
        cr.setLineWidth(1);
        cr.setSourceRGBA(1.0, 0.7, 0.22, 0.055 * amberIntensity);

        for (let x = 0.5; x < width; x += cellSize) {
            cr.moveTo(x, 0);
            cr.lineTo(x, height);
        }

        for (let y = 0.5; y < height; y += cellSize) {
            cr.moveTo(0, y);
            cr.lineTo(width, y);
        }

        cr.stroke();
    }
}
