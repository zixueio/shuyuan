/**
 * 词灵跳跳 — Sight Words 冒险(一期: Dolch 220 词)
 *
 * 设计目标(用户三条): 一进游戏就是拼词游戏没有别的 / 第一阶段掌握 220 个
 * Sight Words / 要好玩不像学习, 玩法独特。
 *
 * 玩法=「词灵大营救」: 每个 Sight Word 是一只被困在石头里的词灵, 顶部词灵
 * 气泡说出这个词(真人发音: 词光 atlas 151 词 + edge-tts 静态补齐 69 词, 全部
 * 匿名 mp3), 三块词灵石里点对的, 小书童跳上去救它——答对 3 次词灵破石而出
 * 飞进图鉴; 点错石头碎裂扣心心, 心心空了歇一会儿(无惩罚), 连对 3 次出连跳
 * 火花。220 词分 22 关 x 10 词, 通关解锁下一关, 词灵图鉴 22 格收集进度。
 * 学习藏在玩法里: 不显示中文释义不显示"答对/答错", 形近词做干扰块练字形,
 * 掌握进度高的词优先出(间隔重复), 已收词灵低频复习。
 * 经济复用: 每次答对 fire-and-forget 提交 /mgapi/answer kind=en(铜钱入账,
 * 书院版二期可消费), 进度本身存本地(sj_prog_v1)。
 */
import {
    Node, Color, Vec3, UITransform, Graphics, Label, UIOpacity, tween,
    BlockInputEvents, resources, JsonAsset, AudioClip,
} from 'cc';
import {
    C, uiNode, label, panel, button, shade, drawButtonShape,
    popIn, floatUp, pulse, breathing, burst, sfx, skinSprite, loadAudio,
} from './Theme';
import { Store } from './Store';
import { audioUrl, saveLocal, loadLocal } from '../api/mgapi';

/** sight_words.json 条目 */
interface SW { w: string; au: string; cn: string; }
interface Bank { v: number; total: number; levels: { n: number; words: SW[] }[]; }
/** 本地进度: 当前关/已解锁/每词答对次数/已收词灵 */
interface Prog { lv: number; unlocked: number; cnt: {[w: string]: number}; caps: {[w: string]: number}; }

const PROG_KEY = 'sj_prog_v1';
const NEED = 3;                       // 答对次数 -> 词灵收编
const STONE_W = 200;
const STONE_H = 120;
const STONE_XS = [-225, 0, 225];
const STONE_Y = -20;
const KID_HOME = new Vec3(-300, -180, 0);
const STONE_COLORS = [C.math, C.gold, C.green];   // 固定按位置配色, 颜色不泄底
const PET_COLORS = [
    new Color(116, 178, 218, 255), new Color(148, 198, 138, 255),
    new Color(238, 188, 98, 255), new Color(224, 138, 128, 255),
    new Color(178, 148, 214, 255), new Color(108, 188, 172, 255),
];

export class SightJump {
    private store: Store;
    private host: Node;
    private root!: Node;
    private bank: Bank | null = null;
    private prog: Prog;
    private lvIdx = 0;
    private hearts = 3;
    private combo = 0;
    private busy = false;
    private started = false;
    private target: SW | null = null;
    private stones: Node[] = [];
    private kid: Node | null = null;
    private bubbleLab: Label | null = null;
    private bubbleNode: Node | null = null;
    private pipG: Graphics | null = null;
    private heartGs: Graphics[] = [];
    private lvLab: Label | null = null;
    private cntLab: Label | null = null;
    private cntChip: Node | null = null;
    private clips: {[w: string]: AudioClip | null | undefined} = {};

    constructor(store: Store, host: Node) {
        this.store = store;
        this.host = host;
        const saved = loadLocal(PROG_KEY) as Prog | null;
        this.prog = saved || { lv: 0, unlocked: 0, cnt: {}, caps: {} };
        if (!this.prog.cnt) this.prog.cnt = {};
        if (!this.prog.caps) this.prog.caps = {};
        this.build();
    }

