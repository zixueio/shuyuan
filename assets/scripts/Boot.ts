/**
 * 英语争霸 — 启动组件
 *
 * 场景里只挂本组件; Canvas/相机/全部 UI 都在运行时构建:
 *   1. 设计分辨率 720x1280 FIXED_HEIGHT(窄屏只缩宽, 高度恒定)
 *   2. 动态建 Canvas(UITransform + Canvas + 相机子节点, ortho 对准 UI_2D 层)
 *   3. Home 主界面 + Store 登录链
 * 这样手写场景文件保持最小(SceneAsset + Scene + Boot 节点), 不依赖美术资源。
 */
import {
    Component, Node, Canvas, Camera, UITransform, Widget,
    view, director, Layers, ResolutionPolicy, _decorator,
} from 'cc';
import { C, uiNode, label } from './game/Theme';
import { Store } from './game/Store';
import { FlipDemo } from './game/FlipDemo';
import { Toast } from './game/Toast';
import { mgReport } from './api/mgapi';

const { ccclass } = _decorator;

/** 设备指纹(v27 远程排障): 机型/系统/基础库/性能等级随 boot 首信标上报 */
function devDesc(): any {
    try {
        const wxx: any = typeof wx !== 'undefined' ? wx : null;
        if (!wxx || !wxx.getSystemInfoSync) return {};
        const s = wxx.getSystemInfoSync();
        return {model: s.model, sys: s.system, sdk: s.SDKVersion,
            bench: s.benchmarkLevel, vw: s.windowWidth, vh: s.windowHeight};
    } catch (e) { return {}; }
}

// 标准 @ccclass 装饰器写法。类与场景 __type__ 的绑定链: packer 产物执行时
// _RF.push({}, 压缩uuid, "Boot") 注册别名, 场景反序列化按压缩 uuid 精确查找;
// 2026-11-16 首开 Missing class 的真根因是场景里手算压缩 uuid 用错变体
// (22 字符「2hex+10组」, 引擎实为 23 字符「5hex+9组」), 装饰器不是根因,
// 见 tools/compress_uuid.py 与 README
@ccclass('Boot')
export class Boot extends Component {
    onLoad(): void {
        // 设计分辨率: 高度恒定 1280, 宽度按屏幕比例缩放
        view.setDesignResolutionSize(720, 1280, ResolutionPolicy.FIXED_HEIGHT);

        const scene = director.getScene();
        if (!scene) return;
        mgReport('boot', {phase: 'onload', dev: devDesc()});

        // ---- Canvas ----
        const canvasN = uiNode('Canvas');
        const ut = canvasN.addComponent(UITransform);
        canvasN.addComponent(Widget);
        const canvasComp = canvasN.addComponent(Canvas);

        // ---- 相机(Canvas 子节点, 渲染 UI_2D 层) ----
        const camN = uiNode('Camera');
        camN.setPosition(0, 0, 1000); // UI 相机习惯性架在 z 正方向
        canvasN.addChild(camN);
        const cam = camN.addComponent(Camera);
        cam.projection = Camera.ProjectionType.ORTHO;
        cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        cam.clearColor = C.bg;
        cam.visibility = Layers.Enum.UI_2D;
        cam.priority = 0;
        // near/far 两个名字都设(不同小版本属性名有差异, 无效赋值无害)
        (cam as any).nearPlane = -1000;
        (cam as any).farPlane = 2000;
        (cam as any).near = -1000;
        (cam as any).far = 2000;
        cam.orthoHeight = view.getVisibleSize().height / 2;
        canvasComp.cameraComponent = cam;
        // 注意: 3.8.8 的 Canvas 没有 alignWithScreen()（cc-stub 曾误声明导致
        // tsc 放行、运行时 TypeError 把整个 onLoad 掐断、页面只剩空场景底色）,
        // Canvas 挂 Widget 会自动对齐屏幕, 不需要手动调

        scene.addChild(canvasN);
        mgReport('boot', {phase: 'canvas'});

        // ---- 全屏容器 ----
        const root = uiNode('root');
        canvasN.addChild(root);

        // ---- 窄屏安全缩放 ----
        // FIXED_HEIGHT 只保证高 1280 恒定, 宽度随屏幕比例变化: 19.5:9 手机
        // 可见设计宽仅 ~590, 而布局按 720 全宽摆(按钮 x=±170 宽 300 -> 半宽
        // 320 > 295)两侧必被裁。root 整体按 min(1, 可见宽/720) 缩放, 布局
        // 代码零改动, 窄屏整体等比缩小不再出屏。
        const visW = view.getVisibleSize().width;
        const fitS = Math.min(1, visW / 720);
        if (fitS < 1) root.setScale(fitS, fitS, 1);

        // ---- 游戏装配 ----
        // round9 屏显诊断: 真机黑盒唯一可见窗口是屏幕本身——装配段任何抛错
        // 都红字钉屏; 再挂 wx.onError/onUnhandledRejection 全局兜底,
        // 之后运行期报错(含异步 Promise 拒绝)也直接显在屏上。
        mgReport('boot', {phase: 'root', fit: fitS});
        this.installErrDiagnostics(root);
        Toast.bind(root);
        try {
            const store = new Store();
            mgReport('boot', {phase: 'store'});
            // 临时: 英语争霸样卡确认宿主(用户确认卡面后换回 SightJump 正式玩法)
            new FlipDemo(root).startInit();
            mgReport('boot', {phase: 'flipdemo'});
        } catch (e: any) {
            mgReport('boot', {phase: 'assemble_fail',
                msg: String(e && (e.message || e.stack) || e).slice(0, 300)});
            this.showFatal(root, (e && (e.message || e.stack)) || String(e));
        }

        ut.setContentSize(view.getVisibleSize());
    }

    /** 全局错误诊断: wx.onError + onUnhandledRejection -> 红字钉屏 */
    private installErrDiagnostics(root: Node): void {
        const wxx: any = typeof wx !== 'undefined' ? wx : null;
        if (!wxx) return;
        if (typeof wxx.onError === 'function') {
            wxx.onError((msg: any) => {
                mgReport('err', {msg: String(msg).slice(0, 600)});
                this.showFatal(root, String(msg));
            });
        }
        if (typeof wxx.onUnhandledRejection === 'function') {
            wxx.onUnhandledRejection((r: any) => {
                const reason = r && r.reason ? r.reason : r;
                mgReport('rej', {msg: String(reason && (reason.message || reason.stack) || reason).slice(0, 600)});
                this.showFatal(root,
                    (reason && (reason.message || reason.stack))
                    || String(reason));
            });
        }
    }

    private errLines = 0;   // 已钉屏错误条数(向下错开排版)

    /** 红字错误钉屏: 真机无法看 console, 扫码者直接读屏即得真实报错 */
    private showFatal(root: Node, msg: string): void {
        if (this.errLines >= 4) return;   // 最多 4 行防叠满屏
        const text = 'ERR ' + String(msg).replace(/\s+/g, ' ').slice(0, 90);
        const lab = label(text, 30, C.red, true);
        lab.setPosition(0, 200 - this.errLines * 90, 0);
        root.addChild(lab);
        this.errLines += 1;
        console.error('[Boot] fatal:', msg);
    }
}

