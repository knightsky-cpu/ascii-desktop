import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TOGGLE_SHORTCUT = 'toggle-shortcut';
const CELL_SIZE = 8;

export default class AsciiOverlayExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._overlay = null;
        this._overlayRepaintId = null;
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

        if (this._settings.get_boolean('overlay-enabled'))
            this._showOverlay();

        console.log(`${this.metadata.uuid}: enabled`);
    }

    disable() {
        Main.wm.removeKeybinding(TOGGLE_SHORTCUT);

        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }

        this._destroyOverlay();
        console.log(`${this.metadata.uuid}: disabled`);
        this._settings = null;
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
        this._overlayRepaintId = this._overlay.connect(
            'repaint',
            () => this._drawGridPrototype()
        );

        Main.uiGroup.add_child(this._overlay);
        this._syncOverlayGeometry();
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

    _drawGridPrototype() {
        if (!this._overlay)
            return;

        const [width, height] = this._overlay.get_surface_size();
        const cr = this._overlay.get_context();

        cr.setSourceRGBA(0.06, 0.015, 0.0, 0.28);
        cr.rectangle(0, 0, width, height);
        cr.fill();

        for (let y = 0; y < height; y += CELL_SIZE) {
            for (let x = 0; x < width; x += CELL_SIZE) {
                const checker = ((x / CELL_SIZE) + (y / CELL_SIZE)) % 2 === 0;
                const alpha = checker ? 0.15 : 0.07;

                cr.setSourceRGBA(1.0, 0.52, 0.08, alpha);
                cr.rectangle(x, y, CELL_SIZE, CELL_SIZE);
                cr.fill();
            }
        }

        cr.setLineWidth(1);
        cr.setSourceRGBA(1.0, 0.7, 0.22, 0.18);

        for (let x = 0.5; x < width; x += CELL_SIZE) {
            cr.moveTo(x, 0);
            cr.lineTo(x, height);
        }

        for (let y = 0.5; y < height; y += CELL_SIZE) {
            cr.moveTo(0, y);
            cr.lineTo(width, y);
        }

        cr.stroke();
        cr.$dispose();
    }
}
