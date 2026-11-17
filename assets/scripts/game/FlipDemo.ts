/**
 * 翻翻乐 — 关卡宿主(滑动窗口制, 用户定版 2026-11-17:
 * 「每个词出现到七关后就不用再出现了, 所以最多 14 张牌」):
 * 每一关新增一个单词, 每个词入关后保留 7 关退出 ——
 * 第 N 关 = 220 词表第 max(1,N-6)..N 个词(共 min(N,7) 词, 最多 14 卡),
 * 全程 220 关; 进度存档 mgapi.saveLocal('flip_prog_v1'){level}, 启动续玩;
 * 过关后「下一关」+「再玩一次」并排(第 220 关只留「再玩一次」)。
 * 全部盖着, 点哪张翻面都读词(FlipCard playOneShot, 连翻两张都出声);
 * 翻开两卡是同一个词 = 配对成功, 上锁「留下」+ 横幅 + 粒子;
 * 不是一对 = 900ms 后两卡自动翻回再试;
 * 本关对数全配齐 = 过关。
 * 布局(720x1280): 标题(560) + 副题(496, 词多时折两行) + 卡区容器
 * (LAYOUTS[nW].zoom 缩放) + 横幅(-360) + 下一关/再玩一次(-445)
 * + 底部提示(-560)。缩放挂容器而不挂卡片: FlipCard 翻面 tween/pulse
 * 都以卡片 scale 1 为基准, 容器统一缩放互不打架。
 * 每档布局进 LAYOUTS 表(卡位人工审): 1=单行 2 卡(0.85); 2=对角 2x2(0.7);
 * 3=2x3(0.62); 4=2x4(0.48); 5=2x5(0.40); 6=2x6(0.35, 世界校验宽
 * (850+150)*0.35=350<360); 7=2x7(0.30, (1020+150)*0.30=351<360);
 * 3~7 每列上下正好一词一图(交错)且上下 idx 不同 -> 同词两卡必不同列
 * (防上下相邻一眼看穿)。
 * 数据 = resources/data/sight_words.json(22 级 x 10 词展平 = 220);
 * 插画 = assets/resources/flipart/{art}.png(word_prompts.py 220 条
 * 批量生成, import_flipart.py 入库)。
 */
import { Node, Vec3, Label, JsonAsset, resources, UITransform } from 'cc';
import { C, uiNode, label, popIn, burst, button } from './Theme';
import { FlipCard, FlipWord } from './FlipCard';
import { saveLocal, loadLocal } from '../api/mgapi';

const PROG_KEY = 'flip_prog_v1';   // 进度存档键: {level: 第几关}
const MAX_LEVEL = 220;             // 220 词全表
const WINDOW = 7;                  // 每词保留 7 关

/** 每档布局(卡本体 300x400, zoom=卡区容器缩放, 槽位=容器内局部坐标):
 *  kind=word 单词卡 / pic 图片卡, idx=窗口内词序号(0 起)。 */
