// 浏览器预览验证探针(puppeteer-core + Edge, 与 preview_flip.js 同工具链):
// 打开 localhost:7456 -> 等 15s -> 读场景状态(卡数/可见文案含 R11 副题/已发N卡)
// -> 截图 shot1 -> 点第 1 关左词卡(-170,0 世界) -> 截图 shot2 -> 输出摘要。
// 第 1 关 2 卡 zoom 0.85: 词卡世界(-170,0) 图卡(170,0)。
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
            '--window-size=720,1400',
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
    page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e).slice(0, 200)}`));
    page.on('requestfailed', (r) =>
        logs.push(`[reqfail] ${r.url().slice(0, 100)} :: ${r.failure() && r.failure().errorText}`));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(15000);

    const readState = () => page.evaluate(() => {
        if (!window.cc || !cc.director) return { ok: false, why: 'no cc' };
        const scene = cc.director.getScene();
        if (!scene) return { ok: false, why: 'no scene' };
        let cards = 0;
        const texts = [];
        const walk = (n) => {
            if (n.name === 'flipcard' && n.activeInHierarchy) cards += 1;
            const l = n.getComponent && n.getComponent('cc.Label');
            if (l && n.activeInHierarchy && l.string) texts.push(l.string.slice(0, 80));
            for (const c of n.children || []) walk(c);
        };
        walk(scene);
        return { ok: true, cards, texts: texts.slice(0, 12) };
    });

    const st1 = await readState();
    console.log('STATE1 ' + JSON.stringify(st1));
    await page.screenshot({ path: 'tools/browser_shot1.png' });

    // 点左词卡: 世界(-170,0) -> 屏幕
    const cv = await page.evaluate(() => {
        if (!window.cc || !cc.game || !cc.game.canvas) return null;
        const r = cc.game.canvas.getBoundingClientRect();
        return { left: r.left, top: r.top, h: r.height, w: r.width };
    });
    console.log('CANVAS ' + JSON.stringify(cv));
    if (cv) {
        const ppu = cv.h / 1280;
        await page.mouse.click(
            cv.left + cv.w / 2 + (-170) * ppu,
            cv.top + cv.h / 2 - 0 * ppu,
        );
        await sleep(1800);
    }
    const st2 = await readState();
    console.log('STATE2 ' + JSON.stringify(st2));
    await page.screenshot({ path: 'tools/browser_shot2.png' });

    const errs = logs.filter((l) => l.startsWith('[pageerror]') || l.startsWith('[reqfail]'));
    console.log('ERRCOUNT ' + errs.length);
    for (const l of errs.slice(0, 10)) console.log(l);
    await browser.close();
    console.log('PROBE_OK');
})().catch((e) => { console.error('PROBE_FAIL', String(e).slice(0, 300)); process.exit(1); });
