/**
 * 书院小掌柜 — 主题配色 + 代码 UI 工厂
 *
 * UI 运行时构建: Graphics 画兜底底板 + Label 写字, AI 素材(skin()/skinSprite())
 * 加载成功后盖在兜底之上; 音效走 sfx()。新建节点必须设 layer = UI_2D,
 * 否则 UI 相机 visibility 不含该层, 节点不可见不可点。
 */
import {
    Node, Label, Graphics, Color, UITransform, Layers, Vec3,
    UIOpacity, tween, Sprite, SpriteFrame, Texture2D, assetManager, AudioClip,
    HorizontalTextAlignment, VerticalTextAlignment, resources, Rect,
} from 'cc';

export const C = {
    bg: new Color(246, 239, 226, 255),      // 米黄纸色
    band: new Color(238, 227, 205, 255),    // 背景色带
    ink: new Color(62, 49, 40, 255),        // 墨色主文字
    ink2: new Color(128, 112, 96, 255),     // 次文字
    card: new Color(255, 252, 244, 255),    // 卡片底
    cardLine: new Color(228, 216, 192, 255),
    math: new Color(56, 132, 156, 255),     // 算学馆青蓝
    en: new Color(196, 108, 68, 255),       // 书斋赭红
    gold: new Color(222, 165, 60, 255),     // 铜钱金
    goldDark: new Color(196, 138, 34, 255),
    green: new Color(88, 160, 96, 255),
    red: new Color(206, 84, 75, 255),
    mask: new Color(30, 22, 16, 170),
    btnSoft: new Color(240, 232, 214, 255),
};

/** 新建一个 UI_2D 层节点(所有动态 UI 都从这里出) */
export function uiNode(name?: string): Node {
    const n = new Node(name || '');
    n.layer = Layers.Enum.UI_2D;
    return n;
}

/** 文本节点: 系统字体居中 */
export function label(str: string, size: number, color: Color, bold = false): Node {
    const n = uiNode(str);
    const l = n.addComponent(Label);
    l.string = str;
    l.fontSize = size;
    l.lineHeight = size + 10;
    l.color = color;
    // 3.x 用独立枚举(Label.Align 是 2.x 老写法, 3.8 运行时 undefined 直接 TypeError)
    l.horizontalAlign = HorizontalTextAlignment.CENTER;
    l.verticalAlign = VerticalTextAlignment.CENTER;
    l.isBold = bold;
    return n;
}

/** 圆角矩形底板(Graphics 手绘, 不裁剪内容) */
export function drawPanel(g: Graphics, w: number, h: number, color: Color, radius = 16): void {
    g.clear();
    g.fillColor = color;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.fill();
    g.strokeColor = C.cardLine;
    g.lineWidth = 2;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.stroke();
}

export function panel(w: number, h: number, color: Color, radius = 16): Node {
    const n = uiNode();
    const ut = n.addComponent(UITransform);
    ut.setContentSize(w, h);
    const g = n.addComponent(Graphics);
    drawPanel(g, w, h, color, radius);
    return n;
}

/** 纯色实心矩形(全屏背景等, 无圆角无边) */
export function fillRect(w: number, h: number, color: Color): Node {
    const n = uiNode();
    const ut = n.addComponent(UITransform);
    ut.setContentSize(w, h);
    const g = n.addComponent(Graphics);
    g.fillColor = color;
    g.rect(-w / 2, -h / 2, w, h);
    g.fill();
    return n;
}

/**
 * 按钮: 色块 + 文字 + 按压缩放反馈。
 * onTap 在 TOUCH_END 触发; 返回节点可继续调 setPosition。
 */
export function button(
    parent: Node, w: number, h: number, text: string,
    bg: Color, fg: Color, onTap: () => void, fontSize = 32,
): Node {
    const n = panel(w, h, bg, Math.min(20, h / 2));
    const t = label(text, fontSize, fg, true);
    n.addChild(t);
    n.on(Node.EventType.TOUCH_START, () => {
        tween(n).to(0.06, { scale: new Vec3(0.94, 0.94, 1) }).start();
    });
    const up = () => {
        tween(n).to(0.08, { scale: new Vec3(1, 1, 1) }).start();
    };
    n.on(Node.EventType.TOUCH_CANCEL, up);
    n.on(Node.EventType.TOUCH_END, () => {
        up();
        sfx('click');
        onTap();
    });
    parent.addChild(n);
    return n;
}