    /** 登录链后台跑(铜钱经济), 失败静默——游戏不依赖它 */
    startInit(): void {
        this.store.init().catch(() => { /* 离线也能玩, 提交失败静默 */ });
    }

    /* ================= 静态搭建 ================= */
    private build(): void {
        const r = this.root = uiNode('sj');
        const ut = r.addComponent(UITransform);
        ut.setContentSize(1400, 2400);   // 覆盖一切屏比

        // AI 庭院插画铺底(Home 版同款 bg_main)
        const bg = uiNode('bg');
        bg.addComponent(UITransform).setContentSize(1500, 2666);
        bg.setPosition(0, 0, 0);
        r.addChild(bg);
        skinSprite(bg, 'bg_main', 1500, 2666);

        this.buildHud();
        this.buildBubble();

        // 小书童(救援者)
        const kid = this.kid = skinSprite(uiNode('kid'), 'kid_idle', 120, 192);
        kid.setPosition(KID_HOME.x, KID_HOME.y, 0);
        r.addChild(kid);
        breathing(kid, 1.2, 0.03);

        const hint = label('点词灵石，救出被困的词灵！', 24, C.ink2, false);
        hint.setPosition(0, -140, 0);
        r.addChild(hint);

        this.host.addChild(r);
        this.splash();
    }

    private buildHud(): void {
        const r = this.root;
        // 心心(左边一排)
        for (let i = 0; i < 3; i++) {
            const h = uiNode('heart' + i);
            h.addComponent(UITransform).setContentSize(48, 48);
            h.setPosition(-262 + i * 58, 556, 0);
            h.addComponent(Graphics);
            r.addChild(h);
            this.heartGs.push(h.getComponent(Graphics) as Graphics);
        }
        this.drawHearts();
        // 关卡芯片
        const chip = panel(170, 64, C.card, 32, true);
        chip.setPosition(0, 556, 0);
        r.addChild(chip);
        const lv = label('第1关', 28, C.ink, true);
        chip.addChild(lv);
        this.lvLab = lv.getComponent(Label);
        // 词灵计数芯片
        const cntChip = this.cntChip = panel(210, 64, C.card, 32, true);
        cntChip.setPosition(148, 556, 0);
        r.addChild(cntChip);
        const cnt = label('词灵 0/220', 24, C.ink, true);
        cntChip.addChild(cnt);
        this.cntLab = cnt.getComponent(Label);
        // 图鉴
        button(r, 104, 64, '图鉴', C.btnSoft, C.ink, () => this.collection(), 26)
            .setPosition(292, 556, 0);
    }

    private buildBubble(): void {
        const r = this.root;
        const b = this.bubbleNode = uiNode('bubble');
        b.addComponent(UITransform).setContentSize(480, 190);
        const g = b.addComponent(Graphics);
        this.drawBubble(g);
        b.setPosition(0, 360, 0);
        // 眼睛(词灵小脸)
        for (const ex of [-120, 120]) {
            const eye = uiNode('eye');
            eye.addComponent(UITransform).setContentSize(24, 24);
            const eg = eye.addComponent(Graphics);
            eg.fillColor = C.ink;
            eg.circle(0, 0, 11);
            eg.fill();
            eg.fillColor = new Color(255, 255, 255, 255);
            eg.circle(3, 4, 3.5);
            eg.fill();
            eye.setPosition(ex, 46, 0);
            b.addChild(eye);
        }
        const wl = label('...', 64, C.en, true);
        wl.setPosition(0, -26, 0);
        b.addChild(wl);
        this.bubbleLab = wl.getComponent(Label);
        r.addChild(b);
        // 点气泡重听(手势内播放, iOS 友好)
        b.on(Node.EventType.TOUCH_END, () => {
            if (this.target) { sfx('click'); this.playWord(this.target); }
        });
        // 掌握进度点(答对 3 次收编)
        const pips = uiNode('pips');
        pips.addComponent(UITransform).setContentSize(120, 30);
        this.pipG = pips.addComponent(Graphics);
        pips.setPosition(0, 246, 0);
        r.addChild(pips);
    }

