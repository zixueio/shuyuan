/**
 * 本地 tsc 校验专用 'cc' 模块声明(tools/tsconfig.check.json paths 指向本文件)。
 * 编辑器/构建时用真引擎; 本文件只为 `npx tsc -p tools/tsconfig.check.json`
 * 抓拼写/成员错, 成员签名与 Cocos Creator 3.8 实际 API 对齐, 缺的按需补。
 * 微信小游戏全局 wx 也在此声明。
 */

declare global {
    var wx: any;
}

export class Vec3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
}

export class Quat {
    x: number;
    y: number;
    z: number;
    w: number;
}

export class Color {
    constructor(r?: number, g?: number, b?: number, a?: number);
    r: number;
    g: number;
    b: number;
    a: number;
}

export class Node {
    constructor(name?: string);
    name: string;
    layer: number;
    active: boolean;
    isValid: boolean;
    readonly children: Node[];
    readonly position: Vec3;
    scale: Vec3;
    static EventType: {
        TOUCH_START: string;
        TOUCH_MOVE: string;
        TOUCH_END: string;
        TOUCH_CANCEL: string;
    };
    addChild(child: Node): Node;
    setPosition(x: number, y: number, z?: number): void;
    on(type: string, cb: (...args: any[]) => void, target?: any): void;
    off(type: string, cb?: (...args: any[]) => void, target?: any): void;
    setSiblingIndex(index: number): void;
    getChildByName(name: string): Node | null;
    addComponent<T>(type: new (...args: any[]) => T): T;
    addComponent(type: any): any;
    getComponent<T>(type: new (...args: any[]) => T): T | null;
    getComponent(type: any): any;
    destroy(): void;
}

export class Component {
    node: Node;
    enabled: boolean;
}

export class UITransform {
    width: number;
    height: number;
    setContentSize(w: number, h: number): void;
    setContentSize(size: { width: number; height: number }): void;
}

export class Widget {}

export class Label {
    string: string;
    fontSize: number;
    lineHeight: number;
    color: Color;
    horizontalAlign: HorizontalTextAlignment;
    verticalAlign: VerticalTextAlignment;
    isBold: boolean;
    // 注意: 3.x 的 Label 没有静态 Align（那是 2.x 老写法, 运行时 undefined）,
    // 对齐用独立枚举 HorizontalTextAlignment/VerticalTextAlignment（2026-11-16 踩过）
}

export declare enum HorizontalTextAlignment {
    LEFT = 0,
    CENTER = 1,
    RIGHT = 2,
}

export declare enum VerticalTextAlignment {
    TOP = 0,
    CENTER = 1,
    BOTTOM = 2,
}

export class Graphics {
    fillColor: Color;
    strokeColor: Color;
    lineWidth: number;
    clear(): void;
    rect(x: number, y: number, w: number, h: number): void;
    roundRect(x: number, y: number, w: number, h: number, r: number): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    close(): void;
    fill(): void;
    stroke(): void;
}

export class UIOpacity {
    opacity: number;
}

export class Sprite {
    sizeMode: any;
    type: any;
    color: Color;
    spriteFrame: SpriteFrame | null;
    static SizeMode: { CUSTOM: any; TRIMMED: any; RAW: any };
    static Type: { SIMPLE: any; SLICED: any; TILED: any; FILLED: any };
}

export class Rect {
    constructor(x?: number, y?: number, width?: number, height?: number);
    x: number;
    y: number;
    width: number;
    height: number;
}

export class SpriteFrame {
    texture: any;
    border: Rect;
}

export class Texture2D {
    image: any;
}

export class AudioClip {
    play(): void;
}

export class BlockInputEvents {}

export class Canvas {
    cameraComponent: any;
    // 3.8.8 没有 alignWithScreen()——曾误声明此方法导致 tsc 放行、
    // 运行时 TypeError 掐断 Boot.onLoad（2026-11-16）
}

export class Camera {
    projection: any;
    clearFlags: any;
    clearColor: Color;
    visibility: number;
    priority: number;
    orthoHeight: number;
    static ProjectionType: { ORTHO: any; PERSPECTIVE: any };
    static ClearFlag: { SOLID_COLOR: any; SKYBOX: any };
}

export const Layers: { Enum: { DEFAULT: number; UI_2D: number } };

export const view: {
    setDesignResolutionSize(w: number, h: number, policy: any): void;
    getVisibleSize(): { width: number; height: number };
};

export const director: {
    getScene(): Node | null;
};

export const ResolutionPolicy: {
    FIXED_HEIGHT: number;
    FIXED_WIDTH: number;
};

export const _decorator: {
    ccclass(name?: string): <T>(t: T) => T;
};

export const assetManager: {
    loadRemote(url: string, cb: (err: Error | null, asset: any) => void): void;
};

/** assets/resources 内置资源包(打包进小游戏, 不走域名白名单) */
export const resources: {
    load(path: string, type: any, cb: (err: Error | null, asset: any) => void): void;
};

export function tween(target?: any): TweenStub;

export class TweenStub {
    to(duration: number, props: any): TweenStub;
    by(duration: number, props: any): TweenStub;
    delay(duration: number): TweenStub;
    call(cb: () => void): TweenStub;
    start(): TweenStub;
}
