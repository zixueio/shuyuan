/**
 * 书院小掌柜 — 书院主界面
 *
 * 布局(竖屏 720x1280 设计, FIXED_HEIGHT 适配窄屏):
 *   顶部 HUD 卡(铜钱/学识/签到) -> 收租条(有离线收益时) -> 标题
 *   -> 算学馆卡 / 书斋卡(答题+升级) -> 底部提示(预留 banner 安全区)
 * 所有数字随 Store 状态刷新; 弹层(答题面板等)挂 overlays 容器。
 */
import { Node, Color, Graphics, UITransform, Label, UIOpacity, view } from 'cc';
import { C, uiNode, label, panel, button, fillRect, drawHouse, skinSprite, skin, sfx, popIn, floatUp, breathing, rollNum } from './Theme';
import { Store, MgState } from './Store';
import { QuizPanel } from './QuizPanel';
import { WordForge } from './WordForge';
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
    private upLabs: { [k: string]: Label | null } = { math: null, en: null };
    private signBtn: Node | null = null;
    private signLab: Label | null = null;
    private initCard: Node | null = null;

    constructor(store: Store, host: Node) {
        this.store = store;
        this.host = host;
    }

    build(): void {
        const page = this.page = uiNode('page');
        // 背景: 米黄纯色兜底(超绘防露边), AI 庭院图按 cover 铺满盖在其上
        const bgf = fillRect(2000, 3000, C.bg);
        page.addChild(bgf);
        const vs = view.getVisibleSize();
        const cov = Math.max(vs.width / 720, vs.height / 1280);
        skinSprite(bgf, 'bg_main', Math.ceil(720 * cov), Math.ceil(1280 * cov));
        const band = fillRect(2000, 260, C.band);
        band.setPosition(0, 640, 0);
        band.active = false; // AI 背景自带天空, 色带只在纯色兜底时才有意义
        page.addChild(band);

        // 顶部 HUD 卡(AI 纸面板 + 铜钱/卷轴图标 + 裸数字)
        const hud = panel(CARD_W, 104, C.card, 20);
        hud.setPosition(0, 560, 0);
        page.addChild(hud);
        skin(hud, 'panel_card');

        const icCoin = skinSprite(hud, 'icon_coin', 40, 40);
        icCoin.setPosition(-238, 0, 0);
        const coins = label('0', 30, C.goldDark, true);
        coins.setPosition(-168, 0, 0);
        hud.addChild(coins);
        this.coinsLab = coins.getComponent(Label);

        const icKnow = skinSprite(hud, 'icon_know', 44, 35);
        icKnow.setPosition(-54, 0, 0);
        const know = label('0', 30, C.math, true);
        know.setPosition(28, 0, 0);
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
        skin(rent, 'panel_card');
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

        // 三座建筑卡(拼词馆与书斋共用英语等级, 服务端零改动)
        this.buildBuilding('math', '算学馆', '口算四选一, 答对 2 x 等级 铜钱', C.math, 205, 0.15);
        this.buildBuilding('en', '书斋', '看图听音认单词, 答对 3 x 等级 铜钱', C.en, -35, 0.25);
        this.buildBuilding('forge', '拼词馆', '词根词缀拼单词, 与书斋同级同酬', C.green, -275, 0.35, {
            art: 'bld_forge', playText: '开始拼词',
            onPlay: () => {
                if (!this.store.ready) { Toast.show('还在连接书院...', C.red); return; }
                new WordForge(this.store, this.overlays);
            },
        });

        // 小书童立绘(AI), 站右下空地
        const kid = skinSprite(page, 'kid_idle', 140, 224);
        kid.setPosition(290, -460, 0);

        // 底部说明(banner 安全区上方)
        const foot = label('答题 · 拼词 · 建楼升级 · 小书童离线打工', 24, C.ink2, false);
        foot.setPosition(0, -500, 0);
        page.addChild(foot);

        // 入场动效: HUD 弹出 -> 标题上浮 -> 卡片错峰弹出(buildBuilding 内) -> 书童呼吸待机
        popIn(hud, 0, 0.3);
        floatUp(title, 0.1);
        popIn(kid, 0.45);
        breathing(kid, 1.6);
        floatUp(foot, 0.5);

        // 初始化占位卡(连接中/失败重试), 登录成功后移除
        this.showInitCard();

        this.host.addChild(page);
        const overlays = this.overlays = uiNode('overlays');
        this.host.addChild(overlays);

        // 状态刷新
        this.store.on(() => this.refresh());
    }

    /** 一张建筑卡(拼词馆走 opts 覆盖立绘/按钮文案/点击行为) */
    private buildBuilding(
        key: string, name: string, desc: string, color: Color, y: number,
        delay = 0, opts?: { art?: string; playText?: string; onPlay?: () => void },
    ): void {
        const art = opts && opts.art ? opts.art : (key === 'math' ? 'bld_math' : 'bld_en');
        const playText = opts && opts.playText ? opts.playText : '开始答题';
        const defaultPlay = () => {
            if (!this.store.ready) { Toast.show('还在连接书院...', C.red); return; }
            new QuizPanel(this.store, this.overlays, key);
        };
        const onPlay = opts && opts.onPlay ? opts.onPlay : defaultPlay;

        const card = panel(CARD_W, 250, C.card, 24);
        card.setPosition(0, y, 0);
        this.page.addChild(card);
        skin(card, 'panel_card');
        popIn(card, delay);

        // 左侧建筑图: Graphics 简笔画兜底, AI 建筑图加载成功后盖在其上
        const icon = uiNode('icon');
        icon.setPosition(-195, 5, 0);
        const ut = icon.addComponent(UITransform);
        ut.setContentSize(150, 150);
        const g = icon.addComponent(Graphics);
        drawHouse(g, 150, 150, color);
        skinSprite(icon, art, 170, 170);
        card.addChild(icon);

        // 名称 + 等级
        const nm = label(name, 36, C.ink, true);
        nm.setPosition(90, 80, 0);
        card.addChild(nm);
        const lv = label('Lv.1', 28, C.goldDark, true);
        lv.setPosition(225, 83, 0);
        card.addChild(lv);
        this.lvLabs[key] = lv.getComponent(Label);

        // 描述
        const de = label(desc, 23, C.ink2, false);
        de.setPosition(90, 34, 0);
        card.addChild(de);

        // 按钮行: 伪 3D 厚度胶囊(程序绘制, AI 图不再盖 UI 组件)
        const play = button(card, 250, 88, playText, color, new Color(255, 255, 255, 255), onPlay, 30);
        play.setPosition(-100, -66, 0);

        const up = this.upBtns[key] = button(card, 230, 88, '升级', C.btnSoft, C.ink, () => this.onUpgrade(key), 28);
        up.setPosition(175, -66, 0);
        this.upLabs[key] = up.children[0] ? up.children[0].getComponent(Label) : null;
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
        // HUD 数字滚动(并发安全, 值不变直接落)
        if (this.coinsLab) rollNum(this.coinsLab, s.coins);
        if (this.knowLab) rollNum(this.knowLab, s.knowledge);
        if (this.lvLabs.math) this.lvLabs.math.string = 'Lv.' + s.math_lv;
        if (this.lvLabs.en) this.lvLabs.en.string = 'Lv.' + s.english_lv;
        if (this.lvLabs.forge) this.lvLabs.forge.string = 'Lv.' + s.english_lv; // 拼词馆与书斋同级

        // 升级按钮文案: 满级/没钱置灰提示, 点击有守卫 Toast(forge 与 en 同一英语建筑)
        ['math', 'en', 'forge'].forEach(key => {
            const lv = key === 'math' ? s.math_lv : s.english_lv;
            const cost = s.upgrade_cost
                ? (s.upgrade_cost[key === 'math' ? 'math' : 'english'] || 0) : 0;
            const b = this.upBtns[key];
            if (!b || !b.isValid) return;
            const l = this.upLabs[key];
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
            else { sfx('coin'); Toast.show('签到 +' + r.coins_added + ' 铜钱', C.goldDark); }
        }).catch((e: any) => Toast.show(String(e && e.message || '签到失败'), C.red));
    }

    private onCollect(ad: boolean): void {
        const s = this.store.state;
        if (!s || s.offline_coins <= 0) return;
        const go = () => {
            this.store.doCollect(ad).then((r: any) => {
                sfx('coin');
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
            sfx('coin');
            Toast.show((key === 'math' ? '算学馆' : '书斋·拼词馆') + '升到 Lv.' + r.lv, C.math);
        }).catch((e: any) => Toast.show(String(e && e.message || '升级失败'), C.red));
    }
}

/** 置灰: 半透明 */
function setGrey(n: Node, grey: boolean): void {
    let op = n.getComponent(UIOpacity);
    if (!op) op = n.addComponent(UIOpacity);
    op.opacity = grey ? 140 : 255;
}
