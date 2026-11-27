# V2 插件完整开发教程

从[快速开始](quickstart.md)建立搜索与播放闭环后，按数据源实际能力逐项扩展。每增加一个能力，都要同时修改 `manifest.capabilities`、对应嵌套 handler 和行为测试。协议与字段详见[契约](contract.md)、[能力 API](capabilities.md)和[SDK](sdk.md)。

## 先整理服务模型

准备脱敏响应样本，列出歌曲、歌单、专辑、歌手和榜单的原始 ID 类型、详情接口、分页方式、媒体质量以及鉴权要求。整理请求头、签名算法、超时、限流、过期条件和错误状态。参考现有插件时，先记录它已经支持的业务路径，避免重写时只保留搜索和普通 MP3。

建议在开发目录中分离数据映射、服务请求和业务处理器，发布前构建为一个 JavaScript 文件。你也可以直接维护单文件。开发工具采用 TypeScript 或构建器是你的选择，客户端仍只加载单个 V2 JavaScript 源文件；构建结果不能残留外部 `require`、ESM 导入或 Node 全局依赖。

只给已经实现的搜索类型和质量填写声明。不要为了显示更多按钮把不存在的能力加入清单，也不要用永远成功的空数组来填接口。

## 数据映射与实体归属

歌曲载荷最少应有稳定 `id` 及界面需要的标题等字段。转换时保留后续接口需要的字段，比如专辑 ID、视频 ID、资源 hash 和 provider 自定义上下文：

```js
function toTrack(row) {
  return {
    id: row.id, type: 'music', title: row.title, artist: row.artist,
    album: row.album, albumId: row.albumId,
    artwork: row.cover, duration: row.durationSeconds,
    mv: row.videoId,
    providerData: { resourceId: row.resourceId },
  };
}
```

这是一个字段映射片段，生产代码还需验证输入和输出的 JSON 兼容性。不要把 `undefined`、NaN、循环引用或函数放进声明/返回数据；可选字段不存在时省略它。不会使用的私有字段也不用全部保存。

实体身份由宿主使用 `{providerId,kind,id}` 管理。标题、封面、显示平台名与 resolver 都不能代替它。保留 `7` 与 `"7"` 的区别；不使用 `String(id)`、文件名或 API 地址重建实体身份。`duration` 为秒，日更过期时间 `refreshAt` 为 Unix 毫秒；服务其他时间字段需注明换算规则。

## 分页与集合

所有列表从 `{cursor:null,limit:30}` 一类请求开始，调用方可以把 `limit` 设为 1–100。返回必须包含 `items` 和 `nextCursor`。终页是 `nextCursor:null`，没有“默认终页”的省略形式。

服务本身支持游标时，将其封装为不透明字符串，至少验证它属于相同查询、筛选、实体、排序和账号状态。服务使用页码/offset 时，由插件编码并校验自己的游标。下面只演示结构，不定义通用游标协议：

```js
function cursorFor(state) {
  return JSON.stringify(state);
}
// 下一次请求应解析并核对所有字段，不能只取 offset。
const nextCursor = cursorFor({
  version: 1, offset: 30, query: 'example', kind: 'music',
  limit: 30, accountRevision: 'session-2', sourceRevision: 'snapshot-8',
});
```

游标不必加密，但不要嵌入密码、token 或临时媒体 URL。校验游标长度、整数范围和字段；换 query、kind、limit、账号或快照后重开会话。没有稳定快照的源要明确这种限制，不能编造版本号保证一致性。

每页最多 `limit` 项，下一页游标必须非空且与本次游标不同；有下一页就必须返回非空 `items`。不要用“遇到错误就重试第一页”的方式完成遍历，也不要每次先抓取整个歌单再切片。可以保留有上限的游标状态，但不能无限缓存所有页。

收藏、专辑、歌手、歌单和榜单按以下职责组织：

