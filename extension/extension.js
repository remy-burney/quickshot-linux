import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot', 'screenshot_finish');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');

const KEYBINDING = 'capture-shortcut';
const SETTINGS_SCHEMA = 'org.gnome.shell.extensions.lightshot-linux';
const HELPER_PATH = GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin', 'lightshot-linux-helper']);
const DBUS_PATH = '/org/gnome/Shell/Extensions/LightshotLinux';
const DBUS_INTERFACE = 'org.gnome.Shell.Extensions.LightshotLinux';
const DBUS_XML = `<node>
    <interface name="${DBUS_INTERFACE}">
        <method name="StartCapture" />
    </interface>
</node>`;
const LOG_PREFIX = '[Lightshot Linux]';

const TOOLS = {
    PEN: 'pen',
    LINE: 'line',
    ARROW: 'arrow',
    RECTANGLE: 'rectangle',
    HIGHLIGHT: 'highlight',
    TEXT: 'text',
};

const COLORS = [
    '#ff0000',
    '#ff8a00',
    '#ffee00',
    '#22c55e',
    '#00a7ff',
    '#7c3aed',
    '#ffffff',
    '#111111',
];

const RESIZE_HANDLE_SIZE = 7;
const RESIZE_HANDLE_HIT_SIZE = 16;
const RESIZE_EDGE_HIT_SIZE = 6;
const MIN_SELECTION_SIZE = 16;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function isCtrl(event) {
    return (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;
}

function matchesKey(key, lower, upper) {
    return key === lower || key === upper;
}

function debug(message) {
    log(`${LOG_PREFIX} ${message}`);
}

function keyName(key) {
    try {
        return Clutter.keysym_to_name?.(key) ?? `${key}`;
    } catch (_error) {
        return `${key}`;
    }
}

function expandHome(path) {
    if (path === '~')
        return GLib.get_home_dir();

    if (path.startsWith('~/'))
        return GLib.build_filenamev([GLib.get_home_dir(), path.slice(2)]);

    return path;
}

function setSourceColor(cr, color, alphaOverride = null) {
    let value = color.startsWith('#') ? color.slice(1) : color;
    if (value.length !== 6 && value.length !== 8)
        value = 'ff0000';

    const r = parseInt(value.slice(0, 2), 16) / 255;
    const g = parseInt(value.slice(2, 4), 16) / 255;
    const b = parseInt(value.slice(4, 6), 16) / 255;
    const a = alphaOverride ?? (value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1);
    cr.setSourceRGBA(r, g, b, a);
}

function setGlyphColor(cr) {
    cr.setSourceRGBA(1, 1, 1, 0.94);
}

function rectFromPoints(start, end) {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    return {
        x,
        y,
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
    };
}

function drawButtonGlyph(cr, icon, width, height) {
    const cx = width / 2;
    const cy = height / 2;

    cr.save();
    cr.setLineWidth(2);
    cr.setLineCap(1);
    cr.setLineJoin(1);
    setGlyphColor(cr);

    switch (icon) {
        case 'pen':
            cr.moveTo(cx - 8, cy + 6);
            cr.curveTo(cx - 5, cy - 5, cx + 3, cy + 5, cx + 8, cy - 7);
            cr.stroke();
            break;
        case 'line':
            cr.moveTo(cx - 8, cy + 7);
            cr.lineTo(cx + 8, cy - 7);
            cr.stroke();
            break;
        case 'arrow':
            cr.moveTo(cx - 8, cy + 7);
            cr.lineTo(cx + 7, cy - 8);
            cr.stroke();
            cr.moveTo(cx + 7, cy - 8);
            cr.lineTo(cx + 6, cy);
            cr.moveTo(cx + 7, cy - 8);
            cr.lineTo(cx - 1, cy - 7);
            cr.stroke();
            break;
        case 'rectangle':
            cr.rectangle(cx - 8, cy - 6, 16, 12);
            cr.stroke();
            break;
        case 'highlight':
            cr.moveTo(cx - 7, cy + 7);
            cr.lineTo(cx + 5, cy - 5);
            cr.lineTo(cx + 9, cy - 1);
            cr.lineTo(cx - 3, cy + 11);
            cr.closePath();
            cr.fill();
            cr.setSourceRGBA(1, 1, 1, 0.45);
            cr.rectangle(cx - 9, cy + 8, 14, 2);
            cr.fill();
            break;
        case 'text':
            cr.selectFontFace('Sans', 0, 1);
            cr.setFontSize(18);
            cr.moveTo(cx - 6, cy + 7);
            cr.showText('T');
            break;
        case 'undo':
            cr.arc(cx, cy + 1, 7, 0.15 * Math.PI, 1.45 * Math.PI);
            cr.stroke();
            cr.moveTo(cx - 8, cy - 3);
            cr.lineTo(cx - 3, cy - 8);
            cr.lineTo(cx - 2, cy - 1);
            cr.stroke();
            break;
        case 'copy':
            cr.rectangle(cx - 5, cy - 8, 11, 13);
            cr.stroke();
            cr.rectangle(cx - 9, cy - 4, 11, 13);
            cr.stroke();
            break;
        case 'save':
            cr.moveTo(cx, cy - 9);
            cr.lineTo(cx, cy + 5);
            cr.stroke();
            cr.moveTo(cx - 5, cy);
            cr.lineTo(cx, cy + 6);
            cr.lineTo(cx + 5, cy);
            cr.stroke();
            cr.moveTo(cx - 8, cy + 9);
            cr.lineTo(cx + 8, cy + 9);
            cr.stroke();
            break;
        case 'close':
            cr.moveTo(cx - 6, cy - 6);
            cr.lineTo(cx + 6, cy + 6);
            cr.moveTo(cx + 6, cy - 6);
            cr.lineTo(cx - 6, cy + 6);
            cr.stroke();
            break;
    }

    cr.restore();
}

function makeIconButton(iconName, accessibleName, onClick) {
    const icon = new St.DrawingArea({
        style_class: 'll-tool-icon',
        width: 24,
        height: 24,
    });
    icon.connect('repaint', area => {
        const [width, height] = area.get_surface_size();
        const cr = area.get_context();
        drawButtonGlyph(cr, iconName, width, height);
        cr.$dispose();
    });

    const button = new St.Button({
        style_class: 'll-tool-button',
        child: icon,
        reactive: true,
        can_focus: true,
        track_hover: true,
        accessible_name: accessibleName,
    });
    button.connect('clicked', onClick);
    return button;
}

function actorContainsStagePoint(actor, stageX, stageY) {
    if (!actor?.visible)
        return false;

    let parent = actor.get_parent?.();
    while (parent) {
        if (!parent.visible)
            return false;
        parent = parent.get_parent?.();
    }

    const [success, localX, localY] = actor.transform_stage_point(stageX, stageY);
    if (!success)
        return false;

    const width = actor.width;
    const height = actor.height;
    return localX >= 0 && localX <= width && localY >= 0 && localY <= height;
}

const LightshotOverlay = GObject.registerClass(
class LightshotOverlay extends St.Widget {
    _init(settings, sourcePath, tempDirectory) {
        const width = global.stage.width || Main.uiGroup.width;
        const height = global.stage.height || Main.uiGroup.height;

        super._init({
            x: 0,
            y: 0,
            width,
            height,
            reactive: true,
            can_focus: true,
            track_hover: true,
            style_class: 'll-overlay',
        });

        this._settings = settings;
        this._sourcePath = sourcePath;
        this._tempDirectory = tempDirectory;
        this._stageWidth = width;
        this._stageHeight = height;
        this._selection = null;
        this._selectStart = null;
        this._selectEnd = null;
        this._currentAnnotation = null;
        this._annotations = [];
        this._activeTool = TOOLS.PEN;
        this._color = this._settings.get_string('default-color');
        this._strokeWidth = this._settings.get_int('stroke-width');
        this._highlighterWidth = this._settings.get_int('highlighter-width');
        this._textSize = this._settings.get_int('text-size');
        this._busy = false;
        this._closed = false;
        this._requestPath = null;
        this._buttonActions = new Map();
        this._cleanupDeferred = false;
        this._cleanupDone = false;
        this._resizeState = null;

        this._addScreenshotBackground();
        this._drawArea = new St.DrawingArea({
            x: 0,
            y: 0,
            width,
            height,
        });
        this._drawArea.connect('repaint', this._repaint.bind(this));
        this.add_child(this._drawArea);

        this._buildToolbars();

        this.connect('button-press-event', this._onButtonPress.bind(this));
        this.connect('motion-event', this._onMotion.bind(this));
        this.connect('button-release-event', this._onButtonRelease.bind(this));
        this.connect('scroll-event', this._onScroll.bind(this));
        this.connect('key-press-event', this._onKeyPress.bind(this));
        this.connect('captured-event', this._onCapturedEvent.bind(this));
        this.connect('destroy', () => this._cleanup());
    }

    open() {
        Main.uiGroup.add_child(this);
        this._grab = Main.pushModal(this);
        this._stageCapturedEventId = global.stage.connect('captured-event', this._onCapturedEvent.bind(this));
        this.grab_key_focus();
        debug(`overlay opened stage=${this._stageWidth}x${this._stageHeight} source=${this._sourcePath} stageCapturedId=${this._stageCapturedEventId}`);
    }

    close() {
        if (this._closed)
            return;

        this._closed = true;
        this._commitTextEntry();

        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }

        if (this._stageCapturedEventId) {
            global.stage.disconnect(this._stageCapturedEventId);
            debug(`overlay disconnected stage captured handler ${this._stageCapturedEventId}`);
            this._stageCapturedEventId = null;
        }

        debug('overlay closed');
        this.destroy();
    }

    _addScreenshotBackground() {
        try {
            const file = Gio.File.new_for_path(this._sourcePath);
            const imageActor = St.TextureCache.get_default().load_file_async(
                file,
                this._stageWidth,
                this._stageHeight,
                1,
                1
            );
            imageActor.set_position(0, 0);
            imageActor.set_size(this._stageWidth, this._stageHeight);
            imageActor.set({ contentGravity: Clutter.ContentGravity.RESIZE_FILL });
            this.add_child(imageActor);
        } catch (error) {
            logError(error, 'Lightshot Linux failed to load screenshot background');
        }
    }

    _buildToolbars() {
        this._toolButtons = new Map();
        this._toolbox = new St.BoxLayout({
            vertical: true,
            style_class: 'll-toolbox',
            visible: false,
        });
        this.add_child(this._toolbox);

        this._addToolButton(TOOLS.PEN, 'pen', 'Pen');
        this._addToolButton(TOOLS.LINE, 'line', 'Line');
        this._addToolButton(TOOLS.ARROW, 'arrow', 'Arrow');
        this._addToolButton(TOOLS.RECTANGLE, 'rectangle', 'Rectangle');
        this._addToolButton(TOOLS.HIGHLIGHT, 'highlight', 'Highlighter');
        this._addToolButton(TOOLS.TEXT, 'text', 'Text');

        this._colorButton = new St.Button({
            style_class: 'll-tool-button',
            child: this._makeSwatch(this._color),
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: 'Color',
        });
        this._colorButton.connect('clicked', () => this._togglePalette());
        this._buttonActions.set(this._colorButton, () => this._togglePalette());
        this._toolbox.add_child(this._colorButton);

        const undoButton = makeIconButton('undo', 'Undo', () => this._undo());
        this._buttonActions.set(undoButton, () => this._undo());
        this._toolbox.add_child(undoButton);

        this._palette = new St.BoxLayout({
            vertical: true,
            style_class: 'll-palette',
            visible: false,
        });
        for (const color of COLORS) {
            const button = new St.Button({
                style_class: 'll-tool-button',
                child: this._makeSwatch(color),
                reactive: true,
                can_focus: true,
                track_hover: true,
                accessible_name: color,
            });
            button.connect('clicked', () => {
                this._color = color;
                this._settings.set_string('default-color', color);
                this._colorButton.set_child(this._makeSwatch(color));
                this._palette.hide();
            });
            this._buttonActions.set(button, () => {
                this._color = color;
                this._settings.set_string('default-color', color);
                this._colorButton.set_child(this._makeSwatch(color));
                this._palette.hide();
            });
            this._palette.add_child(button);
        }
        this.add_child(this._palette);

        this._actionbox = new St.BoxLayout({
            vertical: false,
            style_class: 'll-actionbox',
            visible: false,
        });
        const copyButton = makeIconButton('copy', 'Copy', () => this._export({ copy: true }));
        const saveButton = makeIconButton('save', 'Save', () => this._export({ save: true }));
        const closeButton = makeIconButton('close', 'Close', () => this.close());
        this._buttonActions.set(copyButton, () => this._export({ copy: true }));
        this._buttonActions.set(saveButton, () => this._export({ save: true }));
        this._buttonActions.set(closeButton, () => this.close());
        this._actionbox.add_child(copyButton);
        this._actionbox.add_child(saveButton);
        this._actionbox.add_child(closeButton);
        this.add_child(this._actionbox);

        this._updateActiveTool();
    }

    _addToolButton(tool, iconName, accessibleName) {
        const button = makeIconButton(iconName, accessibleName, () => this._setTool(tool));
        this._toolButtons.set(tool, button);
        this._buttonActions.set(button, () => this._setTool(tool));
        this._toolbox.add_child(button);
    }

    _makeSwatch(color) {
        return new St.Widget({
            style_class: 'll-color-swatch',
            style: `background-color: ${color};`,
        });
    }

    _setTool(tool) {
        this._commitTextEntry();
        this._activeTool = tool;
        this._palette.hide();
        this._updateActiveTool();
        debug(`tool changed to ${tool}`);
    }

    _updateActiveTool() {
        for (const [tool, button] of this._toolButtons) {
            if (tool === this._activeTool)
                button.add_style_pseudo_class('checked');
            else
                button.remove_style_pseudo_class('checked');

            button.get_child()?.queue_repaint?.();
        }
    }

    _togglePalette() {
        this._palette.visible = !this._palette.visible;
        this._positionToolbars();
        debug(`palette ${this._palette.visible ? 'shown' : 'hidden'}`);
    }

    _eventTargetsControls(event) {
        let source = event.get_source?.();
        while (source) {
            if (source === this._toolbox ||
                source === this._palette ||
                source === this._actionbox ||
                source === this._textEntry ||
                source === this._colorButton) {
                return true;
            }

            source = source.get_parent?.();
        }

        return false;
    }

    _handleControlClick(event) {
        if (event.get_button && event.get_button() !== 1)
            return false;

        const [stageX, stageY] = event.get_coords();
        const entries = [...this._buttonActions.entries()].reverse();
        debug(`control hit-test click at ${Math.round(stageX)},${Math.round(stageY)} candidates=${entries.length}`);
        for (const [button, action] of entries) {
            const name = button.accessible_name ?? 'button';
            const [success, localX, localY] = button.transform_stage_point(stageX, stageY);
            debug(`candidate ${name} visible=${button.visible} local=${success ? `${Math.round(localX)},${Math.round(localY)}` : 'outside'} size=${Math.round(button.width)}x${Math.round(button.height)}`);
            if (!actorContainsStagePoint(button, stageX, stageY))
                continue;

            this.grab_key_focus();
            debug(`control clicked ${name}`);
            action();
            return true;
        }

        debug('control hit-test no match');
        return false;
    }

    _onCapturedEvent(_actor, event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;

        const key = event.get_key_symbol();
        debug(`captured key ${keyName(key)} ctrl=${isCtrl(event)}`);
        return this._onKeyPress(this, event);
    }

    _positionToolbars() {
        if (!this._selection) {
            this._toolbox.hide();
            this._actionbox.hide();
            this._palette.hide();
            return;
        }

        this._toolbox.show();
        this._actionbox.show();

        const margin = 8;
        const toolWidth = 38;
        const toolHeight = 286;
        let toolX = this._selection.x + this._selection.width + margin;
        if (toolX + toolWidth > this._stageWidth)
            toolX = Math.max(0, this._selection.x - toolWidth - margin);

        let toolY = this._selection.y;
        if (toolY + toolHeight > this._stageHeight)
            toolY = Math.max(0, this._stageHeight - toolHeight - margin);
        this._toolbox.set_position(toolX, toolY);

        if (this._palette.visible)
            this._palette.set_position(toolX + toolWidth + 4 < this._stageWidth ? toolX + toolWidth + 4 : Math.max(0, toolX - 38), toolY);

        const actionWidth = 112;
        const actionHeight = 38;
        let actionX = this._selection.x + this._selection.width - actionWidth;
        actionX = clamp(actionX, 0, this._stageWidth - actionWidth);
        let actionY = this._selection.y + this._selection.height + margin;
        if (actionY + actionHeight > this._stageHeight)
            actionY = Math.max(0, this._selection.y - actionHeight - margin);
        this._actionbox.set_position(actionX, actionY);
    }

    _onButtonPress(_actor, event) {
        if (this._handleControlClick(event))
            return Clutter.EVENT_STOP;

        if (this._eventTargetsControls(event))
            return Clutter.EVENT_STOP;

        if (this._busy)
            return Clutter.EVENT_STOP;

        const [x, y] = event.get_coords();
        this._palette.hide();
        this.grab_key_focus();
        debug(`button press at ${Math.round(x)},${Math.round(y)} hasSelection=${!!this._selection} tool=${this._activeTool}`);

        if (!this._selection) {
            this._selectStart = { x, y };
            this._selectEnd = { x, y };
            this._drawArea.queue_repaint();
            debug('selection drag started');
            return Clutter.EVENT_STOP;
        }

        const resizeHandle = this._resizeHandleAt(x, y);
        if (resizeHandle) {
            this._commitTextEntry();
            this._resizeState = {
                handle: resizeHandle,
                original: { ...this._selection },
            };
            debug(`selection resize started handle=${resizeHandle}`);
            return Clutter.EVENT_STOP;
        }

        if (!this._pointInSelection(x, y)) {
            debug('button press outside selection ignored');
            return Clutter.EVENT_STOP;
        }

        this._commitTextEntry();

        if (this._activeTool === TOOLS.TEXT) {
            this._beginTextEntry(x, y);
            debug('text entry started');
            return Clutter.EVENT_STOP;
        }

        const point = this._toSelectionPoint(x, y);
        const size = this._currentSize();
        this._currentAnnotation = {
            type: this._activeTool,
            color: this._color,
            size,
            startX: point.x,
            startY: point.y,
            x: point.x,
            y: point.y,
            x2: point.x,
            y2: point.y,
            width: 0,
            height: 0,
            points: [{ x: point.x, y: point.y }],
        };

        this._drawArea.queue_repaint();
        debug(`annotation started type=${this._activeTool}`);
        return Clutter.EVENT_STOP;
    }

    _onMotion(_actor, event) {
        const [x, y] = event.get_coords();

        if (this._resizeState) {
            this._resizeSelectionTo(x, y);
            return Clutter.EVENT_STOP;
        }

        if (this._eventTargetsControls(event))
            return Clutter.EVENT_STOP;

        if (this._selectStart) {
            this._selectEnd = { x, y };
            this._drawArea.queue_repaint();
            return Clutter.EVENT_STOP;
        }

        if (!this._currentAnnotation || !this._selection)
            return Clutter.EVENT_PROPAGATE;

        const point = this._toSelectionPoint(x, y);
        if (this._currentAnnotation.type === TOOLS.PEN || this._currentAnnotation.type === TOOLS.HIGHLIGHT) {
            this._currentAnnotation.points.push(point);
        } else if (this._currentAnnotation.type === TOOLS.RECTANGLE) {
            this._currentAnnotation.x2 = point.x;
            this._currentAnnotation.y2 = point.y;
            const rect = rectFromPoints(
                { x: this._currentAnnotation.startX, y: this._currentAnnotation.startY },
                point
            );
            this._currentAnnotation.x = rect.x;
            this._currentAnnotation.y = rect.y;
            this._currentAnnotation.width = rect.width;
            this._currentAnnotation.height = rect.height;
        } else {
            this._currentAnnotation.x2 = point.x;
            this._currentAnnotation.y2 = point.y;
        }

        this._drawArea.queue_repaint();
        return Clutter.EVENT_STOP;
    }

    _onButtonRelease(_actor, event) {
        if (this._resizeState) {
            debug(`selection resize completed x=${this._selection.x} y=${this._selection.y} width=${this._selection.width} height=${this._selection.height}`);
            this._resizeState = null;
            return Clutter.EVENT_STOP;
        }

        if (this._eventTargetsControls(event))
            return Clutter.EVENT_STOP;

        if (this._selectStart) {
            const selection = rectFromPoints(this._selectStart, this._selectEnd);
            this._selectStart = null;
            this._selectEnd = null;

            if (selection.width >= 4 && selection.height >= 4) {
                const x = Math.round(clamp(selection.x, 0, this._stageWidth));
                const y = Math.round(clamp(selection.y, 0, this._stageHeight));
                const right = Math.round(clamp(selection.x + selection.width, 0, this._stageWidth));
                const bottom = Math.round(clamp(selection.y + selection.height, 0, this._stageHeight));
                this._setSelection({
                    x,
                    y,
                    width: Math.max(1, right - x),
                    height: Math.max(1, bottom - y),
                }, false);
                debug(`selection completed x=${this._selection.x} y=${this._selection.y} width=${this._selection.width} height=${this._selection.height}`);
            } else {
                debug(`selection ignored width=${Math.round(selection.width)} height=${Math.round(selection.height)}`);
            }

            this._drawArea.queue_repaint();
            return Clutter.EVENT_STOP;
        }

        if (this._currentAnnotation) {
            this._normalizeCurrentAnnotation();
            if (this._isMeaningfulAnnotation(this._currentAnnotation))
                this._annotations.push(this._currentAnnotation);

            debug(`annotation completed count=${this._annotations.length}`);
            this._currentAnnotation = null;
            this._drawArea.queue_repaint();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _onScroll(_actor, event) {
        if (this._eventTargetsControls(event))
            return Clutter.EVENT_STOP;

        const direction = event.get_scroll_direction();
        let delta = 0;

        if (direction === Clutter.ScrollDirection.UP)
            delta = 1;
        else if (direction === Clutter.ScrollDirection.DOWN)
            delta = -1;
        else if (direction === Clutter.ScrollDirection.SMOOTH) {
            const [, dy] = event.get_scroll_delta();
            delta = dy < 0 ? 1 : -1;
        }

        if (delta === 0)
            return Clutter.EVENT_STOP;

        if (this._activeTool === TOOLS.TEXT) {
            this._textSize = clamp(this._textSize + delta * 2, 8, 144);
            this._settings.set_int('text-size', this._textSize);
            if (this._textEntry)
                this._styleTextEntry();
            debug(`text size changed to ${this._textSize}`);
        } else if (this._activeTool === TOOLS.HIGHLIGHT) {
            this._highlighterWidth = clamp(this._highlighterWidth + delta * 2, 4, 120);
            this._settings.set_int('highlighter-width', this._highlighterWidth);
            debug(`highlighter width changed to ${this._highlighterWidth}`);
        } else {
            this._strokeWidth = clamp(this._strokeWidth + delta, 1, 80);
            this._settings.set_int('stroke-width', this._strokeWidth);
            debug(`stroke width changed to ${this._strokeWidth}`);
        }

        if (this._currentAnnotation)
            this._currentAnnotation.size = this._currentSize();

        this._drawArea.queue_repaint();
        return Clutter.EVENT_STOP;
    }

    _onKeyPress(_actor, event) {
        const key = event.get_key_symbol();
        debug(`key press ${keyName(key)} ctrl=${isCtrl(event)} hasSelection=${!!this._selection}`);

        if (key === Clutter.KEY_Escape || (isCtrl(event) && matchesKey(key, Clutter.KEY_x, Clutter.KEY_X))) {
            debug('shortcut close');
            this.close();
            return Clutter.EVENT_STOP;
        }

        if (isCtrl(event) && matchesKey(key, Clutter.KEY_c, Clutter.KEY_C)) {
            debug('shortcut copy');
            this._export({ copy: true });
            return Clutter.EVENT_STOP;
        }

        if (isCtrl(event) && matchesKey(key, Clutter.KEY_s, Clutter.KEY_S)) {
            debug('shortcut save');
            this._export({ save: true });
            return Clutter.EVENT_STOP;
        }

        if (isCtrl(event) && matchesKey(key, Clutter.KEY_a, Clutter.KEY_A)) {
            this._setSelection({ x: 0, y: 0, width: this._stageWidth, height: this._stageHeight }, true);
            debug('shortcut select all');
            return Clutter.EVENT_STOP;
        }

        if (isCtrl(event) && matchesKey(key, Clutter.KEY_z, Clutter.KEY_Z)) {
            debug('shortcut undo');
            this._undo();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _beginTextEntry(stageX, stageY) {
        if (!this._selection)
            return;

        const point = this._toSelectionPoint(stageX, stageY);
        this._textEntryPoint = point;
        this._textEntry = new St.Entry({
            style_class: 'll-text-entry',
            text: '',
            hint_text: '',
            reactive: true,
            can_focus: true,
        });
        this._styleTextEntry();
        this._textEntry.set_position(this._selection.x + point.x, this._selection.y + point.y);
        this._textEntry.set_size(Math.max(160, this._textSize * 6), Math.max(34, this._textSize * 1.7));
        this.add_child(this._textEntry);
        this._textEntry.grab_key_focus();
        debug(`text entry actor at ${Math.round(this._selection.x + point.x)},${Math.round(this._selection.y + point.y)} size=${this._textSize}`);

        this._textEntry.get_clutter_text().connect('key-press-event', (_entry, event) => {
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
                this._commitTextEntry();
                this.grab_key_focus();
                return Clutter.EVENT_STOP;
            }

            if (key === Clutter.KEY_Escape) {
                this._cancelTextEntry();
                this.grab_key_focus();
                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_PROPAGATE;
        });
    }

    _styleTextEntry() {
        if (!this._textEntry)
            return;

        this._textEntry.set_style(`color: ${this._color}; font-size: ${this._textSize}px;`);
    }

    _commitTextEntry() {
        if (!this._textEntry)
            return;

        const text = this._textEntry.get_text();
        if (text.trim().length > 0) {
            this._annotations.push({
                type: TOOLS.TEXT,
                color: this._color,
                size: this._strokeWidth,
                fontSize: this._textSize,
                x: this._textEntryPoint.x,
                y: this._textEntryPoint.y,
                text,
                points: [],
            });
            debug(`text committed length=${text.length} count=${this._annotations.length}`);
        } else {
            debug('empty text discarded');
        }

        this._textEntry.destroy();
        this._textEntry = null;
        this._textEntryPoint = null;
        this._drawArea.queue_repaint();
    }

    _cancelTextEntry() {
        if (!this._textEntry)
            return;

        this._textEntry.destroy();
        this._textEntry = null;
        this._textEntryPoint = null;
    }

    _undo() {
        this._cancelTextEntry();
        if (this._currentAnnotation) {
            this._currentAnnotation = null;
        } else {
            this._annotations.pop();
        }

        debug(`undo count=${this._annotations.length}`);
        this._drawArea.queue_repaint();
    }

    _pointInSelection(x, y) {
        if (!this._selection)
            return false;

        return x >= this._selection.x &&
            x <= this._selection.x + this._selection.width &&
            y >= this._selection.y &&
            y <= this._selection.y + this._selection.height;
    }

    _setSelection(selection, keepAnnotationsOnScreen) {
        const previous = this._selection;
        const next = {
            x: Math.round(clamp(selection.x, 0, this._stageWidth - MIN_SELECTION_SIZE)),
            y: Math.round(clamp(selection.y, 0, this._stageHeight - MIN_SELECTION_SIZE)),
            width: Math.round(clamp(selection.width, MIN_SELECTION_SIZE, this._stageWidth)),
            height: Math.round(clamp(selection.height, MIN_SELECTION_SIZE, this._stageHeight)),
        };
        next.width = Math.min(next.width, this._stageWidth - next.x);
        next.height = Math.min(next.height, this._stageHeight - next.y);

        if (keepAnnotationsOnScreen && previous) {
            const dx = previous.x - next.x;
            const dy = previous.y - next.y;
            this._shiftAnnotations(dx, dy);
        }

        this._selection = next;
        this._positionToolbars();
        this._drawArea.queue_repaint();
    }

    _selectionHandleCenters(rect) {
        const left = rect.x;
        const centerX = rect.x + rect.width / 2;
        const right = rect.x + rect.width;
        const top = rect.y;
        const centerY = rect.y + rect.height / 2;
        const bottom = rect.y + rect.height;

        return [
            { handle: 'nw', x: left, y: top },
            { handle: 'n', x: centerX, y: top },
            { handle: 'ne', x: right, y: top },
            { handle: 'e', x: right, y: centerY },
            { handle: 'se', x: right, y: bottom },
            { handle: 's', x: centerX, y: bottom },
            { handle: 'sw', x: left, y: bottom },
            { handle: 'w', x: left, y: centerY },
        ];
    }

    _resizeHandleAt(x, y) {
        if (!this._selection)
            return null;

        const half = RESIZE_HANDLE_HIT_SIZE / 2;
        for (const center of this._selectionHandleCenters(this._selection)) {
            if (Math.abs(x - center.x) <= half && Math.abs(y - center.y) <= half)
                return center.handle;
        }

        const rect = this._selection;
        const insideX = x >= rect.x && x <= rect.x + rect.width;
        const insideY = y >= rect.y && y <= rect.y + rect.height;

        if (insideX && Math.abs(y - rect.y) <= RESIZE_EDGE_HIT_SIZE)
            return 'n';
        if (insideX && Math.abs(y - (rect.y + rect.height)) <= RESIZE_EDGE_HIT_SIZE)
            return 's';
        if (insideY && Math.abs(x - rect.x) <= RESIZE_EDGE_HIT_SIZE)
            return 'w';
        if (insideY && Math.abs(x - (rect.x + rect.width)) <= RESIZE_EDGE_HIT_SIZE)
            return 'e';

        return null;
    }

    _resizeSelectionTo(x, y) {
        if (!this._resizeState)
            return;

        const { handle, original } = this._resizeState;
        let left = original.x;
        let top = original.y;
        let right = original.x + original.width;
        let bottom = original.y + original.height;

        if (handle.includes('w'))
            left = clamp(x, 0, right - MIN_SELECTION_SIZE);
        if (handle.includes('e'))
            right = clamp(x, left + MIN_SELECTION_SIZE, this._stageWidth);
        if (handle.includes('n'))
            top = clamp(y, 0, bottom - MIN_SELECTION_SIZE);
        if (handle.includes('s'))
            bottom = clamp(y, top + MIN_SELECTION_SIZE, this._stageHeight);

        this._setSelection({
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
        }, true);
    }

    _shiftAnnotations(dx, dy) {
        if (dx === 0 && dy === 0)
            return;

        for (const annotation of this._annotations)
            this._shiftAnnotation(annotation, dx, dy);

        if (this._currentAnnotation)
            this._shiftAnnotation(this._currentAnnotation, dx, dy);
    }

    _shiftAnnotation(annotation, dx, dy) {
        for (const field of ['x', 'x2', 'startX']) {
            if (typeof annotation[field] === 'number')
                annotation[field] += dx;
        }

        for (const field of ['y', 'y2', 'startY']) {
            if (typeof annotation[field] === 'number')
                annotation[field] += dy;
        }

        if (Array.isArray(annotation.points)) {
            for (const point of annotation.points) {
                point.x += dx;
                point.y += dy;
            }
        }
    }

    _toSelectionPoint(x, y) {
        return {
            x: clamp(x - this._selection.x, 0, this._selection.width),
            y: clamp(y - this._selection.y, 0, this._selection.height),
        };
    }

    _currentSize() {
        return this._activeTool === TOOLS.HIGHLIGHT ? this._highlighterWidth : this._strokeWidth;
    }

    _normalizeCurrentAnnotation() {
        if (!this._currentAnnotation)
            return;

        if (this._currentAnnotation.type === TOOLS.RECTANGLE) {
            const rect = rectFromPoints(
                { x: this._currentAnnotation.startX, y: this._currentAnnotation.startY },
                { x: this._currentAnnotation.x2, y: this._currentAnnotation.y2 }
            );
            this._currentAnnotation.x = rect.x;
            this._currentAnnotation.y = rect.y;
            this._currentAnnotation.width = rect.width;
            this._currentAnnotation.height = rect.height;
        }
    }

    _isMeaningfulAnnotation(annotation) {
        if (annotation.type === TOOLS.PEN || annotation.type === TOOLS.HIGHLIGHT)
            return annotation.points.length > 1;

        if (annotation.type === TOOLS.RECTANGLE)
            return annotation.width > 1 && annotation.height > 1;

        return Math.abs(annotation.x2 - annotation.x) > 1 || Math.abs(annotation.y2 - annotation.y) > 1;
    }

    async _export({ save = false, copy = false }) {
        if (this._busy || !this._selection) {
            debug(`export ignored busy=${this._busy} hasSelection=${!!this._selection}`);
            return;
        }

        this._commitTextEntry();
        this._busy = true;
        let closeBeforeWait = false;
        debug(`export started save=${save} copy=${copy} annotations=${this._annotations.length}`);

        try {
            const requestPath = GLib.build_filenamev([this._tempDirectory, 'request.json']);
            this._requestPath = requestPath;
            const request = {
                selection: this._selection,
                annotations: this._annotations,
            };
            GLib.file_set_contents(requestPath, JSON.stringify(request));

            const argv = [
                HELPER_PATH,
                'export',
                '--source',
                this._sourcePath,
                '--request',
                requestPath,
            ];

            let outputPath = null;
            if (save) {
                const saveDirectory = expandHome(this._settings.get_string('save-directory'));
                GLib.mkdir_with_parents(saveDirectory, 0o755);
                const stamp = GLib.DateTime.new_now_local().format('%Y%m%d-%H%M%S');
                outputPath = GLib.build_filenamev([saveDirectory, `Screenshot-${stamp}.png`]);
                argv.push('--output', outputPath);
                debug(`export save path=${outputPath}`);
            }

            if (copy)
                argv.push('--copy');

            const proc = Gio.Subprocess.new(
                argv,
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            closeBeforeWait = copy && !save;
            if (closeBeforeWait) {
                this._cleanupDeferred = true;
                debug('copy export launched; closing overlay before clipboard wait');
                this._closeAfterExport();
            }

            const [, stdout, stderr] = await proc.communicate_utf8_async(null, null);

            if (!proc.get_successful())
                throw new Error(stderr?.trim() || stdout?.trim() || 'export failed');

            debug(`export succeeded save=${save} copy=${copy}`);
            if (save && copy)
                Main.notify('Lightshot Linux', `Saved and copied ${outputPath}`);
            else if (save)
                Main.notify('Lightshot Linux', `Saved ${outputPath}`);
            else
                Main.notify('Lightshot Linux', 'Copied screenshot to clipboard');

            if (!closeBeforeWait)
                this._closeAfterExport();
        } catch (error) {
            logError(error, 'Lightshot Linux export failed');
            debug(`export failed ${error.message}`);
            Main.notify('Lightshot Linux', error.message);
            if (!closeBeforeWait)
                this._busy = false;
        } finally {
            if (closeBeforeWait) {
                this._cleanupDeferred = false;
                this._cleanup();
            }
        }
    }

    _closeAfterExport() {
        debug('export scheduling overlay close');
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            debug('export closing overlay');
            this.close();
            return GLib.SOURCE_REMOVE;
        });
    }

    _repaint(area) {
        const [width, height] = area.get_surface_size();
        const cr = area.get_context();

        cr.setSourceRGBA(0, 0, 0, 0.42);
        cr.rectangle(0, 0, width, height);
        cr.fill();

        const activeSelection = this._selection ?? (this._selectStart && this._selectEnd ? rectFromPoints(this._selectStart, this._selectEnd) : null);
        if (activeSelection) {
            this._drawMaskHole(cr, activeSelection, width, height);
            this._drawSelectionBorder(cr, activeSelection);

            if (this._selection) {
                cr.save();
                cr.rectangle(this._selection.x, this._selection.y, this._selection.width, this._selection.height);
                cr.clip();
                cr.translate(this._selection.x, this._selection.y);

                for (const annotation of this._annotations)
                    this._drawAnnotation(cr, annotation);

                if (this._currentAnnotation)
                    this._drawAnnotation(cr, this._currentAnnotation);

                cr.restore();
            }
        }

        cr.$dispose();
    }

    _drawMaskHole(cr, rect, width, height) {
        cr.save();
        cr.setOperator(0);
        cr.rectangle(rect.x, rect.y, rect.width, rect.height);
        cr.fill();
        cr.restore();

        cr.setSourceRGBA(0, 0, 0, 0.42);
        cr.rectangle(0, 0, width, rect.y);
        cr.rectangle(0, rect.y + rect.height, width, height - (rect.y + rect.height));
        cr.rectangle(0, rect.y, rect.x, rect.height);
        cr.rectangle(rect.x + rect.width, rect.y, width - (rect.x + rect.width), rect.height);
        cr.fill();
    }

    _drawSelectionBorder(cr, rect) {
        cr.save();
        cr.setLineWidth(1);
        cr.setSourceRGBA(1, 1, 1, 0.95);
        cr.rectangle(Math.round(rect.x) + 0.5, Math.round(rect.y) + 0.5, Math.round(rect.width), Math.round(rect.height));
        cr.stroke();

        if (this._selection)
            this._drawResizeHandles(cr, rect);

        cr.setSourceRGBA(0, 0, 0, 0.7);
        cr.rectangle(rect.x, Math.max(0, rect.y - 24), 78, 20);
        cr.fill();
        cr.setSourceRGBA(1, 1, 1, 1);
        cr.selectFontFace('Sans', 0, 0);
        cr.setFontSize(12);
        cr.moveTo(rect.x + 7, Math.max(14, rect.y - 10));
        cr.showText(`${Math.round(rect.width)}x${Math.round(rect.height)}`);
        cr.restore();
    }

    _drawResizeHandles(cr, rect) {
        const half = RESIZE_HANDLE_SIZE / 2;

        cr.save();
        for (const center of this._selectionHandleCenters(rect)) {
            const x = Math.round(center.x - half) + 0.5;
            const y = Math.round(center.y - half) + 0.5;

            cr.setSourceRGBA(0, 0, 0, 0.72);
            cr.rectangle(x - 1, y - 1, RESIZE_HANDLE_SIZE + 2, RESIZE_HANDLE_SIZE + 2);
            cr.stroke();
            cr.setSourceRGBA(1, 1, 1, 0.96);
            cr.rectangle(x, y, RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE);
            cr.fill();
        }
        cr.restore();
    }

    _drawAnnotation(cr, annotation) {
        switch (annotation.type) {
            case TOOLS.PEN:
                this._drawPath(cr, annotation, null);
                break;
            case TOOLS.HIGHLIGHT:
                this._drawPath(cr, annotation, 0.38);
                break;
            case TOOLS.LINE:
                this._drawLine(cr, annotation, false);
                break;
            case TOOLS.ARROW:
                this._drawLine(cr, annotation, true);
                break;
            case TOOLS.RECTANGLE:
                this._drawRectangle(cr, annotation);
                break;
            case TOOLS.TEXT:
                this._drawText(cr, annotation);
                break;
        }
    }

    _drawPath(cr, annotation, alpha) {
        if (!annotation.points || annotation.points.length === 0)
            return;

        cr.save();
        cr.setLineWidth(annotation.size);
        cr.setLineCap(1);
        cr.setLineJoin(1);
        setSourceColor(cr, annotation.color, alpha);
        cr.moveTo(annotation.points[0].x, annotation.points[0].y);
        for (let i = 1; i < annotation.points.length; i++)
            cr.lineTo(annotation.points[i].x, annotation.points[i].y);
        cr.stroke();
        cr.restore();
    }

    _drawLine(cr, annotation, arrow) {
        cr.save();
        cr.setLineWidth(annotation.size);
        cr.setLineCap(1);
        setSourceColor(cr, annotation.color);
        cr.moveTo(annotation.x, annotation.y);
        cr.lineTo(annotation.x2, annotation.y2);
        cr.stroke();

        if (arrow)
            this._drawArrowHead(cr, annotation);

        cr.restore();
    }

    _drawArrowHead(cr, annotation) {
        const dx = annotation.x2 - annotation.x;
        const dy = annotation.y2 - annotation.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length < 0.01)
            return;

        const unitX = dx / length;
        const unitY = dy / length;
        const headLength = Math.max(12, annotation.size * 4);
        const headWidth = Math.max(8, annotation.size * 2.6);
        const baseX = annotation.x2 - unitX * headLength;
        const baseY = annotation.y2 - unitY * headLength;
        const perpX = -unitY;
        const perpY = unitX;

        cr.moveTo(annotation.x2, annotation.y2);
        cr.lineTo(baseX + perpX * headWidth / 2, baseY + perpY * headWidth / 2);
        cr.lineTo(baseX - perpX * headWidth / 2, baseY - perpY * headWidth / 2);
        cr.closePath();
        cr.fill();
    }

    _drawRectangle(cr, annotation) {
        cr.save();
        cr.setLineWidth(annotation.size);
        setSourceColor(cr, annotation.color);
        cr.rectangle(annotation.x, annotation.y, annotation.width, annotation.height);
        cr.stroke();
        cr.restore();
    }

    _drawText(cr, annotation) {
        if (!annotation.text)
            return;

        cr.save();
        setSourceColor(cr, annotation.color);
        cr.selectFontFace('Sans', 0, 0);
        cr.setFontSize(annotation.fontSize || this._textSize);
        const lines = annotation.text.split('\n');
        const lineHeight = (annotation.fontSize || this._textSize) * 1.2;
        for (let i = 0; i < lines.length; i++) {
            cr.moveTo(annotation.x, annotation.y + (annotation.fontSize || this._textSize) + i * lineHeight);
            cr.showText(lines[i]);
        }
        cr.restore();
    }

    _cleanup() {
        if (this._cleanupDeferred) {
            debug('cleanup deferred while export is running');
            return;
        }

        if (this._cleanupDone)
            return;

        this._cleanupDone = true;

        if (this._requestPath) {
            try {
                Gio.File.new_for_path(this._requestPath).delete(null);
            } catch (_error) {
                // Best-effort cleanup.
            }
        }

        try {
            Gio.File.new_for_path(this._sourcePath).delete(null);
        } catch (_error) {
            // Best-effort cleanup.
        }

        try {
            Gio.File.new_for_path(this._tempDirectory).delete(null);
        } catch (_error) {
            // Best-effort cleanup.
        }
    }
});

export default class LightshotLinuxExtension extends Extension {
    enable() {
        debug('extension enable');
        this._settings = this.getSettings(SETTINGS_SCHEMA);
        this._bindShortcut();
        this._exportDbus();
        this._settingsChangedId = this._settings.connect(`changed::${KEYBINDING}`, () => this._bindShortcut());
    }

    disable() {
        debug('extension disable');
        this._unexportDbus();
        this._overlay?.close();
        this._overlay = null;

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        this._removeShortcut();
        this._settings = null;
    }

    StartCapture() {
        debug('dbus StartCapture called');
        this._startCapture();
    }

    _exportDbus() {
        if (this._dbus)
            return;

        this._dbus = Gio.DBusExportedObject.wrapJSObject(DBUS_XML, this);
        this._dbus.export(Gio.DBus.session, DBUS_PATH);
        debug(`dbus exported path=${DBUS_PATH} interface=${DBUS_INTERFACE}`);
    }

    _unexportDbus() {
        if (!this._dbus)
            return;

        this._dbus.flush();
        this._dbus.unexport();
        this._dbus = null;
        debug('dbus unexported');
    }

    _bindShortcut() {
        this._removeShortcut();
        Main.wm.addKeybinding(
            KEYBINDING,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._startCapture()
        );
        this._shortcutBound = true;
        debug(`shortcut bound ${this._settings.get_strv(KEYBINDING).join(',')}`);
    }

    _removeShortcut() {
        if (!this._shortcutBound)
            return;

        Main.wm.removeKeybinding(KEYBINDING);
        this._shortcutBound = false;
        debug('shortcut unbound');
    }

    async _startCapture() {
        if (this._overlay) {
            debug('capture ignored because overlay already exists');
            return;
        }

        const tempDirectory = GLib.build_filenamev([GLib.get_tmp_dir(), `lightshot-linux-${GLib.uuid_string_random()}`]);
        GLib.mkdir_with_parents(tempDirectory, 0o700);
        const sourcePath = GLib.build_filenamev([tempDirectory, 'source.png']);
        debug(`capture started source=${sourcePath}`);

        try {
            await this._captureToFile(sourcePath);
            debug('capture file written');
            this._overlay = new LightshotOverlay(this._settings, sourcePath, tempDirectory);
            this._overlay.connect('destroy', () => {
                debug('overlay destroyed');
                this._overlay = null;
            });
            this._overlay.open();
        } catch (error) {
            logError(error, 'Lightshot Linux capture failed');
            debug(`capture failed ${error.message}`);
            Main.notify('Lightshot Linux', error.message);
            try {
                Gio.File.new_for_path(sourcePath).delete(null);
                Gio.File.new_for_path(tempDirectory).delete(null);
            } catch (_cleanupError) {
                // Best-effort cleanup.
            }
        }
    }

    async _captureToFile(path) {
        const file = Gio.File.new_for_path(path);
        const stream = file.replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);

        try {
            const result = await new Shell.Screenshot().screenshot(false, stream);
            const success = Array.isArray(result) ? result[0] : result;
            if (!success)
                throw new Error('GNOME Shell did not return a screenshot.');
            debug(`Shell.Screenshot success=${success}`);
        } finally {
            stream.close(null);
        }
    }
}
