---
name: baka-plugin-dev
description: Develop, migrate, debug and validate Baka V2 music provider or media resolver plugins against the actual QuickJS contract. Use for Baka plugin authoring, capability mapping, SDK usage, cursor pagination, resolver binding and release checks; not Flutter UI or Electron runtime migration.
---

# Baka V2 插件开发

为用户的数据源交付可独立更新的 V2 JavaScript 插件。先阅读已有插件和用户提供的接口资料，复用源协议与元数据；缺少服务细节时明确缺口，不把合成结果当作完成的接入。

## 按任务读取

- 首次开发：[quickstart.md](references/quickstart.md)、[development-guide.md](references/development-guide.md)。
- 包清单、身份、分页、provider/resolver 分工：[contract.md](references/contract.md)。
- 具体功能的请求和返回：[capabilities.md](references/capabilities.md)。
- 网络、编码、压缩、签名、配置和存储：[sdk.md](references/sdk.md)。
- 参考成品：[production-examples.md](references/production-examples.md)；源位置、版本与实现边界：[source-map.md](references/source-map.md)。
- 验证、宿主探针、导入和发布：[testing-and-release.md](references/testing-and-release.md)。

## 实施时必须保持

- 成品是单个 UTF-8、无 BOM 的 `.js`，精确首行 `// @baka-provider 2`；同步导出 `module.exports = {manifest, handlers}`。所有 handler 使用 `(request, sdk)`；分组能力使用嵌套对象。
- SDK 只包含 `http/bytes/text/crypto/storage/settings/log`。没有 `baka.register`、`sdk.errors`、任意 native 调用、npm `require`、Node `Buffer` 或浏览器 DOM。以 [SDK](references/sdk.md) 为准，不靠类似框架推测接口。
- `manifest.id` 是稳定包身份，`sourceId` 是协议命名空间，实体身份是 `{providerId,kind,id}`。保留 ID 的数值/字符串类型，保留原作者和完整配置元数据；更换 resolver 不更换实体归属。
- 只声明真正实现的能力。分页统一 `{items,nextCursor,total?}`，初始 `cursor:null`，每次最多 `limit` 项，终页 `nextCursor:null`。网络和鉴权失败抛错，不伪装为空集合。
- provider 自己实现媒体协议准备、接口签名、源专属加密包和歌词提取。使用通用 SDK 原语；返回歌词后，Rust 负责共享解析、修复、声部和时间线，Flutter 负责展示。
- 配置来自加载时的 `sdk.settings` 快照；变化的账号状态通过存储或服务读取。不要把 token 放入歌曲、游标日志或示例文件。
- 仅在来源明确表示音质不可用时抛出 `Error.code='quality_unavailable'`。它允许下载音质回退；登录失败、网络故障和限流不能冒用这个代码。
- 旧插件可作为业务行为参考，但新产物只输出 V2。保留原能力与作者，不附带旧格式执行器、方法别名或 LX 事件教程。应用必须保留现有原始及混淆 LX 脚本的直接导入与兼容运行；新插件只采用 V2 不授权删除这条兼容路径。LX 事件不构成新插件的开发接口。

## 工具与交付

模板与声明在 [assets/authoring](assets/authoring/types.d.ts)。检查可信源码：

```sh
node <skill-root>/scripts/check.cjs path/to/plugin.js
node --check path/to/plugin.js
```

仓库回归使用 `npm test`；真实宿主使用配置 `BAKA_V2_PROBE` 后的 `npm run test:native`。检查器会执行源文件，只对已审阅的可信代码使用；Node VM 是开发检查环境。

交付插件源码、必要配置、已验证的能力和验证结果。区分结构检查、离线行为、真实 QuickJS、客户端交互、远程服务与设备播放；不因 handler 存在而宣称登录、识别、Apple HLS 或下载体验已经验证。按用户授权范围操作，不自动安装到用户客户端、发布仓库或调用真实账号服务。