interface Slot { x: number; y: number; kind: 'word' | 'pic'; idx: number }
const LAYOUTS: Record<number, { zoom: number; slots: Slot[] }> = {
    1: {   // 单行 2 卡: 词 | 图
        zoom: 0.85,
        slots: [
            { x: -200, y: 0, kind: 'word', idx: 0 },
            { x: 200, y: 0, kind: 'pic', idx: 0 },
        ],
    },
    2: {   // 已过目确认的对角 2x2, 保持不动
        zoom: 0.7,
        slots: [
            { x: -231, y: 236, kind: 'word', idx: 0 },
            { x: 231, y: 236, kind: 'pic', idx: 1 },
            { x: -231, y: -236, kind: 'word', idx: 1 },
            { x: 231, y: -236, kind: 'pic', idx: 0 },
        ],
    },
    3: {   // 2 行 3 列: 上排 图and 词a 词and / 下排 图a 词away 图away
        zoom: 0.62,
        slots: [
            { x: -365, y: 230, kind: 'pic', idx: 1 },
            { x: 0, y: 230, kind: 'word', idx: 0 },
            { x: 365, y: 230, kind: 'word', idx: 1 },
            { x: -365, y: -230, kind: 'pic', idx: 0 },
            { x: 0, y: -230, kind: 'word', idx: 2 },
            { x: 365, y: -230, kind: 'pic', idx: 2 },
        ],
    },
    4: {   // 2 行 4 列: 上排 词a 图big 词away 图and / 下排 图away 词and 图a 词big
        zoom: 0.48,
        slots: [
            { x: -547, y: 230, kind: 'word', idx: 0 },
            { x: -183, y: 230, kind: 'pic', idx: 3 },
            { x: 183, y: 230, kind: 'word', idx: 2 },
            { x: 547, y: 230, kind: 'pic', idx: 1 },
            { x: -547, y: -230, kind: 'pic', idx: 2 },
            { x: -183, y: -230, kind: 'word', idx: 1 },
            { x: 183, y: -230, kind: 'pic', idx: 0 },
            { x: 547, y: -230, kind: 'word', idx: 3 },
        ],
    },
    5: {   // 2 行 5 列: 每列上下正好一词一图(交错), 同词自然不同列:
        // 上排 词a 图and 词away 图blue 词big / 下排 图big 词blue 图a 词and 图away
        zoom: 0.4,
        slots: [
            { x: -728, y: 230, kind: 'word', idx: 0 },
            { x: -364, y: 230, kind: 'pic', idx: 1 },
            { x: 0, y: 230, kind: 'word', idx: 2 },
            { x: 364, y: 230, kind: 'pic', idx: 4 },
            { x: 728, y: 230, kind: 'word', idx: 3 },
            { x: -728, y: -230, kind: 'pic', idx: 3 },
            { x: -364, y: -230, kind: 'word', idx: 4 },
            { x: 0, y: -230, kind: 'pic', idx: 0 },
            { x: 364, y: -230, kind: 'word', idx: 1 },
            { x: 728, y: -230, kind: 'pic', idx: 2 },
        ],
    },
    6: {   // 2 行 6 列(宽 (850+150)*0.35=350<360):
        // 上排 词0 图4 词1 图5 词2 图3 / 下排 图1 词3 图2 词4 图0 词5
        // 逐列验: 0:0/1 1:4/3 2:1/2 3:5/4 4:2/0 5:3/5; 配对列全不同
        zoom: 0.35,
        slots: [
            { x: -850, y: 230, kind: 'word', idx: 0 },
            { x: -510, y: 230, kind: 'pic', idx: 4 },
            { x: -170, y: 230, kind: 'word', idx: 1 },
            { x: 170, y: 230, kind: 'pic', idx: 5 },
            { x: 510, y: 230, kind: 'word', idx: 2 },
            { x: 850, y: 230, kind: 'pic', idx: 3 },
            { x: -850, y: -230, kind: 'pic', idx: 1 },
            { x: -510, y: -230, kind: 'word', idx: 3 },
            { x: -170, y: -230, kind: 'pic', idx: 2 },
            { x: 170, y: -230, kind: 'word', idx: 4 },
            { x: 510, y: -230, kind: 'pic', idx: 0 },
            { x: 850, y: -230, kind: 'word', idx: 5 },
        ],
    },
    7: {   // 2 行 7 列(宽 (1020+150)*0.30=351<360):
        // 上排 词0 图4 词1 图5 词2 图6 词3 / 下排 图1 词5 图2 词6 图3 词4 图0
        // 逐列验: 0:0/1 1:4/5 2:1/2 3:5/6 4:2/3 5:6/4 6:3/0; 配对列全不同
        zoom: 0.3,
        slots: [
            { x: -1020, y: 230, kind: 'word', idx: 0 },
            { x: -680, y: 230, kind: 'pic', idx: 4 },
            { x: -340, y: 230, kind: 'word', idx: 1 },
            { x: 0, y: 230, kind: 'pic', idx: 5 },
            { x: 340, y: 230, kind: 'word', idx: 2 },
            { x: 680, y: 230, kind: 'pic', idx: 6 },
            { x: 1020, y: 230, kind: 'word', idx: 3 },
            { x: -1020, y: -230, kind: 'pic', idx: 1 },
            { x: -680, y: -230, kind: 'word', idx: 5 },
            { x: -340, y: -230, kind: 'pic', idx: 2 },
            { x: 0, y: -230, kind: 'word', idx: 6 },
            { x: 340, y: -230, kind: 'pic', idx: 3 },
            { x: 680, y: -230, kind: 'word', idx: 4 },
            { x: 1020, y: -230, kind: 'pic', idx: 0 },
        ],
    },
};