    /** 词灵气泡: 两只小耳朵 + 圆角身体 */
    private drawBubble(g: Graphics): void {
        g.clear();
        g.fillColor = C.card;
        g.strokeColor = C.cardLine;
        g.lineWidth = 3;
        for (const ex of [-150, 150]) {
            g.circle(ex, 88, 24);
            g.fill();
            g.circle(ex, 88, 24);
            g.stroke();
        }
        g.roundRect(-240, -95, 480, 190, 34);
        g.fill();
        g.roundRect(-240, -95, 480, 190, 34);
        g.stroke();
    }

    /* ================= 开场 splash(顺便解锁音频手势) ================= */
    private splash(): void {
        const sp = uiNode('splash');
        const ut = sp.addComponent(UITransform);
        ut.setContentSize(1400, 2400);
        const g = sp.addComponent(Graphics);
        g.fillColor = C.bg;
        g.rect(-700, -1200, 1400, 2400);
        g.fill();
        sp.addComponent(BlockInputEvents);

        const t1 = label('词灵跳跳', 76, C.ink, true);
        t1.setPosition(0, 250, 0);
        sp.addChild(t1);
        floatUp(t1, 0.05, 30);
        const t2 = label('220 个 Sight Words 词灵被困住了，去救它们！', 28, C.ink2, false);
        t2.setPosition(0, 200, 0);
        sp.addChild(t2);
        floatUp(t2, 0.15, 24);

        const kid = skinSprite(sp, 'kid_idle', 220, 352);
        kid.setPosition(0, -40, 0);
        popIn(kid, 0.25);

        const go = label('点一下出发', 42, C.en, true);
        go.setPosition(0, -300, 0);
        sp.addChild(go);
        tween(go)
            .to(0.55, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'sineInOut' })
            .to(0.55, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
            .union()
            .repeatForever()
            .start();

        sp.on(Node.EventType.TOUCH_END, () => {
            if (this.started) return;
            this.started = true;
            sfx('click');
            sp.destroy();
            this.loadBank();
        });
        this.root.addChild(sp);
    }

    /* ================= 词库与关卡 ================= */
    private loadBank(): void {
        resources.load('data/sight_words', JsonAsset, (err: Error | null, asset: JsonAsset) => {
            const j: any = (!err && asset) ? asset.json : null;
            const levels = (j && j.levels && j.levels.length) ? j.levels : null;
            if (!levels) {
                const t = label('词库加载失败', 32, C.red, true);
                this.root.addChild(t);
                return;
            }
            this.bank = j as Bank;
            this.lvIdx = Math.min(Math.max(0, this.prog.lv | 0), 21);
            this.refreshHud();
            this.prefetchLevel();
            this.round();
        });
    }

    private levelWords(): SW[] {
        return this.bank ? this.bank.levels[this.lvIdx].words : [];
    }

    /** 预取本关 10 词发音(播的时候零等待) */
    private prefetchLevel(): void {
        this.levelWords().forEach((sw) => {
            if (this.clips[sw.w] === undefined) {
                loadAudio(audioUrl(sw.au), (clip) => { this.clips[sw.w] = clip || null; });
            }
        });
    }

    private initLevel(lv: number): void {
        this.lvIdx = Math.min(Math.max(0, lv), 21);
        this.prog.lv = this.lvIdx;
        this.prog.unlocked = Math.max(this.prog.unlocked, this.lvIdx);
        saveLocal(PROG_KEY, this.prog);
        this.hearts = 3;
        this.combo = 0;
        this.drawHearts();
        this.refreshHud();
        this.prefetchLevel();
        this.clearStones();
        this.round();
    }

