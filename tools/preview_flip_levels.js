// 翻翻乐滑动窗口关卡系统探针(参数化多关卡): 无头 Edge 打开 localhost:7456,
// 每关注入 localStorage 进度存档 flip_prog_v1={level:N} 后手动载入 main 场景,
// 断言卡数/背面/副题/词窗滑动; 第 1 关全流程配对通关 -> 「下一关」进第 2 关
// 且存档持久化; 第 7 关满窗 14 卡; 第 8 关验证滑窗(a 退场/down 入场)。
// 用法: node tools/preview_flip_levels.js [N...]   缺省 1 7 8
// 坐标同 preview_flip.js: ppu=rect.height/1280,
//   cx=rect.left+w/2+designX*ppu, cy=rect.top+h/2-designY*ppu。
/* eslint-disable no-console */
const puppeteer = require('puppeteer-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://localhost:7456/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 220 词表前 12 个(探针断言用, 与 sight_words.json 展平序一致)
const WORDS12 = ['a', 'and', 'away', 'big', 'blue', 'can', 'come', 'down',
    'find', 'for', 'funny', 'go'];

const results = [];
const check = (name, cond) => {
    results.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
    if (!cond) process.exitCode = 1;
};

async function runLevel(browser, level) {
    const page = await browser.newPage();
    const logs = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    page.on('requestfailed', (r) =>
        logs.push(`[reqfail] ${r.url().slice(0, 110)}`));
    // 页面脚本跑之前注入进度存档(mgapi WebShim 直接读 localStorage)
    await page.evaluateOnNewDocument(
        (lv) => localStorage.setItem('flip_prog_v1', JSON.stringify({ level: lv })),
        level,
    );
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
    logs.push(`[probe] L${level} loadScene: ${loadMsg}`);
    await sleep(5000);

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

    const nW = Math.min(level, 7);
    const nCard = nW * 2;
    const win = WORDS12.slice(Math.max(0, level - 7), level);

    // ---- 背面态: 卡数/全背面/副题/槽位唯一 ----
    let st = await readState();
    check(`L${level} 卡数 ${nCard}`, st.ok && st.cards.length === nCard);
    check(`L${level} 全背面`, st.cards.length === nCard
        && st.cards.every((c) => c.faces.back && !c.faces.front));
    check(`L${level} 副题「第 ${level} 关」上屏`,
        st.texts.some((t) => t.indexOf('第 ' + level + ' 关') >= 0));
    check(`L${level} 副题「${nW} 词 ${nCard} 卡」上屏`,
        st.texts.some((t) => t.indexOf(nW + ' 词 ' + nCard + ' 卡') >= 0));
    const posKey = new Set(st.cards.map((c) => c.x + ',' + c.y));
    check(`L${level} 槽位坐标全唯一`, posKey.size === nCard);
    // 词窗: 每个窗内词都有一张卡带着该词标签; 退场词(窗前一个)不在
    const allLabels = st.cards.flatMap((c) => c.labels);
    const hasWord = (w) => allLabels.some((t) => t === w);
    for (const w of win) check(`L${level} 窗内词 ${w} 有卡`, hasWord(w));
    const dropped = WORDS12[level - 7 - 1]; // 窗口前一个词(应已退场)
    if (dropped) check(`L${level} 退场词 ${dropped} 无卡`, !hasWord(dropped));
    check(`L${level} 新词 ${win[win.length - 1]} 在窗尾`,
        win.length === 1 || hasWord(win[win.length - 1]));
    await page.screenshot({ path: `tools/flipL${level}_back.png` });

    // ---- 第 1 关专属: 全流程配对 -> 下一关 -> 存档持久化 ----
    if (level === 1) {
        // L1 zoom 0.85: 词卡(-170,0) 图卡(170,0); 点哪张都读词
        await clickAt(-170, 0);
        await sleep(1500);
        st = await readState();
        const wc = cardAt(st, { x: -170, y: 0 });
        check('L1 词卡 a 翻到正面', wc && wc.faces.front);
        check('L1 拼音 yī 上卡', wc && wc.labels.some((t) => t.indexOf('yī') >= 0));
        await clickAt(170, 0);
        await sleep(1600);
        st = await readState();
        check('L1 横幅「第 1 关完成」', st.texts.some((t) => t.indexOf('第 1 关完成') >= 0));
        check('L1 「下一关」按钮出现', st.texts.some((t) => t === '下一关'));
        check('L1 「再玩一次」按钮出现', st.texts.some((t) => t === '再玩一次'));
        await page.screenshot({ path: 'tools/flipL1_done.png' });
        // 下一关(-170,-445): 进第 2 关 + 存档写 {level:2}
        await clickAt(-170, -445);
        await sleep(2000);
        st = await readState();
        check('L1 点下一关后变 4 卡(第 2 关)', st.cards.length === 4);
        check('L1 点下一关后副题「第 2 关」',
            st.texts.some((t) => t.indexOf('第 2 关') >= 0));
        const saved = await page.evaluate(() => localStorage.getItem('flip_prog_v1'));
        check('L1 存档持久化 {level:2}', saved === '{"level":2}');
        await page.screenshot({ path: 'tools/flipL1_next.png' });
    }
    return logs;
}

(async () => {
    const levels = process.argv.slice(2).map(Number).filter((n) => n >= 1);
    const todo = levels.length ? levels : [1, 7, 8];
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
    let allLogs = [];
    for (const lv of todo) {
        const logs = await runLevel(browser, lv);
        allLogs = allLogs.concat(logs);
    }
    await browser.close();
    console.log(`=== RESULTS (${todo.join('/')} 关) ===\n${results.join('\n')}`);
    const errs = allLogs.filter((l) => l.startsWith('[pageerror]') || l.startsWith('[reqfail]'));
    console.log(`=== PAGEERROR/REQFAIL count: ${errs.length} ===`);
    for (const l of errs.slice(0, 20)) console.log(l);
})().catch((e) => { console.error('PROBE_FAIL', e); process.exit(1); });
