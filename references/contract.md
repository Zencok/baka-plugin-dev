# V2 包、身份与分页契约

本文描述已实现的 QuickJS V2 边界。能力请求见 [capabilities.md](./capabilities.md)，原生工具见 [sdk.md](./sdk.md)，完整开发流程见 [development-guide.md](./development-guide.md)。规范与实现的位置见 [source-map.md](./source-map.md)。

## 交付与调用

交付一个 UTF-8 JavaScript 源文件，建议使用 LF、无 BOM。第一行必须精确为：

```js
// @baka-provider 2
```

在模块求值结束前同步完成 CommonJS 导出：

```js
// @baka-provider 2
module.exports = {
  manifest: {
    apiVersion: 2,
    kind: "provider",
    id: "org.example.catalog",
    sourceId: "example.v1",
    name: "示例曲库",
    author: "原作者 / 维护者",
    version: "1.0.0",
    capabilities: ["search"],
    supportedSearchType: ["music"],
  },
  handlers: {
    async search(request, sdk) {
      // 仅演示声明结构；正式开发复制完整模板并接入真实服务。
      throw new Error('Implement real service search before release');
    },
  },
};
```

每次调用只有一个命名请求对象。handler 签名为 `(request, sdk)`，可返回 JSON 兼容结果或其 Promise。`search` 直接放在 `handlers` 中；带点能力名按对象分组：`handlers.media.resolve`。`handlers["media.resolve"]` 不会被当作这个分组 handler。

模块求值阶段只声明元数据、函数和纯计算状态。隔离检查会拒绝初始化 I/O，不能依赖顶层网络、定时器或存储来生成 manifest。HTTP、存储及异步业务从 handler 内开始。

运行环境没有 `require`、运行时 npm 依赖、原生 ESM、Node 文件/进程接口或浏览器 DOM。TypeScript 声明仅供编辑器使用，客户端载入 JavaScript 源码。可在构建时将小型纯函数打包为单文件；发布物仍须符合 [SDK](./sdk.md) 和实际 QuickJS 的限制。不要发布绑定引擎版本的 QuickJS 字节码。

## Manifest 字段

| 字段 | 必需性与规则 |
|---|---|
| `apiVersion` | 必须为数值 `2`，不是字符串。 |
| `kind` | 必须为 `provider` 或 `resolver`。 |
| `id` | 稳定的包身份，最多 128 ASCII 字节；至少两段，每段以小写字母开头，后续仅小写字母、数字或 `-`。例：`org.example.catalog`。 |
| `name` | 非空显示名称，最多 128 个 Unicode 字符；不能全为空白或 BOM。 |
| `author` | 非空作者署名，最多 256 个 Unicode 字符；保留原作者、贡献及适用声明。 |
| `version` | 严格 SemVer，例如 `1.2.3`、`1.2.3-beta.1+build.001`。核心数字和纯数字 prerelease 不允许前导零。 |
| `capabilities` | 非空、去重、大小写精确的能力数组；每一项必须有对应函数，不能声明未知能力。 |
| `sourceId` | provider 必需；最多 64 ASCII 字节，小写字母开头，字母数字段用单个 `.` 或 `-` 分隔，例如 `example.v1`、`a1.b2-3`。 |
| `sources` | resolver 必需；非空、去重的合法 sourceId 数组。 |

provider 不得出现 `sources`；resolver 不得出现 `sourceId`，即使赋值 `null` 也不行。manifest 禁止 `platform`、`providerId`、`legacyPlatforms` 这些旧身份字段。

包 ID 与显示名称、文件名、下载地址、API key 都无派生关系。改名、换 URL、换 key 不改包 ID；不同包即使服务同一网站，也不能自动合并收藏或相互替换。应用检查更新时，返回不同 ID 的候选包不能替换原包。

`sourceId` 是 provider 与 resolver 约定的数据协议，不是客户端硬编码的平台别名，也不等于 `apiVersion`。例如成品包 `cc.baka.qq` 的 `sourceId` 为 `qq.v1`，包接口仍然是 V2。协议字段或语义发生不兼容变化，应约定新的 sourceId。

provider 可以只提供歌词或曲库，不要求一定解析音频。resolver 必须声明 `media.resolve`，可额外声明 `media.video`、`media.license`；不得拥有搜索、收藏、歌词、账户或 `media.prepare`。

## 完整元数据与配置

manifest 保留额外的 JSON 字段，而非仅提取少量字符串。常用字段包括：

| 字段 | 用途与边界 |
|---|---|
| `description`、`homepage`、`license` | 功能说明、主页和适用授权声明；不要推断或补造来源授权。 |
| `hints` | 操作说明，例如按操作名组织的字符串数组；保留完整帮助文本。 |
| `userVariables` | 用户配置项，见下例。 |
| `supportedSearchType` | 声明实际可搜索的 `music/album/artist/sheet/lyric` 类型。只声明可正确返回的类型。 |
| `supportedQualities` | 实际音频质量键；质量不是通用编码/位深保证。 |
| `supportedVideoQualities` | 实际视频质量键，与音频声明分开。 |
| `primaryKey` | 源业务使用的身份补充字段。它不会替代宿主 `{providerId,kind,id}`。 |
| `srcUrl` | 更新来源等安装元数据，不参与包或实体身份计算。 |

