/**
 * 翻翻乐 — 配对翻卡组件(单词卡/图片卡同构, 300x400)
 *
 * 玩法(用户定版): 一词配一图两张卡, 都盖着; 点任意一张翻到正面都读词,
 * 两张都翻开 = 配对成功 -> 宿主把两卡上锁「留下」(再点只重播发音不翻回),
 * 然后出下一对。单词卡与图片卡靠 kind 区分正反面内容:
 *   word: 大单词 + 中文拼音(汉字上标拼音) + 中文小字 + 「再听」钮(只重播不翻面)
 *   pic : 整卡本地插画(resources/flipart/<art>.png, 新 CogView 管线产物,
 *         纯白底单主体直观风; 词光旧图已弃用)
 * 背面统一词灵蛋剪影 + ? + 「点我翻卡」提示。
 * 翻面动画: scaleX 收拢到 0 -> 换面 -> backOut 弹回 1。
 * 音频在构造时预载(构造即拉远端 mp3, 翻面时已就绪秒播)。
 * 点击区域: 背面整卡可点; 正面用隐形命中层(与「再听」钮分区, 不共享监听链)。
 */
import {
    Node, UITransform, Graphics, Color, tween, Vec3, AudioClip,
    Sprite, SpriteFrame, resources,
} from 'cc';
import {
    C, uiNode, label, panel, button, loadAudio, sfx, pulse,
} from './Theme';
import { audioUrl } from '../api/mgapi';

const EGG = new Color(250, 234, 200, 255);       // 词灵蛋奶金
const EGG_SPOT = new Color(238, 212, 164, 255);  // 蛋斑

const W = 300;   // 卡宽(第 2 关起 4 张 2x2, 缩放由宿主容器统一 0.7)
const H = 400;   // 卡高

/** 一张配对卡的数据(与 sight_audio.json / 后续 words_flip.json 对齐) */
export interface FlipWord {
    w: string;    // 显示原样
    au: string;   // 音频文件名: atlas 真人 and.mp3 / tts 预生成 tts-and.mp3
    cn: string;   // 中文释义
    py?: string;  // 中文释义拼音(汉字上标注, pypinyin 预生成进词库)
    art: string;  // 本地插画名 resources/flipart/<art>.png(空串=占位圈)
}

export interface FlipOpts {
    kind?: 'word' | 'pic';  // 正面形态, 缺省 word
    onFront?: () => void;   // 翻到正面动画完成后(宿主做配对统计)
    onBack?: () => void;    // 翻回背面动画完成后
}

export class FlipCard {
    readonly node: Node;
    readonly word: FlipWord;
    private readonly kind: 'word' | 'pic';
    private readonly frontCb: (() => void) | null;
    private readonly backCb: (() => void) | null;
    private readonly backFace: Node;
    private readonly frontFace: Node;
    private flipped = false;
    private animating = false;
    private locked = false;
    private clip: AudioClip | null = null;

    constructor(word: FlipWord, parent: Node, opts?: FlipOpts) {
        this.word = word;
        this.kind = (opts && opts.kind) || 'word';
        this.frontCb = (opts && opts.onFront) || null;
        this.backCb = (opts && opts.onBack) || null;
        const n = uiNode('flipcard');
        n.addComponent(UITransform).setContentSize(W, H);
        this.node = n;

        // ---- 背面(问题面): 词灵蛋 + ? + 点我翻卡 ----
        this.backFace = panel(W, H, C.card, 24, true);
        this.backFace.name = 'face_back';
        n.addChild(this.backFace);
        const egg = uiNode('egg');
        egg.addComponent(UITransform).setContentSize(140, 202);
        this.drawEgg(egg.addComponent(Graphics));
        egg.setPosition(0, 25, 0);
        this.backFace.addChild(egg);
        const q = label('?', 84, C.en, true);
        q.setPosition(0, 25, 0);
        this.backFace.addChild(q);
        const tip = label('点我翻卡', 26, C.ink2);
        tip.setPosition(0, -152, 0);
        this.backFace.addChild(tip);
        this.backFace.on(Node.EventType.TOUCH_END, () => this.doFlip(true));

        // ---- 正面(答案面), 按 kind 出内容 ----
        this.frontFace = panel(W, H, C.card, 24, true);
        this.frontFace.name = 'face_front';
        this.frontFace.active = false;
        n.addChild(this.frontFace);
        if (this.kind === 'word') {
            // 隐形命中层: 单词+拼音+中文区(y -120..160), 「再听」钮在区外
            const hit = uiNode('hit');
            hit.addComponent(UITransform).setContentSize(W, 280);
            hit.setPosition(0, 20, 0);
            this.frontFace.addChild(hit);
            hit.on(Node.EventType.TOUCH_END, () => this.frontTap());
            // 大单词: 长词自动降字号
            const fs = word.w.length >= 5 ? 76 : 120;
            const wlab = label(word.w, fs, C.en, true);
            wlab.setPosition(0, 84, 0);
            this.frontFace.addChild(wlab);
            // 中文拼音(汉字上写拼音, 用户要求): 词库 py 字段预生成
            if (word.py) {
                const py = label(word.py, 26, C.en, true);
                py.setPosition(0, -36, 0);
                this.frontFace.addChild(py);
            }
            // 中文小字
            const cn = label(word.cn, 28, C.ink2);
            cn.setPosition(0, -80, 0);
            this.frontFace.addChild(cn);
            // 「再听」钮(区外, 只重播不翻面)
            const rebt = button(
                this.frontFace, 170, 56, '再听', C.btnSoft, C.ink,
                () => this.play(), 26,
            );
            rebt.setPosition(0, -150, 0);
        } else {
            // 图片卡: 整卡命中(翻开/锁卡后点按重播), 插画居中
            this.frontFace.on(Node.EventType.TOUCH_END, () => this.frontTap());
            this.addArt(word.art);
        }

        // 预载发音
        loadAudio(audioUrl(word.au), (c) => { this.clip = c || null; });

        parent.addChild(n);
    }

