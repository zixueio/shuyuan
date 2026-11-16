# 书院小掌柜（微信小游戏）

全学科模拟经营 IAA 小游戏：玩家是书院「小掌柜」，进建筑答题产铜钱学识，
建楼升级，小书童离线放置，激励视频双倍收益。一期 = 书院场景 + 算学馆（口算）
+ 书斋（英语看图/听音四选一）+ 经济 + 签到 + 广告位。

## 工程

- 引擎: Cocos Creator 3.8（D 盘 Dashboard/编辑器）, 构建发布 → 微信小游戏
- 后端: 复用 ruci 服务器 `/mgapi/*`（契约见 `docs/api.md`）, 账号/题源零新建
- API 封装: `assets/scripts/api/mgapi.ts`（wx.request Promise 化 + 401 静默重登）
- 交互: 全四选一点按, 不做键盘输入（儿童手机端友好）
- 零美术: 全部 UI 运行时 Graphics 手绘（`assets/scripts/game/Theme.ts` UI 工厂）,
  场景文件极简（`assets/scenes/main.scene` = Scene + Boot 节点 + Boot 组件）,
  Canvas/相机/整页 UI 都由 `assets/scripts/Boot.ts` onLoad 运行时构建

## 用 Cocos Creator 打开

1. Cocos Dashboard → 项目 → 导入本目录（package.json creator 标记 3.8.8，3.8 系任一补丁版均可打开）
2. 打开 `assets/scenes/main.scene`, 点预览即跑（场景只挂 Boot, 其余全代码构建）
3. 构建发布: 平台选「微信小游戏」, AppID 填小游戏后台拿到的
4. 微信开发者工具导入 `build/wechatgame` 预览

**场景加载失败兜底**（手写场景极简, 若引擎版本差异反序列化失败）:
编辑器里新建 2D 场景 → 空节点挂 `assets/scripts/Boot.ts` → 保存为 main
→ 项目设置里设为启动场景, 效果完全等价（Boot 全自构建, 场景内容本来只有它）。

**Boot.ts.meta 勿删**: 场景里 Boot 组件按压缩 uuid `3f7a2yejRtOb6XDmw2Ofxos`
引用脚本（引擎 packer 产物 `_RF.push` 实证形式=23 字符「前 5 hex 原样保留+
9 组 3hex→2b64」, `tools/compress_uuid.py` 可自校验并锚定该外部真值; 曾用
22 字符「2hex+10组」错误变体手算出 `3feiyejRtOb6XDmw2Ofxos`, 场景反序列化
按精确字符串查类别名查不到 → Missing class, 2026-11-16 实测修复）,
meta 固定 uuid `3f7a2c9e-8d1b-4e6f-a5c3-9b0d8e7f1a2c`; 删了 meta 会被编辑器
重新分配导致场景 missing script（其余脚本无 meta, 编辑器打开自动补全, 无妨）。

## 本地类型校验（不依赖编辑器）

```bash
npm i --no-save typescript --registry=https://registry.npmmirror.com
npx tsc -p tools/tsconfig.check.json   # 'cc' 映射到 tools/cc-stub.d.ts, 零输出=全绿
```

## 上线前置（MP 后台手动办）

1. 定名「书院小掌柜」查重注册微信小游戏账号（企业主体; 失败按备选:
   状元小书院 / 小掌柜上学堂 / 书院大掌柜 / 我的状元书院）
2. 小程序备案: 虚拟支付选「情况二: 当前及未来均不需要开通虚拟支付」+
   与内容一致的三级类目（备案与开发并行, 只卡最后提审发布）
3. 后台「服务器域名→request 合法域名」加 `https://mweb.cn`,
   **downloadFile 合法域名也加 `https://mweb.cn`**
   （题库图片 loadSprite / 发音 loadAudio 走 assetManager.loadRemote 下载）
4. 上线后开「流量主」, 创建广告位并把 id 填进 `assets/scripts/game/Ads.ts`
   （`REWARDED_ID` 激励视频 / `BANNER_ID` Banner; 未填时优雅降级:
   x2 双倍按钮隐藏、banner 不建, 不阻塞游戏）

## 与 ruci 的边界

- 小游戏独立产品, 不碰儒词小程序教育类目; ruci 侧只有 `mgapi.py` + `mg_state` 表
- 儒词导流（书院门口「儒词学堂」入口）留二期
