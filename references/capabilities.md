# V2 能力与业务结果

V2 共 26 个大小写敏感的能力名。只声明实际实现并验证的能力；不支持时省略，不能用成功空 stub 宣称支持。所有 handler 均为 `(request, sdk)`，每次只接收一个命名请求对象。类型、身份和分页规则见 [contract.md](./contract.md)，SDK 见 [sdk.md](./sdk.md)。

下文 `Entity` 表示保留源字段的业务对象，`Json` 表示 JSON 兼容值，`Page<T>` 表示 `{items:T[],nextCursor:string|null,total?:number}`。`Kind` 为 `music/album/artist/sheet/lyric`。除明确写出的 null 外，失败应 throw Error；空页只代表已确认没有内容。

## 完整能力表

| 能力 | 请求对象 | 结果及用途 |
|---|---|---|
| `search` | `{query,kind,cursor,limit,context?}` | `Page<Entity>`；kind 必须对应返回对象。context 为可选源搜索上下文。 |
| `entities.get` | `{entity}` | 补全后的 `Entity` 或 null；保留后续解析需要的源字段。 |
| `collections.get` | `{entity}` | 集合元数据 `Entity` 或 null。 |
| `collections.members` | `{entity,kind,cursor,limit}` | `Page<Entity>`，可附 `entity` 元数据；歌手歌曲/专辑通过 kind 区分。 |
| `discovery.charts` | `{tag?,cursor,limit}` | 榜单实体页，保留分组等展示数据。 |
| `discovery.chartTags` | `{tag?,cursor,limit}` | 榜单分类/标签页；标签结构由源和消费方约定。 |
| `discovery.playlistTags` | `{tag?,cursor,limit}` | 歌单标签页。 |
| `discovery.playlists` | `{tag?,cursor,limit}` | 按 tag 筛选的歌单实体页。 |
| `discovery.hotSearch` | `{tag?,cursor,limit}` | 热搜词或结构化建议页。没有其他热搜别名。 |
| `discovery.recommendations` | `{tag?,cursor,limit}` | 推荐集合实体页；只有真实推荐才能使用此语义。 |
| `discovery.daily` | `{tag?,cursor,limit}` | 带日推状态和集合信息的实体页，见下文消费格式。 |
| `discovery.similar` | `{entity,cursor,limit}` | 与给定曲目相似的歌曲实体页。 |
| `discovery.searchSuggestions` | `{query,cursor,limit}` | 源定义的搜索建议页。 |
| `media.prepare` | `{entity,quality}` | provider 自有 JSON context，供显式绑定的 resolver 使用。 |
| `media.resolve` | `{entity,quality}` | 兼容现有播放器的音频源对象或 null。 |
| `media.video` | `{entity,quality?}` | 视频源对象或 null；请求字段仍为 quality。 |
| `media.license` | `{payload}` | 原有原生 Apple key/decrypt 回调结果 envelope，不能改装为账户结果。 |
| `lyrics.get` | `{entity}` | 歌词文档、实际歌词文本或 null。 |
| `comments.list` | `{entity,cursor,limit,sort?}` | 评论页；可保留回复及源扩展字段。 |
| `links.resolve` | `{url}` | 源自定义实体/集合身份 JSON。 |
| `links.share` | `{entity}` | 外部 HTTP(S) 详情 URL 或 null。 |
| `recognition.identify` | `{payload}` | 源自定义识别候选 JSON。 |
| `auth.login` | `{payload}` | 源自定义登录结果 JSON。 |
| `auth.callback` | `{payload}` | 源自定义认证回调结果 JSON。 |
| `auth.logout` | `{payload}` | 源自定义登出结果 JSON。 |
| `auth.status` | `{payload}` | 源自定义账户状态 JSON。 |

