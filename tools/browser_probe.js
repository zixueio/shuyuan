/** 浏览器无头探针: 打开 localhost:7456 预览, 截两张图(进入后/点击左侧卡后) */
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
    page.on('console', m => console.log('CONSOLE:', m.type(), m.text().slice(0, 200)));
    page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 300)));
    await page.goto('http://localhost:7456', { waitUntil: 'load' });
    await page.waitForTimeout(10000);                       // 等游戏加载+发卡
    await page.screenshot({ path: 'tools/browser_shot1.png' });
    console.log('SHOT1_DONE');
    // 第 1 关 = 2 卡: 词卡世界(-200,0) 图卡(200,0), 画布中心=屏幕(360,640), y 取反
    await page.mouse.click(160, 640);                       // 左词卡
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'tools/browser_shot2.png' });
    console.log('SHOT2_DONE');
    await page.mouse.click(560, 640);                       // 右图卡(尝试配对)
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'tools/browser_shot3.png' });
    console.log('SHOT3_DONE');
    await browser.close();
    console.log('PROBE_OK');
})().catch(e => { console.error('PROBE_FAIL:', String(e).slice(0, 400)); process.exit(1); });
