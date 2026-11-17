/**
 * 翻翻乐 — 关卡宿主(第 4 关)
 *
 * 用户定版: 每一关新增一个单词(第 N 关 = 220 词表前 N 个词);
 * 当前第 4 关 = a and away(复习) + big(新词) -> 4 词 8 卡(每词=单词卡+图片卡)。
 * 全部盖着, 点哪张翻面都读词(FlipCard playOneShot, 连翻两张都出声);
 * 翻开两卡是同一个词 = 配对成功, 上锁「留下」+ 横幅 + 粒子;
 * 不是一对 = 900ms 后两卡自动翻回再试;
 * 本关对数全配齐 = 第 LEVEL 关完成 -> 「再玩一次」。
 * 布局(720x1280): 标题(560) + 副题(496) + 卡区容器(LAYOUTS[LEVEL].zoom 缩放)
 * + 横幅(-360) + 再玩一次(-445) + 底部提示(-560)。缩放挂容器而不挂卡片:
 * FlipCard 翻面 tween/pulse 都以卡片 scale 1 为基准, 容器统一缩放互不打架。
 * 每关布局进 LAYOUTS 表(卡位要人工审): 第 2 关沿用已确认的对角 2x2;
 * 第 3 关 2 行 3 列(zoom 0.62, 世界校验宽 638<720 高 ±267 不碰副题/横幅);
 * 第 4 关 2 行 4 列(zoom 0.48, 宽 (547*2+300)*0.48=669<720 高 ±206),
 * 固定洗牌序保证同词两卡不同列(防上下相邻一眼看穿)。
 * 数据 = resources/data/sight_words.json(levels[0].words 前 LEVEL 个, py 拼音
 * 已预生成进词库); 插画 = word_art_raw -> assets/resources/flipart/{a,and,away}.png。
 */
import { Node, Vec3, Label, JsonAsset, resources, UITransform } from 'cc';
import { C, uiNode, label, popIn, burst, button } from './Theme';
import { FlipCard, FlipWord } from './FlipCard';

const LEVEL = 4;   // 第 N 关 = 词表前 N 个词(插画齐一关开一关)

/** 每关布局(卡本体 300x400, zoom=卡区容器缩放, 槽位=容器内局部坐标):
 *  kind=word 单词卡 / pic 图片卡, idx=词序号。同词两卡不同列(第 3 关)。 */
interface Slot { x: number; y: number; kind: 'word' | 'pic'; idx: number }
const LAYOUTS: Record<number, { zoom: number; slots: Slot[] }> = {
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
};

export class FlipDemo {
    private readonly root: Node;
    private readonly zone: Node;
    private readonly zoom: number;
    private readonly slots: Slot[];
    private readonly cards: FlipCard[] = [];
    private readonly banner: Node;
    private readonly bannerLab: Label;
    private readonly again: Node;
    private first: FlipCard | null = null;  // 当前翻开待配的第一张
    private busy = false;                   // 配错回翻等待期, 拦新判对
    private readonly done = new Set<string>();  // 已配对词
    private readonly total = LEVEL;         // 本关对数

    constructor(root: Node) {
        this.root = root;
        const lay = LAYOUTS[LEVEL];
        this.zoom = lay.zoom;
        this.slots = lay.slots;
        const title = label('翻翻乐', 56, C.ink, true);
        title.setPosition(0, 560, 0);
        root.addChild(title);
        const sub = label('第 4 关 · 4 词 8 卡 · 复习 a and away + 新词 big', 28, C.ink2);
        sub.setPosition(0, 496, 0);
        root.addChild(sub);

        // 卡区容器: 统一缩放, 卡片本体保持 scale 1
        this.zone = uiNode('flipzone');
        this.zone.addComponent(UITransform);
        this.zone.setScale(this.zoom, this.zoom, 1);
        root.addChild(this.zone);

        this.banner = label('', 40, C.green, true);
        this.banner.setPosition(0, -360, 0);
        this.banner.active = false;
        root.addChild(this.banner);
        this.bannerLab = this.banner.getComponent(Label) as Label;

        this.again = button(
            root, 300, 70, '再玩一次', C.btnSoft, C.ink, () => this.reset(), 32,
        );
        this.again.setPosition(0, -445, 0);
        this.again.active = false;

        const hint = label('翻开一张单词卡和一张图片卡, 同一个词就配成一对', 26, C.ink2);
        hint.setPosition(0, -560, 0);
        root.addChild(hint);
    }

    /** Boot 调: 异步拉 220 词表, 取前 LEVEL 个发卡 */
    startInit(): void {
        resources.load('data/sight_words', JsonAsset,
            (err: Error | null, asset: JsonAsset | null) => {
                if (err || !asset || !asset.json) return;
                const data = asset.json as { levels: { words: FlipWord[] }[] };
                this.buildCards(data.levels[0].words.slice(0, LEVEL));
            });
    }

    /** 发卡: 本关槽位摆布, 容器内 popIn(局部 scale 1 收尾正确, 缩放由容器管) */
    private buildCards(words: FlipWord[]): void {
        this.slots.forEach((s, i) => {
            const c = new FlipCard(words[s.idx], this.zone, {
                kind: s.kind,
                onFront: () => this.onFront(c),
            });
            c.node.setPosition(s.x, s.y, 0);
            popIn(c.node, i * 0.08);
            this.cards.push(c);
        });
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
                this.bannerLab.string =
                    '第 ' + LEVEL + ' 关完成！ '
                    + Array.from(this.done).join(' · ') + ' 全配齐';
                this.again.active = true;
            } else {
                this.bannerLab.string = '配对成功！ ' + a.word.w + ' · ' + a.word.cn;
            }
            this.banner.active = true;
        } else {
            this.busy = true;
            setTimeout(() => {
                a.resetBack();
                b.resetBack();
                this.busy = false;
            }, 900);
        }
    }

    /** 再玩一次: 全卡回背面 + 清配对态(同一关重开) */
    private reset(): void {
        this.first = null;
        this.busy = false;
        this.done.clear();
        this.banner.active = false;
        this.again.active = false;
        for (const k of this.cards) k.resetBack();
    }
}
