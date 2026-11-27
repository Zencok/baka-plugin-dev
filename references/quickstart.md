# 从零编写第一个 V2 插件

目标：把一个你能访问的 HTTPS 音乐目录，接入搜索和音频解析。先完成这个闭环，再增加歌词、集合和账号。你需要接口文档、脱敏响应样本，以及 Node.js 20 或更新版本。

## 1. 确定插件类型与身份

能搜索和浏览目录的数据源用 `provider`；只为已有 provider 提供媒体地址的独立插件用 `resolver`。第一个插件从 provider 开始。

先固定 `manifest.id`，例如 `org.example.catalog`；换文件名、显示名或下载地址时都保持它不变。`sourceId:'example.v1'` 表示你定义的解析协议，便于今后对接 resolver。`name` 面向用户，`author` 保留原作者与维护者，`version` 为语义化版本。字段规则见[契约](contract.md)。

## 2. 复制模板

把[最小 provider](../assets/authoring/minimal-provider.js)复制为 `my-provider.js`，同时把[types.d.ts](../assets/authoring/types.d.ts)放在旁边供编辑器检查。声明文件不需要交给客户端。

```powershell
Copy-Item assets/authoring/minimal-provider.js ./my-provider.js
Copy-Item assets/authoring/types.d.ts ./types.d.ts
```

文件必须以这一行开始，前面没有空行、空格或 BOM：

```js
// @baka-provider 2
```

底部同步导出 `module.exports = {manifest, handlers}`。不要在顶层请求接口、登录或等待初始化；外部操作放在 handler 中。

## 3. 用实际字段替换目录映射

假设你的服务搜索返回如下 JSON，且所有请求均使用你自己的服务：

```json
{
  "rows": [{"songId": 7, "name": "Example song", "artistName": "Example artist", "durationMs": 180500}],
  "cursor": null,
  "count": 1
}
```

在 `handlers.search` 中转换为 V2 数据。下列代码是替换 handler 的片段，不是第二个完整插件：

```js
async function search(request, sdk) {
  if (request.kind !== 'music') return { items: [], nextCursor: null };
  const query = new URLSearchParams({ q: request.query, limit: String(request.limit) });
  if (request.cursor !== null) query.set('cursor', request.cursor);
  const response = await sdk.http.request({
    url: 'https://api.example.invalid/search?' + query.toString(),
    responseType: 'json', timeoutMs: 10000,
  });
  if (response.status !== 200) throw new Error('搜索服务暂时不可用');
  const body = response.body;
  if (!body || !Array.isArray(body.rows)
      || !(body.cursor === null || typeof body.cursor === 'string')
      || body.rows.length > request.limit) {
    throw new Error('搜索响应格式不正确');
  }
  const items = body.rows.map(row => {
    if (!(typeof row.songId === 'string' && row.songId.length > 0
        || typeof row.songId === 'number' && Number.isSafeInteger(row.songId))
        || typeof row.name !== 'string'
        || !Number.isFinite(row.durationMs) || row.durationMs < 0) {
      throw new Error('歌曲字段不完整');
    }
    return {
      id: row.songId, type: 'music', title: row.name,
      artist: row.artistName, duration: row.durationMs / 1000,
    };
  });
  return { items, nextCursor: body.cursor,
    ...(Number.isSafeInteger(body.count) && body.count >= 0 ? { total: body.count } : {}) };
}
```

保留 `songId` 的原始类型：数值 `7` 和字符串 `"7"` 是两个身份。`duration` 是秒；服务毫秒值只在映射时换算一次。真实响应格式不同就按真实字段映射，不要让服务的异常 JSON 被识别为“没有歌曲”。

这里的服务恰好使用相同游标；如果你的接口用页码或 offset，要在插件内实现可校验的游标，而不是要求客户端提供旧的 `page` 参数。见[分页教程](development-guide.md#分页与集合)。

## 4. 接通媒体解析

在 `handlers.media.resolve` 中读取 `request.entity.id` 和 `request.quality`，返回实际媒体地址与必需请求头：

```js
{
  url: 'https://media.example.invalid/song-7.mp3',
  headers: { 'Referer': 'https://example.invalid/' },
  quality: '320k'
}
```

`quality:null` 表示调用方没有选定音质，由你选真实可用的默认值。URL 需要有效且可播放；`.invalid` 只是文档占位。不要返回歌曲详情页的 HTML 地址，也不要把低音质标成高音质。

暂不接外部 resolver 时，可以删掉模板的 `media.prepare` handler 和相应 capability。需要外部 resolver 时，保留 prepare 并按双方约定提供 JSON 上下文，见[完整教程](development-guide.md#独立解析器)。

## 5. 检查源码和返回值

```powershell
node --check ./my-provider.js
node scripts/check.cjs ./my-provider.js
npm test
```

带路径的检查只验证可信源码的标记、清单与 handler 结构，不调用你的远程服务。为真实响应增加脱敏 fixture，测试首/续/末页、错误状态与媒体映射。仓库内置测试验证模板；它不会自动替你验证新数据源。

进一步使用真实 QuickJS 的 `v2_probe`，确认没有依赖 Node 全局，见[测试和发布](testing-and-release.md)。

## 6. 导入支持 V2 的客户端

只交付最终的 `.js`。在支持此 V2 契约的客户端插件管理中从文件、源码或 HTTPS 地址导入，填写插件需要的配置，搜索一首你有权限访问的歌曲，验证播放、切歌、返回列表和错误提示。涉及配置修改时，确认插件已经使用新的设置快照。

当前依据是 BakaMusicFlutter 的 V2 宿主。Electron 仓库文档迁移不代表其运行时已支持此契约。不要把 V2 文件放进旧格式客户端后修改成旧 API 以迁就它；先核实客户端支持版本。

完成后再阅读[完整开发教程](development-guide.md)、[能力参考](capabilities.md)与[成品源码路线](production-examples.md)。
