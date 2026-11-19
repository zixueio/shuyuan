/**
 * 英语争霸 — 主题配色 + 代码 UI 工厂 + 动效工具箱
 *
 * 设计系统(参考 2048/跳一跳的精致感来源——一致性+手感, 而非贴图):
 *   卡片 = 白底 + 柔影 + 细描边(drawPanel shadow);
 *   按钮 = 伪 3D 厚度胶囊(drawButtonShape: 深色厚度层 + 主面 + 顶部高光 + 描边),
 *          按压 scale 弹性回弹(backOut 过冲);
 *   动效 = popIn 弹出 / floatUp 上浮 / pulse 脉冲 / breathing 呼吸 /
 *          coinFly 铜钱飞行 / burst 粒子迸发 / rollNum 数字滚动。
 * AI 素材只承接插画类(庭院/建筑立绘/书童/宣纸答题卡/图标)经 skin()/skinSprite()
 * 叠加; UI 组件类(按钮/白卡)回归程序绘制——锐利可控不糊。
 * 新建节点必须设 layer = UI_2D, 否则 UI 相机 visibility 不含该层, 不可见不可点。
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

/** 同色系加深(乘系数), 用于按钮厚度层/描边 */
export function shade(c: Color, k: number): Color {
    return new Color(Math.round(c.r * k), Math.round(c.g * k), Math.round(c.b * k), c.a);
}

/** 圆角卡片底板: 可选柔影(向下偏移的半透明暖色层), Graphics 无模糊用一层淡影近似 */
export function drawPanel(g: Graphics, w: number, h: number, color: Color, radius = 16, shadow = false): void {
    g.clear();
    if (shadow) {
        g.fillColor = new Color(70, 50, 30, 36);
        g.roundRect(-w / 2, -h / 2 - 6, w, h, radius + 2);
        g.fill();
    }
    g.fillColor = color;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.fill();
    g.strokeColor = C.cardLine;
    g.lineWidth = 2;
    g.roundRect(-w / 2, -h / 2, w, h, radius);
    g.stroke();
}

export function panel(w: number, h: number, color: Color, radius = 16, shadow = false): Node {
    const n = uiNode();
    const ut = n.addComponent(UITransform);
    ut.setContentSize(w, h);
    const g = n.addComponent(Graphics);
    drawPanel(g, w, h, color, radius, shadow);
    return n;
}

/** 伪 3D 厚度按钮面(跳一跳手感): 深色厚度层向下凸出 6px + 主面 + 顶部高光 + 描边 */
export function drawButtonShape(g: Graphics, w: number, h: number, base: Color): void {
    g.clear();
    const r = Math.min(24, h / 2);
    g.fillColor = shade(base, 0.62);              // 厚度层
    g.roundRect(-w / 2, -h / 2 - 6, w, h, r);
    g.fill();
    g.fillColor = base;                            // 主面
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.fill();
    g.fillColor = new Color(255, 255, 255, 46);    // 顶部高光条
    g.roundRect(-w / 2 + 10, h / 2 - 18, w - 20, 10, 5);
    g.fill();
    g.strokeColor = shade(base, 0.55);             // 描边
    g.lineWidth = 2.5;
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.stroke();
}

