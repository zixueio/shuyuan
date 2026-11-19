/**
 * 英语争霸 — 答题面板(算学馆 + 书斋共用框架)
 *
 * 全四选一点按交互, 不做键盘输入(儿童手机端友好)。
 * 算学馆: q_text 大字 + 2x2 选项; 书斋: mode=img 显图 / mode=audio 点喇叭播放
 * (iOS 微信小游戏 InnerAudioContext 无手势调用会静默无声, 所以音频只在点击手势内播放)。
 * 答题即提交(answer POST), 每日 200 题上限, capped 后面板显示上限提示不再出题。
 */
import { Node, Color, Vec3, UITransform, Graphics, Label, UIOpacity, tween, BlockInputEvents } from 'cc';
import { C, uiNode, label, panel, button, drawButtonShape, loadSprite, loadAudio, skin, sfx, popIn, floatUp } from './Theme';
import { Store } from './Store';
import { Toast } from './Toast';
import { showRewarded, hasRewarded } from './Ads';

const CARD_W = 560;
const OPT_W = 265;
const OPT_H = 130;

export class QuizPanel {
    private store: Store;
    private host: Node;      // 挂载宿主(全屏容器)
    private root!: Node;      // 遮罩+卡容器
    private body!: Node;      // 题目区(每次出题重建)
    private optNodes: Node[] = [];
    private kind: string;    // math | en
    private lv: number;
    private closing = false;
    private busy = false;
    private capped = false;
    private audioClip: any = null;

    constructor(store: Store, host: Node, kind: string) {
        this.store = store;
        this.host = host;
        this.kind = kind;
        // 建筑当前等级从 state 取(服务端题目响应不带 lv, answer 提交按等级计酬)
        const s = store.state;
        this.lv = s ? (kind === 'math' ? s.math_lv : s.english_lv) : 1;
        this.build();
        this.next();
    }

