/**
 * 书院小掌柜 — 启动组件
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
import { C, uiNode } from './game/Theme';
import { Store } from './game/Store';
import { Home } from './game/Home';
import { Toast } from './game/Toast';

const { ccclass } = _decorator;

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
        canvasComp.alignWithScreen();

        scene.addChild(canvasN);

        // ---- 全屏容器 ----
        const root = uiNode('root');
        canvasN.addChild(root);

        // ---- 游戏装配 ----
        Toast.bind(root);
        const store = new Store();
        const home = new Home(store, root);
        home.build();
        home.startInit();

        ut.setContentSize(view.getVisibleSize());
    }
}