export class FlipDemo {
    private readonly root: Node;
    private readonly zone: Node;
    private readonly subLab: Label;
    private readonly banner: Node;
    private readonly bannerLab: Label;
    private readonly again: Node;
    private readonly next: Node;
    private allWords: FlipWord[] = [];      // 220 词全表(22 级展平)
    private level = 1;                      // 当前第几关(1 起, 存档续玩)
    private zoom = 1;
    private slots: Slot[] = [];
    private cards: FlipCard[] = [];
    private first: FlipCard | null = null;  // 当前翻开待配的第一张
    private busy = false;                   // 配错回翻等待期, 拦新判对
    private readonly done = new Set<string>();  // 本关已配对词
    private total = 1;                      // 本关对数(=窗口词数)

    constructor(root: Node) {
        this.root = root;
        const saved = loadLocal(PROG_KEY) as { level?: number } | null;
        const lv = saved && typeof saved.level === 'number'
            ? Math.floor(saved.level) : 1;
        this.level = lv >= 1 && lv <= MAX_LEVEL ? lv : 1;

        const title = label('翻翻乐', 56, C.ink, true);
        title.setPosition(0, 560, 0);
        root.addChild(title);
        const sub = label('', 28, C.ink2);
        sub.setPosition(0, 496, 0);
        root.addChild(sub);
        this.subLab = sub.getComponent(Label) as Label;

        // 卡区容器: 统一缩放, 卡片本体保持 scale 1(缩放随关卡档位换)
        this.zone = uiNode('flipzone');
        this.zone.addComponent(UITransform);
        root.addChild(this.zone);

        this.banner = label('', 40, C.green, true);
        this.banner.setPosition(0, -360, 0);
        this.banner.active = false;
        root.addChild(this.banner);
        this.bannerLab = this.banner.getComponent(Label) as Label;

        this.next = button(
            root, 300, 70, '下一关', C.green, C.card, () => this.advance(), 32,
        );
        this.next.setPosition(-170, -445, 0);
        this.next.active = false;

        this.again = button(
            root, 300, 70, '再玩一次', C.btnSoft, C.ink, () => this.reset(), 32,
        );
        this.again.setPosition(170, -445, 0);
        this.again.active = false;

        const hint = label('翻开一张单词卡和一张图片卡, 同一个词就配成一对', 26, C.ink2);
        hint.setPosition(0, -560, 0);
        root.addChild(hint);
    }

    /** Boot 调: 异步拉 220 词表(22 级展平), 进当前关发卡 */
    startInit(): void {
        resources.load('data/sight_words', JsonAsset,
            (err: Error | null, asset: JsonAsset | null) => {
                if (err || !asset || !asset.json) return;
                const data = asset.json as { levels: { words: FlipWord[] }[] };
                for (const lv of data.levels) this.allWords.push(...lv.words);
                this.startLevel();
            });
    }