宿主保存这些字段不等于为每个扩展字段定义了强类型 schema，也不自动执行任意自定义字段。迁移保留的 `appVersion`、`cacheControl` 不能被解读为新增运行时保证。以当前客户端消费者为准，避免只靠 manifest 属性推断界面或缓存行为。

现有 Flutter 配置界面实际消费以下字段：

```js
userVariables: [
  {
    key: "account_ref",
    name: "账户连接标识",
    hint: "填写你的授权服务提供的连接标识。",
    defaultValue: "",
    type: "password",
  },
]
```

`key` 为字符串；名称取 `name`，缺省时显示 key；`hint` 是帮助文本；`defaultValue` 用于没有已保存值时的输入初值。保存的值是字符串。`type: "password"` 只控制输入遮掩，不保证加密存储。不要杜撰选择框、复选框、数字校验、必填校验或安全凭据保险箱等未实现语义。

handler 从 `sdk.settings.account_ref` 读取配置。`sdk.settings` 是宿主在载入前提供的环境对象快照，其顶层被冻结；不是自动实时刷新的账户状态或通用 `sdk.options` 接口。不要修改嵌套设置或在模块初始化时缓存会变化的凭据。账户会话状态应在调用时从服务或包隔离存储读取，await 写入/移除，并自行定义 schema、版本与账户键。

## 元数据快照

manifest 必须是有限、无循环的 JSON：字符串、布尔、有限数值、null、数组和普通对象。不要放函数、undefined、Symbol、BigInt、NaN、Infinity、Date、稀疏数组或带自定义序列化行为的实例。

原生验证后拥有完整 manifest 快照，后续修改 `module.exports.manifest` 不能修改注册身份。Dart 使用不可变元数据；作者工具中的 `contract.cjs` 的 `validateManifest` 返回冻结副本，但 `check.cjs` 的 `load` 返回原始导出对象，不会把它冻结。不要把开发检查器返回的可变对象当作宿主注册表，也不要通过修改导出对象更新运行时配置。

`sdk.settings`、manifest 快照、provider 业务缓存是不同概念。只冻结对象并不能保证业务缓存与当前账户、查询或更新代次一致；缓存生命周期仍要显式设计。