    private build(): void {
        const r = this.root = uiNode('quiz');
        const ut = r.addComponent(UITransform);
        ut.setContentSize(1400, 2400); // 覆盖一切屏比
        const g = r.addComponent(Graphics);
        g.fillColor = C.mask;
        g.rect(-700, -1200, 1400, 2400);
        g.fill();
        r.addComponent(BlockInputEvents);
        r.on(Node.EventType.TOUCH_END, () => { /* 吞噬: 遮罩层不响应 */ });

        const card = panel(CARD_W, 1040, C.card, 24);
        card.setPosition(0, 0, 0);
        skin(card, 'panel_quiz', undefined, 60); // AI 宣纸大卡盖住 Graphics 兜底
        r.addChild(card);
        popIn(card, 0, 0.25); // 弹跳入场

        const title = label(this.kind === 'math' ? '算学馆' : '书斋', 40, this.kind === 'math' ? C.math : C.en, true);
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

    /** 关闭面板 */
    private close(): void {
        if (this.closing) return;
        this.closing = true;
        this.root.destroy();
        Toast.show('答题结束, 铜钱已入账', C.goldDark);
    }

    /** 拉下一题 */
    private next(): void {
        if (this.closing) return;
        this.clearBody();
        const loading = label('出题中...', 30, C.ink2, false);
        this.body.addChild(loading);
        const p = this.kind === 'math' ? this.store.doMathQ() : this.store.doEnQ();
        p.then((q: any) => {
            if (this.closing) return;
            this.lv = q.lv || this.lv;
            if (this.kind === 'math') this.renderMath(q);
            else this.renderEn(q);
        }).catch(() => {
            if (this.closing) return;
            this.clearBody();
            const retry = label('加载失败, 点击重试', 30, C.red, true);
            this.body.addChild(retry);
            const hit = panel(400, 120, new Color(0, 0, 0, 0), 20);
            this.body.addChild(hit);
            hit.on(Node.EventType.TOUCH_END, () => this.next());
        });
    }

    private clearBody(): void {
        this.optNodes = [];
        this.audioClip = null;
        if (this.body && this.body.isValid) this.body.destroy();
        this.body = uiNode('body');
        const card = this.root.children[0];
        card.addChild(this.body);
    }

    /** 2x2 选项区(共享) */
    private renderOptions(options: string[], answerIdx: number, reward: number): void {
        const card = this.root.children[0];
        options.forEach((word, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x = col === 0 ? -(OPT_W / 2 + 8) : (OPT_W / 2 + 8);
            const y = -380 - row * (OPT_H + 16);
            const b = button(card, OPT_W, OPT_H, word, C.btnSoft, C.ink, () => {
                this.choose(i, answerIdx, reward, b);
            }, 30);
            b.setPosition(x, y, 0);
            floatUp(b, 0.05 * i, 24); // 选项错峰上浮
            this.optNodes.push(b);
        });
    }

    /** 答题: 高亮对错 -> 提交 -> 反馈 -> 下一题 */
    private choose(idx: number, answerIdx: number, reward: number, picked: Node): void {
        if (this.busy || this.closing) return;
        this.busy = true;
        const correct = idx === answerIdx;
        sfx(correct ? 'right' : 'wrong');

        // 对项标绿, 误选标红
        this.optNodes.forEach((b, i) => {
            if (i === answerIdx) recolor(b, C.green);
            else if (b === picked) recolor(b, C.red);
        });

        this.store.submitAnswer(this.kind, this.lv, correct).then((r: any) => {
            if (this.closing) return;
            if (r.capped) {
                this.capped = true;
                this.clearBody();
                const t1 = label('今日 200 题已答满', 34, C.goldDark, true);
                t1.setPosition(0, 60, 0);
                const t2 = label('明天再来赚铜钱吧', 28, C.ink2, false);
                t2.setPosition(0, 0, 0);
                this.body.addChild(t1);
                this.body.addChild(t2);
                // 关闭按钮放 body 上层
                const back = button(this.root.children[0], 220, 90, '返回书院', C.btnSoft, C.ink, () => this.close());
                back.setPosition(0, -180, 0);
                this.busy = false;
                return;
            }
            const gain = r.coins_added || 0;
            const fb = label(
                correct ? ('+' + gain + ' 铜钱') : ('正确答案: ' + this.correctText(answerIdx)),
                30, correct ? C.green : C.red, true,
            );
            fb.setPosition(0, -240, 0);
            this.body.addChild(fb);
            if (correct && gain > 0) floatCoin(fb);
            setTimeout(() => {
                this.busy = false;
                this.next();
            }, 900);
        }).catch((e: any) => {
            if (this.closing) return;
            this.busy = false;
            Toast.show(String(e && e.message || '提交失败'), C.red);
        });
    }

    private correctText(answerIdx: number): string {
        const b = this.optNodes[answerIdx];
        if (!b) return '';
        const l = b.getComponent(Label);
        return l ? l.string : '';
    }

    /* ---------- 算学馆 ---------- */
    private renderMath(q: any): void {
        const big = label(q.q_text, 60, C.ink, true);
        big.setPosition(0, 160, 0);
        this.body.addChild(big);
        const tip = label('点正确的答案', 26, C.ink2, false);
        tip.setPosition(0, 60, 0);
        this.body.addChild(tip);
        this.renderOptions(q.options, q.answer_idx, q.lv * 2);
    }

    /* ---------- 书斋 ---------- */
    private renderEn(q: any): void {
        if (q.mode === 'img') {
            const frame = panel(300, 300, new Color(250, 246, 236, 255), 16);
            frame.setPosition(0, 170, 0);
            this.body.addChild(frame);
            const holder = uiNode();
            holder.setPosition(0, 170, 0);
            this.body.addChild(holder);
            loadSprite(q.img_url, (n) => {
                if (!n) {
                    const err = label('图片加载失败', 24, C.red, false);
                    holder.addChild(err);
                    return;
                }
                const ut = n.addComponent(UITransform);
                ut.setContentSize(270, 270);
                if (holder.isValid) holder.addChild(n);
            });
        } else {
            // 听音辨词: 点喇叭播放(iOS 无手势自动播放会被静默拦截, 必须点击播)
            const ring = panel(190, 190, C.en, 95);
            ring.setPosition(0, 200, 0);
            this.body.addChild(ring);
            const horn = label('点击听音', 30, new Color(255, 255, 255, 255), true);
            ring.addChild(horn);
            const play = () => {
                if (this.audioClip) {
                    try { this.audioClip.play(); } catch (e) { /* ignore */ }
                } else {
                    loadAudio(q.audio_url, (clip) => {
                        this.audioClip = clip;
                        if (clip) { try { clip.play(); } catch (e) { /* ignore */ } }
                        else Toast.show('发音加载失败', C.red);
                    });
                }
            };
            ring.on(Node.EventType.TOUCH_END, play);
            // 音频资源预取(首播仍需手势触发 play, 预取只为减少等待)
            loadAudio(q.audio_url, (clip) => { this.audioClip = clip; });
        }
        const tip = label('选出对应的单词', 26, C.ink2, false);
        tip.setPosition(0, 30, 0);
        this.body.addChild(tip);
        this.renderOptions(q.options, q.answer_idx, q.lv * 3);
    }

    /** 激励视频入口(书斋答满一日 5 次出题后插入? 一期: 未使用, 预留) */
    static rewardedAvailable(): boolean {
        return hasRewarded();
    }

    static tryDouble(): Promise<boolean> {
        return showRewarded();
    }
}

/** 答对铜钱飘字: 向上飘并淡出 */
function floatCoin(n: Node): void {
    const op = n.addComponent(UIOpacity);
    tween(n).by(0.7, { position: new Vec3(0, 60, 0) }).start();
    tween(op).delay(0.4).to(0.3, { opacity: 0 }).start();
}

/** 选项着色(对绿/错红反馈): 按伪 3D 厚度胶囊重绘, 保持手感一致 */
function recolor(b: Node, color: Color): void {
    const g = b.getComponent(Graphics);
    if (!g) return;
    const ut = b.getComponent(UITransform);
    const w = ut ? ut.width : OPT_W;
    const h = ut ? ut.height : OPT_H;
    drawButtonShape(g, w, h, color);
}
