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
    horizontalAlign: number;
    verticalAlign: number;
    isBold: boolean;
    static Align: {
        CENTER: number;
        LEFT: number;
        RIGHT: number;
        TOP: number;
        BOTTOM: number;
    };
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
    spriteFrame: SpriteFrame | null;
    static SizeMode: { CUSTOM: any; TRIMMED: any; RAW: any };
}

export class SpriteFrame {
    texture: any;
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
    alignWithScreen(): void;
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

export function tween(target?: any): TweenStub;

export class TweenStub {
    to(duration: number, props: any): TweenStub;
    by(duration: number, props: any): TweenStub;
    delay(duration: number): TweenStub;
    call(cb: () => void): TweenStub;
    start(): TweenStub;
}
