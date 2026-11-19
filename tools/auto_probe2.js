// 模拟器探针 v3(翻卡插画专项): 三段断言——
//   A) 游戏上下文直接 loadBundle('cards') + load('flipart/do/spriteFrame')
//      返回 SpriteFrame 且 w/h>0 = 资源管线修复实锤;
//   B) 场景巡检: flipcard 数 / img 节点 Sprite.spriteFrame 有无 / imgph
//      占位圈出现与否 / 提示行「⚠缺图N 缺声M」文本;
//   C) 强制翻开全部卡正面 -> screenshot 留证。
// 每段独立 try/catch, 单段失败不拖垮全report。
// v2(首跑三段全 timeout 教训): ws 连上 ≠ 自动化桥就绪——冷启动引擎 init+
// 首场景+FlipDemo 发卡要几十秒, 固定 12s 等不住; 改为「微型 evaluate 探活门」
// 轮询等桥就绪再跑真断言, A 段 promise 内加 20s 兜底 resolve 防挂死。
/* eslint-disable no-console */
const automator = require('miniprogram-automator');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    process.on('unhandledRejection', (e) => console.log('[UNHANDLED]', String(e).slice(0, 150)));
    const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
    console.log('CONNECTED');
    try {
        mini.on('console', (msg) => {
            const args = (msg.args || []).map((a) => {
                try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (e) { return String(a); }
            }).join(' ');
            console.log(`[C:${msg.type}] ${String(args).slice(0, 200)}`);
        });
    } catch (e) { console.log('CONSOLE_FAIL', String(e).slice(0, 120)); }

    await sleep(10000);

    // ---- 桥就绪门: 微型 evaluate 探活, 全超时=游戏还在启动, 等了再试 ----
    let bridge = false;
    for (let i = 1; i <= 10 && !bridge; i++) {
        try {
            const r = await mini.evaluate(() => true);
            bridge = r === true;
            console.log('BRIDGE_OK try' + i);
        } catch (e) {
            console.log('BRIDGE_WAIT try' + i + ': ' + String(e).slice(0, 90));
            await sleep(15000);
        }
    }
    if (!bridge) console.log('BRIDGE_GIVEUP(仍继续跑真断言, 留全失败现场)');

    // ---- A) bundle.load spriteFrame 直测 ----
    try {
        const la = await mini.evaluate(() => new Promise((resolve) => {
            let done = false;
            const fin = (o) => { if (!done) { done = true; resolve(o); } };
            setTimeout(() => fin({ ok: false, why: 'load timeout 20s' }), 20000);
            try {
                const g = typeof GameGlobal !== 'undefined' ? GameGlobal : window;
                const cc = g.cc;
                if (!cc || !cc.assetManager) { fin({ ok: false, why: 'no cc.assetManager' }); return; }
                cc.assetManager.loadBundle('cards', (berr, bundle) => {
                    if (berr || !bundle) { fin({ ok: false, why: 'loadBundle fail:' + String(berr).slice(0, 80) }); return; }
                    bundle.load('flipart/do/spriteFrame', cc.SpriteFrame, (err, sf) => {
                        if (err || !sf) { fin({ ok: false, why: 'load sf fail:' + String(err && err.message || err).slice(0, 120) }); return; }
                        fin({
                            ok: true,
                            w: sf.width || 0,
                            h: sf.height || 0,
                            tex: sf.texture ? (sf.texture.width + 'x' + sf.texture.height) : 'no-tex',
                        });
                    });
                });
            } catch (e) { fin({ ok: false, why: String(e && e.message || e).slice(0, 150) }); }
        }));
        console.log('A_LOAD_SF ' + JSON.stringify(la).slice(0, 300));
    } catch (e) { console.log('A_FAIL ' + String(e).slice(0, 250)); }

    // ---- B) 场景巡检 ----
    try {
        const st = await mini.evaluate(() => {
            try {
                const g = typeof GameGlobal !== 'undefined' ? GameGlobal : window;
                const cc = g.cc;
                if (!cc || !cc.director) return { ok: false, why: 'no cc' };
                const scene = cc.director.getScene();
                if (!scene) return { ok: false, why: 'no scene' };
                let cards = 0; let imgs = 0; let sfOk = 0; let ph = 0;
                const texts = [];
                const walk = (n) => {
                    if (n.name === 'flipcard') cards += 1;
                    if (n.name === 'img') {
                        imgs += 1;
                        const sp = n.getComponent && n.getComponent(cc.Sprite);
                        if (sp && sp.spriteFrame) sfOk += 1;
                    }
                    if (n.name === 'imgph') ph += 1;
                    const l = n.getComponent && n.getComponent(cc.Label);
                    if (l && n.activeInHierarchy && l.string) texts.push(l.string.replace(/\n/g, '|').slice(0, 80));
                    for (const c of n.children || []) walk(c);
                };
                walk(scene);
                return { ok: true, cards, imgs, sfOk, ph, texts: texts.slice(0, 10) };
            } catch (e) { return { ok: false, why: String(e && e.message || e) }; }
        });
        console.log('B_SCENE ' + JSON.stringify(st).slice(0, 700));
    } catch (e) { console.log('B_FAIL ' + String(e).slice(0, 250)); }

    // ---- C) 强制翻正全部卡面 -> 截图 ----
    try {
        await mini.evaluate(() => {
            const g = typeof GameGlobal !== 'undefined' ? GameGlobal : window;
            const scene = g.cc.director.getScene();
            const walk = (n) => {
                if (n.name === 'flipcard') {
                    const fb = n.getChildByName('face_back');
                    const ff = n.getChildByName('face_front');
                    if (fb && ff) { fb.active = false; ff.active = true; }
                }
                for (const c of n.children || []) walk(c);
            };
            walk(scene);
            return true;
        });
        await sleep(1500);
        await mini.screenshot({ path: 'tools/sim_shot24.png' });
        console.log('C_SHOT_OK');
    } catch (e) { console.log('C_FAIL ' + String(e).slice(0, 250)); }

    process.exit(0);
})().catch((e) => { console.error('AUTO_FAIL', String(e).slice(0, 300)); process.exit(1); });