/** 房子简笔画(屋顶三角 + 房身 + 门), 画在指定 Graphics 上, 原点=房子中心 */
export function drawHouse(g: Graphics, w: number, h: number, color: Color): void {
    g.clear();
    g.fillColor = color;
    g.moveTo(-w / 2, 0);
    g.lineTo(0, h * 0.55);
    g.lineTo(w / 2, 0);
    g.close();
    g.fill();
    g.roundRect(-w * 0.36, -h * 0.52, w * 0.72, h * 0.55, 6);
    g.fill();
    g.fillColor = new Color(255, 255, 255, 150);
    g.roundRect(-w * 0.08, -h * 0.52, w * 0.16, h * 0.3, 3);
    g.fill();
}

/** 远程图片 -> Sprite 节点(mweb.cn 静态资源, 需配 downloadFile 合法域名) */
export function loadSprite(url: string, done: (n: Node | null) => void): Node {
    const n = uiNode('img');
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    assetManager.loadRemote(url, (err: Error | null, imageAsset: any) => {
        if (err || !imageAsset) {
            if (done) done(null);
            return;
        }
        const tex = new Texture2D();
        tex.image = imageAsset;
        const sf = new SpriteFrame();
        sf.texture = tex;
        sp.spriteFrame = sf;
        if (done) done(n);
    });
    return n;
}

/** 远程音频 -> AudioClip(mp3), 真人发音 */
export function loadAudio(url: string, cb: (clip: AudioClip | null) => void): void {
    assetManager.loadRemote(url, (err: Error | null, clip: any) => {
        cb(err || !clip ? null : clip as AudioClip);
    });
}

/* ---------- AI 素材换肤(assets/resources 内置资源, 加载失败走 Graphics 兜底) ---------- */

const _frames: { [k: string]: SpriteFrame | null | undefined } = {};

/** 内置 SpriteFrame 加载(带缓存; 值 null=已知失败, 不再重复请求) */
function loadFrame(name: string, done: (sf: SpriteFrame | null) => void): void {
    const hit = _frames[name];
    if (hit !== undefined) { done(hit || null); return; }
    resources.load('ui/' + name + '/spriteFrame', SpriteFrame, (err: Error | null, sf: any) => {
        const ok: SpriteFrame | null = (!err && sf) ? sf as SpriteFrame : null;
        _frames[name] = ok;
        done(ok);
    });
}

/**
 * 给宿主节点加一张 AI 图子节点(名为 'skin'), 盖在宿主 Graphics 兜底之上。
 * w/h 缺省取宿主 UITransform; border>0 时按九宫格拉伸(圆角按钮/纸面板不变形)。
 * tint 乘色染色: 米色底图 x 主题色 = 带纹理的彩色按钮。
 */
export function skinSprite(
    host: Node, name: string, w?: number, h?: number,
    tint?: Color, border = 0, done?: (n: Node | null) => void,
): Node {
    const ut = host.getComponent(UITransform);
    const sw = w || (ut ? ut.width : 200);
    const sh = h || (ut ? ut.height : 100);
    const n = uiNode('skin');
    n.addComponent(UITransform).setContentSize(sw, sh);
    const sp = n.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    if (tint) sp.color = tint;
    host.addChild(n);
    loadFrame(name, (sf) => {
        if (!sf) { if (done) done(null); return; }
        if (border > 0) {
            sf.border = new Rect(border, border, border, border);
            sp.type = Sprite.Type.SLICED;
        }
        sp.spriteFrame = sf;
        if (done) done(n);
    });
    return n;
}

/** 按钮/纸面板换肤: skin 子节点压到最底层(文字标签留上层) */
export function skin(n: Node, art: string, tint?: Color, border = 70): void {
    const s = skinSprite(n, art, undefined, undefined, tint, border);
    s.setSiblingIndex(0);
}

const _clips: { [k: string]: AudioClip | null | undefined } = {};

/** 内置音效(click/coin/right/wrong), 加载结果缓存 */
export function sfx(name: string): void {
    const hit = _clips[name];
    if (hit !== undefined) {
        if (hit) { try { hit.play(); } catch (e) { /* ignore */ } }
        return;
    }
    resources.load('sfx/' + name, AudioClip, (err: Error | null, clip: any) => {
        const ok: AudioClip | null = (!err && clip) ? clip as AudioClip : null;
        _clips[name] = ok;
        if (ok) { try { ok.play(); } catch (e) { /* ignore */ } }
    });
}