    /* ================= 一轮 ================= */
    private round(sameWord?: SW): void {
        if (!this.bank || !this.root.isValid) return;
        this.busy = false;
        this.clearStones();
        const t = this.target = sameWord || this.pickTarget();
        if (this.bubbleLab) this.bubbleLab.string = t.w;
        this.drawPips();
        this.pickOptions(t).forEach((sw, i) => {
            const st = this.makeStone(sw, i);
            this.root.addChild(st);
            this.stones.push(st);
            popIn(st, 0.06 * i, 0.25);
        });
        // 小书童跳回起点等下一轮
        if (this.kid && !sameWord) {
            tween(this.kid)
                .to(0.26, { position: new Vec3(KID_HOME.x, KID_HOME.y, 0) }, { easing: 'sineInOut' })
                .start();
        }
        setTimeout(() => {
            if (this.root.isValid && this.target === t) this.playWord(t);
        }, 480);
    }

    private clearStones(): void {
        this.stones.forEach((s) => { if (s.isValid) s.destroy(); });
        this.stones = [];
    }

    /** 目标词: 掌握进度高的优先(间隔重复), 已收词灵低频复习 */
    private pickTarget(): SW {
        const lw = this.levelWords();
        const unfinished = lw.filter((x) => !this.prog.caps[x.w]);
        if (!unfinished.length) return lw[Math.floor(Math.random() * lw.length)];
        const pool: SW[] = [];
        unfinished.forEach((x) => {
            const n = 1 + (this.prog.cnt[x.w] || 0);
            for (let i = 0; i < n; i++) pool.push(x);
        });
        lw.filter((x) => this.prog.caps[x.w]).forEach((x) => pool.push(x));
        return pool[Math.floor(Math.random() * pool.length)];
    }

    /** 干扰词: 同关优先, 同长/同首字母加权(练字形分辨, 不泄底) */
    private pickOptions(target: SW): SW[] {
        const others = this.levelWords().filter((x) => x.w !== target.w);
        const scored = others.map((x) => ({
            x: x,
            s: (x.w.length === target.w.length ? 2 : 0)
                + (x.w[0] === target.w[0] ? 2 : 0)
                + Math.random(),
        }));
        scored.sort((a, b) => b.s - a.s);
        return shuffled([target, scored[0].x, scored[1].x]);
    }

    private makeStone(sw: SW, i: number): Node {
        const n = uiNode('stone');
        n.addComponent(UITransform).setContentSize(STONE_W, STONE_H);
        const g = n.addComponent(Graphics);
        drawButtonShape(g, STONE_W, STONE_H, STONE_COLORS[i]);
        n.setPosition(STONE_XS[i], STONE_Y, 0);
        const size = sw.w.length >= 7 ? 30 : 36;
        const t = label(sw.w, size, new Color(255, 255, 255, 255), true);
        n.addChild(t);
        n.on(Node.EventType.TOUCH_END, () => this.tapStone(i, sw));
        return n;
    }

    private tapStone(i: number, sw: SW): void {
        if (this.busy || !this.target || !this.started) return;
        if (sw.w === this.target.w) this.correct(i);
        else this.wrong(i);
    }

