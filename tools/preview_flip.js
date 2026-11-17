// 翻翻乐第 4 关(4 词 8 卡)探针: 无头 Edge 打开 localhost:7456, 手动载入 main 场景,
// 八态走全流程并截图: ①8 卡背面+副题 ②翻词卡 a(拼音 yī(gè)) ③词 a+词 and
// 配错->900ms 自动回翻 ④词 a+图 a 配对 ⑤词 and+图 and 配对 ⑥词 away+图 away
// 配对 ⑦词 big+图 big 配对 -> 第 4 关完成 ⑧「再玩一次」复位。
// 全程收集 console/pageerror。
// 布局(FlipDemo LAYOUTS[4], zoom 0.48): 上排 词a(-263,110) 图big(-88,110)
// 词away(88,110) 图and(263,110) / 下排 图away(-263,-110) 词and(-88,-110)
// 图a(88,-110) 词big(263,-110); 世界坐标 = 局部*0.48 四舍五入。
// 「再玩一次」按钮(0,-445)。
// 坐标公式: 预览 canvas 横屏 1280x720 溢出视口居中,
//   ppu = rect.height/1280, cx = rect.left + rect.w/2 + designX*ppu,
//   cy = rect.top + rect.h/2 - designY*ppu (Cocos y 向上, 屏幕 y 向下)。
// 用法: node tools/preview_flip.js
/* eslint-disable no-console */
const puppeteer = require('puppeteer-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://localhost:7456/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 世界坐标常量(与 FlipDemo LAYOUTS[4] slots*zoom 对齐)
const W_A = { x: -263, y: 110 };     // 词卡 a(上排左1)
const P_BIG = { x: -88, y: 110 };    // 图卡 big(上排左2)
const W_AWAY = { x: 88, y: 110 };    // 词卡 away(上排左3)
const P_AND = { x: 263, y: 110 };    // 图卡 and(上排右1)
const P_AWAY = { x: -263, y: -110 }; // 图卡 away(下排左1)
const W_AND = { x: -88, y: -110 };   // 词卡 and(下排左2)
const P_A = { x: 88, y: -110 };      // 图卡 a(下排左3)
const W_BIG = { x: 263, y: -110 };   // 词卡 big(下排右1)
const BTN_AGAIN = { x: 0, y: -445 }; // 再玩一次

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
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
    page.on('requestfailed', (r) =>
        logs.push(`[reqfail] ${r.url().slice(0, 110)} :: ${r.failure() && r.failure().errorText}`));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(12000);

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
    logs.push(`[probe] manual loadScene: ${loadMsg}`);
    await sleep(5000);

    // 读场景状态: 8 张卡(位置/面/正面标签) + 可见文案(横幅/按钮断言用)
    const readState = () => page.evaluate(() => {
        const scene = cc.director.getScene();
        if (!scene) return { ok: false };
        const cards = [];
        const texts = [];
        const walk = (n) => {
            if (n.name === 'flipcard') {
                const faces = {};
                const labels = [];
                const w2 = (m) => {
                    if (m.name === 'face_back') faces.back = m.active;
                    if (m.name === 'face_front') faces.front = m.active;
                    for (const k of m.children || []) {
                        const l = k.getComponent && k.getComponent('cc.Label');
                        if (l) labels.push(l.string);
                        w2(k);
                    }
                };
                w2(n);
                cards.push({
                    faces, labels,
                    x: Math.round(n.worldPosition.x),
                    y: Math.round(n.worldPosition.y),
                });
            }
            const l = n.getComponent && n.getComponent('cc.Label');
            if (l && n.activeInHierarchy && l.string) texts.push(l.string);
            for (const c of n.children || []) walk(c);
        };
        walk(scene);
        return { ok: true, cards, texts };
    });

    // 设计(世界)坐标 -> 屏幕点击坐标
    const cv = await page.evaluate(() => {
        const r = cc.game.canvas.getBoundingClientRect();
        return { left: r.left, top: r.top, h: r.height, w: r.width };
    });
    const ppu = cv.h / 1280;
    const clickAt = (dx, dy) => page.mouse.click(
        cv.left + cv.w / 2 + dx * ppu,
        cv.top + cv.h / 2 - dy * ppu,
    );
    const cardAt = (st, p) => st.cards.find((c) => c.x === p.x && c.y === p.y);

    const results = [];
    const check = (name, cond) => {
        results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
        if (!cond) process.exitCode = 1;
    };

    // ---- 1. 8 卡全背面 + 副题 ----
    let st = await readState();
    check('8 张卡就位', st.ok && st.cards.length === 8);
    check('全背面', st.cards.length === 8 && st.cards.every((c) => c.faces.back && !c.faces.front));
    check('副题「4 词 8 卡」上屏', st.texts.some((t) => t.indexOf('4 词 8 卡') >= 0));
    await page.screenshot({ path: 'tools/flip4_back.png' });

    // ---- 2. 翻词卡 a: 拼音行 + 中文出现 ----
    await clickAt(W_A.x, W_A.y);
    await sleep(1500);
    st = await readState();
    const wa = cardAt(st, W_A);
    check('词卡 a 翻到正面', wa && wa.faces.front);
    check('拼音行 yī(gè) 上卡', wa && wa.labels.some((t) => t.indexOf('yī') >= 0));
    check('中文 一(个) 上卡', wa && wa.labels.some((t) => t.indexOf('一') >= 0));
    await page.screenshot({ path: 'tools/flip4_word_a.png' });

    // ---- 3. 再翻词卡 and = 配错 -> 900ms 自动双回翻 ----
    await clickAt(W_AND.x, W_AND.y);
    await sleep(600);
    st = await readState();
    const wand = cardAt(st, W_AND);
    check('词卡 and 翻到正面', wand && wand.faces.front);
    check('and 拼音 hé 上卡', wand && wand.labels.some((t) => t === 'hé'));
    await page.screenshot({ path: 'tools/flip4_mismatch.png' });
    await sleep(1100);
    st = await readState();
    const mb1 = cardAt(st, W_A);
    const mb2 = cardAt(st, W_AND);
    check('配错后两张词卡都翻回背面', mb1 && mb2 && mb1.faces.back && mb2.faces.back);

    // ---- 4. 词 a + 图 a = 第一对配对成功 ----
    await clickAt(W_A.x, W_A.y);
    await sleep(1400);
    await clickAt(P_A.x, P_A.y);
    await sleep(1600);
    st = await readState();
    check('横幅「配对成功」出现', st.texts.some((t) => t.indexOf('配对成功') >= 0));
    check('横幅带词义 a · 一(个)', st.texts.some((t) => t.indexOf('一(个)') >= 0));
    await page.screenshot({ path: 'tools/flip4_match_a.png' });

    // ---- 5. 词 and + 图 and = 第二对 ----
    await clickAt(W_AND.x, W_AND.y);
    await sleep(1400);
    await clickAt(P_AND.x, P_AND.y);
    await sleep(1600);
    st = await readState();
    const pa2 = cardAt(st, P_AND);
    check('图卡 and 翻到正面(插画卡)', pa2 && pa2.faces.front);
    check('横幅带词义 and · 和', st.texts.some((t) => t.indexOf('and · 和') >= 0));
    await page.screenshot({ path: 'tools/flip4_match_and.png' });

    // ---- 6. 词 away + 图 away = 第三对 ----
    await clickAt(W_AWAY.x, W_AWAY.y);
    await sleep(1400);
    st = await readState();
    const waway = cardAt(st, W_AWAY);
    check('词卡 away 翻到正面', waway && waway.faces.front);
    check('away 拼音 lí kāi 上卡', waway && waway.labels.some((t) => t.indexOf('lí') >= 0));
    check('中文 离开 上卡', waway && waway.labels.some((t) => t.indexOf('离开') >= 0));
    await clickAt(P_AWAY.x, P_AWAY.y);
    await sleep(1600);
    st = await readState();
    const paw = cardAt(st, P_AWAY);
    check('图卡 away 翻到正面(插画卡)', paw && paw.faces.front);
    check('横幅带词义 away · 离开', st.texts.some((t) => t.indexOf('离开') >= 0));
    await page.screenshot({ path: 'tools/flip4_match_away.png' });

    // ---- 7. 词 big + 图 big = 第四对 -> 第 4 关完成 ----
    await clickAt(W_BIG.x, W_BIG.y);
    await sleep(1400);
    st = await readState();
    const wbig = cardAt(st, W_BIG);
    check('词卡 big 翻到正面', wbig && wbig.faces.front);
    check('big 拼音 dà de 上卡', wbig && wbig.labels.some((t) => t.indexOf('dà') >= 0));
    check('中文 大的 上卡', wbig && wbig.labels.some((t) => t.indexOf('大的') >= 0));
    await clickAt(P_BIG.x, P_BIG.y);
    await sleep(1600);
    st = await readState();
    const pbig = cardAt(st, P_BIG);
    check('图卡 big 翻到正面(插画卡)', pbig && pbig.faces.front);
    check('横幅「第 4 关完成」出现', st.texts.some((t) => t.indexOf('第 4 关完成') >= 0));
    check('「再玩一次」按钮出现', st.texts.some((t) => t === '再玩一次'));
    await page.screenshot({ path: 'tools/flip4_done.png' });

    // ---- 8. 再玩一次 -> 全卡回背面复位 ----
    await clickAt(BTN_AGAIN.x, BTN_AGAIN.y);
    await sleep(1500);
    st = await readState();
    check('再玩一次后全回背面', st.cards.length === 8 && st.cards.every((c) => c.faces.back));
    await page.screenshot({ path: 'tools/flip4_replay.png' });

    console.log(`=== RESULTS ===\n${results.join('\n')}`);
    const errs = logs.filter((l) => l.startsWith('[pageerror]') || l.startsWith('[reqfail]'));
    console.log(`=== PAGEERROR/REQFAIL count: ${errs.length} ===`);
    for (const l of errs.slice(0, 20)) console.log(l);
    await browser.close();
})().catch((e) => { console.error('PROBE_FAIL', e); process.exit(1); });
