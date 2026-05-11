import Cairo from 'gi://cairo';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const TOGGLE_SHORTCUT = 'toggle-shortcut';
const MIN_CELL_SIZE = 4;
const CYCLE_PRESET_SHORTCUT = 'cycle-preset-shortcut';
const CAPTURE_PROBE_SHORTCUT = 'capture-probe-shortcut';
const ASCII_RAMP = ' .:coPO?@#';
const LUMINANCE_CONTRAST = 1.0;
const LUMINANCE_GAMMA = 0.9;
const CAPTURE_INTERVAL_MS = 66;
const CAPTURE_STATS_LOG_EVERY = 30;
const READBACK_STATS_LOG_EVERY = 30;
const READBACK_PROBE_MAX_SAMPLES = 4096;
const STAGE_PREVIEW_DURATION_MS = 2500;
const GRID_PRESETS = [
    {
        name: 'fine-ascii',
        cellSize: 8,
        backgroundOpacity: 0.28,
        amberIntensity: 1.0,
        fontScale: 0.92,
    },
    {
        name: 'medium-ascii',
        cellSize: 16,
        backgroundOpacity: 0.4,
        amberIntensity: 1.6,
        fontScale: 0.9,
    },
    {
        name: 'large-strong-ascii',
        cellSize: 32,
        backgroundOpacity: 0.65,
        amberIntensity: 3.0,
        fontScale: 0.86,
    },
];

