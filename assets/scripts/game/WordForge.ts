/**
 * 书院小掌柜 — 拼词馆(2048 式词根拼词)
 *
 * 玩法: 大字中文释义 + 槽位行 + 词块(前缀青/词根金/后缀绿, 干扰块同款同色
 * 不泄底), 按构词顺序点词块逐格拼上; 全拼对 = 答对一道英语题, 走
 * /mgapi/answer kind=en(与书斋同酬 3 x 等级, 共用每日 200 题上限), 零后端改动。
 * 词库 assets/resources/data/forge_words.json(65 词起步, 扩词只加 JSON 不改代码);
 * 提示行常显构词口诀(h 字段)边拼边学; 干扰块点错抖动; 「换一个」随时跳过。
 * 扩展位: 词库分级/连对 combo/词根图鉴, 都只动本文件 + JSON。
 */
import {
    Node, Color, Vec3, UITransform, Graphics, Label, UIOpacity,
    resources, JsonAsset, BlockInputEvents, tween,
} from 'cc';
import {
    C, uiNode, label, panel, button, shade, pulse, popIn, floatUp,
    burst, coinFly, sfx, skin,
} from './Theme';
import { Store } from './Store';
import { Toast } from './Toast';

const CARD_W = 560;
const TILE_W = 160;
const TILE_H = 100;
const SLOT_W = 150;
const SLOT_H = 104;

/** 词库条目: p=正确拆解(按序), x=干扰块, h=构词口诀 */
type Part = [string, string];
interface ForgeWord {
    w: string;
    cn: string;
    p: Part[];
    x: Part[];
    h: string;
}

export class WordForge {
    private store: Store;
    private host: Node;       // 弹层容器(overlays)
    private root!: Node;      // 遮罩+卡容器
    private body!: Node;      // 每词重建
    private lv: number;
    private closing = false;
    private busy = false;
    private capped = false;
    private shakeGuard = 0;   // 点错抖动节流(ms 时间戳), 防连点位移漂移

    private words: ForgeWord[] = [];
    private order: number[] = [];
    private cursor = 0;
    private cur: ForgeWord | null = null;
    private step = 0;
    private slots: Node[] = [];
    private used: Node[] = [];
    private wordLab: Label | null = null;

    constructor(store: Store, host: Node) {
        this.store = store;
        this.host = host;
        const s = store.state;
        this.lv = s ? s.english_lv : 1; // 与书斋共用英语等级计酬
        this.build();
        this.loadBank();
    }

    /* ---------- 骨架(与 QuizPanel 同构: 遮罩 + 宣纸大卡 + body) ---------- */
    private build(): void {
        const r = this.root = uiNode('forge');
        const ut = r.addComponent(UITransform);
        ut.setContentSize(1400, 2400); // 覆盖一切屏比
        const g = r.addComponent(Graphics);
        g.fillColor = C.mask;
        g.rect(-700, -1200, 1400, 2400);
        g.fill();
        r.addComponent(BlockInputEvents);

        const card = panel(CARD_W, 1040, C.card, 24);
        card.setPosition(0, 0, 0);
        skin(card, 'panel_quiz', undefined, 60); // AI 宣纸大卡盖住 Graphics 兜底
        r.addChild(card);
        popIn(card, 0, 0.25);

        const title = label('拼 词 馆', 40, C.green, true);
        title.setPosition(0, 470, 0);
        card.addChild(title);

        const close = label('✕', 36, C.ink2, false);
        close.setPosition(CARD_W / 2 - 40, 470, 0);
        const closeHit = panel(80, 80, new Color(0, 0, 0, 0), 40);
        closeHit.setPosition(CARD_W / 2 - 40, 470, 0);
        closeHit.on(Node.EventType.TOUCH_END, () => this.close());
        card.addChild(closeHit);
        card.addChild(close); // 文字浮在点击区上层

        this.body = uiNode('body');
        card.addChild(this.body);
        this.host.addChild(r);
    }

    private close(): void {
        if (this.closing) return;
        this.closing = true;
        this.root.destroy();
        Toast.show('拼词结束, 铜钱已入账', C.goldDark);
    }

    private clearBody(): void {
        if (this.body && this.body.isValid) this.body.destroy();
        this.body = uiNode('body');
        const card = this.root.children[0];
        card.addChild(this.body);
    }

