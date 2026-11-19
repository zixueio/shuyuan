// 模拟器探针 v2: 每个自动化调用独立 try/catch(小游戏自动化 API 支持有限),
// evaluate 读场景 + screenshot 兜底, 不因单个命令超时崩溃。
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
            console.log(`[C:${msg.type}] ${String(args).slice(0, 260)}`);
        });
        console.log('CONSOLE_ON');
    } catch (e) { console.log('CONSOLE_FAIL', String(e).slice(0, 120)); }
    await sleep(8000);
    try {
        const sys = await mini.systemInfo();
        console.log('SYS ' + JSON.stringify({ platform: sys.platform, ver: sys.version }).slice(0, 150));
    } catch (e) { console.log('SYS_FAIL ' + String(e).slice(0, 150)); }
    try {
        const state = await mini.evaluate(() => {
            try {
                const g = typeof GameGlobal !== 'undefined' ? GameGlobal : window;
                const cc = g.cc;
                if (!cc || !cc.director) return { ok: false, why: 'no cc' };
                const scene = cc.director.getScene();
                if (!scene) return { ok: false, why: 'no scene' };
                let cards = 0;
                const texts = [];
                const walk = (n) => {
                    if (n.name === 'flipcard' && n.activeInHierarchy) cards += 1;
                    const l = n.getComponent && n.getComponent('cc.Label');
                    if (l && n.activeInHierarchy && l.string) texts.push(l.string.slice(0, 60));
                    for (const c of n.children || []) walk(c);
                };
                walk(scene);
                return { ok: true, cards, texts: texts.slice(0, 12) };
            } catch (e) { return { ok: false, why: String(e && e.message || e) }; }
        });
        console.log('STATE ' + JSON.stringify(state).slice(0, 600));
    } catch (e) { console.log('EVAL_FAIL ' + String(e).slice(0, 200)); }
    try {
        await mini.screenshot({ path: 'tools/sim_shot.png' });
        console.log('SHOT_OK');
    } catch (e) { console.log('SHOT_FAIL ' + String(e).slice(0, 200)); }
    process.exit(0);
})().catch((e) => { console.error('AUTO_FAIL', String(e).slice(0, 300)); process.exit(1); });
