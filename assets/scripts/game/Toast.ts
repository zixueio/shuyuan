/**
 * 书院小掌柜 — 顶部浮条提示
 * 短消息从顶部淡入, 停留后淡出销毁; 多条同时显示时自动向下错开。
 */
import { Node, Color, Vec3, UIOpacity, tween } from 'cc';
import { C, panel, label } from './Theme';

export class Toast {
    private static host: Node | null = null;
    private static alive = 0;

    /** 绑定浮条宿主(全屏容器) */
    static bind(host: Node): void {
        Toast.host = host;
    }

    static show(msg: string, color?: Color): void {
        const host = Toast.host;
        if (!host || !host.isValid) return;
        const idx = Toast.alive++;
        const n = panel(Math.max(320, msg.length * 30 + 90), 84, new Color(255, 255, 255, 240), 42);
        const t = label(msg, 28, color || C.ink, true);
        n.addChild(t);
        const y = 540 - idx * 96;
        n.setPosition(0, y, 0);
        const op = n.addComponent(UIOpacity);
        op.opacity = 0;
        host.addChild(n);
        tween(op).to(0.15, { opacity: 255 }).start();
        tween(n)
            .delay(1.5)
            .call(() => {
                const o = n.getComponent(UIOpacity);
                if (o) tween(o).to(0.25, { opacity: 0 }).start();
            })
            .delay(0.28)
            .call(() => {
                Toast.alive = Math.max(0, Toast.alive - 1);
                n.destroy();
            })
            .start();
    }
}