    /** 进关发卡: 第 N 关词窗 = slice(max(0,N-7), N), 布局按窗口词数选档;
     *  换关先清上一关的卡, 容器换缩放, 副题/按钮/横幅全部复位。 */
    private startLevel(): void {
        const n = this.level;
        const win = this.allWords.slice(Math.max(0, n - WINDOW), n);
        this.total = win.length;
        const lay = LAYOUTS[win.length];
        this.zoom = lay.zoom;
        this.slots = lay.slots;
        this.zone.setScale(this.zoom, this.zoom, 1);
        this.subLab.string = this.subtitle(win);
        this.first = null;
        this.busy = false;
        this.done.clear();
        this.banner.active = false;
        this.again.active = false;
        this.next.active = false;
        for (const c of this.cards) c.node.destroy();
        this.cards.length = 0;
        this.slots.forEach((s, i) => {
            const c = new FlipCard(win[s.idx], this.zone, {
                kind: s.kind,
                onFront: () => this.onFront(c),
            });
            c.node.setPosition(s.x, s.y, 0);
            popIn(c.node, i * 0.08);
            this.cards.push(c);
        });
    }

    /** 副题: 词多(>=5)折两行防溢出 —— 行1 关卡信息, 行2 复习+新词 */
    private subtitle(win: FlipWord[]): string {
        const head = '第 ' + this.level + ' 关 · ' + win.length + ' 词 '
            + (win.length * 2) + ' 卡';
        if (win.length === 1) return head + ' · 新词 ' + win[0].w;
        const tail = '复习 ' + win.slice(0, -1).map(x => x.w).join(' ')
            + ' + 新词 ' + win[win.length - 1].w;
        return win.length >= 5 ? head + '\n' + tail : head + ' · ' + tail;
    }

    /** 一张卡翻到正面: 两张齐 -> 同词配对上锁 / 异词 900ms 回翻 */
    private onFront(c: FlipCard): void {
        if (this.busy) { c.resetBack(); return; }
        if (this.first === c) return;
        if (!this.first) { this.first = c; return; }
        const a = this.first;
        const b = c;
        this.first = null;
        if (a.word.w === b.word.w) {
            a.setLocked(true);
            b.setLocked(true);
            this.done.add(a.word.w);
            // 庆祝粒子落在两卡中点(局部坐标乘 zoom 还原到世界)
            const mx = (a.node.position.x + b.node.position.x) / 2 * this.zoom;
            const my = (a.node.position.y + b.node.position.y) / 2 * this.zoom;
            burst(this.root, new Vec3(mx, my, 0), [C.gold, C.green, C.en], 14);
            if (this.done.size >= this.total) {
                // 词多横幅全列会溢出 720, 按窗口词数降字号
                this.bannerLab.fontSize = this.total >= 7 ? 28
                    : (this.total >= 5 ? 32 : 40);
                this.bannerLab.string =
                    '第 ' + this.level + ' 关完成！ '
                    + Array.from(this.done).join(' · ') + ' 全配齐';
                if (this.level < MAX_LEVEL) this.next.active = true;
                this.again.setPosition(this.level < MAX_LEVEL ? 170 : 0, -445, 0);
                this.again.active = true;
                this.banner.active = true;
            } else {
                this.bannerLab.fontSize = 40;
                this.bannerLab.string = '配对成功！ ' + a.word.w + ' · ' + a.word.cn;
                this.banner.active = true;
            }
        } else {
            this.busy = true;
            setTimeout(() => {
                a.resetBack();
                b.resetBack();
                this.busy = false;
            }, 900);
        }
    }

    /** 下一关: 关号 +1 存档重开(第 220 关按钮不出现, 双保险拦) */
    private advance(): void {
        if (this.level >= MAX_LEVEL) return;
        this.level += 1;
        saveLocal(PROG_KEY, { level: this.level });
        this.startLevel();
    }

    /** 再玩一次: 全卡回背面 + 清配对态(同一关重开) */
    private reset(): void {
        this.first = null;
        this.busy = false;
        this.done.clear();
        this.banner.active = false;
        this.again.active = false;
        this.next.active = false;
        for (const k of this.cards) k.resetBack();
    }
}
