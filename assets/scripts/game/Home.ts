/**
 * 书院小掌柜 — 书院主界面
 *
 * 布局(竖屏 720x1280 设计, FIXED_HEIGHT 适配窄屏):
 *   顶部 HUD 卡(铜钱/学识/签到) -> 收租条(有离线收益时) -> 标题
 *   -> 算学馆卡 / 书斋卡(答题+升级) -> 底部提示(预留 banner 安全区)
 * 所有数字随 Store 状态刷新; 弹层(答题面板等)挂 overlays 容器。
 */
import { Node, Color, Graphics, UITransform, Label, UIOpacity } from 'cc';
import { C, uiNode, label, panel, button, fillRect, drawHouse } from './Theme';
import { Store, MgState } from './Store';
import { QuizPanel } from './QuizPanel';
import { Toast } from './Toast';
import { hasRewarded, showRewarded, showBanner } from './Ads';

const CARD_W = 560;
const MAX_LV = 5;

export class Home {
    private store: Store;
    private host: Node;        // 全屏容器(Canvas 子节点)
    private page!: Node;        // 主界面容器
    private overlays!: Node;    // 弹层容器(答题面板等)

    private coinsLab: Label | null = null;
    private knowLab: Label | null = null;
    private rentCard: Node | null = null;
    private rentLab: Label | null = null;
    private lvLabs: { [k: string]: Label | null } = { math: null, en: null };
    private upBtns: { [k: string]: Node | null } = { math: null, en: null };
    private signBtn: Node | null = null;
    private signLab: Label | null = null;
    private initCard: Node | null = null;

    constructor(store: Store, host: Node) {
        this.store = store;
        this.host = host;
    }

    build(): void {
        const page = this.page = uiNode('page');
        // 背景: 全屏米黄(超绘防露边) + 顶部色带
        page.addChild(fillRect(2000, 3000, C.bg));
        const band = fillRect(2000, 260, C.band);
        band.setPosition(0, 640, 0);
        page.addChild(band);

        // 顶部 HUD 卡
        const hud = panel(CARD_W, 104, C.card, 20);
        hud.setPosition(0, 560, 0);
        page.addChild(hud);

        const coins = label('铜钱 0', 30, C.goldDark, true);
        coins.setPosition(-175, 0, 0);
        hud.addChild(coins);
        this.coinsLab = coins.getComponent(Label);

        const know = label('学识 0', 30, C.math, true);
        know.setPosition(10, 0, 0);
        hud.addChild(know);
        this.knowLab = know.getComponent(Label);

        const sb = button(hud, 130, 72, '签到', C.gold, new Color(255, 255, 255, 255), () => this.onSign(), 28);
        sb.setPosition(190, 0, 0);
        this.signBtn = sb;
        this.signLab = sb.children[0] ? sb.children[0].getComponent(Label) : null;

        // 收租条(默认藏, 有离线收益显示)
        const rent = this.rentCard = panel(CARD_W, 96, new Color(255, 240, 210, 255), 20);
        rent.setPosition(0, 460, 0);
        rent.active = false;
        page.addChild(rent);
        const rl = label('小书童带回了 0 铜钱', 27, C.ink, true);
        rl.setPosition(-90, 0, 0);
        rent.addChild(rl);
        this.rentLab = rl.getComponent(Label);
        const take = button(rent, 120, 68, '收取', C.green, new Color(255, 255, 255, 255), () => this.onCollect(false), 26);
        take.setPosition(150, 0, 0);
        const x2 = button(rent, 110, 68, 'x2', C.gold, new Color(255, 255, 255, 255), () => this.onCollect(true), 26);
        x2.setPosition(255, 0, 0);
        x2.active = hasRewarded();

        // 标题
        const title = label('书 院 小 掌 柜', 52, C.ink, true);
        title.setPosition(0, 360, 0);
        page.addChild(title);

        // 两座建筑卡
        this.buildBuilding('math', '算学馆', '口算四选一, 答对 2 x 等级 铜钱', C.math, 190);
        this.buildBuilding('en', '书斋', '看图听音认单词, 答对 3 x 等级 铜钱', C.en, -140);

        // 底部说明(banner 安全区上方)
        const foot = label('答题赚铜钱 · 建楼升级 · 小书童离线打工', 24, C.ink2, false);
        foot.setPosition(0, -360, 0);
        page.addChild(foot);

        // 初始化占位卡(连接中/失败重试), 登录成功后移除
        this.showInitCard();

        this.host.addChild(page);
        const overlays = this.overlays = uiNode('overlays');
        this.host.addChild(overlays);

        // 状态刷新
        this.store.on(() => this.refresh());
    }

    /** 一张建筑卡 */
    private buildBuilding(key: string, name: string, desc: string, color: Color, y: number): void {
        const card = panel(CARD_W, 270, C.card, 24);
        card.setPosition(0, y, 0);
        this.page.addChild(card);

        // 左侧房子图标
        const icon = uiNode('icon');
        icon.setPosition(-195, 10, 0);
        const ut = icon.addComponent(UITransform);
        ut.setContentSize(150, 150);
        const g = icon.addComponent(Graphics);
        drawHouse(g, 150, 150, color);
        card.addChild(icon);

        // 名称 + 等级
        const nm = label(name, 38, C.ink, true);
        nm.setPosition(90, 85, 0);
        card.addChild(nm);
        const lv = label('Lv.1', 28, C.goldDark, true);
        lv.setPosition(225, 88, 0);
        card.addChild(lv);
        this.lvLabs[key] = lv.getComponent(Label);

        // 描述
        const de = label(desc, 24, C.ink2, false);
        de.setPosition(90, 38, 0);
        card.addChild(de);

        // 按钮行: 开始答题 / 升级
        const play = button(card, 250, 92, '开始答题', color, new Color(255, 255, 255, 255), () => {
            if (!this.store.ready) { Toast.show('还在连接书院...', C.red); return; }
            new QuizPanel(this.store, this.overlays, key);
        }, 30);
        play.setPosition(-100, -70, 0);

        const up = this.upBtns[key] = button(card, 230, 92, '升级', C.btnSoft, C.ink, () => this.onUpgrade(key), 28);
        up.setPosition(175, -70, 0);
    }

