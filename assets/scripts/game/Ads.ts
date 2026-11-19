/**
 * 英语争霸 — 微信广告封装(IAA 变现)
 *
 * 广告位 id 在微信 MP 后台「流量主」创建后填到下面常量(上线才有流量主资格)。
 * 未填 id / 平台无广告能力时优雅降级: 激励视频返回 false(按未看完处理, 不给双倍),
 * banner 不创建。审核期不会拉到广告, 不会阻塞正常游戏流程。
 *
 * 注意: 后端 /mgapi/collect 的 ad 参数是信任客户端模型, 一期不校验广告票据;
 * 服务端硬校验(广告曝光 ticket)留二期。
 */
const REWARDED_ID = ''; // 流量主后台「激励视频」广告位 id
const BANNER_ID = '';   // 流量主后台「Banner 广告」广告位 id

function wxOk(): boolean {
    return typeof wx !== 'undefined' && !!wx.createRewardedVideoAd;
}

export function hasRewarded(): boolean {
    return !!REWARDED_ID && wxOk();
}

/**
 * 展示激励视频, 看完完整播放 resolve(true)。
 * 加载失败/中途关闭 resolve(false)。
 */
export function showRewarded(): Promise<boolean> {
    if (!hasRewarded()) return Promise.resolve(false);
    return new Promise(resolve => {
        let done = false;
        let ad: any = null;
        const finish = (ok: boolean) => {
            if (done) return;
            done = true;
            try {
                ad.offClose();
                ad.offError();
            } catch (e) { /* ignore */ }
            resolve(ok);
        };
        ad = wx.createRewardedVideoAd({ adUnitId: REWARDED_ID });
        ad.onClose((res: any) => finish(!!(res && res.isEnded)));
        ad.onError(() => finish(false));
        ad.show().catch(() => {
            // 首次 show 失败按微信要求先 load 再 show 一次
            ad.load().then(() => ad.show()).catch(() => finish(false));
        });
    });
}

let bannerAd: any = null;

/** 底部常驻 banner(已创建则跳过), 失败静默 */
export function showBanner(): void {
    if (!BANNER_ID || !wxOk() || bannerAd) return;
    try {
        const sys = wx.getSystemInfoSync();
        bannerAd = wx.createBannerAd({
            adUnitId: BANNER_ID,
            adIntervals: 60,
            style: {
                left: 0,
                top: sys.windowHeight - 120,
                width: sys.windowWidth,
            },
        });
        bannerAd.onError(() => { /* 静默: 无填充/网络失败不打扰玩家 */ });
        bannerAd.show().catch(() => { /* ignore */ });
    } catch (e) { /* ignore */ }
}