    /* ---------- 词库 ---------- */
    private loadBank(): void {
        this.clearBody();
        const loading = label('翻词谱中...', 30, C.ink2, false);
        this.body.addChild(loading);
        resources.load('data/forge_words', JsonAsset, (err: Error | null, asset: JsonAsset) => {
            if (this.closing) return;
            const j: any = (!err && asset) ? asset.json : null;
            const list: ForgeWord[] = (j && j.words && j.words.length) ? j.words : null;
            if (!list) {
                this.clearBody();
                const t = label('词谱加载失败', 30, C.red, true);
                this.body.addChild(t);
                return;
            }
            this.words = list;
            this.shuffleOrder();
            this.next();
        });
    }

    private shuffleOrder(): void {
        this.order = shuffled(this.words.map((_, i) => i));
        this.cursor = 0;
    }

    private next(): void {
        if (this.closing) return;
        if (this.cursor >= this.order.length) this.shuffleOrder(); // 词库循环
        this.cur = this.words[this.order[this.cursor++]];
        this.step = 0;
        this.used = [];
        this.renderWord();
    }

    /* ---------- 一词一轮 ---------- */
    private renderWord(): void {
        const cur = this.cur as ForgeWord;
        this.clearBody();
        this.slots = [];
        this.used = [];

        // 中文释义(出题面)
        const cn = label(cur.cn, 42, C.ink, true);
        cn.setPosition(0, 340, 0);
        this.body.addChild(cn);
        floatUp(cn, 0, 24);

        // 拼成后大字显单词(预留位)
        const wln = label('', 48, C.en, true);
        wln.setPosition(0, 252, 0);
        this.body.addChild(wln);
        this.wordLab = wln.getComponent(Label);

        // 槽位行(按正确拆解段数)
        const n = cur.p.length;
        const total = n * SLOT_W + (n - 1) * 18;
        const x0 = -(total / 2 - SLOT_W / 2);
        for (let i = 0; i < n; i++) {
            const s = uiNode('slot');
            const ut = s.addComponent(UITransform);
            ut.setContentSize(SLOT_W, SLOT_H);
            const sg = s.addComponent(Graphics);
            drawSlot(sg, SLOT_W, SLOT_H);
            s.setPosition(x0 + i * (SLOT_W + 18), 164, 0);
            this.body.addChild(s);
            this.slots.push(s);
            floatUp(s, 0.06 + i * 0.06, 22);
        }

        // 构词口诀(常显, 边拼边学)
        const hint = label(cur.h, 22, C.ink2, false);
        hint.setPosition(0, 92, 0);
        this.body.addChild(hint);
        floatUp(hint, 0.2, 16);

        // 词块 = 正确拆解 + 干扰块, 打乱铺位(3 列)
        const parts: Part[] = shuffled(cur.p.concat(cur.x));
        parts.forEach((p, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const t = this.makeTile(p);
            t.setPosition((col - 1) * (TILE_W + 14), -12 - row * (TILE_H + 20), 0);
            this.body.addChild(t);
            floatUp(t, 0.25 + i * 0.05, 28);
        });

        // 换一个(跳过本题, 不提交不计酬)
        const skip = button(this.body, 210, 84, '换一个', C.btnSoft, C.ink, () => {
            if (this.busy || this.closing) return;
            sfx('click');
            this.next();
        }, 26);
        skip.setPosition(0, -330, 0);
        floatUp(skip, 0.4, 20);
    }

    private makeTile(part: Part): Node {
        const n = uiNode('tile');
        const ut = n.addComponent(UITransform);
        ut.setContentSize(TILE_W, TILE_H);
        const g = n.addComponent(Graphics);
        drawTile(g, TILE_W, TILE_H, partColor(part[0]));
        const txt = label(partText(part[0], part[1]), 30, new Color(255, 255, 255, 255), true);
        n.addChild(txt);
        n.on(Node.EventType.TOUCH_END, () => this.tapTile(n, part));
        return n;
    }

    private tapTile(node: Node, part: Part): void {
        const cur = this.cur;
        if (this.busy || this.closing || this.capped || !cur) return;
        if (this.used.indexOf(node) >= 0) return;
        const expect = cur.p[this.step];
        if (expect && part[0] === expect[0] && part[1] === expect[1]) {
            this.used.push(node);
            this.consumeTile(node);
            this.fillSlot(this.step, part);
            this.step++;
            sfx('click');
            if (this.step >= cur.p.length) this.complete();
        } else {
            const now = Date.now();
            if (now < this.shakeGuard) return;
            this.shakeGuard = now + 240;
            sfx('wrong');
            shake(node);
        }
    }

    /** 词块消隐(缩没, 占位不塌保网格) */
    private consumeTile(node: Node): void {
        let op = node.getComponent(UIOpacity);
        if (!op) op = node.addComponent(UIOpacity);
        tween(node).to(0.16, { scale: new Vec3(0.4, 0.4, 1) }).start();
        tween(op).to(0.16, { opacity: 0 }).start();
    }