应用策略和通用协议必须分开：当前普通 LX 绑定只接受精确的 `cc.baka.{qq,wy,kg,kw,mg}` / `{qq,wy,kg,kw,mg}.v1` 对，且要求 `media.prepare`。自定义 sourceId 本身合法，但不能通过只改 sourceId、显示名或复用他人包 ID 获得兼容。独立聚合源的跨平台 ID 设计和完整决策见[交付配方](authoring-playbook.md#sourceid-不是平台开关也不是插件接口版本)。

## 实体身份与载荷

宿主的实体引用只能包含这三个字段：

```js
{ providerId: "org.example.catalog", kind: "music", id: "song-123" }
```

`providerId` 必须是精确包 ID；`kind` 为 `music/album/artist/sheet/lyric/chart`。ID 允许非空字符串，或 `-9007199254740991` 至 `9007199254740991` 的整数。字符串 `"7"` 与数字 `7` 不同；JSON 数值 `7`、`7.0`、`7e0` 归一为同一整数。不要统一转成字符串、截断小数或接受越界整数。

空字符串无效；原始字符串 ID 可以很长，不要无依据地截断、trim 或改写大小写。标题、封面、歌手名、下载 URL 和 resolver ID 都不参与实体身份。

handler 接收和返回的业务实体可保留源扩展字段：

```js
{
  id: "song-123",
  type: "music",
  title: "示例歌曲",
  artist: "歌手 / 合作者",
  album: "示例专辑",
  artwork: "https://cdn.example.invalid/cover.jpg",
  duration: 180.5, // 秒
  albumId: "album-1",
  mv: "video-1",
  qualities: { "320k": { size: 1234567 } },
  providerData: { resourceId: "opaque-resource-id" },
}
```

不要假定这些展示字段都存在。集合可用 `title/artist/artwork/description/worksNum`，歌手可同时提供 `name/title`。`worksNum` 是源报告数量，不能证明已完整抓取。必要的 hash、songmid、copyrightId、cid 等应随实体保留供后续调用，但不要把访问令牌放进会持久化的实体。

应用现有 `Track.platform` 字段存放精确 provider 包 ID。resolver 只解析媒体，不改变这份归属。正式成品如何保留源字段见 [production-examples.md](./production-examples.md)。

## 统一分页

`search`、`collections.members`、全部 `discovery.*` 与 `comments.list` 都用：

```js
// 首次请求
{ cursor: null, limit: 30 }

// 中间页
{ items: [{ id: "song-1" }], nextCursor: "opaque-next-token", total: 2 }

// 最后一页；空集合也必须明确给 null
{ items: [{ id: "song-2" }], nextCursor: null, total: 2 }
```

请求省略 cursor/limit 时宿主分别补 null/30；直接请求 limit 必须为 1–100 的整数。它不是固定 30 首的协议。每次返回量必须不超过本次 limit。

`items` 数组与 `nextCursor` 都必需。nextCursor 只能是 null 或非空不透明字符串，最多 2048 UTF-8 字节。有下一页时 items 必须非空，且不能返回与本次请求相同的 cursor。`total` 可省略，提供时必须为非负整数。集合成员页可附带 `entity` 元数据；额外日推状态和修订字段也可保留。

不使用 `isEnd`、`hasMore`、缺失 cursor 或空字符串表示完成。源站页码可以在 provider 内部使用，但宿主直接往返不透明 cursor，不维护通用页码转换缓存。

cursor 至少绑定当前能力、查询、类型、实体、排序、筛选、账户与源快照；适用时纳入 source/account revision。复用旧查询或账户的 cursor 必须失败并从首屏重新获取。不要将凭据原文写入 cursor。成品的 `bindPageHandlers` 使用请求摘要绑定；具体前缀和编码是该实现的私有格式，不是通用协议。

面对上游一页 100 首、调用方 limit 30 的情况，游标须保留上游页和偏移，返回 30/30/30/10，再进入下一上游页；不能丢掉剩余 70 首。禁止为普通浏览预取完整列表或保留无界页面数组。

普通浏览一次加载一个有界页。显式完整导入由客户端遍历所有页，校验可用的 `total/revision/accountRevision/sourceRevision` 一致性、最终数量及完整性后原子发布。账户变更会使正在进行的旧页结果失效，provider 仍需约束跨调用的 cursor。请求失败、中断、鉴权失败或源返回截断数据都不能伪装成成功空集合。

成品 provider 对特殊分享导入采用有界、会过期的私有快照，以保留授权 URL 和命令码语义；这不是普通分页可随意全量抓取的许可，也不是所有源都有可验证服务器修订号。详见 [成品实例](./production-examples.md)。

## Provider 与 resolver

绑定记录只含精确身份：

```js
{ providerId: "org.example.catalog", resolverId: "org.example.resolver" }
```

每次使用时必须验证两个包均存在、enabled、种类正确，整个注册表无重复 ID，resolver.sources 包含 provider.sourceId，provider 声明并实现 `media.prepare`。provider 不能绑定另一个 provider。显示名称相同不构成匹配条件。

绑定后的媒体流程是：

1. 原 provider 的 `media.prepare({entity,quality},sdk)` 产生 JSON context。
2. 选中 resolver 的对应能力收到 `{providerId,sourceId,entity,quality,context}`。
3. 播放、历史、收藏和歌词仍使用原 provider 的实体。

没有绑定时调用 provider 自身的媒体 handler。已有绑定失败时原样报告失败，不暗中换 provider/resolver，也不根据名字、来源 URL 或源别名猜测后备路由。音频、MV、伴随音频、质量、license 与下载应服从同一选择。

provider 拥有协议转换：例如 source 代码、源媒体 ID、ekey 和歌词包的处理。它们可以作为 JSON context 的私有字段，但客户端不会从 sourceId 推断这些字段。resolver 解析媒体；HTTP、编码、压缩和通用密码原语见 [sdk.md](./sdk.md)。

## 错误

无结果只在能力文档允许处返回 null；合法空页返回显式终结页。网络、账户、权限、签名和源业务失败应 throw Error：

```js
throw Object.assign(new Error("此音质暂不可用"), {
  code: "quality_unavailable",
});
```

QuickJS 只运输以下精确 code：

| code | 语义 |
|---|---|
| `quality_unavailable` | 已确认当前请求音质不可用。 |
| `track_unavailable` | 当前内容不可用。 |
| `authentication_required` | 需要账户认证。 |
| `permission_denied` | 当前授权无权执行。 |
| `rate_limited` | 明确被限流。 |
| `temporary_unavailable` | 临时不可用。 |
| `signature_expired` | 请求签名或源签名已失效。 |

只有明确 `quality_unavailable` 才允许下载协调器尝试质量降级。泛化错误文本、HTTP 失败、鉴权失败、未知 code 都不能触发连续换音质。临时/限流和账户依赖由原生协调器按持久状态处理。没有 `sdk.errors.*` 工厂或任意 `retryAfter` 传输契约。

错误、日志、cursor、实体和示例不能泄露 token、Cookie、key 或签名。无需把账户错误包装为 `{items:[],nextCursor:null}`。测试首次/下一/末页、无结果、坏游标、账户变化、超时、替换失败和存储重置，见 [testing-and-release.md](./testing-and-release.md)。

## 当前实现与提案的边界

当前作者目标只有上述 V2 源码；旧位置参数、旧方法别名、MusicFree/V1 npm 兼容层和 LX 全局事件不是教程 API。客户端可能接收历史文件并转换为 V2，这不使旧运行环境成为新插件契约。

旧 `PROPOSAL.md`、`OPTIONS.md` 是选型历史；下载设计中的计划字段也不能直接当成已暴露的 provider SDK。以实现、共享向量及当前调用方共同确认 API。Node 作者检查、真实 QuickJS 主机测试、源站授权和设备播放分别记录，不把其中一个当作其他层的证明。