- `collections.get({entity})`：集合介绍、封面、描述、已知曲目数等元信息。
- `collections.members({entity,kind,cursor,limit})`：有界成员页。歌手的歌曲和专辑由 `kind` 区分；可同时附带更新后的 `entity`。
- `entities.get({entity})`：补全单个实体，例如搜索结果缺少详情字段时。

普通浏览一次只读一页。完整导入由客户端遍历并校验全部页，再原子提交集合；`total`、`revision`、`accountRevision`、`sourceRevision` 一旦提供就要在会话中保持一致。`worksNum` 是展示计数，不代表完整成员已经取回。终页数量与 `total` 不符应失败并保留原有集合。

## 音频、MV 与下载

`media.resolve({entity,quality},sdk)` 返回当前实体实际可用的源。`quality:null` 时选择真实默认值，并在返回值中说明实际音质。`media.video` 是独立能力，字段仍叫 `quality`。

保留媒体 URL 所需的请求头、签名参数和源特有描述数据。URL 过期时通过现有解析路径重新获取；不要把短期 URL 当作永久歌曲身份，或在列表阶段预解析所有歌曲。

普通媒体结果如：

```js
return {
  url: response.body.url,
  headers: response.body.headers || {},
  quality: response.body.actualQuality,
};
```

返回前验证 URL、实际质量和服务错误。不要把 `response.status===200` 等同于业务成功；服务可能在 200 响应中返回限流或登录失败。也不要用 `null` 把传输故障、无权限和未知异常吞掉。

对于明确不存在的请求音质，使用宿主认可的错误码：

```js
throw Object.assign(new Error('该音质不可用'), { code: 'quality_unavailable' });
```

只有这个代码授权下载音质回退。其他错误的[七种代码](contract.md)对应登录、权限、限流等不同原因。下载由应用的任务系统调度，继续复用 `media.resolve`/`media.video`；插件不定义另一个“下载全部歌曲”的接口，不自行向用户磁盘写文件。

Apple HLS 等专门源需要原有 native 能接受的 source 描述和 `media.license({payload},sdk)` 回调。保持源的实际请求/结果 envelope，不能用假 key、伪解密模块或 `auth.callback` 替代。参考[Apple 成品实现](production-examples.md)，并单独验证播放、seek、过期恢复及下载。

## 独立解析器

provider 维护目录与实体；resolver 只解析媒体。若 provider 支持外部解析，先实现 `media.prepare`，由它完成源业务到约定协议的转换：

```js
// provider 的 handlers.media 中
prepare({ entity }) {
  return { musicId: entity.id, resourceId: entity.providerData.resourceId };
}
```

resolver 的清单使用 `kind:'resolver'` 和 `sources:['example.v1']`，必须声明 `media.resolve`，只能再提供 `media.video`、`media.license`。处理请求包含：

```js
{ providerId, sourceId, entity, quality, context }
```

先检查 `sourceId` 与 `context` 符合约定，再解析媒体。不要根据显示名猜平台，不在客户端硬编码某个源的字段表。用户选择确切 provider/resolver 包 ID 后，应用先调用 provider prepare，再调用 resolver。resolver 失败会保留失败结果，不自动换别的包；歌词、收藏和历史仍归原 provider。见[最小 resolver](../assets/authoring/minimal-resolver.js)。

## 歌词与富文本

`lyrics.get({entity},sdk)` 返回歌词文本或包含 `rawLrc`、`translation`、`romanization` 的对象。保留服务真实格式与有用扩展字段；没有翻译时不制造一份重复原文。

源专属的加密包、签名、压缩封装、翻译和音译提取留在插件内，用 `sdk.bytes`、`sdk.crypto` 等通用原语实现。返回文档之后，共享歌词格式解析、Baka 修复、对唱/背景人声规则和时间线由 Rust 处理，Flutter 排版绘制。不要在插件里搭建渲染框架，或要求客户端增加某平台专属 SDK 方法。

