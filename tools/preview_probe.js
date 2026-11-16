// 预览页探针: 无头 Edge 打开 localhost:7456, 收集 console/pageerror,
// dump 场景树 + 相机, 末尾截图。用法: node tools/preview_probe.js [毫秒]
/* eslint-disable no-console */
const puppeteer = require('puppeteer-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://localhost:7456/';
const WAIT_MS = Number(process.argv[2] || 15000);

(async () => {
    const browser = await puppeteer.launch({
        executablePath: EDGE,
        headless: 'new',
        args: [
            '--no-first-run', '--no-default-browser-check',
            '--disable-gpu', '--window-size=720,1400',
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
        logs.push(`[reqfail] ${r.url()} :: ${r.failure() && r.failure().errorText}`));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((r) => setTimeout(r, WAIT_MS));

    // launchScene 为空时预览停在引擎空场景; 手动按 uuid 加载 main 场景
    const loadErr = await page.evaluate(() => new Promise((res) => {
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
    logs.push(`[probe] manual loadScene: ${loadErr}`);
    await new Promise((r) => setTimeout(r, 6000));

    const dump = await page.evaluate(() => {
        const out = {};
        if (!window.cc || !cc.director) return { noCC: true };
        const scene = cc.director.getScene();
        if (!scene) return { noScene: true };
        const lines = [];
        const walk = (n, d) => {
            const ut = n.getComponent && n.getComponent('cc.UITransform');
            const pos = n.position ? `${n.position.x},${n.position.y},${n.position.z}` : '?';
            const wpos = n.worldPosition ? `${n.worldPosition.x.toFixed(0)},${n.worldPosition.y.toFixed(0)}` : '?';
            const comps = n.components ? n.components.map((c) => c.__classname__ || (c.constructor && c.constructor.name)).join('|') : '';
            lines.push(`${'  '.repeat(d)}${n.name} act=${n.active} layer=${n.layer} lpos=(${pos}) wpos=(${wpos}) size=${ut ? `${ut.width}x${ut.height}` : '-'} [${comps}]`);
            for (const c of n.children || []) walk(c, d + 1);
            if (lines.length > 120) lines.push('...(truncated)');
        };
        walk(scene, 0);
        out.tree = lines.join('\n');
        const cams = [];
        scene.walk && scene.walk((n) => {
            const cam = n.getComponent && n.getComponent('cc.Camera');
            if (cam) cams.push({
                node: n.name, pos: `${n.position.x},${n.position.y},${n.position.z}`,
                vis: cam.visibility, pri: cam.priority, ortho: cam.orthoHeight,
                clear: cam.clearFlags, color: cam.clearColor && cam.clearColor.toString(),
                enabled: cam.enabled, target: cam.targetTexture ? 'tex' : 'screen',
            });
        });
        out.cameras = cams;
        out.sceneName = scene.name;
        out.visibleSize = JSON.stringify(cc.view.getVisibleSize());
        return out;
    });

    console.log(`=== CONSOLE (${logs.length}) ===`);
    for (const l of logs) console.log(l);
    console.log('=== SCENE DUMP ===');
    console.log(JSON.stringify(dump, null, 1).slice(0, 8000));
    await page.screenshot({ path: 'tools/preview_shot.png' });
    console.log('=== SHOT saved ===');

    // 点「开始拼词」验证 WordForge 面板: 场景树找按钮 -> 世界坐标换算屏幕像素
    // (FIXED_HEIGHT 适配: 可见高恒 1280 设计单位, ppu = 画布像素高 / 1280)
    const clickInfo = await page.evaluate(() => {
        if (!window.cc || !cc.director) return { found: false, why: 'no cc' };
        const scene = cc.director.getScene();
        if (!scene) return { found: false, why: 'no scene' };
        let target = null;
        const walk = (n) => {
            for (const c of n.children || []) {
                const lab = c.getComponent && c.getComponent('cc.Label');
                if (lab && lab.string === '开始拼词' && c.parent
                    && c.parent.getComponent('cc.Graphics')) target = c.parent;
                walk(c);
            }
        };
        walk(scene);
        if (!target) return { found: false, why: 'no forge btn' };
        const wp = target.worldPosition;
        const canvas = cc.game.canvas;
        const rect = canvas.getBoundingClientRect();
        const ppu = rect.height / 1280;
        return {
            found: true,
            x: rect.left + rect.width / 2 + wp.x * ppu,
            y: rect.top + rect.height / 2 - wp.y * ppu,
        };
    });
    logs.push(`[probe] forge btn: ${JSON.stringify(clickInfo)}`);
    if (clickInfo.found) {
        await page.mouse.click(clickInfo.x, clickInfo.y);
        await new Promise((r) => setTimeout(r, 3000));
    }
    await page.screenshot({ path: 'tools/preview_shot_forge.png' });
    console.log('=== FORGE SHOT saved ===');
    console.log(`=== CONSOLE AFTER (${logs.length}) ===`);
    for (const l of logs.slice(-12)) console.log(l);
    await browser.close();
})().catch((e) => { console.error('PROBE_FAIL', e); process.exit(1); });
