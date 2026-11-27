# 七个正式 V2 实现的阅读路线

本页以 `D:/Github/Music/baka-plugins` 的 `97847deac28141aa3df24fd24b94d06e5b507a2e` 为核对快照，记录于 2026-11-28。`plugins/v2` 中是维护中的公开成品实现模板，已经包含真实服务的业务分派、字段映射和源协议；本仓库 `assets/authoring` 中则是合成教学夹具。两者都不能仅凭源码或离线测试被描述为当前源站可用、已授权或设备播放通过。

契约与 SDK 的权威位置见 [source-map.md](./source-map.md)。完整编写过程见 [development-guide.md](./development-guide.md)，行为与原生测试见 [testing-and-release.md](./testing-and-release.md)。本页只给源码和函数导航，不复制整份 provider、账户配置、签名材料或分发后的个性化脚本。

## 从这些文件开始

以下路径均以用户指定的 `D:/Github/Music/baka-plugins` 为根。源码链接使用本地已核对的 Git remote `https://github.com/Zencok/baka-plugins`，固定到上述完整提交；它们不依赖 skill 安装目录。其他 checkout 的定位方式见 [来源配置](./source-map.md)。

| 实现 | 文件 | 包 ID / sourceId | 本快照版本 | 值得研究的流程 |
|---|---|---|---|---|
| 网易云 | [plugins/v2/wy.js](https://github.com/Zencok/baka-plugins/blob/97847deac28141aa3df24fd24b94d06e5b507a2e/plugins/v2/wy.js) | `cc.baka.wy` / `wy.v1` | `1.0.1` | EAPI/WEAPI、曲目质量补全、榜单分组、YRC/翻译、日推和完整导入。 |
| QQ | [plugins/v2/qq.js](https://github.com/Zencok/baka-plugins/blob/97847deac28141aa3df24fd24b94d06e5b507a2e/plugins/v2/qq.js) | `cc.baka.qq` / `qq.v1` | `1.0.1` | songmid 与数值 ID、uniform 歌单、上游页偏移、QRC、MV 和日推。 |
| 酷我 | [plugins/v2/kw.js](https://github.com/Zencok/baka-plugins/blob/97847deac28141aa3df24fd24b94d06e5b507a2e/plugins/v2/kw.js) | `cc.baka.kw` / `kw.v1` | `1.0.2` | HTTPS 目录检索、二进制歌词、授权分享导入、日推及媒体回退。 |
| 酷狗 | [plugins/v2/kg.js](https://github.com/Zencok/baka-plugins/blob/97847deac28141aa3df24fd24b94d06e5b507a2e/plugins/v2/kg.js) | `cc.baka.kg` / `kg.v1` | `1.0.1` | gcid/命令码导入、质量 hash、KRC、歌手作品、榜单和日推。 |
| 咪咕 | [plugins/v2/mg.js](https://github.com/Zencok/baka-plugins/blob/97847deac28141aa3df24fd24b94d06e5b507a2e/plugins/v2/mg.js) | `cc.baka.mg` / `mg.v1` | `1.0.1` | copyrightId、策略二进制响应、MRC、HTML 歌单与短链。 |
| Bilibili | [plugins/v2/bilibili.js](https://github.com/Zencok/baka-plugins/blob/97847deac28141aa3df24fd24b94d06e5b507a2e/plugins/v2/bilibili.js) | `cc.baka.bilibili` / `bilibili.v1` | `1.0.1` | aid/bvid/cid、WBI、Cookie、DASH 音频/MV、收藏夹与单曲链接。 |
| Apple Music | [plugins/v2/am.js](https://github.com/Zencok/baka-plugins/blob/97847deac28141aa3df24fd24b94d06e5b507a2e/plugins/v2/am.js) | `cc.baka.am` / `am.v1` | `1.0.1` | 原生 HLS 描述符、专用 license envelope、分页专辑/歌手、TTML。 |

先读同目录的 [README.md](https://github.com/Zencok/baka-plugins/blob/97847deac28141aa3df24fd24b94d06e5b507a2e/plugins/v2/README.md)、[DESIGN.md](https://github.com/Zencok/baka-plugins/blob/97847deac28141aa3df24fd24b94d06e5b507a2e/plugins/v2/DESIGN.md) 与 [ATTRIBUTION.md](https://github.com/Zencok/baka-plugins/blob/97847deac28141aa3df24fd24b94d06e5b507a2e/plugins/v2/ATTRIBUTION.md)，再读 manifest、文件末尾的 `handlers` 和 `bindPageHandlers`，最后沿 handler 进入 `operations(sdk)` / `createOperations(sdk)` 中的具体协议。

这些成品并没有覆盖全部 26 个能力：

| 成品集合 | 实际声明 |
|---|---|
| 网易云、QQ、酷我、酷狗 | search、entities.get、collections.get/members；discovery.charts/playlistTags/playlists/hotSearch/daily；media.prepare/resolve/video；lyrics.get、comments.list、links.resolve/share。 |
| 咪咕、Bilibili | 上述集合去掉 discovery.daily。 |
| Apple | search、collections.get/members、media.prepare/resolve/license、lyrics.get。 |

七家均未声明 auth 家族、recognition.identify，以及 discovery.chartTags/recommendations/similar/searchSuggestions。不要为了“全功能模板”向 manifest 添加空 handler，也不要据此删掉宿主已有的合法能力；完整能力表见 [capabilities.md](./capabilities.md)。

## 成品、生成器与分发产物

`plugins/v2/*.js` 是持续修复后的业务实现，文件中的 `// {{REQUEST_HANDLER}}` 是分发注入位置。部分媒体调用依赖分发器注入的源适配函数；只检查本地模板可加载，不能证明生成后的媒体流程完整。

沿下列文件核对最终产物：

| 文件 | 职责 |
|---|---|
| `functions/v2-plugin.js` | `readTemplate` 读取当前 V2 文件；`selectedSource` 校验选择；`pluginUrl` 生成更新 URL；handler 注入媒体适配、srcUrl 与适用质量声明。 |
| `functions/v2-source-handler.js` | 生成只调用 SDK 的源协议实现。复用的可信算法在服务器生成阶段转为直接 V2 源码，不向客户端安装 V1/npm 运行时。 |
| `functions/v2-subscription.js` | 从当前 manifest 读取订阅身份、版本等元数据；订阅 JSON 是文档，不是脚本。 |
| `plugins/v2/sdk-primitives.txt`、`paging.txt` | 静态迁移工具使用的源码片段；不代表当前运行时自动注入的公共 SDK。 |
| `plugins/v2/build.cjs` | 开发期旧业务静态迁移工具，输出草稿。它早于成品中的后续修复，不是成品的可覆盖重建源。 |

`build.cjs` 要求 `BAKA_V2_DRAFT_DIR` 指向其他目录，拒绝覆盖维护中的 `plugins/v2`。可读它理解历史业务如何映射到 V2，但新开发应以当前成品和测试为准。不要运行生成器后用草稿覆盖成品，不要把 builder 内的 Node/require/Buffer 当作插件可用运行环境。仓库服务器使用的 npm 依赖也不属于 V2 SDK。

最终分发源码必须保留精确第一行、manifest/handlers/SDK 属性名，能在实际 QuickJS 中加载并运行。发布接口为 `/api/v2/subscription` 与 `/v2/plugins/{platform}`，存在约定的后缀别名；导入按内容识别，不靠扩展名猜测。source/key 参数必须正确编码和完整保留，不能自行加减 `.json`。更新 URL、源选择和包 ID 分别验证，凭据不进入测试快照或公开例子。

## 导入与分页的完整旅程

以 QQ 或酷狗为起点阅读，不要只看一段 search 函数：

1. `handlers.links.resolve` 进入 `importCollection` / `importMusicSheet`，解析分享的真实语义。
2. 源协议读取完整显式导入结果；`importCollection` 产生带 `_bakaImportToken` 的集合实体，去掉直接暴露的 musicList。
3. 后续 `collections.get/members` 通过 `importedSnapshot` 找到同一份源快照。
4. `pageResult` 根据本次 limit 切有界页；`bindPageHandlers` 再把请求身份摘要绑定到不透明游标。
5. 原生导入器遍历所有页后校验与原子发布，失败不留下成功的空集合。

网易云、QQ、酷我、酷狗、咪咕、Bilibili 的这种特殊导入快照每个 SDK 实例只保留一个活跃快照，上限 100,000 首，十分钟过期。过期或被新导入替换后必须重新解析分享链接。这是这些 provider 的实现策略，不是宿主的通用内存预算或永不失效的集合标识。

普通浏览不走任意全量抓取：`pageState/pageCursor/pageResult` 保存上游页与页内偏移，用当前 limit 消费较大的源页。`bindPageHandlers` 将包、版本、source URL、能力、查询、typed entity、tag、sort、revision、账户设置摘要等纳入作用域；凭据原文不进入游标。补封面或 worksNum 不应改变同一会话的实体身份。

普通浏览仍可能遇到源站变化；没有服务器 revision 的源不能凭页面数宣称实现了修订一致同步。`v2c:` 等前缀和 `_bakaImportToken` 是成品私有策略，不应写成所有 provider 必须采用的标准字段。共同行为规则见 [contract.md](./contract.md)。

## 按业务选择具体函数

| 文件 | 精确函数锚点 | 研究问题 |
|---|---|---|
| `wy.js` | `eapiEncrypt`、`AES`、`Rsa`、`getParamsAndEnc` | 用 SDK hex/crypto 组合源签名与加密；这些算法不属于平台专用宿主 SDK。 |
| `wy.js` | `getValidMusicItems`、`rememberSheetTrackIds`、`getTopListDetail`、`parseTopListGroups` | 源 ID 列表与有界详情请求、榜单标题/顺序/封面，避免普通浏览预取所有歌曲。 |
| `wy.js` | `getLyric`、`parseYrcToQrc`、`parseYrcTrans`、`getDailyRecommendations` | 逐字歌词、翻译/罗马音字段；当前账户日推的状态、日期与刷新截止。 |
| `qq.js` | `getQQPlaylistPage`、`buildQQImportedSheet`、`importMusicSheet` | 公共 `uniform_get_Dissinfo`，song_begin/song_num 与短源页的偏移推进，保持真实歌单身份。 |
| `qq.js` | `formatMusicItem`、`getMediaSource`、`getLyric`、`getMvSource` | 同时保留 id/songmid、音质策略、QRC 文档、视频实际流选择。 |
| `kg.js` | `decodeKugouGcid`、`getKugouImportDetails`、`getKugouSharedSongs`、`importMusicSheet` | 公共 gcid 解码/分享列表与数值命令端点；命令码不能变成普通精选歌单 ID。 |
| `kg.js` | `getKugouCollectionPage`、`formatMusicItem`、`decryptKrc`、`parseKrc` | 普通全局集合有界页、不同质量 hash、压缩歌词包与语言层提取。 |
| `kw.js` | `searchMusic/searchAlbum/searchArtist/searchMusicSheet/searchLyric`、`getAlbumInfo`、`getArtistWorks` | 当前 HTTPS 目录路径覆盖五类搜索及专辑/歌手，保留原参数和 typed ID。 |
| `kw.js` | `decodeKuwoNewLyricPayload`、`buildParams`、`buildKuwoWordLyric`、`getLyric` | 源二进制歌词封装、压缩/解码及逐字转换，不能被通用 HTTP 返回文本替代。 |
| `kw.js` | `importMusicSheet`、`readDailyMusicSheet`、`loadDailyMusicSheet`、`getMediaSource` | 授权分享 URL 只在原导入协议使用、日推状态、真实媒体返回与回退。 |
| `mg.js` | `decodeMiguStrategyResponse`、`miguMusicUrl`、`getMediaSource` | bytes 上的源编码算法、copyrightId/contentId 映射和实际质量。 |
| `mg.js` | `decryptMrc`、`parseMrc`、`playlistHtmlSongIds`、`importMusicSheet` | MRC 与歌曲 HTML 选择器；只取真实歌曲行，短链重定向保留集合语义。 |
| `bilibili.js` | `getWbiKeys`、`signWbi`、`getCookieInput`、`buildCookieHeader` | SDK crypto、登录 Cookie 与访客指纹的分工，不能用访客 Cookie 覆盖账户认证。 |
| `bilibili.js` | `getPlayurlData`、`pickAudio`、`pickVideo`、`getMediaSource`、`getMvSource` | DASH 流、codec/质量选择、播放 headers 和视频可选质量。 |
| `bilibili.js` | `importMusicItem`、`importMusicSheet`、`resolveLink`（operations 返回对象内的函数） | aid/bvid/cid、收藏夹默认导入与显式单曲导入的区别。 |
| `am.js` | `amEnvelope`、`amSong`、`getAlbumInfo`、`getArtistWorks`、`getLyric` | 当前服务 envelope、歌曲字段、单页专辑请求与 TTML 文档。 |
| `am.js` | `getMediaSource`、`amKeyEndpoint`、`getAppleMusicKey` | apple-hls 描述符、专用 license 返回、拒绝任意外部 key endpoint；不能改成 auth.callback。 |

这些业务函数在模块内部，名称不是供新插件调用的宿主 API；对外仍只有 manifest 声明的 grouped handlers。成品 `media.prepare` 可能包含 `protocol:"lx"` 和 `source:"tx"` 这类私有 resolver context，它不表示运行时提供 LX 全局、事件或通用平台路由。新 provider 需自行与 resolver 约定 sourceId 和 context。

## 配套测试要一起读

以下文件均位于 `D:/Github/Music/baka-plugins/tests`；命令应从该仓库运行，不是从本技能仓库运行。

| 测试文件 | 可学习的断言 |
|---|---|
| `v2-providers.test.cjs` | 七包无 Node/DOM/package globals；QQ 100 首源页按 limit 无漏重；gcid/命令码、授权导入快照、KRC/酷我字节、EAPI、QRC、咪咕二进制、Bilibili DASH、Apple envelope。 |
| `v2-errors.test.cjs` | HTTP/业务失败不能成为空页；请求/typed entity/账户改变拒绝旧游标；Apple 专辑、网易榜单、酷狗集合和咪咕歌手逐页获取。 |
| `v2-public-parity.test.cjs` | native kind 分派、同 ID 跨 kind 游标拒绝、网易分组、咪咕歌曲选择器、Bilibili 单曲/集合入口、质量策略。 |
| `v2-kw-transport.test.cjs` | 酷我五类搜索、专辑和歌手目录使用 HTTPS，字段与分页保持一致。 |
| `v2-distribution.test.cjs` | source/key 编码、update URL 与包 ID、生成 SDK 源码、订阅元数据、个性化缓存策略及部署路由。 |
| `v2-packaged.test.cjs` | 提取后的 Netlify bundle 独立于源码目录仍可分发；需要 `BAKA_NETLIFY_BUNDLES`，未设置会跳过。 |
| `v2-native.test.cjs` | 实际 lean QuickJS 加载及本地 HTTP QQ 250 首分页；需要 `BAKA_V2_PROBE`，未设置会跳过。 |
| `v2-native-import.py` | 真实应用 FFI 导入器从本地 QQ 夹具枚举并保留 250 首；参数是构建出的 Baka FFI 动态库路径。 |
| `v2-native-distribution.py` | 原生 fetch/检查/恢复注册的分发验证入口；先阅读其配置，避免把需要服务地址的验证当作默认离线命令。 |

可以先运行这组离线 Node 测试阅读真实断言：

```powershell
node --test tests/v2-providers.test.cjs tests/v2-errors.test.cjs tests/v2-public-parity.test.cjs tests/v2-kw-transport.test.cjs tests/v2-distribution.test.cjs
```

然后按 [testing-and-release.md](./testing-and-release.md) 配置真实探针，区分执行、跳过和失败。不要复制文档里历史通过数量作为当前结果，不要把 Node VM 当作生产沙箱，Apple key/seek、登录和设备媒体能力还需要对应层的证据。

## 作者、协议与许可边界

本快照七个公开 manifest 的 display author 为 `BakaMusic`。`ATTRIBUTION.md` 保留公共基线 `20bfcc9` 的来源：网易云、QQ、酷狗、酷我、咪咕、Bilibili 署名 `Toskysun`，Apple 署名 `BakaMusic`。显示作者调整不替代源文件或第三方声明。引用或改写应保留完整来源、协议说明和适用授权，不能把未核对许可证补成开源许可。

公开 `cc.baka.*` 成品与 LyraMesh 内部 `lyra.mesh.*` 是独立系列。不能因为同为 QQ/酷狗就复制内部 upstream 端点、业务或账户实现到公开系列，也不能用一家的测试证明另一家的行为。新插件优先研究有明确授权的公共逻辑与测试，避免搬运生产凭据、个性化产物、部署配置或抓包。

本仓库提供开发方法与合成例子，不重新发行这些成品。正式修复在所属实现仓库完成：更新该包版本、对应测试和分发元数据，再验证真实生成文件。主机 SDK 改变则必须先检查原生实现和 ABI 支持，不能仅发布 JavaScript 宣称增加不可用的 native 操作。
