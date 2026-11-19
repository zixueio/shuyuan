# -*- coding: utf-8 -*-
"""微信小游戏构建后处理：把 cards bundle 从主包挪进小游戏分包。

背景（CLI 六轮构建实证）： mainBundleCompressionType=subpackage 让 internal/main
bundle 进了 subpackages/ 并注册 game.json；但自定义 bundle(cards) 的
compressionType=subpackage 无论走 options.bundleConfigs 还是 meta userData 都
不生效（构建核心把 isSubpackage 只算给了内建 bundle），cards 4.9MB 永远落主包
assets/cards/，主包超 4MB 上限，微信开发者工具直接报包体超限无法预览。

引擎适配层（application.js）按 src/settings.json 的 assets.subpackages 数组
决定 bundle 加载方式：在列表里 → 先 wx.loadSubpackage(name) 再从
subpackages/<name>/ 读 config.json；不在 → 从 assets/<name>/ 直接读。
所以只要三处一致，构建后物理搬迁完全等价于构建期分包：
  1) assets/cards/  -> subpackages/cards/
  2) game.json     .subpackages += {"name":"cards","root":"subpackages/cards/"}
  3) settings.json .assets.subpackages += "cards"
幂等：已在分包位置/已注册时跳过。
"""
import json
import os
import shutil
import sys

BUILD = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                     'build', 'wechatgame')
# cards(4.9MB 卡面插画) 物理搬进分包(与内建 main 同构, settings.json 分流)。
# resources 绝不能进分包(round7→round8 实证教训): resources 是 Cocos 内建 bundle
# 且写在 settings.json assets.preloadBundles(启动预载), devtool 预览上传会把自定义
# 分包内容剥光(cards 5MB→361B / resources 470KB→13B, 只剩 game.js 桩)——注册成
# 分包后引擎启动预载 resources: wx.loadSubpackage 成功但读不到 config.json,
# 启动链断死 → 真机永远停在 Cocos splash(用户实报「只看到 COCOS 的界面」);
# rounds 1-6 resources 整体缺席时同样的预载失败走非分包路径被引擎容忍, 能进游戏。
# 词表已内联(WordData.ts 随 main 直出), resources 只剩 ui 换肤图/sfx/词表冗余,
# Theme 全有 Graphics/无声兜底 → 整包删除 + 三处注册(subpackages/projectBundles/
# preloadBundles)全清, 回到实证可启动形态。
BUNDLES = ['cards']


def du(path):
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            fp = os.path.join(root, f)
            if not os.path.islink(fp):
                total += os.path.getsize(fp)
    return total