    /** 槽位填块: 重绘同款厚度 + 填字 + 脉冲 */
    private fillSlot(i: number, part: Part): void {
        const s = this.slots[i];
        if (!s || !s.isValid) return;
        const g = s.getComponent(Graphics);
        if (g) drawTile(g, SLOT_W, SLOT_H, partColor(part[0]));
        const t = label(partText(part[0], part[1]), 30, new Color(255, 255, 255, 255), true);
        s.addChild(t);
        pulse(s);
    }

    /** 拼成: 大字显词 + 迸花 + 铜钱飞 HUD + 提交(与书斋同酬) */
    private complete(): void {
        this.busy = true;
        sfx('right');
        const cur = this.cur as ForgeWord;
        if (this.wordLab && this.wordLab.node && this.wordLab.node.isValid) {
            this.wordLab.string = cur.w;
            pulse(this.wordLab.node);
        }
        burst(this.body, new Vec3(0, 164, 0), [C.gold, C.green, C.math], 14);

        this.store.submitAnswer('en', this.lv, true).then((r: any) => {
            if (this.closing) return;
            if (r.capped) { this.showCapped(); return; }
            const gain = r.coins_added || 0;
            const fb = label('+' + gain + ' 铜钱 · 收进词囊', 30, C.green, true);
            fb.setPosition(0, -238, 0);
            this.body.addChild(fb);
            if (gain > 0) {
                coinFly(this.root, new Vec3(0, 164, 0), new Vec3(0, 560, 0), 5);
                sfx('coin');
            }
            setTimeout(() => {
                if (this.closing) return;
                this.busy = false;
                this.next();
            }, 1500);
        }).catch((e: any) => {
            if (this.closing) return;
            this.busy = false;
            Toast.show(String(e && e.message || '提交失败'), C.red);
        });
    }

    /** 每日上限(与书斋共用 200 题): 不再出词, 返回书院 */
    private showCapped(): void {
        this.capped = true;
        this.busy = false;
        this.clearBody();
        const t1 = label('今日 200 题已答满', 34, C.goldDark, true);
        t1.setPosition(0, 60, 0);
        const t2 = label('明天再来拼词赚铜钱吧', 28, C.ink2, false);
        t2.setPosition(0, 0, 0);
        this.body.addChild(t1);
        this.body.addChild(t2);
        const back = button(this.root.children[0], 220, 90, '返回书院', C.btnSoft, C.ink, () => this.close(), 28);
        back.setPosition(0, -180, 0);
    }
}

/* ---------- 本地工具 ---------- */

/** 类型配色: 前缀青/词根金/后缀绿(干扰块同带类型同色, 颜色不泄底) */
function partColor(t: string): Color {
    if (t === 'pre') return C.math;
    if (t === 'suf') return C.green;
    return C.gold;
}

/** 词块文字: 前缀 re- / 后缀 -ment / 词根 view */
function partText(t: string, v: string): string {
    if (t === 'pre') return v + '-';
    if (t === 'suf') return '-' + v;
    return v;
}

/** 词块: 与主按钮同款伪 3D 厚度(跳一跳手感) */
function drawTile(g: Graphics, w: number, h: number, base: Color): void {
    g.clear();
    g.fillColor = shade(base, 0.62);
    g.roundRect(-w / 2, -h / 2 - 5, w, h, 16);
    g.fill();
    g.fillColor = base;
    g.roundRect(-w / 2, -h / 2, w, h, 16);
    g.fill();
    g.strokeColor = shade(base, 0.55);
    g.lineWidth = 2;
    g.roundRect(-w / 2, -h / 2, w, h, 16);
    g.stroke();
}

/** 空槽位: 凹槽感(淡墨底 + 纸色描边) */
function drawSlot(g: Graphics, w: number, h: number): void {
    g.clear();
    g.fillColor = new Color(62, 49, 40, 16);
    g.roundRect(-w / 2, -h / 2, w, h, 14);
    g.fill();
    g.strokeColor = C.cardLine;
    g.lineWidth = 2.5;
    g.roundRect(-w / 2, -h / 2, w, h, 14);
    g.stroke();
}

/** 点错抖动(左右衰减, 净位移 0) */
function shake(n: Node): void {
    tween(n)
        .by(0.05, { position: new Vec3(-10, 0, 0) })
        .by(0.05, { position: new Vec3(20, 0, 0) })
        .by(0.05, { position: new Vec3(-14, 0, 0) })
        .by(0.05, { position: new Vec3(4, 0, 0) })
        .start();
}

/** Fisher-Yates 洗牌(不改原数组) */
function shuffled<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
}
