# 规范来源与支持边界

核对日期：2026-11-28。本仓库面向开发者的教程重新编写；应用内部设计、源服务实现及共享回归分别保留原职责。

## 当前来源

默认本地 checkout：

| 仓库 | 路径 | 核对时的 HEAD |
|---|---|---|
| Flutter/Rust 应用 | `D:/Github/Music/BakaMusicFlutter` | `4d06895fc5c480c06af3702478abac04619cf1d2` |
| 成品公共插件 | `D:/Github/Music/baka-plugins` | `97847de` |
| Electron 应用 | `D:/Github/Music/BakaMusic` | `f87cf00d70c98bec24dfab30dc1627edcf0edc37` |

本地设计文档可能被忽略或存在未提交更新，因此上述 HEAD 仅标识 checkout，不意味着每份已读工作区文件都已包含在提交中。复用的工具与向量文件另按实际字节记录 SHA-256，见 [UPSTREAM.json](../UPSTREAM.json)。

## 按问题定位权威实现

下表路径以对应仓库根目录为基准；它是源码定位表，不要求安装 skill 时携带整个应用。

| 要核对的问题 | 仓库与路径 |
|---|---|
| 当前 V2 协议和公开能力 | Flutter `docs/design/plugin-v2/SPEC.md` |
| 包身份、provider/resolver、实体和绑定 | Flutter `docs/design/plugin-v2/CANONICAL_CONTRACT.md`、`rust/crates/baka-core/src/plugin_contract.rs` |
| 实际加载规则和宿主隔离 | Flutter `rust/crates/baka-plugin-host/src/host.rs` |
| SDK 对象和能力 dispatch | Flutter `rust/crates/baka-plugin-host/src/v2.js`、`v2.rs`、`v2_bridge.js` |
| HTTP、编码、压缩、加密和存储 | Flutter `rust/crates/baka-plugin-host/src/shim/{http.rs,v2_native.rs,storage.rs}` |
| 真实 QuickJS 的正反用例 | Flutter `rust/crates/baka-plugin-host/tests/{v2_contract.rs,v2_pilot_sdk.rs}` |
| 可执行探针 | Flutter `rust/crates/baka-plugin-host/examples/v2_probe.rs` |
| 共享声明、向量和开发检查 | Flutter `docs/design/plugin-v2/authoring/` |
| Flutter 实体和绑定校验 | Flutter `lib/plugins/plugin_contract.dart`、`plugin_binding_policy.dart` |
| 配置输入实际处理 | Flutter `lib/features/plugins/plugins_page.dart` |
| 绑定后的媒体/回调路由 | Flutter `rust/crates/baka-ffi/src/plugin_media.rs` |
| 导入、禁用、替换和恢复语义 | Flutter `docs/design/plugin-v2/UPGRADE_RECOVERY.md`、`MANAGEMENT_UI.md` |
| 下载任务与显式错误码 | Flutter `docs/design/plugin-v2/DOWNLOADS.md`、`DOWNLOAD_IMPLEMENTATION.md` |
| 成品提供方协议与元数据 | 公共插件 `plugins/v2/{wy,qq,kw,kg,mg,bilibili,am}.js` |
| 成品生成与分发关系 | 公共插件 `plugins/v2/build.cjs`、`README.md`、`ATTRIBUTION.md`、`DESIGN.md` |
| 公共插件行为和原生 fixture | 公共插件 `tests/` |
| Electron V2 类型与 RPC | Electron `src/types/plugin.d.ts`、`src/shared/plugin-manager/rpc.ts` |
| Electron 原生 V2 宿主与 LX 兼容 | Electron `plugin-runtime/src/`、`src/shared/plugin-manager/main/`、`scripts/lx-import-native.test.cjs` |

上游新增接口时核对实现、测试、声明和实际消费者，不能只在能力名列表中加一个词。

## 哪些文档不作为当前 API

Flutter 的 `PROPOSAL.md`、`OPTIONS.md` 记录设计选型，后续 `SPEC.md` 及实际实现已经取代其中的多运行时/兼容执行设想。它们不是开发者的配置 API。下载实施文档中的未关闭项也不能写成产品已经完成。

原 authoring 目录是历史开发夹具与共享契约归档，不是成品发行仓库。其 README 对“完整示例”的早期描述与实际覆盖存在差异；本仓库工具在自身测试下维护，不照抄验证计数。

公共包 `cc.baka.*` 与内部包 `lyra.mesh.*` 可以使用相同源协议，却有不同服务算法和身份。不能复制一个家族去覆盖另一个，也不能按相同 `sourceId` 自动迁移收藏。

## V2-only 的准确含义

新插件和当前 Flutter/Rust 执行环境只使用 V2 契约。现有原始及混淆 LX 脚本必须继续直接导入；显式 LX 选择绕过格式识别，原文不改写，兼容包装在该插件独占的 QuickJS 上下文提供 LX 全局对象以支持间接 eval、Function 和构造器查找。普通 V2 包保持精简环境，LX 事件 API 不成为新插件开发接口。

BakaMusic Electron 的早期文档迁移仅将入口指向此仓库；后续 `f87cf00` 已接入原生 V2 宿主、统一 capability/RPC 与显式解析器绑定，并保留原始及混淆 LX 导入兼容。Flutter 的 `4d06895` 同步修复间接全局查找和延迟设置读取。新插件仍须明确支持的客户端版本，不能将旧发行版视为已完成迁移。

## Apple 回调的集成核对点

公开规范、声明和成品 `am.js` 的 `media.license` 接收 `{payload}`。当前 Flutter `rust/crates/baka-proxy/src/apple/prepare.rs` 构造 `{adamId,uri,keyEndpoint}`，`rust/crates/baka-ffi/src/apple_playback.rs` 又将该对象直接转交 `media.license`，两处封装存在不一致，需在专门的回调集成中核对并修复。这里记录源码核对结果，不据此发明第二套插件 API。本仓库的合成 license transport 测试不会覆盖这个播放代理链路，也没有建立 Apple 实际播放证据。

## 验证证据如何表述

- **声明/设计**：有规范或 handler 定义。
- **离线实现**：合成/脱敏 fixture 和契约测试通过。
- **原生宿主**：同一源码在真实 lean QuickJS 执行。
- **客户端集成**：已安装应用完成对应交互路径。
- **实际服务/设备**：记录具体版本、平台、源与执行结果。

这些层次各自记录。本仓库不把旧版本全量测试、其他任务 APK、源码阅读或可调用的 handler 当作本次设备/服务验证。