    /* ================= 对/错反馈 ================= */
    private correct(i: number): void {
        this.busy = true;
        sfx('right');
        const cur = this.target as SW;
        const stone = this.stones[i];
        // 石头变金 + 脉冲
        const g = stone.getComponent(Graphics);
        if (g) drawButtonShape(g, STONE_W, STONE_H, C.goldDark);
        pulse(stone);
        burst(this.root, new Vec3(STONE_XS[i], STONE_Y, 0), [C.gold, C.green, C.math], 12);

        // 小书童跳过去(抛物线两段)
        const kid = this.kid as Node;
        const from = kid.position;
        const to = new Vec3(STONE_XS[i], STONE_Y + 92, 0);
        const mid = new Vec3((from.x + to.x) / 2, Math.max(from.y, to.y) + 150, 0);
        tween(kid)
            .to(0.2, { position: mid }, { easing: 'sineOut' })
            .to(0.18, { position: to }, { easing: 'quadIn' })
            .call(() => { pulse(kid); })
            .start();

        // 词灵进度
        const w = cur.w;
        this.prog.cnt[w] = (this.prog.cnt[w] || 0) + 1;
        const c = this.prog.cnt[w];
        this.combo++;
        if (c >= NEED && !this.prog.caps[w]) {
            this.prog.caps[w] = 1;
            this.petFly(new Vec3(STONE_XS[i], STONE_Y, 0), w);
            this.floatText('收进词灵！', C.green, 0);
        }
        if (this.combo >= 3) this.floatText('连跳 ×' + this.combo + '！', C.goldDark, 130);
        saveLocal(PROG_KEY, this.prog);
        this.drawPips();
        this.refreshHud();
        // 铜钱入账(书院经济, 失败静默)
        this.store.submitAnswer('en', 1, true).catch(() => { /* ignore */ });

        this.later(() => {
            const lw = this.levelWords();
            const doneAll = lw.every((x) => this.prog.caps[x.w]);
            if (doneAll) this.celebrate();
            else this.round();
        }, 950);
    }

    private wrong(i: number): void {
        this.busy = true;
        sfx('wrong');
        this.combo = 0;
        // 点错的石头碎裂(变暗 + 下坠)
        const stone = this.stones[i];
        const g = stone.getComponent(Graphics);
        if (g) drawButtonShape(g, STONE_W, STONE_H, shade(STONE_COLORS[i], 0.5));
        this.shake(stone);
        tween(stone).by(0.3, { position: new Vec3(0, -18, 0) }, { easing: 'quadIn' })
            .start();
        // 心心-1
        this.hearts--;
        this.drawHearts();
        const cur = this.target as SW;
        // 正确的石头发光提示(教学时刻, 不扣分不弹字)
        const idx = this.stones.findIndex((s) => this.stoneWord(s) === cur.w);
        if (idx >= 0) {
            const ok = this.stones[idx];
            const og = ok.getComponent(Graphics);
            if (og) drawButtonShape(og, STONE_W, STONE_H, C.green);
            pulse(ok);
        }
        this.floatText('再听一听～', C.red, 0);
        setTimeout(() => { if (this.root.isValid && this.target) this.playWord(this.target); }, 700);
        this.later(() => {
            if (this.hearts <= 0) this.restOverlay();
            else this.round(cur);   // 同一个词再来(换位置)
        }, 1300);
    }

    private stoneWord(s: Node): string {
        const c = s.children[0];
        const l = c ? c.getComponent(Label) : null;
        return l ? l.string : '';
    }

    /* ================= 词灵收编飞行 ================= */
    private petFly(from: Vec3, w: string): void {
        const pet = this.makePet(this.root, w, 64);
        pet.setPosition(from.x, from.y, 0);
        const dest = new Vec3(148, 556, 0);
        const mid = new Vec3((from.x + dest.x) / 2, Math.max(from.y, dest.y) + 120, 0);
        tween(pet)
            .to(0.24, { position: mid }, { easing: 'sineOut' })
            .to(0.3, { position: dest }, { easing: 'sineIn' })
            .call(() => {
                pet.destroy();
                if (this.cntChip && this.cntChip.isValid) pulse(this.cntChip);
            })
            .start();
    }

    /** 词灵小圆(收集物): 按词哈希取色 */
    private makePet(parent: Node, w: string, size: number): Node {
        const n = uiNode('pet');
        n.addComponent(UITransform).setContentSize(size, size);
        const g = n.addComponent(Graphics);
        const col = petColor(w);
        g.fillColor = shade(col, 0.6);
        g.circle(0, -2, size / 2);
        g.fill();
        g.fillColor = col;
        g.circle(0, 0, size / 2);
        g.fill();
        g.strokeColor = shade(col, 0.45);
        g.lineWidth = 2.5;
        g.circle(0, 0, size / 2 - 1);
        g.stroke();
        // 小眼睛
        g.fillColor = new Color(255, 255, 255, 255);
        g.circle(-size * 0.12, size * 0.1, size * 0.08);
        g.fill();
        g.circle(size * 0.12, size * 0.1, size * 0.08);
        g.fill();
        const t = label(shortWord(w), Math.max(16, Math.round(size * 0.3)),
            new Color(255, 255, 255, 255), true);
        t.setPosition(0, -size * 0.16, 0);
        n.addChild(t);
        parent.addChild(n);
        return n;
    }