/** 程序绘铜钱(外圆内方孔), 比 AI 小图更锐利更贴主题 */
export function drawCoinShape(g: Graphics, size: number): void {
    g.clear();
    const r = size / 2;
    g.fillColor = shade(C.gold, 0.62);
    g.circle(0, -2, r);
    g.fill();
    g.fillColor = C.gold;
    g.circle(0, 0, r);
    g.fill();
    g.strokeColor = shade(C.goldDark, 0.85);
    g.lineWidth = 2;
    g.circle(0, 0, r - 1);
    g.stroke();
    const q = size * 0.18;                          // 方孔
    g.fillColor = shade(C.gold, 0.45);
    g.roundRect(-q / 2, -q / 2, q, q, 2);
    g.fill();
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
 * 按钮: 厚度胶囊 + 文字 + 按压弹性(缩 0.93 -> backOut 过冲回 1) + 点击音。
 * onTap 在 TOUCH_END 触发; 返回节点可继续调 setPosition。
 */
export function button(
    parent: Node, w: number, h: number, text: string,
    bg: Color, fg: Color, onTap: () => void, fontSize = 32,
): Node {
    const n = uiNode();
    const ut = n.addComponent(UITransform);
    ut.setContentSize(w, h);
    const g = n.addComponent(Graphics);
    drawButtonShape(g, w, h, bg);
    const t = label(text, fontSize, fg, true);
    n.addChild(t);
    n.on(Node.EventType.TOUCH_START, () => {
        tween(n).to(0.06, { scale: new Vec3(0.93, 0.93, 1) }).start();
    });
    const up = () => {
        tween(n).to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
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

/* ---------- 动效工具箱 ---------- */

/** 弹出入场: scale 0.6 -> 1(backOut 过冲) + 淡入 */
export function popIn(n: Node, delay = 0, dur = 0.3): void {
    const op = n.addComponent(UIOpacity);
    op.opacity = 0;
    n.setScale(0.6, 0.6, 1);
    tween(n).delay(delay).to(dur, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    tween(op).delay(delay).to(dur * 0.6, { opacity: 255 }).start();
}

/** 上浮入场: 向下位移 dist -> 回位 + 淡入(列表/选项 stagger 用) */
export function floatUp(n: Node, delay = 0, dist = 36): void {
    const op = n.addComponent(UIOpacity);
    op.opacity = 0;
    const y0 = n.position.y;
    n.setPosition(n.position.x, y0 + dist, 0);
    tween(n).delay(delay).to(0.32, { position: new Vec3(n.position.x, y0, 0) }, { easing: 'backOut' }).start();
    tween(op).delay(delay).to(0.26, { opacity: 255 }).start();
}

/** 脉冲一下(状态变化反馈): 放大 1.08 -> 弹回 */
export function pulse(n: Node): void {
    tween(n)
        .to(0.12, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineOut' })
        .to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .start();
}

/** 待机呼吸(循环): 轻微缩放往复, 与 popIn 错开启动避免同属性打架 */
export function breathing(n: Node, startDelay = 0.8, amt = 0.035, dur = 1.6): void {
    tween(n)
        .delay(startDelay)
        .to(dur, { scale: new Vec3(1 - amt, 1 - amt, 1) }, { easing: 'sineInOut' })
        .to(dur, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
        .union()
        .repeatForever()
        .start();
}

/**
 * 铜钱飞行: count 枚程序绘铜钱从 from 到 to(均 parent 本地坐标),
 * 先抛后吸两段 + 错峰; 每枚到达时回调 each(HUD 脉冲/滚动配合)。
 */
export function coinFly(
    parent: Node, from: Vec3, to: Vec3, count = 6, each?: () => void,
): void {
    for (let i = 0; i < count; i++) {
        const c = uiNode('flycoin');
        const ut = c.addComponent(UITransform);
        const size = 30 + Math.round(Math.random() * 8);
        ut.setContentSize(size, size);
        const g = c.addComponent(Graphics);
        drawCoinShape(g, size);
        const op = c.addComponent(UIOpacity);
        op.opacity = 255;
        parent.addChild(c);
        c.setPosition(from.x, from.y, 0);
        const mx = from.x + (Math.random() - 0.5) * 90;   // 抛物线顶点
        const my = from.y + 50 + Math.random() * 50;
        tween(c)
            .delay(i * 0.07)
            .to(0.28, { position: new Vec3(mx, my, 0) }, { easing: 'sineOut' })
            .to(0.3, { position: new Vec3(to.x, to.y, 0) }, { easing: 'sineIn' })
            .to(0.06, { scale: new Vec3(0.4, 0.4, 1) })
            .call(() => {
                c.destroy();
                if (each) each();
            })
            .start();
    }
}

/** 粒子迸发(答对/升级庆祝): count 个小圆从 at 四散抛落并淡出 */
export function burst(parent: Node, at: Vec3, colors: Color[], count = 12): void {
    for (let i = 0; i < count; i++) {
        const p = uiNode('pt');
        const ut = p.addComponent(UITransform);
        const s = 8 + Math.round(Math.random() * 7);
        ut.setContentSize(s, s);
        const g = p.addComponent(Graphics);
        g.fillColor = colors[i % colors.length];
        g.circle(0, 0, s / 2);
        g.fill();
        const op = p.addComponent(UIOpacity);
        op.opacity = 255;
        parent.addChild(p);
        p.setPosition(at.x, at.y, 0);
        const ang = Math.random() * Math.PI * 2;
        const dist = 60 + Math.random() * 90;
        tween(p)
            .by(0.55 + Math.random() * 0.2, {
                position: new Vec3(Math.cos(ang) * dist, Math.sin(ang) * dist - 40, 0),
            }, { easing: 'quadOut' })
            .start();
        tween(op).delay(0.3).to(0.3, { opacity: 0 }).call(() => p.destroy()).start();
    }
}

/** 数字滚动: Label 从当前显示值滚到 to(onUpdate 写 string), 并发安全(新滚动覆盖旧) */
export function rollNum(lab: Label, to: number): void {
    const from = parseInt(lab.string, 10) || 0;
    if (from === to) { lab.string = String(to); return; }
    const proxy = { v: from };
    tween(proxy).to(0.45, { v: to }, {
        onUpdate: () => { lab.string = String(Math.round(proxy.v)); },
    }).start();
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
 * w/h 缺省取宿主 UITransform; border>0 时按九宫格拉伸(圆角纸面板不变形)。
 * tint 乘色染色。
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

/** 纸面板换肤: skin 子节点压到最底层(文字标签留上层) */
export function skin(n: Node, art: string, tint?: Color, border = 70): void {
    const s = skinSprite(n, art, undefined, undefined, tint, border);
    s.setSiblingIndex(0);
}

const _clips: { [k: string]: AudioClip | null | undefined } = {};

/* ---------- cards 分包单例(2026-11-19 首成功后全灭实证的兜底) ----------
 * 空桩 game.js 时代(根修前)首次 loadBundle 的 System.import 挂 17s 超时失败,
 * 期间 bundle 已 init 进引擎缓存 -> 并发调用蒙混成功; 失败落定后引擎清缓存 +
 * SystemJS 缓存失败态 -> 后续 loadBundle 全爆「Unable to instantiate」。
 * 单例三防: ①首成功缓存 bundle 永不重入加载链 ②in-flight 排队防并发重入
 * ③失败不缓存, 下次调用自动重试。根修(分包 game.js require index.js)落地后
 * 这里只是双保险, 但并发 addArt 风暴下仍值得保留。 */
let _cardsBundle: any = null;
let _cardsBusy = false;
const _cardsQueue: ((b: any) => void)[] = [];

/** 取 cards bundle(单例缓存; 失败不缓存可重试, 并发调用排队等同一趟) */
export function getCards(cb: (bundle: any) => void): void {
    if (_cardsBundle) { cb(_cardsBundle); return; }
    _cardsQueue.push(cb);
    if (_cardsBusy) return;
    _cardsBusy = true;
    assetManager.loadBundle('cards', (err: Error | null, bundle: any) => {
        _cardsBusy = false;
        if (!err && bundle) _cardsBundle = bundle;
        const q = _cardsQueue.splice(0, _cardsQueue.length);
        for (const fn of q) {
            try { fn(_cardsBundle); } catch (e) { /* ignore */ }
        }
    });
}

/** 内置音效(click/coin/right/wrong), 加载结果缓存。
 *  resources 包在微信构建里被剔除(round8 启动卡死教训), 直走 cards 分包
 *  同名录副本(sfx/<name>), 经 getCards 单例; 失败记 null 不再重复请求。 */
export function sfx(name: string): void {
    const hit = _clips[name];
    if (hit !== undefined) {
        if (hit) { try { hit.play(); } catch (e) { /* ignore */ } }
        return;
    }
    const keep = (ok: AudioClip | null): void => {
        _clips[name] = ok;
        if (ok) { try { ok.play(); } catch (e) { /* ignore */ } }
    };
    getCards((bundle: any) => {
        if (!bundle) { keep(null); return; }
        bundle.load('sfx/' + name, AudioClip, (e2: Error | null, c2: any) => {
            keep((!e2 && c2) ? c2 as AudioClip : null);
        });
    });
}
