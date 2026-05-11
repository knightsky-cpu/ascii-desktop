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
const MIN_CELL_SIZE = 1;
const CYCLE_PRESET_SHORTCUT = 'cycle-preset-shortcut';
const CYCLE_STYLE_SHORTCUT = 'cycle-style-shortcut';
const CAPTURE_PROBE_SHORTCUT = 'capture-probe-shortcut';
const ASCII_RAMP = ' .:coPO?@#';
const LUMINANCE_CONTRAST = 1.0;
const LUMINANCE_GAMMA = 0.9;
const CAPTURE_INTERVAL_MS = 66;
const CAPTURE_STATS_LOG_EVERY = 30;
const READBACK_STATS_LOG_EVERY = 30;
const READBACK_PROBE_MAX_SAMPLES = 4096;
const STAGE_PREVIEW_DURATION_MS = 2500;
const STYLE_GRID_SUPPRESS_US = 250000;
const ASCII_FILL_SNIPPET_TEMPLATE = `
vec2 gridSize = vec2(__GRID_COLS__.0, __GRID_ROWS__.0);
vec2 cell = cogl_tex_coord0_in.xy * gridSize;
vec2 local = fract(cell);
vec2 cellUv = (floor(cell) + vec2(0.5, 0.5)) / gridSize;
vec4 cellColor = texture2D(cogl_sampler0, cellUv);
float luminance = dot(cellColor.rgb, vec3(0.2126, 0.7152, 0.0722));
float exposed = pow(clamp((luminance * 1.35) + 0.08, 0.0, 0.999), 0.72);
float bucket = floor(exposed * 10.0);
float level = bucket / 9.0;
vec2 texel = 1.0 / gridSize;
vec2 leftUv = clamp(cellUv + vec2(-texel.x, 0.0), vec2(0.0), vec2(1.0));
vec2 rightUv = clamp(cellUv + vec2(texel.x, 0.0), vec2(0.0), vec2(1.0));
vec2 topUv = clamp(cellUv + vec2(0.0, -texel.y), vec2(0.0), vec2(1.0));
vec2 bottomUv = clamp(cellUv + vec2(0.0, texel.y), vec2(0.0), vec2(1.0));
vec2 topLeftUv = clamp(cellUv + vec2(-texel.x, -texel.y), vec2(0.0), vec2(1.0));
vec2 topRightUv = clamp(cellUv + vec2(texel.x, -texel.y), vec2(0.0), vec2(1.0));
vec2 bottomLeftUv = clamp(cellUv + vec2(-texel.x, texel.y), vec2(0.0), vec2(1.0));
vec2 bottomRightUv = clamp(cellUv + vec2(texel.x, texel.y), vec2(0.0), vec2(1.0));
float lumLeft = dot(texture2D(cogl_sampler0, leftUv).rgb, vec3(0.2126, 0.7152, 0.0722));
float lumRight = dot(texture2D(cogl_sampler0, rightUv).rgb, vec3(0.2126, 0.7152, 0.0722));
float lumTop = dot(texture2D(cogl_sampler0, topUv).rgb, vec3(0.2126, 0.7152, 0.0722));
float lumBottom = dot(texture2D(cogl_sampler0, bottomUv).rgb, vec3(0.2126, 0.7152, 0.0722));
float lumTopLeft = dot(texture2D(cogl_sampler0, topLeftUv).rgb, vec3(0.2126, 0.7152, 0.0722));
float lumTopRight = dot(texture2D(cogl_sampler0, topRightUv).rgb, vec3(0.2126, 0.7152, 0.0722));
float lumBottomLeft = dot(texture2D(cogl_sampler0, bottomLeftUv).rgb, vec3(0.2126, 0.7152, 0.0722));
float lumBottomRight = dot(texture2D(cogl_sampler0, bottomRightUv).rgb, vec3(0.2126, 0.7152, 0.0722));
float localMean = (
    lumTopLeft + lumTop + lumTopRight +
    lumLeft + luminance + lumRight +
    lumBottomLeft + lumBottom + lumBottomRight
) / 9.0;
float dogContrast = clamp(abs(luminance - localMean) * 4.0, 0.0, 1.0);
float gradientX = (lumTopRight + (2.0 * lumRight) + lumBottomRight) - (lumTopLeft + (2.0 * lumLeft) + lumBottomLeft);
float gradientY = (lumBottomLeft + (2.0 * lumBottom) + lumBottomRight) - (lumTopLeft + (2.0 * lumTop) + lumTopRight);
float gradientMagnitude = length(vec2(gradientX, gradientY));
float absGradientX = abs(gradientX);
float absGradientY = abs(gradientY);
float majorGradient = max(absGradientX, absGradientY);
float minorGradient = min(absGradientX, absGradientY);
float axisDominance = majorGradient / max(0.0001, absGradientX + absGradientY);
float axisMargin = (majorGradient - minorGradient) / max(0.0001, absGradientX + absGradientY);
float diagonalBalance = 1.0 - axisMargin;
float directionCoherence = max(
    smoothstep(0.58, 0.78, axisDominance),
    smoothstep(0.42, 0.62, diagonalBalance)
);
float dogGate = smoothstep(0.025, 0.11, dogContrast);
float edgeStrength = smoothstep(0.62, 1.12, gradientMagnitude) * dogGate * directionCoherence;

float dotBottom = 1.0 - smoothstep(0.09, 0.13, distance(local, vec2(0.5, 0.76)));
float dotTop = 1.0 - smoothstep(0.08, 0.12, distance(local, vec2(0.5, 0.38)));
float ringDistance = distance(local, vec2(0.5, 0.5));
float outerRing = 1.0 - smoothstep(0.41, 0.46, ringDistance);
float innerRing = 1.0 - smoothstep(0.24, 0.29, ringDistance);
float ring = clamp(outerRing - innerRing, 0.0, 1.0);
float leftStroke = step(local.x, 0.28) * step(0.18, local.y) * step(local.y, 0.84);
float topStroke = step(0.18, local.x) * step(local.x, 0.78) * step(local.y, 0.25);
float midStroke = step(0.18, local.x) * step(local.x, 0.75) * step(0.43, local.y) * step(local.y, 0.56);
float lowerStroke = step(0.20, local.x) * step(local.x, 0.82) * step(0.72, local.y) * step(local.y, 0.84);
float rightUpperStroke = step(0.66, local.x) * step(local.x, 0.84) * step(0.20, local.y) * step(local.y, 0.54);
float rightStroke = step(0.70, local.x) * step(local.x, 0.87) * step(0.18, local.y) * step(local.y, 0.84);
float verticalMid = step(0.42, local.x) * step(local.x, 0.58);
float horizontalMid = step(0.42, local.y) * step(local.y, 0.58);
float edgeHorizontal = step(0.70, local.y) * step(local.y, 0.86) * step(0.12, local.x) * step(local.x, 0.88);
float edgeVertical = step(0.42, local.x) * step(local.x, 0.58) * step(0.12, local.y) * step(local.y, 0.88);
float edgeSlash = 1.0 - smoothstep(0.06, 0.13, abs((local.x + local.y) - 1.0));
edgeSlash *= step(0.08, local.x) * step(local.x, 0.92) * step(0.08, local.y) * step(local.y, 0.92);
float edgeBackslash = 1.0 - smoothstep(0.06, 0.13, abs(local.x - local.y));
edgeBackslash *= step(0.08, local.x) * step(local.x, 0.92) * step(0.08, local.y) * step(local.y, 0.92);

float glyph = 0.0;
if (bucket < 1.0)
    glyph = 0.0;
else if (bucket < 2.0)
    glyph = dotBottom;
else if (bucket < 3.0)
    glyph = max(dotTop, dotBottom);
else if (bucket < 4.0)
    glyph = ring * (1.0 - step(0.58, local.x));
else if (bucket < 5.0)
    glyph = ring;
else if (bucket < 6.0)
    glyph = max(max(leftStroke, topStroke), max(midStroke, rightUpperStroke));
else if (bucket < 7.0)
    glyph = max(ring, max(leftStroke * 0.8, rightStroke * 0.8));
else if (bucket < 8.0)
    glyph = max(max(topStroke, rightUpperStroke), max(midStroke, dotBottom));
else if (bucket < 9.0)
    glyph = max(max(ring, dotBottom * 0.9), max(midStroke * 0.7, rightUpperStroke * 0.65));
else
    glyph = max(max(verticalMid, horizontalMid), max(leftStroke, rightStroke));

float edgeGlyph = edgeHorizontal;
if (absGradientX > absGradientY * 1.35)
    edgeGlyph = edgeVertical;
else if (absGradientY > absGradientX * 1.35)
    edgeGlyph = edgeHorizontal;
else if (gradientX * gradientY > 0.0)
    edgeGlyph = edgeSlash;
else
    edgeGlyph = edgeBackslash;
float cellPixelSize = __CELL_SIZE__.0;
float tinyCell = 1.0 - smoothstep(1.0, 2.0, cellPixelSize);
float cellHash = fract(sin(dot(floor(cell), vec2(127.1, 311.7))) * 43758.5453);
float dither = (cellHash - 0.5) * 0.035;
float aaGlyph = smoothstep(0.03, 0.90, glyph);
float tinyGlyphStrength = mix(0.14, 0.64, smoothstep(1.0, 2.0, cellPixelSize));
float glyphStrength = mix(tinyGlyphStrength, 0.84, smoothstep(2.0, 5.0, cellPixelSize));
float asciiMask = mix(1.0, aaGlyph, glyphStrength);
float edgeMask = smoothstep(0.18, 0.92, edgeGlyph * edgeStrength);
float edgeWeight = mix(edgeStrength * 0.20, edgeStrength * 0.64, smoothstep(2.0, 5.0, cellPixelSize));
vec3 sourceColor = clamp(cellColor.rgb + vec3(dither), vec3(0.0), vec3(1.0));
vec3 posterColor = floor((pow(sourceColor, vec3(0.9)) * 9.0) + 0.5) / 9.0;
vec3 gray = vec3(dot(posterColor, vec3(0.2126, 0.7152, 0.0722)));
vec2 centeredUv = cogl_tex_coord0_in.xy - vec2(0.5);
float vignette = smoothstep(0.78, 0.18, dot(centeredUv, centeredUv));
float classicInkAmount = clamp(0.35 + (max(level, edgeStrength) * 0.65), 0.0, 1.0);

vec3 crtPalette = mix(gray, posterColor, 0.62);
crtPalette = pow(clamp(crtPalette * 1.12, vec3(0.0), vec3(1.0)), vec3(0.86));
crtPalette *= mix(vec3(0.80, 0.96, 1.16), vec3(1.20, 1.02, 0.80), level);
crtPalette = mix(vec3(0.018, 0.030, 0.045), crtPalette, 0.90);
vec3 crtInk = mix(vec3(0.018, 0.030, 0.045), crtPalette, classicInkAmount);
vec3 crtColor = mix(vec3(0.018, 0.030, 0.045), crtInk, asciiMask);
crtColor *= mix(0.74, 1.0, vignette);
crtColor = mix(crtColor, crtColor + vec3(0.12, 0.15, 0.08), edgeMask * edgeWeight);

vec3 hybridBase = mix(gray, posterColor, 0.78);
hybridBase = mix(vec3(0.018, 0.022, 0.030), hybridBase, 0.90);
hybridBase *= vec3(0.96, 1.02, 1.08);
vec3 hybridEdge = mix(vec3(1.0, 0.78, 0.42), vec3(1.0, 0.38, 0.82), step(0.5, cellHash));
vec3 hybridInk = mix(vec3(0.018, 0.022, 0.030), hybridBase, classicInkAmount);
hybridInk = mix(hybridInk, hybridEdge, clamp(edgeMask * (edgeWeight + 0.16), 0.0, 1.0));
vec3 hybridColor = mix(vec3(0.018, 0.022, 0.030), hybridInk, asciiMask);

vec3 invertColor = pow(vec3(1.0) - posterColor, vec3(0.92));
vec3 invertInk = mix(vec3(0.02, 0.02, 0.025), invertColor, classicInkAmount);
invertInk = mix(invertInk, vec3(1.0) - hybridEdge, edgeMask * edgeWeight);
invertColor = mix(vec3(0.02, 0.02, 0.025), invertInk, asciiMask);

vec3 cyberBase = mix(gray, posterColor, 0.52);
cyberBase *= vec3(0.65, 0.92, 1.28);
cyberBase = mix(vec3(0.025, 0.010, 0.050), cyberBase, 0.88);
vec3 cyberGlow = mix(vec3(1.0, 0.12, 0.72), vec3(0.72, 0.18, 1.0), step(0.46, cellHash));
vec3 cyberInk = mix(vec3(0.025, 0.010, 0.050), cyberBase, classicInkAmount);
cyberInk = mix(cyberInk, cyberGlow, clamp((edgeMask * (edgeWeight + 0.22)) + (max(level - 0.72, 0.0) * 0.32), 0.0, 1.0));
vec3 cyberColor = mix(vec3(0.025, 0.010, 0.050), cyberInk, asciiMask);
cyberColor *= mix(0.76, 1.0, vignette);

vec3 classicShadow = vec3(0.12, 0.065, 0.018);
vec3 classicAmber = vec3(1.0, 0.72, 0.18);
vec3 classicInk = mix(classicShadow, classicAmber, classicInkAmount);
vec3 classicAmberColor = mix(classicShadow, classicInk, asciiMask);

float styleMode = __STYLE_MODE__.0;
vec3 styledColor = classicAmberColor;
if (styleMode < 0.5)
    styledColor = classicAmberColor;
else if (styleMode < 1.5)
    styledColor = crtColor;
else if (styleMode < 2.5)
    styledColor = hybridColor;
else if (styleMode < 3.5)
    styledColor = invertColor;
else if (styleMode < 4.5)
    styledColor = cyberColor;
else
    styledColor = cyberColor;
float tinyLift = tinyCell * 0.10;
cogl_color_out = vec4(mix(styledColor, styledColor * clamp(asciiMask + tinyLift, 0.0, 1.0), tinyCell), cogl_color_out.a);
`;
const GRID_PRESETS = [
    {
        name: 'pixel-ascii',
        cellSize: 1,
        backgroundOpacity: 0.12,
        amberIntensity: 0.45,
        fontScale: 0.92,
    },
    {
        name: 'nano-ascii',
        cellSize: 2,
        backgroundOpacity: 0.18,
        amberIntensity: 0.65,
        fontScale: 0.92,
    },
    {
        name: 'micro-ascii',
        cellSize: 4,
        backgroundOpacity: 0.22,
        amberIntensity: 0.8,
        fontScale: 0.92,
    },
    {
        name: 'small-ascii',
        cellSize: 5,
        backgroundOpacity: 0.24,
        amberIntensity: 0.85,
        fontScale: 0.92,
    },
    {
        name: 'fine-ascii',
        cellSize: 8,
        backgroundOpacity: 0.28,
        amberIntensity: 1.0,
        fontScale: 0.92,
    },
    {
        name: 'soft-large-ascii',
        cellSize: 10,
        backgroundOpacity: 0.32,
        amberIntensity: 1.1,
        fontScale: 0.92,
    },
];
const VISUAL_STYLES = [
    {
        name: 'classic-amber',
        styleMode: 0,
    },
    {
        name: 'muted-crt',
        styleMode: 1,
    },
    {
        name: 'hybrid-edge-tint',
        styleMode: 2,
    },
    {
        name: 'invert',
        styleMode: 3,
    },
    {
        name: 'cyberpunk',
        styleMode: 4,
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
        this._visualStyleIndex = 0;
        this._suppressGridPresetUntilUs = 0;
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

        Main.wm.addKeybinding(
            CYCLE_STYLE_SHORTCUT,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._cycleVisualStyle()
        );
        this._logShortcutRegistration(CYCLE_STYLE_SHORTCUT);

        if (this._settings.get_boolean('overlay-enabled'))
            this._showOverlay();

        console.log(`${this.metadata.uuid}: enabled`);
    }

    disable() {
        Main.wm.removeKeybinding(TOGGLE_SHORTCUT);
        Main.wm.removeKeybinding(CYCLE_PRESET_SHORTCUT);
        Main.wm.removeKeybinding(CAPTURE_PROBE_SHORTCUT);
        Main.wm.removeKeybinding(CYCLE_STYLE_SHORTCUT);

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

    _getActiveVisualStyle() {
        return VISUAL_STYLES[this._visualStyleIndex];
    }

    _cycleGridPreset() {
        const nowUs = GLib.get_monotonic_time();
        if (nowUs < this._suppressGridPresetUntilUs) {
            console.log(`${this.metadata.uuid}: cycle-preset ignored reason=style-shortcut-guard`);
            return;
        }

        this._gridPresetIndex = (this._gridPresetIndex + 1) % GRID_PRESETS.length;
        this._logActiveGridPreset('cycle-preset');
        this._syncGpuOverlayEffect();
        this._queueOverlayRepaint();
    }

    _cycleVisualStyle() {
        this._suppressGridPresetUntilUs = GLib.get_monotonic_time() + STYLE_GRID_SUPPRESS_US;
        this._visualStyleIndex = (this._visualStyleIndex + 1) % VISUAL_STYLES.length;
        this._logActiveVisualStyle('cycle-style');
        this._syncGpuOverlayEffect();
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

        this._gridPresetIndex = 0;
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

    _getGridDimensions(cellSize) {
        const width = Math.max(1, Math.floor(Main.uiGroup.width || 3440));
        const height = Math.max(1, Math.floor(Main.uiGroup.height || 1440));

        return [
            Math.max(1, Math.floor(width / cellSize)),
            Math.max(1, Math.floor(height / cellSize)),
        ];
    }

    _buildAsciiFillSnippet(cellSize, style) {
        const [cols, rows] = this._getGridDimensions(cellSize);

        return ASCII_FILL_SNIPPET_TEMPLATE
            .split('__GRID_COLS__').join(String(cols))
            .split('__GRID_ROWS__').join(String(rows))
            .split('__CELL_SIZE__').join(String(cellSize))
            .split('__STYLE_MODE__').join(String(style.styleMode));
    }

    _gpuEffectName(presetIndex, styleIndex) {
        return `ascii-overlay-gpu-glsl-fill-edge-${presetIndex}-${styleIndex}`;
    }

    _setEffectEnabled(effect, enabled) {
        if (!effect)
            return;

        if (typeof effect.set_enabled === 'function')
            effect.set_enabled(enabled);
        else
            effect.enabled = enabled;
    }

    _syncGpuOverlayEffect() {
        if (!this._overlay || typeof this._overlay.get_effect !== 'function')
            return;

        GRID_PRESETS.forEach((_preset, presetIndex) => {
            VISUAL_STYLES.forEach((_style, styleIndex) => {
                const effect = this._overlay.get_effect(this._gpuEffectName(presetIndex, styleIndex));
                this._setEffectEnabled(
                    effect,
                    presetIndex === this._gridPresetIndex && styleIndex === this._visualStyleIndex
                );
            });
        });

        const preset = this._getActiveGridPreset();
        const style = this._getActiveVisualStyle();
        const [cols, rows] = this._getGridDimensions(preset.cellSize);
        console.log(
            `${this.metadata.uuid}: gpu-overlay effect active ` +
            `glsl=ascii-fill-edge-coherent-10 style=${style.name} ` +
            `cell-size=${preset.cellSize} grid=${cols}x${rows}`
        );
    }

    _logShortcutRegistration(key) {
        console.log(
            `${this.metadata.uuid}: registered ${key} ` +
            `${JSON.stringify(this._settings.get_strv(key))}`
        );
    }

    _logActiveGridPreset(reason) {
        const preset = this._getActiveGridPreset();
        const style = this._getActiveVisualStyle();
        console.log(
            `${this.metadata.uuid}: ${reason} preset=${preset.name} ` +
            `style=${style.name} ` +
            `cell-size=${preset.cellSize} ` +
            `background-opacity=${preset.backgroundOpacity} ` +
            `amber-intensity=${preset.amberIntensity} ` +
            `font-scale=${preset.fontScale}`
        );
    }

    _logActiveVisualStyle(reason) {
        const style = this._getActiveVisualStyle();
        const preset = this._getActiveGridPreset();
        console.log(
            `${this.metadata.uuid}: ${reason} style=${style.name} ` +
            `preset=${preset.name} cell-size=${preset.cellSize}`
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
            const preset = this._getActiveGridPreset();
            const style = this._getActiveVisualStyle();
            const [cols, rows] = this._getGridDimensions(preset.cellSize);
            const glsl = new Shell.GLSLEffect();
            glsl.add_glsl_snippet(
                Cogl.SnippetHook.FRAGMENT,
                '',
                this._buildAsciiFillSnippet(preset.cellSize, style),
                false
            );
            actor.add_effect_with_name('ascii-overlay-glsl-fill-edge-probe', glsl);

            console.log(
                `${this.metadata.uuid}: stage-preview effects applied ` +
                `glsl=ascii-fill-edge-coherent-10 style=${style.name} ` +
                `cell-size=${preset.cellSize} grid=${cols}x${rows}`
            );
        } catch (error) {
            console.log(`${this.metadata.uuid}: stage-preview effects failed ${error}`);
        }
    }

    _applyGpuOverlayEffect(actor) {
        try {
            GRID_PRESETS.forEach((preset, presetIndex) => {
                VISUAL_STYLES.forEach((style, styleIndex) => {
                    const [cols, rows] = this._getGridDimensions(preset.cellSize);
                    const glsl = new Shell.GLSLEffect();
                    glsl.add_glsl_snippet(
                        Cogl.SnippetHook.FRAGMENT,
                        '',
                        this._buildAsciiFillSnippet(preset.cellSize, style),
                        false
                    );
                    const active = presetIndex === this._gridPresetIndex &&
                        styleIndex === this._visualStyleIndex;
                    this._setEffectEnabled(glsl, active);
                    actor.add_effect_with_name(this._gpuEffectName(presetIndex, styleIndex), glsl);

                    console.log(
                        `${this.metadata.uuid}: gpu-overlay effect prepared ` +
                        `glsl=ascii-fill-edge-coherent-10 preset-index=${presetIndex} ` +
                        `style-index=${styleIndex} style=${style.name} ` +
                        `cell-size=${preset.cellSize} grid=${cols}x${rows} ` +
                        `active=${active}`
                    );
                });
            });

            const preset = this._getActiveGridPreset();
            const style = this._getActiveVisualStyle();
            const [cols, rows] = this._getGridDimensions(preset.cellSize);
            console.log(
                `${this.metadata.uuid}: gpu-overlay effects applied ` +
                `glsl=ascii-fill-edge-coherent-10 style=${style.name} ` +
                `cell-size=${preset.cellSize} grid=${cols}x${rows}`
            );
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
