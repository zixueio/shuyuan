/**
 * 英语争霸 — 关卡宿主(滑动窗口制, 用户定版 2026-11-17:
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
 * 数据 = WordData.ts 内联词表(源 resources/data/sight_words.json, 22 级 x
 * 10 词展平 = 220; CLI 构建稳定跳过 resources bundle, 内联随脚本直出);
 * 插画 = cards 分包 flipart/{art}.webp(word_prompts.py 220 条批量生成)。
 */
import { Node, Vec3, Label, UITransform, Graphics } from 'cc';
import { C, uiNode, label, burst, button, getCards } from './Theme';
import { FlipCard, FlipWord } from './FlipCard';
import { SIGHT_WORDS } from './WordData';
import { saveLocal, loadLocal, mgReport } from '../api/mgapi';
import { Toast } from './Toast';

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

        const title = label('英语争霸', 56, C.ink, true);
        title.setPosition(0, 560, 0);
        root.addChild(title);
        // 版本戳: 屏顶小字——真机肉眼即验「跑的是哪份构建」。v26·1119 屏显
        // 诊断只到「失败了」; v27·1119 加远程上报(boot/err/包/卡全链信标
        // POST ruci /mgapi/mglog), 扫码后服务器直读真机完整崩溃栈, 不再盲猜
        const ver = label('v27·1119', 20, C.ink2, true);
        ver.setPosition(0, 615, 0);
        root.addChild(ver);
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

        const hintBase = '翻开一张单词卡和一张图片卡, 同一个词就配成一对';
        const hint = label(hintBase, 26, C.ink2);
        hint.setPosition(0, -560, 0);
        root.addChild(hint);
        // 缺图/缺声计数轮询: FlipCard 静态计数 1.5s 刷进提示行(全 0 不加后缀)
        // ——PC 模拟器读的是本地包, 仍缺图/缺声时数字能区分「包里缺文件」
        // 与「加载链路失败」, 真机黑盒排障不再盲猜; v26 带出最近失败原因
        const hintLab = hint.getComponent(Label) as Label;
        setInterval(() => {
            const a = FlipCard.artFail, s = FlipCard.auFail;
            if (a || s) {
                hintLab.string = hintBase + '  ⚠缺图' + a + ' 缺声' + s
                    + (FlipCard.lastArtErr ? ' ' + FlipCard.lastArtErr : '');
            }
        }, 1500);

        // Graphics 渲染探针(round10): 至今真机上被确认可见的只有 Label
        // (标题/说明), 没有任何一处 Graphics 内容(卡面/蛋/占位圈/按钮)
        // 被确认渲染过——左下角金色小方块: 看得到=Graphics 正常, 卡牌
        // 隐身在别处; 看不到=真机 Graphics 不渲染, 下轮改纯 Label 重写卡面
        const probe = uiNode('gprobe');
        probe.addComponent(UITransform).setContentSize(44, 44);
        const pg = probe.addComponent(Graphics);
        pg.fillColor = C.gold;
        pg.roundRect(-22, -22, 44, 44, 8);
        pg.fill();
        probe.setPosition(-240, -615, 0);
        root.addChild(probe);
    }

    /** Boot 调: 词表已内联(WordData.ts), 22 级展平进池, 进当前关发卡。
     *  round9: 词表异常时屏显诊断(真机黑盒唯一可见窗口), 不再静默断链。
     *  v26: cards 分包探针——启动即 loadBundle 一次(loadBundle 内部缓存,
     *  卡片 addArt/loadClip 复用同一结果), 失败原因写副标题; 此前缺图只
     *  出「⚠缺图N」计数, 分包加载失败与包内缺文件在屏上无法区分。 */
    startInit(): void {
        const lvls = SIGHT_WORDS && SIGHT_WORDS.levels;
        if (!lvls || !lvls.length) {
            const msg = '词表加载失败 levels=' + (lvls ? lvls.length : 'undefined');
            this.subLab.string = msg;
            Toast.show(msg, C.red);
            return;
        }
        for (const lv of lvls) this.allWords.push(...lv.words);
        mgReport('start', {words: this.allWords.length, level: this.level});
        this.startLevel();
        // v29: 探针改走 getCards 单例(与 addArt/loadClip/sfx 同一条加载链,
        // 只发一次 loadBundle, 成功缓存); 直接 assetManager.loadBundle 会与
        // 并发 addArt 各开一趟, 空桩 game.js 时代挂 17s 的失败态被 SystemJS
        // 缓存后整包全爆——统一入口后游戏代码永不重入加载链。
        getCards((bundle: any) => {
            mgReport('bundle', {ok: !!bundle});
            if (!bundle) {
                const msg = 'cards包失败 null';
                this.subLab.string += '  ⚠' + msg;
                Toast.show(msg, C.red);
            }
            // 成功不占屏: 卡翻开后图直接出 = 分包健康, 不打扰
        });
    }

    /** 进关发卡: 第 N 关词窗 = slice(max(0,N-7), N), 布局按窗口词数选档;
     *  换关先清上一关的卡, 容器换缩放, 副题/按钮/横幅全部复位。 */
    private startLevel(): void {
        const n = this.level;
        const win = this.allWords.slice(Math.max(0, n - WINDOW), n);
        this.total = win.length;
        const lay = LAYOUTS[win.length];
        if (!lay) {
            const msg = '布局缺失 win=' + win.length + ' level=' + n
                + ' pool=' + this.allWords.length;
            this.subLab.string = msg;
            Toast.show(msg, C.red);
            return;
        }
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
        // v25 硬化: 单卡建失败不炸整关——一张卡构造抛错(引擎建节点异常)
        // 只损失该卡, 其余照常出, 失败数红字上屏; 此前一张卡炸 = 整关白屏
        // + 微信原生报错浮层, 真机黑盒读不出哪步死的
        let bad = 0;
        this.slots.forEach((s, i) => {
            try {
                const c = new FlipCard(win[s.idx], this.zone, {
                    kind: s.kind,
                    onFront: () => this.onFront(c),
                });
                c.node.setPosition(s.x, s.y, 0);
                // round10: 卡牌出生即全显, 彻底删掉入场动画依赖——round9 的
                // popIn+1.5s 强制 opacity 保险下真机仍全黑且零 ERR, 说明保险
                // 链路(tween/setTimeout)本身在真机不可靠, 不再赌
                c.node.setScale(1, 1, 1);
                this.cards.push(c);
            } catch (err: any) {
                bad += 1;
                console.error('[FlipDemo] card#' + i + ' build fail', err);
            }
        });
        if (bad) {
            const msg = '建卡失败 ' + bad + '/' + this.slots.length;
            this.subLab.string += '  ⚠' + msg;
            Toast.show(msg, C.red);
        }
        // v27 每关收尾上报: 卡建了几个/缺图缺声计数/最近失败原因——扫码后
        // 服务器一眼看出卡区是真没建出来还是建了渲染丢
        mgReport('level', {level: this.level, total: this.total,
            cards: this.cards.length, bad: bad,
            artFail: FlipCard.artFail, auFail: FlipCard.auFail,
            artErr: FlipCard.lastArtErr});
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
