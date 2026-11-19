# /mgapi 后端契约（英语争霸 ← ruci 服务器）

基地址 `https://mweb.cn`（nginx → gunicorn ruci, 蓝图 `mgapi.py`, url_prefix `/mgapi`）。
认证: `Authorization: Bearer <token>`（token 180 天, itsdangerous salt=mgapi）。
POST 全部 JSON body; 错误统一 `{"error": "..."}` + 4xx。

## 路由一览

| 路由 | 方法 | 认证 | 入参 | 返回 |
|---|---|---|---|---|
| /mgapi/register | POST | 无 | 缺 username=游客一键注册; 显式={username, password≥6位, confirm} | token, username, password(游客只返一次), me, state |
| /mgapi/login | POST | 无 | {username, password} | token, me, state |
| /mgapi/state | GET | Bearer | - | state |
| /mgapi/math_q?lv=N | GET | Bearer | lv=建筑等级(1-4) | {q_text:"a + b = ?", options[4字符串], answer_idx} |
| /mgapi/en_q?lv=N | GET | Bearer | lv=建筑等级(1-4→CEFR a1/a2/b1/b2) | {mode:img\|audio, img_url\|audio_url, options[4词], answer_idx, word} |
| /mgapi/answer | POST | Bearer | {kind:math\|en, lv, correct:bool} | {coins_added, knowledge_added, capped, coins, knowledge} |
| /mgapi/upgrade | POST | Bearer | {building:math\|english} | {building, lv, cost, coins, math_lv, english_lv} |
| /mgapi/collect | POST | Bearer | {ad:0\|1} 看完激励视频传 1 | {gained, coins} |
| /mgapi/sign | POST | Bearer | - | {signed, coins_added, coins} |

## 经济参数（一期）

- 开局: 100 铜钱, 双建筑 1 级, 放置时钟启动
- 答对计酬: 算学馆 2×lv, 书斋 3×lv; 答对另 +1 学识; **每日 200 题上限**(超限计数但零入账, `capped:true`)
- 升级: 费用 = 当前等级×50, 上限 5 级
- 离线放置: (math_lv+english_lv)×10 铜钱/小时, 封顶 8 小时; ad=1 双倍
- 签到: 每自然日一次 +50
- answer 是信任客户端模型: 服务端只按 kind/lv 算酬, 不收任何金额字段

## 题源

- 算学馆: 程序生成零内容成本。lv1=1-9 加减 / lv2=20 以内进位加退位减 / lv3=表内乘法+百以内加减 / lv4=两位数×一位数+百以内加减; 干扰项=ans±1..3
- 书斋: `oxford_words`(ox3000=1, cefr 分级, 排除带空格/连字符) JOIN `atlas_words`(img_file+audio_uk 齐全); img_url=/atlas/img/<file>, audio_url=/atlas/audio/uk/<file>（匿名静态路由, 直接可放）

## 账号关系

复用 ruci `users` 表(role=student), 与儒词小程序/网站同账号体系;
玩家状态在 `mg_state` 表(每用户一行, FK CASCADE)。
奖励入的是游戏铜钱, 不动 users.points。
