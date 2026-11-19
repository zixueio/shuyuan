// 翻卡插画专项探针(浏览器预览路线, automator 判死后启用): 无头 Edge 打开
// localhost:7456, 注入进度存档 flip_prog_v1={level:7}(7 词 14 卡 = 7 张图片卡),
// 手动载入 main 场景, 三段断言:
//   A) 游戏上下文直接 loadBundle('cards') + load('flipart/do/spriteFrame')
//      返回 SpriteFrame 且 w/h>0 = 资源管线修复实锤;
//   B) 场景巡检: 图片卡数 / img 节点 Sprite.spriteFrame 有无 / imgph 占位圈
//      出现与否 / 提示行文案;
//   C) 强制翻开全部卡正面 -> screenshot 留证(肉眼复核插画真显示)。
// 用法: node tools/preview_flipart.js
/* eslint-disable no-console */
const puppeteer = require('puppeteer-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://localhost:7456/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, cond) => {
    results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
    if (!cond) process.exitCode = 1;
};

(async () => {
    const browser = await puppeteer.launch({
        executablePath: EDGE,
        headless: 'new',
        args: [
            '--no-first-run', '--no-default-browser-check',
            '--disable-gpu', '--window-size=720,1400',
            '--autoplay-policy=no-user-gesture-required',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
        ],
        defaultViewport: { width: 720, height: 1280 },
    });
    const page = await browser.newPage();
    const logs = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 160)}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    page.on('requestfailed', (r) =>
        logs.push(`[reqfail] ${r.url().slice(0, 130)} :: ${r.failure() && r.failure().errorText}`));
    // 第 7 关: 7 词 14 卡, 图片卡 7 张(覆盖面最大的一关)
    await page.evaluateOnNewDocument(
        () => localStorage.setItem('flip_prog_v1', JSON.stringify({ level: 7 })),
    );
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(15000);

    // ---- 手动载入 main 场景(与 preview_flip_levels.js 同款) ----
    const loadMsg = await page.evaluate(() => new Promise((res) => {
        if (!window.cc || !cc.assetManager) return res('no cc');
        cc.assetManager.loadAny(
            { uuid: 'c2b4a6d8-0e1f-4a3b-9c5d-7e8f9a0b1c2d', type: 'scene' },
            (err, asset) => {
                if (err) return res('loadAny err: ' + (err.message || err));
                try {
                    cc.director.runScene(asset, () => res('runScene ok'));
                } catch (e) { res('runScene throw: ' + e.message); }
            },
        );
    }));
    logs.push(`[probe] loadScene: ${loadMsg}`);
    await sleep(6000);

    // ---- A) bundle.load spriteFrame 直测(资源管线实锤) ----
    const la = await page.evaluate(() => new Promise((res) => {
        let done = false;
        const fin = (o) => { if (!done) { done = true; res(o); } };
        setTimeout(() => fin({ ok: false, why: 'load timeout 20s' }), 20000);
        try {
            if (!window.cc || !cc.assetManager) return fin({ ok: false, why: 'no cc' });
            cc.assetManager.loadBundle('cards', (berr, bundle) => {
                if (berr || !bundle) return fin({ ok: false, why: 'loadBundle fail: ' + String(berr).slice(0, 80) });
                bundle.load('flipart/do/spriteFrame', cc.SpriteFrame, (err, sf) => {
                    if (err || !sf) return fin({ ok: false, why: 'load sf fail: ' + String(err && err.message || err).slice(0, 120) });
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
    check('A loadBundle(cards)+flipart/do spriteFrame 加载成功', la && la.ok === true);
    check('A spriteFrame 宽高非 0 (' + (la && la.w) + 'x' + (la && la.h) + ' tex=' + (la && la.tex) + ')',
        la && la.ok && la.w > 0 && la.h > 0);

    // ---- B) 场景巡检: 图片卡 img 节点 spriteFrame 状态 ----
    const st = await page.evaluate(() => {
        const scene = cc.director.getScene();
        if (!scene) return { ok: false, why: 'no scene' };
        let cards = 0;
        let picCards = 0;
        let imgOk = 0;
        let imgNull = 0;
        let ph = 0;
        const details = [];
        const walk = (n) => {
            if (n.name === 'flipcard') {
                cards += 1;
                const ff = n.getChildByName('face_front');
                if (ff) {
                    const img = ff.getChildByName('img');
                    if (img) {
                        picCards += 1;
                        const sp = img.getComponent && img.getComponent(cc.Sprite);
                        const has = !!(sp && sp.spriteFrame);
                        if (has) imgOk += 1; else imgNull += 1;
                        // 图片卡上的中文标签(占位圈才带)顺带记录
                        let cnTxt = '';
                        const w2 = (m) => {
                            const l = m.getComponent && m.getComponent(cc.Label);
                            if (l && l.string) cnTxt += l.string;
                            for (const c of m.children || []) w2(c);
                        };
                        w2(ff);
                        details.push({ has, cn: cnTxt.slice(0, 12) });
                    }
                }
            }
            if (n.name === 'imgph') ph += 1;
            for (const c of n.children || []) walk(c);
        };
        walk(scene);
        return { ok: true, cards, picCards, imgOk, imgNull, ph, details: details.slice(0, 8) };
    });
    check('B 场景 14 卡就位(第 7 关)', st.ok && st.cards === 14);
    check('B 图片卡 7 张', st.ok && st.picCards === 7);
    check('B img spriteFrame 全部非空 (' + (st && st.imgOk) + '/' + (st && st.picCards) + ')',
        st.ok && st.picCards === 7 && st.imgOk === 7);
    check('B imgph 占位圈 0 个(无缺图)', st.ok && st.ph === 0);

    // ---- C) 强制翻正全部卡面 -> 截图肉眼复核 ----
    await page.evaluate(() => {
        const scene = cc.director.getScene();
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
    await page.screenshot({ path: 'tools/flipart_all.png' });
    check('C 截图留证 tools/flipart_all.png', true);

    console.log(`=== RESULTS ===\n${results.join('\n')}`);
    console.log('=== B_DETAILS ' + JSON.stringify(st.details || st).slice(0, 400));
    const errs = logs.filter((l) => l.indexOf('[pageerror]') === 0
        || l.indexOf('[reqfail]') === 0
        || (l.indexOf('flipart') >= 0 && l.indexOf('[error]') >= 0));
    console.log(`=== PAGEERROR/REQFAIL count: ${errs.length} ===`);
    for (const l of errs.slice(0, 20)) console.log(l);
    await browser.close();
})().catch((e) => { console.error('PROBE_FAIL', e); process.exit(1); });
