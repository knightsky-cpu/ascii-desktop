import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TOGGLE_SHORTCUT = 'toggle-shortcut';

export default class AsciiOverlayExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._overlay = null;
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

        this._overlay = new St.Widget({
            name: 'ascii-overlay-debug',
            reactive: false,
            can_focus: false,
            style: 'background-color: rgba(255, 132, 32, 0.26);',
        });

        Main.uiGroup.add_child(this._overlay);
        this._syncOverlayGeometry();
    }

    _destroyOverlay() {
        if (!this._overlay)
            return;

        this._overlay.destroy();
        this._overlay = null;
    }

    _syncOverlayGeometry() {
        if (!this._overlay)
            return;

        this._overlay.set_position(Main.uiGroup.x, Main.uiGroup.y);
        this._overlay.set_size(Main.uiGroup.width, Main.uiGroup.height);
        Main.uiGroup.set_child_above_sibling(this._overlay, null);
    }
}