    /** 正面点按: 已上锁(配对留下)=只重播发音; 否则翻回背面 */
    private frontTap(): void {
        if (this.locked) { this.play(); return; }
        this.doFlip(false);
    }

    /** 主动读词: playOneShot 每次开独立声道——同一个词的单词卡与图片卡共享
     *  同一 AudioClip 实例(loadRemote 按 URL 缓存), 旧版连发 clip.play()
     *  第二声被吞 = 「翻第二张不读」根因; clip 未就绪时现拉, 到手即播
     *  (首发翻太快预载还没回的兜底, 用户要求两张翻面必须都出声). */
    play(): void {
        const shoot = (c: AudioClip | null) => {
            if (!c) return;
            try { c.playOneShot(1); } catch (e) {
                try { c.play(); } catch (e2) { /* 忽略 */ }
            }
        };
        if (this.clip) { shoot(this.clip); return; }
        loadAudio(audioUrl(this.word.au), (c) => {
            this.clip = c || null;
            shoot(this.clip);
        });
    }

    /** 配对成功后上锁: 留在正面, 点按只重播 */
    setLocked(v: boolean): void {
        this.locked = v;
    }

    /** 是否翻在正面 */
    isFront(): boolean {
        return this.flipped;
    }

    /** 宿主「下一对」: 解锁并翻回背面(配对态复位) */
    resetBack(): void {
        this.locked = false;
        if (this.flipped) this.doFlip(false);
    }

    /** 翻面: toFront=true 显示答案面 */
    private doFlip(toFront: boolean): void {
        if (this.animating || this.locked || toFront === this.flipped) return;
        this.animating = true;
        sfx('click');
        tween(this.node)
            .to(0.14, { scale: new Vec3(0, 1, 1) })
            .call(() => {
                this.backFace.active = !toFront;
                this.frontFace.active = toFront;
            })
            .to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .call(() => {
                this.animating = false;
                this.flipped = toFront;
                if (toFront) {
                    pulse(this.node);
                    this.play();
                    if (this.frontCb) this.frontCb();
                } else {
                    if (this.backCb) this.backCb();
                }
            })
            .start();
    }

    /** 本地插画: resources/flipart/<art>/spriteFrame, 失败走占位圈 */
    private addArt(art: string): void {
        const imgN = uiNode('img');
        imgN.addComponent(UITransform).setContentSize(264, 264);
        imgN.setPosition(0, 25, 0);
        const sp = imgN.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        this.frontFace.addChild(imgN);
        if (!art) { this.drawImgPlaceholder(); return; }
        resources.load('flipart/' + art + '/spriteFrame', SpriteFrame,
            (err: Error | null, sf: any) => {
                if (err || !sf) { this.drawImgPlaceholder(); return; }
                sp.spriteFrame = sf as SpriteFrame;
            });
    }

    /** 词灵蛋剪影: 两圆+中段胶囊并色成蛋形, 同色填充无缝; 蛋斑三粒 */
    private drawEgg(g: Graphics): void {
        g.fillColor = EGG;
        g.circle(0, -42, 70);          // 蛋底(宽)
        g.fill();
        g.circle(0, 34, 56);           // 蛋顶(窄)
        g.fill();
        g.roundRect(-56, -42, 112, 76, 30);   // 中段补齐
        g.fill();
        g.fillColor = EGG_SPOT;
        g.circle(-26, 8, 11);
        g.fill();
        g.circle(23, -24, 8);
        g.fill();
        g.circle(14, 46, 6);
        g.fill();
    }

    /** 无插画占位: 淡金圆 + 问号 */
    private drawImgPlaceholder(): void {
        const ph = uiNode('imgph');
        ph.addComponent(UITransform).setContentSize(264, 264);
        const g = ph.addComponent(Graphics);
        g.fillColor = EGG;
        g.circle(0, 0, 104);
        g.fill();
        g.fillColor = EGG_SPOT;
        g.circle(0, 0, 90);
        g.fill();
        ph.setPosition(0, 25, 0);
        this.frontFace.addChild(ph);
        const q = label('?', 96, C.en, true);
        q.setPosition(0, 25, 0);
        this.frontFace.addChild(q);
    }
}