    /* ================= HUD 刷新 ================= */
    private drawHearts(): void {
        if (!this.root || !this.root.isValid) return;
        this.heartGs.forEach((g, i) => drawHeart(g, 46, i < this.hearts));
    }

    private drawPips(): void {
        const g = this.pipG;
        if (!g || !this.root || !this.root.isValid) return;
        g.clear();
        const c = this.target ? Math.min(this.prog.cnt[this.target.w] || 0, NEED) : 0;
        for (let i = 0; i < NEED; i++) {
            const x = -30 + i * 30;
            if (i < c) {
                g.fillColor = C.gold;
                g.circle(x, 0, 9);
                g.fill();
            } else {
                g.strokeColor = new Color(62, 49, 40, 70);
                g.lineWidth = 2.5;
                g.circle(x, 0, 9);
                g.stroke();
            }
        }
    }

    private refreshHud(): void {
        if (this.lvLab) this.lvLab.string = '第' + (this.lvIdx + 1) + '关';
        if (this.cntLab) this.cntLab.string = '词灵 ' + capturedTotal(this.prog) + '/220';
    }

    /* ================= 通关庆祝 ================= */
    private celebrate(): void {
        this.busy = true;
        const ov = this.overlayBase();
        const card = panel(560, 820, C.card, 28, true);
        ov.addChild(card);
        popIn(card, 0, 0.3);
        const last = this.lvIdx >= 21;
        const title = label(last ? '220 只词灵全部救出！' : ('第' + (this.lvIdx + 1) + '关 完成！'),
            42, C.goldDark, true);
        title.setPosition(0, 300, 0);
        card.addChild(title);
        const sub = label(last ? '你就是词灵大英雄！' : '下一关词灵在等你～', 28, C.ink2, false);
        sub.setPosition(0, 235, 0);
        card.addChild(sub);
        // 本关 10 只词灵列队
        this.levelWords().forEach((sw, k) => {
            const pet = this.makePet(card, sw.w, 88);
            pet.setPosition(-210 + (k % 5) * 105, 90 - Math.floor(k / 5) * 110, 0);
            popIn(pet, 0.06 * k, 0.3);
            pet.on(Node.EventType.TOUCH_END, () => this.playWord(sw));   // 点词灵听发音
        });
        // 礼花三连
        [0, 300, 600].forEach((ms, k) => setTimeout(() => {
            if (ov.isValid) burst(card, new Vec3(-140 + k * 140, 0, 0), [C.gold, C.green, C.math, C.en], 14);
        }, ms));
        sfx('coin');
        // 解锁下一关
        if (!last) {
            button(card, 240, 90, '下一关', C.green, new Color(255, 255, 255, 255), () => {
                ov.destroy();
                this.busy = false;
                this.initLevel(this.lvIdx + 1);
            }, 32).setPosition(0, -220, 0);
        } else {
            button(card, 240, 90, '再跳一关', C.green, new Color(255, 255, 255, 255), () => {
                ov.destroy();
                this.busy = false;
                this.initLevel(this.lvIdx);   // 满关重玩=复习模式
            }, 32).setPosition(0, -220, 0);
        }
        button(card, 240, 90, '看图鉴', C.btnSoft, C.ink, () => {
            ov.destroy();
            this.busy = false;
            this.collection();
        }, 32).setPosition(0, -330, 0);
    }