    /** 初始化占位卡: 连接中 / 失败可点重试 */
    private showInitCard(): void {
        if (this.initCard && this.initCard.isValid) this.initCard.destroy();
        const card = this.initCard = panel(420, 200, C.card, 24);
        card.setPosition(0, 30, 0);
        const t = label('连接书院中...', 32, C.ink, true);
        card.addChild(t);
        this.page.addChild(card);
        card.on(Node.EventType.TOUCH_END, () => this.retryInit());
    }

    private setInitText(msg: string): void {
        const card = this.initCard;
        if (card && card.isValid && card.children[0]) {
            const l = card.children[0].getComponent(Label);
            if (l) l.string = msg;
        }
    }

    private retryInit(): void {
        if (this.store.ready) return;
        this.setInitText('连接书院中...');
        this.bootInit();
    }

    private bootInit(): void {
        this.store.init().then(() => {
            if (this.initCard && this.initCard.isValid) this.initCard.destroy();
            this.initCard = null;
            showBanner(); // 登录成功再拉 banner
        }).catch(() => {
            this.setInitText('网络开小差了, 点击重试');
        });
    }

    /** 首次进入后由 Boot 调用 */
    startInit(): void {
        this.bootInit();
    }

    /** 全量刷新 HUD/卡片 */
    refresh(): void {
        const s: MgState | null = this.store.state;
        if (!s) return;
        if (this.coinsLab) this.coinsLab.string = '铜钱 ' + s.coins;
        if (this.knowLab) this.knowLab.string = '学识 ' + s.knowledge;
        if (this.lvLabs.math) this.lvLabs.math.string = 'Lv.' + s.math_lv;
        if (this.lvLabs.en) this.lvLabs.en.string = 'Lv.' + s.english_lv;

        // 升级按钮文案: 满级/没钱置灰提示, 点击有守卫 Toast
        ['math', 'en'].forEach(key => {
            const lv = key === 'math' ? s.math_lv : s.english_lv;
            const cost = s.upgrade_cost
                ? (s.upgrade_cost[key === 'math' ? 'math' : 'english'] || 0) : 0;
            const b = this.upBtns[key];
            if (!b || !b.isValid) return;
            const l = b.children[0] ? b.children[0].getComponent(Label) : null;
            const full = lv >= MAX_LV;
            const poor = s.coins < cost;
            if (l) l.string = full ? '已满级' : ('升级 -' + cost);
            setGrey(b, full || poor);
        });

        // 签到按钮
        if (this.signLab) this.signLab.string = s.can_sign ? '签到' : '已签';
        if (this.signBtn) setGrey(this.signBtn, !s.can_sign);

        // 收租条
        if (this.rentCard) {
            const has = s.offline_coins > 0;
            this.rentCard.active = has;
            if (has && this.rentLab) this.rentLab.string = '小书童带回了 ' + s.offline_coins + ' 铜钱';
        }
    }

    /* ---------- 动作 ---------- */
    private onSign(): void {
        const s = this.store.state;
        if (!s) return;
        if (!s.can_sign) { Toast.show('今天已经签过啦', C.ink2); return; }
        this.store.doSign().then((r: any) => {
            if (r.signed === false) Toast.show('今天已经签过啦', C.ink2);
            else Toast.show('签到 +' + r.coins_added + ' 铜钱', C.goldDark);
        }).catch((e: any) => Toast.show(String(e && e.message || '签到失败'), C.red));
    }

    private onCollect(ad: boolean): void {
        const s = this.store.state;
        if (!s || s.offline_coins <= 0) return;
        const go = () => {
            this.store.doCollect(ad).then((r: any) => {
                Toast.show('收取 +' + r.gained + ' 铜钱', C.goldDark);
            }).catch((e: any) => Toast.show(String(e && e.message || '收取失败'), C.red));
        };
        if (ad && hasRewarded()) {
            showRewarded().then((ok: boolean) => {
                if (ok) go();
                else Toast.show('广告没看完, 没有双倍哦', C.red);
            });
        } else {
            go();
        }
    }

    private onUpgrade(key: string): void {
        const s = this.store.state;
        if (!s) return;
        const lv = key === 'math' ? s.math_lv : s.english_lv;
        const cost = s.upgrade_cost
            ? (s.upgrade_cost[key === 'math' ? 'math' : 'english'] || 0) : 0;
        if (lv >= MAX_LV) { Toast.show('已经满级啦', C.ink2); return; }
        if (s.coins < cost) { Toast.show('铜钱不够, 再答几题吧', C.red); return; }
        this.store.doUpgrade(key === 'math' ? 'math' : 'english').then((r: any) => {
            Toast.show((key === 'math' ? '算学馆' : '书斋') + '升到 Lv.' + r.lv, C.math);
        }).catch((e: any) => Toast.show(String(e && e.message || '升级失败'), C.red));
    }
}

/** 置灰: 半透明 */
function setGrey(n: Node, grey: boolean): void {
    let op = n.getComponent(UIOpacity);
    if (!op) op = n.addComponent(UIOpacity);
    op.opacity = grey ? 140 : 255;
}