search、collections.members、全部 discovery 和 comments.list 必须遵守统一分页。默认 limit 30，合法范围 1–100；返回不超过请求量，结束必须显式 `nextCursor:null`。完整约束和跨账户游标见 [contract.md](./contract.md#统一分页)。

## 搜索、实体与集合

搜索必须按 kind 分派。例如 artist 请求返回歌手，不能退回歌曲列表：

```js
// 请求
{ query: "示例", kind: "artist", cursor: null, limit: 30 }

// 结果
{
  items: [{ id: "artist-1", type: "artist", name: "示例歌手", title: "示例歌手" }],
  nextCursor: null,
  total: 1,
}
```

歌词搜索使用 `kind:"lyric"`，保留匹配所需的 context 和源实体字段。不要仅把 music 结果改名后宣称歌词检索已实现。`supportedSearchType` 应与实际分派一致。

实体补全主要提供曲目身份、专辑、歌手、封面、质量及源扩展信息。集合元数据与成员分开；`collections.get` 不应用整张歌单数组冒充元数据。歌手请求 `collections.members` 时可用 `kind:"music"` 与 `kind:"album"` 选择作品类别。榜单通过原实体的类型/种类保留身份，不能因为 ID 相同就当成普通歌单。

返回源原始字段后，后续调用必须继续传递它们。例如 QQ 的 songmid、酷狗质量 hash、咪咕 copyrightId、Bilibili aid/bvid/cid 都可能影响解析；标题不足以重新构造曲目。实际调用链和成品函数索引见 [production-examples.md](./production-examples.md)。

## 发现与每日推荐

标签、热搜词、榜单分组继续服从现有消费者，V2 没有重新发明统一排名模型。热搜可返回字符串或消费方支持的结构化项；不能把站内跳转、默认输入提示和真正搜索词混为一谈。不要把上游原生顺序称为个性化推荐。

`discovery.daily` 同时服从页协议和现有 Flutter 日推消费协议。ready 结果必须有 provider 提供的 `state:"ready"`、`sheetItem`，以及未来的 Unix 毫秒 `refreshAt`；`date` 可选。title、accountName、connectUrl 等现有字段可保留。客户端不会替 provider 推断账户状态和刷新截止时间。

以下仅示意已获得真实结果后的组装，`tracks/sheet/serviceRefreshAt` 均须来自已验证的当前账户服务结果：

```js
return {
  items: tracks,
  nextCursor: null,
  total: tracks.length,
  state: "ready",
  title: sheet.title,
  sheetItem: sheet,
  date: serviceDate,
  refreshAt: serviceRefreshAt,
};
```

当前公开成品的 `dailyResult` 将 musicList 转为 items，并保留 sheetItem、musicList 及日推状态；不要据此把所有 discovery 结果统一成歌曲，也不要规定 daily.items 只能是集合。既有日推界面依赖 sheetItem 打开集合，设计新的日推实现时必须一起验证后续听歌旅程。

非 ready 的既有状态为 `login_required/unconfigured/blocked/updating`。例如未配置时可返回明确状态及终结页：

```js
{ items: [], nextCursor: null, state: "unconfigured" }
```

这表示当前日推无法就绪，不表示账户拥有一个已成功读取的空日推歌单。账户过期、临时服务失败和正在更新要与真实空结果区分。不要用示例中的固定未来日期生成伪造新鲜度。

在已核对的七个公开成品中，网易云、QQ、酷狗、酷我声明 daily；咪咕、Bilibili、Apple 没有声明。没有任何一个声明 `discovery.chartTags/recommendations/similar/searchSuggestions`。这些是可调用的宿主契约，不是七个成品已完成的功能证明。

## 音频与质量

音频结果保留现有源字段：

```js
{
  url: "https://media.example.invalid/audio.mp3",
  headers: { Referer: "https://example.invalid/" },
  quality: "320k",
}
```

示例地址不可播放。真实解析必须返回可用 URL、实际选定 quality 及播放请求所需 headers；取源 API 的鉴权头与媒体播放头不是一回事。保留签名 URL 原文及有效期信息，并让过期源通过正常解析路径刷新。

调用方未选音质时可给 `quality:null`；provider 应选真正支持的默认值。质量键由源定义，`flac/hires/master` 等标签不能单独证明 codec、位深或无损。不要声称所有源都支持同一个质量集合，也不要将低质量 fallback 标为更高质量。

已确认某质量不可用时抛 `code:"quality_unavailable"`；找不到曲目、需要登录、网络失败等使用各自语义。普通 null 表示文档允许的无源，不应拿泛化错误驱动连续音质尝试。错误白名单见 [contract.md](./contract.md#错误)。

下载复用音频/视频解析，不存在 V2 `downloadMusic` 或 `downloadMv` 能力。原生协调器拥有任务身份、持久调度、有限重试和恢复。插件不能通过 capability 列表取得任意写本地音乐库、修改下载路径或提交同步的能力。

## 视频与 Apple license

`media.video` 与音频分开。请求示例：

```js
{ entity: { id: "track-1", mv: "video-1" }, quality: "720p" }
```

不要新增 `videoQuality` 作为通用请求字段。missing/null 表示真实支持的默认质量；返回实际视频质量、headers、尺寸/流等源元数据。Bilibili DASH 的视频与伴随音频需要保留相应字段，不能把视频 URL 当作所有设备可直接播放的单文件。视频解码、HDR、合流、seek 和下载需要独立验证。

Apple HLS 使用已有原生路径；`media.license({payload},sdk)` 接收既有原生回调载荷并返回已有 key/decrypt envelope。认证回调 `auth.callback` 与媒体 key 回调用途不同，不能互换。

公开 Apple 成品的 `media.resolve` 返回 `type:"apple-hls"`，带 `appleMusic` 描述符，包括 version、playlistUrl、adamId、keyEndpoint 及可选 codec/audioGroup。它故意不放可被旧客户端误当明文播放的顶层 url。实际字段约束、URL/回调验证及 ctx/state 数据验证属于原生消费者；请对照 [source-map.md](./source-map.md) 所列 Apple 实现与成品 `am.js`，不要手工编造密钥、解密模块或未验证 envelope。

必须分别验证描述符、真实原生回调包装、授权服务返回、过期刷新、播放、seek 和下载。Node 中调用一个 synthetic license 函数不会建立真实 Apple 播放证据。详细测试记录应说明通过的是哪一层，见 [testing-and-release.md](./testing-and-release.md)。

## 歌词

返回实际文本或文档，例如：

```js
{
  rawLrc: "[00:00.00]示例歌词\n[00:01.00]下一行",
  translation: "[00:00.00]译文",
  romanization: "[00:00.00]romanization",
}
```

翻译和罗马音是歌词文档的一部分，没有单独能力。保留当前读取器需要的 format、ttml 等字段。只返回 URL 不一定满足消费者；需要文本时用 SDK HTTP 拉取真实文档。

源特有加密包、压缩封装、签名、翻译/罗马音提取和源业务规则由可独立更新的插件维护，通过通用 bytes/compression/crypto 原语完成。不得杜撰 `sdk.kugou.*`、`sdk.kuwo.*` 等平台专用工具。

插件返回文档后，应用的 Rust 歌词管线负责共享格式解析、Baka 修复、对唱/背景声规则和时间线，Flutter 负责排版、绘制和手势。成品保留 QQ QRC、酷狗 KRC、酷我包、咪咕 MRC、Apple TTML 的具体协议；返回一段 LRC 不代表已验证所有加密格式或声部布局。

## 评论、分享与导入

评论保留标识、content、用户元数据、时间、点赞和可选 replies；不同源可能使用不同字段，必须明确时间是秒还是毫秒。保留下一页所需的源 ID 和 sort。回复树出现在结果里不等于所有客户端都绘制该层级。

`links.resolve` 将分享 URL/文本解析为源实体或集合引用；`links.share` 生成外部详情 URL。先解析身份，再请求集合成员。provider 可在自己的文档约定额外 JSON 字段；例如 Bilibili 成品支持显式请求单曲，其参数不自动成为所有 provider 的通用 schema。

resolve-and-fetch 不拥有本地库写权限。完整导入、排序、去重、取消、全页验证和原子提交由客户端完成。特殊命令码、短链和带授权分享链接要在 provider 保留源语义；不能提取一个数字后用不相关的普通歌单端点重新解释。参见 [成品导入实例](./production-examples.md#导入与分页的完整旅程)。

## 识别与账户

`recognition.identify` 和 auth 四项只承诺显式 JSON transport。每家服务必须另写清 payload/result schema：

| 业务 | provider 必须自行说明 |
|---|---|
| 音频识别 | PCM/编码格式、采样率、声道、样本宽度、字节表示、长度与时长限制；候选源身份、置信度尺度和后续播放方式。 |
| 登录/回调 | 允许的交互步骤、payload 各字段、成功/失败定义、过期及撤销方式。 |
| 状态/登出 | 活跃账户范围、缓存与服务器状态的关系、删除本地状态与远程撤销的区别。 |

宿主没有因此提供录音界面、QR 扫描、浏览器、redirect server、账户 UI 或自动加密凭据仓库。现有七个公开 provider 均未声明 `recognition.identify` 或 auth 家族；用户配置中的账户连接标识不等于实现了 auth 能力。

可使用以下**自定义示例约定**说明某服务登录成功，但 `authenticated` 不是对所有 auth 结果强制生成的完整标准：

```js
// auth.login / auth.callback 的结果示意
{ authenticated: true }

// auth.status 的结果示意
{ authenticated: false }
```

当前宿主用有限成功标志使账户页结果失效：login/callback 返回 true，或对象 `authenticated:true/ok:true/success:true`；logout 另接受 null 或 `authenticated:false`。非空 error，或 `ok:false/success:false` 阻止成功判断。成功改变账户 epoch，进行中的旧分页结果被拒绝；这不是通用账户模型或自动凭据迁移。

读取变化账户状态时在每次调用中访问 storage/service；`sdk.settings` 是载入快照。设置、存储、handler 协议和产品 UI 需要分别实现、分别验证。完整方法声明或演示 flag 只能证明接口可调用，不能证明真正登录、识别或授权播放已经可用。