    /* ================= 心心用完: 歇一会儿(无惩罚) ================= */
    private restOverlay(): void {
        const ov = this.overlayBase();
        const card = panel(520, 420, C.card, 28, true);
        ov.addChild(card);
        popIn(card, 0, 0.3);
        const t1 = label('小书童累了…', 40, C.ink, true);
        t1.setPosition(0, 90, 0);
        const t2 = label('词灵们等你休息好再来救它们', 26, C.ink2, false);
        t2.setPosition(0, 25, 0);
        card.addChild(t1);
        card.addChild(t2);
        button(card, 240, 90, '继续跳！', C.green, new Color(255, 255, 255, 255), () => {
            ov.destroy();
            this.hearts = 3;
            this.combo = 0;
            this.drawHearts();
            this.busy = false;
            if (this.target) this.round(this.target);
            else this.round();
        }, 32).setPosition(0, -110, 0);
    }

    /* ================= 词灵图鉴(22 关收集进度) ================= */
    private collection(): void {
        if (!this.bank) return;
        const ov = this.overlayBase();
        const showChips = () => {
            ov.removeAllChildren();
            const card = panel(640, 960, C.card, 28, true);
            ov.addChild(card);
            popIn(card, 0, 0.25);
            const title = label('词灵图鉴 · ' + capturedTotal(this.prog) + '/220', 36, C.goldDark, true);
            title.setPosition(0, 420, 0);
            card.addChild(title);
            for (let li = 0; li < 22; li++) {
                const lw = this.bank ? this.bank.levels[li].words : [];
                const got = lw.filter((x) => this.prog.caps[x.w]).length;
                const unlocked = li <= this.prog.unlocked;
                const complete = got >= lw.length && lw.length > 0;
                const col = complete ? C.green : (unlocked ? C.goldDark : new Color(62, 49, 40, 40));
                const chip = button(card, 130, 96, '第' + (li + 1) + '关', col,
                    unlocked ? new Color(255, 255, 255, 255) : C.ink2, () => {
                        if (!unlocked) { sfx('wrong'); return; }
                        sfx('click');
                        showDetail(li);
                    }, 26);
                chip.setPosition(-225 + (li % 4) * 150, 300 - Math.floor(li / 4) * 118, 0);
                const mini = label(got + '/' + lw.length, 20, unlocked ? C.ink : C.ink2, false);
                mini.setPosition(0, -28, 0);
                chip.addChild(mini);
            }
            button(card, 200, 80, '关闭', C.btnSoft, C.ink, () => ov.destroy(), 28)
                .setPosition(0, -420, 0);
        };
        const showDetail = (li: number) => {
            if (!ov.isValid || !this.bank) return;
            ov.removeAllChildren();
            const card = panel(640, 960, C.card, 28, true);
            ov.addChild(card);
            popIn(card, 0, 0.25);
            const lw = this.bank.levels[li].words;
            const got = lw.filter((x) => this.prog.caps[x.w]).length;
            const title = label('第' + (li + 1) + '关 · ' + got + '/' + lw.length, 34, C.goldDark, true);
            title.setPosition(0, 420, 0);
            card.addChild(title);
            lw.forEach((sw, k) => {
                const has = !!this.prog.caps[sw.w];
                let cell: Node;
                if (has) {
                    cell = this.makePet(card, sw.w, 108);
                    cell.on(Node.EventType.TOUCH_END, () => this.playWord(sw));
                } else {
                    cell = uiNode('unknown');
                    cell.addComponent(UITransform).setContentSize(108, 108);
                    const gg = cell.addComponent(Graphics);
                    gg.fillColor = new Color(62, 49, 40, 26);
                    gg.circle(0, 0, 54);
                    gg.fill();
                    const q = label('？', 40, C.ink2, false);
                    cell.addChild(q);
                }
                cell.setPosition(-210 + (k % 5) * 105, 290 - Math.floor(k / 5) * 130, 0);
                popIn(cell, 0.05 * k, 0.3);
            });
            if (li !== this.lvIdx && li <= this.prog.unlocked) {
                button(card, 260, 90, '去这里玩', C.green, new Color(255, 255, 255, 255), () => {
                    ov.destroy();
                    this.busy = false;
                    this.initLevel(li);
                }, 30).setPosition(0, -260, 0);
            }
            button(card, 200, 80, '返回', C.btnSoft, C.ink, () => { sfx('click'); showChips(); }, 28)
                .setPosition(0, -380, 0);
        };
        showChips();
    }

