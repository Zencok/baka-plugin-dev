# 当前 V2 体系的开发交付配方

第一次开发或让编码代理生成插件时，先按本页选模板和协议，再查具体能力。目标是交付当前宿主确实能导入、能按约定调用的单文件，而不是只生成一个带 V2 标记的对象。

真实平台适配直接参考 [Zencok/baka-plugins](https://github.com/Zencok/baka-plugins) 的 [plugins/v2](https://github.com/Zencok/baka-plugins/tree/main/plugins/v2)。在线读取或已有本地 checkout 均可；按[成品阅读路线](production-examples.md)选择平台，一起看 handler、协议、分发器注入和测试，记录实际参考提交。不要只阅读仓库根目录的旧版 `plugins/*.js`，也不要把需要分发注入的模板当作完整分发文件。

## 先选能完成任务的模板

| 需要 | 复制文件 | 开箱能力与限制 |
|---|---|---|
| 先验证导入、配置、搜索、取流闭环 | [direct-url-provider.js](../assets/authoring/direct-url-provider.js) | 可直接导入；在插件设置填写有权使用的 HTTP(S) 音频直链和标题后搜索。没有附带音源、账号或可播放的假地址。 |
| 对接自己的真实 HTTP 音乐服务 | [minimal-provider.js](../assets/authoring/minimal-provider.js) | 接入骨架；必须替换端点和响应映射，`.invalid` 不是真实服务。 |
| 为已约定协议的 provider 实现解析器 | [minimal-resolver.js](../assets/authoring/minimal-resolver.js) | 通用宿主协议示范；不自动获得当前应用的绑定入口。 |
| 查阅全部能力形状并做离线测试 | [full-provider.js](../assets/authoring/full-provider.js) | 合成 fixture；假登录、假识别、假 license 和 `.invalid` 媒体绝不可作为真实能力交付。 |

直链模板只支持原始音频 URL，不包含自定义请求头、来源加密、账号或 Apple HLS。签名 URL 留在配置/取流结果中，不进入歌曲身份。切换成另一首歌时设置新的 `trackId`；同一首歌续签 URL 保持 ID。模板验证了配置、搜索和取流链路，具体媒体能否播放仍受授权、链接有效期、编码和目标设备约束。

交付自己的新插件时，先替换模板包 ID、协议、名称、作者和配置描述，保留原作者署名；不要误把示例包身份发布成自己的产品。读取真实接口文档和脱敏响应；缺少接口、授权或解密协议时明确缺口，不编造成功结果。

## handler 必须嵌套，能力名称才使用点号

manifest 的字符串使用点号，运行时对象逐层寻址：

```js
// 清单：capabilities: ['search', 'entities.get', 'media.resolve']
// 结构片段，业务实现请复制完整模板。
handlers: {
  async search(request, sdk) { /* 实际搜索 */ },
  entities: {
    async get(request, sdk) { /* 精确查找 request.entity */ },
  },
  media: {
    async resolve(request, sdk) { /* 实际音频地址 */ },
  },
}
```

`handlers['media.resolve']`、`handlers['entities.get']` 是错误结构；宿主不会把平铺键转换成嵌套对象。也没有 `getMusicUrl/searchMusic` 别名。每个已声明能力都必须存在；未实现的能力从清单中删除，不通过空函数或永远返回成功的 stub 过检查。源文件首行必须精确为 `// @baka-provider 2`，无 BOM，同步 `module.exports = {manifest, handlers}`。

## sourceId 不是平台开关，也不是插件接口版本

| 字段 | 作用 | 不会自动获得的能力 |
|---|---|---|
| `manifest.id` | 稳定的安装包身份，例如 `org.example.catalog` | 改名称或下载地址不应改包 ID。 |
| `sourceId` | provider 的数据/prepare 上下文协议命名空间 | 填 `qq.v1` 不会把任意数据转换成 QQ 协议。 |
| `{providerId,kind,id}` | 持久化实体身份，区分字符串和数值 ID | 相同 sourceId 不会合并不同包的收藏、历史或歌单。 |

当前公共平台协议为 `qq.v1`、`wy.v1`、`kg.v1`、`kw.v1`、`mg.v1` 等，字段与含义必须对照相应成品源码；不是只复用一个字符串。它们的 `v1` 是来源业务协议版本，和插件 `apiVersion:2` 不矛盾。新来源或独立聚合服务可以自定合法协议，例如 `cit.v1`；只要由自己的 provider 实现取流，不要求冒充 `qq.v1`，也不强制增加 `media.prepare`。

如果目标是兼容已有 provider/resolver，先核对**原始 ID 类型、必要业务字段、prepare context、音质与取流协议**。不兼容就使用新协议；不能为了通过选择器而只改 sourceId，更不能冒用其他插件的包 ID。

当前应用的普通 LX 解析器绑定还要求精确公共包/协议对：`cc.baka.{qq,wy,kg,kw,mg}` 对应 `{qq,wy,kg,kw,mg}.v1`，且 provider 声明/实现 `media.prepare`。自定义包即使写 `qq.v1` 也不会自动进入该绑定入口。通用 resolver 模板证明宿主协议，不代表应用对任意包开放绑定 UI。实现依据为 Flutter `plugin_binding_policy.dart` 和原生 registry，见[源码地图](source-map.md)。

## 多平台不要混淆歌曲身份

默认优先按平台交付独立 provider，并用订阅分发；这样更容易保留各平台协议。确需一个聚合 provider 时，必须先设计并说明其独立协议：不同平台的相同原始 ID 在同一包内不能撞号。只在实体附加 `source:'qq'` 不够，因为规范身份不包含这个扩展字段。

在**全新独立聚合协议**中，可以定义可逆的业务 ID，例如 `JSON.stringify([platform, rawId])`，并在 `providerData` 保存原始平台、原始 ID；JSON 会区分数值 `7` 与字符串 `"7"`。后续详情/取流必须按同一规则还原。此做法不是迁移现有 `qq.v1` 等协议 ID 的许可，也不能用于悄悄改写用户已有实体。

普通平台适配保留 `row.id` 原始类型；不要 `String(row.id)`，不要 `row.id || ''`（会丢掉合法数值 0）。补全接口找不到精确 ID 时返回 null 或明确失败，不能返回搜索第一项顶替另一首歌。平台信息丢失应报错，不能默认当作酷狗或其他平台。

## 逐能力完成真实闭环

- `search`：只声明实际 `supportedSearchType`；按 `request.kind` 返回对应结果。没有歌词搜索就不声明 `lyric`，有 `lyrics.get` 不等于实现歌词搜索。
- `collections.get/members`：根据实际集合类型选择接口；成员 `kind:'album'` 不能仍返回歌曲。详情不是整表导入，展开浏览只请求一页。
- discovery：确认 API 必填的平台、tag、页码等；聚合服务不接受空平台时，不能统一传空字符串。不能因为 handler 名称存在就声明榜单、歌单、热搜全可用。
- `media.resolve`：传真实平台/ID/音质，返回实际媒体 URL、必要 headers 和实际音质；HTTP 200 的业务错误必须识别。未知音质不能静默标为已支持。
- Apple：当前原生链路使用 `type:'apple-hls'`、合法 `appleMusic` 描述和 `media.license` 回调。自造 `decrypt:{scheme:...}` 不会启动客户端解密；完整 fixture 中的假 license 也不能复用。先核对[Apple 边界](source-map.md#apple-回调的集成核对点)，没有真实回调验证就不宣称可播放。

## 音质必须进入当前播放器的选择路径

导入与 `media.resolve` 直接调用通过，不等于普通播放会选中该音质。当前 Flutter/Rust 默认从 `master` 向下尝试：`master, atmos_pro, atmos_plus, atmos, dolby, dts, vinyl, hires, flac24bit, flac, 320k, 192k, 128k, 96k`，再按曲目/manifest 的可用音质键筛选。`supportedQualities:['original']` 等自定义键本身可被加载，但默认路径不会尝试它；不能据此称为可正常播放。

多档服务应在 `supportedQualities` / 曲目 `qualities` 中声明实际支持的标准档位，把请求映射到上游档位，并在结果 `quality` 中报告实际音质。来源只返回较低档时报告较低档，不能把原始文件改标签为 `master` 或 `320k`。只有明确档位不存在才用 `quality_unavailable`。

直链模板是特殊的单原始文件来源：不声明可选 `supportedQualities`，也不在歌曲添加虚假的音质表；接受当前标准音质偏好，但始终如实返回 `quality:'original'`，没有转码或多档切换。已用默认 `master` 的 `resolvePlayback` 和默认 `128k` 的 `getMediaSource` 验证此路径。接入真实多档服务时不要沿用这个单文件策略。实现依据为 `rust/crates/baka-ffi/src/{playback,quality_request}.rs` 和 `lib/rust/bridge.dart`，见[源码地图](source-map.md)。

## 分页与失败不能用假成功绕过

所有分页返回 `{items,nextCursor,total?}`；首游标 null，每页最多 `limit`，终页显式 null。游标必须确实改变上游请求或指向已保留且有界的快照；不能仅让游标从 1 变 2，却重复抓取第一页。不要丢掉超出 limit 的上游数据后跳到下一整页，造成漏歌。固定数组示例的切片分页不等于远程分页实现。

错误的写法包括 `catch(() => [])` 把鉴权/网络错误当空目录，或 `catch { return null; }` 把取流故障当作没有媒体。并发多平台时，至少所有平台失败必须抛错，并明确部分失败策略。401/403/429、超时、业务错误和真正空结果分别测试。仅有明确上游“该音质不存在”的证据才使用 `quality_unavailable`，不能把授权失败触发成降级。

## 订阅只是分发清单

应用识别对象中的 `plugins` 数组，每项可为 URL 字符串或含 `url`/`srcUrl` 的对象。远程订阅支持相对地址，例如：

```json
{"plugins":[{"url":"./provider.js"}]}
```

这个相对地址样例只适用于**经 HTTP(S) 获取的订阅**；本地选择/粘贴 JSON 必须使用绝对 HTTP(S) 子地址。订阅可以扩展 name/version 等元数据，但不能替代子脚本的真实 manifest 校验。文件扩展名和 MIME 不决定格式；保留 URL 原始查询参数，不截断密钥、不因 `.json` 字样改写 URL。每一个子脚本都必须单独通过 V2 检查。不要把私钥/账号作为订阅示例提交。

## 交付前按证据分级

```powershell
node --check ./my-provider.js
node scripts/check.cjs ./my-provider.js
# 必须指向当前应用构建的实际探针；未配置就是未验证。
$env:BAKA_V2_PROBE = '<actual-v2_probe-path>'
node scripts/check.cjs --native ./my-provider.js
```

1. **结构**：精确标记、清单和嵌套 handler 通过；这一步没有调用业务接口。
2. **行为**：为新源自己的真实字段增加脱敏离线 fixture，验证 ID 0/7/"7"、首/续/末页、重复/丢失、不同 kind、鉴权/限流和实际错误映射。仓库模板测试不会自动测试你的新源。
3. **原生**：使用真实探针对新源逐能力调用，Node VM 不是生产沙箱；不能偷偷把失败源码改写后再称原件通过。
4. **导入集成**：模板可用 `npm run test:import` 走隔离的 Flutter 原生导入、配置和取流链路；任意新源需要自己的导入 fixture。不是往用户正在使用的客户端安装。
5. **服务与设备**：获得用户授权后再验证真实服务、配置、播放、切歌、歌词及目标设备。未执行的项目写明未验证；输出源码、所需配置、通过/失败结果与范围，不能承诺所有平台都能用。

仓库维护者运行 `npm test`、`npm run test:native`；模板发生导入/配置变化时再运行 `npm run test:import`。详细环境与能力调用方式见[测试与发布](testing-and-release.md)。