为复杂歌词保留测试向量：原始包、预期文本、翻译/音译、Unicode、时间单位和异常情况。只有普通 LRC 成功不能说明逐字、Ruby、对唱或 TTML 都已验证。

## 首页、榜单、热搜和推荐

从已接通的数据源中选择适合的发现能力：`discovery.charts`、`chartTags`、`playlistTags`、`playlists`、`hotSearch`、`recommendations`、`daily`、`similar`、`searchSuggestions`。这些列表统一使用相同分页契约，筛选由 `tag` 或各能力的请求字段传入。

榜单目录返回可定位的榜单实体，成员再通过集合接口取回。热搜/建议不要套用旧方法别名。每日推荐要反映账号状态；现有首页消费者还读取 `state`、`sheetItem`、`refreshAt` 等字段，详见[API](capabilities.md)。不要把账号失败当成一份空的“今日推荐”，或把随机列表当作真实个性化推荐。

## 配置、登录和账号切换

`manifest.userVariables` 声明用户配置。当前 Flutter 表单按 `key/name/hint/defaultValue/type:'password'` 处理文本输入，保存值为字符串；没有通用的 select/checkbox/number 表单协议。配置示例：

```js
userVariables: [
  { key: 'apiBase', name: 'API 地址', hint: '填写你的服务地址', defaultValue: 'https://api.example.invalid' },
  { key: 'token', name: '访问令牌', type: 'password', hint: '由你的服务签发' },
]
```

在 handler 中使用 `sdk.settings` 读取配置，它是加载时的浅冻结快照。设置改变是否触发重载由宿主管理，不要直接修改快照。持续变化的登录状态或源状态通过 `sdk.storage`/服务按调用读取；不要在模块顶层捕获会过期的账号信息。

`auth.login/callback/logout/status` 传送源自定义 JSON。你需要定义其输入、成功/失败和过期语义。它们不会创建二维码页面、浏览器回调服务器、麦克风或凭据保险箱。成功账号切换会使旧分页结果失效；自己的游标和缓存也必须按账号隔离。

## 评论、识别与分享导入

`comments.list` 返回有界评论页，保留评论 ID、正文、用户、时间、点赞及可选回复。服务时间单位在映射处统一；回复 JSON 的存在不等于所有客户端都会绘制完整回复树。

`recognition.identify({payload})` 的音频格式、采样率、声道、时长、字节表示及结果置信度由源定义。调用能力不会自动采音，也不能把合成候选当作识别实现。只声明你实际接通并验证的源服务。

`links.resolve({url})` 负责分享地址到实体/集合引用的解析，随后让 `collections.members` 有界枚举成员。必须保留访问该分享所需的授权上下文、原始 ID 和顺序；不在导入中偷偷改成另一套命令 ID。`links.share({entity})` 返回服务详情页 HTTP(S) URL。

## 从旧插件迁移业务

先按业务路径建立行为清单：搜索类型、详情、集合分页、音质、MV、富歌词、分享导入、评论、每日推荐、账号和特殊回调。保留作者、帮助文案、用户变量、质量及源字段，再用 V2 对象请求和能力分组重写入口。

不要仅把旧函数重命名，也不要把旧执行器、npm shim 或 LX 事件 API 塞进新包。现有客户端的历史 LX 文件导入会转换为 V2 产物，这属于应用兼容导入机制，不是新插件编写方式。

包身份变化影响既有收藏、历史、队列与下载。不要因新插件导入而自动迁移用户数据，或把同一源协议的公共/内部包合并。应用提供明确的用户选择与恢复流程；开发者应保持原包 ID，跨包替换需单独考虑数据迁移。

## 交付检查

核对声明的每一个能力都有真实行为、分页会终止、账号隔离正确、错误可区分。对照自己接入的服务测试源协议，再运行 Node 检查、真实 QuickJS 和客户端验证。最后发布一份无外部运行时依赖的 V2 `.js`，遵循[测试与发布流程](testing-and-release.md)。
