// 自然启动链路探针(不注入任何东西): 无头 Edge 打开 localhost:7456, 让引擎按
// launch 配置自然启动 main.scene——与真机冷启动同链路(此前 preview_flipart.js
// 是手动 loadAny 注入场景, 绕过了自然启动, 这是浏览器全绿但真机炸的验证盲区)。
// 故意不设 flip_prog_v1: 真机新用户/清缓存后首启就是这个状态。
// 巡检: 场景名 / flipcard 数 / img spriteFrame / imgph 占位 / 标签文案,
// 全程抓 console/pageerror/reqfail, 复现真机 children.push null 崩溃。
// 用法: node tools/preview_natural.js
/* eslint-disable no-console */
const puppeteer = require('puppeteer-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://localhost:7456/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`));
    page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));
    page.on('requestfailed', (r) =>
        logs.push(`[reqfail] ${r.url().slice(0, 130)} :: ${r.failure() && r.failure().errorText}`));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(25000);

    const st = await page.evaluate(() => {
        try {
            if (!window.cc || !cc.director) return { ok: false, why: 'no cc' };
            const scene = cc.director.getScene();
            if (!scene) return { ok: false, why: 'no scene' };
            let cards = 0; let imgOk = 0; let imgNull = 0; let ph = 0;
            const labels = [];
            const walk = (n) => {
                if (n.name === 'flipcard') cards += 1;
                if (n.name === 'img') {
                    const sp = n.getComponent && n.getComponent(cc.Sprite);
                    if (sp && sp.spriteFrame) imgOk += 1; else imgNull += 1;
                }
                if (n.name === 'imgph') ph += 1;
                const l = n.getComponent && n.getComponent(cc.Label);
                if (l && l.string) labels.push(l.string.replace(/\n/g, '|').slice(0, 60));
                for (const c of n.children || []) walk(c);
            };
            walk(scene);
            return { ok: true, sceneName: scene.name, cards, imgOk, imgNull, ph, labels: labels.slice(0, 12) };
        } catch (e) { return { ok: false, why: String(e && e.message || e) }; }
    });
    await page.screenshot({ path: 'tools/natural.png' });
    console.log('=== SCENE ' + JSON.stringify(st).slice(0, 900));
    const interesting = logs.filter((l) =>
        l.indexOf('[PAGEERROR]') === 0
        || l.indexOf('[error]') === 0
        || l.indexOf('children') >= 0
        || l.indexOf('null') >= 0
        || l.indexOf('[reqfail]') === 0);
    console.log(`=== ALL_LOGS ${logs.length}, INTERESTING ${interesting.length} ===`);
    for (const l of interesting.slice(0, 30)) console.log(l);
    await browser.close();
})().catch((e) => { console.error('PROBE_FAIL', e); process.exit(1); });
