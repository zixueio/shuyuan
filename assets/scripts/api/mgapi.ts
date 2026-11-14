/**
 * 书院小掌柜 — ruci /mgapi 后端封装
 *
 * 构建到微信小游戏后 wx 全局可用(wx.request / wx.setStorageSync)。
 * 认证: Bearer token(180 天), 游客一键注册的账号密码只返回一次,
 * 本地双存(token + account), 丢 token 可用账号密码重登。
 *
 * 后端契约详见 docs/api.md; 域名 https://mweb.cn 需在
 * 小游戏后台「开发管理→开发设置→服务器域名→request 合法域名」配置。
 */
const BASE_URL = 'https://mweb.cn';
const TOK_KEY = 'mg_token';
const ACC_KEY = 'mg_account';

function req(method: string, path: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
        const header: {[k: string]: string} = {'content-type': 'application/json'};
        const tok = wx.getStorageSync(TOK_KEY);
        if (tok) header.Authorization = 'Bearer ' + tok;
        wx.request({
            url: BASE_URL + path,
            method: method,
            data: data,
            header: header,
            success(r: any) {
                if (r.statusCode >= 200 && r.statusCode < 300) {
                    resolve(r.data);
                } else {
                    reject(new Error((r.data && r.data.error) || ('HTTP ' + r.statusCode)));
                }
            },
            fail(e: any) {
                reject(new Error(e.errMsg || 'network fail'));
            },
        });
    });
}

export function hasToken(): boolean {
    return !!wx.getStorageSync(TOK_KEY);
}

export function savedAccount(): any {
    return wx.getStorageSync(ACC_KEY) || null;
}

/** 登录态失效时用本地存的账号密码静默重登, 失败返回 null */
export function relogin(): Promise<any> {
    const acc = savedAccount();
    if (!acc) return Promise.resolve(null);
    return login(acc.username, acc.password).catch(() => null);
}

/** 带自动重登的请求: 401 重登一次再试, 仍失败才抛错 */
function authReq(method: string, path: string, data: any): Promise<any> {
    return req(method, path, data).catch((err: Error) => {
        if (String(err.message).indexOf('unauthorized') === -1) throw err;
        return relogin().then((acc: any) => {
            if (!acc) throw err;
            return req(method, path, data);
        });
    });
}

/** 游客一键注册(空 body): 服务端随机账号密码, 返回含 token/state */
export function guestRegister(): Promise<any> {
    return req('POST', '/mgapi/register', {}).then((j: any) => {
        wx.setStorageSync(TOK_KEY, j.token);
        wx.setStorageSync(ACC_KEY, {username: j.username, password: j.password});
        return j;
    });
}

/** 显式注册: {username, password, confirm} */
export function register(username: string, password: string, confirm?: string): Promise<any> {
    return req('POST', '/mgapi/register',
        {username: username, password: password, confirm: confirm || password})
        .then((j: any) => {
            wx.setStorageSync(TOK_KEY, j.token);
            wx.setStorageSync(ACC_KEY, {username: j.username, password: password});
            return j;
        });
}

/** 登录: {username, password} → token/me/state */
export function login(username: string, password: string): Promise<any> {
    return req('POST', '/mgapi/login', {username: username, password: password})
        .then((j: any) => {
            wx.setStorageSync(TOK_KEY, j.token);
            wx.setStorageSync(ACC_KEY, {username: username, password: password});
            return j;
        });
}

/** 游戏全状态: coins/knowledge/math_lv/english_lv/upgrade_cost/offline_coins/can_sign */
export function getState(): Promise<any> {
    return authReq('GET', '/mgapi/state', undefined);
}

/** 算学馆口算题: {q_text, options[4], answer_idx} */
export function mathQ(lv: number): Promise<any> {
    return authReq('GET', '/mgapi/math_q?lv=' + lv, undefined);
}

/** 书斋英语题: mode=img{img_url}|audio{audio_url}, options[4], answer_idx, word */
export function enQ(lv: number): Promise<any> {
    return authReq('GET', '/mgapi/en_q?lv=' + lv, undefined);
}

/** 提交答题结果(服务端按 kind/lv 算酬): 返回 {coins_added, capped, coins, knowledge} */
export function answer(kind: string, lv: number, correct: boolean): Promise<any> {
    return authReq('POST', '/mgapi/answer', {kind: kind, lv: lv, correct: correct});
}

/** 建筑升级: 返回 {building, lv, cost, coins, math_lv, english_lv} */
export function upgrade(building: string): Promise<any> {
    return authReq('POST', '/mgapi/upgrade', {building: building});
}

/** 收取离线收益(ad=true 看完激励视频双倍): 返回 {gained, coins} */
export function collect(ad: boolean): Promise<any> {
    return authReq('POST', '/mgapi/collect', {ad: ad ? 1 : 0});
}

/** 每日签到 +50: 返回 {signed, coins_added, coins} */
export function sign(): Promise<any> {
    return authReq('POST', '/mgapi/sign', {});
}