    /* ================= 小工具 ================= */
    private overlayBase(): Node {
        const ov = uiNode('overlay');
        const ut = ov.addComponent(UITransform);
        ut.setContentSize(1400, 2400);
        const g = ov.addComponent(Graphics);
        g.fillColor = C.mask;
        g.rect(-700, -1200, 1400, 2400);
        g.fill();
        ov.addComponent(BlockInputEvents);
        ov.on(Node.EventType.TOUCH_END, () => { /* 吞噬 */ });
        this.root.addChild(ov);
        return ov;
    }

    private floatText(str: string, color: Color, y: number): void {
        const t = label(str, y ? 40 : 30, color, true);
        t.setPosition(0, y ? y : 205, 0);
        this.root.addChild(t);
        floatUp(t, 0, 26);
        const op = t.addComponent(UIOpacity);
        tween(op).delay(0.75).to(0.3, { opacity: 0 }).call(() => t.destroy()).start();
    }

    private playWord(sw: SW): void {
        const hit = this.clips[sw.w];
        if (hit) { try { hit.play(); } catch (e) { /* ignore */ } return; }
        if (hit === null) return;   // 已知加载失败, 不再重复请求
        loadAudio(audioUrl(sw.au), (clip) => {
            this.clips[sw.w] = clip || null;
            if (clip) { try { clip.play(); } catch (e) { /* ignore */ } }
        });
    }

    private later(fn: () => void, ms: number): void {
        setTimeout(() => {
            if (this.root && this.root.isValid) fn();
        }, ms);
    }

    /** 点错抖动(左右衰减, 净位移 0) */
    private shake(n: Node): void {
        tween(n)
            .by(0.05, { position: new Vec3(-10, 0, 0) })
            .by(0.05, { position: new Vec3(20, 0, 0) })
            .by(0.05, { position: new Vec3(-14, 0, 0) })
            .by(0.05, { position: new Vec3(4, 0, 0) })
            .start();
    }
}

/* ---------- 本地工具 ---------- */

/** Fisher-Yates 洗牌(不改原数组) */
function shuffled<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
}

/** 心心: 两圆 + 下三角(filled=红心, 空=淡描边) */
function drawHeart(g: Graphics, size: number, filled: boolean): void {
    g.clear();
    const r = size * 0.26;
    if (filled) {
        g.fillColor = C.red;
        g.circle(-r * 0.85, r * 0.5, r);
        g.fill();
        g.circle(r * 0.85, r * 0.5, r);
        g.fill();
        g.moveTo(-r * 1.7, r * 0.4);
        g.lineTo(0, -size * 0.5);
        g.lineTo(r * 1.7, r * 0.4);
        g.close();
        g.fill();
    } else {
        g.strokeColor = new Color(62, 49, 40, 60);
        g.lineWidth = 3;
        g.circle(-r * 0.85, r * 0.5, r);
        g.stroke();
        g.circle(r * 0.85, r * 0.5, r);
        g.stroke();
        g.moveTo(-r * 1.7, r * 0.4);
        g.lineTo(0, -size * 0.5);
        g.lineTo(r * 1.7, r * 0.4);
        g.close();
        g.stroke();
    }
}

/** 词灵配色按词哈希稳定取色 */
function petColor(w: string): Color {
    let h = 0;
    const s = w.toLowerCase();
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PET_COLORS[h % PET_COLORS.length];
}

/** 长词在词灵小圆里缩写(their -> th..r 不行, 直接全显+缩字号由字号负责) */
function shortWord(w: string): string {
    return w.length <= 6 ? w : w.slice(0, 5) + '…';
}

function capturedTotal(prog: Prog): number {
    return Object.keys(prog.caps).length;
}
