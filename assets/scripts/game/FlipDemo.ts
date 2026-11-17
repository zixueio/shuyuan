/**
 * 翻翻乐 — 关卡宿主(第 2 关)
 *
 * 用户定版: 每一关新增一个单词(第 N 关 = 220 词表前 N 个词);
 * 当前第 2 关 = a(复习) + and(新词) -> 2 词 4 卡(每词=单词卡+图片卡)。
 * 全部盖着, 点哪张翻面都读词(FlipCard playOneShot, 连翻两张都出声);
 * 翻开两卡是同一个词 = 配对成功, 上锁「留下」+ 横幅 + 粒子;
 * 不是一对 = 900ms 后两卡自动翻回再试;
 * 两对全配齐 = 第 2 关完成 -> 「再玩一次」(第 3 关插画齐后 LEVEL 改 3 即得)。
 * 布局(720x1280): 标题(560) + 副题(496) + 卡区容器 0.7 缩放(容器内 2x2
 * 摆 ±231,±236, 世界坐标 = ±162,±165) + 横幅(-360) + 再玩一次(-445)
 * + 底部提示(-560)。缩放挂容器而不挂卡片: FlipCard 翻面 tween/pulse 都以
 * 卡片 scale 1 为基准, 容器统一缩放互不打架。
 * 数据 = resources/data/sight_words.json(levels[0].words 前 2 个, py 拼音
 * 已预生成进词库); 插画 = word_art_raw -> assets/resources/flipart/{a,and}.png。
 */
import { Node, Vec3, Label, JsonAsset, resources, UITransform } from 'cc';
import { C, uiNode, label, popIn, burst, button } from './Theme';
import { FlipCard, FlipWord } from './FlipCard';

const LEVEL = 2;   // 第 N 关 = 词表前 N 个词(第 3 关插画齐后改成 3 即得)
const ZOOM = 0.7;  // 卡区容器缩放(卡本体 300x400)

/** 摆位(容器内局部坐标, 乘 ZOOM = 世界): 词a 左上 / 图and 右上 /
 *  词and 左下 / 图a 右下, 同词对角分布(记忆游戏惯例, 防一眼看穿) */
const SLOTS: { x: number; y: number; kind: 'word' | 'pic'; idx: number }[] = [
    { x: -231, y: 236, kind: 'word', idx: 0 },
    { x: 231, y: 236, kind: 'pic', idx: 1 },
    { x: -231, y: -236, kind: 'word', idx: 1 },
    { x: 231, y: -236, kind: 'pic', idx: 0 },
];

export class FlipDemo {
    private readonly root: Node;
    private readonly zone: Node;
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
        const title = label('翻翻乐', 56, C.ink, true);
        title.setPosition(0, 560, 0);
        root.addChild(title);
        const sub = label('第 2 关 · 2 词 4 卡 · 复习 a + 新词 and', 28, C.ink2);
        sub.setPosition(0, 496, 0);
        root.addChild(sub);

        // 卡区容器: 统一 0.7 缩放, 卡片本体保持 scale 1
        this.zone = uiNode('flipzone');
        this.zone.addComponent(UITransform);
        this.zone.setScale(ZOOM, ZOOM, 1);
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

    /** 发卡: 对角摆位, 容器内 popIn(局部 scale 1 收尾正确, 缩放由容器管) */
    private buildCards(words: FlipWord[]): void {
        SLOTS.forEach((s, i) => {
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
            // 庆祝粒子落在两卡中点(局部坐标乘 ZOOM 还原到世界)
            const mx = (a.node.position.x + b.node.position.x) / 2 * ZOOM;
            const my = (a.node.position.y + b.node.position.y) / 2 * ZOOM;
            burst(this.root, new Vec3(mx, my, 0), [C.gold, C.green, C.en], 14);
            if (this.done.size >= this.total) {
                this.bannerLab.string =
                    '第 2 关完成！ ' + Array.from(this.done).join(' · ') + ' 全配齐';
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
