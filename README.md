# 书院小掌柜（微信小游戏）

全学科模拟经营 IAA 小游戏：玩家是书院「小掌柜」，进建筑答题产铜钱学识，
建楼升级，小书童离线放置，激励视频双倍收益。一期 = 书院场景 + 算学馆（口算）
+ 书斋（英语看图/听音四选一）+ 经济 + 签到 + 广告位。

## 工程

- 引擎: Cocos Creator 3.8（D 盘 Dashboard/编辑器）, 构建发布 → 微信小游戏
- 后端: 复用 ruci 服务器 `/mgapi/*`（契约见 `docs/api.md`）, 账号/题源零新建
- API 封装: `assets/scripts/api/mgapi.ts`（wx.request Promise 化 + 401 静默重登）
- 交互: 全四选一点按, 不做键盘输入（儿童手机端友好）
- 美术双层: 全部 UI 运行时 Graphics 手绘兜底（`assets/scripts/game/Theme.ts`
  UI 工厂）, AI 素材（智谱 CogView 出图 + numpy 合成音效, 见 `assets/resources/`）
  经 `Theme.skin()/skinSprite()/sfx()` 加载成功后盖在兜底之上, 加载失败静默
  回退纯手绘——两种形态都可玩; 场景文件极简（`assets/scenes/main.scene` =
  Scene + Boot 节点 + Boot 组件）, Canvas/相机/整页 UI 都由
  `assets/scripts/Boot.ts` onLoad 运行时构建

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

## AI 素材管线（全 AI 产出, 零外包零版权风险）

```bash
# 出图(智谱 CogView; cogview-4 系余额不足会自动兜底到免费的 cogview-3-flash)
ZP_KEY=<智谱key> python tools/gen_art.py             # 缺失的原图 -> tools/art_raw/ (--all 强制重生成)
python tools/process_art.py                          # 去水印/去背/裁剪/缩放 -> assets/resources/ui/
python tools/gen_sfx.py                              # numpy 合成音效 -> assets/resources/sfx/
```

- 风格一致性: gen_art.py `STYLE` 前缀（Q版中国古风/扁平水彩/米黄+青蓝/厚棕
  描边）每张图原样携带; 负向约束直接写进 prompt（没有圆形背景框/没有投影/白底）
- 水印: 免费档出图右下角自带「AI生成」灰水印——切图素材填白即可（主体居中
  角落必是背景）; bg_main 整图不能填白, 走同高度左侧干净地面块羽化贴补
  （process_art.py `_patch_watermark`）
- 去背: 严格阈值 bbox(裁掉浅灰投影) → 边缘 floodfill 挖白 → 1px erode 去白晕
  → P 模式 256 色压缩; bg_main 不去背按 720:1280 居中裁
- 已知上限: cogview-3-flash 渲染不了准确汉字——title_logo 两轮生成均乱字,
  按预案弃图走 Label 文字标题（将来给付费模型充值可 `--all` 重出再接线）
- 换肤接线: 面板 `skin(n,'panel_card')` / 答题大卡
  `skin(card,'panel_quiz',undefined,60)` / 主按钮
  `skin(b,'btn_main',undefined,55)` / 软按钮 `skin(b,'btn_soft')`——tint 乘色
  染色让同一张米色底图变金/绿/青多彩按钮, border=九宫格边距防圆角拉伸变形;
  对错反馈 recolor() 先藏 skin 露出 Graphics 兜底再重绘纯色
- QA 拼图: `tools/art_montage.png` 一图速览全部产物

## 预览排障（2026-11-16 五连根因实战）

点编辑器「预览」只出米黄底无 UI 时按序排查（运行时报错只进**浏览器 F12
console**，编辑器 Console 看不到）：

1. 预览前先在编辑器**双击打开 main.scene**——预览页硬编码
   `settings.js?scene=current_scene`，没开场景时 launchScene 为空串，
   引擎永远停在默认空场景（tools/preview_probe.js 用 loadAny uuid 手动
   runScene 绕过）；
2. 引擎 API 以 3.8 为准：Canvas 无 `alignWithScreen()`（Widget 自动对齐）、
   `Label.Align` 是 2.x 老写法（3.x 用独立枚举 `HorizontalTextAlignment` /
   `VerticalTextAlignment`）——运行时 undefined 直接 TypeError 掐断
   Boot.onLoad；手写的 cc-stub.d.ts 让 tsc 全绿≠运行时真存在，stub 必须
   镜像真实 API；
3. 浏览器预览没有全局 `wx`：mgapi.ts 已用 `typeof wx !== 'undefined' ? wx :
   WebShim` 适配（WebShim=localStorage+fetch 模拟同名三接口），小游戏端
   wx 路径不受影响；
4. 预览源 localhost:7456 受 CORS 管束：ruci mgapi.py 已加固定白名单
   after_request（OPTIONS 预检把 Access-Control-Request-Headers 原样回进
   Allow-Headers）；
5. 编辑器**聚焦才重编译**：改完 .ts 不回编辑器点一下，temp/ 下的旧 chunk
   不会更新（排障时可临时直接改 temp/programming/packer-driver/targets/
   下的编译产物验证，回编辑器触发重编译后会被正常产物取代）。

无头复验：`node tools/preview_probe.js 12000`——console 零错误 + 截图
tools/preview_shot.png 应见完整主界面（铜钱 100/签到/两卡/升级 -50）。

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