export default class AsciiOverlayExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._overlay = null;
        this._overlayRepaintId = null;
        this._overlayHasContent = false;
        this._captureLoopId = null;
        this._captureInFlight = false;
        this._captureGrid = null;
        this._captureFrameCount = 0;
        this._captureTotalMs = 0;
        this._captureMaxMs = 0;
        this._readbackStatsCount = 0;
        this._stagePreviewActor = null;
        this._stagePreviewTimeoutId = null;
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

        Main.wm.addKeybinding(
            CAPTURE_PROBE_SHORTCUT,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._runCaptureProbe()
        );
        this._logShortcutRegistration(CAPTURE_PROBE_SHORTCUT);

        if (this._settings.get_boolean('overlay-enabled'))
            this._showOverlay();

        console.log(`${this.metadata.uuid}: enabled`);
    }

    disable() {
        Main.wm.removeKeybinding(TOGGLE_SHORTCUT);
        Main.wm.removeKeybinding(CYCLE_PRESET_SHORTCUT);
        Main.wm.removeKeybinding(CAPTURE_PROBE_SHORTCUT);

        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }

        this._destroyOverlay();
        this._destroyStagePreview();
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
        const enabled = !this._overlay;
        this._settings.set_boolean('overlay-enabled', enabled);
        console.log(
            `${this.metadata.uuid}: toggle-overlay ` +
            `target=${enabled ? 'on' : 'off'} actor-present=${Boolean(this._overlay)}`
        );

        if (enabled)
            this._showOverlay();
        else
            this._destroyOverlay();
    }

    _showOverlay() {
        if (this._overlay)
            return;

        this._overlay = new Clutter.Actor({
            name: 'ascii-overlay-gpu',
            reactive: false,
            opacity: 230,
        });
        this._overlay.hide();
        this._overlayHasContent = false;
        this._applyGpuOverlayEffect(this._overlay);

        Main.uiGroup.add_child(this._overlay);
        this._syncOverlayGeometry();
        this._startCaptureLoop();
        this._logActiveGridPreset('show-overlay');
    }

    _destroyOverlay() {
        if (!this._overlay)
            return;

        this._stopCaptureLoop();
        this._overlay.destroy();
        this._overlay = null;
        this._overlayHasContent = false;
        console.log(`${this.metadata.uuid}: hide-overlay`);
    }

    _syncOverlayGeometry() {
        if (!this._overlay)
            return;

        this._overlay.set_position(Main.uiGroup.x, Main.uiGroup.y);
        this._overlay.set_size(Main.uiGroup.width, Main.uiGroup.height);
        Main.uiGroup.set_child_above_sibling(this._overlay, null);
    }

    _queueOverlayRepaint() {
        this._overlay?.queue_redraw?.();
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
            `amber-intensity=${preset.amberIntensity} ` +
            `font-scale=${preset.fontScale}`
        );
    }

    _runCaptureProbe() {
        const probePath = GLib.build_filenamev([
            GLib.get_tmp_dir(),
            `ascii-overlay-probe-${Date.now()}.png`,
        ]);

        console.log(`${this.metadata.uuid}: capture-probe start path=${probePath}`);

        if (!Shell.Screenshot) {
            console.log(`${this.metadata.uuid}: capture-probe unavailable Shell.Screenshot missing`);
            return;
        }

        let screenshot;
        try {
            screenshot = new Shell.Screenshot();
        } catch (error) {
            console.log(`${this.metadata.uuid}: capture-probe construct-failed ${error}`);
            return;
        }

        const methods = this._listPrototypeMethods(screenshot).join(',');
        console.log(`${this.metadata.uuid}: capture-probe methods=${methods}`);

        if (typeof screenshot.screenshot !== 'function') {
            console.log(`${this.metadata.uuid}: capture-probe unavailable screenshot() missing`);
            return;
        }

        this._runStageContentProbe(screenshot);

        const file = Gio.File.new_for_path(probePath);
        let stream;

        try {
            stream = file.replace(
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (error) {
            console.log(`${this.metadata.uuid}: capture-probe stream-failed ${error}`);
            return;
        }

        try {
            const result = screenshot.screenshot(false, stream, (_source, asyncResult) => {
                this._finishCaptureProbe(screenshot, stream, asyncResult, probePath);
            });

            if (result !== undefined) {
                this._closeCaptureProbeStream(stream);
                this._logCaptureProbeResult(result, probePath, 'sync');
            }
        } catch (error) {
            this._closeCaptureProbeStream(stream);
            console.log(`${this.metadata.uuid}: capture-probe call-failed ${error}`);
        }
    }

    _runStageContentProbe(screenshot) {
        if (typeof screenshot.screenshot_stage_to_content !== 'function') {
            console.log(`${this.metadata.uuid}: stage-content-probe unavailable screenshot_stage_to_content() missing`);
            return;
        }

        try {
            screenshot.screenshot_stage_to_content((_source, asyncResult) => {
                this._finishStageContentProbe(screenshot, asyncResult);
            });
        } catch (error) {
            console.log(`${this.metadata.uuid}: stage-content-probe call-failed ${error}`);
        }
    }

    _finishStageContentProbe(screenshot, asyncResult) {
        try {
            const result = screenshot.screenshot_stage_to_content_finish(asyncResult);
            const summary = this._summarizeProbeValue(result);
            console.log(`${this.metadata.uuid}: stage-content-probe result=${summary}`);
            this._inspectStageContentProbeResult(result);
            this._showStageContentPreview(result);
        } catch (error) {
            console.log(`${this.metadata.uuid}: stage-content-probe finish-failed ${error}`);
        }
    }

    _showStageContentPreview(result) {
        const content = Array.isArray(result) ? result[0] : result;

        if (!content || typeof content.get_texture !== 'function') {
            console.log(`${this.metadata.uuid}: stage-preview unavailable missing-content`);
            return;
        }

        this._destroyStagePreview();

        try {
            this._stagePreviewActor = new Clutter.Actor({
                name: 'ascii-overlay-stage-preview',
                reactive: false,
                opacity: 220,
                content,
            });
            this._applyStagePreviewEffect(this._stagePreviewActor);

            const previewWidth = Math.min(640, Math.max(320, Math.floor(Main.uiGroup.width * 0.22)));
            const previewHeight = Math.floor(previewWidth * (9 / 16));

            this._stagePreviewActor.set_position(24, 24);
            this._stagePreviewActor.set_size(previewWidth, previewHeight);
            Main.uiGroup.add_child(this._stagePreviewActor);
            Main.uiGroup.set_child_above_sibling(this._stagePreviewActor, null);

            this._stagePreviewTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                STAGE_PREVIEW_DURATION_MS,
                () => {
                    this._destroyStagePreview();
                    return GLib.SOURCE_REMOVE;
                }
            );

            console.log(
                `${this.metadata.uuid}: stage-preview shown ` +
                `size=${previewWidth}x${previewHeight} duration-ms=${STAGE_PREVIEW_DURATION_MS}`
            );
        } catch (error) {
            this._destroyStagePreview();
            console.log(`${this.metadata.uuid}: stage-preview failed ${error}`);
        }
    }

    _applyStagePreviewEffect(actor) {
        try {
            const glsl = new Shell.GLSLEffect();
            glsl.add_glsl_snippet(
                Cogl.SnippetHook.FRAGMENT,
                '',
                'cogl_color_out = vec4(1.0 - cogl_color_out.rgb, cogl_color_out.a);',
                false
            );
            actor.add_effect_with_name('ascii-overlay-glsl-invert-probe', glsl);

            console.log(`${this.metadata.uuid}: stage-preview effects applied glsl=invert`);
        } catch (error) {
            console.log(`${this.metadata.uuid}: stage-preview effects failed ${error}`);
        }
    }

    _applyGpuOverlayEffect(actor) {
        try {
            const glsl = new Shell.GLSLEffect();
            glsl.add_glsl_snippet(
                Cogl.SnippetHook.FRAGMENT,
                '',
                'cogl_color_out = vec4(1.0 - cogl_color_out.rgb, cogl_color_out.a);',
                false
            );
            actor.add_effect_with_name('ascii-overlay-gpu-glsl-invert', glsl);

            console.log(`${this.metadata.uuid}: gpu-overlay effects applied glsl=invert`);
        } catch (error) {
            console.log(`${this.metadata.uuid}: gpu-overlay effects failed ${error}`);
        }
    }

    _destroyStagePreview() {
        if (this._stagePreviewTimeoutId) {
            GLib.source_remove(this._stagePreviewTimeoutId);
            this._stagePreviewTimeoutId = null;
        }

        if (this._stagePreviewActor) {
            this._stagePreviewActor.destroy();
            this._stagePreviewActor = null;
        }
    }

    _inspectStageContentProbeResult(result) {
        const values = Array.isArray(result) ? result : [result];

        values.forEach((value, index) => {
            if (!value || typeof value !== 'object')
                return;

            if (typeof value.get_preferred_size === 'function') {
                try {
                    console.log(
                        `${this.metadata.uuid}: stage-content-probe content[${index}] ` +
                        `preferred-size=${JSON.stringify(value.get_preferred_size())}`
                    );
                } catch (error) {
                    console.log(
                        `${this.metadata.uuid}: stage-content-probe content[${index}] ` +
                        `preferred-size-failed ${error}`
                    );
                }
            }

            if (typeof value.get_texture === 'function')
                this._inspectStageTexture(value, index);
        });
    }

    _inspectStageTexture(content, index) {
        let texture;

        try {
            texture = content.get_texture();
        } catch (error) {
            console.log(`${this.metadata.uuid}: stage-content-probe texture[${index}] get-failed ${error}`);
            return;
        }

        if (!texture) {
            console.log(`${this.metadata.uuid}: stage-content-probe texture[${index}] missing`);
            return;
        }

        const constructorName = texture.constructor?.name ?? 'unknown';
        const methods = this._listPrototypeMethods(texture)
            .filter(name => (
                name.includes('width') ||
                name.includes('height') ||
                name.includes('size') ||
                name.includes('data') ||
                name.includes('pixel') ||
                name.includes('read') ||
                name.includes('download') ||
                name.includes('format') ||
                name.includes('texture')
            ))
            .join(',');

        console.log(
            `${this.metadata.uuid}: stage-content-probe texture[${index}] ` +
            `type=${constructorName} methods=${methods}`
        );

        for (const method of ['get_width', 'get_height']) {
            if (typeof texture[method] !== 'function')
                continue;

            try {
                console.log(
                    `${this.metadata.uuid}: stage-content-probe texture[${index}] ` +
                    `${method}=${texture[method]()}`
                );
            } catch (error) {
                console.log(
                    `${this.metadata.uuid}: stage-content-probe texture[${index}] ` +
                    `${method}-failed ${error}`
                );
            }
        }

        this._probeTextureReadback(texture, index);
    }

    _probeTextureReadback(texture, index) {
        if (typeof texture.is_get_data_supported === 'function') {
            try {
                console.log(
                    `${this.metadata.uuid}: stage-content-probe texture[${index}] ` +
                    `is_get_data_supported=${texture.is_get_data_supported()}`
                );
            } catch (error) {
                console.log(
                    `${this.metadata.uuid}: stage-content-probe texture[${index}] ` +
                    `is_get_data_supported-failed ${error}`
                );
            }
        }

        if (typeof texture.get_format === 'function') {
            try {
                const format = texture.get_format();
                console.log(
                    `${this.metadata.uuid}: stage-content-probe texture[${index}] ` +
                    `format=${this._pixelFormatToString(format)}`
                );
            } catch (error) {
                console.log(
                    `${this.metadata.uuid}: stage-content-probe texture[${index}] ` +
                    `format-failed ${error}`
                );
            }
        }

        if (typeof texture.get_data !== 'function' ||
            typeof texture.get_width !== 'function' ||
            typeof texture.get_height !== 'function')
            return;

        try {
            const width = texture.get_width();
            const height = texture.get_height();
            const rowstride = width * 4;
            const data = new Uint8Array(rowstride * height);
            const bytesRead = texture.get_data(Cogl.PixelFormat.RGBA_8888, rowstride, data);
            const sample = Array.from(data.slice(0, 16)).join(',');

            console.log(
                `${this.metadata.uuid}: stage-content-probe texture[${index}] ` +
                `get-data bytes=${bytesRead} buffer=${data.length} rowstride=${rowstride} sample=${sample}`
            );
        } catch (error) {
            console.log(`${this.metadata.uuid}: stage-content-probe texture[${index}] get-data-failed ${error}`);
        }

        this._probeReadbackFormats(texture, index);
    }

    _pixelFormatToString(format) {
        try {
            if (Cogl.PixelFormat.to_string)
                return Cogl.PixelFormat.to_string(format);
        } catch (_error) {
            // Fall through to numeric output.
        }

        return String(format);
    }

    _probeReadbackFormats(texture, index) {
        if (index !== 0)
            return;

        const formats = this._getReadbackProbeFormats(texture);

        for (const { label, format } of formats) {
            try {
                const stats = this._readTextureProbeStats(texture, format);
                console.log(
                    `${this.metadata.uuid}: readback-format-probe texture[${index}] ` +
                    `format=${label} bytes=${stats.bytesRead} sample-count=${stats.sampleCount} ` +
                    `nonzero-bytes=${stats.nonzeroBytes} nonzero-alpha=${stats.nonzeroAlpha} ` +
                    `min=${stats.minLuminance.toFixed(4)} max=${stats.maxLuminance.toFixed(4)} ` +
                    `avg=${stats.avgLuminance.toFixed(4)} first-nonzero=${JSON.stringify(stats.firstNonzero)}`
                );
            } catch (error) {
                console.log(
                    `${this.metadata.uuid}: readback-format-probe texture[${index}] ` +
                    `format=${label} failed ${error}`
                );
            }
        }
    }

    _getReadbackProbeFormats(texture) {
        const formats = [];

        if (typeof texture.get_format === 'function') {
            try {
                const nativeFormat = texture.get_format();
                formats.push({
                    label: `native:${this._pixelFormatToString(nativeFormat)}`,
                    format: nativeFormat,
                });
            } catch (_error) {
                // Continue with explicit formats.
            }
        }

        for (const name of ['RGBA_8888_PRE', 'RGBA_8888', 'BGRA_8888_PRE', 'ARGB_8888_PRE']) {
            if (Cogl.PixelFormat[name] === undefined)
                continue;

            formats.push({
                label: name,
                format: Cogl.PixelFormat[name],
            });
        }

        const seen = new Set();
        return formats.filter(({ label, format }) => {
            const key = `${label}:${format}`;
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
    }

    _readTextureProbeStats(texture, format) {
        const width = texture.get_width();
        const height = texture.get_height();
        const rowstride = width * 4;
        const data = new Uint8Array(rowstride * height);
        const bytesRead = texture.get_data(format, rowstride, data);
        const step = Math.max(1, Math.floor((width * height) / READBACK_PROBE_MAX_SAMPLES));
        const sampleCount = Math.ceil((width * height) / step);
        let nonzeroBytes = 0;
        let nonzeroAlpha = 0;
        let minLuminance = 1.0;
        let maxLuminance = 0.0;
        let totalLuminance = 0.0;
        let firstNonzero = null;
        let sampled = 0;

        for (let pixel = 0; pixel < width * height; pixel += step) {
            const y = Math.floor(pixel / width);
            const x = pixel % width;
            const offset = (y * rowstride) + (x * 4);
            const r = data[offset];
            const g = data[offset + 1];
            const b = data[offset + 2];
            const a = data[offset + 3];
            const luminance = ((0.2127 * r) + (0.7152 * g) + (0.0722 * b)) / 255.0;

            if (r || g || b || a) {
                nonzeroBytes++;
                if (!firstNonzero)
                    firstNonzero = { x, y, r, g, b, a, luminance };
            }
            if (a)
                nonzeroAlpha++;

            minLuminance = Math.min(minLuminance, luminance);
            maxLuminance = Math.max(maxLuminance, luminance);
            totalLuminance += luminance;
            sampled++;
        }

        return {
            bytesRead,
            sampleCount,
            nonzeroBytes,
            nonzeroAlpha,
            minLuminance,
            maxLuminance,
            avgLuminance: totalLuminance / Math.max(1, sampled),
            firstNonzero,
        };
    }

    _summarizeProbeValue(value) {
        if (Array.isArray(value))
            return `[${value.map(item => this._summarizeProbeValue(item)).join(',')}]`;

        if (value === null)
            return 'null';

        if (value === undefined)
            return 'undefined';

        const type = typeof value;

        if (type !== 'object')
            return `${type}:${String(value)}`;

        const constructorName = value.constructor?.name ?? 'unknown';
        const methods = this._listPrototypeMethods(value)
            .filter(name => (
                name.includes('content') ||
                name.includes('texture') ||
                name.includes('size') ||
                name.includes('width') ||
                name.includes('height') ||
                name.includes('paint') ||
                name.includes('node')
            ))
            .join(',');

        return `object:${constructorName}{methods=${methods}}`;
    }

    _finishCaptureProbe(screenshot, stream, asyncResult, probePath) {
        try {
            const finishResult = screenshot.screenshot_finish(asyncResult);
            this._closeCaptureProbeStream(stream);
            this._logCaptureProbeResult(finishResult, probePath, 'callback');
        } catch (error) {
            this._closeCaptureProbeStream(stream);
            console.log(`${this.metadata.uuid}: capture-probe finish-failed ${error}`);
        }
    }

    _closeCaptureProbeStream(stream) {
        try {
            stream.close(null);
        } catch (error) {
            console.log(`${this.metadata.uuid}: capture-probe stream-close-failed ${error}`);
        }
    }

    _logCaptureProbeResult(result, probePath, mode) {
        const file = Gio.File.new_for_path(probePath);
        let size = -1;

        try {
            const info = file.query_info(
                Gio.FILE_ATTRIBUTE_STANDARD_SIZE,
                Gio.FileQueryInfoFlags.NONE,
                null
            );
            size = info.get_size();
        } catch (_error) {
            size = -1;
        }

        console.log(
            `${this.metadata.uuid}: capture-probe ${mode} ` +
            `result=${JSON.stringify(result)} path=${probePath} size=${size}`
        );
    }

    _listPrototypeMethods(instance) {
        const names = new Set();
        let prototype = Object.getPrototypeOf(instance);

        while (prototype && prototype !== Object.prototype) {
            for (const name of Object.getOwnPropertyNames(prototype)) {
                if (typeof instance[name] === 'function')
                    names.add(name);
            }
            prototype = Object.getPrototypeOf(prototype);
        }

        return [...names].sort();
    }

    _startCaptureLoop() {
        if (this._captureLoopId)
            return;

        this._queueCaptureFrame();
        this._captureLoopId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            CAPTURE_INTERVAL_MS,
            () => {
                this._queueCaptureFrame();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _stopCaptureLoop() {
        if (this._captureLoopId) {
            GLib.source_remove(this._captureLoopId);
            this._captureLoopId = null;
        }

        this._captureInFlight = false;
        this._captureGrid = null;
        this._overlayHasContent = false;
        this._captureFrameCount = 0;
        this._captureTotalMs = 0;
        this._captureMaxMs = 0;
        this._readbackStatsCount = 0;
    }

    _queueCaptureFrame() {
        if (!this._overlay || this._captureInFlight || !Shell.Screenshot)
            return;

        const [width, height] = this._getOverlaySize();
        if (width <= 0 || height <= 0)
            return;

        const preset = this._getActiveGridPreset();
        const cellSize = Math.max(MIN_CELL_SIZE, preset.cellSize);
        const cols = Math.max(1, Math.floor(width / cellSize));
        const rows = Math.max(1, Math.floor(height / cellSize));
        const startedAt = GLib.get_monotonic_time();

        let screenshot;
        try {
            screenshot = new Shell.Screenshot();
        } catch (error) {
            console.log(`${this.metadata.uuid}: live-capture construct-failed ${error}`);
            return;
        }

        if (typeof screenshot.screenshot_stage_to_content !== 'function') {
            console.log(`${this.metadata.uuid}: live-capture stage-content-unavailable`);
            return;
        }

        this._captureInFlight = true;
        const shouldShowAfterCapture = this._overlay.visible || !this._overlayHasContent;

        try {
            this._overlay.hide();
            screenshot.screenshot_stage_to_content((_source, asyncResult) => {
                this._finishLiveCapture(
                    screenshot,
                    asyncResult,
                    cols,
                    rows,
                    cellSize,
                    startedAt,
                    shouldShowAfterCapture
                );
            });
        } catch (error) {
            if (shouldShowAfterCapture)
                this._overlay?.show();
            this._captureInFlight = false;
            console.log(`${this.metadata.uuid}: live-capture call-failed ${error}`);
        }
    }

    _finishLiveCapture(screenshot, asyncResult, cols, rows, cellSize, startedAt, shouldShowAfterCapture) {
        try {
            const result = screenshot.screenshot_stage_to_content_finish(asyncResult);
            const content = Array.isArray(result) ? result[0] : result;

            if (this._overlay && content) {
                const hadContent = this._overlayHasContent;
                this._overlay.set_content(content);
                this._overlayHasContent = true;
                this._syncOverlayGeometry();

                if (!hadContent) {
                    this._overlay.show();
                    console.log(`${this.metadata.uuid}: live-capture content-ready visible=true`);
                }
            } else if (!this._overlay)
                console.log(`${this.metadata.uuid}: live-capture skipped overlay-destroyed`);
            else
                console.log(`${this.metadata.uuid}: live-capture missing-content`);
        } catch (error) {
            console.log(`${this.metadata.uuid}: live-capture finish-failed ${error}`);
        } finally {
            if (shouldShowAfterCapture)
                this._overlay?.show();
            this._recordCaptureTiming(startedAt, cols, rows);
            this._captureInFlight = false;
        }
    }

    _recordCaptureTiming(startedAt, cols, rows) {
        const elapsedMs = (GLib.get_monotonic_time() - startedAt) / 1000.0;
        this._captureFrameCount++;
        this._captureTotalMs += elapsedMs;
        this._captureMaxMs = Math.max(this._captureMaxMs, elapsedMs);

        if (this._captureFrameCount % CAPTURE_STATS_LOG_EVERY !== 0)
            return;

        const averageMs = this._captureTotalMs / this._captureFrameCount;
        console.log(
            `${this.metadata.uuid}: live-capture stats ` +
            `frames=${this._captureFrameCount} interval-ms=${CAPTURE_INTERVAL_MS} ` +
            `grid=${cols}x${rows} avg-ms=${averageMs.toFixed(2)} max-ms=${this._captureMaxMs.toFixed(2)}`
        );
    }

    _decodeStageContentGrid(stageResult, cols, rows, cellSize) {
        const content = Array.isArray(stageResult) ? stageResult[0] : stageResult;
        const texture = content?.get_texture?.();

        if (!texture)
            throw new Error('stage content did not return a texture');

        if (typeof texture.is_get_data_supported === 'function' && !texture.is_get_data_supported())
            throw new Error('texture get_data is not supported');

        const width = texture.get_width();
        const height = texture.get_height();
        const rowstride = width * 4;
        const pixels = new Uint8Array(rowstride * height);
        const bytesRead = texture.get_data(Cogl.PixelFormat.RGBA_8888, rowstride, pixels);

        if (bytesRead <= 0)
            throw new Error(`texture get_data returned ${bytesRead}`);

        const values = new Float32Array(cols * rows);
        const xScale = width / cols;
        const yScale = height / rows;
        let minLuminance = 1.0;
        let maxLuminance = 0.0;
        let totalLuminance = 0.0;
        let zeroAlphaSamples = 0;
        let firstSample = null;

        for (let row = 0; row < rows; row++) {
            const sourceY = Math.min(height - 1, Math.floor((row + 0.5) * yScale));
            for (let col = 0; col < cols; col++) {
                const sourceX = Math.min(width - 1, Math.floor((col + 0.5) * xScale));
                const offset = (sourceY * rowstride) + (sourceX * 4);
                const r = pixels[offset];
                const g = pixels[offset + 1];
                const b = pixels[offset + 2];
                const a = pixels[offset + 3];
                const luminance = ((0.2127 * r) + (0.7152 * g) + (0.0722 * b)) / 255.0;

                if (!firstSample)
                    firstSample = { sourceX, sourceY, r, g, b, a, luminance };
                if (a === 0)
                    zeroAlphaSamples++;

                minLuminance = Math.min(minLuminance, luminance);
                maxLuminance = Math.max(maxLuminance, luminance);
                totalLuminance += luminance;
                values[(row * cols) + col] = luminance;
            }
        }

        this._logReadbackStats({
            width,
            height,
            cols,
            rows,
            bytesRead,
            minLuminance,
            maxLuminance,
            avgLuminance: totalLuminance / Math.max(1, cols * rows),
            zeroAlphaSamples,
            firstSample,
        });

        return { cols, rows, cellSize, values };
    }

    _logReadbackStats(stats) {
        this._readbackStatsCount++;

        if (this._readbackStatsCount % READBACK_STATS_LOG_EVERY !== 1)
            return;

        console.log(
            `${this.metadata.uuid}: live-readback stats ` +
            `texture=${stats.width}x${stats.height} grid=${stats.cols}x${stats.rows} ` +
            `bytes=${stats.bytesRead} min=${stats.minLuminance.toFixed(4)} ` +
            `max=${stats.maxLuminance.toFixed(4)} avg=${stats.avgLuminance.toFixed(4)} ` +
            `zero-alpha=${stats.zeroAlphaSamples} first=${JSON.stringify(stats.firstSample)}`
        );
    }

    _getOverlaySize() {
        if (!this._overlay)
            return [0, 0];

        const width = Math.floor(this._overlay.width || Main.uiGroup.width || 0);
        const height = Math.floor(this._overlay.height || Main.uiGroup.height || 0);

        return [width, height];
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
        const fontScale = preset.fontScale;

        cr.setSourceRGBA(0.06, 0.015, 0.0, backgroundOpacity);
        cr.rectangle(0, 0, width, height);
        cr.fill();

        this._drawCellGuides(cr, width, height, cellSize, amberIntensity);

        for (let y = 0; y < height; y += cellSize) {
            for (let x = 0; x < width; x += cellSize) {
                const luminance = this._sampleOverlayLuminance(x, y, width, height, cellSize);

                this._drawAsciiGlyph(
                    cr,
                    this._luminanceToGlyph(luminance),
                    x,
                    y,
                    cellSize,
                    amberIntensity,
                    fontScale
                );
            }
        }

        cr.$dispose();
    }

    _sampleOverlayLuminance(x, y, width, height, cellSize) {
        const grid = this._captureGrid;

        if (grid && grid.cellSize === cellSize) {
            const col = Math.min(grid.cols - 1, Math.floor(x / cellSize));
            const row = Math.min(grid.rows - 1, Math.floor(y / cellSize));
            return grid.values[(row * grid.cols) + col];
        }

        return this._samplePrototypeLuminance(x, y, width, height, cellSize);
    }

    _clamp(value, minValue = 0.0, maxValue = 1.0) {
        return Math.max(minValue, Math.min(maxValue, value));
    }

    _adjustLuminance(luminance) {
        const contrasted = this._clamp(
            ((luminance - 0.5) * LUMINANCE_CONTRAST) + 0.5
        );

        return this._clamp(Math.pow(contrasted, LUMINANCE_GAMMA));
    }

    _luminanceToGlyph(luminance) {
        const adjusted = this._adjustLuminance(luminance);
        const glyphIndex = Math.min(
            ASCII_RAMP.length - 1,
            Math.floor(adjusted * ASCII_RAMP.length)
        );

        return ASCII_RAMP[glyphIndex];
    }

    _drawCellGuides(cr, width, height, cellSize, amberIntensity) {
        cr.setLineWidth(1);
        cr.setSourceRGBA(1.0, 0.7, 0.22, 0.025 * amberIntensity);

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

    _samplePrototypeLuminance(x, y, width, height, cellSize) {
        const gradient = (x / Math.max(1, width) * 0.65) + (y / Math.max(1, height) * 0.35);
        const cellX = Math.floor(x / cellSize);
        const cellY = Math.floor(y / cellSize);
        const wave = (Math.sin(cellX * 0.55) + Math.cos(cellY * 0.4)) * 0.12;
        const checker = ((cellX + cellY) % 2) * 0.08;

        return Math.max(0.0, Math.min(0.999, gradient + wave + checker));
    }

    _drawAsciiGlyph(cr, glyph, x, y, size, amberIntensity, fontScale) {
        if (glyph === ' ')
            return;

        const fontSize = size * fontScale;

        cr.save();
        cr.selectFontFace('monospace', Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
        cr.setFontSize(fontSize);
        cr.setSourceRGBA(1.0, 0.64, 0.14, Math.min(1.0, 0.68 * amberIntensity));

        const extents = cr.textExtents(glyph);
        const textX = x + (size - extents.width) / 2 - extents.xBearing;
        const textY = y + (size - extents.height) / 2 - extents.yBearing - (size * 0.03);

        cr.moveTo(textX, textY);
        cr.showText(glyph);
        cr.restore();
    }
}
