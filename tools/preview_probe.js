// 词灵跳跳预览探针: 无头 Edge 打开 localhost:7456, 手动按 uuid 载入 main 场景,
// 走完整玩法流: 点开屏 -> 读气泡词 -> 点对应石头 x7 轮(应触发收编飞行/连跳)
// -> 点「图鉴」开收藏面板, 全程截图 + 收集 console/pageerror。
// 用法: node tools/preview_probe.js
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
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
    page.on('requestfailed', (r) =>
        logs.push(`[reqfail] ${r.url().slice(0, 110)} :: ${r.failure() && r.failure().errorText}`));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(12000);

    // launchScene 为空时预览停在引擎空场景; 手动按 uuid 加载 main 场景
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

    // ---- 场景状态读取器: 气泡词 / 石头词+屏幕坐标 / HUD 芯片 ----
    const readState = () => page.evaluate(() => {
        const scene = cc.director.getScene();
        if (!scene) return { ok: false, why: 'no scene' };
        let bubble = null; const stones = []; let lv = ''; let cap = ''; let dexBtn = null;
        const walk = (n) => {
            for (const c of n.children || []) {
                if (!c.isValid) { continue; }
                const labOf = (nd) => {
                    for (const k of nd.children || []) {
                        const l = k.getComponent && k.getComponent('cc.Label');
                        if (l) return l.string;
                    }
                    return null;
                };
                if (c.name === 'bubble') bubble = labOf(c);
                if (c.name === 'stone' && c.active) {
                    const wp = c.worldPosition;
                    stones.push({ w: labOf(c) || '', x: wp.x, y: wp.y });
                }
                const t = labOf(c);
                if (t && /^第\d+关$/.test(t)) lv = t;
                if (t && /^词灵 \d+\/220$/.test(t)) cap = t;
                if (t === '图鉴') {
                    const wp = c.worldPosition;
                    dexBtn = { x: wp.x, y: wp.y };
                }
                walk(c);
            }
        };
        walk(scene);
        const canvas = cc.game.canvas;
        const rect = canvas.getBoundingClientRect();
        const ppu = rect.height / 1280; // FIXED_HEIGHT: 可见高恒 1280 设计单位
        const px = (p) => ({
            x: rect.left + rect.width / 2 + p.x * ppu,
            y: rect.top + rect.height / 2 - p.y * ppu,
        });
        let capsN = -1;
        try { capsN = Object.keys(JSON.parse(window.localStorage.getItem('sj_prog_v1') || '{}').caps || {}).length; } catch (e) { /* ignore */ }
        return {
            ok: true, bubble,
            stones: stones.map((s) => ({ w: s.w, ...px(s) })),
            cap, lv,
            dexBtn: dexBtn ? px(dexBtn) : null,
            capsN,
            prog: window.localStorage.getItem('sj_prog_v1'),
        };
    });

    // ---- 1. 开屏 ----
    let st = await readState();
    await page.screenshot({ path: 'tools/sj_splash.png' });
    console.log(`[probe] splash state: bubble=${JSON.stringify(st.bubble)} stones=${st.stones.length}`);

    // ---- 2. 点屏幕中央 -> 开屏消失 -> 载入词库开第一轮 ----
    await page.mouse.click(360, 640);
    let ready = null;
    for (let i = 0; i < 40; i++) {
        await sleep(250);
        ready = await readState();
        if (ready.ok && ready.bubble && ready.bubble !== '...' && ready.stones.length >= 3) break;
    }
    console.log(`[probe] round1 ready: word=${JSON.stringify(ready.bubble)} `
        + `stones=${JSON.stringify(ready.stones.map((s) => s.w))} `
        + `hud=${ready.lv} ${ready.cap}`);
    await page.screenshot({ path: 'tools/sj_round1.png' });

    // ---- 3. 连点正确石头 12 轮 (NEED=3, 随机出词下 12 轮大概率触发收编) ----
    let lastCaps = ready.capsN;
    let tapLog = [];
    for (let r = 0; r < 12; r++) {
        const s = await readState();
        if (!s.ok || !s.bubble || s.bubble === '...') { tapLog.push('round-not-ready'); break; }
        const hit = s.stones.find((x) => x.w === s.bubble);
        if (!hit) { tapLog.push('no-matching-stone:' + s.bubble); break; }
        await page.mouse.click(hit.x, hit.y);
        await sleep(350); // 收编飞行中段(pet 在飞)截庆祝
        const s2 = await readState();
        if (s2.ok && s2.capsN > lastCaps) {
            await page.screenshot({ path: 'tools/sj_capture.png' });
            tapLog.push(`CAPTURED@round${r + 1} caps=${s2.capsN}`);
            lastCaps = s2.capsN;
        }
        await sleep(1550); // correct: later(950)->round(); round 内 popIn 0.25+playWord@480
        const s3 = await readState();
        tapLog.push(`r${r + 1}:${s3.bubble}`);
    }
    console.log('[probe] taps: ' + tapLog.join(' | '));
    const fin = await readState();
    console.log(`[probe] hud=${fin.lv} ${fin.cap} prog=${fin.prog}`);
    await page.screenshot({ path: 'tools/sj_late.png' });

    // ---- 4. 图鉴 ----
    const s4 = await readState();
    if (s4.dexBtn) {
        await page.mouse.click(s4.dexBtn.x, s4.dexBtn.y);
        await sleep(900);
        await page.screenshot({ path: 'tools/sj_dex.png' });
        console.log('[probe] dex opened, prog=' + s4.prog);
    } else {
        console.log('[probe] dex button NOT found');
    }

    // ---- 汇总 ----
    console.log(`=== CONSOLE (${logs.length}) ===`);
    const interesting = logs.filter((l) => !l.startsWith('[log] ') || /err|fail|sj|sight/i.test(l));
    for (const l of interesting.slice(0, 60)) console.log(l);
    const errs = logs.filter((l) => l.startsWith('[pageerror]') || l.startsWith('[reqfail]'));
    console.log(`=== PAGEERROR/REQFAIL count: ${errs.length} ===`);
    await browser.close();
})().catch((e) => { console.error('PROBE_FAIL', e); process.exit(1); });
