/**
 * 英语争霸 — 游戏状态管理
 *
 * 持有 /mgapi/state 返回的玩家状态, 所有经济动作(答题/升级/收取/签到)都走这里,
 * 动作成功后更新 state 并广播给监听者(Home 刷 HUD)。
 * 账号: 首次 guestRegister 游客注册, 之后本地 token 直连, 失效自动重登(mgapi.js 内处理)。
 */
import {
    guestRegister, relogin, getState, savedAccount, hasToken,
    mathQ, enQ, answer, upgrade, collect, sign,
} from '../api/mgapi';

/** /mgapi/state 返回的玩家状态 */
export interface MgState {
    coins: number;
    knowledge: number;
    math_lv: number;
    english_lv: number;
    upgrade_cost: {[b: string]: number};   // 服务端按建筑给: {math, english}
    offline_coins: number;
    can_sign: boolean;
}

export type Listener = (s: MgState) => void;

export class Store {
    state: MgState | null = null;
    private listeners: Listener[] = [];

    get ready(): boolean {
        return !!this.state;
    }

    /** 注册状态监听(立即回调一次当前状态) */
    on(l: Listener): void {
        this.listeners.push(l);
        if (this.state) l(this.state);
    }

    private emit(): void {
        const s = this.state;
        if (!s) return;
        this.listeners.forEach(l => l(s));
    }

    /** 启动登录链: 有 token 直连 -> 有账号重登 -> 都没有游客注册 */
    init(): Promise<MgState> {
        let p: Promise<any>;
        if (hasToken()) {
            p = getState();
        } else if (savedAccount()) {
            p = relogin().then((j: any) => {
                if (!j) throw new Error('登录失败');
                return j;
            });
        } else {
            p = guestRegister();
        }
        return p.then((j: any) => {
            this.state = j.state;
            this.emit();
            return this.state as MgState;
        });
    }

    /** 算学馆出一题(按当前建筑等级) */
    doMathQ(): Promise<any> {
        return mathQ(this.state ? this.state.math_lv : 1);
    }

    /** 书斋出一题(按当前建筑等级) */
    doEnQ(): Promise<any> {
        return enQ(this.state ? this.state.english_lv : 1);
    }

    /** 提交答题结果: 服务端按 kind/lv 计酬, 返回 {coins_added, capped, coins, knowledge} */
    submitAnswer(kind: string, lv: number, correct: boolean): Promise<any> {
        return answer(kind, lv, correct).then((r: any) => {
            const s = this.state;
            if (s) {
                s.coins = r.coins;
                s.knowledge = r.knowledge;
                this.emit();
            }
            return r;
        });
    }

    /** 建筑升级: 返回 {building, lv, cost, coins, math_lv, english_lv} */
    doUpgrade(building: string): Promise<any> {
        return upgrade(building).then((r: any) => {
            const s = this.state;
            if (s) {
                s.coins = r.coins;
                s.math_lv = r.math_lv;
                s.english_lv = r.english_lv;
                s.upgrade_cost[building] = r.lv * 50; // 下一级费用 = 当前等级 x 50(上限 5 级)
                this.emit();
            }
            return r;
        });
    }

    /** 收取离线收益 ad=true 看完激励视频双倍: 返回 {gained, coins} */
    doCollect(ad: boolean): Promise<any> {
        return collect(ad).then((r: any) => {
            const s = this.state;
            if (s) {
                s.coins = r.coins;
                s.offline_coins = 0;
                this.emit();
            }
            return r;
        });
    }

    /** 每日签到 +50: 返回 {signed, coins_added, coins} */
    doSign(): Promise<any> {
        return sign().then((r: any) => {
            const s = this.state;
            if (s && r.signed !== false) {
                s.coins = r.coins;
                s.can_sign = false;
                this.emit();
            }
            return r;
        });
    }
}