def main():
    rc = 0
    for BUNDLE in BUNDLES:
        src = os.path.join(BUILD, 'assets', BUNDLE)
        dst = os.path.join(BUILD, 'subpackages', BUNDLE)

        if not os.path.isdir(src) and not os.path.isdir(dst):
            print('POST_BUILD_FAIL: %s bundle not found in assets/ or subpackages/' % BUNDLE)
            rc = max(rc, 2)
            continue

        # 1) 物理搬迁
        if os.path.isdir(src):
            if os.path.isdir(dst):
                print('POST_BUILD_FAIL: both %s and %s exist' % (src, dst))
                rc = max(rc, 2)
                continue
            shutil.move(src, dst)
            print('POST_BUILD: moved assets/%s -> subpackages/%s' % (BUNDLE, BUNDLE))
        else:
            print('POST_BUILD: subpackages/%s already in place' % BUNDLE)

        # 1.5) 分包根 game.js（devtool checkSubpackages 校验每个分包 root 必须有 game.js，
        #      internal/main 内建分包自带，cards/resources 纯资源 bundle 没有。
        #      v29 关键修正: 内容必须是 require('./index.js') 而非空桩——
        #      wx.loadSubpackage 完成后执行分包根 game.js; Cocos 构建给每个 bundle
        #      生成的 index.js 注册 SystemJS 模块 chunks:///_virtual/<name> 和
        #      virtual:///prerequisite-imports/<name>, 而引擎(cc.js bundle 加载器 nC)
        #      每次 loadBundle 都 System.import('virtual:///prerequisite-imports/<name>'),
        #      模块未注册则 instantiate 失败(loadBundle 回调 err, 且失败状态被 SystemJS
        #      缓存后续必失败)。空桩时代 index.js 从未执行→首次 loadBundle 靠「bundle
        #      在 import 前已 init 进缓存」蒙混(level1~3 图正常), import 挂 17s 超时
        #      失败落定后缓存被清→level4 起全爆「Unable to instantiate」+缺图,
        #      即 2026-11-19 mglog 10:52:55 会话实证的先成功后全灭。main 分包的
        #      game.js 内联了同构注册代码所以无此问题, require('./index.js') 与之等价)
        entry_js = os.path.join(dst, 'game.js')
        entry_body = "require('./index.js');\n"
        if (not os.path.isfile(entry_js)
                or 'require' not in open(entry_js, encoding='utf-8').read()):
            open(entry_js, 'w', encoding='utf-8').write(entry_body)
            print('POST_BUILD: subpackages/%s/game.js written (require index.js)' % BUNDLE)
        else:
            print('POST_BUILD: subpackages/%s/game.js already requires index.js' % BUNDLE)

        # 2) game.json 注册分包
        gj_path = os.path.join(BUILD, 'game.json')
        gj = json.load(open(gj_path, encoding='utf-8'))
        subs = gj.setdefault('subpackages', [])
        if not any(s.get('name') == BUNDLE for s in subs):
            subs.append({'name': BUNDLE, 'root': 'subpackages/%s/' % BUNDLE})
            json.dump(gj, open(gj_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=4)
            print('POST_BUILD: game.json subpackages += %s' % BUNDLE)
        else:
            print('POST_BUILD: game.json already registers %s' % BUNDLE)

        # 3) settings.json 引擎适配注册
        st_path = os.path.join(BUILD, 'src', 'settings.json')
        st = json.load(open(st_path, encoding='utf-8'))
        sp = st.get('assets', {}).get('subpackages', [])
        if BUNDLE not in sp:
            sp.append(BUNDLE)
            st['assets']['subpackages'] = sp
            json.dump(st, open(st_path, 'w', encoding='utf-8'), ensure_ascii=False)
            print('POST_BUILD: settings.json assets.subpackages += %s' % BUNDLE)
        else:
            print('POST_BUILD: settings.json already lists %s' % BUNDLE)

    # 3.4) resources bundle 逐出包体(round8): 见文件头注释——devtool 预览上传剥自定义
    #      分包内容 + resources 是启动预载 bundle, 注册成分包 = 启动卡死 Cocos splash。
    #      覆盖两种现场: 刚构建完在 assets/resources(CLI round7+ 会写) / 已被搬进
    #      subpackages/resources(round7 产物); 注册三处全清, 幂等。
    purged = False
    for rel in ('assets/resources', 'subpackages/resources'):
        p = os.path.join(BUILD, rel)
        if os.path.isdir(p):
            shutil.rmtree(p)
            purged = True
            print('POST_BUILD: rmtree %s' % rel)
    st_path = os.path.join(BUILD, 'src', 'settings.json')
    st = json.load(open(st_path, encoding='utf-8'))
    ast = st.get('assets', {})
    st_dirty = False
    for key in ('subpackages', 'projectBundles'):
        v = ast.get(key)
        if isinstance(v, list) and 'resources' in v:
            v.remove('resources')
            ast[key] = v
            st_dirty = True
            print('POST_BUILD: settings.json assets.%s -= resources' % key)
    pb = ast.get('preloadBundles')
    if isinstance(pb, list):
        keep = [e for e in pb
                if not (isinstance(e, dict) and e.get('bundle') == 'resources')]
        if len(keep) != len(pb):
            ast['preloadBundles'] = keep
            st_dirty = True
            print('POST_BUILD: settings.json assets.preloadBundles -= resources')
    if st_dirty:
        json.dump(st, open(st_path, 'w', encoding='utf-8'), ensure_ascii=False)
    gj_path = os.path.join(BUILD, 'game.json')
    if os.path.isfile(gj_path):
        gj = json.load(open(gj_path, encoding='utf-8'))
        subs = gj.get('subpackages')
        if isinstance(subs, list):
            keep = [s for s in subs if s.get('name') != 'resources']
            if len(keep) != len(subs):
                gj['subpackages'] = keep
                json.dump(gj, open(gj_path, 'w', encoding='utf-8'),
                          ensure_ascii=False, indent=4)
                print('POST_BUILD: game.json subpackages -= resources')
    if not purged:
        print('POST_BUILD: no resources dir on disk (already purged)')

    # 3.5) project.config.json 关掉「忽略未使用文件」——devtool 静态依赖分析认不出
    #      loadBundle 运行时引用的图片，开着会把 cards 分包里的 webp 全剔除上传包
    #      （实测体积表 cards 只剩 51KB，native/ 图片没进包）。Cocos 每次构建都会
    #      重生成 project.config.json，所以必须构建后打补丁。
    #      键名必须是单数 `setting`（微信开发者工具的规范键）——此前写进复数
    #      `settings` 被 devtool 当未知键忽略, 开关从未生效, preview13 体积表
    #      cards=361B（5MB 图片被剥光）就是实锤。
    #      双开关: ignoreUploadUnusedFiles 管上传, ignoreDevUnusedFiles 管
    #      预览/真机调试(默认 true)——preview14 实锤只关 upload 不够: 体积表
    #      cards=1.9MB 恰等于 mp3+json+wav 之和, 4MB webp 仍被 dev 侧剥掉,
    #      两个都关才是全量放行。
    #      urlCheck 同理必须 false: true=真机预览校验合法域名, 而书院 AppID
    #      后台从未配置 mweb.cn → 真机所有 wx.request/素材加载被微信运行时
    #      直接拦截(没图+children.push 连锁报错+诊断 mgReport 上不去,
    #      mglog.jsonl 永远空)——十几次「修不好」的真凶(2026-11-19 实锤:
    #      nginx access.log 零 mgapi 记录)。false 只放行开发版(预览/真机
    #      调试); 体验版/正式版仍需 AppID 后台配置 request+downloadFile
    #      合法域名 https://mweb.cn。
    pc_path = os.path.join(BUILD, 'project.config.json')
    if os.path.isfile(pc_path):
        pc = json.load(open(pc_path, encoding='utf-8'))
        st = pc.setdefault('setting', {})
        dirty = False
        for k in ('ignoreUploadUnusedFiles', 'ignoreDevUnusedFiles', 'urlCheck'):
            if st.get(k) is not False:
                st[k] = False
                dirty = True
        if dirty:
            json.dump(pc, open(pc_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
            print('POST_BUILD: project.config.json setting upload/dev-unused/urlcheck=false')
        else:
            print('POST_BUILD: ignoreUpload/DevUnusedFiles already false')

    # 4) 校验
    main_k = du(BUILD) - du(os.path.join(BUILD, 'subpackages'))
    total_k = du(BUILD)
    print('POST_BUILD: main=%.2fMB total=%.2fMB' % (main_k / 1048576.0, total_k / 1048576.0))
    ok = main_k <= 4 * 1048576 and total_k <= 30 * 1048576
    print('POST_BUILD_' + ('PASS' if ok and rc == 0 else 'FAIL_SIZE' if ok else 'FAIL'))
    return max(rc, 0) if ok else (3 if rc == 0 else rc)


if __name__ == '__main__':
    sys.exit(main())
